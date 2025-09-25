import { JobsOptions, Queue } from 'bullmq';
import { connection } from '../redis';
import { QUEUES } from '../queues';

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const queues = new Map<QueueName, Queue>();

export const ALL_QUEUES = Object.values(QUEUES) as QueueName[];

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection });
    queues.set(name, queue);
  }
  return queue;
}

export function getQueueKey(name: QueueName): string {
  return getQueue(name).toKey('');
}

const defaultJobOpts: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400, count: 2000 },
  removeOnFail: { age: 604800 },
};

export async function enqueueUnique(
  queueName: QueueName,
  jobName: string,
  jobId: string,
  data: Record<string, any>,
  extraOpts: JobsOptions = {}
) {
  const queue = getQueue(queueName);
  const existing = await queue.getJob(jobId);
  if (existing) {
    return existing;
  }
  return queue.add(jobName, data, {
    ...defaultJobOpts,
    ...extraOpts,
    jobId,
  });
}
