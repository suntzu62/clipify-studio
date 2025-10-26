import { getAuthHeader } from './auth-token';

const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_PUBLISHABLE_KEY) {
  console.error('[jobs-api] VITE_SUPABASE_PUBLISHABLE_KEY not configured');
}

export interface Job {
  id: string;
  status: 'queued' | 'active' | 'waiting-children' | 'completed' | 'failed';
  progress: number;
  // VideoSource fields
  youtubeUrl?: string;
  storagePath?: string;
  fileName?: string;
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
    clips?: Array<{
      id: string;
      title: string;
      description: string;
      hashtags: string[];
      previewUrl?: string;
      downloadUrl?: string;
      thumbnailUrl?: string;
      duration: number;
      status: 'processing' | 'ready' | 'failed';
    }>;
    previewUrl?: string;
    downloadUrl?: string;
    thumbnailUrl?: string;
    scenes?: any[];
    metadata?: {
      title?: string;
      thumbnail?: string;
      channel?: string;
      duration?: string;
    };
  };
  pipelineStatus?: {
    originalStatus: string;
    derivedStatus: string;
    stage: string;
    stageDetails: {
      hasSource: boolean;
      hasTranscript: boolean;
      hasScenes: boolean;
      hasRank: boolean;
      hasRender: boolean;
      hasTexts: boolean;
      clipCount: number;
    };
    isStalled: boolean;
    isCompleted: boolean;
    isFailed: boolean;
    clipCount: number;
    hasTexts: boolean;
  };
  workerHealth?: {
    isHealthy: boolean;
    healthData?: any;
    detailedStatus?: any;
    error?: string;
    workerBaseUrl?: string;
    timestamp: string;
  };
}

// Simple wrapper matching the Landing hero usage
export async function enqueueFromUrl(
  url: string,
  getToken?: () => Promise<string | null>
) {
  // Use local workers API only in development with explicit envs
  const useLocalAPI = import.meta.env.DEV &&
    Boolean(import.meta.env.VITE_WORKERS_API_URL && import.meta.env.VITE_WORKERS_API_KEY);
  
  if (useLocalAPI) {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_WORKERS_API_KEY,
    } as Record<string, string>;

    const resp = await fetch(`${import.meta.env.VITE_WORKERS_API_URL}/api/jobs/pipeline`, {
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
  } else {
    // Production: use Supabase functions
    const headers = {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY || '',
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
}

export async function enqueuePipeline(
  youtubeUrl: string, 
  neededMinutes: number,
  targetDuration: string,
  getToken?: () => Promise<string | null>
) {
  // Edge function transforma entrada no novo formato JobData
  // Use local workers API only in development with explicit envs
  const useLocalAPI = import.meta.env.DEV &&
    Boolean(import.meta.env.VITE_WORKERS_API_URL && import.meta.env.VITE_WORKERS_API_KEY);
  
  if (useLocalAPI) {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_WORKERS_API_KEY,
    } as Record<string, string>;

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount <= maxRetries) {
      try {
        const resp = await fetch(`${import.meta.env.VITE_WORKERS_API_URL}/api/jobs/pipeline`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            youtubeUrl,
            neededMinutes,
            targetDuration,
            meta: { targetDuration }
          }),
        });

        const data = await resp.json().catch(() => ({}));
        
        if (resp.ok) {
          return data;
        }

        // Handle 429 errors with exponential backoff
        if (resp.status === 429) {
          if (retryCount === maxRetries) {
            const isUserLimit = (data as any)?.error === 'user_rate_limit_exceeded';
            const msg = isUserLimit 
              ? 'Você atingiu o limite de 10 projetos por hora. Tente novamente em alguns minutos.'
              : 'Sistema temporariamente sobrecarregado. Tente novamente em alguns minutos.';
            throw new Error(msg);
          }
          
          // Exponential backoff: 2s, 6s, 18s
          const delay = Math.pow(3, retryCount) * 2000;
          await new Promise(resolve => setTimeout(resolve, delay));
          retryCount++;
          continue;
        }

        // For other errors, throw immediately
        const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to enqueue pipeline';
        throw new Error(`enqueue-pipeline failed: ${resp.status} ${resp.statusText} - ${msg}`);
        
      } catch (error) {
        if (retryCount === maxRetries || !(error instanceof Error && error.message.includes('429'))) {
          throw error;
        }
        retryCount++;
      }
    }

    throw new Error('Max retries exceeded');
  } else {
    // Production: use Supabase functions
    const headers = {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY || '',
      ...(await getAuthHeader(getToken)),
    } as Record<string, string>;

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount <= maxRetries) {
      try {
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
        
        if (resp.ok) {
          return data;
        }

        // Handle 429 errors with exponential backoff
        if (resp.status === 429) {
          if (retryCount === maxRetries) {
            const isUserLimit = (data as any)?.error === 'user_rate_limit_exceeded';
            const msg = isUserLimit 
              ? 'Você atingiu o limite de 10 projetos por hora. Tente novamente em alguns minutos.'
              : 'Sistema temporariamente sobrecarregado. Tente novamente em alguns minutos.';
            throw new Error(msg);
          }
          
          // Exponential backoff: 2s, 6s, 18s
          const delay = Math.pow(3, retryCount) * 2000;
          await new Promise(resolve => setTimeout(resolve, delay));
          retryCount++;
          continue;
        }

        // For other errors, throw immediately
        const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to enqueue pipeline';
        throw new Error(`enqueue-pipeline failed: ${resp.status} ${resp.statusText} - ${msg}`);
        
      } catch (error) {
        if (retryCount === maxRetries || !(error instanceof Error && error.message.includes('429'))) {
          throw error;
        }
        retryCount++;
      }
    }

    throw new Error('Max retries exceeded');
  }
}

export async function getJobStatus(
  jobId: string,
  getToken?: () => Promise<string | null>
): Promise<Job> {
  // Use local workers API only in development with explicit envs
  const useLocalAPI = import.meta.env.DEV &&
    Boolean(import.meta.env.VITE_WORKERS_API_URL && import.meta.env.VITE_WORKERS_API_KEY);
  
  if (useLocalAPI) {
    const headers = {
      'x-api-key': import.meta.env.VITE_WORKERS_API_KEY,
    } as Record<string, string>;
    
    const response = await fetch(
      `${import.meta.env.VITE_WORKERS_API_URL}/api/jobs/${jobId}/status`,
      { headers }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`job-status failed: ${response.status} ${response.statusText} - ${text}`);
    }

    return await response.json();
  } else {
    // Production: use Supabase functions
    const headers = {
      ...(await getAuthHeader(getToken)),
      apikey: SUPABASE_PUBLISHABLE_KEY || '',
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
}
