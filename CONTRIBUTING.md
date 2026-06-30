# CONTRIBUTING.md — 开发上下文

## 项目结构

```
cloudflare-assets/
├── .github/
│   └── workflows/
│       ├── cleanup-blog.yml
│       ├── crawl-cnblogs.yml
│       ├── crawl.yml
│       ├── delete-all-posts.yml
│       ├── delete-first-posts.yml
│       ├── delete-old-posts.yml
│       ├── delete.yml
│       ├── fix-tags.yml
│       ├── generate-article.yml
│       ├── update-images-info.yml
│       ├── security-scan.yml
│       └── codeql.yml
├── src/                                # TypeScript 源码
│   ├── lib/                            # 共享库（被 import，不直接运行）
│   │   ├── r2-client.ts                # R2 操作核心 (AWS Signature V4)
│   │   ├── anti-slop.ts                # 反 AI 废话检测
│   │   └── types.ts                    # 公共类型定义
│   ├── scripts/                        # 入口脚本（独立可执行任务）
│   │   ├── homepage-bg/                # 图片存储桶任务
│   │   │   ├── crawl-lolicon.ts
│   │   │   ├── delete-images.ts
│   │   │   ├── delete-non-lolicon.ts
│   │   │   ├── enrich-metadata.ts
│   │   │   ├── fix-images-info-structure.ts
│   │   │   ├── list-prefixes.ts
│   │   │   └── update-images-info.ts
│   │   ├── blog/                       # 博客任务
│   │   │   ├── crawl-cnblogs.ts
│   │   │   ├── generate-article.ts
│   │   │   ├── cleanup-blog.ts
│   │   │   ├── fix-manifest-tags.ts
│   │   │   ├── delete-all-posts.ts
│   │   │   ├── delete-first-posts.ts
│   │   │   └── delete-old-posts.ts
│   │   ├── email-notifier.ts           # 邮件通知脚本
│   │   └── send-email.ts               # 邮件发送（旧版）
│   └── __tests__/                      # 单元测试
│       ├── r2-client.test.ts
│       └── anti-slop.test.ts
├── dist/                               # TS 编译产物 (git ignore)
├── tsconfig.json                       # TS 编译配置
├── tsconfig.build.json                 # TS 编译配置（产物用）
├── package.json                        # 依赖 + npm scripts
├── CONTEXT.md                          # 项目背景
├── CONTRIBUTING.md                     # 开发上下文 (本文件)
├── PROGRESS.md                         # 工作进度日志
├── README.md                           # 项目说明
└── images-info.json                    # 桶元数据索引（手动维护）
```

> **2026-06-30 起**：项目从纯 .mjs 迁移到 TypeScript。源码在 `src/`，运行时跑 `dist/` 产物（由 `npm run build` 编译）。

## 核心模块

### R2 签名模块 (`src/lib/r2-client.ts`)
- AWS Signature V4 签名
- Content-Type 签名修复
- 环境变量：`CF_ACCOUNT_ID`, `R2_KEY_ID`, `R2_SECRET_KEY`
- 优先用 `@aws-sdk/client-s3`（已在 dependencies），手写 Sig V4 作为兜底

### 图片管理 (`src/scripts/homepage-bg/`)
- 桶：`homepage-bg`
- 域名：`img-homepage.openserve.cloud`
- 分类：`normal/`（普通）和 `r18/`（成人）
- 来源：Lolicon API (`r18=1`)
- 元数据：`images-info.json`（含 `normal` 和 `r18` 数组）

### 博客系统 (`src/scripts/blog/`)
- 桶：`songdaochuanshu-static`
- 域名：`songdaochuanshu.com`
- 爬虫：博客园文章爬取
- 生成：GLM-4-Flash (智谱AI) 生成新文章
- 检测：反 AI 废话（4 个维度评分）

### 邮件通知 (`src/scripts/`)
- Resend API（替代原 QQ 邮箱 SMTP）
- 环境变量：`RESEND_API_KEY`, `NOTIFY_EMAIL`

## 开发规则

1. **语言**：所有脚本为 TypeScript（`.ts`），编译为 ESM `.js` 到 `dist/`
2. **运行时**：Node.js 20 ESM，使用 `node:` 前缀的内置模块
3. **依赖**：
   - 零运行时依赖是历史原则，部分模块已用 `@aws-sdk/client-s3`（3.700+）
   - devDependencies: `typescript@^5.6`, `@types/node@^20.17`
4. **TypeScript 必做**：
   - ESM 导入必须写 `.js` 后缀（即使源是 .ts）：`import { foo } from './bar.js'`
   - `process.env.X` 必须用 `?? ''` 守卫或 `requireEnv('X')` 工具
   - `JSON.parse` 结果加 `as Type` 断言
   - catch err 是 `unknown`，需 `instanceof Error` 检查
5. **密钥管理**：环境变量或 GitHub Secrets，不硬编码
6. **工作流**：Docker 容器 `node:20-slim` + `npm ci` + `npm run build`，统一权限 `permissions: contents: write`
7. **提交格式**：语义化提交（`feat:`、`fix:`、`refactor:`、`ci:`、`docs:`、`chore:`、`feat(ts):`）
8. **环境变量**：通过 `.env` 文件或 GitHub Secrets 配置
9. **改代码必更新文档**：`CONTEXT.md` / `PROGRESS.md` / `BACKLOG.md` 三个文件

## 开发流程

```bash
# 1. 改 src/ 下的 .ts 文件
vim src/scripts/homepage-bg/crawl-lolicon.ts

# 2. 类型检查
npm run typecheck  # 必须是 0 错误

# 3. 编译
npm run build      # 产出 dist/

# 4. 本地 dry-run
export $(cat .env | xargs)  # 如有 .env
node dist/buckets/homepage-bg/crawl-lolicon.js

# 5. 提交 + 推送到 feature 分支
git checkout -b feat/your-feature
git add .
git commit -m "feat(buckets): add XXX"
git push -u origin feat/your-feature

# 6. 在 GitHub 上创建 PR
# 7. 合并后由 CI 自动跑 workflow 验证
```

## 关键限制

- GitHub API rate limit: 5000/hour
- Lolicon API: 3 req/sec
- R2 免费额度: 10GB 存储, 10M 次请求/月
- 免费套餐不能绑定自定义域名（需 Pro Plan）
- 智谱 GLM-4-Flash：免费额度有限，注意速率限制
