-- =====================================================
-- FIX: Corrigir políticas RLS para usar Clerk auth
-- =====================================================

-- 1. Dropar políticas antigas que usam auth.uid()
DROP POLICY IF EXISTS "Users can view their own YouTube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can insert their own YouTube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can update their own YouTube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can delete their own YouTube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "yt self" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Authenticated users can view own youtube accounts" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can insert own YouTube accounts" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can update own YouTube accounts" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can delete own YouTube accounts" ON public.youtube_accounts;

-- 2. Criar políticas corretas usando clerk_user_id
CREATE POLICY "Users can view own YouTube account"
  ON public.youtube_accounts
  FOR SELECT
  TO authenticated
  USING (
    user_id::text = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub')
  );

CREATE POLICY "Users can insert own YouTube account"
  ON public.youtube_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id::text = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub')
  );

CREATE POLICY "Users can update own YouTube account"
  ON public.youtube_accounts
  FOR UPDATE
  TO authenticated
  USING (
    user_id::text = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub')
  )
  WITH CHECK (
    user_id::text = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub')
  );

CREATE POLICY "Users can delete own YouTube account"
  ON public.youtube_accounts
  FOR DELETE
  TO authenticated
  USING (
    user_id::text = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub')
  );

-- 3. Adicionar comentário
COMMENT ON TABLE public.youtube_accounts IS 'YouTube OAuth tokens per user. RLS policies enforce user_id isolation based on Clerk JWT claims (sub).';