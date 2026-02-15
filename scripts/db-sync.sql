-- ==============================================================================
-- CORTAI - Local DB Sync (idempotent)
-- Purpose: bring the local Postgres schema in sync with backend-v2 expectations.
-- This script is safe to run multiple times.
-- ==============================================================================

-- Extensions used by the schema/migrations
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- updated_at helper (used by multiple triggers/migrations)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- Jobs: migrate old `user_jobs` -> `jobs` when needed
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.user_jobs') IS NOT NULL
     AND to_regclass('public.jobs') IS NULL THEN
    ALTER TABLE public.user_jobs RENAME TO jobs;
  END IF;
END $$;

-- Create jobs table (fresh installs) and patch columns (upgrades)
CREATE TABLE IF NOT EXISTS public.jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('youtube', 'upload')),
  youtube_url TEXT,
  upload_path TEXT,
  video_path TEXT,
  title TEXT,
  target_duration INTEGER,
  clip_count INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  current_step TEXT,
  current_step_message TEXT,
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS upload_path TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS video_path TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS target_duration INTEGER;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS clip_count INTEGER;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS current_step TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS current_step_message TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill source_type from legacy column `source` when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jobs'
      AND column_name = 'source'
  ) THEN
    EXECUTE 'UPDATE public.jobs SET source_type = COALESCE(source_type, source) WHERE source_type IS NULL';
  END IF;
END $$;

-- Keep index names tidy when the table was renamed
DO $$ BEGIN
  IF to_regclass('public.idx_user_jobs_user_id') IS NOT NULL
     AND to_regclass('public.idx_jobs_user_id') IS NULL THEN
    ALTER INDEX public.idx_user_jobs_user_id RENAME TO idx_jobs_user_id;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.idx_user_jobs_status') IS NOT NULL
     AND to_regclass('public.idx_jobs_status') IS NULL THEN
    ALTER INDEX public.idx_user_jobs_status RENAME TO idx_jobs_status;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.idx_user_jobs_user_created') IS NOT NULL
     AND to_regclass('public.idx_jobs_user_created') IS NULL THEN
    ALTER INDEX public.idx_user_jobs_user_created RENAME TO idx_jobs_user_created;
  END IF;
END $$;

-- Ensure indexes exist for fresh installs
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_user_created ON public.jobs(user_id, created_at DESC);

-- Make sure we have a single updated_at trigger on jobs (avoid double triggers after rename)
DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
DROP TRIGGER IF EXISTS update_user_jobs_updated_at ON public.jobs;
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------------------
-- Clips: ensure schema matches backend-v2 writes/reads
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clips (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  hashtags TEXT[] DEFAULT '{}'::TEXT[],
  start_time DOUBLE PRECISION,
  end_time DOUBLE PRECISION,
  duration DOUBLE PRECISION,
  video_url TEXT,
  thumbnail_url TEXT,
  storage_path TEXT,
  thumbnail_storage_path TEXT,
  transcript JSONB,
  ai_score INTEGER,
  virality_components JSONB,
  virality_label TEXT,
  status TEXT DEFAULT 'pending',
  user_rating INTEGER,
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS thumbnail_storage_path TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS transcript JSONB;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS ai_score INTEGER;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS virality_components JSONB;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS virality_label TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS user_rating INTEGER;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Ensure clips FK points to jobs (some older schemas point to user_jobs)
ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS clips_job_id_fkey;
ALTER TABLE public.clips
  ADD CONSTRAINT clips_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE
  NOT VALID;

CREATE INDEX IF NOT EXISTS idx_clips_job_id ON public.clips(job_id);
CREATE INDEX IF NOT EXISTS idx_clips_user_id ON public.clips(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_status ON public.clips(status);

DROP TRIGGER IF EXISTS update_clips_updated_at ON public.clips;
CREATE TRIGGER update_clips_updated_at
  BEFORE UPDATE ON public.clips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

