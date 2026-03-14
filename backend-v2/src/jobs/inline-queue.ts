import { createLogger } from '../config/logger.js';
import { jobs as dbJobs } from '../services/database.service.js';
import type { JobData } from '../types/index.js';
import { processVideo } from './processor.js';

const logger = createLogger('inline-queue');

const pendingJobs: JobData[] = [];
let activeJobId: string | null = null;
const ACTIVE_RESTART_MESSAGE = 'Processamento retomado apos reinicio do servico.';
const SUPERSEDED_MESSAGE = 'Substituido por um job mais recente do mesmo usuario.';

function createInlineJob(jobData: JobData) {
  return {
    id: jobData.jobId,
    data: jobData,
    attemptsMade: 0,
    async updateProgress() {
      return;
    },
  } as any;
}

async function ensureQueuedRecord(jobData: JobData): Promise<void> {
  await dbJobs.insert({
    id: jobData.jobId,
    user_id: jobData.userId,
    source_type: jobData.sourceType,
    youtube_url: jobData.youtubeUrl,
    upload_path: jobData.uploadPath,
    target_duration: jobData.targetDuration,
    clip_count: jobData.clipCount,
    status: 'queued',
  });

  await dbJobs.update(jobData.jobId, {
    progress: 0,
    current_step: 'ingest',
    current_step_message: 'Aguardando processamento...',
  });
}

async function drainInlineQueue(): Promise<void> {
  if (activeJobId || pendingJobs.length === 0) {
    return;
  }

  const nextJob = pendingJobs.shift();
  if (!nextJob) {
    return;
  }

  activeJobId = nextJob.jobId;

  setImmediate(async () => {
    logger.info({ jobId: nextJob.jobId, waiting: pendingJobs.length }, 'Starting inline job processing');

    try {
      await processVideo(createInlineJob(nextJob));
    } catch (error: any) {
      logger.error({ jobId: nextJob.jobId, error: error.message }, 'Inline job processing failed');
    } finally {
      activeJobId = null;
      void drainInlineQueue();
    }
  });
}

async function failJobAsSuperseded(jobId: string, reason: string): Promise<void> {
  await dbJobs.update(jobId, {
    status: 'failed',
    error: reason,
    progress: 0,
    current_step: 'failed',
    current_step_message: reason,
  });
}

export async function removeInlinePendingJob(jobId: string): Promise<boolean> {
  const index = pendingJobs.findIndex((job) => job.jobId === jobId);
  if (index === -1) {
    return false;
  }

  pendingJobs.splice(index, 1);
  logger.warn({ jobId, waiting: pendingJobs.length }, 'Removed job from inline pending queue');
  return true;
}

async function removeOlderPendingJobsForUser(userId: string, keepJobId: string): Promise<number> {
  const jobsToRemove = pendingJobs.filter((job) => job.userId === userId && job.jobId !== keepJobId);

  if (jobsToRemove.length === 0) {
    return 0;
  }

  for (const job of jobsToRemove) {
    await removeInlinePendingJob(job.jobId);
    await failJobAsSuperseded(job.jobId, SUPERSEDED_MESSAGE);
  }

  logger.warn({ userId, keepJobId, removed: jobsToRemove.length }, 'Removed older pending inline jobs for user');
  return jobsToRemove.length;
}

export async function enqueueInlineVideoJob(jobData: JobData): Promise<string> {
  await ensureQueuedRecord(jobData);
  await removeOlderPendingJobsForUser(jobData.userId, jobData.jobId);
  pendingJobs.push(jobData);

  logger.warn(
    {
      jobId: jobData.jobId,
      waiting: pendingJobs.length - (activeJobId ? 0 : 1),
      activeJobId,
    },
    'Job queued for inline processing'
  );

  void drainInlineQueue();
  return jobData.jobId;
}

export function getInlineQueueSnapshot() {
  return {
    activeJobId,
    waiting: pendingJobs.length,
  };
}

export async function recoverStaleInlineJobs(staleAfterSeconds: number = 180): Promise<number> {
  if (activeJobId || pendingJobs.length > 0) {
    return 0;
  }

  const recoverableJobs = await dbJobs.findRecoverable(staleAfterSeconds, 20);
  let recovered = 0;
  let discarded = 0;
  const selectedJobIds = new Set<string>();

  const sortedRecoverableJobs = [...recoverableJobs].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });

  for (const jobRow of sortedRecoverableJobs) {
    if (!jobRow?.id || !jobRow?.user_id) {
      continue;
    }

    if (selectedJobIds.has(jobRow.user_id)) {
      await failJobAsSuperseded(jobRow.id, SUPERSEDED_MESSAGE);
      discarded += 1;
      continue;
    }

    selectedJobIds.add(jobRow.user_id);
  }

  for (const jobRow of sortedRecoverableJobs) {
    if (!jobRow?.id || !jobRow?.user_id || !jobRow?.source_type) {
      continue;
    }

    if (!selectedJobIds.has(jobRow.user_id)) {
      continue;
    }

    // Only recover the newest pending job per user.
    selectedJobIds.delete(jobRow.user_id);

    const jobData: JobData = {
      jobId: jobRow.id,
      userId: jobRow.user_id,
      sourceType: jobRow.source_type,
      youtubeUrl: jobRow.youtube_url || undefined,
      uploadPath: jobRow.upload_path || undefined,
      targetDuration: jobRow.target_duration || undefined,
      clipCount: jobRow.clip_count || undefined,
      createdAt: jobRow.created_at ? new Date(jobRow.created_at) : new Date(),
    };

    pendingJobs.push(jobData);
    recovered += 1;

    await dbJobs.update(jobRow.id, {
      status: 'queued',
      progress: 0,
      current_step: 'ingest',
      current_step_message: ACTIVE_RESTART_MESSAGE,
    });

    logger.warn(
      {
        jobId: jobRow.id,
        previousStatus: jobRow.status,
        updatedAt: jobRow.updated_at,
      },
      'Recovered stale inline job after service restart'
    );
  }

  if (recovered > 0) {
    void drainInlineQueue();
  }

  logger.warn({ recovered, discarded }, 'Recovered inline jobs after restart');
  return recovered;
}
