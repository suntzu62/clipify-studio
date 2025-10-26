-- Create youtube_accounts table
CREATE TABLE IF NOT EXISTS public.youtube_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry_date TIMESTAMPTZ NOT NULL,
  channel_id TEXT,
  channel_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.youtube_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own YouTube account"
  ON public.youtube_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own YouTube account"
  ON public.youtube_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own YouTube account"
  ON public.youtube_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own YouTube account"
  ON public.youtube_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_youtube_accounts_updated_at ON public.youtube_accounts;
CREATE TRIGGER update_youtube_accounts_updated_at
  BEFORE UPDATE ON public.youtube_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Documentation comments
COMMENT ON TABLE public.youtube_accounts IS 'Armazena tokens OAuth do YouTube para cada usuário';
COMMENT ON COLUMN public.youtube_accounts.access_token IS 'Token de acesso do Google OAuth (válido por ~1 hora)';
COMMENT ON COLUMN public.youtube_accounts.refresh_token IS 'Token de refresh para renovar access_token';
COMMENT ON COLUMN public.youtube_accounts.expiry_date IS 'Data/hora de expiração do access_token';