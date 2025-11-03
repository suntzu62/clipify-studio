import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import type { JobData, JobResult } from '../types/index.js';

const logger = createLogger('queue');

// Conexão Redis
const connection = new IORedis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db,
  maxRetriesPerRequest: null,
});

// Fila unificada
export const videoQueue = new Queue<JobData>('video-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 100, // Manter últimos 100 completos
      age: 24 * 3600, // Remover após 24h
    },
    removeOnFail: {
      count: 200, // Manter últimos 200 falhos para debug
    },
  },
});

// Adicionar job à fila
export async function addVideoJob(data: JobData): Promise<string> {
  logger.info({ jobId: data.jobId, userId: data.userId }, 'Adding job to queue');

  const job = await videoQueue.add('process-video', data, {
    jobId: data.jobId,
  });

  logger.info({ jobId: job.id }, 'Job added successfully');
  return job.id!;
}

// Obter status do job
export async function getJobStatus(jobId: string) {
  const job = await videoQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;

  return {
    id: job.id,
    state,
    progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
  };
}

// Cancelar job
export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await videoQueue.getJob(jobId);

  if (!job) {
    return false;
  }

  await job.remove();
  logger.info({ jobId }, 'Job cancelled');
  return true;
}

// Limpar jobs antigos
export async function cleanOldJobs() {
  await videoQueue.clean(24 * 3600 * 1000, 100, 'completed');
  await videoQueue.clean(7 * 24 * 3600 * 1000, 100, 'failed');
  logger.info('Old jobs cleaned');
}

// Health check
export async function getQueueHealth() {
  const [waiting, active, completed, failed] = await Promise.all([
    videoQueue.getWaitingCount(),
    videoQueue.getActiveCount(),
    videoQueue.getCompletedCount(),
    videoQueue.getFailedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active + completed + failed,
  };
}
