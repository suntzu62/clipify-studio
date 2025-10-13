// ============================================
// TIPOS DO PIPELINE - WORKERS
// ============================================

/**
 * Interface principal para todos os jobs no pipeline
 */
export interface JobData {
  rootId: string;
  
  source: {
    type: 'youtube' | 'upload';
    youtubeUrl?: string;
    storagePath?: string;
    fileName?: string;
    bucket?: string;
  };
  
  meta: {
    userId: string;
    targetDuration?: number;
    neededMinutes?: number;
    createdAt: string;
  };
}

/**
 * Resultado do worker de ingest
 */
export interface IngestResult {
  rootId: string;
  bucket: string;
  sourcePath: string;
  audioPath: string;
  infoPath: string;
  duration: number;
  width: number;
  height: number;
}

/**
 * Informações do vídeo extraídas
 */
export type VideoInfo = {
  id?: string;
  title: string;
  duration: number;
  thumbnail?: string;
  originalUrl?: string;
  description?: string;
  fps?: number;
  dimensions?: {
    width: number;
    height: number;
  };
  meta?: Record<string, any>;
  width?: number;
  height?: number;
  webpage_url?: string;
  ext?: string;
  uploader?: string;
  [key: string]: any;
}

export type UploadInfo = {
  bucket: string;
  objectKey: string;
  publicUrl?: string;
}
