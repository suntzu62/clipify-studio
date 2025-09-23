import 'dotenv/config';
import Fastify from 'fastify';
import fastifySSE from 'fastify-sse-v2';
import rateLimit from '@fastify/rate-limit';
import { Queue, QueueEvents, type JobsOptions } from 'bullmq';
import { createHash } from 'crypto';
import pino from 'pino';
import { randomUUID as crypto } from 'crypto';
import { connection } from './redis';
import { QUEUES } from './queues';

const log = pino({ name: 'api' });

type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const queueMap = Object.fromEntries(
  Object.values(QUEUES).map((name) => [name, new Queue(name, { connection })])
) as Record<QueueName, Queue>;

function queueKey(name: QueueName) {
  return queueMap[name].toKey('');
}

async function ensureJob(
  queueName: QueueName,
  jobName: string,
  jobId: string,
  data: Record<string, any>,
  extraOpts: JobsOptions = {}
) {
  const queue = queueMap[queueName];
  const existing = await queue.getJob(jobId);
  if (existing) {
    return existing;
  }

  const jobOpts = {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400, count: 2000 },
    removeOnFail: { age: 604800 },
  };

  return queue.add(jobName, data, { ...jobOpts, ...extraOpts, jobId });
}

const API_KEY = process.env.WORKERS_API_KEY || '';
// Railway injects PORT - prioritize it over custom ports
const PORT = Number(process.env.PORT || 8787);

const apiKeyGuard = async (req: any, res: any) => {
  const key = req.headers['x-api-key'];
  if (!API_KEY || key !== API_KEY) {
    res.code(401).send({ error: 'invalid_api_key' });
    return false;
  }
  return true;
};

export async function start() {
  // Add error handlers for unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    log.error({ reason, promise }, 'Unhandled rejection');
  });
  
  process.on('uncaughtException', (error) => {
    log.error({ error }, 'Uncaught exception');
    process.exit(1);
  });

  const app = Fastify({ logger: false });
  
  // Add root route
  app.get('/', async () => 'OK');
  
  // Rate limit per API key or IP - increased for pipeline workload
  await app.register(rateLimit, {
    max: 300, // Increased from 120 to handle multiple users creating clips
    timeWindow: '1 minute',
    keyGenerator: (req: any) => (req.headers['x-api-key'] as string) || req.ip,
    skipOnError: true, // Don't rate limit on errors
    global: true,
  });
  app.register(fastifySSE);

  app.get('/health', async () => ({ ok: true }));

  // Create pipeline
  app.post('/api/jobs/pipeline', {
    preHandler: apiKeyGuard,
    config: {
      rateLimit: {
        max: 200,
        timeWindow: '1 minute',
      },
    },
  }, async (req: any, res: any) => {
    const body = (req.body || {}) as {
      youtubeUrl?: string;
      neededMinutes?: number;
      targetDuration?: number;
      meta?: Record<string, any>;
    };
    const youtubeUrl = body.youtubeUrl;
    if (!youtubeUrl) {
      res.code(400).send({ error: 'youtubeUrl required' });
      return;
    }

    // Idempotent root based on source URL (dedupe via BullMQ jobId)
    const digest = createHash('sha1').update(String(youtubeUrl)).digest('hex').slice(0, 16);
    const rootId = `ingest:${digest}`;

    const neededMinutes = Number(body.neededMinutes || 0);
    const targetDuration = body.targetDuration;

    const meta = {
      ...(body.meta || {}),
      targetDuration,
      neededMinutes,
    };

    const baseData = { rootId, meta, youtubeUrl };

    const ingestJob = await ensureJob(
      QUEUES.INGEST,
      'pipeline',
      rootId,
      baseData
    );

    const transcribeJob = await ensureJob(
      QUEUES.TRANSCRIBE,
      'transcribe',
      `${rootId}:transcribe`,
      { rootId, meta },
      { parent: { id: ingestJob.id!, queue: queueKey(QUEUES.INGEST) } }
    );

    const scenesJob = await ensureJob(
      QUEUES.SCENES,
      'scenes',
      `${rootId}:scenes`,
      { rootId, meta },
      { parent: { id: transcribeJob.id!, queue: queueKey(QUEUES.TRANSCRIBE) } }
    );

    const rankJob = await ensureJob(
      QUEUES.RANK,
      'rank',
      `${rootId}:rank`,
      { rootId, meta },
      { parent: { id: scenesJob.id!, queue: queueKey(QUEUES.SCENES) } }
    );

    const renderJob = await ensureJob(
      QUEUES.RENDER,
      'render',
      `${rootId}:render`,
      { rootId, meta },
      { parent: { id: rankJob.id!, queue: queueKey(QUEUES.RANK) } }
    );

    const textsJob = await ensureJob(
      QUEUES.TEXTS,
      'texts',
      `${rootId}:texts`,
      { rootId, meta },
      { parent: { id: renderJob.id!, queue: queueKey(QUEUES.RENDER) } }
    );

    await ensureJob(
      QUEUES.EXPORT,
      'export',
      `${rootId}:export`,
      { rootId, meta },
      { parent: { id: textsJob.id!, queue: queueKey(QUEUES.TEXTS) } }
    );

    res.send({ jobId: ingestJob.id });
  });

  // Enqueue a single export job (per clip)
  app.post('/api/jobs/export', { preHandler: apiKeyGuard }, async (req: any, res: any) => {
    const body = (req.body || {}) as { rootId?: string; clipId?: string; meta?: Record<string, any> };
    const { rootId, clipId } = body;
    if (!rootId || !clipId) {
      res.code(400).send({ error: 'rootId_and_clipId_required' });
      return;
    }
    const exportQueue = queueMap[QUEUES.EXPORT];
    const job = await exportQueue.add(
      'export',
      { rootId, clipId, meta: body.meta || {} },
      {
        jobId: `export:${rootId}:${clipId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 2000 },
        removeOnFail: { age: 604800 },
      }
    );
    res.send({ jobId: job.id });
  });

  // Status of a job (root in INGEST)
  app.get('/api/jobs/:id/status', { preHandler: apiKeyGuard }, async (req: any, res: any) => {
    const { id } = req.params as { id: string };
    const queue = new Queue(QUEUES.INGEST, { connection });
    const job = await queue.getJob(id);
    if (!job) {
      res.code(404).send({ error: 'not_found' });
      return;
    }
    const state = await job.getState();
    const progress = (typeof job.progress === 'number' ? job.progress : job.progress || 0) as number;
    res.send({ id: job.id, state, progress });
  });

  // SSE stream of job events - with heartbeat
  app.get('/api/jobs/:id/stream', { preHandler: apiKeyGuard }, async (req: any, res: any) => {
    const { id } = req.params as { id: string };
    res.raw.setHeader('Content-Type', 'text/event-stream');
    res.raw.setHeader('Cache-Control', 'no-cache');
    res.raw.setHeader('Connection', 'keep-alive');

    res.sse({ event: 'connected', data: JSON.stringify({ ok: true, id }) });

    // Send heartbeat every 15 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.sse({ event: 'ping', data: JSON.stringify({ timestamp: Date.now() }) });
      } catch (err) {
        clearInterval(heartbeat);
      }
    }, 15000);

    const events: QueueEvents[] = [];
    const send = (event: string, payload: any) => res.sse({ event, data: JSON.stringify(payload) });

    for (const q of Object.values(QUEUES)) {
      const qe = new QueueEvents(q, { connection });
      await qe.waitUntilReady();

      qe.on('progress', ({ jobId, data }) => {
        if (jobId === id || jobId.startsWith(id + ':')) {
          send('progress', { queue: q, jobId, progress: data });
        }
      });
      qe.on('completed', ({ jobId, returnvalue }) => {
        if (jobId === id || jobId.startsWith(id + ':')) {
          send('completed', { queue: q, jobId, returnvalue });
        }
      });
      qe.on('failed', ({ jobId, failedReason }) => {
        if (jobId === id || jobId.startsWith(id + ':')) {
          send('failed', { queue: q, jobId, failedReason });
        }
      });

      events.push(qe);
    }

    req.raw.on('close', async () => {
      clearInterval(heartbeat);
      for (const e of events) await e.close();
    });
  });

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    log.info({ 
      port: PORT, 
      apiKey: API_KEY ? 'configured' : 'missing',
      redis: process.env.REDIS_URL ? 'configured' : 'missing'
    }, 'Workers API listening successfully');
  } catch (error) {
    log.error({ error, port: PORT }, 'Failed to start server');
    throw error;
  }
  return app;
}

export default start;
