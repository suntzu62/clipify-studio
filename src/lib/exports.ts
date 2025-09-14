import { getAuthHeader } from './auth-token';

export async function enqueueExport(
  rootId: string,
  clipId: string,
  getToken?: () => Promise<string | null>
): Promise<{ jobId: string }> {
  const headers = {
    'Content-Type': 'application/json',
    apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpYmpxcXVjbWJydHVpcnlzZXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2Mzg3OTYsImV4cCI6MjA3MjIxNDc5Nn0.afpoQtOXH62pi5LuC8lOXPmxnx71Nn3BJBXXtVzp3Os',
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

