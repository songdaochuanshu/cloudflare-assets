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
│   ├── migrate-to-prefix.mjs      # 迁移：根目录 → r18/
│   ├── migrate-backgrounds.mjs    # 迁移：backgrounds/ → normal/
│   ├── quick-list.mjs             # R2 结构查看工具
│   ├── list-prefixes.mjs          # R2 前缀列表工具
│   ├── images-info.json           # 图片元数据（自动生成）
│   └── output/                    # 检查结果输出
│       ├── lolicon-images.json
│       └── non-lolicon-images.json
├── cdn/                           # CDN 配置（待扩展）
├── workers/                       # Workers 脚本（待扩展）
└── .github/workflows/
    ├── crawl.yml                  # 定时爬取
    ├── check.yml                  # 手动检查
    ├── delete.yml                 # 手动删除
    ├── update-images-info.yml     # 定时更新元数据
    ├── migrate.yml                # 根目录 → r18/ 迁移
    ├── migrate-bg.yml             # backgrounds/ → normal/ 迁移
    └── list-prefixes.yml          # R2 前缀查看
```

## 核心设计

### R2 签名

所有 R2 操作通过 S3 兼容 API 实现，使用 **AWS Signature V4** 手写签名。

签名函数 `signRequest(method, uri, query, bodyHash, date, extraHeaders)` 位于每个脚本内部。

关键点：
- 必须签名所有发送的 HTTP 头（`host`、`x-amz-content-sha256`、`x-amz-date`，PUT 请求还需 `content-type`）
- 头名按字母序排列
- `extraHeaders` 参数支持传入额外需要签名的头

### 桶目录结构

```
homepage-bg/
├── r18/          # R18 插画（Lolicon API 爬取）
├── normal/       # 普通插画
└── images-info.json  # 元数据（可选）
```

- 图片以 Pixiv PID 命名：`12345678.jpg`
- CDN 地址：`https://img-homepage.openserve.cloud/{prefix}/{filename}`
- 新增分类：在桶内创建新前缀目录，代码中添加对应的 `R2_PREFIX`

### 环境变量命名

| 变量名 | 说明 |
|---|---|
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID |
| `R2_KEY_ID` | R2 API Token Access Key |
| `R2_SECRET_KEY` | R2 API Token Secret Key |
| `R2_HOMEPAGE_BUCKET` | 首页背景图桶名 |

桶变量统一 `R2_<用途>_BUCKET` 格式，新增桶按此规范命名。

## 已知问题

1. **502 偶发**：Cloudflare 网关偶尔返回 502，属正常现象
2. **无公共模块**：R2 签名代码在每个脚本中重复，未抽取为共享模块
3. **Lolicon 限流**：爬虫已限制为每 15-20 秒下载一张，避免被封 IP

## 提交规范

- `feat:` 新功能
- `fix:` 修复
- `refactor:` 重构
- `ci:` CI/CD 相关
- `docs:` 文档
- `chore:` 杂项
