import { getAuthHeader } from './auth-token';
import { getBackendUrl } from './backend-url';

const BACKEND_URL = getBackendUrl();

interface RemixVariant {
  platform: 'tiktok' | 'instagram_reels' | 'youtube_shorts' | 'linkedin';
  aspectRatio: '9:16' | '1:1' | '4:5' | '16:9';
  hook: string;
  title: string;
  description: string;
  hashtags: string[];
  cta: string;
  editingNotes: string[];
}

interface ClipRemixPackage {
  enabled: boolean;
  primaryPlatform: RemixVariant['platform'];
  goal: 'viral' | 'conversion' | 'authority' | 'engagement';
  hookStyle: 'bold' | 'curiosity' | 'teaching' | 'story';
  captionStyle: 'punchy' | 'conversational' | 'expert';
  generateAltHooks: boolean;
  altHooks: string[];
  variants: RemixVariant[];
}

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
      remixPackage?: ClipRemixPackage;
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
    Boolean(import.meta.env.VITE_API_KEY);

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
      targetDuration: 40,
      clipCount: 14,
    };

    const resp = await fetch(`${BACKEND_URL}/jobs`, {
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
    // Production: use backend API
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_KEY,
      ...(await getAuthHeader(getToken)),
    } as Record<string, string>;

    const resp = await fetch(`${BACKEND_URL}/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceType: 'youtube',
        youtubeUrl: normalizeYoutubeUrl(url),
        userId: 'prod-user',
        targetDuration: 40,
        clipCount: 14,
      }),
      credentials: 'include',
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
    Boolean(import.meta.env.VITE_API_KEY);

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
      clipCount: 14,
    };

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount <= maxRetries) {
      try {
        const resp = await fetch(`${BACKEND_URL}/jobs`, {
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
    // Production: use backend API
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_KEY,
      ...(await getAuthHeader(getToken)),
    } as Record<string, string>;

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount <= maxRetries) {
      try {
        const resp = await fetch(`${BACKEND_URL}/jobs`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sourceType: 'youtube',
            youtubeUrl: normalizeYoutubeUrl(youtubeUrl),
            userId: 'prod-user',
            targetDuration: parseInt(targetDuration),
            clipCount: 14,
          }),
          credentials: 'include',
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
  getToken?: () => Promise<string | null>,
  userIdFallback?: string
): Promise<{ tempId: string }> {
  const useBackendAPI = Boolean(import.meta.env.VITE_API_KEY);

  if (useBackendAPI) {
    const token = getToken ? await getToken() : null;
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_KEY,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    } as Record<string, string>;

    // Get user ID from token if available
    let userId = userIdFallback || 'dev-user';
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload.sub || 'dev-user';
      } catch {}
    }

    const tempConfigData = {
      youtubeUrl: normalizeYoutubeUrl(youtubeUrl),
      userId,
      sourceType: 'youtube',
    };

    const resp = await fetch(`${BACKEND_URL}/jobs/temp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(tempConfigData),
      credentials: 'include',
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to create temporary configuration';
      throw new Error(`create-temp-config failed: ${resp.status} ${resp.statusText} - ${msg}`);
    }

    return { tempId: (data as any).tempId };
  } else {
    // Production: use backend API
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_KEY,
      ...(await getAuthHeader(getToken)),
    } as Record<string, string>;

    const resp = await fetch(`${BACKEND_URL}/jobs/temp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceType: 'youtube',
        youtubeUrl: normalizeYoutubeUrl(youtubeUrl),
        userId: userIdFallback || 'prod-user',
      }),
      credentials: 'include',
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to create temporary configuration';
      throw new Error(`create-temp-config failed: ${resp.status} ${resp.statusText} - ${msg}`);
    }

    return { tempId: (data as any).tempId };
  }
}

/**
 * Start a queued job from a temporary configuration
 * Supports backend-v2 local API flow.
 */
export async function startJobFromTempConfig(
  tempId: string,
  config: {
    clipSettings: {
      aiClipping: boolean;
      model: 'ClipAnything' | 'Smart' | 'Fast';
      targetDuration: number;
      minDuration: number;
      maxDuration: number;
      clipCount: number;
    };
    subtitlePreferences: {
      position: 'top' | 'center' | 'bottom';
      format: 'single-line' | 'multi-line' | 'karaoke' | 'progressive';
      font: 'Arial' | 'Inter' | 'Roboto' | 'Montserrat' | 'Poppins';
      fontSize: number;
      fontColor: string;
      backgroundColor: string;
      backgroundOpacity: number;
      bold: boolean;
      italic: boolean;
      outline: boolean;
      outlineColor: string;
      outlineWidth: number;
      shadow: boolean;
      shadowColor: string;
      maxCharsPerLine: number;
      marginVertical: number;
    };
    timeframe?: {
      startTime: number;
      endTime: number;
      duration: number;
    };
    genre?: string;
    specificMoments?: string;
    platformRemix?: {
      enabled: boolean;
      primaryPlatform: 'tiktok' | 'instagram_reels' | 'youtube_shorts' | 'linkedin';
      targetPlatforms: Array<'tiktok' | 'instagram_reels' | 'youtube_shorts' | 'linkedin'>;
      goal: 'viral' | 'conversion' | 'authority' | 'engagement';
      hookStyle: 'bold' | 'curiosity' | 'teaching' | 'story';
      captionStyle: 'punchy' | 'conversational' | 'expert';
      generateAltHooks: boolean;
    };
  },
  getToken?: () => Promise<string | null>
): Promise<{ jobId: string; status: string; message?: string }> {
  const useBackendAPI = Boolean(import.meta.env.VITE_API_KEY);

  if (useBackendAPI) {
    const token = getToken ? await getToken() : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    } as Record<string, string>;

    if (import.meta.env.VITE_API_KEY) {
      headers['x-api-key'] = import.meta.env.VITE_API_KEY;
    }

    const resp = await fetch(`${BACKEND_URL}/jobs/temp/${tempId}/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify(config),
      credentials: 'include',
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to start job from temporary configuration';
      throw new Error(`start-job-from-temp failed: ${resp.status} ${resp.statusText} - ${msg}`);
    }

    return {
      jobId: (data as any).jobId,
      status: (data as any).status || 'queued',
      message: (data as any).message,
    };
  }

  // In production deployments without backend-v2 temp start endpoint,
  // the UI should fallback to the full configuration screen.
  throw new Error('ONE_CLICK_NOT_AVAILABLE');
}

/**
 * Create a job from an uploaded file
 * Called after file is uploaded to Supabase Storage
 */
export async function createJobFromUpload(
  userId: string,
  storagePath: string,
  fileName: string,
  getToken?: () => Promise<string | null>
): Promise<{ jobId: string }> {
  const useBackendAPI = Boolean(import.meta.env.VITE_API_KEY);

  if (useBackendAPI) {
    const token = getToken ? await getToken() : null;
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_KEY,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    } as Record<string, string>;

    const jobData = {
      userId,
      storagePath,
      fileName,
      targetDuration: 40,
      clipCount: 14,
    };

    const resp = await fetch(`${BACKEND_URL}/jobs/from-upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify(jobData),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to create job from upload';
      throw new Error(`create-job-from-upload failed: ${resp.status} ${resp.statusText} - ${msg}`);
    }

    return { jobId: (data as any).jobId };
  } else {
    // Production: use the same backend endpoint (deployed version)
    // For now, we'll use the same approach but with auth token
    const token = getToken ? await getToken() : null;

    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    } as Record<string, string>;

    // In production, the backend URL should come from environment
    const backendUrl = BACKEND_URL || 'https://api.cortai.app';

    const jobData = {
      userId,
      storagePath,
      fileName,
      targetDuration: 40,
      clipCount: 14,
    };

    const resp = await fetch(`${backendUrl}/jobs/from-upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify(jobData),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data && ((data as any).error || (data as any).message)) || JSON.stringify(data) || 'Failed to create job from upload';
      throw new Error(`create-job-from-upload failed: ${resp.status} ${resp.statusText} - ${msg}`);
    }

    return { jobId: (data as any).jobId };
  }
}

export async function getJobStatus(
  jobId: string,
  getToken?: () => Promise<string | null>
): Promise<Job> {
  const useBackendAPI = Boolean(import.meta.env.VITE_API_KEY);

  if (useBackendAPI) {
    const token = getToken ? await getToken() : null;
    const headers = {
      'x-api-key': import.meta.env.VITE_API_KEY,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    } as Record<string, string>;

    const response = await fetch(
      `${BACKEND_URL}/jobs/${jobId}`,
      { headers }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`job-status failed: ${response.status} ${response.statusText} - ${text}`);
    }

    return await response.json();
  } else {
    // Production: use backend API
    const headers = {
      ...(await getAuthHeader(getToken)),
      'x-api-key': import.meta.env.VITE_API_KEY,
    } as Record<string, string>;
    
    const response = await fetch(
      `${BACKEND_URL}/jobs/${jobId}`,
      { headers, credentials: 'include' }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`job-status failed: ${response.status} ${response.statusText} - ${text}`);
    }

    return await response.json();
  }
}
