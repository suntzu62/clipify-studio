import 'dotenv/config';
import { QueueEvents } from 'bullmq';
import pino from 'pino';
import { connection } from './redis';
import makeWorker from './workers/worker';
import { QUEUES } from './queues';
import start from './server';

const log = pino({ name: 'bootstrap' });

// Start workers
Object.values(QUEUES).forEach((q) => makeWorker(q));

// Observabilidade central (QueueEvents)
Object.values(QUEUES).forEach((q) => {
  const qe = new QueueEvents(q, { connection });
  qe.on('waiting', ({ jobId }) => log.info({ q, jobId }, 'waiting'));
  qe.on('active', ({ jobId }) => log.info({ q, jobId }, 'active'));
  qe.on('progress', ({ jobId, data }) =>
    log.info({ q, jobId, progress: data }, 'progress')
  );
  qe.on('completed', ({ jobId }) => log.info({ q, jobId }, 'completed'));
  qe.on('failed', ({ jobId, failedReason }) =>
    log.error({ q, jobId, failedReason }, 'failed')
  );
});

// Start HTTP API
start();
