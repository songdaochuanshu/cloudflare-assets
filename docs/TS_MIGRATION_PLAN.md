# TypeScript 重构计划

> **目标**：将项目从 `.mjs`（JavaScript ESM）迁移到 `.ts`（TypeScript），保留所有现有功能、CI/CD 流程、零回归。
>
> **预计工作量**：分阶段，每阶段独立可验证，约 **8-12 小时** 全部完成。
>
> **风险等级**：低 — 项目结构清晰（18 个文件 / ~2864 行），无循环依赖，无动态 require，依赖图扁平。

---

## 一、为什么做这件事

### 收益

1. **类型安全** — 编译期捕获：参数类型错误、漏传、拼写错误、undefined 解引用
2. **IDE 体验飞跃** — 重命名重构、跳转定义、智能补全在跨文件调用时不再"瞎跳"
3. **API 边界清晰** — `r2-client.ts`、`anti-slop.ts` 等核心模块对外暴露的是 contract，调用方一目了然
4. **新功能开发效率** — 以后写 `cdn/`、`workers/` 模块（按 PROGRESS 待办）时不会被 JS 弱类型坑

### 现状盘点（写于 2026-06-30）

| 维度 | 现状 |
|---|---|
| 文件数 | 18 个 `.mjs` |
| 总行数 | 2864 行 |
| 现有依赖 | `@aws-sdk/client-s3`（部分文件）— **零依赖原则已经破了**，加 TS 工具链不增加额外负担 |
| 调用关系 | 扁平，最多 1 层间接（`utils/` 被 `buckets/*/...` 引用，`r2/` 被 `buckets/*/...` 引用） |
| JSDoc 覆盖率 | 高（你已有完整注释） — 改 TS 时可作为类型推断起点 |
| GitHub Actions | 12 个 workflow，全部用 `node xxx.mjs` 调用 |

### 不做的理由（回答"为什么不全量切"）

- ❌ 不引入运行时依赖污染（用 `tsx` 仅 dev / CI 用）
- ❌ 不破坏现有 Docker 镜像策略（`node:20-slim` 保持）
- ❌ 不破坏现有 GitHub Actions workflow 命名、触发时间、邮件通知

---

## 二、目标架构

### 文件结构

```
cloudflare-assets/
├── package.json                 # 新建 — 统一依赖入口
├── tsconfig.json                # 新建 — TS 编译配置
├── tsconfig.build.json          # 新建 — 产出 .mjs 用于部署
├── src/                         # 新建 — TS 源码目录（保留旧结构作为过渡）
│   ├── r2/
│   │   └── r2-client.ts
│   ├── utils/
│   │   ├── anti-slop.ts
│   │   ├── email-notifier.ts
│   │   └── send-email.ts
│   ├── buckets/
│   │   ├── homepage-bg/
│   │   │   ├── crawl-lolicon.ts
│   │   │   └── ... (其余)
│   │   └── songdaochuanshu-static/
│   │       └── ...
│   └── scripts/                 # 单文件工具脚本
├── buckets/                     # 保留，作为软链 / 旧 mjs 兜底（迁移期）
├── dist/                        # 编译产物（git ignore）
└── .github/workflows/           # workflow 改路径
```

### 关键技术决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 模块系统 | **ESM**（保留） | 项目已用 `import` / `export`，Node 20 原生支持 |
| TS 配置 | `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler` | 对齐现有 Node 20 能力，避免 polyfill 噪音 |
| 严格度 | `strict: true` 但**关闭** `noImplicitAny`（初期） | 减少第一轮改造摩擦，后续逐步打开 |
| 类型来源 | **手写类型** + 部分 `// @ts-expect-error` 兜底 | 第三方 SDK 类型已有；自写模块类型你自己定义更准 |
| 编译产物 | **`.mjs`**（不是 `.js`） | 1) 兼容 Node 20 严格 ESM 解析 2) 区分源码/产物 3) 兼容现有 Docker 命令 |
| 运行方式 | `node dist/xxx.mjs`（保留 `node` 直接调用） | 不用 tsx / ts-node，零运行时依赖 |
| 测试 | **暂不引入** | 项目无测试是历史选择，重构期不增加复杂度 |

---

## 三、分阶段执行计划

### 阶段 0：基础设施搭建（0.5h）

**目标**：把项目从"无 package.json 的纯脚本集"过渡到有 npm scripts 的标准 Node 项目。

**步骤**：

1. 创建 `package.json`
   ```json
   {
     "name": "cloudflare-assets",
     "version": "1.0.0",
     "type": "module",
     "private": true,
     "scripts": {
       "build": "tsc -p tsconfig.build.json",
       "typecheck": "tsc --noEmit",
       "clean": "rm -rf dist",
       "crawl": "node dist/buckets/homepage-bg/crawl-lolicon.mjs",
       "...": "其他 17 个命令..."
     },
     "devDependencies": {
       "typescript": "^5.6.0",
       "@types/node": "^20.17.0"
     },
     "dependencies": {
       "@aws-sdk/client-s3": "^3.700.0"
     }
   }
   ```

2. 创建 `tsconfig.json`（开发用）
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ESNext",
       "moduleResolution": "Bundler",
       "strict": true,
       "noImplicitAny": false,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "resolveJsonModule": true,
       "isolatedModules": true,
       "allowSyntheticDefaultImports": true,
       "forceConsistentCasingInFileNames": true,
       "outDir": "./dist",
       "rootDir": "./src",
       "declaration": false,
       "sourceMap": true
     },
     "include": ["src/**/*", "buckets/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

3. 创建 `tsconfig.build.json`（产出用）
   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "noEmit": false,
       "declaration": false,
       "sourceMap": false
     }
   }
   ```

4. 创建 `.gitignore` 增量更新
   ```
   node_modules/
   dist/
   *.log
   .DS_Store
   ```

5. 本地验证：
   ```bash
   npm install
   npm run typecheck
   ```
   这步会报一堆错误（因为还没迁移源码），**这是预期的**。

**验收**：
- [ ] `npm install` 成功
- [ ] `tsconfig.json` 文件存在并被 VS Code 识别
- [ ] 现有所有 workflow 仍然跑通（验证未引入破坏性变更）

---

### 阶段 1：基础设施模块迁移（1h）

**目标**：先迁移**最底层的、被引用最多的**模块，作为后续迁移的样板。

**优先级**（按被引用次数排序）：

| 优先级 | 文件 | 行数 | 被引用次数 |
|---|---|---|---|
| 🔴 P0 | `r2/r2-client.mjs` | 150 | 10+ 次（所有 bucket 脚本都用） |
| 🔴 P0 | `utils/anti-slop.mjs` | 300 | 5+ 次（博客模块都用） |
| 🟡 P1 | `utils/email-notifier.mjs` | 259 | 1-2 次 |
| 🟡 P1 | `utils/send-email.mjs` | 172 | 1 次 |

**步骤（以 `r2-client` 为例）**：

1. **复制 → 重命名**
   ```bash
   cp src/r2/r2-client.mjs src/r2/r2-client.ts  # 注意这里先在 src/ 下建立
   # 实际是：先创建 src/r2/，从 buckets/../r2-client.mjs 复制内容到 src/r2/r2-client.ts
   ```

2. **逐函数加类型**（从 JSDoc 推断）
   ```ts
   // 改前
   export function getSignatureKey(key, dateStamp) { ... }

   // 改后
   export function getSignatureKey(key: string, dateStamp: string): Buffer { ... }
   ```

3. **环境变量加类型守卫**
   ```ts
   // 改前
   export const accountId = process.env.CF_ACCOUNT_ID || '';

   // 改后
   function requireEnv(name: string): string {
     const v = process.env[name];
     if (!v) throw new Error(`Missing required env var: ${name}`);
     return v;
   }
   export const accountId = process.env.CF_ACCOUNT_ID ?? '';
   ```

4. **AWS SDK 类型复用**
   - `@aws-sdk/client-s3` 自带 .d.ts，无需手写
   - `S3Client`, `PutObjectCommand` 等直接 `import type`

5. **处理 dynamic require / import**
   - 你的代码里如果有 `import('xxx')` 动态加载，需要保留并加 `import type { TypeName } from 'xxx'`

6. **本地验证**
   ```bash
   npm run typecheck
   npm run build
   node dist/r2/r2-client.mjs  # 应该有 side effect 测试或空运行
   ```

**验收**：
- [ ] `npm run typecheck` 对 4 个基础设施文件**0 错误**
- [ ] `npm run build` 产出 `dist/r2/r2-client.mjs` 等 4 个文件
- [ ] 旧 .mjs 文件**暂时保留**，workflow 暂时不改，先验证产物可独立运行

---

### 阶段 2：核心脚本迁移（3-4h）

**目标**：迁移 buckets/ 下的 14 个业务脚本。这是工作量最大的部分。

**分组**（按功能内聚性）：

#### 2A：homepage-bg 桶（图片）— 7 个文件

| 文件 | 行数 | 主要复杂度 |
|---|---|---|
| `crawl-lolicon.mjs` | 216 | 🟡 中（HTTP 下载 + 批量上传） |
| `update-images-info.mjs` | 89 | 🟢 低（读 metadata 重新生成） |
| `delete-images.mjs` | 28 | 🟢 低 |
| `delete-non-lolicon.mjs` | 64 | 🟢 低 |
| `enrich-metadata.mjs` | 141 | 🟡 中（外部 API 调用） |
| `fix-images-info-structure.mjs` | 66 | 🟢 低（一次性修复工具） |
| `list-prefixes.mjs` | 25 | 🟢 低 |

#### 2B：songdaochuanshu-static 桶（博客）— 7 个文件

| 文件 | 行数 | 主要复杂度 |
|---|---|---|
| `crawl-cnblogs.mjs` | 453 | 🔴 高（RSS 解析 + AI 生成 + 多种模式） |
| `generate-article.mjs` | 449 | 🔴 高（AI Prompt + 多次重试 + 评分） |
| `cleanup-blog.mjs` | 68 | 🟢 低 |
| `fix-manifest-tags.mjs` | 243 | 🟡 中（批量改写 frontmatter） |
| `delete-all-posts.mjs` | 48 | 🟢 低 |
| `delete-first-posts.mjs` | 48 | 🟢 低 |
| `delete-old-posts.mjs` | 45 | 🟢 低 |

**步骤（每个文件的标准化流程）**：

1. **复制源码**：`cp buckets/xxx/yyy.mjs src/buckets/xxx/yyy.ts`
2. **加 import 类型**：把 `import { foo } from '../../r2/r2-client.mjs'` 改成 `import { foo } from '../../r2/r2-client.js'`（注意：TS ESM 模式下要写 `.js` 后缀，**这是个常见坑**，后面陷阱章节有详细解释）
3. **逐函数加类型**：从 JSDoc 推断，无 JSDoc 的用 `unknown` 占位
4. **处理 process.argv**：
   ```ts
   // 改前
   const args = process.argv.slice(2);
   if (args.includes('--fix-manifest')) { ... }

   // 改后
   const args = process.argv.slice(2) as string[];
   function hasFlag(name: string): boolean { return args.includes(name); }
   ```
5. **类型化 fetch / https 响应**（如果有原生 fetch）：
   ```ts
   const res = await fetch(url);
   const data: unknown = await res.json();
   // 解析时用 zod / 手写 validator
   ```
6. **错误处理加类型**：
   ```ts
   try { ... } catch (err) {
     // err 类型是 unknown（Catch unknown）
     if (err instanceof Error) {
       console.error(err.message);
     }
   }
   ```
7. **本地 typecheck + build 验证**

**风险点**：

- ⚠️ `crawl-cnblogs.mjs` 和 `generate-article.mjs` 体积大、模式多，建议**每个文件独立 PR**，方便 review 和回滚
- ⚠️ 这俩文件有 4-5 种不同的运行模式（`--clean-articles` / `--fix-manifest` / 默认），改 TS 时容易破坏边界

**验收**：
- [ ] 14 个文件全部通过 `npm run typecheck`
- [ ] 14 个文件全部通过 `npm run build`
- [ ] 每个文件**在本地 dry-run 至少一次**（设置 dummy env 跑通，验证行为不变）

---

### 阶段 3：GitHub Actions 切换（1h）

**目标**：把 12 个 workflow 从 `node buckets/xxx.mjs` 切到 `node dist/buckets/xxx.mjs`，并加 `npm run build` 前置步骤。

**变更模板**：

```yaml
# 改前
- name: Run script
  run: |
    docker run --rm \
      -e CF_ACCOUNT_ID \
      -v "${{ github.workspace }}:/app" \
      -w /app \
      node:20-slim \
      node buckets/homepage-bg/crawl-lolicon.mjs

# 改后
- name: Install dependencies
  run: |
    docker run --rm \
      -v "${{ github.workspace }}:/app" \
      -w /app \
      node:20-slim \
      npm install --no-audit --no-fund

- name: Build TypeScript
  run: |
    docker run --rm \
      -v "${{ github.workspace }}:/app" \
      -w /app \
      node:20-slim \
      npm run build

- name: Run script
  run: |
    docker run --rm \
      -e CF_ACCOUNT_ID \
      -e R2_KEY_ID \
      -e R2_SECRET_KEY \
      -v "${{ github.workspace }}:/app" \
      -w /app \
      node:20-slim \
      node dist/buckets/homepage-bg/crawl-lolicon.mjs
```

**全 12 个 workflow 文件清单**：

| Workflow | 关键变更 |
|---|---|
| `crawl.yml` | + build 步骤 |
| `update-images-info.yml` | + build 步骤 |
| `cleanup-blog.yml` | + build 步骤 + 改路径 |
| `crawl-cnblogs.yml` | + build 步骤 + 改路径（多模式） |
| `delete.yml` | + build 步骤 |
| `delete-all-posts.yml` | + build 步骤 |
| `delete-first-posts.yml` | + build 步骤 |
| `delete-old-posts.yml` | + build 步骤 |
| `fix-tags.yml` | + build 步骤 |
| `generate-article.yml` | + build 步骤 |
| `security-scan.yml` | 无变更（不动 .mjs） |
| `codeql.yml` | 无变更 |

**风险点**：

- ⚠️ `crawl-cnblogs.yml` 和 `generate-article.yml` 多模式 workflow，路径改了之后要测试**所有模式**
- ⚠️ `npm install` 会引入网络依赖 — 加 `npm ci` 而不是 `npm install` 更稳（基于 package-lock.json），但需要先提交 lock 文件

**验收**：
- [ ] 每个 workflow 文件 `git diff` 都符合模板
- [ ] 至少手动触发 `crawl.yml` 一次，确认完整流程跑通
- [ ] 至少手动触发 `crawl-cnblogs.yml` 一次，确认多种模式切换正常

---

### 阶段 4：清理与文档（1h）

**目标**：删旧文件，更新所有文档，给 PROGRESS.md 加一条记录。

**步骤**：

1. **删除旧 .mjs**（仅在所有 workflow 切换完成后）：
   ```bash
   git rm buckets/homepage-bg/*.mjs
   git rm buckets/songdaochuanshu-static/*.mjs
   git rm r2/*.mjs
   git rm utils/*.mjs
   ```

2. **删除 images-info.json 残留**（按 PROGRESS 待办）
3. **更新 README.md**：
   - 把所有 `.mjs` 引用改成 `.mjs`（产物）路径
   - 添加"开发流程"小节：改 TS 后必须 `npm run build` 才能部署
   - 更新"技术栈"：加 TypeScript
4. **更新 CONTRIBUTING.md**：开发规则补 TS 相关约束
5. **更新 CONTEXT.md**：架构决策补"已迁移到 TypeScript"
6. **PROGRESS.md 加 2026-06-30 条目**：

   ```markdown
   ## 2026-06-30

   ### 完成 — TypeScript 迁移
   - [x] 阶段 0：基础设施（package.json / tsconfig.json）
   - [x] 阶段 1：基础设施模块（r2-client / anti-slop / email-notifier）
   - [x] 阶段 2：核心脚本（14 个 buckets/ 下的 .mjs 全部迁移）
   - [x] 阶段 3：GitHub Actions 切换（12 个 workflow 全部改路径）
   - [x] 阶段 4：清理旧文件 + 更新文档
   - [x] 删除根目录残留 images-info.json
   ```

**验收**：
- [ ] `find . -name "*.mjs" -not -path "./node_modules/*" -not -path "./dist/*"` 只剩 `dist/` 下的产物
- [ ] 所有文档反映新结构
- [ ] PROGRESS.md 时间线完整

---

## 四、迁移陷阱与对策

### 陷阱 1：ESM 导入必须写 `.js` 后缀（不是 `.ts`）

```ts
// ❌ 错
import { foo } from './r2-client';

// ✅ 对
import { foo } from './r2-client.js';
```

**原因**：TS 编译后是 `.js`，Node 严格 ESM 要求文件扩展名。

**对策**：项目级 ESLint 规则 `import/extensions` 强制开启。

### 陷阱 2：`__dirname` 和 `__filename` 在 ESM 下不可用

如果你的 .mjs 里有 `__dirname`，TS 编译后**直接报错**。

```ts
// 改前（CommonJS）
const configPath = path.join(__dirname, 'config.json');

// 改后（ESM）
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'config.json');
```

**对策**：迁移时全局搜索 `__dirname` / `__filename`，逐个替换。

### 陷阱 3：`process.env` 在 TS 下是 `string | undefined`

```ts
// ❌ 编译错：'process.env.X' is possibly 'undefined'
const bucket = process.env.R2_HOMEPAGE_BUCKET.toLowerCase();

// ✅ 对
const bucket = (process.env.R2_HOMEPAGE_BUCKET ?? '').toLowerCase();

// ✅ 或更严谨
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
const bucket = requireEnv('R2_HOMEPAGE_BUCKET').toLowerCase();
```

**对策**：阶段 1 的 `requireEnv` 工具函数可以复用到所有文件。

### 陷阱 4：`JSON.parse` 返回 `any`

```ts
// ❌ 错
const data = JSON.parse(fs.readFileSync('config.json', 'utf8'));
data.foo.bar  // 编译过，但运行时可能炸

// ✅ 对
interface Config { foo: { bar: string } }
const data = JSON.parse(fs.readFileSync('config.json', 'utf8')) as Config;
```

**对策**：所有 JSON 解析点加 `as Type` 断言或写 Zod schema 校验。

### 陷阱 5：`setTimeout` / `setInterval` 在 Node 下类型差异

`Node.js.Timer` 和 `number` 混用，TS 严格模式下会报。

**对策**：统一用 `ReturnType<typeof setTimeout>`。

### 陷阱 6：`require()` 在 ESM 下不可用

你的代码目前是纯 import，没有 require，**应该不会有这个问题**。但确认一下。

---

## 五、回滚预案

如果迁移中途发现严重问题：

| 回滚级别 | 操作 | 影响范围 |
|---|---|---|
| **L1：单个文件回滚** | 把 .ts 改名 .mjs，workflow 改回 .mjs 路径 | 一个文件，回滚 5 分钟 |
| **L2：阶段回滚** | `git revert` 整个阶段的所有 commit | 一个阶段的所有文件，10 分钟 |
| **L3：完全回滚** | `git reset --hard` 到迁移前最后一个 commit | 整个项目，1 分钟 |

**关键纪律**：
- 阶段 0/1/2/3 **每个阶段独立 commit**，不要跨阶段混 commit
- 每个阶段结束后**手动触发 workflow 验证**再进下一阶段
- 阶段 4（清理）是唯一**不可逆**的阶段，单独放在最后

---

## 六、验收标准（迁移完成判定）

整个迁移在以下条件**全部满足**时算完成：

- [ ] `npm run typecheck` 0 错误
- [ ] `npm run build` 成功产出 `dist/`
- [ ] 所有 12 个 GitHub Actions workflow **手动触发一次全部成功**
- [ ] 至少跑一次**完整的 crawl 周期**（crawl.yml → update-images-info.yml）确认产出与迁移前一致
- [ ] 至少跑一次**完整的博客周期**（crawl-cnblogs.yml → generate-article.yml）确认产出与迁移前一致
- [ ] 没有旧的 `.mjs` 残留（除了 `dist/`）
- [ ] README / CONTEXT / CONTRIBUTING / PROGRESS 文档全部反映新结构

---

## 七、未来扩展钩子

迁移完成后，以下事项变得**容易**：

| 以前难 | 现在简单 |
|---|---|
| 加新桶脚本时类型靠运行时 | 编译期保证 |
| Workers 脚本与本地脚本共享类型 | 直接 import `r2-client` |
| 添加 zod 做运行时校验 | TS 类型可与 schema 共享 |
| 单元测试（如果你想加） | ts-jest / vitest 直接跑 |

---

## 八、时间表

| 阶段 | 预计时间 | 关键产出 |
|---|---|---|
| 阶段 0 | 0.5h | package.json / tsconfig.json |
| 阶段 1 | 1h | 4 个基础设施 .ts |
| 阶段 2A | 1.5h | 7 个图片桶 .ts |
| 阶段 2B | 2.5h | 7 个博客桶 .ts（含两个复杂文件） |
| 阶段 3 | 1h | 12 个 workflow 切换 |
| 阶段 4 | 1h | 清理 + 文档 |
| **合计** | **7.5h** | **完整迁移** |

建议**分 3 个会话**完成：
- 会话 1：阶段 0 + 1（基础设施）
- 会话 2：阶段 2A + 2B（核心脚本）
- 会话 3：阶段 3 + 4（CI + 清理）

---

## 九、不做的事（明确划线）

- ❌ 不引入 ORM / 数据库 / 测试框架
- ❌ 不重写 anti-slop 算法
- ❌ 不动 r2-client 的 AWS Sig V4 实现
- ❌ 不动 AI 生成文章的 prompt
- ❌ 不改现有的 5 分钟 cron 周期
- ❌ 不重构现有目录结构（保留 buckets/ 平级，src/ 作为新家）
- ❌ 不在迁移期引入新功能（迁移完再开新 PR）

---

## 十、决策记录

- **2026-06-30**：决定采用 **方案 B**（先编译再跑），不用 tsx/ts-node
- **理由**：保持产物纯净（`.mjs`），不污染运行时依赖，Actions 跑 `node` 不变
- **反对方案**：方案 A（tsx 跑）会引入运行时依赖，方案 C（JSDoc + tsc check）收益不如完整 TS

---

*文件创建于 2026-06-30，写入位置：`docs/TS_MIGRATION_PLAN.md`*
*下一步：等用户确认后开始阶段 0*