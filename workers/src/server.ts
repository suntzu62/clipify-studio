import 'dotenv/config';
import Fastify from 'fastify';
import fastifySSE from 'fastify-sse-v2';
import { FlowProducer, Queue, QueueEvents } from 'bullmq';
import { createHash } from 'crypto';
import pino from 'pino';
import { randomUUID as crypto } from 'crypto';
import { connection } from './redis';
import { QUEUES } from './queues';

const log = pino({ name: 'api' });

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
  
  // Rate limit per API key or IP
  await app.register((await import('@fastify/rate-limit')).default, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (req: any) => (req.headers['x-api-key'] as string) || req.ip,
  });
  app.register(fastifySSE);

  app.get('/health', async () => ({ ok: true }));

  // Create pipeline
  app.post('/api/jobs/pipeline', { preHandler: apiKeyGuard }, async (req: any, res: any) => {
    const body = (req.body || {}) as { youtubeUrl?: string; meta?: Record<string, any> };
    const youtubeUrl = body.youtubeUrl;
    if (!youtubeUrl) {
      res.code(400).send({ error: 'youtubeUrl required' });
      return;
    }

    const flow = new FlowProducer({ connection });
    // Idempotent root based on source URL (dedupe via BullMQ jobId)
    const digest = createHash('sha1').update(String(youtubeUrl)).digest('hex').slice(0, 16);
    const rootId = `ingest:${digest}`;
    
    const jobOpts = {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 86400, count: 2000 },
      removeOnFail: { age: 604800 },
    } as const;

    const tree = await flow.add({
      name: 'pipeline',
      queueName: QUEUES.INGEST,
      opts: { jobId: rootId, ...jobOpts },
      data: { youtubeUrl, meta: body.meta || {}, rootId },
      children: [
        {
          name: 'transcribe',
          queueName: QUEUES.TRANSCRIBE,
          data: { rootId },
          opts: { jobId: `${rootId}:transcribe`, ...jobOpts },
          children: [
            {
              name: 'scenes',
              queueName: QUEUES.SCENES,
              data: { rootId },
              opts: { jobId: `${rootId}:scenes`, ...jobOpts },
              children: [
                {
                  name: 'rank',
                  queueName: QUEUES.RANK,
                  data: { rootId },
                  opts: { jobId: `${rootId}:rank`, ...jobOpts },
                  children: [
                    {
                      name: 'render',
                      queueName: QUEUES.RENDER,
                      data: { rootId },
                      opts: { jobId: `${rootId}:render`, ...jobOpts },
                      children: [
                        {
                          name: 'texts',
                          queueName: QUEUES.TEXTS,
                          data: { rootId },
                          opts: { jobId: `${rootId}:texts`, ...jobOpts },
                          children: [
                            {
                              name: 'export',
                              queueName: QUEUES.EXPORT,
                              data: { rootId },
                              opts: { jobId: `${rootId}:export`, ...jobOpts },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    res.send({ jobId: tree.job.id });
  });

  // Enqueue a single export job (per clip)
  app.post('/api/jobs/export', { preHandler: apiKeyGuard }, async (req: any, res: any) => {
    const body = (req.body || {}) as { rootId?: string; clipId?: string; meta?: Record<string, any> };
    const { rootId, clipId } = body;
    if (!rootId || !clipId) {
      res.code(400).send({ error: 'rootId_and_clipId_required' });
      return;
    }
    const q = new Queue(QUEUES.EXPORT, { connection });
    const job = await q.add(
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

  // SSE stream of job events
  app.get('/api/jobs/:id/stream', { preHandler: apiKeyGuard }, async (req: any, res: any) => {
    const { id } = req.params as { id: string };
    res.raw.setHeader('Content-Type', 'text/event-stream');
    res.raw.setHeader('Cache-Control', 'no-cache');
    res.raw.setHeader('Connection', 'keep-alive');

    res.sse({ event: 'connected', data: JSON.stringify({ ok: true, id }) });

    const events: QueueEvents[] = [];
    const send = (event: string, payload: any) => res.sse({ event, data: JSON.stringify(payload) });

    for (const q of Object.values(QUEUES)) {
      const qe = new QueueEvents(q, { connection });
      await qe.waitUntilReady();

      qe.on('progress', ({ jobId, data }) => {
        if (jobId === id) send('progress', { queue: q, jobId, progress: data });
      });
      qe.on('completed', ({ jobId, returnvalue }) => {
        if (jobId === id) send('completed', { queue: q, jobId, returnvalue });
      });
      qe.on('failed', ({ jobId, failedReason }) => {
        if (jobId === id) send('failed', { queue: q, jobId, failedReason });
      });

      events.push(qe);
    }

    req.raw.on('close', async () => {
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
