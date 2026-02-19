import { Job } from 'bullmq';
import { createLogger } from '../config/logger.js';
import type { JobData, JobResult, JobProgress, Clip, SubtitlePreferences, ViralClipOptions } from '../types/index.js';
import { DEFAULT_SUBTITLE_PREFERENCES, DEFAULT_VIRAL_CLIP_OPTIONS } from '../types/index.js';
import { downloadVideo, cleanupVideo } from '../services/download.js';
import { transcribeVideo, cleanupAudio } from '../services/transcription.js';
import { analyzeHighlights, generateAutoClips } from '../services/analysis.js';
import { renderClips, cleanupRenderDir } from '../services/rendering.js';
import { uploadFile } from '../services/storage.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { jobs as dbJobs, clips as dbClips } from '../services/database.service.js';
import { buildVariationsFromMetadata } from '../services/viral-insights-lite.js';
import { calculateViralityScore } from '../services/virality-score.js';
import { generateSeoMetadata } from '../services/metadata-generator.js';
import { sendJobCompletedEmail, sendJobFailedEmail } from '../services/job-notification.service.js';
import * as mp from '../services/mercadopago.service.js';

const logger = createLogger('processor');

function buildFallbackClipDescription(text: string, keywords: string[]): string {
  const cleaned = (text || '')
    .replace(/[^\p{L}\p{N}\s.!?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned) {
    const firstSentence = cleaned.split(/[.!?]/)[0]?.trim() || '';
    const snippet = firstSentence.length >= 28 ? firstSentence : cleaned;
    const clipped = snippet.length > 90 ? `${snippet.slice(0, 87).trim()}...` : snippet;
    if (clipped) return clipped;
  }

  if (Array.isArray(keywords) && keywords.length > 0) {
    const topics = keywords.slice(0, 3).join(', ');
    if (topics) return `Trecho sobre ${topics}.`;
  }

  return 'Trecho selecionado automaticamente.';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateAutoClipCount(videoDurationSeconds: number, targetDurationSeconds: number): number {
  const configuredMinAutoClips = Number.parseInt(process.env.MIN_AUTO_CLIPS || '', 10);
  const minAutoClips = Number.isFinite(configuredMinAutoClips)
    ? clamp(configuredMinAutoClips, 1, 20)
    : 8;

  if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
    return minAutoClips;
  }

  const configuredMaxAutoClips = Number.parseInt(process.env.MAX_AUTO_CLIPS || '', 10);
  const maxAutoClips = Number.isFinite(configuredMaxAutoClips)
    ? clamp(configuredMaxAutoClips, minAutoClips, 50)
    : 30;

  // Aproxima 1 corte a cada ~3 minutos para vídeos longos (ajustado pelo targetDuration)
  const intervalSeconds = Math.max(150, (targetDurationSeconds || 60) * 4);
  const estimated = Math.ceil(videoDurationSeconds / intervalSeconds);
  return clamp(estimated, minAutoClips, maxAutoClips);
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
  const { jobId, userId, sourceType, targetDuration } = job.data;
  const processingModel = job.data.model || 'ClipAnything';
  const requestedClipCount = job.data.clipCount;
  let effectiveClipCount = requestedClipCount > 0 ? requestedClipCount : 0;
  const startTime = Date.now();

  logger.info(
    { jobId, userId, sourceType, targetDuration, requestedClipCount, effectiveClipCount },
    'Starting video processing'
  );

  let videoPath: string | undefined;
  let audioPath: string | undefined;
  let renderDir: string | undefined;
  let minutesToCharge = 0;

  try {
    // Salvar job inicial no banco de dados
    try {
      await dbJobs.insert({
        id: jobId,
        user_id: userId,
        source_type: sourceType,
        youtube_url: job.data.youtubeUrl,
        upload_path: job.data.uploadPath,
        target_duration: targetDuration,
        clip_count: effectiveClipCount,
        status: 'processing',
      });
    } catch (insertErr: any) {
      if (String(insertErr.message || '').includes('duplicate key')) {
        logger.warn({ jobId }, 'Job already exists in DB, continuing with processing');
        await dbJobs.update(jobId, {
          status: 'processing',
          target_duration: targetDuration,
          clip_count: effectiveClipCount,
        });
      } else {
        throw insertErr;
      }
    }

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

    const videoDurationSeconds = typeof metadata?.duration === 'number' ? metadata.duration : 0;
    const normalizedTargetDuration = targetDuration || 60;

    // Modo automático: escala quantidade de cortes para vídeos longos.
    if (requestedClipCount <= 0) {
      const autoClipCount = estimateAutoClipCount(videoDurationSeconds, normalizedTargetDuration);
      if (autoClipCount !== effectiveClipCount) {
        effectiveClipCount = autoClipCount;
        await dbJobs.update(jobId, { clip_count: effectiveClipCount });
      }
      logger.info(
        { jobId, videoDurationSeconds, targetDuration: normalizedTargetDuration, autoClipCount: effectiveClipCount },
        'Auto clip count calculated'
      );
    }

    // Enforce subscription quotas early (avoid spending tokens/cpu when user has no quota)
    try {
      const [clipLimits, minuteLimits] = await Promise.all([
        mp.checkUserLimits(userId, 'clip'),
        mp.checkUserLimits(userId, 'minute'),
      ]);

      const clipsRemaining = Math.max(0, clipLimits.maxAllowed - clipLimits.currentUsage);
      if (clipsRemaining <= 0) {
        throw new Error(`LIMIT_EXCEEDED: Você atingiu o limite de clips do plano ${clipLimits.planName}`);
      }

      if (effectiveClipCount > clipsRemaining) {
        logger.warn(
          { jobId, userId, requested: effectiveClipCount, remaining: clipsRemaining },
          'Requested clipCount exceeds remaining quota, clamping'
        );
        effectiveClipCount = clipsRemaining;
        await dbJobs.update(jobId, { clip_count: effectiveClipCount });
      }

      minutesToCharge = Math.max(1, Math.ceil(videoDurationSeconds / 60));
      const minutesRemaining = Math.max(0, minuteLimits.maxAllowed - minuteLimits.currentUsage);

      if (minutesToCharge > minutesRemaining) {
        throw new Error(
          `LIMIT_EXCEEDED: Você precisa de ${minutesToCharge} min para processar este vídeo, mas só restam ${minutesRemaining} min no plano ${minuteLimits.planName}`
        );
      }
    } catch (limitErr: any) {
      // Fail-closed for quota checks (avoid runaway costs)
      logger.warn({ jobId, userId, error: limitErr.message }, 'Quota check failed or exceeded');
      throw limitErr;
    }

    const downloadedVideoTitle = typeof metadata?.title === 'string' ? metadata.title.trim() : '';

    // Atualizar job com caminho do vídeo e título (necessário para reprocessamento e listagem)
    await dbJobs.update(jobId, {
      video_path: videoPath,
      metadata: metadata,
      title: downloadedVideoTitle || undefined,
    });

    await updateProgress(job, 'ingest', 15, 'Vídeo baixado com sucesso');

    // ============================================
    // STEP 2: TRANSCRIBE (Transcrição)
    // ============================================
    await updateProgress(job, 'transcribe', 20, 'Transcrevendo áudio...');

    const transcriptionChunkDuration = processingModel === 'Fast' ? 180 : 120;
    const { transcript, audioPath: tempAudioPath } = await transcribeVideo(videoPath, {
      language: 'pt',
      model: 'whisper-1',
      // Use larger chunks to reduce number of Whisper calls and avoid rate limits.
      chunkDuration: transcriptionChunkDuration,
      youtubeUrl: job.data.sourceType === 'youtube' ? job.data.youtubeUrl : undefined,
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

    const aiClippingEnabled = job.data.aiClipping !== false;
    const minDuration = typeof job.data.minDuration === 'number' ? job.data.minDuration : 15;
    const maxDuration = typeof job.data.maxDuration === 'number' ? job.data.maxDuration : 90;

    const highlightAnalysis = aiClippingEnabled
      ? await analyzeHighlights(transcript, {
          targetDuration: targetDuration || 60,
          clipCount: effectiveClipCount,
          minDuration,
          maxDuration,
        })
      : generateAutoClips(transcript, {
          targetDuration: targetDuration || 60,
          clipCount: effectiveClipCount,
          minDuration,
          maxDuration,
        });

    const selectedSegments = (highlightAnalysis.segments || []).slice(0, effectiveClipCount);

    logger.info(
      { jobId, highlightCount: selectedSegments.length, aiClippingEnabled },
      'Scene analysis completed'
    );

    // O analyzeHighlights agora SEMPRE retorna segmentos (usa fallback automático)
    // Mas por segurança, verificamos e logamos se algo estranho acontecer
    if (!selectedSegments || selectedSegments.length === 0) {
      logger.warn(
        { jobId, userId, transcriptSegments: transcript.segments?.length },
        'No highlights returned - this should not happen with the new fallback system'
      );
      // Não lançamos mais erro - o sistema de fallback deve ter gerado clipes
    }

    await updateProgress(job, 'scenes', 50, 'Cenas identificadas');

    // ============================================
    // STEP 4: RANK (Seleção e Ranking)
    // ============================================
    await updateProgress(job, 'rank', 55, 'Selecionando melhores momentos...');

    // Ranking is done as part of analyzeHighlights
    // In the future, this could be a separate step with more advanced algorithms
    logger.info(
      { jobId, selectedClips: selectedSegments.length },
      'Ranking completed'
    );

    await updateProgress(job, 'rank', 60, `${selectedSegments.length} clipes selecionados`);

    // ============================================
    // STEP 5: RENDER (Renderização de Vídeos)
    // ============================================
    await updateProgress(job, 'render', 65, 'Renderizando vídeos...');

    // Buscar preferências de legendas do Redis (se disponíveis)
    const subtitlePreferences = await getSubtitlePreferences(jobId);
    const clipOptions = await getClipOptions(jobId);
    const targetAspectRatio = clipOptions.targetAspectRatio || '9:16';

    logger.info(
      { jobId, hasCustomPreferences: subtitlePreferences !== DEFAULT_SUBTITLE_PREFERENCES },
      'Subtitle preferences loaded'
    );

    const reframeOptions = {
      enabled: clipOptions.applyReframe !== false,
      targetAspectRatio,
      autoDetect: true,
      sampleInterval: 2,
      minConfidence: 0.5,
      trackingMode: clipOptions.reframeTracking ?? 'auto',
      enableMotion: true,
    };

    const renderPresetFromEnv = (process.env.RENDER_PRESET || '').toLowerCase();
    const validRenderPresets = ['ultrafast', 'superfast', 'veryfast', 'fast', 'medium'] as const;
    const defaultRenderPreset = processingModel === 'Fast'
      ? 'ultrafast'
      : processingModel === 'Smart'
        ? 'superfast'
        : 'veryfast';
    const renderPreset = validRenderPresets.includes(renderPresetFromEnv as any)
      ? (renderPresetFromEnv as typeof validRenderPresets[number])
      : defaultRenderPreset;

    logger.info(
      { jobId, processingModel, renderPreset, transcriptionChunkDuration },
      'Processing performance profile'
    );

    const renderResult = await renderClips(
      videoPath,
      selectedSegments,
      transcript,
      {
        format: targetAspectRatio,
        addSubtitles: subtitlePreferences.enabled !== false,
        font: subtitlePreferences.font,
        preset: renderPreset,
        subtitlePreferences, // Passar preferências personalizadas
        reframeMode: clipOptions.reframeMode || 'auto',
        stackedLayoutOptions: clipOptions.stackedLayoutOptions,
        reframeOptions,
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

    // CRITICAL: Fail job if no clips were rendered
    if (!renderResult.clips || renderResult.clips.length === 0) {
      const errorMsg = 'A renderização não produziu nenhum clipe. ' +
        'Isso pode indicar um problema no processamento do vídeo. ' +
        'Tente novamente ou use outro vídeo.';

      logger.error(
        { jobId, userId, segmentsCount: selectedSegments.length },
        'No clips rendered - failing job'
      );

      throw new Error(errorMsg);
    }

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
      renderResult.clips.map(async (renderedClip) => {
        const stableClipId = `${jobId}_${renderedClip.id}`;
        const clipStoragePath = `clips/${jobId}/${stableClipId}.mp4`;
        const thumbnailStoragePath = `clips/${jobId}/${stableClipId}.jpg`;

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

        // Calculate real virality score from pipeline data
        // Extract transcript text for this clip's time range
        const clipTranscriptSegments = transcript.segments?.filter(
          (s: any) => s.start >= renderedClip.segment.start && s.end <= renderedClip.segment.end
        ) || [];
        const clipTranscriptText = clipTranscriptSegments.map((s: any) => s.text).join(' ');

        const stableDescription = String(renderedClip.segment.reason || '').trim()
          || buildFallbackClipDescription(
            clipTranscriptText,
            Array.isArray(renderedClip.segment.keywords) ? renderedClip.segment.keywords : []
          );

        // Build viral insights (hook analysis, score breakdown, variations)
        const viralInsights = buildVariationsFromMetadata({
          id: renderedClip.id,
          title: renderedClip.segment.title,
          description: stableDescription,
          hashtags: renderedClip.segment.keywords || [],
          duration: renderedClip.duration,
        });

        let viralityData;
        try {
          viralityData = calculateViralityScore({
            gptScore: renderedClip.segment.score || 0.5,
            title: renderedClip.segment.title,
            reason: stableDescription,
            keywords: renderedClip.segment.keywords || [],
            duration: renderedClip.duration,
            transcript: clipTranscriptText || stableDescription,
          });
        } catch (viralErr: any) {
          logger.warn({ clipId: stableClipId, error: viralErr.message }, 'Virality score failed, using defaults');
          viralityData = { viralityScore: 50, viralityComponents: { hookStrength: 50, contentDensity: 50, emotionalImpact: 50, narrativeArc: 50 }, viralityLabel: 'medium' as const };
        }

        const seoMetadata = await generateSeoMetadata({
          title: renderedClip.segment.title,
          description: stableDescription,
          transcript: clipTranscriptText || stableDescription,
          keywords: renderedClip.segment.keywords || [],
          platform: 'tiktok',
        });
        const displayDescription = String(seoMetadata.seoDescription || '').trim() || stableDescription;

        const clipData = {
          id: stableClipId,
          title: renderedClip.segment.title,
          start: renderedClip.segment.start,
          end: renderedClip.segment.end,
          duration: renderedClip.duration,
          score: renderedClip.segment.score,
          transcript: stableDescription,
          format: { aspectRatio: targetAspectRatio },
          reframeSettings: renderedClip.reframeResult,
          captions: clipTranscriptSegments.map((s: any) => ({
            start: s.start,
            end: s.end,
            text: s.text,
          })),
          keywords: renderedClip.segment.keywords,
          storagePath: videoUpload.publicUrl,
          thumbnail: thumbnailUpload.publicUrl,
          hookAnalysis: viralInsights.hookAnalysis,
          scoreBreakdown: viralInsights.scoreBreakdown,
          hookVariations: viralInsights.hookVariations,
          seoTitle: seoMetadata.seoTitle,
          seoDescription: seoMetadata.seoDescription,
          seoHashtags: seoMetadata.seoHashtags,
          seoVariants: seoMetadata.seoVariants,
          seoSelectedIndex: seoMetadata.seoSelectedIndex,
          viralityScore: viralityData.viralityScore,
          viralityComponents: viralityData.viralityComponents,
          viralityLabel: viralityData.viralityLabel,
        };

        clips.push(clipData);

        // Salvar clip no banco de dados (upsert para evitar duplicatas)
        await dbClips.upsert({
          id: stableClipId,
          job_id: jobId,
          user_id: userId,
          title: renderedClip.segment.title,
          description: displayDescription,
          hashtags: renderedClip.segment.keywords || [],
          seo_title: seoMetadata.seoTitle,
          seo_description: seoMetadata.seoDescription,
          seo_hashtags: seoMetadata.seoHashtags,
          seo_variants: seoMetadata.seoVariants,
          seo_selected_index: seoMetadata.seoSelectedIndex,
          start_time: renderedClip.segment.start,
          end_time: renderedClip.segment.end,
          duration: renderedClip.duration,
          video_url: videoUpload.publicUrl,
          thumbnail_url: thumbnailUpload.publicUrl,
          storage_path: clipStoragePath,
          thumbnail_storage_path: thumbnailStoragePath,
          transcript: transcript, // Transcrição completa necessária para reprocessamento
          ai_score: viralityData.viralityScore,
          virality_components: viralityData.viralityComponents,
          virality_label: viralityData.viralityLabel,
        });

        logger.info({ jobId, clipId: stableClipId, storageUrl: videoUpload.publicUrl }, 'Clip uploaded and saved to database');
      })
    );

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
        },
      }),
      'EX',
      60 * 60 * 24 * 30 // 30 days
    );

    // Salvar dados de cada clip (start, end, transcript)
    for (const clip of clips) {
      const clipReprocessKey = `reprocess:${jobId}:${clip.id}`;
      await redis.set(
        clipReprocessKey,
        JSON.stringify({
          id: clip.id,
          start: clip.start,
          end: clip.end,
          title: clip.title,
          format: targetAspectRatio,
          reframeSettings: clip.reframeSettings,
        }),
        'EX',
        60 * 60 * 24 * 30 // 30 days
      );
    }

    logger.info({ jobId }, 'Reprocess data saved to Redis');

    await updateProgress(job, 'completed', 100, 'Processamento completo!');

    // Atualizar status do job para completed
    await dbJobs.update(jobId, {
      status: 'completed',
      completed_at: new Date(),
    });

    // Track usage (only after successful completion)
    try {
      await Promise.all([
        mp.incrementUsage(userId, 'minute', minutesToCharge || 1, jobId, 'job', `${jobId}:minute`),
        mp.incrementUsage(userId, 'clip', clips.length, jobId, 'job', `${jobId}:clip`),
      ]);
    } catch (usageErr: any) {
      logger.warn({ jobId, userId, error: usageErr.message }, 'Failed to record usage');
    }

    const processingTime = Date.now() - startTime;

    try {
      await sendJobCompletedEmail({
        userId,
        jobId,
        clipCount: clips.length,
        processingTimeMs: processingTime,
      });
    } catch (notificationErr: any) {
      logger.warn(
        { jobId, userId, error: notificationErr?.message },
        'Failed to send job completion email'
      );
    }

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

    const processingTime = Date.now() - startTime;

    try {
      await sendJobFailedEmail({
        userId,
        jobId,
        errorMessage: error.message || 'Erro desconhecido',
        processingTimeMs: processingTime,
      });
    } catch (notificationErr: any) {
      logger.warn(
        { jobId, userId, error: notificationErr?.message },
        'Failed to send job failure email'
      );
    }

    throw error; // Garantir que o worker marque como failed
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

  // Atualizar também no banco de dados
  await dbJobs.update(job.data.jobId, {
    progress,
    current_step: step,
    current_step_message: message,
  });

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

/**
 * Busca opções de reenquadramento do Redis
 * Retorna defaults se não houver customizações
 */
async function getClipOptions(jobId: string): Promise<ViralClipOptions> {
  try {
    const key = `clipOptions:${jobId}:global`;
    const data = await redis.get(key);

    if (data) {
      const options = JSON.parse(data) as Partial<ViralClipOptions>;
      logger.info({ jobId, key }, 'Custom clip options found in Redis');
      return {
        ...DEFAULT_VIRAL_CLIP_OPTIONS,
        ...options,
        dualFocusOptions: {
          ...DEFAULT_VIRAL_CLIP_OPTIONS.dualFocusOptions,
          ...options.dualFocusOptions,
        },
        stackedLayoutOptions: {
          ...DEFAULT_VIRAL_CLIP_OPTIONS.stackedLayoutOptions,
          ...options.stackedLayoutOptions,
        },
      };
    }

    logger.debug({ jobId }, 'Using default clip options');
    return DEFAULT_VIRAL_CLIP_OPTIONS;
  } catch (error: any) {
    logger.warn(
      { jobId, error: error.message },
      'Failed to load clip options, using defaults'
    );
    return DEFAULT_VIRAL_CLIP_OPTIONS;
  }
}
