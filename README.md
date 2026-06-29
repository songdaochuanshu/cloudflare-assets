# Cloudflare Assets

Cloudflare 资产管理工具集。包含 R2 图片管理和博客文章系统，未来扩展 CDN、Workers 等。

## 项目结构

```
cloudflare-assets/
├── r2/
│   └── r2-client.mjs                    # 共享 R2 客户端
├── buckets/
│   ├── homepage-bg/                     # 图片桶（Lolicon 插画）
│   │   ├── crawl-lolicon.mjs
│   │   ├── update-images-info.mjs
│   │   ├── delete-images.mjs
│   │   ├── delete-non-lolicon.mjs
│   │   └── list-prefixes.mjs
│   └── songdaochuanshu-static/          # 博客桶
│       ├── crawl-cnblogs.mjs            # 博客园爬虫
│       ├── generate-article.mjs         # AI 文章生成
│       ├── cleanup-blog.mjs
│       ├── fix-manifest-tags.mjs
│       └── delete-*.mjs
├── utils/
│   ├── anti-slop.mjs                    # 反 AI 废话模块
│   ├── email-notifier.mjs               # 邮件通知
│   └── send-email.mjs
├── cdn/                                 # CDN 配置（待扩展）
├── workers/                             # Workers 脚本（待扩展）
└── .github/workflows/                   # CI/CD
```

## R2 桶结构

### homepage-bg（图片）

```
homepage-bg/
├── r18/               # R18 插画（Lolicon API）
├── normal/            # 普通插画
└── images-info.json   # 元数据索引
```

CDN 域名：`img-homepage.openserve.cloud`

### songdaochuanshu-static（博客）

```
songdaochuanshu-static/
├── posts/
│   ├── article-1.md
│   └── article-2.md
└── manifest.json      # 文章列表索引
```

## 技术栈

- **运行时**: Node.js 20
- **存储**: Cloudflare R2（S3 兼容 API）
- **签名**: AWS Signature V4（手写实现，无官方 SDK）
- **CI/CD**: GitHub Actions
- **图片来源**: [Lolicon API](https://api.lolicon.app/)

## 环境变量

| 变量名 | 说明 |
|---|---|
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID（32位十六进制） |
| `R2_KEY_ID` | R2 API Token 的 Access Key ID |
| `R2_SECRET_KEY` | R2 API Token 的 Secret Key |
| `R2_HOMEPAGE_BUCKET` | 桶名（默认 `homepage-bg`） |
| `R2_STATIC_BUCKET` | 博客桶名（默认 `songdaochuanshu-static`） |
| `ZHIPU_API_KEY` | 智谱 AI API Key（文章生成） |
| `RESEND_API_KEY` | Resend 邮件服务 Key（通知） |

### 命名规范

桶变量统一 `R2_<用途>_BUCKET` 格式：

| 变量名 | 用途 |
|---|---|
| `R2_HOMEPAGE_BUCKET` | 首页背景图桶 |
| `R2_XXX_BUCKET` | 未来新增桶 |

## R2 脚本

| 脚本 | 功能 | 触发方式 |
|---|---|---|
| `crawl-lolicon.mjs` | 爬取 Lolicon R18 图片到 `r18/` | 每天5次定时 + 手动 |
| `check-lolicon.mjs` | 检查哪些图片来自 Lolicon | 手动 |
| `delete-non-lolicon.mjs` | 按 PID 列表删除图片 | 手动 |
| `delete-images.mjs` | 按文件名列表删除图片 | 手动 |
| `update-images-info.mjs` | 重新生成 images-info.json | 每天定时 + 手动 |

### 博客脚本

| 脚本 | 功能 | 触发方式 |
|---|---|---|
| `crawl-cnblogs.mjs` | 从博客园 RSS 抓取标题 | 定时 + 手动 |
| `generate-article.mjs` | AI 生成文章并发布到 R2 | 定时 + 手动 |
| `cleanup-blog.mjs` | 清空博客所有文章 | 手动 |
| `fix-manifest-tags.mjs` | 为历史文章补充分类标签 | 手动 |

### 爬虫参数

- 每次运行 **5 分钟**
- 下载间隔 **15-20 秒**随机
- 图片以 Pixiv PID 命名（如 `12345678.jpg`）

## GitHub Actions

| Workflow | 触发 | 说明 |
|---|---|---|
| `crawl.yml` | 每天 09/13/17/21/01 时（北京时间） | 爬取新图片 |
| `update-images-info.yml` | 每天 08:00（北京时间） | 更新元数据 |
| `crawl-cnblogs.yml` | 定时 + 手动 | 博客园爬取（多模式） |
| `generate-article.yml` | 定时 + 手动 | AI 文章生成 |
| `cleanup-blog.yml` | 手动 | 清空博客 |
| `fix-manifest-tags.yml` | 手动 | 修复历史标签 |
| `delete-all-posts.yml` | 手动 | 删除所有文章 |
| `delete-old-posts.yml` | 手动 | 删除旧文章 |
| `delete.yml` | 手动 | 删除指定图片 |

## 本地运行

```bash
# 图片爬虫
export CF_ACCOUNT_ID="your-account-id"
export R2_KEY_ID="your-key-id"
export R2_SECRET_KEY="your-secret-key"
export R2_HOMEPAGE_BUCKET="homepage-bg"
node buckets/homepage-bg/crawl-lolicon.mjs

# 博客文章生成
export R2_STATIC_BUCKET="songdaochuanshu-static"
export ZHIPU_API_KEY="your-zhipu-key"
node buckets/songdaochuanshu-static/generate-article.mjs
```
