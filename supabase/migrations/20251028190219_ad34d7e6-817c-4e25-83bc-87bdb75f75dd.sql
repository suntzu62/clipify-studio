-- Habilitar Row Level Security na tabela youtube_accounts
ALTER TABLE public.youtube_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Usuário só vê sua própria conta YouTube
CREATE POLICY "Users can view own youtube account"
  ON public.youtube_accounts FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Usuário pode inserir apenas sua própria conta
CREATE POLICY "Users can insert own youtube account"
  ON public.youtube_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Usuário pode atualizar apenas sua própria conta
CREATE POLICY "Users can update own youtube account"
  ON public.youtube_accounts FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Usuário pode deletar apenas sua própria conta
CREATE POLICY "Users can delete own youtube account"
  ON public.youtube_accounts FOR DELETE
  USING (auth.uid() = user_id);