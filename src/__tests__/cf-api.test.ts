import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.CF_ACCOUNT_ID = 'cf-acc';
  process.env.CF_API_TOKEN = 'cf-token';
});

import { listR2Domains, removeR2Domain, listZones } from '../lib/cf-api.js';

function makeResp(over: { status: number; body?: string; contentType?: string }): Response {
  const { status, body = '', contentType = 'application/json' } = over;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    text: async () => body,
    json: async () => JSON.parse(body || '{}'),
  } as unknown as Response;
}

describe('cf-api × retry 集成', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('listR2Domains 解析 result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        makeResp({
          status: 200,
          body: JSON.stringify({ success: true, errors: [], result: [{ domain: 'a' }] }),
        }),
      ),
    );
    const res = await listR2Domains('bucket');
    expect(res).toEqual([{ domain: 'a' }]);
  });

  it('listR2Domains 在 4xx 不重试（云控错信息不抛吞）', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResp({
        status: 403,
        body: JSON.stringify({
          success: false,
          errors: [{ code: 1, message: 'forbidden' }],
          result: null,
        }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(listR2Domains('b')).rejects.toThrow(/HTTP 403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('listR2Domains 在 5xx 后重试到 200', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResp({ status: 500, body: 'fail' }))
      .mockResolvedValueOnce(
        makeResp({ status: 200, body: JSON.stringify({ success: true, errors: [], result: [] }) }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const res = await listR2Domains('b');
    expect(res).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('removeR2Domain 在 429 后重试', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResp({ status: 429, body: 'throttle' }))
      .mockResolvedValueOnce(
        makeResp({
          status: 200,
          body: JSON.stringify({ success: true, errors: [], result: null }),
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await removeR2Domain('b', 'd.example.com');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('listZones 成功返回 result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        makeResp({
          status: 200,
          body: JSON.stringify({
            success: true,
            errors: [],
            result: [{ id: 'z1', name: 'x.cloud', status: 'active' }],
          }),
        }),
      ),
    );
    const res = await listZones();
    expect(res).toEqual([{ id: 'z1', name: 'x.cloud', status: 'active' }]);
  });
});
