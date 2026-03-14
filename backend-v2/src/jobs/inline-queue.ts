import { createLogger } from '../config/logger.js';
import { jobs as dbJobs } from '../services/database.service.js';
import type { JobData } from '../types/index.js';
import { processVideo } from './processor.js';

const logger = createLogger('inline-queue');

const pendingJobs: JobData[] = [];
let activeJobId: string | null = null;

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

export async function enqueueInlineVideoJob(jobData: JobData): Promise<string> {
  await ensureQueuedRecord(jobData);
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

  const recoverableJobs = await dbJobs.findRecoverable(staleAfterSeconds, 5);
  let recovered = 0;

  for (const jobRow of recoverableJobs) {
    if (!jobRow?.id || !jobRow?.user_id || !jobRow?.source_type) {
      continue;
    }

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
      current_step_message: 'Retomando processamento apos reinicio do servico...',
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

  return recovered;
}
