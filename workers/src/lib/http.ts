export type HttpFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
  retries?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function httpFetch<T = any>(url: string, opts: HttpFetchOptions = {}): Promise<{ status: number; data: T; headers: Headers }>
{
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 15_000,
    retries = 3,
    backoffBaseMs = 500,
    backoffMaxMs = 10_000,
  } = opts;

  let attempt = 0;
  let lastErr: any = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal } as any);
      clearTimeout(timer);
      if (res.status >= 200 && res.status < 300) {
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json() : (await res.text()) as any;
        return { status: res.status, data: data as T, headers: res.headers };
      }
      // Retry on 429 and 5xx
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }

    attempt++;
    if (attempt > retries) break;
    const jitter = Math.random() * 100;
    const delay = Math.min(backoffMaxMs, backoffBaseMs * 2 ** (attempt - 1)) + jitter;
    await sleep(delay);
  }

  throw lastErr || new Error('httpFetch failed');
}

