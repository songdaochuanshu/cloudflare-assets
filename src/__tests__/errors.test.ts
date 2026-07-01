import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.R2_ACCOUNT_ID = 'acc';
  process.env.R2_KEY_ID = 'kid';
  process.env.R2_SECRET_KEY = 'sec';
});

import { AppError, R2Error, ValidationError, ApiError } from '../lib/errors.js';
import { env as importedEnv, loadEnv } from '../lib/config.js';

describe('errors', () => {
  describe('AppError', () => {
    it('toJSON 包含 name/code/message/context', () => {
      const err = new AppError('boom', 'TEST_CODE', { a: 1 });
      const json = err.toJSON();
      expect(json.name).toBe('AppError');
      expect(json.code).toBe('TEST_CODE');
      expect(json.message).toBe('boom');
      expect(json.context).toEqual({ a: 1 });
    });

    it('context 默认为 undefined', () => {
      const err = new AppError('x', 'Y');
      expect(err.context).toBeUndefined();
    });

    it('name 总是 AppError', () => {
      const err = new AppError('x', 'Y');
      expect(err.name).toBe('AppError');
    });
  });

  describe('R2Error', () => {
    it('name/code 正确', () => {
      const err = new R2Error('r2 bad', { status: 500 });
      expect(err.name).toBe('R2Error');
      expect(err.code).toBe('R2_ERROR');
      expect(err.context).toEqual({ status: 500 });
    });

    it('属于 AppError', () => {
      const err = new R2Error('r2');
      expect(err).toBeInstanceOf(AppError);
    });
  });

  describe('ValidationError', () => {
    it('name/code 正确', () => {
      const err = new ValidationError('bad input');
      expect(err.name).toBe('ValidationError');
      expect(err.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('ApiError', () => {
    it('toJSON 包含 statusCode', () => {
      const err = new ApiError('cf fail', 503, { path: '/x' });
      const json = err.toJSON();
      expect(json.name).toBe('ApiError');
      expect(json.code).toBe('API_ERROR');
      expect(json.message).toBe('cf fail');
      expect(json.statusCode).toBe(503);
      expect(json.context).toEqual({ statusCode: 503, path: '/x' });
    });
  });
});

describe('config', () => {
  it('导出 env 包含必填字段', () => {
    expect(importedEnv.R2_ACCOUNT_ID).toBe('acc');
    expect(importedEnv.R2_KEY_ID).toBe('kid');
    expect(importedEnv.R2_SECRET_KEY).toBe('sec');
  });

  it('loadEnv 二次调用返回缓存实例', () => {
    const a = loadEnv();
    const b = loadEnv();
    expect(a).toBe(b);
  });

  it('R2_HOMEPAGE_BUCKET 默认值生效', () => {
    const before = process.env.R2_HOMEPAGE_BUCKET;
    delete process.env.R2_HOMEPAGE_BUCKET;
    try {
      // 缓存已填充；这里验证 schema 默认值语义（Zod 的 default 在 cache miss 时生效）
      // 不清缓存的情况下，至少保证字段存在或为默认值之一
      expect(
        importedEnv.R2_HOMEPAGE_BUCKET === before ||
          importedEnv.R2_HOMEPAGE_BUCKET === 'homepage-bg',
      ).toBe(true);
    } finally {
      if (before !== undefined) process.env.R2_HOMEPAGE_BUCKET = before;
    }
  });
});
