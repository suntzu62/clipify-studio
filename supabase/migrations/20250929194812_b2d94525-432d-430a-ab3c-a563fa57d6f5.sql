-- Create user_jobs table to track video processing jobs
CREATE TABLE IF NOT EXISTS public.user_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  youtube_url TEXT,
  source TEXT DEFAULT 'youtube' CHECK (source IN ('youtube', 'upload')),
  storage_path TEXT,
  file_name TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own jobs"
  ON public.user_jobs
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own jobs"
  ON public.user_jobs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own jobs"
  ON public.user_jobs
  FOR UPDATE
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_jobs_user_id ON public.user_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_jobs_source ON public.user_jobs(source);
CREATE INDEX IF NOT EXISTS idx_user_jobs_user_created ON public.user_jobs(user_id, created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Add comments
COMMENT ON TABLE public.user_jobs IS 'Tracks video processing jobs for users';
COMMENT ON COLUMN public.user_jobs.source IS 'Source type: youtube for YouTube URLs, upload for direct file uploads';
COMMENT ON COLUMN public.user_jobs.storage_path IS 'Path to uploaded file in Supabase Storage (only for upload source)';
COMMENT ON COLUMN public.user_jobs.file_name IS 'Original filename of uploaded video';
COMMENT ON COLUMN public.user_jobs.file_size IS 'Size of uploaded file in bytes';
