-- ==============================================================================
-- CORREÇÃO URGENTE: Políticas RLS da tabela user_jobs
-- ==============================================================================
-- Execute este script COMPLETO no SQL Editor do Supabase
-- ==============================================================================

-- 1. Remover políticas antigas
DROP POLICY IF EXISTS "Users can view own jobs" ON public.user_jobs;
DROP POLICY IF EXISTS "Users can insert own jobs" ON public.user_jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON public.user_jobs;
DROP POLICY IF EXISTS "Users can delete own jobs" ON public.user_jobs;

-- 2. Criar novas políticas corretas
-- O user_id é TEXT (UUID como string), então precisamos converter auth.uid() para texto
CREATE POLICY "Users can view own jobs"
  ON public.user_jobs
  FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own jobs"
  ON public.user_jobs
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own jobs"
  ON public.user_jobs
  FOR UPDATE
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own jobs"
  ON public.user_jobs
  FOR DELETE
  USING (user_id = auth.uid()::text);

-- 3. Garantir permissões para usuários autenticados
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_jobs TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 4. Verificar se funcionou
-- Execute esta query para testar (substitua o UUID pelo seu)
SELECT COUNT(*) as total_jobs
FROM public.user_jobs
WHERE user_id = '28655924-b0e9-406d-8c85-6cda7bb09726';

-- Se retornar um número, está funcionando!
-- Se retornar erro, ainda há problema nas políticas
