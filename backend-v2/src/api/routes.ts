import type { FastifyInstance, FastifyReply } from 'fastify';
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
  type ProjectConfig,
  type SubtitlePreferences,
} from '../types/index.js';
import { addVideoJob, getJobStatus, cancelJob, getQueueHealth, videoQueue } from '../jobs/queue.js';
import { clips as dbClips } from '../services/database.service.js';
import { createLogger } from '../config/logger.js';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { redis, setTempConfig, getTempConfig, deleteTempConfig } from '../config/redis.js';
import { registerSocialMediaRoutes } from './social-media.js';
import { registerAuthRoutes } from './auth.routes.js';
import { registerPaymentsRoutes } from './payments.routes.js';
import { registerAdminRoutes } from './admin.routes.js';
import { reprocessClip } from '../services/clip-reprocessor.js';
import * as db from '../services/database.service.js';
import * as mp from '../services/mercadopago.service.js';

const logger = createLogger('routes');
const dbJobs = db.jobs;

function getRequestUserId(request: any): string | undefined {
  return request?.user?.userId;
}

function getProgressValue(progress: unknown): number {
  if (typeof progress === 'number') {
    return progress;
  }

  if (
    typeof progress === 'object' &&
    progress !== null &&
    'progress' in progress &&
    typeof (progress as { progress?: unknown }).progress === 'number'
  ) {
    return (progress as { progress: number }).progress;
  }

  return 0;
}

async function enforceUsageLimits(
  reply: FastifyReply,
  userId: string,
  requestedClipCount: number,
  targetDurationSeconds: number
): Promise<boolean> {
  const [clipLimits, minuteLimits] = await Promise.all([
    mp.checkUserLimits(userId, 'clip'),
    mp.checkUserLimits(userId, 'minute'),
  ]);

  const estimatedMinutes = Math.max(1, Math.ceil((requestedClipCount * targetDurationSeconds) / 60));
  const clipsWouldExceed = clipLimits.currentUsage + requestedClipCount > clipLimits.maxAllowed;
  const minutesWouldExceed = minuteLimits.currentUsage + estimatedMinutes > minuteLimits.maxAllowed;

  if (!clipLimits.canUse || !minuteLimits.canUse || clipsWouldExceed || minutesWouldExceed) {
    reply.status(403).send({
      error: 'LIMIT_EXCEEDED',
      message: 'Você atingiu o limite do seu plano. Faça upgrade para continuar.',
      upgradeUrl: '/billing',
      limits: {
        planName: clipLimits.planName,
        clips: {
          used: clipLimits.currentUsage,
          limit: clipLimits.maxAllowed,
          requested: requestedClipCount,
        },
        minutes: {
          used: minuteLimits.currentUsage,
          limit: minuteLimits.maxAllowed,
          estimatedRequested: estimatedMinutes,
        },
      },
    });
    return false;
  }

  return true;
}

// Criar cliente Supabase global com service_key (bypassa RLS automaticamente) - apenas se configurado
const supabaseClient = env.supabase.url && env.supabase.serviceKey
  ? createClient(env.supabase.url, env.supabase.serviceKey)
  : null;

export async function registerRoutes(app: FastifyInstance) {
  // ============================================
  // AUTHENTICATION ROUTES
  // ============================================
  await registerAuthRoutes(app);

  // ============================================
  // PAYMENT ROUTES (MercadoPago)
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
    const queueHealth = await getQueueHealth();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      queue: queueHealth,
    };
  });

  // ============================================
  // CREATE JOB FROM UPLOAD (after file is uploaded to Supabase)
  // ============================================
  app.post('/jobs/from-upload', async (request, reply) => {
    const schema = z.object({
      userId: z.string().uuid(),
      storagePath: z.string(),
      fileName: z.string(),
      targetDuration: z.number().min(15).max(90).default(60),
      clipCount: z.number().min(1).max(10).default(5),
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
    const requestUserId = getRequestUserId(request);

    if (requestUserId && input.userId !== requestUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only create jobs for your own user',
      });
    }

    const effectiveUserId = requestUserId || input.userId;

    if (!(await enforceUsageLimits(reply, effectiveUserId, input.clipCount, input.targetDuration))) {
      return;
    }

    const jobId = `job_${randomUUID().replace(/-/g, '')}`;

    const jobData: JobData = {
      jobId,
      userId: effectiveUserId,
      sourceType: 'upload',
      uploadPath: input.storagePath,
      fileName: input.fileName,
      targetDuration: input.targetDuration,
      clipCount: input.clipCount,
      createdAt: new Date(),
    };

    await addVideoJob(jobData);

    logger.info({ jobId, userId: effectiveUserId, storagePath: input.storagePath }, 'Job created from upload');

    return reply.status(201).send({
      jobId,
      status: 'queued',
      message: 'Job created successfully from upload',
    });
  });

  // ============================================
  // CREATE JOB
  // ============================================
  app.post('/jobs', async (request, reply) => {
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
    const requestUserId = getRequestUserId(request);

    if (requestUserId && input.userId !== requestUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only create jobs for your own user',
      });
    }

    const effectiveUserId = requestUserId || input.userId;

    if (!(await enforceUsageLimits(reply, effectiveUserId, input.clipCount, input.targetDuration))) {
      return;
    }

    // Validar sourceType
    if (input.sourceType === 'youtube' && !input.youtubeUrl) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'youtubeUrl is required for youtube source',
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

    const jobData: JobData = {
      jobId,
      userId: effectiveUserId,
      sourceType: input.sourceType,
      youtubeUrl: input.youtubeUrl,
      uploadPath: input.uploadPath,
      targetDuration: input.targetDuration,
      clipCount: input.clipCount,
      createdAt: new Date(),
    };

    await addVideoJob(jobData);

    logger.info({ jobId, userId: effectiveUserId }, 'Job created');

    return reply.status(201).send({
      jobId,
      status: 'queued',
      message: 'Job created successfully',
    });
  });

  // ============================================
  // LIST ALL JOBS FOR USER
  // ============================================
  app.get('/jobs', async (request, reply) => {
    try {
      const query = request.query as { userId?: string; includeLegacy?: string } | undefined;
      const requestedUserId = query?.userId?.trim();
      const includeLegacy = query?.includeLegacy === 'true';
      const requestUserId = getRequestUserId(request);

      const userIds = new Set<string>();

      if (requestUserId) {
        if (requestedUserId && requestedUserId !== requestUserId) {
          return reply.status(403).send({
            error: 'FORBIDDEN',
            message: 'You can only access your own jobs',
          });
        }
        userIds.add(requestUserId);
      } else {
        if (requestedUserId) userIds.add(requestedUserId);
        if (includeLegacy) userIds.add('dev-user');
        if (userIds.size === 0) userIds.add('dev-user');
      }

      logger.info({ userIds: Array.from(userIds) }, 'Fetching all jobs for users');

      const jobsByUser = await Promise.all(
        Array.from(userIds).map(async (userId) => dbJobs.findByUserId(userId))
      );

      const mergedJobs = jobsByUser.flat();
      const uniqueById = new Map<string, any>();
      for (const job of mergedJobs) {
        if (!uniqueById.has(job.id)) {
          uniqueById.set(job.id, job);
        }
      }

      const jobs = Array.from(uniqueById.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const clipRows = await Promise.all(
        jobs.map(async (job) => {
          const clips = await dbClips.findByJobId(job.id);
          return { jobId: job.id, count: clips.length };
        })
      );
      const clipsByJob = new Map<string, number>(
        clipRows.map((row) => [row.jobId, row.count])
      );

      const withClipData = jobs.map((job) => {
        const metadataTitle = typeof job.metadata === 'object' ? job.metadata?.title : undefined;
        const displayTitle =
          (typeof job.title === 'string' && job.title.trim().length > 0 ? job.title : null) ||
          (typeof metadataTitle === 'string' && metadataTitle.trim().length > 0 ? metadataTitle : null);

        return {
          ...job,
          display_title: displayTitle,
          clips_ready_count: clipsByJob.get(job.id) || 0,
        };
      });

      logger.info({
        requestedUserId,
        includeLegacy,
        count: withClipData.length,
      }, 'Found jobs for users');

      return reply.send(withClipData);
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
  app.get('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const requestUserId = getRequestUserId(request);

    const dbJob = await dbJobs.findById(jobId);
    if (requestUserId && dbJob && dbJob.user_id !== requestUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only access your own jobs',
      });
    }

    const status = await getJobStatus(jobId);

    if (!status) {
      return reply.status(404).send({
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }

    const queueUserId = (status.data as { userId?: string } | undefined)?.userId;
    if (requestUserId && queueUserId && queueUserId !== requestUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only access your own jobs',
      });
    }

    // Transform result to match frontend expectations
    // NOTE: BullMQ may return returnvalue as a JSON string in some cases
    let result: any;
    try {
      result = typeof status.returnvalue === 'string'
        ? JSON.parse(status.returnvalue)
        : status.returnvalue;
    } catch {
      result = status.returnvalue;
    }

    logger.info({
      jobId,
      state: status.state,
      hasReturnvalue: !!status.returnvalue,
      returnvalueType: typeof status.returnvalue,
      resultKeys: result ? Object.keys(result) : null,
      hasClips: result?.clips ? result.clips.length : 'no clips key',
    }, 'GET /jobs/:jobId - returnvalue debug');

    // Helper to transform raw clip data to frontend format
    const transformClip = (clip: any) => {
      const proxyUrl = `${env.baseUrl}/clips/${jobId}/${clip.id}.mp4`;
      return {
        id: clip.id,
        title: clip.title,
        description: clip.description || clip.transcript || clip.reason || 'Descrição gerada automaticamente',
        hashtags: clip.hashtags || clip.keywords || [],
        previewUrl: proxyUrl,
        downloadUrl: clip.storagePath || clip.video_url || proxyUrl,
        thumbnailUrl: clip.thumbnail || clip.thumbnail_url,
        duration: clip.duration,
        status: 'ready',
        start: clip.start ?? clip.start_time,
        end: clip.end ?? clip.end_time,
        score: clip.score,
      };
    };

    if (result && result.clips && Array.isArray(result.clips) && result.clips.length > 0) {
      result = {
        ...result,
        clips: result.clips.map(transformClip),
      };
    } else if (status.state === 'completed') {
      // Fallback: fetch clips from PostgreSQL database when BullMQ returnvalue has no clips
      logger.info({ jobId }, 'No clips in returnvalue, fetching from database');
      try {
        const dbClipRows = await dbClips.findByJobId(jobId);
        if (dbClipRows.length > 0) {
          logger.info({ jobId, clipCount: dbClipRows.length }, 'Found clips in database');
          result = {
            ...(result || {}),
            clips: dbClipRows.map(transformClip),
          };
        } else {
          logger.warn({ jobId }, 'No clips found in database either');
        }
      } catch (dbError: any) {
        logger.error({ jobId, error: dbError.message }, 'Failed to fetch clips from database');
      }
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

    // Detect jobs where BullMQ state is 'completed' but processor returned a failure
    // (legacy behavior before the throw fix)
    const effectiveState = (status.state === 'completed' && result?.status === 'failed')
      ? 'failed'
      : status.state;
    const effectiveError = (effectiveState === 'failed')
      ? (status.failedReason || result?.error || 'Unknown error')
      : status.failedReason;

    return {
      jobId: status.id,
      state: effectiveState,
      status: effectiveState,
      currentStep: effectiveState === 'failed' ? currentStep : currentStep,
      progress: status.progress,
      result,
      error: effectiveError,
      finishedAt: status.finishedOn ? new Date(status.finishedOn).toISOString() : null,
    };
  });

  // ============================================
  // SSE JOB STREAM (Real-time updates)
  // ============================================
  app.get('/api/jobs/:jobId/stream', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const requestUserId = getRequestUserId(request);

    const dbJob = await dbJobs.findById(jobId);
    if (requestUserId && dbJob && dbJob.user_id !== requestUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only access your own jobs',
      });
    }

    // Verificar se job existe
    const status = await getJobStatus(jobId);
    if (!status) {
      return reply.status(404).send({
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }

    const queueUserId = (status.data as { userId?: string } | undefined)?.userId;
    if (requestUserId && queueUserId && queueUserId !== requestUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only access your own jobs',
      });
    }

    // Configurar headers SSE
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

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

    // Enviar status inicial
    const initialProgressValue = getProgressValue(status.progress);
    sendSSE('progress', {
      jobId: status.id,
      state: status.state,
      status: status.state,
      currentStep: deriveCurrentStep(status.state, initialProgressValue || 0),
      progress: status.progress,
    });

    // Listen para progress updates
    queueEvents.on('progress', async ({ jobId: eventJobId, data }) => {
      if (eventJobId === jobId) {
        const progressData = typeof data === 'object' && data !== null ? data : { progress: data };
        const progressValue = getProgressValue(data);

        sendSSE('progress', {
          jobId: eventJobId,
          state: 'active',
          status: 'active',
          currentStep: deriveCurrentStep('active', progressValue),
          progress: progressData,
        });
      }
    });

    // Listen para completed
    queueEvents.on('completed', async ({ jobId: eventJobId, returnvalue }) => {
      if (eventJobId === jobId) {
        // Transform result like in GET endpoint
        // NOTE: BullMQ QueueEvents returns returnvalue as a JSON string, need to parse it
        let result: any;
        try {
          result = typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;
        } catch {
          logger.error({ jobId }, 'Failed to parse returnvalue in SSE completed event');
          result = {};
        }

        // Helper to transform clip data
        const transformClip = (clip: any) => {
          const proxyUrl = `${env.baseUrl}/clips/${jobId}/${clip.id}.mp4`;
          return {
            id: clip.id,
            title: clip.title,
            description: clip.description || clip.transcript || clip.reason || 'Descrição gerada automaticamente',
            hashtags: clip.hashtags || clip.keywords || [],
            previewUrl: proxyUrl,
            downloadUrl: clip.storagePath || clip.video_url || proxyUrl,
            thumbnailUrl: clip.thumbnail || clip.thumbnail_url,
            duration: clip.duration,
            status: 'ready',
            start: clip.start ?? clip.start_time,
            end: clip.end ?? clip.end_time,
            score: clip.score,
          };
        };

        if (result && result.clips && Array.isArray(result.clips) && result.clips.length > 0) {
          result = {
            ...result,
            clips: result.clips.map(transformClip),
          };
        } else {
          // Fallback: fetch clips from database
          logger.info({ jobId }, 'SSE completed: no clips in returnvalue, fetching from database');
          try {
            const dbClipRows = await dbClips.findByJobId(jobId);
            if (dbClipRows.length > 0) {
              logger.info({ jobId, clipCount: dbClipRows.length }, 'SSE: Found clips in database');
              result = {
                ...(result || {}),
                clips: dbClipRows.map(transformClip),
              };
            }
          } catch (dbError: any) {
            logger.error({ jobId, error: dbError.message }, 'SSE: Failed to fetch clips from database');
          }
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
  app.patch('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const updates = request.body as { title?: string };
    const requestUserId = getRequestUserId(request);

    try {
      // Verificar se job existe
      const job = await dbJobs.findById(jobId);

      if (!job) {
        return reply.status(404).send({
          error: 'JOB_NOT_FOUND',
          message: `Job ${jobId} not found`,
        });
      }

      if (requestUserId && job.user_id !== requestUserId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'You can only update your own jobs',
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
  app.delete('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const requestUserId = getRequestUserId(request);

    try {
      // 1. Verificar se job existe e pertence ao usuário autenticado (quando houver)
      const job = await dbJobs.findById(jobId);

      if (!job) {
        return reply.status(404).send({
          error: 'JOB_NOT_FOUND',
          message: `Job ${jobId} not found`,
        });
      }

      if (requestUserId && job.user_id !== requestUserId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'You can only delete your own jobs',
        });
      }

      // 2. Cancelar job na fila se ainda estiver ativo
      await cancelJob(jobId);

      // 3. Deletar todos os clips associados
      await db.clips.deleteByJobId(jobId);

      // 4. Deletar job
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
  app.post('/jobs/temp', async (request, reply) => {
    const parsed = CreateTempConfigSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid request body',
        details: parsed.error.format(),
      });
    }

    const requestUserId = getRequestUserId(request);
    const sourceInput = parsed.data;

    if (requestUserId && sourceInput.userId !== requestUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only create temp configs for your own user',
      });
    }

    const effectiveUserId = requestUserId || sourceInput.userId;

    // Generate unique tempId
    const tempId = `temp_${randomUUID().replace(/-/g, '')}`;

    // Create configuration with defaults
    const configBase = {
      tempId,
      userId: effectiveUserId,
      clipSettings: DEFAULT_CLIP_SETTINGS,
      subtitlePreferences: DEFAULT_SUBTITLE_PREFERENCES,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour expiration
    };

    const config: ProjectConfig = sourceInput.sourceType === 'youtube'
      ? {
          ...configBase,
          sourceType: 'youtube',
          youtubeUrl: sourceInput.youtubeUrl,
        }
      : {
          ...configBase,
          sourceType: 'upload',
          uploadPath: sourceInput.uploadPath,
          fileName: sourceInput.fileName,
        };

    // Save to Redis with 1 hour TTL
    await setTempConfig(tempId, config, 3600);

    logger.info({ tempId, userId: effectiveUserId, sourceType: sourceInput.sourceType }, 'Temporary config created');

    return reply.status(201).send({ tempId, config });
  });

  // GET /jobs/temp/:tempId - Get temporary configuration
  app.get('/jobs/temp/:tempId', async (request, reply) => {
    const { tempId } = request.params as { tempId: string };
    const requestUserId = getRequestUserId(request);

    const config = await getTempConfig(tempId);

    if (!config) {
      return reply.status(404).send({
        error: 'CONFIG_NOT_FOUND',
        message: 'Configuration not found or expired. Please create a new project.',
      });
    }

    if (requestUserId && config.userId !== requestUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only access your own temp configs',
      });
    }

    return reply.send(config);
  });

  // POST /jobs/temp/:tempId/start - Start processing with configuration
  app.post('/jobs/temp/:tempId/start', async (request, reply) => {
    const { tempId } = request.params as { tempId: string };
    const requestUserId = getRequestUserId(request);

    // 1. Get temporary configuration
    const tempConfig = await getTempConfig(tempId);

    if (!tempConfig) {
      return reply.status(404).send({
        error: 'CONFIG_NOT_FOUND',
        message: 'Configuration expired or not found',
      });
    }

    if (requestUserId && tempConfig.userId !== requestUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only start jobs from your own temp configs',
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

    if (
      !(await enforceUsageLimits(
        reply,
        tempConfig.userId,
        finalConfig.clipSettings.clipCount,
        finalConfig.clipSettings.targetDuration
      ))
    ) {
      return;
    }

    // 3. Create JobData with complete configuration
    const jobId = `job_${randomUUID().replace(/-/g, '')}`;

    const jobData: JobData = {
      jobId,
      userId: tempConfig.userId,
      sourceType: tempConfig.sourceType,
      youtubeUrl: tempConfig.youtubeUrl,
      uploadPath: tempConfig.uploadPath,
      fileName: tempConfig.fileName,
      targetDuration: finalConfig.clipSettings.targetDuration,
      clipCount: finalConfig.clipSettings.clipCount,
      clipSettings: finalConfig.clipSettings,
      subtitlePreferences: finalConfig.subtitlePreferences as SubtitlePreferences,
      timeframe: finalConfig.timeframe,
      genre: finalConfig.genre,
      specificMoments: finalConfig.specificMoments,
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

    // 5. Add job to queue
    await addVideoJob(jobData);

    // 6. Delete temporary configuration
    await deleteTempConfig(tempId);

    logger.info({ jobId, tempId, userId: tempConfig.userId }, 'Job started from temp config');

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
  app.patch('/jobs/:jobId/clips/:clipId/subtitle-settings', async (request, reply) => {
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
  app.get('/jobs/:jobId/clips/:clipId/subtitle-settings', async (request, reply) => {
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
  app.patch('/jobs/:jobId/subtitle-settings', async (request, reply) => {
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
  app.post('/jobs/:jobId/clips/:clipId/reprocess', async (request, reply) => {
    const { jobId, clipId } = request.params as { jobId: string; clipId: string };

    logger.info({ jobId, clipId }, 'Starting fast clip reprocessing');

    try {
      // Usar cliente Supabase global (já configurado com service_key)
      const supabase = supabaseClient;

      if (!supabase) {
        return reply.status(500).send({
          error: 'SUPABASE_NOT_CONFIGURED',
          message: 'Supabase service key is required for clip reprocessing',
        });
      }

      // 1. Buscar job do BullMQ (dados dos vídeos existentes estão aqui)
      const job = await videoQueue.getJob(jobId);

      if (!job) {
        logger.error({ jobId }, 'Job not found in queue');
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Job not found',
        });
      }

      // 2. Buscar resultado do job (contém clips e transcripts)
      const result = job.returnvalue as { clips?: any[] } | null | undefined;

      if (!result || !Array.isArray(result.clips)) {
        logger.error({ jobId }, 'Job result not found');
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Job result not available. Job may still be processing.',
        });
      }

      // 3. Encontrar o clip específico no resultado
      const clipData = result.clips.find((c: any) => c.id === clipId);

      if (!clipData) {
        logger.error({ clipId, jobId }, 'Clip not found in job result');
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Clip not found',
        });
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

        // 1. Buscar transcript do banco de dados
        const { data: clipDbData, error: clipDbError } = await supabase
          .from('clips')
          .select('transcript, start_time, end_time')
          .eq('id', clipId)
          .single();

        if (clipDbError || !clipDbData) {
          logger.error({ jobId, clipId, error: clipDbError?.message }, 'Clip not found in database');
          return reply.status(404).send({
            error: 'CLIP_NOT_FOUND',
            message: 'Clip not found in database',
          });
        }

        if (!clipDbData.transcript) {
          logger.error({ jobId, clipId }, 'Transcript not found in database');
          return reply.status(400).send({
            error: 'TRANSCRIPT_NOT_FOUND',
            message:
              'Transcript not found in database. This video was processed before transcript storage was implemented.',
          });
        }

        transcript = clipDbData.transcript;
        logger.info({ jobId, clipId, hasTranscript: true }, 'Found transcript in database');

        // 2. Re-download vídeo do YouTube (vídeo original provavelmente foi deletado do /tmp)
        const jobData = job.data;

        if (!jobData.youtubeUrl) {
          logger.error({ jobId }, 'YouTube URL not available for re-download');
          return reply.status(400).send({
            error: 'NO_YOUTUBE_URL',
            message: 'Cannot re-download video: YouTube URL not available',
          });
        }

        logger.info({ jobId, youtubeUrl: jobData.youtubeUrl }, 'Re-downloading video from YouTube for reprocessing');

        // Importar dinamicamente o serviço de download
        const { downloadVideo } = await import('../services/download.js');

        try {
          const downloadResult = await downloadVideo('youtube', jobData.youtubeUrl, undefined);
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

          // Re-download do YouTube
          const jobData = job.data;

          if (!jobData.youtubeUrl) {
            logger.error({ jobId }, 'YouTube URL not available for re-download');
            return reply.status(400).send({
              error: 'NO_YOUTUBE_URL',
              message: 'Cannot re-download video: YouTube URL not available',
            });
          }

          logger.info({ jobId, youtubeUrl: jobData.youtubeUrl }, 'Re-downloading video from YouTube');

          const { downloadVideo } = await import('../services/download.js');

          try {
            const downloadResult = await downloadVideo('youtube', jobData.youtubeUrl, undefined);
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
          // Usar cliente Supabase global (já tem service_key que bypassa RLS)
          const supabaseBg = supabaseClient;

          if (!supabaseBg) {
            throw new Error('Supabase service key is required for clip reprocessing');
          }

          if (!originalVideoPath) {
            throw new Error('Original video path not found in job data');
          }

          // Reprocessar clip
          const result = await reprocessClip({
            jobId,
            clipId,
            originalVideoPath,
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

          // Atualizar banco de dados
          const { error: updateError } = await supabaseBg
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
  app.get('/jobs/:jobId/subtitle-settings', async (request, reply) => {
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
  // SERVE VIDEO FILES (From local storage or Supabase)
  // ============================================
  app.get('/clips/:jobId/:filename', async (request, reply) => {
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
          reply.header('Cache-Control', 'public, max-age=31536000');
          reply.header('Access-Control-Allow-Origin', '*');

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
      reply.header('Cache-Control', 'public, max-age=31536000');
      reply.header('Access-Control-Allow-Origin', '*');

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
  // SOCIAL MEDIA ROUTES
  // ============================================
  await registerSocialMediaRoutes(app);
}
