import { Job } from 'bullmq';
import { createLogger } from '../config/logger.js';
import type { JobData, JobResult, JobProgress, Clip, SubtitlePreferences } from '../types/index.js';
import { DEFAULT_SUBTITLE_PREFERENCES } from '../types/index.js';
import { downloadVideo, cleanupVideo } from '../services/download.js';
import { transcribeVideo, cleanupAudio } from '../services/transcription.js';
import { analyzeHighlights } from '../services/analysis.js';
import { renderClips, cleanupRenderDir } from '../services/rendering.js';
import { uploadFile } from '../services/storage.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';

const logger = createLogger('processor');

/**
 * Processador principal - executa todas as etapas sequencialmente
 *
 * Pipeline Atualizado (7 etapas):
 * 1. Ingest      → Download/Upload do vídeo
 * 2. Transcribe  → Transcrição com Whisper
 * 3. Scenes      → Detecção e análise de cenas
 * 4. Rank        → Ranking e seleção dos melhores clipes
 * 5. Render      → Renderização dos vídeos
 * 6. Texts       → Geração de títulos, descrições e hashtags
 * 7. Export      → Upload para storage
 */
export async function processVideo(job: Job<JobData>): Promise<JobResult> {
  const { jobId, userId, sourceType, targetDuration, clipCount } = job.data;
  const startTime = Date.now();

  logger.info({ jobId, userId, sourceType, targetDuration, clipCount }, 'Starting video processing');

  let videoPath: string | undefined;
  let audioPath: string | undefined;
  let renderDir: string | undefined;

  try {
    // ============================================
    // STEP 1: INGEST (Download/Upload)
    // ============================================
    await updateProgress(job, 'ingest', 0, 'Baixando vídeo...');

    const downloadResult = await downloadVideo(
      sourceType,
      job.data.youtubeUrl,
      job.data.uploadPath
    );

    videoPath = downloadResult.videoPath;
    const metadata = downloadResult.metadata;

    logger.info({ jobId, videoPath, metadata }, 'Video downloaded successfully');

    await updateProgress(job, 'ingest', 15, 'Vídeo baixado com sucesso');

    // ============================================
    // STEP 2: TRANSCRIBE (Transcrição)
    // ============================================
    await updateProgress(job, 'transcribe', 20, 'Transcrevendo áudio...');

    const { transcript, audioPath: tempAudioPath } = await transcribeVideo(videoPath, {
      language: 'pt',
      model: 'whisper-1',
      chunkDuration: 300,
      onProgress: async (progress: number, message: string) => {
        await updateProgress(job, 'transcribe', progress, message);
      },
    });

    audioPath = tempAudioPath;

    logger.info(
      { jobId, segments: transcript.segments.length, duration: transcript.duration },
      'Transcription completed'
    );

    await updateProgress(job, 'transcribe', 35, 'Transcrição completa');

    // ============================================
    // STEP 3: SCENES (Detecção de Cenas)
    // ============================================
    await updateProgress(job, 'scenes', 40, 'Analisando cenas do vídeo...');

    const highlightAnalysis = await analyzeHighlights(transcript, {
      targetDuration: targetDuration || 60,
      clipCount: clipCount || 8, // 8-12 clipes conforme requisitos
      minDuration: 30,
      maxDuration: 90,
    });

    logger.info(
      { jobId, highlightCount: highlightAnalysis.segments.length },
      'Scene analysis completed'
    );

    await updateProgress(job, 'scenes', 50, 'Cenas identificadas');

    // ============================================
    // STEP 4: RANK (Seleção e Ranking)
    // ============================================
    await updateProgress(job, 'rank', 55, 'Selecionando melhores momentos...');

    // Ranking is done as part of analyzeHighlights
    // In the future, this could be a separate step with more advanced algorithms
    logger.info(
      { jobId, selectedClips: highlightAnalysis.segments.length },
      'Ranking completed'
    );

    await updateProgress(job, 'rank', 60, `${highlightAnalysis.segments.length} clipes selecionados`);

    // ============================================
    // STEP 5: RENDER (Renderização de Vídeos)
    // ============================================
    await updateProgress(job, 'render', 65, 'Renderizando vídeos...');

    // Buscar preferências de legendas do Redis (se disponíveis)
    const subtitlePreferences = await getSubtitlePreferences(jobId);

    logger.info(
      { jobId, hasCustomPreferences: subtitlePreferences !== DEFAULT_SUBTITLE_PREFERENCES },
      'Subtitle preferences loaded'
    );

    const renderResult = await renderClips(
      videoPath,
      highlightAnalysis.segments,
      transcript,
      {
        format: '9:16', // Vertical para redes sociais
        addSubtitles: true,
        font: subtitlePreferences.font,
        preset: 'ultrafast', // Changed from 'superfast' to 'ultrafast' for better performance
        subtitlePreferences, // Passar preferências personalizadas
        onProgress: async (progress: number, message: string) => {
          await updateProgress(job, 'render', progress, message);
        },
      }
    );

    renderDir = renderResult.outputDir;

    logger.info(
      { jobId, renderedCount: renderResult.clips.length },
      'Clips rendered successfully'
    );

    await updateProgress(job, 'render', 75, `${renderResult.clips.length} vídeos renderizados`);

    // ============================================
    // STEP 6: TEXTS (Títulos, Descrições, Hashtags)
    // ============================================
    await updateProgress(job, 'texts', 80, 'Gerando títulos e descrições...');

    // Texts are already generated in renderResult.clips (from analyzeHighlights)
    // In the future, this could include AI-powered metadata generation
    logger.info(
      { jobId, clipsWithTexts: renderResult.clips.length },
      'Texts generated successfully'
    );

    await updateProgress(job, 'texts', 85, 'Textos gerados com IA');

    // ============================================
    // STEP 7: EXPORT (Upload para Storage)
    // ============================================
    await updateProgress(job, 'export', 90, 'Fazendo upload dos clipes...');

    const bucket = env.supabase.bucket;
    const clips: Clip[] = [];

    // Upload clips em paralelo
    await Promise.all(
      renderResult.clips.map(async (renderedClip, idx) => {
        const clipStoragePath = `clips/${jobId}/${renderedClip.id}.mp4`;
        const thumbnailStoragePath = `clips/${jobId}/${renderedClip.id}.jpg`;

        // Upload video
        const videoUpload = await uploadFile(
          bucket,
          clipStoragePath,
          renderedClip.videoPath,
          'video/mp4'
        );

        // Upload thumbnail
        const thumbnailUpload = await uploadFile(
          bucket,
          thumbnailStoragePath,
          renderedClip.thumbnailPath,
          'image/jpeg'
        );

        clips.push({
          id: renderedClip.id,
          title: renderedClip.segment.title,
          start: renderedClip.segment.start,
          end: renderedClip.segment.end,
          duration: renderedClip.duration,
          score: renderedClip.segment.score,
          transcript: renderedClip.segment.reason,
          keywords: renderedClip.segment.keywords,
          storagePath: videoUpload.publicUrl,
          thumbnail: thumbnailUpload.publicUrl,
        });

        logger.info({ jobId, clipId: renderedClip.id, storageUrl: videoUpload.publicUrl }, 'Clip uploaded');
      })
    );

    await updateProgress(job, 'export', 98, 'Upload completo');

    // ============================================
    // FINALIZAÇÃO
    // ============================================
    await updateProgress(job, 'completed', 100, 'Processamento completo!');

    const processingTime = Date.now() - startTime;

    logger.info(
      { jobId, userId, processingTime, clipCount: clips.length },
      'Video processing completed successfully'
    );

    return {
      jobId,
      status: 'completed',
      clips,
      processingTime,
    };
  } catch (error: any) {
    logger.error({ jobId, userId, error: error.message, stack: error.stack }, 'Video processing failed');

    await updateProgress(job, 'failed', 0, `Erro: ${error.message}`);

    const processingTime = Date.now() - startTime;

    return {
      jobId,
      status: 'failed',
      error: error.message,
      processingTime,
    };
  } finally {
    // Cleanup: remover arquivos temporários
    const cleanupPromises = [];

    if (videoPath) {
      cleanupPromises.push(cleanupVideo(videoPath));
    }

    if (audioPath) {
      cleanupPromises.push(cleanupAudio(audioPath));
    }

    if (renderDir) {
      cleanupPromises.push(cleanupRenderDir(renderDir));
    }

    await Promise.allSettled(cleanupPromises);

    logger.info({ jobId }, 'Cleanup completed');
  }
}

// Helper para atualizar progresso
async function updateProgress(
  job: Job<JobData>,
  step: JobProgress['step'],
  progress: number,
  message: string
) {
  const progressData: JobProgress = {
    jobId: job.data.jobId,
    step,
    progress,
    message,
  };

  await job.updateProgress(progressData);

  logger.debug(
    { jobId: job.data.jobId, step, progress },
    message
  );
}

/**
 * Busca preferências de legendas do Redis
 * Retorna preferências padrão se não houver customizações
 */
async function getSubtitlePreferences(jobId: string): Promise<SubtitlePreferences> {
  try {
    // Buscar preferências globais do job no Redis
    const key = `subtitle:${jobId}:global`;
    const data = await redis.get(key);

    if (data) {
      const preferences = JSON.parse(data);
      logger.info({ jobId, key }, 'Custom subtitle preferences found in Redis');
      return preferences;
    }

    // Se não houver preferências personalizadas, usar padrões
    logger.debug({ jobId }, 'Using default subtitle preferences');
    return DEFAULT_SUBTITLE_PREFERENCES;
  } catch (error: any) {
    logger.warn(
      { jobId, error: error.message },
      'Failed to load subtitle preferences, using defaults'
    );
    return DEFAULT_SUBTITLE_PREFERENCES;
  }
}
