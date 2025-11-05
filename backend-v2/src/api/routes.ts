import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { CreateJobSchema, type JobData, SubtitlePreferencesSchema } from '../types/index.js';
import { addVideoJob, getJobStatus, cancelJob, getQueueHealth } from '../jobs/queue.js';
import { createLogger } from '../config/logger.js';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';

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

    return {
      jobId: status.id,
      state: status.state,
      progress: status.progress,
      result,
      error: status.failedReason,
      finishedAt: status.finishedOn ? new Date(status.finishedOn).toISOString() : null,
    };
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
}
