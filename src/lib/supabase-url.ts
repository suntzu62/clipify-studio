const DEFAULT_SUPABASE_URL = 'https://qibjqqucmbrtuirysexl.supabase.co';

function ensureProtocol(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

export function getSupabaseUrl(): string {
  const raw = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  if (!raw) return DEFAULT_SUPABASE_URL;

  // Corrige typo conhecido visto em produção: "...irvsexl..." -> "...irysexl..."
  const corrected = raw.replace('qibjqqucmbrtuirvsexl', 'qibjqqucmbrtuirysexl');
  const withProtocol = ensureProtocol(corrected).replace(/\/+$/, '');

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname.endsWith('.supabase.co')) return DEFAULT_SUPABASE_URL;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_SUPABASE_URL;
  }
}

