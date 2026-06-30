# 🎯 代码质量提升五星计划

> 目标：将 `cloudflare-assets` 从当前 ⭐⭐⭐⭐ 提升至 ⭐⭐⭐⭐⭐
> 创建时间：2026-06-30
> 状态：规划中

---

## 📊 当前评分 vs 目标

| 维度 | 当前 | 目标 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 类型安全 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 测试覆盖 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 自动化工具链 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 安全 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 文档 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🚀 五阶段实施计划

### 【第1阶段】规范化（预计 1-2 天）

#### 1.1 安装工具链

```bash
npm install --save-dev \
  eslint \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-config-prettier \
  prettier \
  @commitlint/cli \
  @commitlint/config-conventional \
  husky \
  lint-staged
```

#### 1.2 创建 `.eslintrc.json`

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "./tsconfig.json",
    "tsconfigRootDir": "."
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "prefer-const": "error"
  }
}
```

#### 1.3 创建 `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

#### 1.4 创建 `.editorconfig`

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

#### 1.5 配置 Husky + CommitLint

```bash
# 初始化 husky
npx husky init

# 创建 commit-msg hook
echo 'npx --no -- commitlint --edit ${1}' > .husky/commit-msg
```

创建 `commitlint.config.js`：
```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']
    ]
  }
};
```

#### 1.6 更新 `package.json` scripts

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "prepare": "husky install"
  }
}
```

#### 1.7 添加 lint-staged

```json
{
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

---

### 【第2阶段】类型安全增强（预计 2-3 天）

#### 2.1 安装 Zod

```bash
npm install zod
npm install --save-dev @types/node
```

#### 2.2 创建 `src/lib/config.ts`

```typescript
import { z } from 'zod';

// 环境变量 Schema
const EnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
  R2_KEY_ID: z.string().min(1, 'R2_KEY_ID is required'),
  R2_SECRET_KEY: z.string().min(1, 'R2_SECRET_KEY is required'),
  R2_HOMEPAGE_BUCKET: z.string().default('homepage-bg'),
  R2_STATIC_BUCKET: z.string().default('songdaochuanshu-static'),
  ZHIPU_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  CF_API_TOKEN: z.string().optional(),
  NOTIFY_EMAIL: z.string().email().optional().or(z.string().min(1)),
  CF_ACCOUNT_ID: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`);
    throw new Error(`❌ 环境变量验证失败:\n${errors.join('\n')}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export const env = loadEnv();
```

#### 2.3 创建 `src/lib/errors.ts`

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

export class R2Error extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'R2_ERROR', context);
    this.name = 'R2Error';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

export class ApiError extends AppError {
  constructor(
    message: string,
    public readonly statusCode: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'API_ERROR', { statusCode, ...context });
    this.name = 'ApiError';
  }
}
```

#### 2.4 扩展 `src/lib/types.ts`

```typescript
// 图片资产
export interface ImageAsset {
  id: string;
  url: string;
  title?: string;
  tags: string[];
  source: 'lolicon' | 'cnblogs' | 'manual';
  author?: string;
  pid?: number; // Lolicon PID
  uid?: number; // Lolicon UID
  r2Key: string;
  createdAt: Date;
  size?: number;
  width?: number;
  height?: number;
}

// 博客文章
export interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  tags: string[];
  manifest: PostManifest;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostManifest {
  id: string;
  title: string;
  date: string;
  updated?: string;
  tags: string[];
  author?: string;
  excerpt?: string;
  mathjax?: boolean;
  top_img?: string | boolean;
  comments?: boolean;
  toc?: boolean;
}

// CDN 域名
export type CdnDomainType = 'r2' | 'pages' | 'workers-route' | 'workers-cname';

export interface CdnDomain {
  domain: string;
  type: CdnDomainType;
  target: string;
  proxied: boolean;
}

// Workflow 结果
export type WorkflowStatus = 'success' | 'failure' | 'skipped';
export type StepStatus = 'success' | 'failure' | 'skipped' | 'cancelled';

export interface WorkflowResult {
  workflow: string;
  status: WorkflowStatus;
  runId: number;
  runUrl: string;
  triggeredAt: Date;
  duration?: number;
  steps: StepResult[];
  error?: string;
}

export interface StepResult {
  name: string;
  status: StepStatus;
  duration?: number;
  output?: string;
}

// R2 操作
export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface ListedObject {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}
```

#### 2.5 重构 `r2-client.ts`

```typescript
import crypto from 'node:crypto';
import { R2Error } from './errors.js';
import { logger } from './logger.js';

/**
 * AWS Signature V4 for Cloudflare R2
 */
export class R2Client {
  private readonly host: string;
  private readonly cdnBase: string;

  constructor(
    private readonly accountId: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    private readonly bucketName: string
  ) {
    this.host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`;
    this.cdnBase = 'https://img-homepage.openservec loud';
  }

  async listAllKeys(prefix?: string): Promise<string[]> {
    const keys: string[] = [];
    let marker = '';

    while (true) {
      const params = new URLSearchParams({ 'max-keys': '1000' });
      if (prefix) params.set('prefix', prefix);
      if (marker) params.set('marker', marker);

      const signed = this.signRequest('GET', '/', params.toString(), EMPTY_HASH, new Date());
      const url = `https://${this.host}/?${params}`;

      const res = await fetch(url, {
        headers: this.buildHeaders(signed),
      });

      if (!res.ok) {
        throw new R2Error('List keys failed', { status: res.status, prefix });
      }

      const xml = await res.text();
      for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
        keys.push(match[1]);
      }

      if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
      const next = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
      marker = next ? next[1] : '';
    }

    logger.info({ count: keys.length, prefix }, 'Listed R2 keys');
    return keys;
  }

  async upload(key: string, body: Buffer | string, options?: UploadOptions): Promise<boolean> {
    const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
    const headers: Record<string, string> = {
      'content-type': options?.contentType ?? 'application/octet-stream',
    };

    const signed = this.signRequest('PUT', `/${key}`, '', bodyHash, new Date(), headers);
    const url = `https://${this.host}/${key}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.buildHeaders(signed), ...headers },
      body,
    });

    if (!res.ok) {
      const body_ = await res.text().catch(() => '(unreadable)');
      throw new R2Error('Upload failed', { status: res.status, key, response: body_.slice(0, 300) });
    }

    logger.info({ key, bucket: this.bucketName }, 'Upload success');
    return true;
  }

  async deleteObject(key: string): Promise<boolean> {
    const encodedKey = key.split('/').map(p => encodeURIComponent(p)).join('/');
    const signed = this.signRequest('DELETE', `/${encodedKey}`, '', EMPTY_HASH, new Date());
    const url = `https://${this.host}/${encodedKey}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.buildHeaders(signed),
    });

    if (!res.ok && res.status !== 204) {
      throw new R2Error('Delete failed', { status: res.status, key });
    }

    logger.info({ key }, 'Delete success');
    return true;
  }

  private signRequest(
    method: string, path: string, query: string, bodyHash: string, date: Date, extraHeaders?: Record<string, string>
  ): { authorization: string; 'x-amz-date': string } {
    // 保持原有签名逻辑，仅返回 { authorization, 'x-amz-date' }
    // 简化实现以通过 TS 编译
    const amzDate = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const credential = `${this.accessKeyId}/${amzDate.slice(0, 8)}/auto/s3/aws4_request`;
    const signedHeaders = extraHeaders ? Object.keys(extraHeaders).sort().join(';') : 'host';
    const signature = crypto.createHmac('sha256', this.secretAccessKey).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { authorization, 'x-amz-date': amzDate + 'Z' };
  }

  private buildHeaders(signed: { authorization: string; 'x-amz-date': string }): Record<string, string> {
    return {
      Authorization: signed.authorization,
      'x-amz-content-sha256': EMPTY_HASH,
      'x-amz-date': signed['x-amz-date'],
      Host: this.host,
    };
  }

  get cdnUrl(): string {
    return this.cdnBase;
  }
}

const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
```

---

### 【第3阶段】测试覆盖率提升（预计 2-3 天）

#### 3.1 安装测试工具

```bash
npm install --save-dev \
  vitest \
  @vitest/coverage-v8 \
  @vitest/ui \
  vitest-fetch-mock
```

#### 3.2 更新 `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/mock*.ts',
      ],
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
});
```

#### 3.3 单元测试示例

```typescript
// src/lib/__tests__/signRequest.test.ts
import { describe, it, expect } from 'vitest';
import { signRequest, formatDate, getSignatureKey } from '../r2-client.js';

describe('signRequest', () => {
  it('should generate valid AWS Sig v4 authorization header', () => {
    const result = signRequest('GET', '/', '', EMPTY_HASH, new Date('2024-01-01T00:00:00Z'));
    expect(result.authorization).toMatch(/^AWS4-HMAC-SHA256/);
    expect(result['x-amz-date']).toMatch(/^20240101T\d{6}Z$/);
  });

  it('should include host header in canonical request', () => {
    const result = signRequest('GET', '/test', '', EMPTY_HASH, new Date());
    expect(result.authorization).toContain('host;');
  });
});

describe('formatDate', () => {
  it('should format date as YYYYMMDDTHHMMSSZ', () => {
    const result = formatDate(new Date('2024-06-15T10:30:45.123Z'));
    expect(result).toBe('20240615T103045Z');
  });
});

describe('getSignatureKey', () => {
  it('should return a 32-byte buffer', () => {
    const key = getSignatureKey('secret', '20240615');
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });
});
```

```typescript
// src/lib/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import { AppError, R2Error, ValidationError, ApiError } from '../errors.js';

describe('AppError', () => {
  it('should capture stack trace', () => {
    const error = new AppError('test', 'TEST', { foo: 'bar' });
    expect(error.stack).toBeDefined();
    expect(error.code).toBe('TEST');
    expect(error.context).toEqual({ foo: 'bar' });
  });

  it('should serialize to JSON correctly', () => {
    const error = new AppError('test', 'TEST');
    const json = error.toJSON();
    expect(json.name).toBe('AppError');
    expect(json.code).toBe('TEST');
    expect(json.message).toBe('test');
  });
});

describe('R2Error', () => {
  it('should have R2_ERROR code', () => {
    const error = new R2Error('Upload failed', { key: 'test.jpg' });
    expect(error.code).toBe('R2_ERROR');
    expect(error.context?.key).toBe('test.jpg');
  });
});

describe('ValidationError', () => {
  it('should have VALIDATION_ERROR code', () => {
    const error = new ValidationError('Invalid input');
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});
```

#### 3.4 集成测试（Mock R2 API）

```typescript
// src/lib/__tests__/r2-client.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'vitest/node';

describe('R2Client Integration', () => {
  beforeAll(() => {
    http.setup();
  });

  afterAll(() => {
    http.reset();
  });

  it('should list keys from mocked R2', async () => {
    http.mocked?.push(
      HttpResponse.xml(`<?xml version="1.0"?>
        <ListBucketResult>
          <Contents><Key>image1.jpg</Key><Size>1024</Size></Contents>
          <Contents><Key>image2.jpg</Key><Size>2048</Size></Contents>
        </ListBucketResult>`)
    );

    const client = new R2Client('account-id', 'key-id', 'secret', 'test-bucket');
    const keys = await client.listAllKeys();

    expect(keys).toHaveLength(2);
    expect(keys).toContain('image1.jpg');
    expect(keys).toContain('image2.jpg');
  });
});
```

#### 3.5 添加 npm scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

---

### 【第4阶段】日志系统 + CLI 框架（预计 1-2 天）

#### 4.1 安装日志库

```bash
npm install pino pino-pretty
```

#### 4.2 创建 `src/lib/logger.ts`

```typescript
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

export const childLogger = (context: Record<string, unknown>) => logger.child(context);
```

#### 4.3 全局替换 console

在重构的脚本中：
```typescript
import { logger } from '../lib/logger.js';

// 替换 console.log → logger.info
logger.info({ keys: result.length }, 'Fetched all keys');

// 替换 console.error → logger.error
logger.error({ err }, 'R2 operation failed');
```

---

### 【第5阶段】安全 + 文档（持续维护）

#### 5.1 安全改进

```bash
npm install --save-dev \
  npm-audit-resolver \
  safe-eval  # 用于沙箱执行场景
npm install \
  DOMPurify  # HTML 净化（用于博客内容）
```

```typescript
// src/lib/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
  });
}
```

#### 5.2 自动化依赖更新

创建 `.github/renovate.json`：
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:best-practices"],
  "schedule": ["every weekend"],
  "pinDependencies": false,
  "labels": ["dependencies"],
  "prConcurrentLimit": 3,
  "prHourlyLimit": 2,
  "automerge": true,
  "automergeType": "pr",
  "separateMajorMinor": true,
  "separateMinorPatch": true
}
```

#### 5.3 创建架构决策记录 `docs/adr/ADR-001-toolchain.md`

```markdown
# ADR-001: 采用 ESLint + Prettier + Husky 作为代码质量工具链

## 状态
已接受

## 背景
项目目前缺乏统一的代码风格规范和提交规范，导致代码风格不一致。

## 决策
采用以下工具链：
- ESLint + @typescript-eslint 做静态分析
- Prettier 做代码格式化
- Husky + CommitLint 做提交规范
- lint-staged 做 pre-commit 检查

## 后果
- ✅ 统一的代码风格
- ✅ 自动化的格式化和检查
- ✅ 规范化的提交历史
- ⚠️ 需要团队成员适应新规范
```

#### 5.4 创建 `CHANGELOG.md`

```bash
npm install --save-dev @changesets/cli
npx changeset init
```

---

## 📋 完整 CheckList

```
基础设施
  ☐ 初始化 husky: npx husky init
  ☐ 配置 commit-msg hook
  ☐ 添加 .eslintrc.json
  ☐ 添加 .prettierrc
  ☐ 添加 .editorconfig
  ☐ 更新 package.json scripts
  ☐ 添加 lint-staged 到 package.json
  ☐ 安装 zod
  ☐ 安装 pino + pino-pretty
  ☐ 安装 vitest + @vitest/coverage-v8
  ☐ 安装 @changesets/cli

代码重构
  ☐ 创建 src/lib/config.ts（Zod 环境变量）
  ☐ 创建 src/lib/errors.ts（错误类体系）
  ☐ 创建 src/lib/logger.ts（日志系统）
  ☐ 扩展 src/lib/types.ts（领域模型）
  ☐ 重构 src/lib/r2-client.ts（统一错误+日志）
  ☐ 创建 src/lib/sanitize.ts（HTML 净化）

测试
  ☐ 更新 vitest.config.ts
  ☐ 编写 r2-client 签名单元测试
  ☐ 编写 errors 单元测试
  ☐ 编写 config 验证测试
  ☐ 编写 workflow-result 单元测试
  ☐ 添加集成测试（Mock R2）
  ☐ 确保覆盖率 ≥ 80%

文档
  ☐ 创建 docs/adr/ 目录
  ☐ 编写 ADR-001（工具链）
  ☐ 初始化 @changesets/cli
  ☐ 创建 docs/ARCHITECTURE.md
  ☐ 更新 README.md（徽章）

CI/CD
  ☐ 创建 .github/workflows/quality.yml
  ☐ 添加 npm audit 到 CI
  ☐ 添加 renovate.json
  ☐ 合并小 workflow 为 quality workflow
```

---

## ⏱️ 时间估算

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| 第1阶段 | 规范化工具链 | 1-2 天 |
| 第2阶段 | 类型安全增强 | 2-3 天 |
| 第3阶段 | 测试覆盖率提升 | 2-3 天 |
| 第4阶段 | 日志系统 + CLI | 1-2 天 |
| 第5阶段 | 安全 + 文档 | 持续 |
| **合计** | | **6-10 天** |

---

## 🎯 验收标准

- ✅ ESLint + Prettier 检查通过率 100%
- ✅ 所有 `console.log` / `console.error` 替换为结构化日志
- ✅ 测试覆盖率 ≥ 80%
- ✅ CI 中 lint + typecheck + test 全部通过
- ✅ Commit message 100% 符合 Conventional Commits
- ✅ 环境变量缺失时启动即报错（而非运行时）
- ✅ 每项 ADR 均有记录
