# QUICKSTART.md — 新会话快速上手

> 给 AI 或新开发者的一分钟项目概览。详细背景见 [CONTEXT.md](./CONTEXT.md)，完整进度见 [PROGRESS.md](./PROGRESS.md)。

## 一句话

Cloudflare R2 资产管理工具集：**Lolicon 插画爬取** + **博客园文章 AI 生成**，通过 GitHub Actions 定时运行。

## 技术栈

- **语言**: TypeScript 5.6 → tsc 编译 → `dist/` (ESM)
- **运行时**: Node.js 20
- **存储**: Cloudflare R2 (S3 兼容 API，手写 AWS Sig V4，全部走 fetchWithRetry)
- **AI**: 智谱 GLM-4-Flash (文章生成 + 分类标签)
- **CI/CD**: GitHub Actions (`actions/setup-node@v4` + `actions/cache` + 复合 action `./.github/actions/node-ci`)
- **邮件**: Resend API
- **测试**: vitest (67 用例)

## 目录结构

```
src/
├── lib/                        共享库 (被 import)
│   ├── r2-client.ts            R2 签名 + 上传 (走 fetchWithRetry)
│   ├── cf-api.ts               Cloudflare API 封装 (走 fetchWithRetry)
│   ├── retry.ts                fetchWithRetry (超时 + 退避 + 抖动)
│   ├── email-template.ts       共享邮件 HTML 模板
│   ├── sanitize.ts             HTML 净化
│   ├── workflow-result.ts      工作流结果输出
│   ├── errors.ts               AppError 体系
│   ├── config.ts               Zod 环境变量校验
│   ├── logger.ts               pino 结构化日志
│   ├── anti-slop.ts            反 AI 废话 (60+ 规则)
│   └── types.ts                公共类型
├── scripts/                    入口脚本 (独立可执行)
│   ├── cdn/                        CDN 域名管理 (2 个脚本)
│   ├── homepage-bg/            图片任务 (7 个脚本)
│   ├── blog/                   博客任务 (7 个脚本)
│   ├── email-notifier.ts       邮件通知 (统一入口)
│   └── send-email.ts           旧版发件 (已重构为复用 email-template)
└── __tests__/                  单元测试 (67 用例)
    ├── retry.test.ts
    ├── r2-client.test.ts
    ├── r2-client-retry.test.ts
    ├── cf-api.test.ts
    ├── errors.test.ts
    ├── workflow-result.test.ts
    ├── sanitize.test.ts
    ├── email-template.test.ts
    └── anti-slop.test.ts

.github/
├── actions/
│   └── node-ci/                复合 action: setup-node + npm ci + typecheck + build
└── workflows/
    ├── _node-ci-bootstrap.yml  可复用 workflow (test / build 共享)
    ├── build.yml               PR 构建 (paths 触发)
    ├── test.yml                typecheck + vitest
    ├── lint.yml                ESLint + Prettier
    └── *.yml                   11 个业务 workflow (已去 Docker)
```

## R2 桶

| 桶名 | 用途 | CDN |
|---|---|---|
| `homepage-bg` | Lolicon 插画 (r18/ + normal/) | img-homepage.openserve.cloud |
| `songdaochuanshu-static` | 博客文章 (blog/ + manifest.json) | — |

## 快速命令

```bash
npm install               # 装依赖
npm run typecheck          # 类型检查
npm run build              # 编译到 dist/
npm run test               # 跑测试 (vitest)
npm run crawl              # 爬 Lolicon 图片
npm run generate-article   # AI 生成文章
npm run crawl-cnblogs      # 爬博客园标题
npm run cdn-list             # 列出所有 Cloudflare 自定义域名
npm run cdn-sync             # 同步域名配置
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID |
| `R2_KEY_ID` / `R2_SECRET_KEY` | R2 API Token |
| `R2_HOMEPAGE_BUCKET` | 图片桶 (默认 homepage-bg) |
| `R2_BLOG_BUCKET` | 博客桶 (默认 songdaochuanshu-static) |
| `ZHIPU_API_KEY` | 智谱 AI |
| `RESEND_API_KEY` / `NOTIFY_EMAIL` | 邮件通知 |
| `CF_API_TOKEN` | Cloudflare API Token (域名管理) |

## CI Workflows (16 个)

- **PR 触发**（不触网 / 不依赖 secrets）：`lint.yml` / `test.yml` / `build.yml` / `pr-quality.yml` / `security-scan.yml` / `codeql.yml`
- **push main 触发**（安全扫描）：`security-scan.yml` / `codeql.yml`
- **业务 workflow**（10 个，依赖 secrets / 触网 / 写资源）：`crawl.yml` / `update-images-info.yml` / `crawl-cnblogs.yml` / `generate-article.yml` / `cleanup-blog.yml` / `fix-tags.yml` / `delete-all-posts.yml` / `delete-first-posts.yml` / `delete-old-posts.yml` / `delete.yml` / `cdn-list.yml`
- **可复用 workflow**：`_node-ci-bootstrap.yml`（被 `test.yml` / `build.yml` 复用）
- **复合 action**：`./.github/actions/node-ci`（被所有业务 workflow 复用）

业务 workflow 全部去 Docker 化，模板为 `actions/checkout@v4` + `./.github/actions/node-ci` + `node dist/scripts/.../*.js`，执行完自动发 Resend 邮件。

## 当前待办

- [ ] 显式 `actions/cache` 缓存 `node_modules` + `dist/`（Phase 3 跟进）
- [ ] 关键 scripts happy path 测试（`crawl-lolicon` / `send-email` 等）
- [ ] Dependabot / Renovate 配置（二选一）
- [ ] 评估是否拆 monorepo（按触发条件）
- [ ] CDN 配置管理
- [ ] Workers 脚本
- [ ] 清理 `src/scripts/send-email.ts`（低优先级，已不重复但仍存在）

## 开发约定

- 改代码必更新 `docs/CONTEXT.md` / `docs/PROGRESS.md`
- 提交格式: `feat:` / `fix:` / `refactor:` / `ci:` / `docs:` / `chore:`
- ESM 导入必须写 `.js` 后缀 (即使源码是 .ts)
- `process.env.X` 必须用 `?? ''` 守卫或 `requireEnv('X')`
- 脚本结束时写 `workflow-result.json` (供邮件通知读取)
