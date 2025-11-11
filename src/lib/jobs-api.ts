import { getAuthHeader } from './auth-token';

// Helper function to generate job ID (matching edge function)
async function generateJobId(sourceIdentifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(sourceIdentifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `job_${hashHex.substring(0, 16)}`;
}

function normalizeYoutubeUrl(raw: string): string {
  const trimmed = raw.trim();
  const idMatch = trimmed.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/);
  if (idMatch && idMatch[1]) {
    return `https://www.youtube.com/watch?v=${idMatch[1]}`;
  }
  const firstUrl = trimmed.match(/https?:\/\/[^\s]+/);
  if (firstUrl) {
    return firstUrl[0];
  }
  return trimmed.split(/\s+/)[0];
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
  // Use backend-v2 API in development
  const useLocalAPI = import.meta.env.DEV &&
    Boolean(import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_API_KEY);

  if (useLocalAPI) {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_KEY,
    } as Record<string, string>;

    // Get user ID from token if available
    let userId = 'dev-user';
    if (getToken) {
      const token = await getToken();
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          userId = payload.sub || 'dev-user';
        } catch {}
      }
    }

    const jobData = {
      sourceType: 'youtube',
      youtubeUrl: normalizeYoutubeUrl(url),
      userId,
      targetDuration: 60,
      clipCount: 5,
    };

    const resp = await fetch(`${import.meta.env.VITE_BACKEND_URL}/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(jobData),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to create job';
      throw new Error(`create-job failed: ${resp.status} ${resp.statusText} - ${msg}`);
    }
    // Normalize return shape to { jobId }
    const jobId = (data as any)?.jobId || (data as any)?.id;
    return { jobId };
  } else {
    // Production: use Supabase functions
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
}

export async function enqueuePipeline(
  youtubeUrl: string,
  neededMinutes: number,
  targetDuration: string,
  getToken?: () => Promise<string | null>
) {
  // Use backend-v2 API in development
  const useLocalAPI = import.meta.env.DEV &&
    Boolean(import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_API_KEY);

  if (useLocalAPI) {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_KEY,
    } as Record<string, string>;

    // Get user ID from token if available
    let userId = 'dev-user';
    if (getToken) {
      const token = await getToken();
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          userId = payload.sub || 'dev-user';
        } catch {}
      }
    }

    const jobData = {
      sourceType: 'youtube',
      youtubeUrl: normalizeYoutubeUrl(youtubeUrl),
      userId,
      targetDuration: parseInt(targetDuration),
      clipCount: 5,
    };

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount <= maxRetries) {
      try {
        const resp = await fetch(`${import.meta.env.VITE_BACKEND_URL}/jobs`, {
          method: 'POST',
          headers,
          body: JSON.stringify(jobData),
        });

        const data = await resp.json().catch(() => ({}));

        if (resp.ok) {
          return data;
        }

        // Handle 429 errors with exponential backoff
        if (resp.status === 429) {
          if (retryCount === maxRetries) {
            throw new Error('Sistema temporariamente sobrecarregado. Tente novamente em alguns minutos.');
          }

          const delay = Math.pow(3, retryCount) * 2000;
          await new Promise(resolve => setTimeout(resolve, delay));
          retryCount++;
          continue;
        }

        // For other errors, throw immediately
        const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to create job';
        throw new Error(`create-job failed: ${resp.status} ${resp.statusText} - ${msg}`);

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
      apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpYmpxcXVjbWJydHVpcnlzZXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2Mzg3OTYsImV4cCI6MjA3MjIxNDc5Nn0.afpoQtOXH62pi5LuC8lOXPmxnx71Nn3BJBXXtVzp3Os',
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

/**
 * Create a temporary configuration before processing
 * Returns a tempId that expires in 1 hour
 */
export async function createTempConfig(
  youtubeUrl: string,
  getToken?: () => Promise<string | null>
): Promise<{ tempId: string }> {
  const useLocalAPI = import.meta.env.DEV &&
    Boolean(import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_API_KEY);

  if (useLocalAPI) {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_KEY,
    } as Record<string, string>;

    // Get user ID from token if available
    let userId = 'dev-user';
    if (getToken) {
      const token = await getToken();
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          userId = payload.sub || 'dev-user';
        } catch {}
      }
    }

    const tempConfigData = {
      youtubeUrl: normalizeYoutubeUrl(youtubeUrl),
      userId,
      sourceType: 'youtube',
    };

    const resp = await fetch(`${import.meta.env.VITE_BACKEND_URL}/jobs/temp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(tempConfigData),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to create temporary configuration';
      throw new Error(`create-temp-config failed: ${resp.status} ${resp.statusText} - ${msg}`);
    }

    return { tempId: (data as any).tempId };
  } else {
    // Production: similar to dev, but adjust endpoint
    const headers = {
      'Content-Type': 'application/json',
      apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpYmpxcXVjbWJydHVpcnlzZXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2Mzg3OTYsImV4cCI6MjA3MjIxNDc5Nn0.afpoQtOXH62pi5LuC8lOXPmxnx71Nn3BJBXXtVzp3Os',
      ...(await getAuthHeader(getToken)),
    } as Record<string, string>;

    const resp = await fetch('https://qibjqqucmbrtuirysexl.supabase.co/functions/v1/create-temp-config', {
      method: 'POST',
      headers,
      body: JSON.stringify({ youtubeUrl }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to create temporary configuration';
      throw new Error(`create-temp-config failed: ${resp.status} ${resp.statusText} - ${msg}`);
    }

    return { tempId: (data as any).tempId };
  }
}

export async function getJobStatus(
  jobId: string,
  getToken?: () => Promise<string | null>
): Promise<Job> {
  // Use backend-v2 API in development
  const useLocalAPI = import.meta.env.DEV &&
    Boolean(import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_API_KEY);

  if (useLocalAPI) {
    const headers = {
      'x-api-key': import.meta.env.VITE_API_KEY,
    } as Record<string, string>;

    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/jobs/${jobId}`,
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
}
