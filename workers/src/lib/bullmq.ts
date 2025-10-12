import { JobsOptions, Queue } from 'bullmq';
import { bullmqConnection } from '../redis';
import { QUEUES } from '../queues';

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const queues = new Map<QueueName, Queue>();

export const ALL_QUEUES = Object.values(QUEUES) as QueueName[];

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    // Share the same connection config for all queues to minimize connections
    queue = new Queue(name, { 
      connection: bullmqConnection,
      defaultJobOptions: {
        removeOnComplete: 10, // Keep fewer completed jobs
        removeOnFail: 5, // Keep fewer failed jobs  
        attempts: 3, // Reduce retry attempts
        backoff: { type: 'exponential', delay: 2000 }
      }
    });
    queues.set(name, queue);
  }
  return queue;
}

export function getQueueKey(name: QueueName): string {
  return getQueue(name).toKey('');
}

const defaultJobOpts: JobsOptions = {
  attempts: 3, // Reduced from 5
  backoff: { type: 'exponential', delay: 2000 }, // Reduced from 5000
  removeOnComplete: { age: 3600, count: 10 }, // Reduced retention
  removeOnFail: { age: 7200, count: 5 }, // Reduced retention
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
