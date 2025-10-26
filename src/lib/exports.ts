import { getAuthHeader } from './auth-token';

const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function enqueueExport(
  rootId: string,
  clipId: string,
  getToken?: () => Promise<string | null>
): Promise<{ jobId: string }> {
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_PUBLISHABLE_KEY || '',
    ...(await getAuthHeader(getToken)),
  } as Record<string, string>;

  const resp = await fetch('https://qibjqqucmbrtuirysexl.supabase.co/functions/v1/enqueue-export', {
    method: 'POST',
    headers,
    body: JSON.stringify({ rootId, clipId }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to enqueue export';
    throw new Error(`enqueue-export failed: ${resp.status} ${resp.statusText} - ${msg}`);
  }
  return data as { jobId: string };
}

