import { logger } from './logger';
import { httpFetch } from './http';

const log = logger.child({ module: 'youtube-api' });

export interface VideoMetadata {
  id: string;
  title: string;
  duration: string;
  durationSeconds: number;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  viewCount?: string;
  embeddable: boolean;
  regionRestriction?: {
    blocked?: string[];
    allowed?: string[];
  };
}

export interface VideoValidation {
  available: boolean;
  metadata?: VideoMetadata;
  reason?: string;
  errorCode?: string;
}

/**
 * Extrai video ID de URLs do YouTube
 */
export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      return id && id.length >= 10 ? id : null;
    }
    
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '');
      return id && id.length >= 10 ? id : null;
    }
    
    // YouTube Shorts
    if (u.pathname.startsWith('/shorts/')) {
      const id = u.pathname.split('/')[2];
      return id && id.length >= 10 ? id : null;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Converte ISO 8601 duration para segundos
 * Exemplo: PT1H2M10S = 3730 segundos
 */
function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Obtém metadados de um vídeo via YouTube Data API v3
 */
export async function getVideoMetadata(
  videoId: string,
  apiKey: string
): Promise<VideoMetadata> {
  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails,status,statistics&key=${apiKey}`;
  
  log.info({ videoId }, 'Fetching YouTube video metadata');
  
  const { data, status } = await httpFetch<any>(url, {
    method: 'GET',
    timeoutMs: 10_000,
    retries: 2,
  });
  
  if (status !== 200 || !data.items || data.items.length === 0) {
    throw new Error(`Video not found: ${videoId}`);
  }
  
  const item = data.items[0];
  const snippet = item.snippet;
  const contentDetails = item.contentDetails;
  const status_info = item.status;
  const statistics = item.statistics;
  
  const durationSeconds = parseDuration(contentDetails.duration);
  
  const metadata: VideoMetadata = {
    id: videoId,
    title: snippet.title,
    duration: contentDetails.duration,
    durationSeconds,
    thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
    channelTitle: snippet.channelTitle,
    publishedAt: snippet.publishedAt,
    viewCount: statistics?.viewCount,
    embeddable: status_info.embeddable !== false,
    regionRestriction: contentDetails.regionRestriction,
  };
  
  log.info({ videoId, title: metadata.title, duration: durationSeconds }, 'YouTube metadata fetched');
  
  return metadata;
}

/**
 * Verifica se vídeo está disponível para download
 */
export async function validateYouTubeVideo(
  url: string,
  apiKey: string
): Promise<VideoValidation> {
  const videoId = extractVideoId(url);
  
  if (!videoId) {
    return {
      available: false,
      reason: 'URL inválida do YouTube',
      errorCode: 'INVALID_URL',
    };
  }
  
  try {
    const metadata = await getVideoMetadata(videoId, apiKey);
    
    // Verificar se vídeo é embeddable (normalmente indica disponibilidade)
    if (!metadata.embeddable) {
      return {
        available: false,
        metadata,
        reason: 'Vídeo não permite embed (pode estar restrito)',
        errorCode: 'NOT_EMBEDDABLE',
      };
    }
    
    // Verificar restrições regionais
    if (metadata.regionRestriction) {
      const { blocked, allowed } = metadata.regionRestriction;
      
      if (blocked && blocked.length > 0) {
        return {
          available: false,
          metadata,
          reason: `Vídeo bloqueado em ${blocked.length} regiões`,
          errorCode: 'REGION_BLOCKED',
        };
      }
      
      if (allowed && allowed.length > 0) {
        return {
          available: false,
          metadata,
          reason: 'Vídeo disponível apenas em regiões específicas',
          errorCode: 'REGION_RESTRICTED',
        };
      }
    }
    
    // Vídeo está disponível
    return {
      available: true,
      metadata,
    };
  } catch (error: any) {
    log.error({ error: error.message, videoId }, 'YouTube API validation failed');
    
    // Se API falhar, não bloquear - deixar yt-dlp tentar
    return {
      available: true, // Assume disponível se API falhar
      reason: 'API validation failed, will try download',
      errorCode: 'API_ERROR',
    };
  }
}
