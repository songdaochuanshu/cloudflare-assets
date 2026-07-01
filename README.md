# Cloudflare Assets

![Tests](https://img.shields.io/badge/tests-29%20passed-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-76.9%25-brightgreen)
![ESLint](https://img.shields.io/badge/ESLint-0%20errors-blue)

Cloudflare 资产管理工具集。包含 R2 图片管理和博客文章系统，未来扩展 CDN、Workers 等。

## 项目结构

```
cloudflare-assets/
├── src/                                 # TypeScript 源码
│   ├── lib/                             # 共享库（被 import，不直接运行）
│   │   ├── r2-client.ts                 # R2 客户端（AWS Signature V4）
│   │   ├── anti-slop.ts                 # 反 AI 废话模块
│   │   └── types.ts                     # 公共类型定义
│   ├── scripts/                         # 入口脚本（每个是独立可执行任务）
│   │   ├── homepage-bg/                 # 图片桶任务（Lolicon 插画）
│   │   │   ├── crawl-lolicon.ts
│   │   │   ├── update-images-info.ts
│   │   │   ├── delete-images.ts
│   │   │   ├── delete-non-lolicon.ts
│   │   │   ├── enrich-metadata.ts
│   │   │   ├── fix-images-info-structure.ts
│   │   │   └── list-prefixes.ts
│   │   ├── blog/                        # 博客任务
│   │   │   ├── crawl-cnblogs.ts
│   │   │   ├── generate-article.ts
│   │   │   ├── cleanup-blog.ts
│   │   │   ├── fix-manifest-tags.ts
│   │   │   ├── delete-all-posts.ts
│   │   │   ├── delete-first-posts.ts
│   │   │   └── delete-old-posts.ts
│   │   └── email-notifier.ts            # 邮件通知脚本
│   └── __tests__/                       # 单元测试（9 个文件，67 用例）
├── dist/                                # tsc 编译产物（git ignore）
├── docs/                                # 文档
└── .github/workflows/                   # CI/CD（全部跑 dist/ 产物）
```

> **路径说明**：源码在 `src/scripts/.../*.ts`，运行时跑 `dist/scripts/.../*.js`（由 `npm run build` 编译）。

## R2 桶结构

### homepage-bg（图片）

```
homepage-bg/
├── r18/               # R18 插画（Lolicon API）
├── normal/            # 普通插画
└── images-info.json   # 元数据索引
```

CDN 域名：`img-homepage.openserve.cloud`

### songdaochuanshu-static（博客）

```
songdaochuanshu-static/
├── posts/
│   ├── article-1.md
│   └── article-2.md
└── manifest.json      # 文章列表索引
```

## 技术栈

- **语言**: TypeScript 5.6（源码） + Node.js 20（运行时）
- **构建**: tsc（ESM 编译，输出到 `dist/`）
- **存储**: Cloudflare R2（S3 兼容 API，@aws-sdk/client-s3）
- **签名**: AWS Signature V4（手写实现）
- **CI/CD**: GitHub Actions（Docker `node:20-slim` + `npm ci` + `npm run build`）
- **图片来源**: [Lolicon API](https://api.lolicon.app/)
- **AI 模型**: 智谱 GLM-4-Flash（文章生成 + 标签分类）

## 环境变量

| 变量名 | 说明 |
|---|---|
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID（32位十六进制） |
| `R2_KEY_ID` | R2 API Token 的 Access Key ID |
| `R2_SECRET_KEY` | R2 API Token 的 Secret Key |
| `R2_HOMEPAGE_BUCKET` | 桶名（默认 `homepage-bg`） |
| `R2_STATIC_BUCKET` | 博客桶名（默认 `songdaochuanshu-static`） |
| `ZHIPU_API_KEY` | 智谱 AI API Key（文章生成） |
| `RESEND_API_KEY` | Resend 邮件服务 Key（通知） |
| `CF_API_TOKEN` | Cloudflare API Token（域名管理） |

### 命名规范

桶变量统一 `R2_<用途>_BUCKET` 格式：

| 变量名 | 用途 |
|---|---|
| `R2_HOMEPAGE_BUCKET` | 首页背景图桶 |
| `R2_XXX_BUCKET` | 未来新增桶 |

## R2 脚本

> **路径说明**：源码在 `src/scripts/.../*.ts`，运行时跑 `dist/scripts/.../*.js`（由 `npm run build` 编译）。

| 脚本 | 功能 | 触发方式 |
|---|---|---|
| `crawl-lolicon` | 爬取 Lolicon R18 图片到 `r18/` | 每天5次定时 + 手动 |
| `enrich-metadata` | 补全图片元数据 | 手动 |
| `fix-images-info-structure` | 修复 images-info.json 结构 | 手动 |
| `delete-non-lolicon` | 按 PID 列表删除图片 | 手动 |
| `delete-images` | 按文件名列表删除图片 | 手动 |
| `update-images-info` | 重新生成 images-info.json | 每天定时 + 手动 |
| `list-prefixes` | 列出 R2 前缀 | 手动 |

### 博客脚本

| 脚本 | 功能 | 触发方式 |
|---|---|---|
| `crawl-cnblogs` | 从博客园 RSS 抓取标题 | 定时 + 手动 |
| `generate-article` | AI 生成文章并发布到 R2 | 定时 + 手动 |
| `cleanup-blog` | 清空博客所有文章 | 手动 |
| `fix-manifest-tags` | 为历史文章补充分类标签 | 手动 |
| `delete-all-posts` | 删除所有文章 | 手动 |
| `delete-first-posts` | 删除前 N 篇文章 | 手动 |
| `delete-old-posts` | 删除旧文章 | 手动 |

### 爬虫参数

- 每次运行 **5 分钟**
- 下载间隔 **15-20 秒**随机
- 图片以 Pixiv PID 命名（如 `12345678.jpg`）

## GitHub Actions

| Workflow | 触发 | 说明 |
|---|---|---|
| `crawl.yml` | 每天 09/13/17/21/01 时（北京时间） | 爬取新图片 |
| `update-images-info.yml` | push main + 每天 08:00（北京时间） | 更新元数据 |
| `crawl-cnblogs.yml` | 定时 + 手动 | 博客园爬取（多模式） |
| `generate-article.yml` | 定时 + 手动 | AI 文章生成 |
| `cleanup-blog.yml` | 手动 | 清空博客 |
| `fix-tags.yml` | 手动 | 修复历史标签 |
| `delete-all-posts.yml` | 手动 | 删除所有文章 |
| `delete-old-posts.yml` | 手动 | 删除旧文章 |
| `delete.yml` | 手动 | 删除指定图片 |
| `security-scan.yml` | push + PR | gitleaks 密钥扫描 |
| `codeql.yml` | push + PR | GitHub CodeQL 静态分析 |

## 本地开发

### 首次设置

```bash
npm install            # 安装依赖
npm run typecheck      # TS 类型检查（应 0 错误）
npm run build          # 编译到 dist/
```

### 运行脚本

```bash
# 设置环境变量
export CF_ACCOUNT_ID="your-account-id"
export R2_KEY_ID="your-key-id"
export R2_SECRET_KEY="your-secret-key"
export R2_HOMEPAGE_BUCKET="homepage-bg"
export ZHIPU_API_KEY="your-zhipu-key"
export RESEND_API_KEY="your-resend-key"
export NOTIFY_EMAIL="your-email@example.com"

# 方式 1：通过 npm script（推荐，自动找对路径）
npm run crawl
npm run generate-article
npm run crawl-cnblogs

# 方式 2：直接 node（需先 build）
node dist/scripts/homepage-bg/crawl-lolicon.js
node dist/scripts/blog/generate-article.js
```

### 开发流程

1. 改 `src/scripts/.../*.ts` 源码
2. `npm run typecheck`（确保 0 错误）
3. `npm run build`（编译到 `dist/`）
4. 本地 dry-run：`node dist/scripts/.../*.js`
5. 提交并推送，CI 会自动 build + 运行

