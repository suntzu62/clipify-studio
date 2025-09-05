import 'dotenv/config';
import Fastify from 'fastify';
import fastifySSE from 'fastify-sse-v2';
import { FlowProducer, Queue, QueueEvents } from 'bullmq';
import pino from 'pino';
import { connection } from './redis';
import { QUEUES } from './queues';

const log = pino({ name: 'api' });

const API_KEY = process.env.WORKERS_API_KEY || '';
const PORT = Number(process.env.WORKERS_API_PORT || 8787);

const apiKeyGuard = async (req: any, res: any) => {
  const key = req.headers['x-api-key'];
  if (!API_KEY || key !== API_KEY) {
    res.code(401).send({ error: 'invalid_api_key' });
    return false;
  }
  return true;
};

export async function start() {
  const app = Fastify({ logger: false });
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
    const tree = await flow.add({
      name: 'pipeline',
      queueName: QUEUES.INGEST,
      data: { youtubeUrl, meta: body.meta || {} },
      children: [
        {
          name: 'transcribe',
          queueName: QUEUES.TRANSCRIBE,
          data: {},
          children: [
            {
              name: 'scenes',
              queueName: QUEUES.SCENES,
              data: {},
              children: [
                {
                  name: 'rank',
                  queueName: QUEUES.RANK,
                  data: {},
                  children: [
                    {
                      name: 'render',
                      queueName: QUEUES.RENDER,
                      data: {},
                      children: [
                        {
                          name: 'texts',
                          queueName: QUEUES.TEXTS,
                          data: {},
                          children: [
                            {
                              name: 'export',
                              queueName: QUEUES.EXPORT,
                              data: {},
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

  await app.listen({ port: PORT, host: '0.0.0.0' });
  log.info({ port: PORT }, 'Workers API listening');
  return app;
}

export default start;

