import { Job } from 'bullmq';
import { createLogger } from '../config/logger.js';
import type { JobData, JobResult, JobProgress, Clip, SubtitlePreferences, Transcript } from '../types/index.js';
import { DEFAULT_SUBTITLE_PREFERENCES } from '../types/index.js';
import { downloadVideo, cleanupVideo } from '../services/download.js';
import { transcribeVideo, cleanupAudio } from '../services/transcription.js';
import { analyzeHighlights } from '../services/analysis.js';
import { renderClip, cleanupRenderDir } from '../services/rendering.js';
import { uploadFile } from '../services/storage.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { jobs as dbJobs, clips as dbClips } from '../services/database.service.js';
import { incrementUsage } from '../services/mercadopago.service.js';

const logger = createLogger('processor');

function applyTimeframeToTranscript(
  transcript: Transcript,
  timeframe?: JobData['timeframe']
): Transcript {
  if (!timeframe) {
    return transcript;
  }

  const startTime = Math.max(0, Number(timeframe.startTime || 0));
  const endTime = Math.min(transcript.duration, Number(timeframe.endTime || transcript.duration));

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return transcript;
  }

  const scopedSegments = transcript.segments
    .filter((segment) => segment.end > startTime && segment.start < endTime)
    .map((segment) => ({
      ...segment,
      start: Math.max(segment.start, startTime),
      end: Math.min(segment.end, endTime),
    }))
    .filter((segment) => segment.end > segment.start);

  if (scopedSegments.length === 0) {
    return transcript;
  }

  return {
    ...transcript,
    duration: endTime,
    segments: scopedSegments,
  };
}

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
  const clipSettings = job.data.clipSettings;
  const timeframe = job.data.timeframe;
  const genre = job.data.genre;
  const specificMoments = job.data.specificMoments;

  const effectiveTargetDuration = clipSettings?.targetDuration ?? targetDuration ?? 60;
  const effectiveClipCount = clipSettings?.clipCount ?? clipCount ?? 8;
  const effectiveMinDuration = clipSettings?.minDuration ?? 30;
  const effectiveMaxDuration = clipSettings?.maxDuration ?? 90;
  const clippingModel = clipSettings?.model ?? 'ClipAnything';
  const effectiveAspectRatio = job.data.aspectRatio || '9:16';
  const startTime = Date.now();

  logger.info(
    {
      jobId,
      userId,
      sourceType,
      targetDuration: effectiveTargetDuration,
      clipCount: effectiveClipCount,
      minDuration: effectiveMinDuration,
      maxDuration: effectiveMaxDuration,
      model: clippingModel,
      hasTimeframe: Boolean(timeframe),
      genre,
      hasSpecificMoments: Boolean(specificMoments),
      aspectRatio: effectiveAspectRatio,
    },
    'Starting video processing'
  );

  let videoPath: string | undefined;
  let audioPath: string | undefined;

  try {
    // Salvar job inicial no banco de dados
    await dbJobs.insert({
      id: jobId,
      user_id: userId,
      source_type: sourceType,
      youtube_url: job.data.youtubeUrl,
      upload_path: job.data.uploadPath,
      target_duration: effectiveTargetDuration,
      clip_count: effectiveClipCount,
      status: 'processing',
    });

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

    // Atualizar job com caminho do vídeo (necessário para reprocessamento)
    await dbJobs.update(jobId, {
      video_path: videoPath,
      metadata: metadata,
    });

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

    if (audioPath) {
      await cleanupAudio(audioPath);
      audioPath = undefined;
      logger.info({ jobId }, 'Temporary audio cleaned up after transcription');
    }

    await updateProgress(job, 'transcribe', 35, 'Transcrição completa');

    // ============================================
    // STEP 3: SCENES (Detecção de Cenas)
    // ============================================
    await updateProgress(job, 'scenes', 40, 'Analisando cenas do vídeo...');

    const transcriptForAnalysis = applyTimeframeToTranscript(transcript, timeframe);

    const highlightAnalysis = await analyzeHighlights(transcriptForAnalysis, {
      targetDuration: effectiveTargetDuration,
      clipCount: effectiveClipCount,
      minDuration: effectiveMinDuration,
      maxDuration: effectiveMaxDuration,
      model: clippingModel,
      genre,
      specificMoments,
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
    const subtitlePreferences = await getSubtitlePreferences(jobId, job.data.subtitlePreferences);

    logger.info(
      { jobId, hasCustomPreferences: subtitlePreferences !== DEFAULT_SUBTITLE_PREFERENCES },
      'Subtitle preferences loaded'
    );

    const bucket = env.supabase.bucket;
    const clips: Clip[] = [];

    for (const [idx, segment] of highlightAnalysis.segments.entries()) {
      const clipId = `clip-${idx}`;
      let clipOutputDir: string | undefined;

      try {
        const rendered = await renderClip(
          videoPath,
          segment,
          transcript,
          clipId,
          {
            clipIndex: idx,
            totalClips: highlightAnalysis.segments.length,
            format: effectiveAspectRatio,
            addSubtitles: true,
            font: subtitlePreferences.font,
            preset: 'ultrafast',
            subtitlePreferences,
            onProgress: async (progress: number, message: string) => {
              await updateProgress(job, 'render', progress, message);
            },
          }
        );

        clipOutputDir = rendered.outputDir;
        const renderedClip = rendered.clip;
        const clipStoragePath = `clips/${jobId}/${renderedClip.id}.mp4`;
        const thumbnailStoragePath = `clips/${jobId}/${renderedClip.id}.jpg`;

        const videoUpload = await uploadFile(
          bucket,
          clipStoragePath,
          renderedClip.videoPath,
          'video/mp4'
        );

        const thumbnailUpload = await uploadFile(
          bucket,
          thumbnailStoragePath,
          renderedClip.thumbnailPath,
          'image/jpeg'
        );

        const clipData = {
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
        };

        clips.push(clipData);

        await dbClips.upsert({
          id: renderedClip.id,
          job_id: jobId,
          user_id: userId,
          title: renderedClip.segment.title,
          description: renderedClip.segment.reason || '',
          hashtags: renderedClip.segment.keywords || [],
          start_time: renderedClip.segment.start,
          end_time: renderedClip.segment.end,
          duration: renderedClip.duration,
          video_url: videoUpload.publicUrl,
          thumbnail_url: thumbnailUpload.publicUrl,
          storage_path: clipStoragePath,
          thumbnail_storage_path: thumbnailStoragePath,
          transcript: transcript,
        });

        logger.info({ jobId, clipId: renderedClip.id, storageUrl: videoUpload.publicUrl }, 'Clip rendered, uploaded and saved to database');
      } catch (clipError: any) {
        logger.error(
          { jobId, clipId, clipIndex: idx, error: clipError.message, stack: clipError.stack },
          'Failed to render/upload clip, skipping to next'
        );
      } finally {
        if (clipOutputDir) {
          await cleanupRenderDir(clipOutputDir);
        }
      }
    }

    if (clips.length === 0) {
      throw new Error('All clips failed to render');
    }

    logger.info(
      { jobId, renderedCount: clips.length },
      'Clips rendered successfully'
    );

    await updateProgress(job, 'render', 75, `${clips.length} vídeos renderizados`);

    // ============================================
    // STEP 6: TEXTS (Títulos, Descrições, Hashtags)
    // ============================================
    await updateProgress(job, 'texts', 80, 'Gerando títulos e descrições...');

    logger.info(
      { jobId, clipsWithTexts: clips.length },
      'Texts generated successfully'
    );

    await updateProgress(job, 'texts', 85, 'Textos gerados com IA');

    // ============================================
    // STEP 7: EXPORT (Upload para Storage)
    // ============================================
    await updateProgress(job, 'export', 90, 'Finalizando processamento...');

    await updateProgress(job, 'export', 98, 'Upload completo');

    // Salvar dados necessários para reprocessamento no Redis
    // Armazenar caminho do vídeo original e transcrição
    const reprocessDataKey = `reprocess:${jobId}`;
    await redis.set(
      reprocessDataKey,
      JSON.stringify({
            videoPath,
            transcript,
            jobData: {
              userId,
              sourceType,
              youtubeUrl: job.data.youtubeUrl,
              uploadPath: job.data.uploadPath,
              targetDuration: effectiveTargetDuration,
              clipCount: effectiveClipCount,
              timeframe: job.data.timeframe,
              genre: job.data.genre,
              specificMoments: job.data.specificMoments,
            },
          }),
      'EX',
      60 * 60 * 24 * 30 // 30 days
    );

    // Salvar dados de cada clip (start, end, transcript)
    for (const clip of highlightAnalysis.segments.map((segment, idx) => ({
      id: `clip-${idx}`,
      segment,
    }))) {
      const clipReprocessKey = `reprocess:${jobId}:${clip.id}`;
      await redis.set(
        clipReprocessKey,
        JSON.stringify({
          id: clip.id,
          start: clip.segment.start,
          end: clip.segment.end,
          title: clip.segment.title,
        }),
        'EX',
        60 * 60 * 24 * 30 // 30 days
      );
    }

    logger.info({ jobId }, 'Reprocess data saved to Redis');

    // Debit usage only after successful processing/export.
    // Use per-job idempotency keys so retries do not double-charge.
    const processedMinutes = Math.max(1, Math.ceil(transcriptForAnalysis.duration / 60));
    const generatedClips = Math.max(1, clips.length);
    await incrementUsage(userId, 'minute', processedMinutes, `job:${jobId}:minute`, 'job_completed');
    await incrementUsage(userId, 'clip', generatedClips, `job:${jobId}:clip`, 'job_completed');

    await updateProgress(job, 'completed', 100, 'Processamento completo!');

    // Atualizar status do job para completed
    await dbJobs.update(jobId, {
      status: 'completed',
      completed_at: new Date(),
    });

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

    // Atualizar status do job para failed
    await dbJobs.update(jobId, {
      status: 'failed',
      error: error.message,
    });

    // Re-throw so BullMQ properly marks the job as failed (not completed)
    throw error;
  } finally {
    // Cleanup: remover arquivos temporários
    const cleanupPromises = [];

    if (videoPath) {
      cleanupPromises.push(cleanupVideo(videoPath));
    }

    if (audioPath) {
      cleanupPromises.push(cleanupAudio(audioPath));
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
  const normalizedProgress = Number.isFinite(progress)
    ? Math.max(0, Math.min(100, Math.round(progress)))
    : 0;

  const progressData: JobProgress = {
    jobId: job.data.jobId,
    step,
    progress: normalizedProgress,
    message,
  };

  try {
    await job.updateProgress(progressData);
  } catch (error: any) {
    logger.warn(
      { jobId: job.data.jobId, step, progress: normalizedProgress, error: error.message },
      'Queue progress update failed'
    );
  }

  try {
    await dbJobs.update(job.data.jobId, {
      progress: normalizedProgress,
      current_step: step,
      current_step_message: message,
    });
  } catch (error: any) {
    logger.warn(
      { jobId: job.data.jobId, step, progress: normalizedProgress, error: error.message },
      'Database progress update failed'
    );
  }

  logger.debug(
    { jobId: job.data.jobId, step, progress: normalizedProgress },
    message
  );
}

/**
 * Busca preferências de legendas do Redis
 * Retorna preferências padrão se não houver customizações
 */
async function getSubtitlePreferences(
  jobId: string,
  fromJobData?: SubtitlePreferences
): Promise<SubtitlePreferences> {
  try {
    // Buscar preferências globais do job no Redis
    const key = `subtitle:${jobId}:global`;
    const data = await redis.get(key);

    if (data) {
      const preferences = JSON.parse(data);
      logger.info({ jobId, key }, 'Custom subtitle preferences found in Redis');
      return preferences;
    }

    if (fromJobData) {
      logger.info({ jobId }, 'Using subtitle preferences from job payload');
      return fromJobData;
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
