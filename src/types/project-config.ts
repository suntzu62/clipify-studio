/**
 * Tipos para configuração de projeto antes do processamento
 */

export interface ProjectConfig {
  // Identificação
  tempId: string;
  youtubeUrl: string;
  userId: string;
  sourceType: 'youtube' | 'upload';

  // Configurações de clipes
  clipSettings: ClipSettings;

  // Preferências de legendas
  subtitlePreferences: SubtitlePreferences;

  // Timeframe (processar apenas parte do vídeo)
  timeframe?: TimeframeConfig;

  // Categoria/Gênero
  genre?: string;

  // Momentos específicos (busca com IA)
  specificMoments?: string;

  // Metadata
  createdAt: Date;
  expiresAt: Date; // 1 hora após criação
}

export interface ClipSettings {
  // AI clipping ativo/inativo
  aiClipping: boolean;

  // Modelo de detecção
  model: 'ClipAnything' | 'Smart' | 'Fast';

  // Duração dos clipes
  targetDuration: number; // segundos (30, 60, 90)
  minDuration: number; // mínimo (padrão: 30)
  maxDuration: number; // máximo (padrão: 90)

  // Número de clipes
  clipCount: number; // 5, 8, 10, 12
}

export interface SubtitlePreferences {
  position: 'top' | 'center' | 'bottom';
  format: 'single-line' | 'multi-line' | 'karaoke' | 'progressive';
  font: 'Arial' | 'Inter' | 'Roboto' | 'Montserrat' | 'Poppins';
  fontSize: number; // 16-48
  fontColor: string; // hex
  backgroundColor: string; // hex
  backgroundOpacity: number; // 0-1
  bold: boolean;
  italic: boolean;
  outline: boolean;
  outlineColor: string; // hex
  outlineWidth: number; // 1-5
  shadow: boolean;
  shadowColor: string; // hex
  maxCharsPerLine: number; // 20-60
  marginVertical: number; // 20-100
}

export interface TimeframeConfig {
  startTime: number; // segundos
  endTime: number; // segundos
  duration: number; // endTime - startTime
}

export type GenreType =
  | 'auto'
  | 'podcast'
  | 'lifestyle'
  | 'sports'
  | 'news'
  | 'educational'
  | 'entertainment'
  | 'marketing'
  | 'gaming';

// Defaults
export const DEFAULT_CLIP_SETTINGS: ClipSettings = {
  aiClipping: true,
  model: 'ClipAnything',
  targetDuration: 60,
  minDuration: 30,
  maxDuration: 90,
  clipCount: 8,
};

export const DEFAULT_SUBTITLE_PREFERENCES: SubtitlePreferences = {
  position: 'bottom',
  format: 'multi-line',
  font: 'Inter',
  fontSize: 32,
  fontColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.85,
  bold: true,
  italic: false,
  outline: true,
  outlineColor: '#000000',
  outlineWidth: 3,
  shadow: true,
  shadowColor: '#000000',
  maxCharsPerLine: 28,
  marginVertical: 80,
};

export const GENRE_OPTIONS: { value: GenreType; label: string; icon: string }[] = [
  { value: 'auto', label: 'Let AI detect', icon: '🤖' },
  { value: 'podcast', label: 'Podcast', icon: '🎙️' },
  { value: 'lifestyle', label: 'Lifestyle', icon: '🏃' },
  { value: 'sports', label: 'Sports', icon: '⚽' },
  { value: 'news', label: 'News', icon: '📰' },
  { value: 'educational', label: 'Educational', icon: '🎓' },
  { value: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { value: 'marketing', label: 'Marketing & Webinar', icon: '📊' },
  { value: 'gaming', label: 'Gaming', icon: '🎮' },
];
