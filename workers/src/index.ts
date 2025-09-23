import 'dotenv/config';
import pino from 'pino';
import makeWorker from './workers/worker';
import { ALL_QUEUES, getQueueEvents } from './lib/bullmq';
import start from './server';

const log = pino({ name: 'bootstrap' });

// Start workers
ALL_QUEUES.forEach((q) => makeWorker(q));

// Observabilidade central (QueueEvents)
async function wireQueueEvents() {
  for (const q of ALL_QUEUES) {
    const qe = await getQueueEvents(q);
    qe.on('waiting', ({ jobId }) => log.info({ q, jobId }, 'waiting'));
    qe.on('active', ({ jobId }) => log.info({ q, jobId }, 'active'));
    qe.on('progress', ({ jobId, data }) =>
      log.info({ q, jobId, progress: data }, 'progress')
    );
    qe.on('completed', ({ jobId }) => log.info({ q, jobId }, 'completed'));
    qe.on('failed', ({ jobId, failedReason }) =>
      log.error({ q, jobId, failedReason }, 'failed')
    );
  }
}

wireQueueEvents().catch((err) => {
  log.error({ err }, 'Failed to wire QueueEvents listeners');
});

// Start HTTP API
start();
