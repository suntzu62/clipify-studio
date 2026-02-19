import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { z } from 'zod';
import {
  CreateJobSchema,
  type JobData,
  SubtitlePreferencesSchema,
  CreateTempConfigSchema,
  StartJobFromTempSchema,
  DEFAULT_CLIP_SETTINGS,
  DEFAULT_SUBTITLE_PREFERENCES,
  DEFAULT_VIRAL_INTELLIGENCE,
  type ProjectConfig,
} from '../types/index.js';
import { addVideoJob, getJobStatus, cancelJob, getQueueHealth, videoQueue } from '../jobs/queue.js';
import { getPublishQueueHealth } from '../jobs/publish-queue.js';
import { createLogger } from '../config/logger.js';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { redis, setTempConfig, getTempConfig, deleteTempConfig } from '../config/redis.js';
import { registerSocialMediaRoutes } from './social-media.js';
import { registerCommercialRoutes } from './commercial.routes.js';
import { registerAuthRoutes } from './auth.routes.js';
import { registerPaymentsRoutes } from './payments.routes.js';
import { registerAdminRoutes } from './admin.routes.js';
import { authenticateJWT, optionalAuth } from '../middleware/auth.middleware.js';
import { checkClipLimit } from '../middleware/subscription.middleware.js';
import { requireBetaAllowlist } from '../middleware/beta.middleware.js';
import { rateLimitByUser } from '../middleware/rate-limit.middleware.js';
import { reprocessClip } from '../services/clip-reprocessor.js';
import { generateSeoMetadata } from '../services/metadata-generator.js';
import * as db from '../services/database.service.js';
import { pool } from '../services/database.service.js';

const logger = createLogger('routes');
const dbJobs = db.jobs;

// Criar cliente Supabase global com service_key (bypassa RLS automaticamente) - apenas se configurado
const supabaseClient = env.supabase.url && env.supabase.serviceKey
  ? createClient(env.supabase.url, env.supabase.serviceKey)
  : null;

type ProgressPayload = { progress?: number; message?: string; [key: string]: unknown };

const isProgressPayload = (value: unknown): value is ProgressPayload =>
  typeof value === 'object' && value !== null && 'progress' in value;

const getProgressValue = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (isProgressPayload(value) && typeof value.progress === 'number') {
    return value.progress;
  }
  return 0;
};

const ensureProgressPayload = (value: unknown, progress: number): number | ProgressPayload => {
  if (isProgressPayload(value)) {
    return { ...value, progress };
  }
  return progress;
};

const hasClips = (value: unknown): value is { clips: Array<any> } =>
  typeof value === 'object'
  && value !== null
  && 'clips' in value
  && Array.isArray((value as { clips?: unknown }).clips);

export async function registerRoutes(app: FastifyInstance) {
  const resolveJobOwnerId = async (jobId: string): Promise<string | null> => {
    try {
      const jobRow = await dbJobs.findById(jobId);
      const dbUserId = (jobRow as any)?.user_id;
      if (typeof dbUserId === 'string' && dbUserId.trim()) {
        return dbUserId;
      }
    } catch (error: any) {
      logger.debug({ jobId, error: error?.message }, 'Failed to resolve job owner from DB');
    }

    try {
      const status = await getJobStatus(jobId);
      const queueUserId = (status?.data as any)?.userId;
      if (typeof queueUserId === 'string' && queueUserId.trim()) {
        return queueUserId;
      }
    } catch (error: any) {
      logger.debug({ jobId, error: error?.message }, 'Failed to resolve job owner from queue');
    }

    return null;
  };

  const requireJobOwnership = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const jobId = (request.params as any)?.jobId as string | undefined;
    const userId = request.user?.userId;

    if (!jobId || !userId) {
      return;
    }

    const ownerId = await resolveJobOwnerId(jobId);

    if (!ownerId || ownerId !== userId) {
      return reply.status(404).send({
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }
  };

  const requireProjectOwnership = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const projectId = (request.params as any)?.projectId as string | undefined;
    const userId = request.user?.userId;

    if (!projectId || !userId) {
      return;
    }

    const ownerId = await resolveJobOwnerId(projectId);

    if (!ownerId || ownerId !== userId) {
      return reply.status(404).send({
        error: 'JOB_NOT_FOUND',
        message: `Job ${projectId} not found`,
      });
    }
  };

  // ============================================
  // AUTHENTICATION ROUTES
  // ============================================
  await registerAuthRoutes(app);

  // ============================================
  // PAYMENTS & SUBSCRIPTIONS ROUTES
  // ============================================
  await registerPaymentsRoutes(app);

  // ============================================
  // ADMIN ROUTES
  // ============================================
  await registerAdminRoutes(app);

  // ============================================
  // HEALTH CHECK
  // ============================================
  app.get('/health', async () => {
    const [queueHealth, publishQueueHealth] = await Promise.all([
      getQueueHealth(),
      env.schedulerEnabled ? getPublishQueueHealth().catch(() => null) : Promise.resolve(null),
    ]);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      queue: queueHealth,
      publishQueue: publishQueueHealth,
    };
  });

  // ============================================
  // UPLOAD VIDEO FILE
  // ============================================
  app.post('/upload-video', {
    preHandler: [authenticateJWT, requireBetaAllowlist],
  }, async (request, reply) => {
    try {
      if (!env.uploadsEnabled) {
        return reply.status(403).send({
          error: 'UPLOADS_DISABLED',
          message: 'Uploads estão desativados no beta.',
        });
      }

      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          error: 'NO_FILE',
          message: 'No video file provided',
        });
      }

      const userId = request.user!.userId;
      const jobId = `job_${randomUUID().replace(/-/g, '')}`;
      const fileName = data.filename || 'video.mp4';
      const storagePath = `uploads/${userId}/${jobId}/${fileName}`;

      // Create directory
      const { join, dirname } = await import('path');
      const localStoragePath = env.localStoragePath || './uploads';
      const fullPath = join(localStoragePath, storagePath);
      await fs.mkdir(dirname(fullPath), { recursive: true });

      // Save file
      const writeStream = (await import('fs')).createWriteStream(fullPath);
      await data.file.pipe(writeStream);

      // Wait for write to complete
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      logger.info({ userId, jobId, fileName, storagePath }, 'Video uploaded successfully');

      return reply.status(200).send({
        jobId,
        storagePath,
        fileName,
        message: 'Upload successful',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to upload video');
      return reply.status(500).send({
        error: 'UPLOAD_FAILED',
        message: error.message || 'Failed to upload video',
      });
    }
  });

  // ============================================
  // CREATE JOB FROM UPLOAD (after file is uploaded)
  // ============================================
  app.post('/jobs/from-upload', {
    preHandler: [authenticateJWT, requireBetaAllowlist, checkClipLimit],
  }, async (request, reply) => {
    if (!env.uploadsEnabled) {
      return reply.status(403).send({
        error: 'UPLOADS_DISABLED',
        message: 'Uploads estão desativados no beta.',
      });
    }

    const schema = z.object({
      storagePath: z.string(),
      fileName: z.string(),
      targetDuration: z.number().min(15).max(90).default(60),
      clipCount: z.number().min(0).max(50).default(0), // 0 = modo automático
    });

    const parsed = schema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid request body',
        details: parsed.error.format(),
      });
    }

    const input = parsed.data;
    const jobId = `job_${randomUUID().replace(/-/g, '')}`;

    // Usar userId do token JWT (mais seguro que do body)
    const userId = request.user!.userId;

    const jobData: JobData = {
      jobId,
      userId,
      sourceType: 'upload',
      uploadPath: input.storagePath,
      targetDuration: input.targetDuration,
      clipCount: input.clipCount,
      aiClipping: true,
      model: DEFAULT_CLIP_SETTINGS.model,
      minDuration: DEFAULT_CLIP_SETTINGS.minDuration,
      maxDuration: DEFAULT_CLIP_SETTINGS.maxDuration,
      createdAt: new Date(),
    };

    await addVideoJob(jobData);

    logger.info({ jobId, userId, storagePath: input.storagePath }, 'Job created from upload');

    return reply.status(201).send({
      jobId,
      status: 'queued',
      message: 'Job created successfully from upload',
    });
  });

  // ============================================
  // CREATE JOB
  // ============================================
  app.post('/jobs', {
    preHandler: [
      authenticateJWT,
      requireBetaAllowlist,
      rateLimitByUser('jobs-create', env.rateLimit.jobStart.max, env.rateLimit.jobStart.windowSeconds),
      checkClipLimit,
    ],
  }, async (request, reply) => {
    // Validar input
    const parsed = CreateJobSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid request body',
        details: parsed.error.format(),
      });
    }

    const input = parsed.data;

    // Validar sourceType
    if ((input.sourceType === 'youtube' || input.sourceType === 'youtube_live') && !input.youtubeUrl) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'youtubeUrl is required for youtube/youtube_live source',
      });
    }

    if (input.sourceType === 'upload' && !input.uploadPath) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'uploadPath is required for upload source',
      });
    }

    // Criar job
    const jobId = `job_${randomUUID().replace(/-/g, '')}`;

    // Usar userId do token JWT (mais seguro que do body)
    const userId = request.user!.userId;

    const jobData: JobData = {
      jobId,
      userId,
      sourceType: input.sourceType,
      youtubeUrl: input.youtubeUrl,
      uploadPath: input.uploadPath,
      targetDuration: input.targetDuration,
      clipCount: input.clipCount,
      aiClipping: true,
      model: DEFAULT_CLIP_SETTINGS.model,
      minDuration: DEFAULT_CLIP_SETTINGS.minDuration,
      maxDuration: DEFAULT_CLIP_SETTINGS.maxDuration,
      createdAt: new Date(),
    };

    await addVideoJob(jobData);

    logger.info({ jobId, userId: input.userId }, 'Job created');

    return reply.status(201).send({
      jobId,
      status: 'queued',
      message: 'Job created successfully',
    });
  });

  // ============================================
  // LIST ALL JOBS FOR USER
  // ============================================
  app.get('/jobs', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const { limit: rawLimit, offset: rawOffset } = request.query as { limit?: string; offset?: string };
      const limit = Math.min(Math.max(parseInt(rawLimit || '50', 10) || 50, 1), 100);
      const offset = Math.max(parseInt(rawOffset || '0', 10) || 0, 0);

      logger.info({ userId, limit, offset }, 'Fetching jobs for user');

      const [userJobs, total] = await Promise.all([
        dbJobs.findByUserId(userId, limit, offset),
        dbJobs.countByUserId(userId),
      ]);

      logger.info({ userId, count: userJobs.length, total }, 'Found jobs for user');

      reply.header('X-Total-Count', total);
      return reply.send(userJobs);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch user jobs');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch jobs',
      });
    }
  });

  // ============================================
  // GET JOB STATUS
  // ============================================
  app.get('/jobs/:jobId', {
    preHandler: [authenticateJWT, requireJobOwnership],
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const status = await getJobStatus(jobId);

    if (!status) {
      // Fallback: job já foi removido do BullMQ, mas ainda existe no banco (ex.: >24h)
      const jobRow = await db.jobs.findById(jobId);

      if (!jobRow) {
        return reply.status(404).send({
          error: 'JOB_NOT_FOUND',
          message: `Job ${jobId} not found`,
        });
      }

      const withVersion = (url: string, version?: number) => {
        if (!version) return url;
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}v=${version}`;
      };

      const clipRows = await db.clips.findByJobId(jobId);
      const clips = clipRows.map((clipRow: any) => {
        const updatedAtVersion = clipRow.updated_at ? new Date(clipRow.updated_at).getTime() : undefined;
        const videoProxyUrl = withVersion(`${env.baseUrl}/clips/${jobId}/${clipRow.id}.mp4`, updatedAtVersion);
        const thumbProxyUrl = withVersion(`${env.baseUrl}/clips/${jobId}/${clipRow.id}.jpg`, updatedAtVersion);

        // Derivar segments de transcript quando disponível (melhor UX no frontend)
        let transcriptSegments: Array<{ start: number; end: number; text: string }> | undefined;
        const transcriptObj = typeof clipRow.transcript === 'string' ? JSON.parse(clipRow.transcript) : clipRow.transcript;
        if (transcriptObj?.segments && Array.isArray(transcriptObj.segments)) {
          transcriptSegments = transcriptObj.segments
            .filter((s: any) => s.start < clipRow.end_time && s.end > clipRow.start_time)
            .map((s: any) => ({ start: s.start, end: s.end, text: s.text }));
        }

        return {
          id: clipRow.id,
          title: clipRow.title,
          description: clipRow.description || 'Descrição gerada automaticamente',
          hashtags: Array.isArray(clipRow.hashtags) ? clipRow.hashtags : [],
          seoTitle: clipRow.seo_title || undefined,
          seoDescription: clipRow.seo_description || undefined,
          seoHashtags: Array.isArray(clipRow.seo_hashtags) ? clipRow.seo_hashtags : undefined,
          seoVariants: Array.isArray(clipRow.seo_variants) ? clipRow.seo_variants : undefined,
          seoSelectedIndex: typeof clipRow.seo_selected_index === 'number' ? clipRow.seo_selected_index : undefined,
          previewUrl: videoProxyUrl,
          downloadUrl: videoProxyUrl,
          thumbnailUrl: thumbProxyUrl,
          duration: clipRow.duration || 0,
          status: 'ready',
          format: { aspectRatio: '9:16' },
          start: clipRow.start_time,
          end: clipRow.end_time,
          transcript: transcriptSegments,
          viralityScore: clipRow.ai_score,
          viralityComponents: clipRow.virality_components,
          viralityLabel: clipRow.virality_label,
        };
      });

      const jobStatus = jobRow.status || 'completed';
      const currentStep = jobStatus === 'completed' ? 'export' : (jobRow.current_step || 'ingest');
      const progress = typeof jobRow.progress === 'number'
        ? jobRow.progress
        : (jobStatus === 'completed' ? 100 : 0);

      return {
        jobId: jobRow.id,
        state: jobStatus,
        status: jobStatus,
        currentStep,
        progress,
        result: { clips },
        error: jobRow.error || null,
        finishedAt: jobRow.completed_at ? new Date(jobRow.completed_at).toISOString() : null,
      };
    }

    const withVersion = (url: string, version?: number) => {
      if (!version) return url;
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}v=${version}`;
    };

    // Carregar updated_at dos clips para cache-busting (reprocess sobrescreve arquivos no mesmo path)
    let clipUpdatedAtById: Record<string, number> = {};
    let clipRowById: Record<string, any> = {};
    try {
      const clipRows = await db.clips.findByJobId(jobId);
      clipRowById = Object.fromEntries(
        (clipRows || [])
          .filter((r: any) => r?.id)
          .map((r: any) => [r.id, r])
      );
      clipUpdatedAtById = Object.fromEntries(
        (clipRows || [])
          .filter((r: any) => r?.id && r?.updated_at)
          .map((r: any) => [r.id, new Date(r.updated_at).getTime()])
      );
    } catch (error: any) {
      logger.warn({ jobId, error: error.message }, 'Failed to load clips from DB for cache-busting');
    }

    // Transform result to match frontend expectations
    let result: unknown = status.returnvalue;
    if (hasClips(result)) {
      result = {
        ...result,
        clips: result.clips.map((clip: any) => {
          // Use proxy URL instead of direct Supabase URL (workaround for private buckets)
          const updatedAtVersion = clipUpdatedAtById[clip.id];
          const proxyUrl = withVersion(`${env.baseUrl}/clips/${jobId}/${clip.id}.mp4`, updatedAtVersion);
          const proxyThumbUrl = withVersion(`${env.baseUrl}/clips/${jobId}/${clip.id}.jpg`, updatedAtVersion);
          const clipRow = clipRowById[clip.id];

          const descriptionFromDb = typeof clipRow?.description === 'string' ? clipRow.description.trim() : '';
          const description =
            descriptionFromDb
            || String((clip as any)?.description || '').trim()
            || String((clip as any)?.transcript || '').trim()
            || String((clip as any)?.reason || '').trim()
            || 'Descrição gerada automaticamente';

          const hashtags = Array.isArray((clip as any)?.keywords) && (clip as any).keywords.length
            ? (clip as any).keywords
            : (Array.isArray(clipRow?.hashtags) ? clipRow.hashtags : []);

          // Only prefer DB SEO metadata when variants exist (otherwise a migration backfill may
          // overwrite richer metadata stored in the BullMQ job returnvalue for older jobs).
          const dbSeoVariants = Array.isArray(clipRow?.seo_variants) ? clipRow.seo_variants : null;
          const hasDbSeo = Boolean(dbSeoVariants && dbSeoVariants.length);

          const seoTitle = hasDbSeo ? clipRow?.seo_title : clip.seoTitle;
          const seoDescription = hasDbSeo ? clipRow?.seo_description : clip.seoDescription;
          const seoHashtags = hasDbSeo && Array.isArray(clipRow?.seo_hashtags) ? clipRow.seo_hashtags : clip.seoHashtags;
          const seoVariants = hasDbSeo ? dbSeoVariants : clip.seoVariants;
          const seoSelectedIndex =
            hasDbSeo && typeof clipRow?.seo_selected_index === 'number'
              ? clipRow.seo_selected_index
              : clip.seoSelectedIndex;

            return {
              id: clip.id,
              title: clip.title,
              description,
              hashtags,
              previewUrl: proxyUrl,
              downloadUrl: proxyUrl,
              thumbnailUrl: proxyThumbUrl,
              duration: clip.duration,
              status: 'ready',
              format: clip.format,
              reframeSettings: clip.reframeSettings,
              start: clip.start,
              end: clip.end,
              score: clip.score,
              captions: clip.captions,
              hookAnalysis: clip.hookAnalysis,
              hookVariations: clip.hookVariations,
              scoreBreakdown: clip.scoreBreakdown,
              seoTitle,
              seoDescription,
              seoHashtags,
              seoVariants,
              seoSelectedIndex,
            };
          }),
        };
      }

    // Derive currentStep from job state and progress
    let currentStep = 'ingest';
    const progressValue = getProgressValue(status.progress);

    if (status.state === 'completed') {
      currentStep = 'export';
    } else if (status.state === 'failed') {
      // Infer last step from progress before failure
      if (progressValue >= 90) currentStep = 'export';
      else if (progressValue >= 80) currentStep = 'texts';
      else if (progressValue >= 65) currentStep = 'render';
      else if (progressValue >= 55) currentStep = 'rank';
      else if (progressValue >= 40) currentStep = 'scenes';
      else if (progressValue >= 20) currentStep = 'transcribe';
      else currentStep = 'ingest';
    } else if (status.state === 'active' || status.state === 'waiting') {
      // Map progress ranges to pipeline steps
      if (progressValue >= 90) currentStep = 'export';
      else if (progressValue >= 80) currentStep = 'texts';
      else if (progressValue >= 65) currentStep = 'render';
      else if (progressValue >= 55) currentStep = 'rank';
      else if (progressValue >= 40) currentStep = 'scenes';
      else if (progressValue >= 20) currentStep = 'transcribe';
      else currentStep = 'ingest';
    }

    // Calculate progress from currentStep if not available from BullMQ
    let finalProgress = status.progress;
    if (!progressValue || progressValue === 0) {
      // Map currentStep to progress percentage
      const stepProgressMap: Record<string, number> = {
        'ingest': 15,
        'transcribe': 30,
        'scenes': 50,
        'rank': 65,
        'render': 80,
        'texts': 95,
        'export': 100,
      };

      const calculatedProgress = stepProgressMap[currentStep] || 0;
      finalProgress = ensureProgressPayload(status.progress, calculatedProgress);

      logger.info({ jobId, currentStep, calculatedProgress }, 'Calculated progress from currentStep');
    }

    return {
      jobId: status.id,
      state: status.state,
      status: status.state, // Add status field for frontend compatibility
      currentStep, // Add currentStep for timeline tracking
      progress: finalProgress,
      result,
      error: status.failedReason,
      finishedAt: status.finishedOn ? new Date(status.finishedOn).toISOString() : null,
    };
  });

  // ============================================
  // SSE JOB STREAM (Real-time updates)
  // ============================================
  app.get('/api/jobs/:jobId/stream', {
    preHandler: [authenticateJWT, requireJobOwnership],
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    // Verificar se job existe
    const status = await getJobStatus(jobId);
    if (!status) {
      return reply.status(404).send({
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }

    // Configurar headers SSE
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    // CORS headers are handled globally by @fastify/cors (credentials-friendly).

    // Enviar status inicial imediatamente
    const sendSSE = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Criar QueueEvents para monitorar mudanças
    const { QueueEvents } = await import('bullmq');
    const queueEvents = new QueueEvents('video-processing', {
      connection: {
        host: env.redis.host,
        port: env.redis.port,
        password: env.redis.password,
        db: env.redis.db,
      },
    });

    // Helper para derivar currentStep
    const deriveCurrentStep = (state: string, progressValue: number): string => {
      if (state === 'completed') return 'export';
      if (progressValue >= 90) return 'export';
      if (progressValue >= 80) return 'texts';
      if (progressValue >= 65) return 'render';
      if (progressValue >= 55) return 'rank';
      if (progressValue >= 40) return 'scenes';
      if (progressValue >= 20) return 'transcribe';
      return 'ingest';
    };

    // Helper para calcular progresso do step
    const calculateProgressFromStep = (step: string): number => {
      const stepProgressMap: Record<string, number> = {
        'ingest': 15,
        'transcribe': 30,
        'scenes': 50,
        'rank': 65,
        'render': 80,
        'texts': 95,
        'export': 100,
      };
      return stepProgressMap[step] || 0;
    };

    // Helper para garantir que progress está sempre disponível
    const ensureProgress = (progress: unknown, currentStep: string): number | ProgressPayload => {
      const progressValue = getProgressValue(progress);

      // Se não há progresso ou é 0, calcular do step
      if (!progressValue || progressValue === 0) {
        const calculatedProgress = calculateProgressFromStep(currentStep);
        return ensureProgressPayload(progress, calculatedProgress);
      }

      return ensureProgressPayload(progress, progressValue);
    };

    // Enviar status inicial
    const initialProgressValue = getProgressValue(status.progress);
    const initialStep = deriveCurrentStep(status.state, initialProgressValue || 0);
    sendSSE('progress', {
      jobId: status.id,
      state: status.state,
      status: status.state,
      currentStep: initialStep,
      progress: ensureProgress(status.progress, initialStep),
    });

    // Listen para progress updates
    queueEvents.on('progress', async ({ jobId: eventJobId, data }) => {
      if (eventJobId === jobId) {
        const progressData: ProgressPayload = isProgressPayload(data)
          ? data
          : { progress: typeof data === 'number' ? data : 0 };
        const progressValue = getProgressValue(progressData);
        const currentStep = deriveCurrentStep('active', progressValue);

        sendSSE('progress', {
          jobId: eventJobId,
          state: 'active',
          status: 'active',
          currentStep,
          progress: ensureProgress(progressData, currentStep),
        });
      }
    });

    // Listen para completed
    queueEvents.on('completed', async ({ jobId: eventJobId, returnvalue }) => {
      if (eventJobId === jobId) {
        const withVersion = (url: string, version?: number) => {
          if (!version) return url;
          const sep = url.includes('?') ? '&' : '?';
          return `${url}${sep}v=${version}`;
        };

        // Load clip rows to enrich descriptions/SEO and enable cache-busting.
        let clipUpdatedAtById: Record<string, number> = {};
        let clipRowById: Record<string, any> = {};
        try {
          const clipRows = await db.clips.findByJobId(jobId);
          clipRowById = Object.fromEntries(
            (clipRows || [])
              .filter((r: any) => r?.id)
              .map((r: any) => [r.id, r])
          );
          clipUpdatedAtById = Object.fromEntries(
            (clipRows || [])
              .filter((r: any) => r?.id && r?.updated_at)
              .map((r: any) => [r.id, new Date(r.updated_at).getTime()])
          );
        } catch (error: any) {
          logger.warn({ jobId, error: error.message }, 'Failed to load clips from DB for SSE completion enrichment');
        }

        // Transform result like in GET endpoint (include SEO variants so frontend doesn't need a refresh)
        let result: unknown = returnvalue;
        if (hasClips(result)) {
          result = {
            ...result,
            clips: result.clips.map((clip: any) => {
              const clipRow = clipRowById[clip.id];
              const updatedAtVersion = clipUpdatedAtById[clip.id];

              const proxyUrl = withVersion(`${env.baseUrl}/clips/${jobId}/${clip.id}.mp4`, updatedAtVersion);
              const proxyThumbUrl = withVersion(`${env.baseUrl}/clips/${jobId}/${clip.id}.jpg`, updatedAtVersion);

              const descriptionFromDb = typeof clipRow?.description === 'string' ? clipRow.description.trim() : '';
              const description =
                descriptionFromDb
                || String((clip as any)?.description || '').trim()
                || String((clip as any)?.transcript || '').trim()
                || String((clip as any)?.reason || '').trim()
                || 'Descrição gerada automaticamente';

              const hashtags = Array.isArray((clip as any)?.keywords) && (clip as any).keywords.length
                ? (clip as any).keywords
                : (Array.isArray(clipRow?.hashtags) ? clipRow.hashtags : []);

              // Prefer DB SEO metadata when variants exist (covers older jobs and post-regeneration edits).
              const dbSeoVariants = Array.isArray(clipRow?.seo_variants) ? clipRow.seo_variants : null;
              const hasDbSeo = Boolean(dbSeoVariants && dbSeoVariants.length);

              const seoTitle = hasDbSeo ? clipRow?.seo_title : clip.seoTitle;
              const seoDescription = hasDbSeo ? clipRow?.seo_description : clip.seoDescription;
              const seoHashtags = hasDbSeo && Array.isArray(clipRow?.seo_hashtags) ? clipRow.seo_hashtags : clip.seoHashtags;
              const seoVariants = hasDbSeo ? dbSeoVariants : clip.seoVariants;
              const seoSelectedIndex =
                hasDbSeo && typeof clipRow?.seo_selected_index === 'number'
                  ? clipRow.seo_selected_index
                  : clip.seoSelectedIndex;

              return {
                id: clip.id,
                title: clip.title,
                description,
                hashtags,
                previewUrl: proxyUrl,
                downloadUrl: proxyUrl,
                thumbnailUrl: proxyThumbUrl,
                duration: clip.duration,
                status: 'ready',
                format: clip.format,
                reframeSettings: clip.reframeSettings,
                start: clip.start,
                end: clip.end,
                score: clip.score,
                captions: clip.captions,
                hookAnalysis: clip.hookAnalysis,
                hookVariations: clip.hookVariations,
                scoreBreakdown: clip.scoreBreakdown,
                seoTitle,
                seoDescription,
                seoHashtags,
                seoVariants,
                seoSelectedIndex,
                viralityScore: clip.viralityScore,
                viralityComponents: clip.viralityComponents,
                viralityLabel: clip.viralityLabel,
              };
            }),
          };
        }

        sendSSE('completed', {
          jobId: eventJobId,
          state: 'completed',
          status: 'completed',
          currentStep: 'export',
          progress: { progress: 100, message: 'Processamento completo!' },
          result,
        });

        // Cleanup e fechar conexão
        await queueEvents.close();
        reply.raw.end();
      }
    });

    // Listen para failed
    queueEvents.on('failed', async ({ jobId: eventJobId, failedReason }) => {
      if (eventJobId === jobId) {
        sendSSE('failed', {
          jobId: eventJobId,
          state: 'failed',
          status: 'failed',
          error: failedReason,
        });

        // Cleanup e fechar conexão
        await queueEvents.close();
        reply.raw.end();
      }
    });

    // Heartbeat para manter conexão viva (a cada 15s)
    const heartbeatInterval = setInterval(() => {
      reply.raw.write(':heartbeat\n\n');
    }, 15000);

    // Cleanup quando cliente desconectar
    request.raw.on('close', async () => {
      clearInterval(heartbeatInterval);
      await queueEvents.close();
      logger.info({ jobId }, 'SSE connection closed');
    });

    logger.info({ jobId }, 'SSE connection established');
  });

  // ============================================
  // UPDATE JOB (e.g., update title)
  // ============================================
  app.patch('/jobs/:jobId', {
    preHandler: [authenticateJWT, requireJobOwnership],
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const updates = request.body as { title?: string };

    try {
      // Verificar se job existe
      const job = await dbJobs.findById(jobId);

      if (!job) {
        return reply.status(404).send({
          error: 'JOB_NOT_FOUND',
          message: `Job ${jobId} not found`,
        });
      }

      // Atualizar no banco de dados
      const updatedJob = await dbJobs.update(jobId, updates);

      logger.info({ jobId, updates }, 'Job updated successfully');

      return reply.send(updatedJob);
    } catch (error: any) {
      logger.error({ error: error.message, jobId }, 'Failed to update job');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update job',
      });
    }
  });

  // ============================================
  // DELETE JOB
  // ============================================
  app.delete('/jobs/:jobId', {
    preHandler: [authenticateJWT, requireJobOwnership],
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    try {
      // 1. Verificar se job existe (ownership já validado pelo preHandler)
      const job = await dbJobs.findById(jobId);

      if (!job) {
        return reply.status(404).send({
          error: 'JOB_NOT_FOUND',
          message: `Job ${jobId} not found`,
        });
      }

      // 2. Cancelar job na fila se ainda estiver ativo
      await cancelJob(jobId);

      // Deletar todos os clips associados
      await db.clips.deleteByJobId(jobId);

      // Deletar job
      await dbJobs.delete(jobId);

      logger.info({ jobId }, 'Job and associated clips deleted successfully');

      return {
        jobId,
        status: 'deleted',
        message: 'Job deleted successfully',
      };
    } catch (error: any) {
      logger.error({ error: error.message, jobId }, 'Failed to delete job');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete job',
      });
    }
  });

  // ============================================
  // QUEUE STATS
  // ============================================
  app.get('/queue/stats', async () => {
    return await getQueueHealth();
  });

  // ============================================
  // TEMPORARY CONFIGURATION (OpusClip-style workflow)
  // ============================================

  // POST /jobs/temp - Create temporary configuration
  app.post('/jobs/temp', {
    preHandler: [
      authenticateJWT,
      requireBetaAllowlist,
      rateLimitByUser('jobs-temp', env.rateLimit.tempConfig.max, env.rateLimit.tempConfig.windowSeconds),
    ],
  }, async (request, reply) => {
    const parsed = CreateTempConfigSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid request body',
        details: parsed.error.format(),
      });
    }

    const { youtubeUrl, sourceType } = parsed.data;

    if (!env.uploadsEnabled && sourceType !== 'youtube') {
      return reply.status(400).send({
        error: 'UPLOADS_DISABLED',
        message: 'Uploads estão desativados no beta. Use apenas URLs do YouTube.',
      });
    }

    // Generate unique tempId
    const tempId = `temp_${randomUUID().replace(/-/g, '')}`;

    // Usar sempre userId do token JWT (não aceitar do body)
    const userId = request.user!.userId;

    // Create configuration with defaults
    const config: ProjectConfig = {
      tempId,
      youtubeUrl,
      userId,
      sourceType: env.uploadsEnabled ? sourceType : 'youtube',
      clipSettings: DEFAULT_CLIP_SETTINGS,
      subtitlePreferences: DEFAULT_SUBTITLE_PREFERENCES,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour expiration
    };

    // Save to Redis with 1 hour TTL
    await setTempConfig(tempId, config, 3600);

    logger.info({ tempId, userId }, 'Temporary config created');

    return reply.status(201).send({ tempId, config });
  });

  // GET /jobs/temp/:tempId - Get temporary configuration
  app.get('/jobs/temp/:tempId', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { tempId } = request.params as { tempId: string };

    const config = await getTempConfig(tempId);

    if (!config) {
      return reply.status(404).send({
        error: 'CONFIG_NOT_FOUND',
        message: 'Configuration not found or expired. Please create a new project.',
        });
    }

    // Segurança: não permitir acessar config de outro usuário
    if (config.userId !== request.user!.userId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You do not have access to this configuration',
      });
    }

    return reply.send(config);
  });

  // POST /jobs/temp/:tempId/start - Start processing with configuration
  app.post('/jobs/temp/:tempId/start', {
    preHandler: [
      authenticateJWT,
      requireBetaAllowlist,
      rateLimitByUser('jobs-start', env.rateLimit.jobStart.max, env.rateLimit.jobStart.windowSeconds),
      checkClipLimit,
    ],
  }, async (request, reply) => {
    const { tempId } = request.params as { tempId: string };

    // 1. Get temporary configuration
    const tempConfig = await getTempConfig(tempId);

    if (!tempConfig) {
      return reply.status(404).send({
        error: 'CONFIG_NOT_FOUND',
        message: 'Configuration expired or not found',
      });
    }

    // Segurança: não permitir iniciar job com config de outro usuário
    if (tempConfig.userId !== request.user!.userId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You do not have access to this configuration',
      });
    }

    if (!env.uploadsEnabled && tempConfig.sourceType !== 'youtube') {
      return reply.status(400).send({
        error: 'UPLOADS_DISABLED',
        message: 'Uploads estão desativados no beta. Use apenas URLs do YouTube.',
      });
    }

    // 2. Validate body
    const parsed = StartJobFromTempSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid configuration',
        details: parsed.error.format(),
      });
    }

    const finalConfig = parsed.data;

    // 3. Create JobData with complete configuration
    const jobId = `job_${randomUUID().replace(/-/g, '')}`;

    const jobData: JobData = {
      jobId,
      userId: request.user!.userId,
      sourceType: tempConfig.sourceType,
      youtubeUrl: tempConfig.youtubeUrl,
      uploadPath: tempConfig.uploadPath,
      targetDuration: finalConfig.clipSettings.targetDuration,
      clipCount: finalConfig.clipSettings.clipCount,
      aiClipping: finalConfig.clipSettings.aiClipping,
      model: finalConfig.clipSettings.model,
      minDuration: finalConfig.clipSettings.minDuration,
      maxDuration: finalConfig.clipSettings.maxDuration,
      createdAt: new Date(),
    };

    // 4. Save subtitle preferences to Redis (7 days TTL)
    const subtitleKey = `subtitle:${jobId}:global`;
    await redis.set(
      subtitleKey,
      JSON.stringify(finalConfig.subtitlePreferences),
      'EX',
      60 * 60 * 24 * 7 // 7 days
    );

    // 4.1 Save clip options (reframe) if provided; fallback to defaults if not
    const clipOptionsKey = `clipOptions:${jobId}:global`;
    const clipOptionsToSave = finalConfig.clipOptions || DEFAULT_VIRAL_INTELLIGENCE.clipOptions;
    await redis.set(
      clipOptionsKey,
      JSON.stringify(clipOptionsToSave),
      'EX',
      60 * 60 * 24 * 7 // 7 days
    );

    // 5. Add job to queue
    await addVideoJob(jobData);

    // 6. Delete temporary configuration
    await deleteTempConfig(tempId);

    logger.info({ jobId, tempId, userId: request.user!.userId }, 'Job started from temp config');

    return reply.status(201).send({
      jobId,
      status: 'queued',
      message: 'Job created successfully from configuration',
    });
  });

  // ============================================
  // SUBTITLE PREFERENCES
  // ============================================

  // Save subtitle preferences for a specific clip
  app.patch('/jobs/:jobId/clips/:clipId/subtitle-settings', {
    preHandler: [authenticateJWT, requireJobOwnership],
  }, async (request, reply) => {
    const { jobId, clipId } = request.params as { jobId: string; clipId: string };

    const parsed = SubtitlePreferencesSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid subtitle preferences',
        details: parsed.error.format(),
      });
    }

    const preferences = parsed.data;
    const key = `subtitle:${jobId}:${clipId}`;

    try {
      await redis.set(key, JSON.stringify(preferences), 'EX', 60 * 60 * 24 * 7); // 7 days

      logger.info({ jobId, clipId }, 'Subtitle preferences saved');

      return {
        jobId,
        clipId,
        preferences,
        message: 'Subtitle preferences saved successfully',
      };
    } catch (error: any) {
      logger.error({ error: error.message, jobId, clipId }, 'Failed to save subtitle preferences');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to save subtitle preferences',
      });
    }
  });

  // Get subtitle preferences for a specific clip
  app.get('/jobs/:jobId/clips/:clipId/subtitle-settings', {
    preHandler: [authenticateJWT, requireJobOwnership],
  }, async (request, reply) => {
    const { jobId, clipId } = request.params as { jobId: string; clipId: string };
    const key = `subtitle:${jobId}:${clipId}`;

    try {
      const data = await redis.get(key);

      if (!data) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Subtitle preferences not found',
        });
      }

      const preferences = JSON.parse(data);

      return {
        jobId,
        clipId,
        preferences,
      };
    } catch (error: any) {
      logger.error({ error: error.message, jobId, clipId }, 'Failed to get subtitle preferences');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve subtitle preferences',
      });
    }
  });

  // ============================================
  // GLOBAL SUBTITLE PREFERENCES (Job-level)
  // ============================================

  // Save global subtitle preferences for the entire job
  // These will be used as defaults for all clips in this job
  app.patch('/jobs/:jobId/subtitle-settings', {
    preHandler: [authenticateJWT, requireJobOwnership],
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const parsed = SubtitlePreferencesSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid subtitle preferences',
        details: parsed.error.format(),
      });
    }

    const preferences = parsed.data;
    const key = `subtitle:${jobId}:global`;

    try {
      // Salvar no Redis com expiração de 7 dias
      await redis.set(key, JSON.stringify(preferences), 'EX', 60 * 60 * 24 * 7);

      logger.info({ jobId, key }, 'Global subtitle preferences saved successfully');

      return {
        jobId,
        preferences,
        message: 'Global subtitle preferences saved successfully',
      };
    } catch (error: any) {
      logger.error({ error: error.message, jobId }, 'Failed to save global subtitle preferences');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to save subtitle preferences',
      });
    }
  });

  // ============================================
  // CLIP REPROCESSING (FAST)
  // ============================================

  // Reprocess a single clip with updated subtitle preferences (ultra-fast)
  app.post('/jobs/:jobId/clips/:clipId/reprocess', {
    preHandler: [authenticateJWT, requireBetaAllowlist, requireJobOwnership],
  }, async (request, reply) => {
    const { jobId, clipId } = request.params as { jobId: string; clipId: string };

    logger.info({ jobId, clipId }, 'Starting fast clip reprocessing');

    try {
      const supabase = supabaseClient;

      // 1) Buscar job do BullMQ (quando disponível; pode ter sido removido da fila)
      const queueJob = await videoQueue.getJob(jobId);
      const result: unknown = queueJob?.returnvalue;

      // 2) Encontrar o clip no resultado do job (melhor fonte: inclui formato/reframe)
      let clipData: any | null = null;

      if (hasClips(result)) {
        clipData = result.clips.find((c: any) => c.id === clipId) || null;
      }

      // 2.1) Fallback: buscar clip no banco (permite reprocessar jobs antigos)
      if (!clipData) {
        const clipRow = await db.clips.findById(clipId);

        if (!clipRow || clipRow.job_id !== jobId) {
          logger.error({ clipId, jobId }, 'Clip not found in database');
          return reply.status(404).send({
            error: 'CLIP_NOT_FOUND',
            message: 'Clip not found',
          });
        }

        clipData = {
          id: clipRow.id,
          title: clipRow.title,
          start: clipRow.start_time,
          end: clipRow.end_time,
          // Sem dados de formato/reframe no DB (fallback conservador)
          format: { aspectRatio: '9:16' as const },
          reframeSettings: undefined,
        };
      }

      // 3) Resolver dados do job para re-download do vídeo original
      let jobSourceType: 'youtube' | 'youtube_live' | 'upload' | undefined;
      let jobYoutubeUrl: string | undefined;
      let jobUploadPath: string | undefined;

      if (queueJob) {
        jobSourceType = queueJob.data.sourceType;
        jobYoutubeUrl = queueJob.data.youtubeUrl;
        jobUploadPath = queueJob.data.uploadPath;
      } else {
        const jobRow = await db.jobs.findById(jobId);

        if (!jobRow) {
          logger.error({ jobId }, 'Job not found in database');
          return reply.status(404).send({
            error: 'JOB_NOT_FOUND',
            message: 'Job not found',
          });
        }

        jobSourceType = jobRow.source_type as 'youtube' | 'youtube_live' | 'upload';
        jobYoutubeUrl = jobRow.youtube_url || undefined;
        jobUploadPath = jobRow.upload_path || undefined;
      }

      // 5. Buscar preferências salvas desse clip
      const prefKey = `subtitle:${jobId}:${clipId}`;
      const prefData = await redis.get(prefKey);

      if (!prefData) {
        return reply.status(400).send({
          error: 'NO_PREFERENCES',
          message: 'No subtitle preferences found for this clip. Please save preferences first.',
        });
      }

      const subtitlePreferences = JSON.parse(prefData);

      // 6. Buscar dados de reprocessamento do Redis
      const reprocessDataKey = `reprocess:${jobId}`;
      let reprocessData = await redis.get(reprocessDataKey);
      let originalVideoPath;
      let transcript;
      let wasRedownloaded = false; // Flag para saber se precisa limpar o vídeo depois

      if (!reprocessData) {
        // FALLBACK: Vídeo antigo - não tem dados no Redis
        logger.warn({ jobId }, 'Reprocess data not in Redis, trying database + YouTube re-download');

        // 1. Buscar transcript do banco de dados (Postgres local) ou Supabase (se configurado)
        let clipTranscript: any | undefined;

        if (supabase) {
          const { data: clipDbData, error: clipDbError } = await supabase
            .from('clips')
            .select('transcript')
            .eq('id', clipId)
            .single();

          if (clipDbError || !clipDbData) {
            logger.error({ jobId, clipId, error: clipDbError?.message }, 'Clip not found in database');
            return reply.status(404).send({
              error: 'CLIP_NOT_FOUND',
              message: 'Clip not found in database',
            });
          }

          clipTranscript = clipDbData.transcript;
        } else {
          const clipRow = await db.clips.findById(clipId);
          if (!clipRow) {
            logger.error({ jobId, clipId }, 'Clip not found in database');
            return reply.status(404).send({
              error: 'CLIP_NOT_FOUND',
              message: 'Clip not found in database',
            });
          }
          clipTranscript = clipRow.transcript;
        }

        if (!clipTranscript) {
          logger.error({ jobId, clipId }, 'Transcript not found in database');
          return reply.status(400).send({
            error: 'TRANSCRIPT_NOT_FOUND',
            message:
              'Transcript not found in database. This video was processed before transcript storage was implemented.',
          });
        }

        transcript = typeof clipTranscript === 'string' ? JSON.parse(clipTranscript) : clipTranscript;
        logger.info({ jobId, clipId, hasTranscript: true }, 'Found transcript in database');

        // 2. Re-download do vídeo original (YouTube ou Upload)
        const sourceTypeForDownload: 'youtube' | 'youtube_live' | 'upload' =
          jobSourceType || (jobYoutubeUrl ? 'youtube' : 'upload');

        if ((sourceTypeForDownload === 'youtube' || sourceTypeForDownload === 'youtube_live') && !jobYoutubeUrl) {
          logger.error({ jobId }, 'YouTube URL not available for re-download');
          return reply.status(400).send({
            error: 'NO_YOUTUBE_URL',
            message: 'Cannot re-download video: YouTube URL not available',
          });
        }

        if (sourceTypeForDownload === 'upload' && !jobUploadPath) {
          logger.error({ jobId }, 'Upload path not available for re-download');
          return reply.status(400).send({
            error: 'NO_UPLOAD_PATH',
            message: 'Cannot re-download video: upload path not available',
          });
        }

        logger.info({ jobId, sourceTypeForDownload }, 'Re-downloading video for clip reprocessing');

        // Importar dinamicamente o serviço de download
        const { downloadVideo } = await import('../services/download.js');

        try {
          const downloadResult = await downloadVideo(sourceTypeForDownload, jobYoutubeUrl, jobUploadPath);
          originalVideoPath = downloadResult.videoPath;
          wasRedownloaded = true; // Marcar que foi re-baixado para cleanup posterior
          logger.info({ jobId, videoPath: originalVideoPath }, 'Video re-downloaded successfully');
        } catch (downloadError: any) {
          logger.error({ jobId, error: downloadError.message }, 'Failed to re-download video from YouTube');
          return reply.status(500).send({
            error: 'DOWNLOAD_FAILED',
            message: `Failed to re-download video from YouTube: ${downloadError.message}`,
          });
        }
      } else {
        const parsedData = JSON.parse(reprocessData);
        const cachedVideoPath = parsedData.videoPath;
        transcript = parsedData.transcript;

        logger.info({ jobId, cachedVideoPath }, 'Found reprocess data in Redis, checking if video still exists');

        // VERIFICAR se o arquivo ainda existe (pode ter sido deletado do /tmp)
        try {
          await fs.access(cachedVideoPath);
          originalVideoPath = cachedVideoPath;
          logger.info({ jobId, videoPath: originalVideoPath }, 'Original video file still exists, using cached version');
        } catch {
          logger.warn({ jobId, cachedVideoPath }, 'Cached video file no longer exists, will re-download from YouTube');

          // Re-download do vídeo original (YouTube ou Upload)
          const sourceTypeForDownload: 'youtube' | 'youtube_live' | 'upload' =
            jobSourceType || (jobYoutubeUrl ? 'youtube' : 'upload');

          if ((sourceTypeForDownload === 'youtube' || sourceTypeForDownload === 'youtube_live') && !jobYoutubeUrl) {
            logger.error({ jobId }, 'YouTube URL not available for re-download');
            return reply.status(400).send({
              error: 'NO_YOUTUBE_URL',
              message: 'Cannot re-download video: YouTube URL not available',
            });
          }

          if (sourceTypeForDownload === 'upload' && !jobUploadPath) {
            logger.error({ jobId }, 'Upload path not available for re-download');
            return reply.status(400).send({
              error: 'NO_UPLOAD_PATH',
              message: 'Cannot re-download video: upload path not available',
            });
          }

          logger.info({ jobId, sourceTypeForDownload }, 'Re-downloading video');

          const { downloadVideo } = await import('../services/download.js');

          try {
            const downloadResult = await downloadVideo(sourceTypeForDownload, jobYoutubeUrl, jobUploadPath);
            originalVideoPath = downloadResult.videoPath;
            wasRedownloaded = true; // Marcar que foi re-baixado para cleanup posterior
            logger.info({ jobId, videoPath: originalVideoPath }, 'Video re-downloaded successfully');
          } catch (downloadError: any) {
            logger.error({ jobId, error: downloadError.message }, 'Failed to re-download video from YouTube');
            return reply.status(500).send({
              error: 'DOWNLOAD_FAILED',
              message: `Failed to re-download video from YouTube: ${downloadError.message}`,
            });
          }
        }
      }

      // 7. Buscar dados do clip no Redis ou usar dados do resultado do job
      const clipReprocessKey = `reprocess:${jobId}:${clipId}`;
      let clipReprocessData = await redis.get(clipReprocessKey);
      let clipInfo;

      if (!clipReprocessData) {
        // FALLBACK: Usar dados do clipData do job result
        logger.warn({ clipId }, 'Clip reprocess data not in Redis, using job result');
        clipInfo = {
          start: clipData.start,
          end: clipData.end,
          title: clipData.title,
          format: clipData.format?.aspectRatio,
          reframeSettings: clipData.reframeSettings,
        };
      } else {
        clipInfo = JSON.parse(clipReprocessData);
      }

      logger.info({ jobId, clipId, subtitlePreferences }, 'All data loaded, starting reprocess');

      // 8. Responder imediatamente e processar em background
      reply.status(202).send({
        jobId,
        clipId,
        status: 'processing',
        message: 'Clip reprocessing started',
      });

      // 9. Processar em background (não bloquear a resposta)
      (async () => {
        try {
          if (!originalVideoPath) {
            throw new Error('Original video path not found in job data');
          }

          // Reprocessar clip
          const targetFormat = clipInfo?.format || clipData.format?.aspectRatio || '9:16';
          const reframeSettings = clipInfo?.reframeSettings || clipData.reframeSettings;

          const result = await reprocessClip({
            jobId,
            clipId,
            originalVideoPath,
            format: targetFormat,
            reframeSettings,
            clipData: {
              start_time: clipInfo.start,
              end_time: clipInfo.end,
              transcript,
            },
            subtitlePreferences,
            onProgress: async (progress, message) => {
              logger.info({ jobId, clipId, progress, message }, 'Reprocess progress');
            },
          });

          logger.info({ jobId, clipId, result }, 'Reprocessing completed, uploading to storage');

          // Upload para Supabase Storage usando o serviço correto
          const bucket = env.supabase.bucket; // 'raw'
          const videoStoragePath = `clips/${jobId}/${clipId}.mp4`;
          const thumbnailStoragePath = `clips/${jobId}/${clipId}.jpg`;

          // Importar serviço de upload
          const { uploadFile } = await import('../services/storage.js');

          // Upload vídeo
          const videoUpload = await uploadFile(
            bucket,
            videoStoragePath,
            result.videoPath,
            'video/mp4'
          );

          // Upload thumbnail
          const thumbnailUpload = await uploadFile(
            bucket,
            thumbnailStoragePath,
            result.thumbnailPath,
            'image/jpeg'
          );

          // Atualizar banco de dados (Supabase ou Postgres local)
          if (supabase) {
            const { error: updateError } = await supabase
              .from('clips')
              .update({
                preview_url: videoUpload.publicUrl,
                download_url: videoUpload.publicUrl,
                thumbnail_url: thumbnailUpload.publicUrl,
                updated_at: new Date().toISOString(),
              })
              .eq('id', clipId);

            if (updateError) {
              throw new Error(`Database update failed: ${updateError.message}`);
            }
          } else {
            await pool.query(
              `UPDATE clips
               SET video_url = $1,
                   thumbnail_url = $2,
                   storage_path = $3,
                   thumbnail_storage_path = $4,
                   status = 'ready',
                   updated_at = NOW()
               WHERE id = $5`,
              [
                videoUpload.publicUrl,
                thumbnailUpload.publicUrl,
                videoStoragePath,
                thumbnailStoragePath,
                clipId,
              ]
            );
          }

          logger.info({ jobId, clipId }, 'Clip reprocessed and updated successfully');

          // Limpar arquivos temporários
          await fs.rm(result.videoPath, { force: true });
          await fs.rm(result.thumbnailPath, { force: true });

          // Se vídeo foi re-baixado do YouTube, limpar também
          if (wasRedownloaded && originalVideoPath) {
            const { cleanupVideo } = await import('../services/download.js');
            await cleanupVideo(originalVideoPath);
            logger.info({ jobId, videoPath: originalVideoPath }, 'Cleaned up re-downloaded video');
          }
        } catch (bgError: any) {
          logger.error(
            { error: bgError.message, stack: bgError.stack, jobId, clipId },
            'Background reprocessing failed'
          );
        }
      })();

    } catch (error: any) {
      logger.error({ error: error.message, jobId, clipId }, 'Failed to reprocess clip');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to reprocess clip',
      });
    }
  });

  // Get global subtitle preferences for the entire job
  app.get('/jobs/:jobId/subtitle-settings', {
    preHandler: [authenticateJWT, requireJobOwnership],
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const key = `subtitle:${jobId}:global`;

    try {
      const data = await redis.get(key);

      if (!data) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Global subtitle preferences not found',
        });
      }

      const preferences = JSON.parse(data);

      return {
        jobId,
        preferences,
      };
    } catch (error: any) {
      logger.error({ error: error.message, jobId }, 'Failed to get global subtitle preferences');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve subtitle preferences',
      });
    }
  });

  // ============================================
  // CAPTION TEMPLATES
  // ============================================

  // List all public templates + user's own templates
  app.get('/templates', { preHandler: authenticateJWT }, async (request, reply) => {
    try {
      const userId = request.user?.userId || 'dev-user';

      const result = await pool.query(`
        SELECT
          id,
          name,
          category,
          is_premium as "isPremium",
          is_public as "isPublic",
          created_by as "createdBy",
          thumbnail_url as "thumbnailUrl",
          use_count as "useCount",
          style_config as "styleConfig",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM caption_templates
        WHERE is_public = true OR created_by = $1
        ORDER BY use_count DESC, created_at DESC
      `, [userId]);

      return reply.send(result.rows);
    } catch (error) {
      logger.error({ error }, 'Failed to list templates');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to list templates',
      });
    }
  });

  // Get specific template by ID
  app.get('/templates/:templateId', async (request, reply) => {
    try {
      const { templateId } = request.params as { templateId: string };

      const result = await pool.query(`
        SELECT
          id,
          name,
          category,
          is_premium as "isPremium",
          is_public as "isPublic",
          created_by as "createdBy",
          thumbnail_url as "thumbnailUrl",
          use_count as "useCount",
          style_config as "styleConfig",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM caption_templates
        WHERE id = $1
      `, [templateId]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Template not found',
        });
      }

      return reply.send(result.rows[0]);
    } catch (error) {
      logger.error({ error }, 'Failed to get template');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get template',
      });
    }
  });

  // Create custom template
  app.post('/templates', { preHandler: authenticateJWT }, async (request, reply) => {
    try {
      const userId = request.user?.userId || 'dev-user';
      const { name, category, isPublic, styleConfig } = request.body as {
        name: string;
        category: string;
        isPublic?: boolean;
        styleConfig: Record<string, any>;
      };

      const result = await pool.query(`
        INSERT INTO caption_templates (name, category, is_public, created_by, style_config)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          name,
          category,
          is_premium as "isPremium",
          is_public as "isPublic",
          created_by as "createdBy",
          use_count as "useCount",
          style_config as "styleConfig",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `, [name, category || 'custom', isPublic || false, userId, JSON.stringify(styleConfig)]);

      logger.info({ userId, templateId: result.rows[0].id }, 'Template created');

      return reply.code(201).send(result.rows[0]);
    } catch (error) {
      logger.error({ error }, 'Failed to create template');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create template',
      });
    }
  });

  // Update template (only owner can update)
  app.patch('/templates/:templateId', { preHandler: authenticateJWT }, async (request, reply) => {
    try {
      const userId = request.user?.userId || 'dev-user';
      const { templateId } = request.params as { templateId: string };
      const updates = request.body as {
        name?: string;
        styleConfig?: Record<string, any>;
      };

      // Build dynamic UPDATE query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.name) {
        updateFields.push(`name = $${paramCount++}`);
        values.push(updates.name);
      }

      if (updates.styleConfig) {
        updateFields.push(`style_config = $${paramCount++}`);
        values.push(JSON.stringify(updates.styleConfig));
      }

      if (updateFields.length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No fields to update',
        });
      }

      updateFields.push(`updated_at = NOW()`);

      values.push(templateId, userId);

      const result = await pool.query(`
        UPDATE caption_templates
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount} AND created_by = $${paramCount + 1}
        RETURNING
          id,
          name,
          category,
          is_premium as "isPremium",
          is_public as "isPublic",
          created_by as "createdBy",
          use_count as "useCount",
          style_config as "styleConfig",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `, values);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Template not found or not owned by user',
        });
      }

      logger.info({ userId, templateId }, 'Template updated');

      return reply.send(result.rows[0]);
    } catch (error) {
      logger.error({ error }, 'Failed to update template');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to update template',
      });
    }
  });

  // Delete template (only owner can delete)
  app.delete('/templates/:templateId', { preHandler: authenticateJWT }, async (request, reply) => {
    try {
      const userId = request.user?.userId || 'dev-user';
      const { templateId } = request.params as { templateId: string };

      const result = await pool.query(`
        DELETE FROM caption_templates
        WHERE id = $1 AND created_by = $2
      `, [templateId, userId]);

      if (result.rowCount === 0) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Template not found or not owned by user',
        });
      }

      logger.info({ userId, templateId }, 'Template deleted');

      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to delete template');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to delete template',
      });
    }
  });

  // Increment template use count (analytics)
  app.post('/templates/:templateId/use', async (request, reply) => {
    try {
      const { templateId } = request.params as { templateId: string };

      await pool.query(`
        UPDATE caption_templates
        SET use_count = use_count + 1
        WHERE id = $1
      `, [templateId]);

      logger.debug({ templateId }, 'Template use count incremented');

      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to increment template use count');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to increment template use count',
      });
    }
  });

  // ============================================
  // SERVE VIDEO FILES (From local storage or Supabase)
  // ============================================
  app.get('/clips/:jobId/:filename', {
    preHandler: [authenticateJWT, requireJobOwnership],
  }, async (request, reply) => {
    const { jobId, filename } = request.params as { jobId: string; filename: string };
    const { download } = request.query as { download?: string };

    try {
      const filePath = `clips/${jobId}/${filename}`;

      // Se Supabase não está configurado, servir do armazenamento local
      if (!supabaseClient) {
        logger.info({ filePath, download }, 'Serving video file from local storage');

        const { join } = await import('path');
        const storagePath = env.localStoragePath || './uploads';
        const localPath = join(storagePath, filePath);

        try {
          const fileBuffer = await fs.readFile(localPath);

          // Set proper headers for video streaming
          const contentType = filename.endsWith('.jpg') ? 'image/jpeg' : 'video/mp4';
          reply.header('Content-Type', contentType);
          reply.header('Accept-Ranges', 'bytes');
          reply.header('Cache-Control', 'private, max-age=31536000, immutable');

          // If download parameter is present, force download
          if (download === 'true') {
            reply.header('Content-Disposition', `attachment; filename="${filename}"`);
          }

          logger.info({ filePath, size: fileBuffer.length }, 'Video file sent successfully from local storage');
          return reply.send(fileBuffer);
        } catch (fileError: any) {
          logger.error({ error: fileError.message, localPath }, 'File not found in local storage');
          return reply.status(404).send({
            error: 'FILE_NOT_FOUND',
            message: `File not found: ${filePath}`,
          });
        }
      }

      // Caso contrário, buscar do Supabase
      logger.info({ filePath, download }, 'Proxying video file from Supabase');

      const { data, error } = await supabaseClient.storage
        .from('raw')
        .download(filePath);

      if (error || !data) {
        logger.error({ error, filePath }, 'File not found in Supabase storage');
        return reply.status(404).send({
          error: 'FILE_NOT_FOUND',
          message: `File not found: ${filePath}`,
        });
      }

      // Set proper headers for video streaming
      const contentType = filename.endsWith('.jpg') ? 'image/jpeg' : 'video/mp4';
      reply.header('Content-Type', contentType);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Cache-Control', 'private, max-age=31536000, immutable');

      // If download parameter is present, force download
      if (download === 'true') {
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      logger.info({ filePath, size: buffer.length }, 'Video file sent successfully from Supabase');

      return reply.send(buffer);
    } catch (error: any) {
      logger.error({ error: error.message, jobId, filename }, 'Failed to serve video file');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve video file',
      });
    }
  });

  // ============================================
  // CLIP REVIEW ENDPOINTS
  // ============================================

  // Get clip details by ID
  app.get('/api/clips/:clipId', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { clipId } = request.params as { clipId: string };

    try {
      const clip = await db.clips.findById(clipId);

      if (!clip) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      // Ownership check (avoid ID enumeration)
      if (clip.user_id !== request.user!.userId) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      const description = typeof (clip as any)?.description === 'string' && String((clip as any).description).trim()
        ? (clip as any).description
        : 'Descrição gerada automaticamente';

      return reply.send({
        ...clip,
        description,
      });
    } catch (error: any) {
      logger.error({ error: error.message, clipId }, 'Failed to get clip');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve clip',
      });
    }
  });

  // Select which SEO/copy variant is the default for publishing
  app.patch('/api/clips/:clipId/seo', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { clipId } = request.params as { clipId: string };

    const bodySchema = z.object({
      selectedIndex: z.number().int().min(0).max(20),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid request body',
        details: parsed.error.format(),
      });
    }

    try {
      const clip = await db.clips.findById(clipId);
      if (!clip) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      // Ownership check
      if (clip.user_id !== request.user!.userId) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      const selectedIndex = parsed.data.selectedIndex;

      const rawVariants = (clip as any).seo_variants;
      let variants: any[] = [];
      if (Array.isArray(rawVariants)) variants = rawVariants;
      else if (typeof rawVariants === 'string') {
        try { variants = JSON.parse(rawVariants); } catch { variants = []; }
      }

      if (!Array.isArray(variants) || variants.length === 0) {
        return reply.status(400).send({
          error: 'NO_VARIANTS',
          message: 'No SEO variants available for this clip',
        });
      }

      if (selectedIndex < 0 || selectedIndex >= variants.length) {
        return reply.status(400).send({
          error: 'OUT_OF_RANGE',
          message: `selectedIndex must be between 0 and ${Math.max(0, variants.length - 1)}`,
        });
      }

      const chosen = variants[selectedIndex] || {};
      const seoTitle = typeof chosen.title === 'string' ? chosen.title : '';
      const seoDescription = typeof chosen.description === 'string' ? chosen.description : '';
      const seoHashtags = Array.isArray(chosen.hashtags)
        ? chosen.hashtags.map((t: any) => String(t || '').trim()).filter(Boolean)
        : [];

      const updated = await db.clips.update(clipId, {
        seo_title: seoTitle,
        seo_description: seoDescription,
        seo_hashtags: seoHashtags,
        seo_selected_index: selectedIndex,
      });

      return reply.send({
        clipId,
        seoTitle: updated?.seo_title,
        seoDescription: updated?.seo_description,
        seoHashtags: updated?.seo_hashtags,
        seoSelectedIndex: updated?.seo_selected_index,
        message: 'SEO metadata updated',
      });
    } catch (error: any) {
      logger.error({ error: error.message, clipId }, 'Failed to update SEO metadata');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update SEO metadata',
      });
    }
  });

  // Regenerate SEO/copy variants for an existing clip (useful during development)
  app.post('/api/clips/:clipId/seo/regenerate', {
    preHandler: [authenticateJWT, requireBetaAllowlist],
  }, async (request, reply) => {
    const { clipId } = request.params as { clipId: string };

    const bodySchema = z.object({
      platform: z.enum(['tiktok', 'instagram', 'youtube']).optional(),
    });

    const parsed = bodySchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid request body',
        details: parsed.error.format(),
      });
    }

    try {
      const clip = await db.clips.findById(clipId);
      if (!clip) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      // Ownership check
      if (clip.user_id !== request.user!.userId) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      const platform = parsed.data.platform || 'tiktok';

      // Try to reconstruct the clip transcript text from the stored full transcript (if available).
      let transcriptText = '';
      try {
        const rawTranscript = (clip as any).transcript;
        const transcriptObj = typeof rawTranscript === 'string' ? JSON.parse(rawTranscript) : rawTranscript;
        const segments = transcriptObj?.segments;
        const startTime = Number((clip as any).start_time);
        const endTime = Number((clip as any).end_time);
        if (Array.isArray(segments) && Number.isFinite(startTime) && Number.isFinite(endTime)) {
          const picked = segments.filter((s: any) =>
            typeof s?.start === 'number'
            && typeof s?.end === 'number'
            && s.start >= startTime
            && s.end <= endTime
          );
          transcriptText = picked.map((s: any) => String(s?.text || '')).join(' ');
        }
      } catch {
        transcriptText = '';
      }

      const seoMetadata = await generateSeoMetadata({
        title: String((clip as any).title || ''),
        description: String((clip as any).description || ''),
        transcript: transcriptText || String((clip as any).description || ''),
        keywords: Array.isArray((clip as any).hashtags) ? (clip as any).hashtags : [],
        platform,
        seed: String(Date.now()),
      });

      const updated = await db.clips.update(clipId, {
        seo_title: seoMetadata.seoTitle,
        seo_description: seoMetadata.seoDescription,
        seo_hashtags: seoMetadata.seoHashtags,
        seo_variants: seoMetadata.seoVariants,
        seo_selected_index: seoMetadata.seoSelectedIndex,
      });

      return reply.send({
        clipId,
        seoTitle: updated?.seo_title,
        seoDescription: updated?.seo_description,
        seoHashtags: updated?.seo_hashtags,
        seoVariants: seoMetadata.seoVariants,
        seoSelectedIndex: updated?.seo_selected_index,
        message: 'SEO variants regenerated',
      });
    } catch (error: any) {
      logger.error({ error: error.message, clipId }, 'Failed to regenerate SEO variants');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to regenerate SEO variants',
      });
    }
  });

  // Approve clip
  app.patch('/api/clips/:clipId/approve', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { clipId } = request.params as { clipId: string };
    const { rating } = request.body as { rating?: number };

    try {
      const existing = await db.clips.findById(clipId);
      if (!existing || existing.user_id !== request.user!.userId) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      const clip = await db.clips.approveClip(clipId, rating);

      if (!clip) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      logger.info({ clipId, rating }, 'Clip approved');

      return reply.send({
        clipId,
        status: 'approved',
        message: 'Clip approved successfully',
        clip,
      });
    } catch (error: any) {
      logger.error({ error: error.message, clipId }, 'Failed to approve clip');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to approve clip',
      });
    }
  });

  // Reject clip
  app.patch('/api/clips/:clipId/reject', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { clipId } = request.params as { clipId: string };
    const { reason, comment } = request.body as { reason: string; comment?: string };

    if (!reason) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Rejection reason is required',
      });
    }

    try {
      const existing = await db.clips.findById(clipId);
      if (!existing || existing.user_id !== request.user!.userId) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      const clip = await db.clips.rejectClip(clipId, reason);

      if (!clip) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      // Save feedback if comment provided
      if (comment) {
        const userId = request.user!.userId;
        await db.clipFeedback.insert({
          clip_id: clipId,
          user_id: userId,
          feedback_type: reason,
          comment,
        });
      }

      logger.info({ clipId, reason }, 'Clip rejected');

      return reply.send({
        clipId,
        status: 'rejected',
        message: 'Clip rejected successfully',
        clip,
      });
    } catch (error: any) {
      logger.error({ error: error.message, clipId }, 'Failed to reject clip');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to reject clip',
      });
    }
  });

  // Submit feedback for clip
  app.post('/api/clips/:clipId/feedback', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { clipId } = request.params as { clipId: string };
    const { rating, feedbackType, comment } = request.body as {
      rating?: number;
      feedbackType: string;
      comment?: string;
    };

    if (!feedbackType) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Feedback type is required',
      });
    }

    try {
      const userId = request.user!.userId;

      const clip = await db.clips.findById(clipId);
      if (!clip || clip.user_id !== userId) {
        return reply.status(404).send({
          error: 'CLIP_NOT_FOUND',
          message: 'Clip not found',
        });
      }

      const feedback = await db.clipFeedback.insert({
        clip_id: clipId,
        user_id: userId,
        rating,
        feedback_type: feedbackType,
        comment,
      });

      logger.info({ clipId, feedbackType }, 'Feedback submitted');

      return reply.status(201).send({
        message: 'Feedback submitted successfully',
        feedback,
      });
    } catch (error: any) {
      logger.error({ error: error.message, clipId }, 'Failed to submit feedback');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to submit feedback',
      });
    }
  });

  // Get review summary for a project
  app.get('/api/projects/:projectId/review-summary', {
    preHandler: [authenticateJWT, requireProjectOwnership],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      const summary = await db.clips.getReviewSummary(projectId);

      return reply.send({
        projectId,
        totalClips: parseInt(summary.total),
        pendingReview: parseInt(summary.pending),
        approved: parseInt(summary.approved),
        rejected: parseInt(summary.rejected),
        averageScore: summary.average_score ? parseFloat(summary.average_score) : null,
      });
    } catch (error: any) {
      logger.error({ error: error.message, projectId }, 'Failed to get review summary');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve review summary',
      });
    }
  });

  // Get all clips for a project (for review page)
  app.get('/api/projects/:projectId/clips', {
    preHandler: [authenticateJWT, requireProjectOwnership],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      const clips = await db.clips.findByJobId(projectId);

      const withVersion = (url: string, version?: number) => {
        if (!version) return url;
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}v=${version}`;
      };

      const normalized = (clips || []).map((clip: any) => {
        const updatedAtVersion = clip?.updated_at ? new Date(clip.updated_at).getTime() : undefined;
        const videoProxyUrl = withVersion(`${env.baseUrl}/clips/${projectId}/${clip.id}.mp4`, updatedAtVersion);
        const thumbProxyUrl = withVersion(`${env.baseUrl}/clips/${projectId}/${clip.id}.jpg`, updatedAtVersion);

        const description = typeof clip?.description === 'string' && clip.description.trim()
          ? clip.description
          : 'Descrição gerada automaticamente';

        return {
          ...clip,
          description,
          video_url: videoProxyUrl,
          thumbnail_url: thumbProxyUrl,
        };
      });

      return reply.send(normalized);
    } catch (error: any) {
      logger.error({ error: error.message, projectId }, 'Failed to get project clips');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve project clips',
      });
    }
  });

  // Finalize review (mark project as reviewed)
  app.post('/api/projects/:projectId/finalize-review', {
    preHandler: [authenticateJWT, requireProjectOwnership],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      // Get approved clips
      const allClips = await db.clips.findByJobId(projectId);
      const approvedClips = allClips.filter((clip: any) => clip.status === 'approved');

      // Update job status to indicate review is complete
      await dbJobs.update(projectId, {
        status: 'reviewed',
        metadata: {
          review_completed_at: new Date().toISOString(),
          approved_clips_count: approvedClips.length,
        },
      });

      logger.info({ projectId, approvedCount: approvedClips.length }, 'Review finalized');

      return reply.send({
        projectId,
        approvedClips: approvedClips.map((c: any) => c.id),
        message: 'Review finalized successfully',
      });
    } catch (error: any) {
      logger.error({ error: error.message, projectId }, 'Failed to finalize review');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to finalize review',
      });
    }
  });

  // ============================================
  // COMMERCIAL ROUTES (scheduler / queue / live / brand kit)
  // ============================================
  await registerCommercialRoutes(app);

  // ============================================
  // SOCIAL MEDIA ROUTES
  // ============================================
  if (env.socialMediaEnabled || env.directPublishingEnabled) {
    await registerSocialMediaRoutes(app);
  } else {
    logger.info('Social media routes disabled (SOCIAL_MEDIA_ENABLED=false and DIRECT_PUBLISHING_ENABLED=false)');
  }
}
