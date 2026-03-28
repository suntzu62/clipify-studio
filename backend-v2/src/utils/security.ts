import path from 'path';

const SAFE_IDENTIFIER_REGEX = /^[A-Za-z0-9_-]{1,128}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export function normalizeOrigin(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

export function getRequestOrigin(origin?: string | null, referer?: string | null): string | null {
  return normalizeOrigin(origin) || normalizeOrigin(referer);
}

export function isAllowedOrigin(origin: string | null, allowedOrigins: readonly string[]): boolean {
  if (!origin) {
    return false;
  }

  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }

  return allowedOrigins.some((candidate) => normalizeOrigin(candidate) === normalized);
}

export function isMutationMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

export function isSafeIdentifier(value: string, maxLength: number = 128): boolean {
  return value.length > 0 && value.length <= maxLength && SAFE_IDENTIFIER_REGEX.test(value);
}

export function isValidYouTubeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();

    if (!YOUTUBE_HOSTS.has(hostname)) {
      return false;
    }

    if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
      return /^\/[A-Za-z0-9_-]{11}$/.test(url.pathname);
    }

    if (url.pathname === '/watch') {
      return /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get('v') || '');
    }

    if (url.pathname.startsWith('/shorts/')) {
      return /^\/shorts\/[A-Za-z0-9_-]{11}$/.test(url.pathname);
    }

    if (url.pathname.startsWith('/embed/')) {
      return /^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname);
    }

    return false;
  } catch {
    return false;
  }
}

export function normalizeStoragePath(rawPath: string): string | null {
  if (!rawPath || rawPath.includes('\0') || rawPath.length > 512) {
    return null;
  }

  const normalized = path.posix.normalize(rawPath.replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('..') || normalized.includes('/../') || normalized === '..') {
    return null;
  }

  return normalized;
}

export function isUserOwnedUploadPath(storagePath: string, userId: string): boolean {
  const normalized = normalizeStoragePath(storagePath);
  return Boolean(normalized && normalized.startsWith(`uploads/${userId}/`));
}

export function isSafeMediaFilename(filename: string): boolean {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.length > 255) {
    return false;
  }

  return /^[A-Za-z0-9._-]+\.(mp4|jpg|jpeg)$/i.test(filename);
}

export function sanitizeStorageFilename(fileName: string): string {
  const baseName = fileName
    .split(/[\\/]/)
    .pop()
    ?.normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return baseName && baseName.length > 0 ? baseName.slice(0, 120) : 'upload.mp4';
}
