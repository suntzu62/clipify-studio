import { Worker, Job } from 'bullmq';
import { connection } from '../redis';
import pino from 'pino';

const log = pino({ name: 'worker' });

export const makeWorker = (queueName: string) =>
  new Worker(
    queueName,
    async (job: Job) => {
      // Simula processamento e reporta progress 0→100
      for (let p = 0; p <= 100; p += 20) {
        await job.updateProgress(p);
        await new Promise((r) => setTimeout(r, 200));
      }
      return { ok: true, queue: queueName, id: job.id };
    },
    { connection, concurrency: Number(process.env.WORKERS_CONCURRENCY ?? 2) }
  )
    .on('progress', (job, progress) =>
      log.info({ queueName, id: job.id, progress }, 'progress')
    )
    .on('completed', (job, ret) =>
      log.info({ queueName, id: job.id, ret }, 'completed')
    )
    .on('failed', (job, err) =>
      log.error({ queueName, id: job?.id, err }, 'failed')
    );

export default makeWorker;

