import { Queue, QueueEvents } from 'bullmq';
import pino from 'pino';
import { connection } from '../redis';
import { QUEUES } from '../queues';

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const queues = new Map<QueueName, Queue>();
const queueEvents = new Map<QueueName, QueueEvents>();
const queueEventsReady = new Map<QueueName, Promise<unknown>>();

const log = pino({ name: 'bullmq-clients' });

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

export async function getQueueEvents(name: QueueName): Promise<QueueEvents> {
  let events = queueEvents.get(name);
  if (!events) {
    events = new QueueEvents(name, { connection });
    queueEvents.set(name, events);
    queueEventsReady.set(name, events.waitUntilReady());
    events.on('error', (err) => {
      log.error({ queue: name, err }, 'QueueEvents error');
    });
  }

  const ready = queueEventsReady.get(name);
  if (ready) {
    await ready;
  }
  return events;
}
