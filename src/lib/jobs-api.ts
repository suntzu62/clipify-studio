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
  result?: {
    texts?: {
      titles?: string[];
      descriptions?: string[];
      hashtags?: string[];
    };
    previewUrl?: string;
    downloadUrl?: string;
    thumbnailUrl?: string;
    scenes?: any[];
  };
}

// Simple wrapper matching the Landing hero usage
export async function enqueueFromUrl(
  url: string,
  getToken?: () => Promise<string | null>
) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpYmpxcXVjbWJydHVpcnlzZXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2Mzg3OTYsImV4cCI6MjA3MjIxNDc5Nn0.afpoQtOXH62pi5LuC8lOXPmxnx71Nn3BJBXXtVzp3Os',
    ...(await getAuthHeader(getToken)),
  } as Record<string, string>;

  const resp = await fetch('https://qibjqqucmbrtuirysexl.supabase.co/functions/v1/enqueue-pipeline', {
    method: 'POST',
    headers,
    body: JSON.stringify({ youtubeUrl: url, neededMinutes: 10 }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to enqueue pipeline';
    throw new Error(`enqueue-pipeline failed: ${resp.status} ${resp.statusText} - ${msg}`);
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
    apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpYmpxcXVjbWJydHVpcnlzZXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2Mzg3OTYsImV4cCI6MjA3MjIxNDc5Nn0.afpoQtOXH62pi5LuC8lOXPmxnx71Nn3BJBXXtVzp3Os',
    ...(await getAuthHeader(getToken)),
  } as Record<string, string>;

  const resp = await fetch('https://qibjqqucmbrtuirysexl.supabase.co/functions/v1/enqueue-pipeline', {
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
    const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to enqueue pipeline';
    throw new Error(`enqueue-pipeline failed: ${resp.status} ${resp.statusText} - ${msg}`);
  }

  return data;
}

export async function getJobStatus(
  jobId: string,
  getToken?: () => Promise<string | null>
): Promise<Job> {
  const headers = {
    ...(await getAuthHeader(getToken)),
    apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpYmpxcXVjbWJydHVpcnlzZXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2Mzg3OTYsImV4cCI6MjA3MjIxNDc5Nn0.afpoQtOXH62pi5LuC8lOXPmxnx71Nn3BJBXXtVzp3Os',
  } as Record<string, string>;
  
  const response = await fetch(
    `https://qibjqqucmbrtuirysexl.supabase.co/functions/v1/job-status?id=${jobId}`,
    { headers }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`job-status failed: ${response.status} ${response.statusText} - ${text}`);
  }

  return await response.json();
}
