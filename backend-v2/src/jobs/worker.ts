import { Sentry } from '../config/sentry.js';
import { Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { processVideo } from './processor.js';
import type { JobData, JobResult } from '../types/index.js';
import { runMigrations } from '../scripts/migrate.js';
import { createPublishWorker } from './publish-queue.js';
import { startLiveIngestLoop } from './live-ingest-loop.js';

const logger = createLogger('worker');
type VideoJobName = 'process-video';

// Ensure DB schema is up-to-date before processing jobs (safe via advisory lock).
await runMigrations();

// Conexão Redis
const connection: ConnectionOptions = {
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db,
  ...(env.redis.tls ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
};

// Worker unificado
export const worker = new Worker<JobData, JobResult, VideoJobName>(
  'video-processing',
  async (job) => {
    logger.info({ jobId: job.id, attempt: job.attemptsMade + 1 }, 'Processing job');
    return await processVideo(job);
  },
  {
    connection,
    concurrency: env.workerConcurrency, // Controlar via env para escalar em produção
    limiter: {
      max: 10, // Máximo 10 jobs
      duration: 60000, // Por minuto
    },
    lockDuration: 30 * 60 * 1000, // 30 min para jobs longos (transcrição com retries)
    stalledInterval: 5 * 60 * 1000, // checar travados a cada 5 min
    maxStalledCount: 3,
  }
);

export const publishWorker = env.schedulerEnabled
  ? createPublishWorker(Math.max(1, Math.min(5, env.workerConcurrency)))
  : null;
const liveIngestLoop = startLiveIngestLoop();

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
  Sentry.captureException(error, {
    extra: { jobId: job?.id, userId: job?.data?.userId, attempt: job?.attemptsMade },
    tags: { component: 'worker' },
  });
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

if (publishWorker) {
  publishWorker.on('completed', (job, result) => {
    logger.info(
      {
        publicationId: job.data.publicationId,
        userId: job.data.userId,
        platform: job.data.platform,
        result,
      },
      'Scheduled publication completed'
    );
  });

  publishWorker.on('failed', (job, error) => {
    logger.error(
      {
        publicationId: job?.data?.publicationId,
        userId: job?.data?.userId,
        platform: job?.data?.platform,
        error: error?.message,
        attempt: job?.attemptsMade,
      },
      'Scheduled publication failed'
    );
  });

  publishWorker.on('error', (error) => {
    logger.error({ error: error.message }, 'Publish worker error');
  });
}

logger.info({ concurrency: env.workerConcurrency }, 'Worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker...');
  await worker.close();
  if (publishWorker) {
    await publishWorker.close();
  }
  liveIngestLoop.stop();
  process.exit(0);
});
