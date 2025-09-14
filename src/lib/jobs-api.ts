import { getAuthHeader } from './auth-token';

export interface Job {
  id: string;
  youtubeUrl: string;
  status: 'queued' | 'active' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  neededMinutes: number;
  targetDuration?: string;
  error?: string;
}

// Simple wrapper matching the Landing hero usage
export async function enqueueFromUrl(
  url: string,
  getToken?: () => Promise<string | null>
) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeader(getToken)),
  } as Record<string, string>;

  const resp = await fetch('https://qibjqqucmbrtuirysexl.functions.supabase.co/enqueue-pipeline', {
    method: 'POST',
    headers,
    body: JSON.stringify({ youtubeUrl: url, neededMinutes: 10 }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error((data && (data.error || data.message)) || 'Failed to enqueue pipeline');
  }
  // Normalize return shape to { jobId }
  const jobId = (data as any)?.jobId || (data as any)?.id;
  return { jobId };
}

export async function enqueuePipeline(
  youtubeUrl: string, 
  neededMinutes: number,
  targetDuration: string,
  getToken?: () => Promise<string | null>
) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeader(getToken)),
  } as Record<string, string>;

  const resp = await fetch('https://qibjqqucmbrtuirysexl.functions.supabase.co/enqueue-pipeline', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      youtubeUrl,
      neededMinutes,
      meta: { targetDuration }
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error((data && (data.error || data.message)) || 'Failed to enqueue pipeline');
  }

  return data;
}

export async function getJobStatus(
  jobId: string,
  getToken?: () => Promise<string | null>
): Promise<Job> {
  const headers = await getAuthHeader(getToken);
  
  const response = await fetch(
    `https://qibjqqucmbrtuirysexl.functions.supabase.co/job-status?id=${jobId}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error('Failed to get job status');
  }

  return await response.json();
}
