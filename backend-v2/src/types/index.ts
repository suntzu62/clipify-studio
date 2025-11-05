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
  | 'downloading'
  | 'transcribing'
  | 'analyzing'
  | 'rendering'
  | 'uploading'
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
  position: 'center',
  format: 'multi-line',
  font: 'Inter',
  fontSize: 24,
  fontColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.7,
  bold: true,
  italic: false,
  outline: true,
  outlineColor: '#000000',
  outlineWidth: 2,
  shadow: false,
  shadowColor: '#000000',
  maxCharsPerLine: 40,
  marginVertical: 40,
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
