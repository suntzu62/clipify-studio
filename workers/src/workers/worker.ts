import { Job, Worker } from 'bullmq';
import { enqueueUnique } from '../lib/bullmq';
import { bullmqConnection } from '../redis';
import { QUEUES } from '../queues';
import { runIngest } from '../workers/ingest';
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

interface RateLimitConfig {
  max: number;
  duration: number;
}

function getLimiter(queueName: string): RateLimitConfig | undefined {
  // Apply rate limits for external APIs
  if (queueName === QUEUES.TRANSCRIBE || queueName === QUEUES.RANK || queueName === QUEUES.TEXTS) {
    const max = Math.max(1, Number(process.env.OPENAI_RATE_MAX) || 10);
    const duration = Math.max(100, Number(process.env.OPENAI_RATE_MS) || 1000);
    return { max, duration };
  }
  if (queueName === QUEUES.EXPORT) {
    const max = Math.max(1, Number(process.env.YOUTUBE_RATE_MAX) || 10);
    const duration = Math.max(100, Number(process.env.YOUTUBE_RATE_MS) || 1000);
    return { max, duration };
  }
  return undefined;
}

type WorkerEventPayload = {
  jobId: string;
  queueName: string;
  rootId?: string;
  duration?: number;
  error?: string;
};

export const makeWorker = (queueName: string) => {
  const concurrency = getConcurrency(queueName);
  const limiter = getLimiter(queueName);
  
  log.info({ 
    queueName, 
    concurrency,
    hasLimiter: Boolean(limiter)
  }, 'Creating worker');
  
  return new Worker(
    queueName,
    async (job: Job) => {
      const startTime = Date.now();
      const jobId = job.id;
      const rootId = job.data?.rootId;
      const userId = job.data?.userId || 'unknown';

      try {
        log.info({ jobId, rootId, queueName, data: job.data }, 'ProcessingJob');

        // Validar dados de entrada
        if (!job.data) {
          throw new Error('INVALID_INPUT: Job data is required');
        }

        // Processar o job com o handler apropriado
        let result;
        switch (queueName) {
          case QUEUES.INGEST: 
            result = await runIngest(job);
            break;
          case QUEUES.TRANSCRIBE:
            result = await runTranscribe(job);
            break;
          case QUEUES.SCENES:
            result = await runScenes(job);
            break;
          case QUEUES.RANK:
            result = await runRank(job);
            break;
          case QUEUES.RENDER:
            result = await runRender(job);
            break;
          case QUEUES.TEXTS:
            result = await runTexts(job);
            break;
          case QUEUES.EXPORT:
            result = await runExport(job);
            break;
          default:
            throw new Error(`Unknown queue: ${queueName}`);
        }

        const duration = Date.now() - startTime;
        log.info({ jobId, rootId, queueName, duration, success: true }, 'JobCompleted');
        
        // Track success
        await track(userId, 'job_completed', {
          jobId,
          rootId,
          queue: queueName,
          duration,
          success: true
        });

        return result;

      } catch (error: any) {
        const duration = Date.now() - startTime;
        log.error({ 
          jobId,
          rootId,
          queueName,
          duration,
          error: {
            message: error?.message,
            code: error?.code,
            name: error?.name,
            stack: error?.stack?.split('\n').slice(0, 5).join('\n')
          }
        }, 'JobFailed');
        
        // Track failure
        await track(userId, 'job_failed', {
          jobId,
          rootId,
          queue: queueName,
          duration,
          error: error?.message,
          errorCode: error?.code
        });
        
        throw error;
      } finally {
        // Garantir cleanup de recursos
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    },
    {
      connection: bullmqConnection,
      concurrency,
      limiter: limiter ? {
        max: limiter.max,
        duration: limiter.duration
      } : undefined
    })
    .on('progress', (job, progress) => {
      const rootId = job.data?.rootId;
      log.debug({ 
        jobId: job.id, 
        rootId,
        queueName, 
        progress,
        attempt: job.attemptsMade 
      }, 'JobProgress');
      
      emitWorkerEvent('progress', { 
        jobId: job.id || '',
        queue: queueName,
        rootId,
        progress
      });
    })
    .on('completed', (job, result) => {
      const rootId = job.data?.rootId;
      const duration = Date.now() - (job.processedOn || Date.now());
      log.info({ 
        jobId: job.id, 
        rootId,
        queueName, 
        duration,
        attempt: job.attemptsMade,
        result: typeof result === 'object' ? Object.keys(result || {}) : result
      }, 'JobCompleted');
      
      emitWorkerEvent('completed', { 
        jobId: job.id || '',
        queue: queueName,
        rootId,
        returnvalue: { duration, result }
      });
    })
    .on('failed', (job, error) => {
      if (job) {
        const rootId = job.data?.rootId;
        const duration = Date.now() - (job.processedOn || Date.now());
        log.error({ 
          jobId: job.id,
          rootId,
          queueName,
          duration,
          attempt: job.attemptsMade,
          maxAttempts: job.opts.attempts,
          error: error?.message,
          willRetry: job.attemptsMade < (job.opts.attempts || 1)
        }, 'JobFailed');

        emitWorkerEvent('failed', { 
          jobId: job.id || '',
          queue: queueName,
          rootId,
          failedReason: error?.message
        });
      }
    })
    .on('error', (error) => {
      log.error({ 
        queueName,
        error: error?.message,
        stack: error?.stack?.split('\n').slice(0, 3).join('\n')
      }, 'WorkerError');
    })
    .on('stalled', (jobId) => {
      log.warn({ 
        queueName,
        jobId,
        message: 'Job stalled - will be retried'
      }, 'JobStalled');
    });
};

export default makeWorker;
