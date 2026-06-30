// config.ts — Zod 环境变量 Schema 校验
import { z } from 'zod';

const EnvSchema = z.object({
  // R2 必需
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
  R2_KEY_ID: z.string().min(1, 'R2_KEY_ID is required'),
  R2_SECRET_KEY: z.string().min(1, 'R2_SECRET_KEY is required'),

  // R2 可选（含默认值）
  R2_HOMEPAGE_BUCKET: z.string().default('homepage-bg'),
  R2_STATIC_BUCKET: z.string().default('songdaochuanshu-static'),

  // AI API（可选）
  ZHIPU_API_KEY: z.string().optional(),

  // 邮件（可选）
  RESEND_API_KEY: z.string().optional(),
  NOTIFY_EMAIL: z.string().optional(),

  // Cloudflare（可选）
  CF_API_TOKEN: z.string().optional(),
  CF_ACCOUNT_ID: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let _cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (_cachedEnv) return _cachedEnv;

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`);
    throw new Error(`\u274c \u73af\u5883\u53d8\u91cf\u9a8c\u8bc1\u5931\u8d25:\n${errors.join('\n')}`);
  }

  _cachedEnv = result.data;
  return _cachedEnv;
}

export const env = loadEnv();
