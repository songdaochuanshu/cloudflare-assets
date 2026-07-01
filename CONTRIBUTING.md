# CONTRIBUTING.md — 开发上下文

## 项目结构

```
cloudflare-assets/
├── .github/
│   ├── actions/
│   │   └── node-ci/                # 复合 action: setup-node + npm ci + typecheck + build
│   └── workflows/
│       ├── _node-ci-bootstrap.yml  # 可复用 workflow (test / build 共享)
│       ├── build.yml               # PR 构建
│       ├── test.yml                # typecheck + vitest
│       ├── lint.yml                # ESLint + Prettier
│       ├── pr-quality.yml          # PR title 规范
│       ├── security-scan.yml       # gitleaks
│       ├── codeql.yml              # CodeQL
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
│       └── cdn-list.yml
├── src/                                # TypeScript 源码
│   ├── lib/                            # 共享库（被 import，不直接运行）
│   │   ├── r2-client.ts                # R2 操作核心 (AWS Signature V4 + fetchWithRetry)
│   │   ├── cf-api.ts                   # Cloudflare API 客户端 (fetchWithRetry + ApiError)
│   │   ├── retry.ts                    # fetchWithRetry (超时 + 退避 + 抖动)
│   │   ├── email-template.ts           # 共享邮件 HTML 模板
│   │   ├── sanitize.ts                 # HTML 净化
│   │   ├── workflow-result.ts          # 工作流结果输出
│   │   ├── errors.ts                   # AppError 体系
│   │   ├── config.ts                   # Zod 环境变量校验
│   │   ├── logger.ts                   # pino 结构化日志
│   │   ├── anti-slop.ts                # 反 AI 废话检测
│   │   └── types.ts                    # 公共类型定义
│   ├── scripts/                        # 入口脚本（独立可执行任务）
│   │   ├── homepage-bg/                # 图片存储桶任务
│   │   ├── blog/                       # 博客任务
│   │   ├── cdn/                        # CDN 域名管理
│   │   ├── email-notifier.ts           # 邮件通知 (统一入口)
│   │   └── send-email.ts               # 旧版发件 (已重构为复用 email-template)
│   └── __tests__/                      # 单元测试 (67 用例)
│       ├── retry.test.ts
│       ├── r2-client.test.ts
│       ├── r2-client-retry.test.ts
│       ├── cf-api.test.ts
│       ├── errors.test.ts
│       ├── workflow-result.test.ts
│       ├── sanitize.test.ts
│       ├── email-template.test.ts
│       └── anti-slop.test.ts
├── dist/                               # TS 编译产物 (git ignore)
├── docs/                               # 项目文档
│   ├── QUICKSTART.md                   # 新会话快速上手
│   ├── CONTEXT.md                      # 项目背景
│   ├── PROGRESS.md                     # 工作进度日志
│   ├── ARCHITECTURE.md                 # 架构总览
│   ├── OPERATIONS_UPGRADE_PLAN.md      # 运维与工程化提升计划
│   ├── CODE_QUALITY_UPGRADE_PLAN.md    # 代码质量提升计划
│   └── adr/                            # 架构决策记录
├── tsconfig.json                       # TS 编译配置
├── tsconfig.build.json                 # TS 编译配置（产物用）
├── package.json                        # 依赖 + npm scripts
├── CONTRIBUTING.md                     # 开发上下文 (本文件)
├── README.md                           # 项目说明
├── CHANGELOG.md                        # 变更日志
└── images-info.json                    # 桶元数据索引（手动维护）
```

> **2026-06-30 起**：项目从纯 .mjs 迁移到 TypeScript。源码在 `src/`，运行时跑 `dist/` 产物（由 `npm run build` 编译）。

## 核心模块

### R2 签名模块 (`src/lib/r2-client.ts`)
- AWS Signature V4 签名
- Content-Type 签名修复
- 环境变量：`CF_ACCOUNT_ID`, `R2_KEY_ID`, `R2_SECRET_KEY`
- 优先用 `@aws-sdk/client-s3`（已在 dependencies），手写 Sig V4 作为兜底
- 4 个 API 全部走 `fetchWithRetry`，网络抖动 / 5xx / 429 自动重试

### 重试与超时 (`src/lib/retry.ts`)
- `fetchWithRetry`：AbortController 超时 + 指数退避 + 抖动
- 默认对 5xx / 429 / 网络错误重试，4xx（除 429）直接失败
- 幂等方法判断（GET / HEAD / PUT / DELETE / OPTIONS）才重试写操作
- `r2-client.ts` + `cf-api.ts` 全量接入

### 邮件模板 (`src/lib/email-template.ts`)
- `buildEmailHTML` / `buildEmailSubject` 纯函数，可单测
- `email-notifier.ts` / `send-email.ts` 共享同一份模板，避免双份实现

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

### 邮件通知 (`src/scripts/email-notifier.ts` / `send-email.ts`)
- Resend API（替代原 QQ 邮箱 SMTP）
- 环境变量：`RESEND_API_KEY`, `NOTIFY_EMAIL`
- `send-email.ts` 已重构为复用 `email-template.ts` 的纯函数

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
   - 新增 fetch 调用统一走 `fetchWithRetry`（不要直接 `fetch()`）
5. **ESLint**：`src/lib/**` 保留 `no-console` 约束；`src/scripts/**` 关闭 `no-console`（按 ESLint flat config 分层降噪）
6. **密钥管理**：环境变量或 GitHub Secrets，不硬编码
7. **工作流**：业务 workflow 统一用 `./.github/actions/node-ci` 复合 action（setup-node@v4 + cache: 'npm' + npm ci + typecheck + build），不再用 `docker run`
8. **提交格式**：语义化提交（`feat:`、`fix:`、`refactor:`、`ci:`、`docs:`、`chore:`、`feat(ts):`）
9. **环境变量**：通过 `.env` 文件或 GitHub Secrets 配置
10. **改代码必更新文档**：`docs/CONTEXT.md` / `docs/PROGRESS.md` 两个文件

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
node dist/scripts/homepage-bg/crawl-lolicon.js

# 5. 跑测试
npm run test       # 67 用例

# 6. 提交 + 推送到 feature 分支
git checkout -b feat/your-feature
git add .
git commit -m "feat(buckets): add XXX"
git push -u origin feat/your-feature

# 7. 在 GitHub 上创建 PR
# 8. 合并后由 CI 自动跑 workflow 验证
```

## 关键限制

- GitHub API rate limit: 5000/hour
- Lolicon API: 3 req/sec
- R2 免费额度: 10GB 存储, 10M 次请求/月
- 免费套餐不能绑定自定义域名（需 Pro Plan）
- 智谱 GLM-4-Flash：免费额度有限，注意速率限制
