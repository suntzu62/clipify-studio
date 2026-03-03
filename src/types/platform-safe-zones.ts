export type Platform = 'universal' | 'tiktok' | 'instagram-reels' | 'youtube-shorts' | 'facebook-reels';

export interface PlatformConfig {
  name: string;
  emoji: string;
  description: string;
  aspectRatio: string;
  safeZone: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  suggestedPosition: 'top' | 'center' | 'bottom';
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  universal: {
    name: 'Universal',
    emoji: '🌐',
    description: 'Funciona em todas as plataformas',
    aspectRatio: '9:16',
    safeZone: { top: 80, bottom: 120, left: 20, right: 20 },
    suggestedPosition: 'center',
  },
  tiktok: {
    name: 'TikTok',
    emoji: '📲',
    description: 'Otimizado para TikTok — safe zone inferior maior',
    aspectRatio: '9:16',
    safeZone: { top: 100, bottom: 180, left: 20, right: 20 },
    suggestedPosition: 'center',
  },
  'instagram-reels': {
    name: 'Instagram Reels',
    emoji: '📸',
    description: 'Otimizado para Instagram Reels',
    aspectRatio: '9:16',
    safeZone: { top: 80, bottom: 160, left: 20, right: 20 },
    suggestedPosition: 'center',
  },
  'youtube-shorts': {
    name: 'YouTube Shorts',
    emoji: '▶️',
    description: 'Otimizado para YouTube Shorts',
    aspectRatio: '9:16',
    safeZone: { top: 80, bottom: 140, left: 20, right: 20 },
    suggestedPosition: 'bottom',
  },
  'facebook-reels': {
    name: 'Facebook Reels',
    emoji: '📘',
    description: 'Otimizado para Facebook Reels',
    aspectRatio: '9:16',
    safeZone: { top: 80, bottom: 120, left: 20, right: 20 },
    suggestedPosition: 'center',
  },
};

export function getSuggestedPosition(platform: Platform): 'top' | 'center' | 'bottom' {
  return PLATFORM_CONFIGS[platform]?.suggestedPosition ?? 'center';
}
