# CONTRIBUTING.md — 开发上下文

## 项目结构

```
cloudflare-assets/
├── r2/                            # R2 图片管理
│   ├── crawl-lolicon.mjs          # 爬虫主脚本
│   ├── check-lolicon.mjs          # 图片来源检查
│   ├── delete-images.mjs          # 按文件名删除
│   ├── delete-non-lolicon.mjs     # 按 PID 删除
│   ├── update-images-info.mjs     # 元数据更新
│   ├── images-info.json           # 图片元数据（自动生成）
│   └── output/                    # 检查结果输出目录
│       ├── lolicon-images.json
│       └── non-lolicon-images.json
├── cdn/                           # CDN 配置（待扩展）
├── workers/                       # Workers 脚本（待扩展）
└── .github/workflows/
    ├── crawl.yml                  # 定时爬取
    ├── check.yml                  # 手动检查
    ├── delete.yml                 # 手动删除
    └── update-images-info.yml     # 定时更新元数据
```

## 核心设计

### R2 签名

所有 R2 操作通过 S3 兼容 API 实现，使用 **AWS Signature V4** 手写签名，不依赖官方 SDK。

签名函数 `signRequest(method, uri, query, bodyHash, date, extraHeaders)` 位于每个脚本内部（未抽取公共模块）。

关键点：
- 必须签名所有发送的 HTTP 头（`host`、`x-amz-content-sha256`、`x-amz-date`，PUT 请求还需 `content-type`）
- 头名按字母序排列
- `extraHeaders` 参数支持传入额外需要签名的头

### 图片命名规则

- 文件名 = Pixiv 作品 ID + 扩展名（如 `12345678.jpg`）
- R2 中存储在桶根目录（无前缀）
- CDN 地址：`https://img-homepage.openserve.cloud/{filename}`

### 爬虫限流

- 最大下载数：`MAX_DOWNLOADS = 2`（防封 IP）
- 下载间隔：3-5 秒随机
- Lolicon API 偶尔返回 403，脚本会自动重试一次

## 环境变量

| 变量名 | 说明 | 默认值 |
|---|---|---|
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID | 无 |
| `R2_KEY_ID` | R2 API Token Access Key | 无 |
| `R2_SECRET_KEY` | R2 API Token Secret Key | 无 |
| `R2_HOMEPAGE_BUCKET` | homepage-bg 图片桶 | `homepage-bg` |

## 环境变量命名规范

桶相关变量统一使用 `R2_<用途>_BUCKET` 格式：

| 变量名 | 用途 |
|---|---|
| `R2_HOMEPAGE_BUCKET` | 首页背景图桶 |
| `R2_XXX_BUCKET` | 未来新增桶（按用途命名） |

## 已知问题

1. **签名调试**：`crawl-lolicon.mjs` 中 `signRequest` 带有 `debug` 参数，设为 `true` 可输出完整的签名计算过程
2. **502 偶发**：Cloudflare 网关偶尔返回 502，属正常现象
3. **无公共模块**：R2 操作代码在每个脚本中重复，未抽取为共享模块

## 本地调试

```bash
# 设置环境变量后直接运行
node crawl-lolicon.mjs

# 调试签名问题：将 signRequest 的 debug 参数设为 true
# 会输出 CanonicalRequest 和 StringToSign
```

## 提交规范

- `feat:` 新功能
- `fix:` 修复
- `refactor:` 重构
- `debug:` 调试相关
- `docs:` 文档
