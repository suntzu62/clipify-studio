import { Job } from 'bullmq';
import { createLogger } from '../config/logger.js';
import type { JobData, JobResult, JobProgress, Clip } from '../types/index.js';
import { downloadVideo, cleanupVideo } from '../services/download.js';
import { transcribeVideo, cleanupAudio } from '../services/transcription.js';
import { analyzeHighlights } from '../services/analysis.js';
import { renderClips, cleanupRenderDir } from '../services/rendering.js';
import { uploadFile } from '../services/storage.js';
import { env } from '../config/env.js';

const logger = createLogger('processor');

/**
 * Processador principal - executa todas as etapas sequencialmente
 *
 * Pipeline:
 * 1. Download/Upload → videoPath, metadata
 * 2. Transcription   → transcript
 * 3. Analysis        → highlights (timestamps + scores)
 * 4. Rendering       → clips (vídeos cortados)
 * 5. Upload          → storagePaths
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
    // STEP 1: DOWNLOAD/UPLOAD
    // ============================================
    await updateProgress(job, 'downloading', 0, 'Baixando vídeo...');

    const downloadResult = await downloadVideo(
      sourceType,
      job.data.youtubeUrl,
      job.data.uploadPath
    );

    videoPath = downloadResult.videoPath;
    const metadata = downloadResult.metadata;

    logger.info({ jobId, videoPath, metadata }, 'Video downloaded successfully');

    await updateProgress(job, 'downloading', 15, 'Vídeo baixado com sucesso');

    // ============================================
    // STEP 2: TRANSCRIPTION
    // ============================================
    await updateProgress(job, 'transcribing', 20, 'Transcrevendo áudio...');

    const { transcript, audioPath: tempAudioPath } = await transcribeVideo(videoPath, {
      language: 'pt',
      model: 'whisper-1',
      chunkDuration: 300,
    });

    audioPath = tempAudioPath;

    logger.info(
      { jobId, segments: transcript.segments.length, duration: transcript.duration },
      'Transcription completed'
    );

    await updateProgress(job, 'transcribing', 45, 'Transcrição completa');

    // ============================================
    // STEP 3: AI ANALYSIS
    // ============================================
    await updateProgress(job, 'analyzing', 50, 'Analisando melhores momentos...');

    const highlightAnalysis = await analyzeHighlights(transcript, {
      targetDuration: targetDuration || 60,
      clipCount: clipCount || 5,
      minDuration: 30,
      maxDuration: 120,
    });

    logger.info(
      { jobId, highlightCount: highlightAnalysis.segments.length },
      'Highlight analysis completed'
    );

    await updateProgress(job, 'analyzing', 60, `${highlightAnalysis.segments.length} highlights identificados`);

    // ============================================
    // STEP 4: RENDERING
    // ============================================
    await updateProgress(job, 'rendering', 65, 'Renderizando clipes...');

    const renderResult = await renderClips(
      videoPath,
      highlightAnalysis.segments,
      transcript,
      {
        format: '9:16', // Vertical para redes sociais
        addSubtitles: true,
        font: 'Inter',
        preset: 'superfast',
      }
    );

    renderDir = renderResult.outputDir;

    logger.info(
      { jobId, renderedCount: renderResult.clips.length },
      'Clips rendered successfully'
    );

    await updateProgress(job, 'rendering', 85, `${renderResult.clips.length} clipes renderizados`);

    // ============================================
    // STEP 5: UPLOAD TO STORAGE
    // ============================================
    await updateProgress(job, 'uploading', 90, 'Fazendo upload dos clipes...');

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

    await updateProgress(job, 'uploading', 98, 'Upload completo');

    // ============================================
    // FINALIZAÇÃ O
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
