import { getBackendUrl } from './backend-url';

const BASE_URL = getBackendUrl();

async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();

  if (!res.ok) {
    let message = `API ${method} ${path} failed: ${res.status}`;

    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.message === 'string' && parsed.message.trim()) {
          message = parsed.message;
        }
      } catch {
        message = `${message} - ${text}`;
      }
    }

    throw new Error(message);
  }

  if (!text) {
    return null as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: any) => request<T>('POST', path, body),
  patch: <T = any>(path: string, body?: any) => request<T>('PATCH', path, body),
  delete: <T = any>(path: string) => request<T>('DELETE', path),
};
