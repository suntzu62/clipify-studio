import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { processVideo } from './processor.js';
import type { JobData, JobResult } from '../types/index.js';

const logger = createLogger('worker');

// Conexão Redis
const connection = new IORedis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db,
  maxRetriesPerRequest: null,
});

// Worker unificado
export const worker = new Worker<JobData, JobResult>(
  'video-processing',
  async (job) => {
    logger.info({ jobId: job.id, attempt: job.attemptsMade + 1 }, 'Processing job');
    return await processVideo(job);
  },
  {
    connection,
    concurrency: 2, // Processar 2 vídeos simultaneamente
    limiter: {
      max: 10, // Máximo 10 jobs
      duration: 60000, // Por minuto
    },
  }
);

// Event listeners
worker.on('completed', (job, result) => {
  logger.info(
    {
      jobId: job.id,
      userId: job.data.userId,
      processingTime: result.processingTime,
      clipCount: result.clips?.length || 0,
    },
    'Job completed successfully'
  );
});

worker.on('failed', (job, error) => {
  logger.error(
    {
      jobId: job?.id,
      userId: job?.data?.userId,
      error: error.message,
      attempt: job?.attemptsMade,
    },
    'Job failed'
  );
});

worker.on('error', (error) => {
  logger.error({ error: error.message }, 'Worker error');
});

logger.info({ concurrency: 2 }, 'Worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker...');
  await worker.close();
  process.exit(0);
});
