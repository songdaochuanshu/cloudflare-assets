export interface FetchRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  timeoutMs?: number;
  idempotent?: boolean;
  retryOnStatus?: (_status: number) => boolean;
  retryOnError?: (_err: unknown) => boolean;
  onRetry?: (_info: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    reason: string;
  }) => void;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isIdempotentMethod(method: string): boolean {
  return ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'].includes(method.toUpperCase());
}

function defaultRetryOnStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function defaultRetryOnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { name?: string; code?: unknown };
  if (anyErr.name === 'AbortError') return true;
  if (anyErr.code && typeof anyErr.code === 'string') {
    return [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'ENOTFOUND',
      'EPIPE',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
      'UND_ERR_SOCKET',
    ].includes(anyErr.code);
  }
  return err instanceof TypeError;
}

function computeDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number,
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
  const jitter = exp * jitterRatio;
  const randomized = exp + (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(randomized));
}

async function cancelResponseBody(resp: Response): Promise<void> {
  const body = resp.body as unknown as { cancel?: () => Promise<void> | void } | null;
  if (!body?.cancel) return;
  try {
    await body.cancel();
  } catch {
    return;
  }
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const idempotent = options.idempotent ?? isIdempotentMethod(method);
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 2000;
  const jitterRatio = options.jitterRatio ?? 0.2;
  const timeoutMs = options.timeoutMs ?? 15000;
  const retryOnStatus = options.retryOnStatus ?? defaultRetryOnStatus;
  const retryOnError = options.retryOnError ?? defaultRetryOnError;
  const onRetry = options.onRetry;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(input, { ...init, method, signal });
      if (timeoutId) clearTimeout(timeoutId);

      if (idempotent && attempt < maxAttempts && retryOnStatus(resp.status)) {
        await cancelResponseBody(resp);
        const delayMs = computeDelayMs(attempt, baseDelayMs, maxDelayMs, jitterRatio);
        onRetry?.({ attempt, maxAttempts, delayMs, reason: `HTTP ${resp.status}` });
        await sleep(delayMs);
        continue;
      }

      return resp;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = err;

      if (!idempotent || attempt >= maxAttempts || !retryOnError(err)) {
        throw err;
      }

      const delayMs = computeDelayMs(attempt, baseDelayMs, maxDelayMs, jitterRatio);
      onRetry?.({
        attempt,
        maxAttempts,
        delayMs,
        reason: err instanceof Error ? err.message : 'fetch error',
      });
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('fetchWithRetry failed');
}
