import { getAuthHeader } from './auth-token';

export async function enqueueExport(
  rootId: string,
  clipId: string,
  getToken?: () => Promise<string | null>
): Promise<{ jobId: string }> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeader(getToken)),
  } as Record<string, string>;

  const resp = await fetch('https://qibjqqucmbrtuirysexl.functions.supabase.co/enqueue-export', {
    method: 'POST',
    headers,
    body: JSON.stringify({ rootId, clipId }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error((data && (data.error || data.message)) || 'Failed to enqueue export');
  }
  return data as { jobId: string };
}

