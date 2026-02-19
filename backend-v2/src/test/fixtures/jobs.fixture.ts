import { randomUUID as uuidv4 } from 'crypto';

export interface JobFixture {
  id: string;
  user_id: string;
  source_type: 'youtube' | 'upload';
  youtube_url?: string;
  upload_path?: string;
  video_path?: string;
  title?: string;
  metadata?: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  progress: number;
  current_step?: string;
  current_step_message?: string;
  target_duration?: number;
  clip_count?: number;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ClipFixture {
  id: string;
  job_id: string;
  user_id: string;
  title: string;
  description?: string;
  hashtags: string[];
  seo_title?: string;
  seo_description?: string;
  seo_hashtags: string[];
  seo_variants?: any[];
  seo_selected_index: number;
  start_time: number;
  end_time: number;
  duration: number;
  video_url: string;
  thumbnail_url?: string;
  storage_path: string;
  thumbnail_storage_path?: string;
  transcript: any;
  ai_score?: number;
  virality_components?: any;
  virality_label?: string;
  status: 'ready' | 'pending_review' | 'approved' | 'rejected';
  user_rating?: number;
  rejection_reason?: string;
  reviewed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ClipFeedbackFixture {
  id: string;
  clip_id: string;
  user_id: string;
  rating?: number;
  feedback_type: 'approve' | 'reject' | 'edit';
  comment?: string;
  created_at: Date;
}

export function createJobFixture(overrides?: Partial<JobFixture>): JobFixture {
  const id = overrides?.id ?? uuidv4();
  const now = new Date();

  return {
    id,
    user_id: overrides?.user_id ?? 'user-test-1234',
    source_type: overrides?.source_type ?? 'youtube',
    youtube_url: overrides?.youtube_url ?? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    upload_path: overrides?.upload_path,
    video_path: overrides?.video_path,
    title: overrides?.title,
    metadata: overrides?.metadata,
    status: overrides?.status ?? 'pending',
    error: overrides?.error,
    progress: overrides?.progress ?? 0,
    current_step: overrides?.current_step,
    current_step_message: overrides?.current_step_message,
    target_duration: overrides?.target_duration ?? 60,
    clip_count: overrides?.clip_count ?? 3,
    completed_at: overrides?.completed_at,
    created_at: overrides?.created_at ?? now,
    updated_at: overrides?.updated_at ?? now,
  };
}

export function createClipFixture(overrides?: Partial<ClipFixture>): ClipFixture {
  const id = overrides?.id ?? uuidv4();
  const now = new Date();

  return {
    id,
    job_id: overrides?.job_id ?? 'job-test-1234',
    user_id: overrides?.user_id ?? 'user-test-1234',
    title: overrides?.title ?? 'Test Clip Title',
    description: overrides?.description ?? 'This is a test clip description',
    hashtags: overrides?.hashtags ?? ['test', 'clip', 'video'],
    seo_title: overrides?.seo_title,
    seo_description: overrides?.seo_description,
    seo_hashtags: overrides?.seo_hashtags ?? [],
    seo_variants: overrides?.seo_variants ?? [],
    seo_selected_index: overrides?.seo_selected_index ?? 0,
    start_time: overrides?.start_time ?? 0,
    end_time: overrides?.end_time ?? 60,
    duration: overrides?.duration ?? 60,
    video_url: overrides?.video_url ?? 'https://storage.example.com/clips/test-clip.mp4',
    thumbnail_url: overrides?.thumbnail_url,
    storage_path: overrides?.storage_path ?? 'clips/test-clip.mp4',
    thumbnail_storage_path: overrides?.thumbnail_storage_path,
    transcript: overrides?.transcript ?? {
      segments: [
        { start: 0, end: 5, text: 'Hello world' },
        { start: 5, end: 10, text: 'This is a test' },
      ],
    },
    ai_score: overrides?.ai_score ?? 85,
    virality_components: overrides?.virality_components,
    virality_label: overrides?.virality_label ?? 'high',
    status: overrides?.status ?? 'ready',
    user_rating: overrides?.user_rating,
    rejection_reason: overrides?.rejection_reason,
    reviewed_at: overrides?.reviewed_at,
    created_at: overrides?.created_at ?? now,
    updated_at: overrides?.updated_at ?? now,
  };
}

export function createClipFeedbackFixture(overrides?: Partial<ClipFeedbackFixture>): ClipFeedbackFixture {
  const id = overrides?.id ?? uuidv4();
  const now = new Date();

  return {
    id,
    clip_id: overrides?.clip_id ?? 'clip-test-1234',
    user_id: overrides?.user_id ?? 'user-test-1234',
    rating: overrides?.rating,
    feedback_type: overrides?.feedback_type ?? 'approve',
    comment: overrides?.comment,
    created_at: overrides?.created_at ?? now,
  };
}

// Pre-built job fixtures
export const jobs = {
  pendingYouTube: createJobFixture({
    id: 'job-pending-yt-1234',
    status: 'pending',
    source_type: 'youtube',
    youtube_url: 'https://www.youtube.com/watch?v=test123',
  }),

  processingUpload: createJobFixture({
    id: 'job-processing-upload-1234',
    status: 'processing',
    source_type: 'upload',
    upload_path: '/uploads/test-video.mp4',
    progress: 50,
    current_step: 'transcribe',
    current_step_message: 'Transcribing audio...',
  }),

  completed: createJobFixture({
    id: 'job-completed-1234',
    status: 'completed',
    source_type: 'youtube',
    video_path: '/tmp/videos/test-video.mp4',
    progress: 100,
    completed_at: new Date(),
    title: 'Completed Test Video',
    metadata: {
      duration: 600,
      width: 1920,
      height: 1080,
    },
  }),

  failed: createJobFixture({
    id: 'job-failed-1234',
    status: 'failed',
    source_type: 'youtube',
    error: 'Failed to download video: Video unavailable',
    progress: 10,
    current_step: 'ingest',
  }),
};

// Pre-built clip fixtures
export const clips = {
  ready: createClipFixture({
    id: 'clip-ready-1234',
    status: 'ready',
    ai_score: 92,
    virality_label: 'viral',
  }),

  approved: createClipFixture({
    id: 'clip-approved-1234',
    status: 'approved',
    user_rating: 5,
    reviewed_at: new Date(),
  }),

  rejected: createClipFixture({
    id: 'clip-rejected-1234',
    status: 'rejected',
    rejection_reason: 'Low quality audio',
    reviewed_at: new Date(),
  }),

  pendingReview: createClipFixture({
    id: 'clip-pending-1234',
    status: 'pending_review',
    ai_score: 78,
  }),
};

// Helper to create multiple clips for a job
export function createClipsForJob(jobId: string, userId: string, count: number): ClipFixture[] {
  return Array.from({ length: count }, (_, i) =>
    createClipFixture({
      job_id: jobId,
      user_id: userId,
      title: `Clip ${i + 1}`,
      start_time: i * 60,
      end_time: (i + 1) * 60,
      ai_score: 70 + Math.random() * 30,
    })
  );
}

// Helper to convert to DB row format
export function toDbRow(fixture: JobFixture | ClipFixture | ClipFeedbackFixture) {
  const row: any = { ...fixture };
  if (row.created_at instanceof Date) row.created_at = row.created_at.toISOString();
  if (row.updated_at instanceof Date) row.updated_at = row.updated_at.toISOString();
  if (row.completed_at instanceof Date) row.completed_at = row.completed_at.toISOString();
  if (row.reviewed_at instanceof Date) row.reviewed_at = row.reviewed_at.toISOString();
  if (row.metadata && typeof row.metadata === 'object') row.metadata = JSON.stringify(row.metadata);
  if (row.transcript && typeof row.transcript === 'object') row.transcript = JSON.stringify(row.transcript);
  if (row.virality_components && typeof row.virality_components === 'object') {
    row.virality_components = JSON.stringify(row.virality_components);
  }
  if (row.seo_variants && typeof row.seo_variants === 'object') {
    row.seo_variants = JSON.stringify(row.seo_variants);
  }
  return row;
}
