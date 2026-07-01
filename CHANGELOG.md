# cloudflare-assets

## Unreleased

### 运维与工程化提升（来自 `trae/agent-6YfFX5` 分支合并）

#### CI / 工程化

- 新增复合 action `./.github/actions/node-ci`（`setup-node@v4` + `cache: 'npm'` + `npm ci` + 可选 typecheck + 可选 build）
- 新增可复用 workflow `.github/workflows/_node-ci-bootstrap.yml`（额外提供 `actions/cache` 缓存 `node_modules` / `dist/`）
- 新增 build workflow `.github/workflows/build.yml`（PR + push main，仅本地构建）
- 11 个业务 workflow 全部去 Docker 化（`crawl.yml` / `generate-article.yml` / `update-images-info.yml` / `cdn-list.yml` / `crawl-cnblogs.yml` / `delete.yml` / `delete-first-posts.yml` / `delete-all-posts.yml` / `delete-old-posts.yml` / `cleanup-blog.yml` / `fix-tags.yml`）
- `test.yml`：拆掉重复 lint、保留 typecheck + test、加 paths 触发

#### 核心库

- 新增 `src/lib/retry.ts`（`fetchWithRetry`：AbortController 超时 + 指数退避 + 抖动 + 幂等方法判断 + 5xx/429/网络错误重试）
- `src/lib/r2-client.ts` 4 个 API 全部接入 `fetchWithRetry`（`listAllKeys` / `listObjects` / `uploadToR2` / `deleteObject`）
- `src/lib/cf-api.ts` `cfFetch` 接入 `fetchWithRetry`，非 2xx / 非 JSON / `success=false` 统一抛 `ApiError`
- 新增 `src/lib/email-template.ts`（`buildEmailHTML` / `buildEmailSubject`），`email-notifier.ts` / `send-email.ts` 共享同一份模板
- `src/scripts/send-email.ts` 复用 `email-template.ts`，删除内联 HTML 模板；`result: any` 收敛为 `{ id?: string }`

#### 测试

- 测试用例 29 → **67**（+38）
- 新增 `src/__tests__/retry.test.ts`（5）
- 新增 `src/__tests__/r2-client-retry.test.ts`（6，r2-client × retry 集成）
- 新增 `src/__tests__/cf-api.test.ts`（5）
- 新增 `src/__tests__/errors.test.ts`（10，含 config happy path + 缓存行为）
- 新增 `src/__tests__/workflow-result.test.ts`（3）
- 新增 `src/__tests__/sanitize.test.ts`（9）
- 新增 `src/__tests__/email-template.test.ts`（10）
- `src/__tests__/r2-client.test.ts` HTTP 500 用例改写为验证"重试耗尽后抛 R2Error"

#### 代码质量

- `eslint.config.js` 在 `src/scripts/**` 关闭 `no-console`，`src/lib/**` 保留约束
- 新增 `no-unused-vars` 对 `_` 前缀参数 / 变量 / 捕获异常的忽略规则
- 当前 `npm run lint`：**0 errors / 44 warnings**（剩余 warning 全部来自 scripts 既有 `any` / `catch unknown`）

#### 文档

- `docs/PROGRESS.md`：新增 2026-07-01 条目，记录 Phase 1 / Phase 2 落地状态
- `docs/CONTEXT.md`：新增「去 Docker 化 CI」「fetchWithRetry 工具」「共享邮件模板」三条架构决策
- `docs/ARCHITECTURE.md`：补充 retry / cf-api / email-template 模块说明，CI 模板与复用层级
- `docs/QUICKSTART.md` / `README.md` / `CONTRIBUTING.md`：测试数、目录结构、CI workflow 列表同步

---

## 1.1.0

### Minor Changes

- 91e3a65: Add logger, sanitize, ADR docs, renovate and changesets

  - Add structured logging with pino (src/lib/logger.ts)
  - Add HTML sanitization with DOMPurify (src/lib/sanitize.ts)
  - Add ADR documentation (001: toolchain, 002: error handling, 003: testing)
  - Add architecture documentation (docs/ARCHITECTURE.md)
  - Add renovate config for auto dependency updates (.github/renovate.json)
  - Add changesets for changelog management (.changeset/)
  - Replace console.log with logger in src/lib/workflow-result.ts and src/lib/cf-api.ts
