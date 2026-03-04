const FALLBACK_BACKEND_URL = 'http://localhost:3001';

export function getBackendUrl(): string {
  const raw = (import.meta.env.VITE_BACKEND_URL || FALLBACK_BACKEND_URL).trim();

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/+$/, '');
  }

  return `https://${raw.replace(/\/+$/, '')}`;
}

