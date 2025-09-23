import { EventEmitter } from 'events';

export type WorkerEventName = 'progress' | 'completed' | 'failed';

export interface WorkerEventPayload {
  queue: string;
  jobId: string;
  rootId?: string;
  progress?: any;
  returnvalue?: any;
  failedReason?: string;
}

class WorkerEvents extends EventEmitter {}

export const workerEvents = new WorkerEvents();

export function emitWorkerEvent(event: WorkerEventName, payload: WorkerEventPayload) {
  workerEvents.emit(event, payload);
  if (payload.jobId) {
    workerEvents.emit(`${event}:${payload.jobId}`, payload);
  }
  if (payload.rootId) {
    workerEvents.emit(`${event}:root:${payload.rootId}`, payload);
  }
}
