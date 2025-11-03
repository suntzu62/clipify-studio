import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { CreateJobSchema, type JobData } from '../types/index.js';
import { addVideoJob, getJobStatus, cancelJob, getQueueHealth } from '../jobs/queue.js';
import { createLogger } from '../config/logger.js';

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

    return {
      jobId: status.id,
      state: status.state,
      progress: status.progress,
      result: status.returnvalue,
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
}
