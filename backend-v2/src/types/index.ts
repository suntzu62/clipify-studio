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
