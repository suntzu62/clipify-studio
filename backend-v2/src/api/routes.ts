import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
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
import { addVideoJob, getJobStatus, cancelJob, getQueueHealth } from '../jobs/queue.js';
import { createLogger } from '../config/logger.js';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { redis, setTempConfig, getTempConfig, deleteTempConfig } from '../config/redis.js';
import { registerSocialMediaRoutes } from './social-media.js';

const logger = createLogger('routes');

export async function registerRoutes(app: FastifyInstance) {
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
          const proxyUrl = `http://localhost:3001/clips/${jobId}/${clip.id}.mp4`;

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
              const proxyUrl = `http://localhost:3001/clips/${jobId}/${clip.id}.mp4`;
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
  // CANCEL JOB
  // ============================================
  app.delete('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const cancelled = await cancelJob(jobId);

    if (!cancelled) {
      return reply.status(404).send({
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }

    return {
      jobId,
      status: 'cancelled',
      message: 'Job cancelled successfully',
    };
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
  // PROXY VIDEO FILES (Temporary workaround for private buckets)
  // ============================================
  app.get('/clips/:jobId/:filename', async (request, reply) => {
    const { jobId, filename } = request.params as { jobId: string; filename: string };

    try {
      const supabase = createClient(
        env.supabase.url,
        env.supabase.serviceKey
      );

      const filePath = `clips/${jobId}/${filename}`;

      logger.info({ filePath }, 'Proxying video file');

      const { data, error } = await supabase.storage
        .from('raw')
        .download(filePath);

      if (error || !data) {
        logger.error({ error, filePath }, 'File not found in storage');
        return reply.status(404).send({
          error: 'FILE_NOT_FOUND',
          message: `File not found: ${filePath}`,
        });
      }

      // Set proper headers for video streaming
      reply.header('Content-Type', 'video/mp4');
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Cache-Control', 'public, max-age=31536000');
      reply.header('Access-Control-Allow-Origin', '*');

      const buffer = Buffer.from(await data.arrayBuffer());
      logger.info({ filePath, size: buffer.length }, 'Video file sent successfully');

      return reply.send(buffer);
    } catch (error: any) {
      logger.error({ error: error.message, jobId, filename }, 'Failed to proxy video file');
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
