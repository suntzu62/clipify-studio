-- =====================================================
-- FIX: Remover políticas RLS duplicadas da youtube_accounts
-- Problema: Políticas duplicadas com nomes diferentes causando erro 403
-- =====================================================

-- Step 1: Remover TODAS as políticas existentes (duplicadas)
DROP POLICY IF EXISTS "Users can delete own youtube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can delete own YouTube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can insert own youtube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can insert own YouTube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can update own youtube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can update own YouTube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can view own youtube account" ON public.youtube_accounts;
DROP POLICY IF EXISTS "Users can view own YouTube account" ON public.youtube_accounts;

-- Step 2: Criar políticas RLS simplificadas e únicas
-- Usando auth.uid() diretamente (funciona tanto em prod quanto em dev)
CREATE POLICY "youtube_accounts_select_policy"
  ON public.youtube_accounts
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "youtube_accounts_insert_policy"
  ON public.youtube_accounts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "youtube_accounts_update_policy"
  ON public.youtube_accounts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "youtube_accounts_delete_policy"
  ON public.youtube_accounts
  FOR DELETE
  USING (user_id = auth.uid());

-- Step 4: Garantir que RLS está habilitado
ALTER TABLE public.youtube_accounts ENABLE ROW LEVEL SECURITY;
