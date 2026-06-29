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

### 待办

- [x] 抽取 R2 签名为公共模块 —— 新建 r2/r2-client.mjs，5 个脚本改用 import
  - [x] 通过 GitHub Actions 真实环境验证（Update Images Info #12 ✅）
- [ ] CDN 配置管理（cdn/ 目录）
- [ ] Workers 脚本（workers/ 目录）
- [ ] 为其他工作流添加邮件通知（update-images-info、delete-images 等）
- [ ] 删除 R2 根目录下的旧 images-info.json（如果有残留）

## 2026-06-29

### 完成

- [x] 按桶重构目录结构：新建 `buckets/` 目录，按 R2 桶名分子目录
  - `buckets/homepage-bg/` — homepage-bg 桶（图片）脚本
  - `buckets/songdaochuanshu-static/` — songdaochuanshu-static 桶（博客文章，待开发）
  - `r2/r2-client.mjs` — 共享模块保持不变，脚本改用 `../../r2/r2-client.mjs` 导入
  - 更新 `.github/workflows/crawl.yml`、`update-images-info.yml`、`delete.yml` 中的脚本路径

### 项目结构（最新）

```
cloudflare-assets/
├── r2/
│   └── r2-client.mjs            # 共享 R2 客户端（签名 + 上传，所有桶共用）
├── buckets/                     # 按 R2 桶分目录
│   ├── homepage-bg/             # homepage-bg 桶（图片）
│   │   ├── crawl-lolicon.mjs
│   │   ├── update-images-info.mjs
│   │   ├── delete-images.mjs
│   │   ├── delete-non-lolicon.mjs
│   │   └── list-prefixes.mjs
│   └── songdaochuanshu-static/ # songdaochuanshu-static 桶（博客文章，待开发）
│       └── (待添加爬虫脚本)
├── utils/
│   └── email-notifier.mjs       # 通用邮件通知组件（Resend）
├── cdn/                         # CDN 配置（待开发）
├── workers/                     # Cloudflare Workers（待开发）
└── .github/workflows/          # GitHub Actions 定时任务
```
