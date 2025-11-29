-- Criar tabela JOBS para armazenar informações dos processamentos
CREATE TABLE IF NOT EXISTS public.jobs (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('youtube', 'upload')),
  youtube_url TEXT,
  upload_path TEXT,
  video_path TEXT,  -- Caminho do vídeo original baixado
  target_duration INTEGER NOT NULL DEFAULT 60,
  clip_count INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Criar tabela CLIPS para armazenar clips individuais
CREATE TABLE IF NOT EXISTS public.clips (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  hashtags JSONB DEFAULT '[]'::jsonb,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  duration REAL NOT NULL,
  score REAL,
  transcript JSONB,  -- Array de segments com text, start, end
  preview_url TEXT,
  download_url TEXT,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_clips_job_id ON public.clips(job_id);
CREATE INDEX IF NOT EXISTS idx_clips_status ON public.clips(status);

-- Enable RLS (Row Level Security)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;

-- Policies para JOBS
CREATE POLICY "Users can view their own jobs"
  ON public.jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs"
  ON public.jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs"
  ON public.jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jobs"
  ON public.jobs FOR DELETE
  USING (auth.uid() = user_id);

-- Policies para CLIPS (herdam permissão através do job_id)
CREATE POLICY "Users can view clips from their jobs"
  ON public.clips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = clips.job_id
      AND jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert clips"
  ON public.clips FOR INSERT
  WITH CHECK (true);  -- Backend tem service_key que bypassa RLS

CREATE POLICY "System can update clips"
  ON public.clips FOR UPDATE
  USING (true);  -- Backend tem service_key que bypassa RLS

CREATE POLICY "Users can delete clips from their jobs"
  ON public.clips FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = clips.job_id
      AND jobs.user_id = auth.uid()
    )
  );

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
DROP TRIGGER IF EXISTS set_jobs_updated_at ON public.jobs;
CREATE TRIGGER set_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_clips_updated_at ON public.clips;
CREATE TRIGGER set_clips_updated_at
  BEFORE UPDATE ON public.clips
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
