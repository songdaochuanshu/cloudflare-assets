# PROGRESS.md — 项目进度

## 2026-06-28

### 完成

- [x] 仓库创建（原名 image-checker，后改名 r2-image-manager，最终定名 cloudflare-assets）
- [x] R2 签名实现（AWS Signature V4）
- [x] Lolicon 爬虫脚本（crawl-lolicon.mjs）
- [x] 图片来源检查（check-lolicon.mjs）
- [x] 图片删除工具（delete-images.mjs、delete-non-lolicon.mjs）
- [x] 元数据更新（update-images-info.mjs）
- [x] GitHub Actions 定时任务配置
- [x] 修复 R2 PUT 签名问题（Content-Type 未签名导致 SignatureDoesNotMatch）
- [x] 修复环境变量（CF_ACCOUNT_ID 误填为 API Token 格式）
- [x] 重命名环境变量：R2_ACCOUNT_ID → CF_ACCOUNT_ID、R2_ACCESS_KEY_ID → R2_KEY_ID 等
- [x] 桶变量命名规范：R2_<用途>_BUCKET
- [x] 项目目录重组：r2/、cdn/、workers/
- [x] 图片分类：r18/（R18 插画）、normal/（普通插画）
- [x] 数据迁移：根目录图片 → r18/、backgrounds/ → normal/
- [x] 清理根目录旧文件
- [x] README、CONTRIBUTING、CONTEXT、PROGRESS 文档

### 当前状态

- R2 桶 `homepage-bg` 中：
  - `r18/` — 170 张 R18 插画
  - `normal/` — 51 张普通插画
- 爬虫每天运行 5 次（北京时间 09/13/17/21/01 时）
- 元数据每天更新一次（北京时间 08:00）

### 待办

- [ ] 抽取 R2 签名为公共模块（消除代码重复）
- [ ] CDN 配置管理（cdn/ 目录）
- [ ] Workers 脚本（workers/ 目录）
- [ ] 爬虫支持更多图片来源
- [ ] 图片元数据补全（title、author、tags、width、height）
