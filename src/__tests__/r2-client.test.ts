import { vi, describe, it, expect, beforeEach } from 'vitest';

// 在 import r2-client 前设置 env（r2-client 模块加载时调 requireEnv）
vi.hoisted(() => {
  process.env.R2_ACCOUNT_ID = 'test_account_id';
  process.env.R2_KEY_ID = 'test_key_id';
  process.env.R2_SECRET_KEY = 'test_secret_key';
  process.env.R2_HOMEPAGE_BUCKET = 'test-bucket';
});

import {
  formatDate,
  getSignatureKey,
  signRequest,
  listAllKeys,
  uploadToR2,
  deleteObject,
  emptyPayloadHash,
  host,
} from '../lib/r2-client.js';

// 工具：从 mock 中拿到 fetch 调用 URL（vi.fn 未指定签名时类型是 []，用 String() 兜底）
function getFetchedUrl(mock: ReturnType<typeof vi.fn>): string {
  const firstCall = mock.mock.calls[0];
  return String(firstCall?.[0] ?? '');
}

describe('r2-client', () => {
  describe('纯函数（无网络）', () => {
    it('emptyPayloadHash 正确（空字符串 SHA256）', () => {
      expect(emptyPayloadHash).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });

    it('host 拼接正确', () => {
      expect(host).toBe('test-bucket.test_account_id.r2.cloudflarestorage.com');
    });

    it('formatDate 输出 AWS 格式（无连字符、无冒号）', () => {
      const d = new Date('2026-06-30T12:00:00.000Z');
      const formatted = formatDate(d);
      expect(formatted).not.toContain('-');
      expect(formatted).not.toContain(':');
      expect(formatted).toMatch(/^\d{8}T\d{6}Z$/);
    });

    it('getSignatureKey 返回 Buffer 且长度 32', () => {
      const key = getSignatureKey('test_secret', '20260630');
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('getSignatureKey 对相同输入返回相同输出（确定性）', () => {
      const a = getSignatureKey('secret', '20260630');
      const b = getSignatureKey('secret', '20260630');
      expect(a.equals(b)).toBe(true);
    });

    it('getSignatureKey 对不同日期返回不同输出', () => {
      const a = getSignatureKey('secret', '20260630');
      const b = getSignatureKey('secret', '20260701');
      expect(a.equals(b)).toBe(false);
    });

    it('signRequest 返回的 authorization 包含必要字段', () => {
      const result = signRequest(
        'GET',
        '/',
        '',
        emptyPayloadHash,
        new Date('2026-06-30T12:00:00.000Z'),
      );
      expect(result.authorization).toContain('AWS4-HMAC-SHA256');
      expect(result.authorization).toContain('Credential=test_key_id/');
      expect(result.authorization).toContain('SignedHeaders=');
      expect(result.authorization).toContain('Signature=');
      expect(result.amzDate).toMatch(/^\d{8}T\d{6}Z$/);
    });

    it('signRequest 带 extraHeaders 时 SignedHeaders 包含对应 header', () => {
      const result = signRequest(
        'PUT',
        '/test.jpg',
        '',
        emptyPayloadHash,
        new Date('2026-06-30T12:00:00.000Z'),
        { 'content-type': 'image/jpeg' },
      );
      expect(result.authorization).toContain('content-type');
    });
  });

  describe('网络操作（mock fetch）', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('listAllKeys 解析 XML 提取所有 Key', async () => {
      const xml = `<?xml version="1.0"?>
        <ListBucketResult>
          <Key>normal/1.jpg</Key>
          <Key>normal/2.jpg</Key>
          <Key>r18/3.jpg</Key>
        </ListBucketResult>`;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          status: 200,
          text: async () => xml,
        })),
      );

      const keys = await listAllKeys();
      expect(keys).toEqual(['normal/1.jpg', 'normal/2.jpg', 'r18/3.jpg']);
    });

    it('listAllKeys 在 IsTruncated=false 时停止', async () => {
      const xml = `<?xml version="1.0"?>
        <ListBucketResult>
          <Key>a.jpg</Key>
          <IsTruncated>false</IsTruncated>
        </ListBucketResult>`;
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => xml,
      }));
      vi.stubGlobal('fetch', fetchMock);

      await listAllKeys();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('listAllKeys 在 HTTP 失败时抛出 R2Error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 500,
          text: async () => 'error',
        })),
      );

      await expect(listAllKeys()).rejects.toThrow('R2 list failed: HTTP 500');
    });

    it('listAllKeys 支持 prefix 参数', async () => {
      const xml = `<?xml version="1.0"?>
        <ListBucketResult>
          <Key>r18/1.jpg</Key>
        </ListBucketResult>`;
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => xml,
      }));
      vi.stubGlobal('fetch', fetchMock);

      await listAllKeys('r18/');
      expect(getFetchedUrl(fetchMock)).toContain('prefix=r18%2F');
    });

    it('uploadToR2 成功时返回 true', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          status: 200,
          text: async () => '',
        })),
      );

      const result = await uploadToR2('test.jpg', Buffer.from('fake'), {
        contentType: 'image/jpeg',
      });
      expect(result).toBe(true);
    });

    it('uploadToR2 失败时抛出 R2Error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 403,
          text: async () => 'forbidden',
        })),
      );

      await expect(uploadToR2('test.jpg', Buffer.from('fake'))).rejects.toThrow(
        'R2 PUT failed: HTTP 403',
      );
    });

    it('deleteObject 在 200/204 都返回 true', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          status: 204,
        })),
      );

      const result = await deleteObject('test.jpg');
      expect(result).toBe(true);
    });

    it('deleteObject 在 404 抛出 R2Error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 404,
        })),
      );

      await expect(deleteObject('missing.jpg')).rejects.toThrow('R2 DELETE failed: HTTP 404');
    });

    it('deleteObject 对 key 做 URL 编码', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 204,
      }));
      vi.stubGlobal('fetch', fetchMock);

      await deleteObject('path/with space/file.jpg');
      expect(getFetchedUrl(fetchMock)).toContain('path/with%20space/file.jpg');
    });
  });
});
