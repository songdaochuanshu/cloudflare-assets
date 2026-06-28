# Cloudflare Assets

Cloudflare 资产管理工具集。当前包含 R2 图片管理，未来扩展 CDN、Workers 等。

## 项目结构

```
cloudflare-assets/
├── r2/                        # R2 图片管理
│   ├── crawl-lolicon.mjs      # Lolicon 爬虫
│   ├── check-lolicon.mjs      # 图片来源检查
│   ├── delete-images.mjs      # 按文件名删除
│   ├── delete-non-lolicon.mjs # 按 PID 删除
│   ├── update-images-info.mjs # 元数据更新
│   ├── migrate-*.mjs          # 数据迁移工具
│   ├── quick-list.mjs         # R2 结构查看
│   └── images-info.json       # 图片元数据（自动生成）
├── cdn/                       # CDN 配置（待扩展）
├── workers/                   # Workers 脚本（待扩展）
└── .github/workflows/         # CI/CD
```

## R2 桶结构

```
homepage-bg/
├── r18/               # R18 插画（Lolicon API）
│   ├── 12345678.jpg
│   └── images-info.json
└── normal/            # 普通插画
    └── 98765432.jpg
```

CDN 域名：`img-homepage.openserve.cloud`

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

### 爬虫参数

- 每次运行 **5 分钟**
- 下载间隔 **15-20 秒**随机
- 图片以 Pixiv PID 命名（如 `12345678.jpg`）

## GitHub Actions

| Workflow | 触发 | 说明 |
|---|---|---|
| `crawl.yml` | 每天 09/13/17/21/01 时（北京时间） | 爬取新图片 |
| `update-images-info.yml` | 每天 08:00（北京时间） | 更新元数据 |
| `check.yml` | 手动 | 检查图片来源 |
| `delete.yml` | 手动 | 删除指定图片 |

## 本地运行

```bash
export CF_ACCOUNT_ID="your-account-id"
export R2_KEY_ID="your-key-id"
export R2_SECRET_KEY="your-secret-key"
export R2_HOMEPAGE_BUCKET="homepage-bg"

node r2/crawl-lolicon.mjs
```
