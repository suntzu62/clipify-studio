import { z } from 'zod';

// ============================================
// REQUEST SCHEMAS
// ============================================

export const CreateJobSchema = z.object({
  sourceType: z.enum(['youtube', 'upload']),
  youtubeUrl: z.string().url().optional(),
  uploadPath: z.string().optional(),
  userId: z.string().uuid(),
  targetDuration: z.number().min(15).max(90).default(60),
  clipCount: z.number().min(1).max(10).default(5),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const SubtitlePreferencesSchema = z.object({
  position: z.enum(['top', 'center', 'bottom']),
  format: z.enum(['single-line', 'multi-line', 'karaoke', 'progressive']),
  font: z.enum(['Arial', 'Inter', 'Roboto', 'Montserrat', 'Poppins']),
  fontSize: z.number().min(16).max(48),
  fontColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  backgroundOpacity: z.number().min(0).max(1),
  bold: z.boolean(),
  italic: z.boolean(),
  outline: z.boolean(),
  outlineColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  outlineWidth: z.number().min(1).max(5),
  shadow: z.boolean(),
  shadowColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  maxCharsPerLine: z.number().min(20).max(60),
  marginVertical: z.number().min(20).max(100),
});

export type SubtitlePreferencesInput = z.infer<typeof SubtitlePreferencesSchema>;

// ============================================
// TEMPORARY CONFIGURATION TYPES (OpusClip-style workflow)
// ============================================

export const ClipSettingsSchema = z.object({
  aiClipping: z.boolean(),
  model: z.enum(['ClipAnything', 'Smart', 'Fast']),
  targetDuration: z.number().min(30).max(90),
  minDuration: z.number().min(15).max(60),
  maxDuration: z.number().min(60).max(120),
  clipCount: z.number().min(3).max(15),
});

export type ClipSettings = z.infer<typeof ClipSettingsSchema>;

export const TimeframeConfigSchema = z.object({
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  duration: z.number().min(30),
});

export type TimeframeConfig = z.infer<typeof TimeframeConfigSchema>;

export const ProjectConfigSchema = z.object({
  tempId: z.string(),
  youtubeUrl: z.string().url(),
  userId: z.string(),
  sourceType: z.enum(['youtube', 'upload']),
  clipSettings: ClipSettingsSchema,
  subtitlePreferences: SubtitlePreferencesSchema,
  timeframe: TimeframeConfigSchema.optional(),
  genre: z.string().optional(),
  specificMoments: z.string().optional(),
  createdAt: z.date(),
  expiresAt: z.date(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const CreateTempConfigSchema = z.object({
  youtubeUrl: z.string().url(),
  userId: z.string(),
  sourceType: z.enum(['youtube', 'upload']),
});

export type CreateTempConfigInput = z.infer<typeof CreateTempConfigSchema>;

export const StartJobFromTempSchema = z.object({
  clipSettings: ClipSettingsSchema,
  subtitlePreferences: SubtitlePreferencesSchema,
  timeframe: TimeframeConfigSchema.optional(),
  genre: z.string().optional(),
  specificMoments: z.string().optional(),
});

export type StartJobFromTempInput = z.infer<typeof StartJobFromTempSchema>;

export const DEFAULT_CLIP_SETTINGS: ClipSettings = {
  aiClipping: true,
  model: 'ClipAnything',
  targetDuration: 60,
  minDuration: 30,
  maxDuration: 90,
  clipCount: 8,
};

// ============================================
// JOB DATA TYPES
// ============================================

export interface JobData {
  jobId: string;
  userId: string;
  sourceType: 'youtube' | 'upload';
  youtubeUrl?: string;
  uploadPath?: string;
  targetDuration: number;
  clipCount: number;
  createdAt: Date;
}

export interface JobProgress {
  jobId: string;
  step: JobStep;
  progress: number; // 0-100
  message: string;
  data?: any;
}

export type JobStep =
  | 'queued'
  | 'ingest'        // Download/upload do vídeo
  | 'transcribe'    // Transcrição com Whisper
  | 'scenes'        // Análise de cenas
  | 'rank'          // Ranking e seleção dos melhores clipes
  | 'render'        // Renderização dos vídeos
  | 'texts'         // Geração de títulos, descrições e hashtags
  | 'export'        // Upload final para storage
  | 'completed'
  | 'failed';

export interface JobResult {
  jobId: string;
  status: 'completed' | 'failed';
  clips?: Clip[];
  error?: string;
  processingTime: number; // milliseconds
}

// ============================================
// VIDEO & CLIP TYPES
// ============================================

export interface VideoMetadata {
  id?: string;
  title: string;
  duration: number; // seconds
  width: number;
  height: number;
  url: string;
  thumbnail?: string;
}

export interface Transcript {
  segments: TranscriptSegment[];
  language: string;
  duration: number;
}

export interface TranscriptSegment {
  text: string;
  start: number; // seconds
  end: number;
  confidence?: number;
}

// ============================================
// SUBTITLE CUSTOMIZATION TYPES
// ============================================

export type SubtitlePosition = 'top' | 'center' | 'bottom';
export type SubtitleFormat = 'single-line' | 'multi-line' | 'karaoke' | 'progressive';
export type SubtitleFont = 'Arial' | 'Inter' | 'Roboto' | 'Montserrat' | 'Poppins';

export interface SubtitlePreferences {
  position: SubtitlePosition;
  format: SubtitleFormat;
  font: SubtitleFont;
  fontSize: number; // em pixels
  fontColor: string; // hex color (ex: '#FFFFFF')
  backgroundColor: string; // hex color (ex: '#000000')
  backgroundOpacity: number; // 0-1
  bold: boolean;
  italic: boolean;
  outline: boolean;
  outlineColor: string; // hex color
  outlineWidth: number; // em pixels
  shadow: boolean;
  shadowColor: string; // hex color
  maxCharsPerLine: number; // para quebra inteligente
  marginVertical: number; // distância do topo/bottom em pixels
}

export const DEFAULT_SUBTITLE_PREFERENCES: SubtitlePreferences = {
  position: 'bottom',  // Inferior para estilo Shorts/Reels/TikTok
  format: 'multi-line',
  font: 'Inter',
  fontSize: 32,  // AUMENTADO de 20 para 32px - muito mais legível!
  fontColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.85,  // Mais opaco para máximo contraste
  bold: true,
  italic: false,
  outline: true,
  outlineColor: '#000000',
  outlineWidth: 3,  // Aumentado de 2 para 3px - contorno mais visível
  shadow: true,  // Ativado para melhor legibilidade
  shadowColor: '#000000',
  maxCharsPerLine: 28,  // Reduzido para 28 - linhas mais curtas e fáceis de ler
  marginVertical: 80,  // Aumentado para 80px - mais espaço da borda
};

export interface Clip {
  id: string;
  title: string;
  start: number; // seconds
  end: number;
  duration: number;
  score: number; // 0-1
  transcript: string;
  keywords: string[];
  storagePath: string;
  thumbnail?: string;
  subtitleSettings?: SubtitlePreferences;
}

export interface HighlightAnalysis {
  segments: HighlightSegment[];
  reasoning: string;
}

export interface HighlightSegment {
  start: number;
  end: number;
  score: number;
  title: string;
  reason: string;
  keywords: string[];
}

// ============================================
// ERROR TYPES
// ============================================

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class VideoDownloadError extends AppError {
  constructor(message: string, public originalError?: any) {
    super('VIDEO_DOWNLOAD_ERROR', message, 500);
  }
}

export class TranscriptionError extends AppError {
  constructor(message: string, public originalError?: any) {
    super('TRANSCRIPTION_ERROR', message, 500);
  }
}

export class RenderError extends AppError {
  constructor(message: string, public originalError?: any) {
    super('RENDER_ERROR', message, 500);
  }
}
