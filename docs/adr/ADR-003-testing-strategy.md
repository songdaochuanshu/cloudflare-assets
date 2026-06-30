# ADR-003: 采用 Vitest 作为测试框架

## 状态
**已接受** | 2026-06-30

## 背景
项目在代码质量升级前没有任何自动化测试。手动测试成本高，且在重构 R2 Client 等核心模块时缺乏安全网。

## 决策

### 框架选型

| 候选 | 优点 | 缺点 |
|------|------|------|
| Jest | 生态最大，兼容性好 | 配置复杂，与 ESM + TypeScript 项目摩擦多 |
| **Vitest** | Vite 原生，TypeScript 优先，配置极简，速度快 | 相对较新 |
| Node.js native `node:test` | 无额外依赖 | 功能较基础，mock 能力弱 |

**选定：Vitest**，配合 `@vitest/coverage-v8` 做覆盖率收集。

### 测试分层策略

```
单元测试（29 tests currently）
├── lib/ 模块：pure functions、error classes、Zod schemas
└── Mock R2 API：用 Vitest 的 http 工具拦截 fetch 调用

集成测试（待实现）
└── 需真实 R2 凭证，仅在本地或受控 CI 环境运行
```

### 覆盖率阈值

| 指标 | 阈值 | 当前 |
|------|------|------|
| Statements | ≥ 80% | 76.87% ⚠️ |
| Branches | ≥ 80% | 50.84% ⚠️ |
| Functions | ≥ 80% | 84.61% ✅ |
| Lines | ≥ 80% | 78.29% ⚠️ |

> 注：覆盖率阈值在 `vitest.config.ts` 中声明但未设为 `strict`（避免阻塞 PR）。

### 未覆盖区域说明
- **R2 delete 操作**（r2-client.ts 100-146 行）：需要真实 R2 凭证，当前无法在 Mock 环境下覆盖
- **Scripts 层**：脚本直接操作 R2/外部 API，集成测试覆盖即可

## 后果

**正面：**
- ✅ Vitest 的 Vite 集成使冷启动极快（< 500ms）
- ✅ `vi.mock()` 和 `http.mocked?.push()` API 简洁
- ✅ v8 provider 生成的 LCOV 文件可上传至 Codecov 等服务

**负面：**
- ⚠️ 当前覆盖率未达 80% 阈值，需后续增量提升
- ⚠️ Vitest 默认 `environment: node`，不提供 DOM（博客渲染测试需额外配置）
