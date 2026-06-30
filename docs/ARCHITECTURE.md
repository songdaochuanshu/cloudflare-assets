# Architecture Overview — cloudflare-assets

> 本文档描述 `cloudflare-assets` 项目的整体架构和技术决策。
> 架构变更请同步更新本文档并创建对应的 ADR 文件。

---

## 1. 技术栈

| 层级 | 技术选型 | 版本 |
|------|---------|------|
| 语言 | TypeScript (ES2022) | 5.x |
| 运行时 | Node.js 20+ | — |
| 构建工具 | Vite (via Vitest) + tsc | — |
| 代码质量 | ESLint (flat config) + Prettier | ESLint 9.x |
| 测试框架 | Vitest + @vitest/coverage-v8 | 3.x |
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
│   │   ├── errors.ts           # AppError 类体系
│   │   ├── logger.ts           # pino 结构化日志
│   │   ├── r2-client.ts        # Cloudflare R2 AWS Sig v4 客户端
│   │   ├── types.ts            # 共享类型定义
│   │   ├── workflow-result.ts  # GitHub Workflow API 响应类型
│   │   ├── cf-api.ts           # Cloudflare API 封装
│   │   ├── sanitize.ts          # HTML 净化（XSS 防护）
│   │   └── anti-slop.ts        # 内容质量过滤
│   ├── scripts/                # 可执行脚本
│   │   ├── blog/               # 博客管理（生成/删除/修复文章）
│   │   ├── cdn/                # CDN 域名管理
│   │   ├── homepage-bg/        # 主页背景图管理（爬虫+上传 R2）
│   │   └── index.ts            # CLI 入口
│   └── __tests__/              # Vitest 单元测试
├── docs/                       # 项目文档
│   ├── adr/                    # 架构决策记录
│   │   ├── ADR-001-toolchain.md
│   │   ├── ADR-002-error-handling.md
│   │   └── ADR-003-testing-strategy.md
│   ├── CODE_QUALITY_UPGRADE_PLAN.md
│   ├── ARCHITECTURE.md         # 本文档
│   └── *.md                    # 其他文档
├── .github/workflows/          # GitHub Actions
│   ├── lint.yml                # ESLint + Prettier 检查
│   ├── pr-quality.yml          # PR title 规范检查
│   └── test.yml                # 单元测试 + 覆盖率
└── package.json
```

---

## 3. 核心模块

### 3.1 R2 Client (`r2-client.ts`)

**职责**：封装 Cloudflare R2 的 S3 兼容 API，提供 `listAllKeys`、`upload`、`deleteObject` 等操作。

**认证方式**：AWS Signature V4（S3 兼容协议）。

**关键设计**：
- 签名逻辑私有（`signRequest` → `buildHeaders`）
- 不依赖 `@aws-sdk/client-s3`（手写签名，减少 bundle size）
- 错误统一抛出 `R2Error`，携带 status code 和 key 上下文
- `cdnUrl` 属性暴露 CDN 基础 URL

### 3.2 配置校验 (`config.ts`)

**职责**：进程启动时校验所有环境变量，不合法立即退出。

**关键设计**：
- Zod Schema 驱动，支持默认值和可选字段
- 单例缓存（`cachedEnv`），避免重复解析
- 区分"必需"和"可选"变量

### 3.3 错误体系 (`errors.ts`)

**职责**：提供统一的错误类型，支持结构化上下文和 JSON 序列化。

### 3.4 HTML 净化 (`sanitize.ts`)

**职责**：对用户输入或爬取内容进行 XSS 防护。

**策略**：
- 白名单标签（博客常用标签）
- 白名单属性（href/src/alt/title 等）
- 强制 `rel="noopener noreferrer"` 到外部链接

---

## 4. 部署模型

```
GitHub Repo (main branch)
    │
    ├─ push ──→ GitHub Actions
    │              ├─ lint.yml   (ESLint + Prettier)
    │              ├─ pr-quality.yml (PR title)
    │              └─ test.yml   (Vitest + coverage)
    │
    └─ Scripts run locally or via cron:
           ├─ 博客内容生成   → R2 (songdaochuanshu-blog)
           ├─ 主页背景图上传 → R2 (homepage-bg)
           └─ CDN 域名管理   → Cloudflare API
```

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
