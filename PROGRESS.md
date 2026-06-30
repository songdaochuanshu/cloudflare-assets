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
