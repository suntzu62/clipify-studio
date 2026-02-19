-- ==============================================================================
-- Commercial parity foundation (lives, scheduler/queue, brand kit)
-- ==============================================================================

-- ============================================
-- Table: live_sources
-- ============================================
CREATE TABLE IF NOT EXISTS public.live_sources (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube_live', 'twitch')),
  stream_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'stopped', 'error')),
  started_at TIMESTAMP WITH TIME ZONE,
  stopped_at TIMESTAMP WITH TIME ZONE,
  last_ingested_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_sources_user_status
  ON public.live_sources (user_id, status);

CREATE INDEX IF NOT EXISTS idx_live_sources_user_created
  ON public.live_sources (user_id, created_at DESC);

-- ============================================
-- Table: live_ingest_windows
-- ============================================
CREATE TABLE IF NOT EXISTS public.live_ingest_windows (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  source_id TEXT NOT NULL REFERENCES public.live_sources(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  job_id TEXT REFERENCES public.jobs(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_windows_source_created
  ON public.live_ingest_windows (source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_windows_user_status
  ON public.live_ingest_windows (user_id, status);

-- ============================================
-- Table: scheduled_publications
-- ============================================
CREATE TABLE IF NOT EXISTS public.scheduled_publications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  clip_id TEXT NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'youtube', 'tiktok')),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  publication_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_publications_user_status
  ON public.scheduled_publications (user_id, status);

CREATE INDEX IF NOT EXISTS idx_scheduled_publications_scheduled_status
  ON public.scheduled_publications (scheduled_at, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_publications_idempotency
  ON public.scheduled_publications (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================
-- Table: brand_kits
-- ============================================
CREATE TABLE IF NOT EXISTS public.brand_kits (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT,
  intro_url TEXT,
  outro_url TEXT,
  palette JSONB NOT NULL DEFAULT '{}'::jsonb,
  watermark JSONB NOT NULL DEFAULT '{}'::jsonb,
  caption_style_id TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_kits_user_created
  ON public.brand_kits (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brand_kits_user_default
  ON public.brand_kits (user_id, is_default);

-- ============================================
-- Table: queue_events
-- ============================================
CREATE TABLE IF NOT EXISTS public.queue_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  queue_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_events_user_created
  ON public.queue_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_queue_events_entity
  ON public.queue_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_queue_events_status
  ON public.queue_events (status, created_at DESC);

-- ============================================
-- Triggers for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_live_sources_updated_at ON public.live_sources;
CREATE TRIGGER update_live_sources_updated_at
  BEFORE UPDATE ON public.live_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_live_ingest_windows_updated_at ON public.live_ingest_windows;
CREATE TRIGGER update_live_ingest_windows_updated_at
  BEFORE UPDATE ON public.live_ingest_windows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scheduled_publications_updated_at ON public.scheduled_publications;
CREATE TRIGGER update_scheduled_publications_updated_at
  BEFORE UPDATE ON public.scheduled_publications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_brand_kits_updated_at ON public.brand_kits;
CREATE TRIGGER update_brand_kits_updated_at
  BEFORE UPDATE ON public.brand_kits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Keep single default brand kit per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_kits_single_default
  ON public.brand_kits (user_id)
  WHERE is_default = true;

-- ============================================
-- Extend jobs.source_type for live ingestion
-- ============================================
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'jobs'
    AND tc.constraint_type = 'CHECK'
    AND ccu.column_name = 'source_type'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END IF;

  ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_source_type_check
    CHECK (source_type IN ('youtube', 'youtube_live', 'upload'));
END $$;
