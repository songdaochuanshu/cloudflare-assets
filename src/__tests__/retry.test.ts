import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '../lib/retry.js';

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('在 5xx 时重试并最终返回成功响应', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('fail', { status: 500 }))
      .mockResolvedValueOnce(new Response('fail2', { status: 502 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const p = fetchWithRetry('https://example.com');
    await vi.runAllTimersAsync();
    const resp = await p;

    expect(resp.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('在 429 时重试并最终返回成功响应', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const p = fetchWithRetry('https://example.com');
    await vi.runAllTimersAsync();
    const resp = await p;

    expect(resp.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('在 4xx（非 429）不重试', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const resp = await fetchWithRetry('https://example.com');
    expect(resp.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('在网络错误时重试并最终成功', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const p = fetchWithRetry('https://example.com');
    await vi.runAllTimersAsync();
    const resp = await p;

    expect(resp.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('默认不对非幂等方法重试', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('fail', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const p = fetchWithRetry('https://example.com', { method: 'POST' });
    await vi.runAllTimersAsync();
    const resp = await p;

    expect(resp.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
