# CONTRIBUTING.md — 开发上下文

## 项目结构

```
cloudflare-assets/
├── .github/
│   └── workflows/
│       ├── cleanup-blog.yml
│       ├── crawl-cnblogs.yml
│       ├── crawl.yml
│       ├── delete-all-posts.yml
│       ├── delete-first-posts.yml
│       ├── delete-old-posts.yml
│       ├── delete.yml
│       ├── fix-tags.yml
│       ├── generate-article.yml
│       └── update-images-info.yml
├── buckets/
│   ├── homepage-bg/               # 图片存储桶 (img-homepage.openserve.cloud)
│   │   ├── crawl-lolicon.mjs      # Lolicon API 爬虫
│   │   ├── delete-images.mjs      # 批量删除图片
│   │   ├── delete-non-lolicon.mjs # 删除非 Lolicon 来源图片
│   │   ├── enrich-metadata.mjs    # 元数据补全
│   │   ├── fix-images-info-structure.mjs  # 修复 images-info.json 结构
│   │   ├── list-prefixes.mjs      # 列出 R2 前缀
│   │   └── update-images-info.mjs # 更新 images-info.json
│   └── songdaochuanshu-static/    # 博客存储桶 (songdaochuanshu.com)
│       ├── articles/              # 博客园爬取的文章
│       └── posts/                 # AI 生成的文章
├── cdn/                           # CDN 配置 (Workers 路由等)
│   └── .gitkeep
├── r2/
│   └── r2-client.mjs              # R2 操作核心 (AWS Signature V4)
├── utils/
│   ├── anti-slop.mjs              # 反 AI 废话检测
│   ├── email-notifier.mjs         # 邮件通知 (QQ 邮箱 SMTP)
│   └── send-email.mjs             # 邮件发送底层
├── workers/                       # Cloudflare Workers 脚本
│   └── .gitkeep
├── CONTEXT.md                     # 项目背景
├── CONTRIBUTING.md                # 开发上下文 (本文件)
├── PROGRESS.md                    # 工作进度日志
├── README.md                      # 项目说明
└── images-info.json               # (待清理) 旧根目录残留
```

## 核心模块

### R2 签名模块 (`r2/r2-client.mjs`)
- AWS Signature V4 签名
- Content-Type 签名修复
- 环境变量：`CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- 每个存储桶独立凭据

### 图片管理 (`buckets/homepage-bg/`)
- 桶：`homepage-bg`
- 域名：`img-homepage.openserve.cloud`
- 分类：`normal/`（普通）和 `r18/`（成人）
- 来源：Lolicon API (`r18=1`)
- 元数据：`images-info.json`（含 `normal` 和 `r18` 数组）

### 博客系统 (`buckets/songdaochuanshu-static/`)
- 桶：`songdaochuanshu-static`
- 域名：`songdaochuanshu.com`
- 爬虫：博客园文章爬取
- 生成：GLM-4-Flash (智谱AI) 生成新文章
- 检测：反 AI 废话（4 个维度评分）

### 邮件通知 (`utils/`)
- QQ 邮箱 SMTP 发送
- 环境变量：`SMTP_USER`, `SMTP_PASS`

## 开发规则

1. **Node.js 环境**：所有脚本为 ESM（`.mjs`），使用 `node:https`、`node:crypto`
2. **零依赖**：仅用 Node.js 内置模块
3. **密钥管理**：环境变量或 GitHub Secrets，不硬编码
4. **工作流**：Docker 容器 `node:20-slim`，统一权限 `permissions: contents: write`
5. **提交格式**：语义化提交（`feat:`、`fix:`、`refactor:`、`ci:`、`docs:`、`chore:`）
6. **环境变量**：通过 `.env` 文件或 GitHub Secrets 配置

## 关键限制

- GitHub API rate limit: 5000/hour
- Lolicon API: 3 req/sec
- R2 免费额度: 10GB 存储, 10M 次请求/月
- 免费套餐不能绑定自定义域名（需 Pro Plan）
