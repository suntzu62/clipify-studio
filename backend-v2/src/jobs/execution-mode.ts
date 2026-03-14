import { env } from '../config/env.js';
import { getRedisQueueSafety } from '../config/redis.js';

export type JobExecutionDecision = {
  mode: 'queue' | 'inline';
  reason: string;
  policy?: string;
};

export async function getJobExecutionDecision(): Promise<JobExecutionDecision> {
  if (env.jobExecutionMode === 'inline') {
    return {
      mode: 'inline',
      reason: 'JOB_EXECUTION_MODE=inline',
    };
  }

  if (env.jobExecutionMode === 'queue') {
    return {
      mode: 'queue',
      reason: 'JOB_EXECUTION_MODE=queue',
    };
  }

  const queueSafety = await getRedisQueueSafety();
  if (!queueSafety.safe) {
    return {
      mode: 'inline',
      reason: queueSafety.reason,
      policy: queueSafety.policy,
    };
  }

  return {
    mode: 'queue',
    reason: queueSafety.reason,
    policy: queueSafety.policy,
  };
}
