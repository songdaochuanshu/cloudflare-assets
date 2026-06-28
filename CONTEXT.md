# CONTEXT.md — 项目背景

## 是什么

Cloudflare 资产管理工具集，当前核心功能是 R2 图片存储管理。

## 为什么

- 需要自动化从 Lolicon API 爬取 Pixiv 插画并存储到 Cloudflare R2
- 需要区分 R18 和普通插画，分别存放在不同目录
- 需要定期清理非目标来源的图片
- 需要维护图片元数据索引（images-info.json）

## 架构决策

1. **手写 S3 签名**：不依赖 AWS SDK 或 Cloudflare SDK，减少依赖
2. **每个脚本独立**：R2 操作代码未抽取公共模块，每个 .mjs 文件可独立运行
3. **GitHub Actions 定时任务**：爬取和元数据更新通过 cron 触发，无需自建服务器
4. **前缀分目录**：R2 桶内用 `r18/`、`normal/` 前缀区分图片类型，非物理目录

## 数据流

```
Lolicon API → 下载图片 → 上传到 R2 r18/ → CDN 分发
                              ↓
                    更新 images-info.json
```

## 外部依赖

- **Lolicon API**: `https://api.lolicon.app/setu/v2` — 图片来源
- **Pixiv**: 图片原始 URL（需 Referer 头下载）
- **Cloudflare R2**: 对象存储
- **CDN**: `img-homepage.openserve.cloud` — 图片分发

## 安全注意

- R2 API Token 需要 **Object Read & Write** 权限
- 环境变量通过 GitHub Secrets 管理，不入代码库
- Pixiv 下载需携带 Referer 头，否则 403
