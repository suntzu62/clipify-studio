import { Queue } from 'bullmq';
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
