import { getAuthHeader } from './auth-token';

export interface InstantClip {
  id: string;
  title: string;
  description: string;
  hashtags: string[];
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  thumbnailUrl?: string;
  previewUrl?: string;
}

export interface InstantClipsResponse {
  success: true;
  clips: InstantClip[];
  source: 'cache' | 'similar' | 'generic' | 'partial';
  processingTime: number;
  backgroundJobId?: string;
}

export async function getInstantClips(
  youtubeUrl: string,
  getToken?: () => Promise<string | null>
): Promise<InstantClipsResponse> {
  const headers = {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ...(await getAuthHeader(getToken)),
  } as Record<string, string>;

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instant-clips`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ youtubeUrl }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`instant-clips failed: ${response.status} - ${error.error || 'Unknown error'}`);
  }

  return await response.json();
}

// Progressive enhancement - get better clips after initial response
export async function enhanceClips(
  youtubeUrl: string,
  initialClips: InstantClip[],
  getToken?: () => Promise<string | null>
): Promise<InstantClip[]> {
  try {
    // Start full pipeline in background for enhanced results
    const headers = {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(await getAuthHeader(getToken)),
    } as Record<string, string>;

    const enhanceResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enqueue-pipeline`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        youtubeUrl, 
        neededMinutes: 10,
        meta: { enhance: true, initialClips: initialClips.length }
      }),
    });

    if (enhanceResponse.ok) {
      const { jobId } = await enhanceResponse.json();
      console.log('[enhanceClips] Background enhancement started:', jobId);
    }

    return initialClips; // Return original clips immediately
  } catch (error) {
    console.warn('[enhanceClips] Background enhancement failed:', error);
    return initialClips; // Fallback to original clips
  }
}

// Check if enhanced clips are ready
export async function getEnhancedClips(
  youtubeUrl: string,
  getToken?: () => Promise<string | null>
): Promise<InstantClip[] | null> {
  try {
    // This would check cache for enhanced results
    const enhanced = await getInstantClips(youtubeUrl, getToken);
    
    // If source is 'cache' and processing time is very low, these might be enhanced clips
    if (enhanced.source === 'cache' && enhanced.processingTime < 100) {
      return enhanced.clips;
    }
    
    return null;
  } catch (error) {
    console.warn('[getEnhancedClips] Failed to get enhanced clips:', error);
    return null;
  }
}