-- =====================================================
-- FIX: Corrigir casting para UUID (user_id é UUID)
-- =====================================================

-- Dropar políticas existentes
DROP POLICY IF EXISTS "Users can view own YouTube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can insert own YouTube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can update own YouTube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can delete own YouTube account" ON public.youtube_accounts;

-- Criar políticas com casting correto: JWT claim 'sub' (TEXT) -> UUID
CREATE POLICY "Users can view own YouTube account"
  ON public.youtube_accounts
  FOR SELECT
  TO authenticated
  USING (
    user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub')::uuid
  );

CREATE POLICY "Users can insert own YouTube account"
  ON public.youtube_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub')::uuid
  );

CREATE POLICY "Users can update own YouTube account"
  ON public.youtube_accounts
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub')::uuid
  )
  WITH CHECK (
    user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub')::uuid
  );

CREATE POLICY "Users can delete own YouTube account"
  ON public.youtube_accounts
  FOR DELETE
  TO authenticated
  USING (
    user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub')::uuid
  );