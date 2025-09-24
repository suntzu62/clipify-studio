import { Worker, Job } from 'bullmq';
import { connection } from '../redis';
import { QUEUES } from '../queues';
import { runIngest } from './ingest';
import { runTranscribe } from './transcribe';
import { runScenes } from './scenes';
import { runRank } from './rank';
import { runRender } from './render';
import { runTexts } from './texts';
import { runExport } from './export';
import pino from 'pino';
import { track } from '../lib/analytics';
import { emitWorkerEvent } from '../lib/worker-events';

const log = pino({ name: 'worker' });

const CONCURRENCY_ENV_KEY: Record<string, string> = {
  [QUEUES.INGEST]: 'INGEST',
  [QUEUES.TRANSCRIBE]: 'TRANSCRIBE',
  [QUEUES.SCENES]: 'SCENES',
  [QUEUES.RANK]: 'RANK',
  [QUEUES.RENDER]: 'RENDER',
  [QUEUES.TEXTS]: 'TEXTS',
  [QUEUES.EXPORT]: 'EXPORT',
};

function getConcurrency(queueName: string): number {
  const short = CONCURRENCY_ENV_KEY[queueName];
  const specific = short ? process.env[`${short}_CONCURRENCY`] : undefined;
  return Number(specific ?? process.env.WORKERS_CONCURRENCY ?? 2);
}

function getLimiter(queueName: string): { max: number; duration: number } | undefined {
  // Apply rate limits for external APIs
  if (queueName === QUEUES.TRANSCRIBE || queueName === QUEUES.RANK || queueName === QUEUES.TEXTS) {
    const max = Number(process.env.OPENAI_RATE_MAX ?? 10);
    const duration = Number(process.env.OPENAI_RATE_MS ?? 1000);
    return { max, duration };
  }
  if (queueName === QUEUES.EXPORT) {
    const max = Number(process.env.YOUTUBE_RATE_MAX ?? 10);
    const duration = Number(process.env.YOUTUBE_RATE_MS ?? 1000);
    return { max, duration };
  }
  return undefined;
}

export const makeWorker = (queueName: string) => {
  const concurrency = getConcurrency(queueName);
  const limiter = getLimiter(queueName);
  
  log.info({ 
    queue: queueName, 
    concurrency,
    limiter: limiter ? `${limiter.max}/${limiter.duration}ms` : 'none',
    redisConnected: !!connection
  }, `Starting worker for queue: ${queueName}`);
  
  return new Worker(
    queueName,
    async (job: Job) => {
      // Route to specific worker implementations
      if (queueName === QUEUES.INGEST) {
        return await runIngest(job);
      }
      if (queueName === QUEUES.TRANSCRIBE) {
        return await runTranscribe(job);
      }
      if (queueName === QUEUES.SCENES) {
        return await runScenes(job);
      }
      if (queueName === QUEUES.RANK) {
        return await runRank(job);
      }
      if (queueName === QUEUES.RENDER) {
        return await runRender(job);
      }
      if (queueName === QUEUES.TEXTS) {
        return await runTexts(job);
      }
      if (queueName === QUEUES.EXPORT) {
        return await runExport(job);
      }
      
      // Fallback: simulate processing for other queues
      for (let p = 0; p <= 100; p += 20) {
        await job.updateProgress(p);
        await new Promise((r) => setTimeout(r, 200));
      }
      return { ok: true, queue: queueName, id: job.id };
    },
    { connection, concurrency, limiter }
  )
    .on('progress', (job, progress) => {
      const rootId = (job.data as any)?.rootId;
      log.info({ queue: queueName, jobId: job.id, rootId, stage: queueName, attempt: job.attemptsMade, progress }, 'progress');
      emitWorkerEvent('progress', {
        queue: queueName,
        jobId: job.id || '',
        rootId,
        progress,
      });
    })
    .on('completed', (job, ret) => {
      const rootId = (job.data as any)?.rootId;
      log.info({ queue: queueName, jobId: job.id, rootId, stage: queueName, attempt: job.attemptsMade, ret }, 'completed');
      // Analytics (optional)
      track((job.data as any)?.meta?.userId || 'system', 'job.completed', {
        queue: queueName,
        jobId: job.id,
        rootId,
        attempt: job.attemptsMade,
      });
      emitWorkerEvent('completed', {
        queue: queueName,
        jobId: job.id || '',
        rootId,
        returnvalue: ret,
      });
    })
    .on('failed', (job, err) => {
      const rootId = (job?.data as any)?.rootId;
      log.error({ queue: queueName, jobId: job?.id, rootId, stage: queueName, attempt: job?.attemptsMade, err: err?.message || String(err) }, 'failed');
      // Analytics (optional)
      track((job?.data as any)?.meta?.userId || 'system', 'job.failed', {
        queue: queueName,
        jobId: job?.id,
        rootId,
        attempt: job?.attemptsMade,
        error: err?.message || String(err),
      });
      emitWorkerEvent('failed', {
        queue: queueName,
        jobId: job?.id || '',
        rootId,
        failedReason: err?.message || String(err),
      });
    });

export default makeWorker;
