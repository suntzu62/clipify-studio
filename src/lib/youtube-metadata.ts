// Utility for extracting YouTube video metadata
export interface YouTubeMetadata {
  title: string;
  duration: string;
  channelName: string;
  thumbnailUrl: string;
  description: string;
}

// Extract video ID from various YouTube URL formats
export function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    
    if (hostname === 'youtu.be') {
      return urlObj.pathname.slice(1);
    }
    
    if (hostname.includes('youtube.com')) {
      if (urlObj.pathname === '/watch') {
        return urlObj.searchParams.get('v');
      }
      if (urlObj.pathname.startsWith('/shorts/')) {
        return urlObj.pathname.split('/')[2];
      }
      if (urlObj.pathname.startsWith('/embed/')) {
        return urlObj.pathname.split('/')[2];
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

// Get basic metadata from YouTube URL (client-side safe)
export async function getYouTubeMetadata(url: string): Promise<Partial<YouTubeMetadata>> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return { title: 'Vídeo do YouTube' };
  }

  try {
    // Use YouTube oEmbed API for basic metadata (CORS-friendly)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      throw new Error('Failed to fetch metadata');
    }
    
    const data = await response.json();
    
    return {
      title: data.title || 'Vídeo do YouTube',
      channelName: data.author_name || 'Canal do YouTube',
      thumbnailUrl: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      description: '',
      duration: 'Calculando...'
    };
  } catch (error) {
    console.warn('Failed to fetch YouTube metadata:', error);
    return {
      title: 'Vídeo do YouTube',
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
  }
}

// Format duration from seconds to readable string
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Create a human-readable project title from URL and metadata
export function createProjectTitle(url: string, metadata?: Partial<YouTubeMetadata>): string {
  if (metadata?.title && metadata.title !== 'Vídeo do YouTube') {
    // Truncate long titles
    const title = metadata.title.length > 50 
      ? metadata.title.substring(0, 47) + '...' 
      : metadata.title;
    
    if (metadata.duration && metadata.duration !== 'Calculando...') {
      return `${title} • ${metadata.duration}`;
    }
    return title;
  }
  
  // Fallback to URL-based title
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    return `Vídeo ${hostname}`;
  } catch {
    return 'Novo Projeto';
  }
}