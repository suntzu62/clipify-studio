-- ==============================================================================
-- FIX: Row Level Security Policies for user_jobs
-- ==============================================================================
-- Problem: Current policies use USING (true) which doesn't properly filter by user
-- Solution: Update policies to filter by user_id matching auth.uid()
-- ==============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own jobs" ON public.user_jobs;
DROP POLICY IF EXISTS "Users can insert own jobs" ON public.user_jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON public.user_jobs;

-- Create proper policies that filter by user_id
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
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own jobs"
  ON public.user_jobs
  FOR DELETE
  USING (user_id = auth.uid()::text);

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_jobs TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
