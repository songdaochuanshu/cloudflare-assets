# ADR-002: 采用 AppError 类体系统一错误处理

## 状态
**已接受** | 2026-06-30

## 背景
项目脚本在错误处理上存在不一致：部分使用 `throw new Error()`，部分直接 `process.exit(1)`，R2 操作错误缺少结构化上下文，错误信息难以追溯。

## 决策

### 错误类体系

```
AppError (基类)
├── R2Error         — Cloudflare R2 操作失败
├── ValidationError — 环境变量或入参校验失败
└── ApiError        — 外部 API（Resend、Zhipu、CF API）调用失败
```

### 核心设计原则

1. **结构化上下文**：`AppError` 携带 `code` 和 `context` 字段，便于日志聚合和问题定位
2. **启动时校验**：`config.ts` 在进程启动时用 Zod 校验所有环境变量，环境缺失立即报错（fail-fast）
3. **统一 toJSON()**：所有错误可序列化，便于日志和监控
4. **Stack trace 保留**：使用 `Error.captureStackTrace` 保留调用栈

### 校验策略

- **必需变量**：`R2_ACCOUNT_ID`, `R2_KEY_ID`, `R2_SECRET_KEY` — 无默认值，缺失即报错
- **可选变量**：`ZHIPU_API_KEY`, `RESEND_API_KEY` 等 — 有默认值或 `z.string().optional()`
- **email 校验**：`NOTIFY_EMAIL` — 使用 `z.string().email().optional().or(z.string().min(1))` 兼容无值和格式

## 后果

**正面：**
- ✅ 错误类型可区分，CI/CD 可针对不同错误类型做差异化处理
- ✅ 上下文信息（如 R2 bucket 名、HTTP status）嵌入错误对象，便于排查
- ✅ 启动时 fail-fast，避免运行时因环境缺失导致难以追踪的错误

**负面：**
- ⚠️ 需要重构现有脚本中的 `throw new Error()` 调用
- ⚠️ 错误类增加 bundle size（但影响极小）
