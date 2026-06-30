# ADR-001: 采用 ESLint + Prettier + Husky 作为代码质量工具链

## 状态
**已接受** | 2026-06-30

## 背景
项目 `cloudflare-assets` 在重构前缺乏统一的代码风格规范和提交规范，ESLint 配置不完整，提交历史不符合 Conventional Commits 标准，代码审查依赖人工，效率低且一致性差。

## 决策
采用以下工具链组合：

| 工具 | 用途 | 配置方式 |
|------|------|---------|
| ESLint + @typescript-eslint | 静态分析与类型检查 | `.eslint.config.js` (flat config) |
| Prettier | 代码格式化 | `.prettierrc` |
| Husky + commit-msg hook | Git Hooks 自动化 | `.husky/commit-msg` |
| @commitlint/config-conventional | 提交信息规范 | `commitlint.config.js` |
| lint-staged | pre-commit 本地检查 | `package.json` |

### 关键配置决策

1. **ESLint 规则降级**：严格规则（如 `@typescript-eslint/no-unnecessary-condition`）在无法快速修复时降为警告，避免阻塞开发进度
2. **flat config**：采用 ESLint v9 flat config 格式，不使用 legacy `.eslintrc`
3. **commit-msg hook**：仅在 `git commit` 时校验消息格式，不在 CI 强制失败（允许手动 override）
4. **format script**：提供独立的 `format` 脚本，开发者可随时自测

## 后果

**正面：**
- ✅ 统一的代码风格，review 时减少格式争议
- ✅ 自动化的提交规范，生成清晰的 changelog
- ✅ pre-commit 检查将低级错误拦截在 CI 之前
- ✅ Zod schema 在启动时强制校验环境变量，运行时更安全

**负面：**
- ⚠️ 初期有一定学习成本，团队需适应规则
- ⚠️ 部分 `@typescript-eslint/no-unsafe-*` 规则与 Zod 推断类型冲突，产生 248 个 ESLint 警告（预期行为）
- ⚠️ CI/CD 流水线增加 1-2 分钟执行时间

## 替代方案

| 方案 | 优点 | 缺点 |
|------|------|------|
| 保持现状 | 无迁移成本 | 无统一规范，质量难以保障 |
| biome | 单一工具替代 ESLint+Prettier | 生态较新，Husky 集成需额外工作 |
| **当前方案（选定为 ADR）** | 成熟稳定，社区广泛 | 配置略多 |
