import { z } from 'zod';

// ============================================
// REQUEST SCHEMAS
// ============================================

export const CreateJobSchema = z.object({
  sourceType: z.enum(['youtube', 'youtube_live', 'upload']),
  youtubeUrl: z.string().url().optional(),
  uploadPath: z.string().optional(),
  userId: z.string().uuid(),
  targetDuration: z.number().min(15).max(90).default(60),
  clipCount: z.number().min(0).max(50).default(0), // 0 = modo automático
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const SubtitlePreferencesSchema = z.object({
  enabled: z.boolean().optional(),
  position: z.enum(['top', 'center', 'bottom']),
  format: z.enum(['single-line', 'multi-line', 'karaoke', 'progressive']),
  font: z.enum(['Arial', 'Inter', 'Roboto', 'Montserrat', 'Poppins', 'Impact', 'Montserrat Black', 'Arial Black', 'Helvetica']),
  fontSize: z.number().min(16).max(120),  // Aumentado para 120px (estilo concorrente - Opus Clip/Submagic)
  fontColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  backgroundOpacity: z.number().min(0).max(1),
  bold: z.boolean(),
  italic: z.boolean(),

  // Letter spacing (para estilos como Alex Hormozi)
  letterSpacing: z.number().min(-2).max(5).optional(),

  // Outline/Stroke
  outline: z.boolean(),
  outlineColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  outlineWidth: z.number().min(1).max(10),  // Aumentado para 10px (MrBeast style)

  // Shadow/Sombra
  shadow: z.boolean(),
  shadowColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  shadowOffsetX: z.number().min(-10).max(10).optional(),
  shadowOffsetY: z.number().min(-10).max(10).optional(),

  // Posicionamento
  maxCharsPerLine: z.number().min(20).max(60),
  marginVertical: z.number().min(20).max(500),  // Aumentado para suportar legendas maiores e posicionamento flexível
  marginBottom: z.number().min(0).max(500).optional(),
  marginTop: z.number().min(0).max(500).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),

  // Keyword highlighting (para destaque de palavras-chave)
  highlightKeywords: z.boolean().optional(),
  highlightColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  highlightStyle: z.enum(['color', 'bold', 'background']).optional(),

  // Template ID (referência ao template usado)
  templateId: z.string().optional(),
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
  clipCount: z.number().min(0).max(50), // 0 = modo automático (IA decide quantos clipes)
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
  sourceType: z.enum(['youtube', 'youtube_live', 'upload']),
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
  sourceType: z.enum(['youtube', 'youtube_live', 'upload']),
});

export type CreateTempConfigInput = z.infer<typeof CreateTempConfigSchema>;

export const StartJobFromTempSchema = z.object({
  clipSettings: ClipSettingsSchema,
  subtitlePreferences: SubtitlePreferencesSchema,
  clipOptions: z.object({
    targetAspectRatio: z.enum(['9:16', '1:1', '4:5', '16:9']).optional(),
    applyReframe: z.boolean().optional(),
    reframeMode: z.enum(['auto', 'single-focus', 'dual-focus', 'stacked']).optional(),
    reframeTracking: z.enum(['static', 'dynamic', 'auto']).optional(),
    dualFocusOptions: z.object({
      detectionMode: z.enum(['auto', 'manual', 'split-screen']).optional(),
      customRegions: z.object({
        region1: z.object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        }),
        region2: z.object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        }),
      }).optional(),
      splitRatio: z.number().optional(),
      addBackgroundFill: z.boolean().optional(),
      blurIntensity: z.number().optional(),
      padding: z.number().optional(),
      zoomLevel: z.number().optional(),
    }).optional(),
    stackedLayoutOptions: z.object({
      topRatio: z.number().optional(),
      facePadding: z.number().optional(),
      slideWidthRatio: z.number().optional(),
      preset: z.enum(['ultrafast', 'superfast', 'veryfast', 'fast', 'medium', 'slow']).optional(),
    }).optional(),
  }).optional(),
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
  clipCount: 0, // 0 = modo automático
};

// ============================================
// JOB DATA TYPES
// ============================================

export interface JobData {
  jobId: string;
  userId: string;
  sourceType: 'youtube' | 'youtube_live' | 'upload';
  youtubeUrl?: string;
  uploadPath?: string;
  targetDuration: number;
  clipCount: number;
  aiClipping?: boolean;
  model?: 'ClipAnything' | 'Smart' | 'Fast';
  minDuration?: number;
  maxDuration?: number;
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
  isFallback?: boolean;
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
export type SubtitleFont =
  | 'Arial'
  | 'Inter'
  | 'Roboto'
  | 'Montserrat'
  | 'Poppins'
  | 'Impact'
  | 'Montserrat Black'
  | 'Arial Black'
  | 'Helvetica';

export interface SubtitlePreferences {
  enabled?: boolean;
  position: SubtitlePosition;
  format: SubtitleFormat;
  font: SubtitleFont;
  fontSize: number; // em pixels
  fontColor: string; // hex color (ex: '#FFFFFF')
  backgroundColor: string; // hex color (ex: '#000000')
  backgroundOpacity: number; // 0-1
  bold: boolean;
  italic: boolean;
  letterSpacing?: number;
  outline: boolean;
  outlineColor: string; // hex color
  outlineWidth: number; // em pixels
  shadow: boolean;
  shadowColor: string; // hex color
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  maxCharsPerLine: number; // para quebra inteligente
  marginVertical: number; // distância do topo/bottom em pixels
  marginBottom?: number;
  marginTop?: number;
  textAlign?: 'left' | 'center' | 'right';
  highlightKeywords?: boolean;
  highlightColor?: string;
  highlightStyle?: 'color' | 'bold' | 'background';
  templateId?: string;
}

export const DEFAULT_SUBTITLE_PREFERENCES: SubtitlePreferences = {
  enabled: true,
  position: 'bottom',  // Inferior para estilo Shorts/Reels/TikTok
  format: 'multi-line',
  font: 'Inter',
  fontSize: 95,  // Base 95px (ajustado dinamicamente 70-95px baseado em linhas)
  fontColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.85,  // Mais opaco para máximo contraste
  bold: true,
  italic: false,
  outline: true,
  outlineColor: '#000000',
  outlineWidth: 4,  // Aumentado para 4px - contorno proporcional
  shadow: true,  // Ativado para melhor legibilidade
  shadowColor: '#000000',
  maxCharsPerLine: 28,  // 28 caracteres/linha - quebra em 2-3 linhas para caber (1000px largura)
  marginVertical: 550,  // 550px da borda inferior - MUITO MAIS CENTRALIZADA (estilo concorrente)
};

// ============================================
// INTELLIGENT REFRAME TYPES
// ============================================

export type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9';

export const ReframeOptionsSchema = z.object({
  enabled: z.boolean(),
  targetAspectRatio: z.enum(['9:16', '1:1', '4:5', '16:9']),
  autoDetect: z.boolean(), // Use AI to detect subject
  trackingMode: z.enum(['static', 'dynamic', 'auto']).optional(),
  enableMotion: z.boolean().optional(),
  motionSampleOffset: z.number().min(0.05).max(1).optional(),
  manualROI: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
  sampleInterval: z.number().min(1).max(10).default(2),
  minConfidence: z.number().min(0).max(1).default(0.5),
});

export type ReframeOptionsInput = z.infer<typeof ReframeOptionsSchema>;

export interface ReframeOptions {
  enabled: boolean;
  targetAspectRatio: AspectRatio;
  autoDetect: boolean;
  trackingMode?: 'static' | 'dynamic' | 'auto';
  enableMotion?: boolean;
  motionSampleOffset?: number;
  manualROI?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  sampleInterval?: number;
  minConfidence?: number;
}

export interface ReframeResult {
  enabled: boolean;
  roi: {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
  detectionMethod: 'face' | 'motion' | 'manual' | 'center' | 'fallback';
  targetAspectRatio: AspectRatio;
  trackingMode?: 'static' | 'dynamic' | 'auto';
}

export const DEFAULT_REFRAME_OPTIONS: ReframeOptions = {
  enabled: false,
  targetAspectRatio: '9:16',
  autoDetect: true,
  sampleInterval: 2,
  minConfidence: 0.5,
};

// ============================================
// TEMPORAL TRACKING TYPES (FASE 2)
// ============================================

export interface TemporalTrackingOptions {
  enabled: boolean;
  trackingInterval: number; // Intervalo entre análises (segundos)
  smoothingWindow: number; // Janela de suavização (frames)
  adaptiveTracking: boolean; // Ajustar intervalo baseado em movimento
  exportTrajectory: boolean; // Exportar trajetória como JSON
}

export interface DynamicReframeOptions extends ReframeOptions {
  temporalTracking?: TemporalTrackingOptions;
}

export const DEFAULT_TEMPORAL_TRACKING: TemporalTrackingOptions = {
  enabled: false,
  trackingInterval: 0.5, // Análise a cada 0.5s
  smoothingWindow: 5, // Suavizar com 5 frames
  adaptiveTracking: true,
  exportTrajectory: false,
};

// ============================================
// ADVANCED FEATURES TYPES (FASE 3)
// ============================================

export interface AdvancedFeaturesOptions {
  enabled: boolean;
  detectMultiplePeople: boolean; // Detectar múltiplas pessoas
  prioritizeSpeaker: boolean; // Priorizar quem está falando
  autoZoom: boolean; // Zoom automático em momentos-chave
  zoomIntensity: number; // 0.0 - 1.0
  exportAnalytics: boolean; // Exportar analytics JSON
}

export interface FullReframeOptions extends DynamicReframeOptions {
  advancedFeatures?: AdvancedFeaturesOptions;
}

export const DEFAULT_ADVANCED_FEATURES: AdvancedFeaturesOptions = {
  enabled: false,
  detectMultiplePeople: false,
  prioritizeSpeaker: false,
  autoZoom: false,
  zoomIntensity: 0.5,
  exportAnalytics: false,
};

// ============================================
// VIRAL INTELLIGENCE TYPES
// ============================================

export interface ViralIntelligenceOptions {
  // Análise de áudio
  audioInterval?: number; // Intervalo de análise (padrão: 0.5s)
  detectAudioPeaks?: boolean;

  // Análise de emoções
  emotionInterval?: number; // Intervalo entre frames (padrão: 2s)
  detectEmotionalMoments?: boolean;

  // Análise de fala
  analyzeSpeech?: boolean;
  detectKeywords?: boolean;
  analyzeSentiment?: boolean;

  // Detecção de highlights
  highlightOptions?: HighlightDetectionOptions;

  // Geração de clips
  generateClips?: boolean;
  clipOptions?: ViralClipOptions;
}

export interface HighlightDetectionOptions {
  minViralScore?: number; // Score mínimo (padrão: 60)
  maxHighlights?: number; // Número máximo (padrão: 10)
  minDuration?: number; // Duração mínima (padrão: 2s)
  maxDuration?: number; // Duração máxima (padrão: 30s)
  weights?: {
    audio?: number; // Peso do áudio (padrão: 0.3)
    emotion?: number; // Peso das emoções (padrão: 0.4)
    speech?: number; // Peso da fala (padrão: 0.3)
  };
}

export interface DualFocusRegions {
  region1: { x: number; y: number; width: number; height: number };
  region2: { x: number; y: number; width: number; height: number };
}

export interface ViralClipOptions {
  targetAspectRatio?: AspectRatio;
  applyReframe?: boolean; // Reenquadramento inteligente

  // Modo de reenquadramento
  reframeMode?: 'auto' | 'single-focus' | 'dual-focus' | 'stacked'; // auto = decide por contagem de pessoas; stacked = split vertical top/bottom
  reframeTracking?: 'static' | 'dynamic' | 'auto'; // tracking do reenquadramento (static = ROI único, dynamic = tracking temporal)

  // Opções para dual-focus (vídeos de quiz, entrevistas, etc.)
  dualFocusOptions?: {
    detectionMode?: 'auto' | 'manual' | 'split-screen'; // Padrão: split-screen
    customRegions?: DualFocusRegions; // Para modo manual
    splitRatio?: number; // Para split-screen: 0.5 = 50/50
    addBackgroundFill?: boolean; // Blur background para evitar barras pretas
    blurIntensity?: number; // 0-100
    padding?: number; // Padding adicional em pixels
    zoomLevel?: number; // 1.0 = sem zoom
  };

  // Opções para stacked layout (top/bottom)
  stackedLayoutOptions?: {
    topRatio?: number; // Percentual do quadro para o bloco superior (padrão ~60%)
    facePadding?: number; // Padding extra em torno do rosto
    slideWidthRatio?: number; // Largura relativa usada para “slide/tela” (padrão ~0.58)
    preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium' | 'slow';
  };

  addMargins?: boolean; // Margem antes/depois
  marginBefore?: number; // Segundos antes (padrão: 1s)
  marginAfter?: number; // Segundos depois (padrão: 1s)
  minClipDuration?: number; // Duração mínima (padrão: 3s)
  maxClipDuration?: number; // Duração máxima (padrão: 60s)
  outputFormat?: 'mp4' | 'webm';
  quality?: 'low' | 'medium' | 'high' | 'ultra';
}

export interface ViralHighlight {
  timestamp: number;
  duration: number;
  viralScore: number; // 0-100
  components: {
    audioScore: number; // 0-1
    emotionScore: number; // 0-1
    speechScore: number; // 0-1
  };
  reasons: string[];
  tags: string[];
  confidence: number;
}

export interface ViralClip {
  clipId: string;
  outputPath: string;
  highlight: ViralHighlight;
  startTime: number;
  endTime: number;
  duration: number;
  viralScore: number;
  metadata: {
    tags: string[];
    reasons: string[];
    confidence: number;
    reframed: boolean;
  };
}

export const DEFAULT_VIRAL_CLIP_OPTIONS: ViralClipOptions = {
  targetAspectRatio: '9:16',
  applyReframe: true,
  reframeMode: 'auto', // Padrão: decide automaticamente (1 pessoa = single, 2+ = split)
  reframeTracking: 'auto',
  dualFocusOptions: {
    detectionMode: 'split-screen',
    splitRatio: 0.5,
    addBackgroundFill: true,
    blurIntensity: 20,
    padding: 0,
    zoomLevel: 1.0,
  },
  stackedLayoutOptions: {
    topRatio: 0.6,
    facePadding: 80,
    slideWidthRatio: 0.58,
    preset: 'fast',
  },
  addMargins: true,
  marginBefore: 1,
  marginAfter: 1,
  minClipDuration: 3,
  maxClipDuration: 60,
  outputFormat: 'mp4',
  quality: 'high',
};

export const DEFAULT_VIRAL_INTELLIGENCE: ViralIntelligenceOptions = {
  audioInterval: 0.5,
  detectAudioPeaks: true,
  emotionInterval: 2.0,
  detectEmotionalMoments: true,
  analyzeSpeech: true,
  detectKeywords: true,
  analyzeSentiment: true,
  generateClips: false,
  highlightOptions: {
    minViralScore: 60,
    maxHighlights: 10,
    minDuration: 2,
    maxDuration: 30,
    weights: {
      audio: 0.3,
      emotion: 0.4,
      speech: 0.3,
    },
  },
  clipOptions: DEFAULT_VIRAL_CLIP_OPTIONS,
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
  format?: {
    aspectRatio: AspectRatio;
  };
  storagePath: string;
  thumbnail?: string;
  subtitleSettings?: SubtitlePreferences;
  reframeSettings?: ReframeResult;
  // Dados de inteligência viral (opcional)
  hookAnalysis?: any;
  scoreBreakdown?: any;
  hookVariations?: any[];
  seoTitle?: string;
  seoDescription?: string;
  seoHashtags?: string[];
  seoVariants?: Array<{ angle?: string; title: string; description: string; hashtags: string[] }>;
  seoSelectedIndex?: number;
  // Virality Score unificado
  viralityScore?: number;        // 0-100
  viralityComponents?: {
    hookStrength: number;
    contentDensity: number;
    emotionalImpact: number;
    narrativeArc: number;
  };
  viralityLabel?: 'viral' | 'high' | 'medium' | 'low';
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
// COMMERCIAL PARITY TYPES
// ============================================

export type LivePlatform = 'youtube_live' | 'twitch';
export type LiveSourceStatus = 'idle' | 'active' | 'stopped' | 'error';
export type PublicationPlatform = 'instagram' | 'youtube' | 'tiktok';
export type PublicationStatus = 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
export type QueueEventStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type BrandKitApplyMode = 'watermark_only' | 'full_package';

export interface LiveSource {
  id: string;
  userId: string;
  platform: LivePlatform;
  streamUrl: string;
  status: LiveSourceStatus;
  startedAt?: string | null;
  lastIngestedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LiveClip {
  id: string;
  sourceId: string;
  jobId: string;
  title: string;
  clipUrl: string;
  thumbnailUrl?: string | null;
  createdAt: string;
  viralScore?: number | null;
}

export interface ScheduledPublication {
  id: string;
  clipId: string;
  platform: PublicationPlatform;
  scheduledAt: string;
  timezone: string;
  status: PublicationStatus;
  retryCount: number;
  lastError?: string | null;
  publicationUrl?: string | null;
  publishedAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface QueueItem {
  id: string;
  type: 'publication' | 'brand_kit_apply' | 'live_ingest';
  priority: number;
  position: number;
  etaSeconds: number;
  status: QueueEventStatus | PublicationStatus;
  scheduledAt?: string | null;
}

export interface BrandKit {
  id: string;
  userId: string;
  name: string;
  logoUrl?: string | null;
  introUrl?: string | null;
  outroUrl?: string | null;
  palette: Record<string, unknown>;
  watermark: Record<string, unknown>;
  captionStyleId?: string | null;
  isDefault: boolean;
}

export interface ApplyBrandKitInput {
  clipIds: string[];
  mode: BrandKitApplyMode;
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

export class ReframeError extends AppError {
  constructor(message: string, public originalError?: any) {
    super('REFRAME_ERROR', message, 500);
  }
}
