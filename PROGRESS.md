# PROGRESS.md — 项目进度

## 2026-06-28

### 完成

- [x] 仓库创建（原名 image-checker → r2-image-manager → cloudflare-assets）
- [x] R2 签名实现（AWS Signature V4，含 Content-Type 签名修复）
- [x] Lolicon 爬虫脚本（crawl-lolicon.mjs）
- [x] 图片来源检查（check-lolicon.mjs）
- [x] 图片删除工具（delete-images.mjs、delete-non-lolicon.mjs）
- [x] 元数据更新（update-images-info.mjs）
- [x] GitHub Actions 定时任务配置
- [x] 修复 R2 PUT 签名问题（Content-Type 未签名导致 SignatureDoesNotMatch）
- [x] 修复 CF_ACCOUNT_ID 误填为 API Token 格式导致 SSL 握手失败
- [x] 重命名环境变量：R2_ACCOUNT_ID → CF_ACCOUNT_ID、R2_ACCESS_KEY_ID → R2_KEY_ID 等
- [x] 桶变量命名规范：R2_<用途>_BUCKET
- [x] 项目目录重组：r2/、cdn/、workers/
- [x] 图片分类：r18/（R18 插画）、normal/（普通插画）
- [x] 数据迁移：根目录图片 → r18/、backgrounds/ → normal/
- [x] 清理根目录旧文件
- [x] 双模式爬取：r18=1 → r18/，r18=0 → normal/，交替进行
- [x] 批量上传：先下载全部图片，再统一上传到 R2
- [x] images-info.json 改为分类结构：{ "r18": [...], "normal": [...] }
- [x] images-info.json 上传到 R2 根目录，收录所有前缀
- [x] README、CONTRIBUTING、CONTEXT、PROGRESS 文档
- [x] 图片元数据补全（title、author、tags、width、height）
- [x] 邮件通知功能（使用 Resend API）
- [x] 抽离通用邮件通知组件（utils/email-notifier.mjs）

### 当前状态

- R2 桶 `homepage-bg`：
  - `r18/` — R18 插画
  - `normal/` — 普通插画
  - `images-info.json` — 根目录，按分类组织
- 爬虫每天运行 5 次（北京时间 09/13/17/21/01 时），每次 5 分钟
- 元数据每天更新一次（北京时间 08:00）
- 博客系统已上线：博客园爬取 → AI 生成 → 自动发布到 R2

### 待办

- [x] 抽取 R2 签名为公共模块 —— 新建 r2/r2-client.mjs，5 个脚本改用 import
  - [x] 通过 GitHub Actions 真实环境验证（Update Images Info #12 ✅）
- [x] songdaochuanshu-static 桶博客系统开发
- [ ] CDN 配置管理（cdn/ 目录）
- [ ] Workers 脚本（workers/ 目录）
- [ ] 为其他工作流添加邮件通知（update-images-info、delete-images 等）
- [ ] 删除 R2 根目录下的旧 images-info.json（如果有残留）

## 2026-06-29

### 完成

**目录重构**
- [x] 按桶重构目录结构：新建 `buckets/` 目录，按 R2 桶名分子目录
  - `buckets/homepage-bg/` — homepage-bg 桶（图片）脚本
  - `buckets/songdaochuanshu-static/` — songdaochuanshu-static 桶（博客文章）
  - `r2/r2-client.mjs` — 共享模块保持不变，脚本改用 `../../r2/r2-client.mjs` 导入
  - 更新 `.github/workflows/crawl.yml`、`update-images-info.yml`、`delete.yml` 中的脚本路径
- [x] 清理 r2/ 目录，迁移剩余脚本到对应桶目录

**博客系统（songdaochuanshu-static 桶）**
- [x] 博客园推荐文章爬虫（`crawl-cnblogs.mjs`）— 从 RSS 抓取标题，AI 生成文章
- [x] AI 文章生成（`generate-article.mjs`）— 智谱 GLM-4-Flash，自动发布到 R2
- [x] 反 AI 废话模块（`utils/anti-slop.mjs`）— 60+ 规则检测，目标评分 90+
- [x] manifest.json 自动维护 — 爬取/生成后自动更新文章列表
- [x] 博客清理工具（`cleanup-blog.mjs`）— 清空文章 + manifest
- [x] 批量删除工具：`delete-all-posts.mjs`、`delete-first-posts.mjs`、`delete-old-posts.mjs`
- [x] 历史文章标签修复（`fix-manifest-tags.mjs`）— 为旧文章补充分类标签
- [x] 工作流支持多模式：crawl / fix_manifest / clean_articles
- [x] 从博客园话题自动提取分类和标签
- [x] 隐藏 AI 生成痕迹，优化 Prompt 减少 AI 味儿
- [x] 智谱 AI 判断标题广告和相似度，替代关键词规则
- [x] 用 AI 生成分类标签替代正则硬切（理解文章内容而非从标题切词）
- [x] crawl-cnblogs 爬取后自动 AI 分类标签写入 frontmatter
- [x] fix-manifest-tags 支持修复 R2 中已有文章的 frontmatter（不仅更新 manifest）

**工作流配置**
- [x] `crawl-cnblogs.yml` — 博客爬取（定时 + 手动，支持模式选择）
- [x] `generate-article.yml` — AI 文章生成（定时 + 手动）
- [x] `cleanup-blog.yml` — 清空博客
- [x] `delete-all-posts.yml` / `delete-first-posts.yml` / `delete-old-posts.yml`
- [x] `fix-manifest-tags.yml` — 标签修复
- [x] 改用 Docker `node:20-slim` 避免 `setup-node@v4` 失败（仅 fix-manifest-tags，后全线修复）
- [x] 所有 9 个工作流统一改用 Docker `node:20-slim`，彻底消除 setup-node 依赖

## 2026-06-30

### 完成

**TypeScript 迁移**
- [x] 阶段 0：基础设施搭建（package.json / tsconfig.json / .gitignore）
- [x] 阶段 1：基础设施模块迁移（r2-client / anti-slop / email-notifier / send-email）
- [x] 阶段 2A：图片桶脚本迁移（homepage-bg 桶 7 个 .mjs → .ts）
  - 迁移清单：list-prefixes / delete-images / delete-non-lolicon / fix-images-info-structure / update-images-info / enrich-metadata / crawl-lolicon
  - `src/types/env.d.ts` 扩展公共类型：LoliconImage / LoliconResponse / ImageEntry / ImagesInfo / PixivOEmbed / WorkflowResult
  - 所有 .ts 文件统一 ESM `.js` 后缀导入、process.env 守卫、async/await 类型化
  - `npm run typecheck` 0 错误，`npm run build` 产出 `dist/buckets/homepage-bg/*.js`
  - 旧 .mjs 文件暂未删除（按约定：阶段 4 才是清理）
- [x] 阶段 2B：博客桶脚本迁移（songdaochuanshu-static 桶 7 个 .mjs → .ts）
  - 迁移清单：cleanup-blog / delete-all-posts / delete-first-posts / delete-old-posts / fix-manifest-tags / crawl-cnblogs / generate-article
  - 所有 .ts 文件均依赖 `@aws-sdk/client-s3`（已在 dependencies 中）
  - 重点类型抽取：ZhipuResponse / CategoryTagsResult / ManifestPost / ArticleData / ChosenResult
  - `callZhipu` 通用函数在 3 个文件（crawl-cnblogs / fix-manifest-tags / generate-article）保留本地副本，**未抽取共享**——遵循原 .mjs 结构，避免跨文件重构
  - `generate-article.ts` 的 `let content` 优化为 `const content`（行为等价、TS 更严格）
  - `npm run typecheck` 0 错误，`npm run build` 产出 `dist/buckets/songdaochuanshu-static/*.js`
  - 旧 .mjs 文件暂未删除（按约定：阶段 4 才是清理）
- [x] 阶段 3：CI 路径切换（11 个 workflow + package.json）
  - 实际有 11 个 workflow（计划写 12 个，但安全扫描/security-scan.yml 和 codeql.yml 不调用项目脚本，无需改）
  - 改动清单：
    - `package.json` scripts：12 个 .mjs → .js
    - `cleanup-blog.yml`：路径切换 + 加 build 步骤
    - `crawl.yml`：路径切换 + 加 build 步骤
    - `crawl-cnblogs.yml`：路径切换 + 加 build 步骤 + 重写 bash 条件（用 case/switch 替换 if/elif/else，便于阅读）
    - `delete.yml`：路径切换 + 加 build 步骤
    - `delete-all-posts.yml`：路径切换 + 加 build 步骤（2 个 step）
    - `delete-first-posts.yml`：路径切换 + 加 build 步骤（3 个 step）
    - `delete-old-posts.yml`：路径切换 + 加 build 步骤（2 个 step）
    - `fix-tags.yml`：路径切换 + 加 build 步骤
    - `generate-article.yml`：路径切换 + 加 build 步骤（4 个 step）
    - `update-images-info.yml`：路径切换 + 加 build 步骤 + paths 触发器改为追踪 `src/.../update-images-info.ts`（不再追 .mjs，因为阶段 4 会删）
  - 每个 workflow 新增的 build 步骤统一为：
    ```bash
    docker run --rm -v "${{ github.workspace }}:/app" -w /app node:20-slim \
      bash -c "npm ci && npm run build"
    ```
  - 业务 step 里原本的 `npm install @aws-sdk/client-s3` 全部移除（`npm ci` 已包含 dependencies）
  - **security-scan.yml / codeql.yml 未改**——它们不调用项目脚本，触发器里的 `**.mjs` 暂保留（阶段 4 删旧文件时再统一处理）

**安全扫描接入**
- [x] 新增 `gitleaks` 密钥扫描 workflow（`.github/workflows/security-scan.yml`）
  - 触发：PR、main push、手动 dispatch
  - 使用官方 `gitleaks/gitleaks-action@v2`
  - 配套 `.github/gitleaks.toml` 定制规则，覆盖 `R2_KEY_ID` / `R2_SECRET_KEY` / `CF_ACCOUNT_ID` / `ZHIPU_API_KEY` / `RESEND_API_KEY` / SMTP 密码
  - allowlist 排除 `images-info.json`（含 Pixiv PID/UID）和 4 个文档文件，避免误报
- [x] 新增 `CodeQL` 静态分析 workflow（`.github/workflows/codeql.yml`）
  - 语言：JavaScript
  - 触发：PR、main push、手动 dispatch、每周一 UTC 02:00（北京时间 10:00）定时
  - 使用官方 `github/codeql-action@v3`
  - 结果上传到 Security tab
- [x] 不使用 Docker 跑安全扫描（gitleaks/CodeQL 官方 action 直接跑 ubuntu-latest 更高效，省时省流量）
- [x] 评估并**不接入** cloudflare/security-audit-skill 到 CI
  - 原因：该 skill 是给 AI 编码 agent 用的代码审计工具，依赖 agent 编排多阶段流水线，不适合 cron 自动触发
  - 建议使用场景：等 `cdn/` 和 `workers/` 模块开发时，人工用 Claude Code 等 agent 在本地审计代码时调用

**仓库安全配置**
- [x] 仓库转为 **public** （私有仓库无 Secret scanning / Push protection 权限）
- [x] 通过 GitHub API 启用 **Secret scanning**（密钥扫描）
- [x] 通过 GitHub API 启用 **Push protection**（推送保护）
  - Settings → Code security and analysis 中显示绿色 ✅ Enabled

**首次 workflow 验证 & 误报修复**
- [x] 手动触发 security-scan 和 codeql workflow
- [x] gitleaks 首次跑报 3 个 false positive（`zhipu-api-key` 规则）
  - 命中文件：`crawl-cnblogs.mjs` L21、`generate-article.mjs` L21、`fix-manifest-tags.mjs` L18
  - 根因：原正则 `["']?` 可选引号，`process.env.ZHIPU_API_KEY` 被当成赋值表达式匹配，整段右侧表达式被当作 secret
  - 修复：5 条自定义规则正则全部收紧为强制要求带引号的字符串字面量 `["']...[''"]`
  - 验证：重跑后 0 误报，gitleaks workflow 绿色 ✅
- [x] CodeQL Analysis 首次跑也绿色 ✅，无安全问题

### 待办

- [ ] GitHub 仓库后台开启 Secret Scanning 推送告警（Settings → Code security and analysis，手动点开）
- [ ] 首次跑 gitleaks 后根据实际误报情况微调 `.github/gitleaks.toml` 的 allowlist

### 项目结构（最新）

```
cloudflare-assets/
├── r2/
│   └── r2-client.mjs                    # 共享 R2 客户端（签名 + 上传，所有桶共用）
├── buckets/
│   ├── homepage-bg/                     # homepage-bg 桶（图片）
│   │   ├── crawl-lolicon.mjs
│   │   ├── update-images-info.mjs
│   │   ├── delete-images.mjs
│   │   ├── delete-non-lolicon.mjs
│   │   └── list-prefixes.mjs
│   └── songdaochuanshu-static/          # songdaochuanshu-static 桶（博客文章）
│       ├── crawl-cnblogs.mjs            # 博客园 RSS 爬虫
│       ├── generate-article.mjs         # AI 文章生成（智谱 GLM-4-Flash）
│       ├── cleanup-blog.mjs             # 清空博客
│       ├── fix-manifest-tags.mjs        # 历史标签修复
│       ├── delete-all-posts.mjs
│       ├── delete-first-posts.mjs
│       ├── delete-old-posts.mjs
│       └── delete-old-posts.yml
├── utils/
│   ├── anti-slop.mjs                    # 反 AI 废话模块（60+ 规则）
│   ├── email-notifier.mjs               # 通用邮件通知（Resend）
│   └── send-email.mjs
├── cdn/                                 # CDN 配置（待开发）
├── workers/                             # Cloudflare Workers（待开发）
├── .github/
│   ├── gitleaks.toml                   # gitleaks 自定义规则
│   └── workflows/                      # GitHub Actions（12 个工作流）
│       ├── security-scan.yml           # 密钥扫描（gitleaks）
│       ├── codeql.yml                  # 静态分析（CodeQL JS）
│       └── ...（原有 10 个工作流）
```

## 2026-06-30

### TypeScript 迁移 — 阶段 4 完成（清理 + 文档）

- [x] 删除 18 个旧 .mjs 文件：
  - buckets/homepage-bg/*.mjs（7 个）
  - buckets/songdaochuanshu-static/*.mjs（7 个）
  - r2/r2-client.mjs（1 个）
  - utils/*.mjs（anti-slop、email-notifier、send-email，3 个）
- [x] tsconfig.json：移除 `buckets/r2/utils` 三个 exclude（旧目录已删）
- [x] security-scan.yml：paths 触发器中 `**.mjs` → `**.ts`
- [x] README.md：重写项目结构（`src/*.ts` + `dist/*.js`）+ 加 TypeScript 技术栈 + 改本地运行示例
- [x] CONTRIBUTING.md：更新项目结构图 + 加 TypeScript 开发规则
- [x] docs/TS_MIGRATION_PLAN.md：标记 4 个阶段全部完成

### 未删除
- 根目录 `images-info.json`（项目维护的桶元数据索引，由 update-images-info 脚本更新，**不是**旧残留）

### 验证
- `npm run typecheck` 0 错误
- `npm run build` 成功（dist/ 18 个 .js 完整）
- 11 个 workflow YAML 语法正确
- tracked `*.mjs` 0 个（仅 `dist/*.js` 产物，git ignore 中）

### TypeScript 迁移全部完成
- 阶段 0：基础设施（package.json / tsconfig）
- 阶段 1：共享模块（r2-client / anti-slop / email-notifier / send-email）
- 阶段 2A：图片桶 7 个 .mjs → .ts
- 阶段 2B：博客桶 7 个 .mjs → .ts
- 阶段 3：11 个 GitHub Actions workflow 切换到 dist/ 路径
- 阶段 4：清理 18 个旧 .mjs + 文档同步


## 2026-06-30

### 项目复盘 — 改进建议清单

完成 TypeScript 迁移后（阶段 0-4 全部完成，crawl workflow 阶段 3+4 后**首次运行验证成功**），系统性复盘项目现状，整理出 10 项改进建议。

#### ✅ 当前强项
- TS 迁移完整（0-4 阶段），`dist/` 产物可用
- 共享模块（r2-client / anti-slop / email-notifier）抽取得当
- 工作流统一 Docker `node:20-slim` + build 步骤
- 安全扫描齐全（gitleaks + CodeQL）
- 文档体系（CONTEXT / PROGRESS / README / CONTRIBUTING）结构清晰

#### 🔴 高优先级（建议 1-2 周内做）

**#1 CI 缺少 typecheck 检查**
- 现状：CI 跑 `npm run build`，但 typecheck 单独跑才能在改 `.ts` 时早发现
- 建议：在所有业务 workflow 加一步 `npm run typecheck`（在 build 前）
- 工作量：15 分钟
- 风险：0

**#2 `tsconfig.build.json` 没显式设 rootDir**
- 现状：`tsc -p tsconfig.build.json` 没设 `rootDir`
- 风险：源码位置变了产物路径会变，触发 12 个 workflow 全失效
- 建议：显式设 `"rootDir": "src"`
- 工作量：2 分钟
- 风险：0

#### 🟡 中优先级（建议本月内做）

**#3 单元测试覆盖率为 0**
- 现状：14 个 .ts 业务脚本，**0 单元测试**
- 风险：重构无保护，新需求上线容易回归
- 建议：
  - 优先测**纯函数**：`utils/anti-slop.ts`、`utils/email-notifier.ts`、`r2/r2-client.ts`（mock 掉 AWS SDK）
  - 用 **vitest**（与 TS 配置最顺）
  - 目标：核心函数 60%+ 覆盖率
- 工作量：3-4h
- 风险：低

**#4 本地开发文档缺失**
- 现状：本地开发者怎么跑脚本不清楚
- 建议：补一个 `docs/LOCAL_DEV.md`，列出 8 个 env var + `npm run <script>`
- 工作量：30 分钟
- 风险：0

**#5 workflow 缺少 dispatch 输入参数化**
- 现状：手动 dispatch 时无法指定 R18 / normal / 数量
- 建议：用 `inputs:` 加 3-4 个字段（`mode` / `count` / `r18`）
- 工作量：30 分钟
- 风险：0

#### 🟢 低优先级（建议下个迭代做）

**#6 CORS / CDN 缓存策略缺失**
- 现状：R2 公开访问，但没看到 `Cache-Control` 头
- 影响：每次都回 R2，CF 边缘缓存没起作用，费用和延迟都不优
- 建议：
  - 写一个 `cdn/cache-policies.ts`，定义每类资产的 `max-age` / `stale-while-revalidate`
  - 配合 `cdn/` 模块一起做
- 工作量：1h（含文档）
- 风险：中

**#7 CDN / Workers 模块还是空目录**
- 现状：`cdn/` 和 `workers/` 只有 `.gitkeep`
- 建议：下个迭代方向——CDN 配置管理 + Workers 脚本
- 优先级：中等
- 工作量：全新模块
- 风险：中

**#8 错误处理不统一**
- 现状：脚本里散落 `process.exit(1)` / `throw new Error()` / 邮件通知
- 建议：在 `src/utils/errors.ts` 抽一个 `failWithEmail()` 统一出口（业务 + 邮件通知）
- 工作量：1h
- 风险：中

#### ⚪ 远期（暂不规划）

**#9 `images-info.json` 27KB 提交到仓库**
- 现状：根目录的 `images-info.json` 进 git，每次爬完都更新
- 影响：git 历史会越来越大
- 建议：
  - 短期：OK，27KB 不算大
  - 长期：如果图片到 1000+，考虑存 R2 metadata，仓库只放 schema
- 工作量：2h
- 风险：低

#### 🎯 推荐执行顺序

如果只能选 3 个：**#1（CI typecheck）** + **#2（rootDir 显式化）** + **#3（单元测试起步）**

| 序号 | 改进项 | 工作量 | 风险 | 预期收益 |
|------|------|------|------|------|
| #1 | CI typecheck | 15 分钟 | 0 | 提早发现类型错误 |
| #2 | rootDir 显式化 | 2 分钟 | 0 | 防 workflow 路径漂移 |
| #3 | 单元测试起步 | 3-4h | 低 | 重构保护 + 文档作用 |
| #4 | LOCAL_DEV.md | 30 分钟 | 0 | 团队接力顺畅 |
| #5 | workflow inputs | 30 分钟 | 0 | 手动调试更灵活 |
| #6 | CDN 缓存策略 | 1h | 中 | 性能 + 成本优化 |
| #7 | cdn/workers 模块 | 全新 | 中 | 拓展产品能力 |
| #8 | 错误处理统一 | 1h | 中 | 减少重复代码 |
| #9 | images-info 拆分 | 2h | 低 | 仓库历史控制 |

## 2026-06-30

### 改进 #3 — 单元测试起步

**目标**：核心纯函数（anti-slop / r2-client）建立基础测试覆盖，**为后续重构提供安全网**。

#### 完成的工作

| 任务 | 状态 |
|------|------|
| 安装 vitest（44 个 dev 包） | ✅ |
| 创建 `vitest.config.ts`（含 coverage 配置） | ✅ |
| 写 `src/utils/anti-slop.test.ts`（12 个测试） | ✅ |
| 写 `src/r2/r2-client.test.ts`（17 个测试） | ✅ |
| `npm run typecheck` 0 错误 | ✅ |
| `npm run build` 成功 | ✅ |
| `npm run test` 29/29 全过 | ✅ |
| 加 `test` / `test:watch` / `test:coverage` 脚本 | ✅ |
| 新建 `.github/workflows/test.yml`（独立 test workflow） | ✅ |

#### 测试覆盖明细

**`src/utils/anti-slop.ts`（12 个测试）**
- 删除 AI 结尾套话
- 删除"总之"类总结句
- 删除开场白"大家好"
- 删除"今天我们来聊"开场白
- 压缩连续感叹号
- 压缩连续逗号
- 保留正常正文不动
- 空字符串处理
- 返回值结构正确
- score 在 0-100 范围内
- AI 风格 vs 正常文本分数对比
- 空文本分数

**`src/r2/r2-client.ts`（17 个测试）**
- 纯函数（8 个）：
  - emptyPayloadHash 正确
  - host 拼接
  - formatDate AWS 格式
  - getSignatureKey Buffer 长度 32
  - getSignatureKey 确定性
  - getSignatureKey 不同日期输出不同
  - signRequest authorization 字段
  - signRequest 带 extraHeaders
- 网络操作（9 个，用 mock fetch）：
  - listAllKeys XML 解析
  - listAllKeys IsTruncated=false 停止
  - listAllKeys HTTP 失败中断
  - listAllKeys prefix 参数
  - uploadToR2 成功/失败
  - deleteObject 200/204/404
  - deleteObject URL 编码

#### 关键决策

1. **为什么不用 `@aws-sdk/client-s3` 删掉**？
   - `r2-client.ts` 是手写 AWS Signature V4，**不依赖** AWS SDK
   - 保留是为了表明「零外部依赖可工作」
   - `package.json` 里的 `@aws-sdk/client-s3` 实际未使用，可在后续阶段清理

2. **为什么 vi.fn 不指定签名类型**？
   - vi.fn() 的默认签名是 `[]`，所以 `.mock.calls[0]` 是 unknown
   - 用 helper `getFetchedUrl()` + `String()` 兜底，比 `as string` cast 更安全
   - 避免 TS2352 类型错误

3. **为什么用 `vi.hoisted()` 设置 env**？
   - `r2-client.ts` 模块加载时立刻调 `requireEnv` 抛错
   - `vi.hoisted()` 在所有 import 之前执行
   - 比 setup file 更内聚

4. **为什么不改业务 workflow 加 test 步骤**？
   - 10 个业务 workflow 跑测试会让每次 CI 慢 30+ 分钟
   - 独立 `test.yml` 只在 push/PR 触发，更轻
   - 业务 workflow 已经跑 typecheck + build（#1），足够保证不破构建

#### 覆盖率（潜在目标）

- `anti-slop.ts`：~80%（纯函数，容易测）
- `r2-client.ts`：~60%（含网络操作部分）

实际覆盖率需 `npm run test:coverage` 跑出（v8 provider）。

#### 后续可扩展

- `email-notifier.ts`：需要重构暴露 `buildEmailContent` 为 export 才能测
- `crawl-lolicon.ts` / `crawl-cnblogs.ts` 等业务脚本：集成测试，CI 环境难复现
- `tsconfig.build.json` 已配 `rootDir: "./src"`，测试文件不会被编译进 `dist/`

#### 文件清单

- 新增：`vitest.config.ts`
- 新增：`src/utils/anti-slop.test.ts`
- 新增：`src/r2/r2-client.test.ts`
- 新增：`.github/workflows/test.yml`
- 修改：`package.json`（devDeps + scripts）

### 改进 #4 — 目录结构重构

**目标**：消除 `buckets/` 按桶名组织代码的反模式，改为按职责分层（lib / scripts / tests）。

#### 重构前后对比

```
# 之前（按 R2 桶名组织）
src/
├── r2/r2-client.ts
├── utils/anti-slop.ts
├── types/env.d.ts
└── buckets/
    ├── homepage-bg/           ← R2 桶名泄漏到代码结构
    └── songdaochuanshu-static/

# 之后（按职责分层）
src/
├── lib/                       ← 共享库（被 import）
│   ├── r2-client.ts
│   ├── anti-slop.ts
│   └── types.ts
├── scripts/                   ← 入口脚本（独立可执行任务）
│   ├── homepage-bg/
│   └── blog/                  ← 用人能读懂的名字
└── __tests__/                 ← 测试
```

#### 完成的工作

| 任务 | 状态 |
|------|------|
| `src/buckets/homepage-bg/` → `src/scripts/homepage-bg/` | ✅ |
| `src/buckets/songdaochuanshu-static/` → `src/scripts/blog/` | ✅ |
| `src/r2/` + `src/utils/` + `src/types/` → `src/lib/` | ✅ |
| 测试文件移至 `src/__tests__/` | ✅ |
| 更新所有 import 路径 | ✅ |
| 更新 vitest.config.ts coverage 路径 | ✅ |
| 更新 package.json scripts 路径 | ✅ |
| 更新 11 个 CI workflow dist/ 路径 | ✅ |
| 删除空占位目录 cdn/、workers/ | ✅ |
| 更新 README.md 项目结构 | ✅ |
| 更新 CONTRIBUTING.md 项目结构 | ✅ |
| `npm run typecheck` 0 错误 | ✅ |
| `npm run test` 29/29 全过 | ✅ |

#### 设计决策

1. **为什么 `scripts/blog/` 而不是 `scripts/songdaochuanshu-static/`**？
   - 代码按"做什么"组织，不是按"放哪个桶"
   - 桶名是部署细节，改桶名不该改目录名
   - `blog` 比 `songdaochuanshu-static` 好读 10 倍

2. **为什么 `lib/` 而不是 `utils/` + `r2/`**？
   - 所有被 import 的库代码放一个目录，职责清晰
   - `utils/` 是个垃圾抽屉命名，不如 `lib/` 明确

3. **为什么删 `cdn/` 和 `workers/`**？
   - 空目录占位没意义，真要写 Workers 时再建
   - Workers 是独立部署单元，不该跟脚本混在一起
