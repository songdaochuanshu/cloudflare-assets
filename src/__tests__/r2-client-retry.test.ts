import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.R2_ACCOUNT_ID = 'acc';
  process.env.R2_KEY_ID = 'kid';
  process.env.R2_SECRET_KEY = 'sec';
  process.env.R2_HOMEPAGE_BUCKET = 'bucket';
});

import { listAllKeys, uploadToR2, deleteObject } from '../lib/r2-client.js';

function makeResp(over: Partial<Response> & { status: number }): Response {
  const base = {
    ok: over.status >= 200 && over.status < 300,
    text: async () => '',
    json: async () => ({}),
  };
  return { ...base, ...over } as unknown as Response;
}

describe('r2-client × retry 集成', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('listAllKeys 在 5xx 后最终成功（重试一次）', async () => {
    const okXml = '<?xml version="1.0"?><ListBucketResult><Key>a.jpg</Key></ListBucketResult>';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResp({ status: 503 }))
      .mockResolvedValueOnce(makeResp({ status: 200, text: async () => okXml }));
    vi.stubGlobal('fetch', fetchMock);

    const keys = await listAllKeys();
    expect(keys).toEqual(['a.jpg']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('listAllKeys 在 429 后重试（429 也可重试）', async () => {
    const okXml = '<?xml version="1.0"?><ListBucketResult><Key>a.jpg</Key></ListBucketResult>';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResp({ status: 429 }))
      .mockResolvedValueOnce(makeResp({ status: 200, text: async () => okXml }));
    vi.stubGlobal('fetch', fetchMock);

    const keys = await listAllKeys();
    expect(keys).toEqual(['a.jpg']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('listAllKeys 在 4xx（除 429）不重试', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(makeResp({ status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listAllKeys()).rejects.toThrow('HTTP 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('listAllKeys 在 5xx 重试耗尽后抛 R2Error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(makeResp({ status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listAllKeys()).rejects.toThrow('HTTP 500');
    // maxAttempts 默认 3：原始 + 2 次重试
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('uploadToR2 在 5xx 后重试到 200', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResp({ status: 502 }))
      .mockResolvedValueOnce(makeResp({ status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const ok = await uploadToR2('k.jpg', Buffer.from('x'));
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deleteObject 在 4xx 不重试', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(makeResp({ status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteObject('missing.jpg')).rejects.toThrow('HTTP 404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
