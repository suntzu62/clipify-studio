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
