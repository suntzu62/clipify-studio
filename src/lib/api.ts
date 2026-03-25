import { getBackendUrl } from '@/lib/backend-url';

export async function invokeFn<T = any>(
  name: string,
  opts: { method?: 'GET' | 'POST'; body?: any; headers?: Record<string, string> } = {}
): Promise<T> {
  const { method = 'POST', body, headers = {} } = opts;
  const backendUrl = getBackendUrl();
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(import.meta.env.DEV && import.meta.env.VITE_API_KEY
      ? { 'x-api-key': import.meta.env.VITE_API_KEY }
      : {}),
    ...headers,
  };

  const response = await fetch(`${backendUrl}/${name}`, {
    method,
    headers: requestHeaders,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (data && ((data as any).message || (data as any).error)) ||
      response.statusText ||
      `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}
