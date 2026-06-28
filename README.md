# R2 Image Manager

Cloudflare R2 图片管理工具集，围绕 Lolicon API（Pixiv 插画）实现图片的爬取、检查、清理和元数据管理。

## 功能

### R2（图片管理）

| 脚本 | 功能 | 触发方式 |
|---|---|---|
| `r2/crawl-lolicon.mjs` | 从 Lolicon API 爬取图片上传到 R2 | 每天 5 次定时 + 手动 |
| `r2/check-lolicon.mjs` | 检查 R2 中哪些图片来自 Lolicon API | 手动 |
| `r2/delete-non-lolicon.mjs` | 根据 PID 列表删除 R2 中的非 Lolicon 图片 | 手动 |
| `r2/delete-images.mjs` | 根据文件名列表删除 R2 中的指定图片 | 手动 |
| `r2/update-images-info.mjs` | 从 R2 重新生成 `images-info.json` 并上传 | 每天定时 + 手动 |

## 技术栈

- **运行时**: Node.js 20
- **存储**: Cloudflare R2（S3 兼容 API）
- **签名**: AWS Signature V4 手写实现（无官方 SDK）
- **CI/CD**: GitHub Actions
- **图片来源**: [Lolicon API](https://api.lolicon.app/)
- **CDN 域名**: `img-homepage.openserve.cloud`

## 环境变量

在 GitHub Secrets 中配置：

| 变量名 | 说明 |
|---|---|
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID |
| `R2_KEY_ID` | R2 API Token 的 Access Key ID |
| `R2_SECRET_KEY` | R2 API Token 的 Secret Key |
| `R2_HOMEPAGE_BUCKET` | homepage-bg 图片桶名 |

## 本地运行

```bash
# 设置环境变量
export CF_ACCOUNT_ID="your-account-id"
export R2_KEY_ID="your-key-id"
export R2_SECRET_KEY="your-secret-key"
export R2_HOMEPAGE_BUCKET="homepage-bg"

# 运行爬虫
node crawl-lolicon.mjs

# 检查图片来源
node check-lolicon.mjs

# 更新元数据
node update-images-info.mjs
```

## 数据结构

### images-info.json

```json
[
  {
    "pid": 46907750,
    "filename": "46907750.jpg",
    "url": "https://img-homepage.openserve.cloud/46907750.jpg",
    "title": "",
    "author": "",
    "width": 0,
    "height": 0,
    "tags": [],
    "ext": "jpg",
    "size_kb": 0,
    "downloaded": true
  }
]
```

### 输出文件

- `output/lolicon-images.json` — 来自 Lolicon 的图片列表
- `output/non-lolicon-images.json` — 非 Lolicon 来源的图片列表

## GitHub Actions Workflows

| Workflow | 触发 | 说明 |
|---|---|---|
| `crawl.yml` | 每天 09:00/13:00/17:00/21:00/01:00 北京时间 | 爬取新图片 |
| `update-images-info.yml` | 每天 08:00 北京时间 | 更新元数据 JSON |
| `check.yml` | 手动触发 | 检查图片来源 |
| `delete.yml` | 手动触发 | 删除指定图片 |

## 注意事项

### 环境变量命名规范

桶相关变量统一使用 `R2_<用途>_BUCKET` 格式：

| 变量名 | 用途 |
|---|---|
| `R2_HOMEPAGE_BUCKET` | 首页背景图桶 |
| `R2_XXX_BUCKET` | 未来新增桶（按用途命名） |

- 爬虫每次运行限制下载 2 张，避免被 Lolicon API 封禁 IP
- 下载间隔 3-5 秒随机
- 图片以 Pixiv PID 作为文件名（如 `12345678.jpg`）
- R2 通过 S3 兼容 API 操作，签名使用 AWS Signature V4
