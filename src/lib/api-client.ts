import { getBackendUrl } from './backend-url';

const BASE_URL = getBackendUrl();

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  get isRateLimit() {
    return this.status === 429;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isLimitExceeded() {
    return this.code === 'LIMIT_EXCEEDED';
  }

  get isNotFound() {
    return this.status === 404;
  }

  /** User-facing message in Portuguese based on status/code */
  get userMessage(): string {
    if (this.isRateLimit) return 'Muitas requisições. Aguarde alguns segundos e tente novamente.';
    if (this.isLimitExceeded) return 'Você atingiu o limite do seu plano. Faça upgrade para continuar.';
    if (this.isUnauthorized) return 'Sessão expirada. Faça login novamente.';
    if (this.isNotFound) return 'Recurso não encontrado.';
    if (this.status >= 500) return 'Erro no servidor. Tente novamente em instantes.';
    return this.message;
  }
}

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
    let code = 'UNKNOWN_ERROR';

    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.message === 'string' && parsed.message.trim()) {
          message = parsed.message;
        }
        if (typeof parsed?.error === 'string' && parsed.error.trim()) {
          code = parsed.error;
        }
      } catch {
        message = `${message} - ${text}`;
      }
    }

    throw new ApiError(res.status, code, message);
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
