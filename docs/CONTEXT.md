# CONTEXT.md — 项目背景

## 是什么

Cloudflare 资产管理工具集，包含两个核心模块：
1. **R2 图片存储管理**（homepage-bg 桶）— Lolicon 插画爬取与管理
2. **博客文章系统**（songdaochuanshu-static 桶）— 博客园爬取 + AI 生成文章

## 为什么

- 需要自动化从 Lolicon API 爬取 Pixiv 插画并存储到 Cloudflare R2
- 需要区分 R18 和普通插画，分别存放在不同目录
- 需要定期清理非目标来源的图片
- 需要维护图片元数据索引（images-info.json）
- 需要自动化从博客园爬取推荐文章标题，用 AI 生成原创文章并发布到 R2 静态博客
- 需要反 AI 废话检测，确保文章质量

## 架构决策

1. **手写 S3 签名**：不依赖 AWS SDK 或 Cloudflare SDK，减少依赖
2. **共享 R2 客户端**：`src/r2/r2-client.ts` 抽离公共签名+上传逻辑，所有桶共用
3. **GitHub Actions 定时任务**：爬取和元数据更新通过 cron 触发，无需自建服务器
4. **前缀分目录**：R2 桶内用 `r18/`、`normal/` 前缀区分图片类型，非物理目录
5. **双模式爬取**：`r18=1` 放 `r18/`，`r18=0` 放 `normal/`，交替进行
6. **批量上传**：先下载所有图片到内存，下载结束后统一上传，避免上传失败浪费下载时间
7. **分类元数据**：`images-info.json` 按 `{ "r18": [...], "normal": [...] }` 结构组织
8. **AI 文章生成**：智谱 GLM-4-Flash 生成文章，anti-slop 模块评分过滤
9. **按桶分目录**：`buckets/` 下按 R2 桶名组织脚本，共享模块在 `r2/` 和 `utils/`
10. **去 Docker 化 CI**（2026-07-01 完成）：11 个业务 workflow 改用 `actions/setup-node@v4` + `actions/cache` 直接在 runner 跑，弃用 `docker run --rm node:20-slim` 包装；抽复合 action `./.github/actions/node-ci` 供业务 workflow 复用 setup-node + npm ci + typecheck + build，抽 reusable workflow `.github/workflows/_node-ci-bootstrap.yml` 供 test / build 复用
11. **fetchWithRetry 工具**（2026-07-01 完成）：新建 `src/lib/retry.ts`，封装超时（AbortController）、指数退避 + 抖动、幂等方法判断、5xx/429/网络错误重试；`r2-client.ts` 4 个 API + `cf-api.ts` `cfFetch` 全部接入
12. **共享邮件模板**（2026-07-01 完成）：新建 `src/lib/email-template.ts`，把 `send-email.ts` 与 `email-notifier.ts` 重复的 HTML 渲染抽成可测的 `buildEmailHTML` / `buildEmailSubject`
13. **TypeScript 迁移**（2026-06-30 完成）：源码用 `.ts` 写在 `src/`，编译产出 `.js` 到 `dist/`；`buckets/` / `r2/` / `utils/` 三个旧目录的 18 个 `.mjs` 在阶段 4 全部删除（git rm）；选用「先编译再跑」而非 tsx/ts-node，理由：保持产物纯净、不污染运行时依赖、Actions 仍用 `node` 直接调用

## 数据流

### 图片模块（homepage-bg）

```
Lolicon API (r18=1) → 下载 → 暂存内存 → 批量上传到 R2 r18/
Lolicon API (r18=0) → 下载 → 暂存内存 → 批量上传到 R2 normal/
                              ↓
                    生成 images-info.json（根目录，按分类组织）
                              ↓
                    博客前端读取 data.normal 展示
```

### 博客模块（songdaochuanshu-static）

```
博客园 RSS → 抓取推荐标题
                ↓
        智谱 AI 生成文章（GLM-4-Flash）
                ↓
        anti-slop 评分（≥90 分通过）
                ↓
        上传到 R2 + 更新 manifest.json
                ↓
        博客前端读取 manifest.json 展示
```

## CI 流水线（2026-07-01 重构后）

业务 workflow（11 个）按以下模板运行，已去除 Docker 容器包装：

```yaml
- uses: actions/checkout@v4
- uses: ./.github/actions/node-ci
  with:
    run-typecheck: 'true'
    run-build: 'true'
- run: node dist/scripts/.../xxx.js
  env: { ... }
```

- 复合 action `./.github/actions/node-ci`：封装 `setup-node@v4`（`cache: 'npm'`）+ `npm ci` + `npm run typecheck` + `npm run build`
- Reusable workflow `./.github/workflows/_node-ci-bootstrap.yml`：额外提供 `actions/cache` 缓存 `node_modules` / `dist/`，被 `test.yml` / `build.yml` 复用
- 邮件通知 step 仍保留在所有业务 workflow 末尾（Resend API）

## 外部依赖

- **Lolicon API**: `https://api.lolicon.app/setu/v2` — 图片来源
- **Pixiv**: 图片原始 URL（需 Referer 头下载）
- **Cloudflare R2**: 对象存储
- **CDN**: `img-homepage.openserve.cloud` — 图片分发
- **博客园 RSS**: 推荐文章标题来源
- **智谱 AI**: GLM-4-Flash 模型，文章生成
- **Resend**: 邮件通知服务

## 安全注意

- R2 API Token 需要 **Object Read & Write** 权限
- 环境变量通过 GitHub Secrets 管理，不入代码库
- Pixiv 下载需携带 Referer 头，否则 403
- 智谱 API Key 通过环境变量 `ZHIPU_API_KEY` 管理

## R2 桶结构

### homepage-bg（图片）

```
homepage-bg/
├── r18/              # R18 插画
├── normal/           # 普通插画
└── images-info.json  # 元数据（{ r18: [], normal: [] }）
```

### songdaochuanshu-static（博客）

```
songdaochuanshu-static/
├── posts/
│   ├── article-1.md
│   └── article-2.md
└── manifest.json     # 文章列表索引
```
