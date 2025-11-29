import type { FastifyInstance } from 'fastify';
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
} from '../types/index.js';
import { addVideoJob, getJobStatus, cancelJob, getQueueHealth, videoQueue } from '../jobs/queue.js';
import { createLogger } from '../config/logger.js';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { redis, setTempConfig, getTempConfig, deleteTempConfig } from '../config/redis.js';
import { registerSocialMediaRoutes } from './social-media.js';
import { registerAuthRoutes } from './auth.routes.js';
import { reprocessClip } from '../services/clip-reprocessor.js';
import * as db from '../services/database.service.js';

const logger = createLogger('routes');
const dbJobs = db.jobs;

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
    const jobId = `job_${randomUUID().replace(/-/g, '')}`;

    const jobData: JobData = {
      jobId,
      userId: input.userId,
      sourceType: 'upload',
      uploadPath: input.storagePath,
      targetDuration: input.targetDuration,
      clipCount: input.clipCount,
      createdAt: new Date(),
    };

    await addVideoJob(jobData);

    logger.info({ jobId, userId: input.userId, storagePath: input.storagePath }, 'Job created from upload');

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
      userId: input.userId,
      sourceType: input.sourceType,
      youtubeUrl: input.youtubeUrl,
      uploadPath: input.uploadPath,
      targetDuration: input.targetDuration,
      clipCount: input.clipCount,
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
  app.get('/jobs', async (request, reply) => {
    try {
      // Para desenvolvimento, usar um userId fixo ou extrair do JWT/session
      // TODO: Implementar autenticação JWT adequada
      const userId = (request as any).user?.id || 'dev-user';

      logger.info({ userId }, 'Fetching all jobs for user');

      const userJobs = await dbJobs.findByUserId(userId);

      logger.info({ userId, count: userJobs.length }, 'Found jobs for user');

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
  app.get('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const status = await getJobStatus(jobId);

    if (!status) {
      return reply.status(404).send({
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }

    // Transform result to match frontend expectations
    let result = status.returnvalue;
    if (result && result.clips && Array.isArray(result.clips)) {
      result = {
        ...result,
        clips: result.clips.map((clip: any) => {
          // Use proxy URL instead of direct Supabase URL (workaround for private buckets)
          const proxyUrl = `${env.baseUrl}/clips/${jobId}/${clip.id}.mp4`;

          return {
            id: clip.id,
            title: clip.title,
            description: clip.transcript || clip.reason || 'Descrição gerada automaticamente',
            hashtags: clip.keywords || [],
            previewUrl: proxyUrl,
            downloadUrl: clip.storagePath || proxyUrl,
            thumbnailUrl: clip.thumbnail,
            duration: clip.duration,
            status: 'ready',
            start: clip.start,
            end: clip.end,
            score: clip.score,
          };
        }),
      };
    }

    // Derive currentStep from job state and progress
    let currentStep = 'ingest';
    const progressValue = typeof status.progress === 'object' ? status.progress.progress : status.progress;

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

    return {
      jobId: status.id,
      state: status.state,
      status: status.state, // Add status field for frontend compatibility
      currentStep, // Add currentStep for timeline tracking
      progress: status.progress,
      result,
      error: status.failedReason,
      finishedAt: status.finishedOn ? new Date(status.finishedOn).toISOString() : null,
    };
  });

  // ============================================
  // SSE JOB STREAM (Real-time updates)
  // ============================================
  app.get('/api/jobs/:jobId/stream', async (request, reply) => {
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
    const initialProgressValue = typeof status.progress === 'object' ? status.progress.progress : status.progress;
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
        const progressData = typeof data === 'object' ? data : { progress: data };
        const progressValue = progressData.progress || 0;

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
        let result = returnvalue;
        if (result && result.clips && Array.isArray(result.clips)) {
          result = {
            ...result,
            clips: result.clips.map((clip: any) => {
              const proxyUrl = `${env.baseUrl}/clips/${jobId}/${clip.id}.mp4`;
              return {
                id: clip.id,
                title: clip.title,
                description: clip.transcript || clip.reason || 'Descrição gerada automaticamente',
                hashtags: clip.keywords || [],
                previewUrl: proxyUrl,
                downloadUrl: clip.storagePath || proxyUrl,
                thumbnailUrl: clip.thumbnail,
                duration: clip.duration,
                status: 'ready',
                start: clip.start,
                end: clip.end,
                score: clip.score,
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
  app.patch('/jobs/:jobId', async (request, reply) => {
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
  app.delete('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    try {
      // 1. Cancelar job na fila se ainda estiver ativo
      await cancelJob(jobId);

      // 2. Deletar do banco de dados
      const job = await dbJobs.findById(jobId);

      if (!job) {
        return reply.status(404).send({
          error: 'JOB_NOT_FOUND',
          message: `Job ${jobId} not found`,
        });
      }

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
  app.post('/jobs/temp', async (request, reply) => {
    const parsed = CreateTempConfigSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Invalid request body',
        details: parsed.error.format(),
      });
    }

    const { youtubeUrl, userId, sourceType } = parsed.data;

    // Generate unique tempId
    const tempId = `temp_${randomUUID().replace(/-/g, '')}`;

    // Create configuration with defaults
    const config: ProjectConfig = {
      tempId,
      youtubeUrl,
      userId,
      sourceType,
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
  app.get('/jobs/temp/:tempId', async (request, reply) => {
    const { tempId } = request.params as { tempId: string };

    const config = await getTempConfig(tempId);

    if (!config) {
      return reply.status(404).send({
        error: 'CONFIG_NOT_FOUND',
        message: 'Configuration not found or expired. Please create a new project.',
      });
    }

    return reply.send(config);
  });

  // POST /jobs/temp/:tempId/start - Start processing with configuration
  app.post('/jobs/temp/:tempId/start', async (request, reply) => {
    const { tempId } = request.params as { tempId: string };

    // 1. Get temporary configuration
    const tempConfig = await getTempConfig(tempId);

    if (!tempConfig) {
      return reply.status(404).send({
        error: 'CONFIG_NOT_FOUND',
        message: 'Configuration expired or not found',
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
      userId: tempConfig.userId,
      sourceType: tempConfig.sourceType,
      youtubeUrl: tempConfig.youtubeUrl,
      uploadPath: tempConfig.uploadPath,
      targetDuration: finalConfig.clipSettings.targetDuration,
      clipCount: finalConfig.clipSettings.clipCount,
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
      const result = job.returnvalue;

      if (!result || !result.clips) {
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
