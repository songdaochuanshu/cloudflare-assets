# Architecture Overview — cloudflare-assets

> 本文档描述 `cloudflare-assets` 项目的整体架构和技术决策。
> 架构变更请同步更新本文档并创建对应的 ADR 文件。

---

## 1. 技术栈

| 层级 | 技术选型 | 版本 |
|------|---------|------|
| 语言 | TypeScript (ES2022) | 5.x |
| 运行时 | Node.js 20+ | — |
| 构建工具 | tsc | 5.x |
| 代码质量 | ESLint (flat config) + Prettier | ESLint 9.x |
| 测试框架 | Vitest + @vitest/coverage-v8 | 4.x |
| 类型校验 | Zod | 3.x |
| 日志 | pino + pino-pretty | — |
| 安全 | isomorphic-dompurify | — |
| CI/CD | GitHub Actions | — |

---

## 2. 目录结构

```
cloudflare-assets/
├── src/
│   ├── lib/                    # 核心业务库（纯 TS，无副作用）
│   │   ├── config.ts           # Zod 环境变量校验（启动时 fail-fast）
│   │   ├── errors.ts           # AppError 类体系（含 R2Error / ValidationError / ApiError）
│   │   ├── logger.ts           # pino 结构化日志
│   │   ├── r2-client.ts        # Cloudflare R2 AWS Sig v4 客户端（接入 fetchWithRetry）
│   │   ├── cf-api.ts           # Cloudflare API 封装（接入 fetchWithRetry + ApiError）
│   │   ├── retry.ts            # fetchWithRetry（超时 / 退避 / 抖动 / 幂等）
│   │   ├── email-template.ts   # 共享邮件 HTML 模板（send-email / email-notifier 复用）
│   │   ├── sanitize.ts         # HTML 净化（XSS 防护）
│   │   ├── workflow-result.ts  # GitHub Workflow API 响应类型
│   │   ├── types.ts            # 共享类型定义
│   │   └── anti-slop.ts        # 内容质量过滤
│   ├── scripts/                # 可执行脚本
│   │   ├── blog/               # 博客管理（生成/删除/修复文章）
│   │   ├── cdn/                # CDN 域名管理
│   │   ├── homepage-bg/        # 主页背景图管理（爬虫+上传 R2）
│   │   ├── email-notifier.ts   # 邮件通知（统一入口）
│   │   └── send-email.ts       # 旧版发件（已重构为复用 email-template）
│   └── __tests__/              # Vitest 单元测试（67 用例）
│       ├── retry.test.ts
│       ├── r2-client.test.ts
│       ├── r2-client-retry.test.ts
│       ├── cf-api.test.ts
│       ├── errors.test.ts
│       ├── workflow-result.test.ts
│       ├── sanitize.test.ts
│       ├── email-template.test.ts
│       └── anti-slop.test.ts
├── docs/                       # 项目文档
│   ├── adr/                    # 架构决策记录
│   │   ├── ADR-001-toolchain.md
│   │   ├── ADR-002-error-handling.md
│   │   └── ADR-003-testing-strategy.md
│   ├── CODE_QUALITY_UPGRADE_PLAN.md
│   ├── OPERATIONS_UPGRADE_PLAN.md
│   ├── ARCHITECTURE.md         # 本文档
│   └── *.md                    # 其他文档
├── .github/
│   ├── actions/
│   │   └── node-ci/            # 复合 action：setup-node + npm ci + typecheck + build
│   └── workflows/              # GitHub Actions
│       ├── _node-ci-bootstrap.yml   # 可复用 workflow（test / build 共享）
│       ├── build.yml           # PR 构建
│       ├── test.yml            # typecheck + vitest
│       ├── lint.yml            # ESLint + Prettier
│       ├── pr-quality.yml      # PR title 规范检查
│       ├── security-scan.yml   # gitleaks
│       ├── codeql.yml          # CodeQL
│       └── *.yml               # 11 个业务 workflow（已去 Docker 化）
└── package.json
```

---

## 3. 核心模块

### 3.1 R2 Client (`r2-client.ts`)

**职责**：封装 Cloudflare R2 的 S3 兼容 API，提供 `listAllKeys` / `listObjects` / `uploadToR2` / `deleteObject` 等操作。

**认证方式**：AWS Signature V4（S3 兼容协议）。

**关键设计**：
- 签名逻辑私有（`signRequest` → `buildHeaders`）
- 不依赖 `@aws-sdk/client-s3`（手写签名，减少 bundle size）
- 错误统一抛出 `R2Error`，携带 status code 和 key 上下文
- 所有 4 个 API 接入 `fetchWithRetry`（`src/lib/retry.ts`），网络抖动 / 5xx / 429 自动重试

### 3.2 重试与超时 (`retry.ts`)

**职责**：统一的 fetch 包装层，提供超时、指数退避 + 抖动、可配置重试条件。

**关键设计**：
- 基于 `AbortController` 的超时控制
- 默认对 5xx / 429 / 网络错误重试，对 4xx（除 429）直接失败
- 幂等方法判断（GET / HEAD / PUT / DELETE / OPTIONS）才重试写操作
- `r2-client.ts` 4 个 API + `cf-api.ts` `cfFetch` 全量接入

### 3.3 Cloudflare API (`cf-api.ts`)

**职责**：封装 Cloudflare API（自定义域名管理、Zone 列表等），统一走 `fetchWithRetry` + `ApiError`。

**关键设计**：
- 非 2xx 与非 JSON 响应统一抛 `ApiError`（携带 statusCode + method/path）
- `success=false` 响应抛 `ApiError`，errors 数组嵌入 context

### 3.4 配置校验 (`config.ts`)

**职责**：进程启动时校验所有环境变量，不合法立即退出。

**关键设计**：
- Zod Schema 驱动，支持默认值和可选字段
- 单例缓存（`cachedEnv`），避免重复解析
- 区分"必需"和"可选"变量

### 3.5 错误体系 (`errors.ts`)

**职责**：提供统一的错误类型，支持结构化上下文和 JSON 序列化。

**关键设计**：
- `AppError` 基类携带 `code` + `context`
- 子类：`R2Error` / `ValidationError` / `ApiError`（含 `statusCode`）

### 3.6 邮件模板 (`email-template.ts`)

**职责**：抽出可复用的 HTML 邮件模板，供 `email-notifier.ts` / `send-email.ts` 共享。

**关键设计**：
- `buildEmailHTML(summary, status)` / `buildEmailSubject(summary, status)` 均为纯函数
- 支持 success / failure 两种 header 色
- details 数组超过 10 条时折叠为"还有 N 条记录"
- 测试覆盖到 status、details、error 三个维度

### 3.7 HTML 净化 (`sanitize.ts`)

**职责**：对用户输入或爬取内容进行 XSS 防护。

**策略**：
- 白名单标签（博客常用标签）
- 白名单属性（href/src/alt/title 等）
- 强制 `rel="noopener noreferrer"` 到外部链接
- URL 白名单过滤（仅允许 cloudflare / 自定义域名）

---

## 4. 部署模型

```
GitHub Repo (main branch)
    │
    ├─ push / PR ──→ GitHub Actions
    │                   ├─ lint.yml   (ESLint + Prettier)
    │                   ├─ test.yml   (typecheck + vitest)
    │                   ├─ build.yml  (本地构建)
    │                   ├─ pr-quality.yml (PR title)
    │                   ├─ security-scan.yml (gitleaks)
    │                   └─ codeql.yml (CodeQL)
    │
    └─ 业务 workflow（11 个，依赖 secrets / 触网 / 写资源）
       ├─ crawl.yml                → R2 (homepage-bg)
       ├─ update-images-info.yml   → R2 (homepage-bg)
       ├─ crawl-cnblogs.yml        → R2 (songdaochuanshu-static)
       ├─ generate-article.yml     → R2 (songdaochuanshu-static)
       ├─ cleanup-blog.yml         → R2 (songdaochuanshu-static)
       ├─ fix-tags.yml             → R2 (songdaochuanshu-static)
       ├─ delete*.yml (3 个)        → R2 (songdaochuanshu-static)
       ├─ delete.yml               → R2 (homepage-bg)
       └─ cdn-list.yml             → Cloudflare API

模板: actions/checkout@v4 + ./.github/actions/node-ci + node dist/scripts/.../*.js
```

**CI 复用层级**：
- `./.github/actions/node-ci`（composite action）：setup-node@v4 + cache: 'npm' + npm ci + 可选 typecheck + 可选 build
- `./.github/workflows/_node-ci-bootstrap.yml`（reusable workflow）：额外提供 actions/cache 缓存 node_modules + dist/，被 test / build 复用

**R2 Bucket 布局：**
- `homepage-bg/` — 主页背景图
- `songdaochuanshu-blog/` — 博客静态资产
- `songdaochuanshu-static/` — 其他静态资源

---

## 5. 安全模型

| 风险 | 防护措施 |
|------|---------|
| XSS | `sanitize.ts` — DOMPurify 白名单净化 |
| 环境变量泄露 | Zod 校验 + GitHub Secrets |
| 依赖漏洞 | Renovate + npm audit |
| 未授权 R2 操作 | AWS Sig v4 签名，凭证不过磁盘 |
| 内容注入 | `anti-slop.ts` — 过滤低质量/敏感内容 |

---

## 6. 开发工作流

```bash
# 1. 克隆并安装
npm install

# 2. 本地开发
npm run lint      # 检查代码质量
npm run format    # 自动格式化
npm run test      # 运行测试

# 3. 提交（自动触发 Husky hook）
git commit -m "feat: add new feature"

# 4. 推送 → 触发 CI
git push
```
