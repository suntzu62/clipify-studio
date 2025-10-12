// ============================================
// NOVO CONTRATO DE DADOS - BACKEND CORTAÍ V2
// ============================================

/**
 * Interface principal para todos os jobs no pipeline
 * Define um contrato estrito entre frontend → edge function → workers
 */
export interface JobData {
  // Identificação única do job (gerado pelo edge function)
  rootId: string;
  
  // Fonte do vídeo - SEMPRE especificado com type
  source: {
    type: 'youtube' | 'upload';
    
    // Para YouTube (obrigatório se type === 'youtube')
    youtubeUrl?: string;
    
    // Para Upload (obrigatório se type === 'upload')
    storagePath?: string;
    fileName?: string;
    bucket?: string;
  };
  
  // Metadados do job
  meta: {
    userId: string;
    targetDuration?: number; // duração desejada do clipe em segundos (30, 45, 60, 90)
    neededMinutes?: number; // minutos de vídeo necessários
    createdAt: string; // ISO timestamp
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
export interface VideoInfo {
  id?: string;
  title: string;
  duration: number;
  width?: number;
  height?: number;
  webpage_url?: string;
  uploader?: string;
  ext?: string;
}

// ============================================
// TIPOS LEGADOS (manter para compatibilidade temporária)
// ============================================

/**
 * @deprecated Use JobData.source instead
 */
export type VideoSource = {
  youtubeUrl?: string;
  upload?: {
    bucket: string;
    objectKey: string;
    originalName?: string;
  };
  sourceType?: 'youtube' | 'upload';
};
