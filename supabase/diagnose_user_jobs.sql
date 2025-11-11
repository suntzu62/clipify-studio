-- ==============================================================================
-- DIAGNOSTIC SCRIPT: User Jobs Investigation
-- ==============================================================================
-- This script helps diagnose the user_jobs table and understand why projects
-- aren't appearing in the UI
-- ==============================================================================

-- 1. Check all user_jobs in the database
SELECT
  id,
  user_id,
  youtube_url,
  source,
  status,
  progress,
  created_at
FROM public.user_jobs
ORDER BY created_at DESC
LIMIT 20;

-- ==============================================================================

-- 2. Count jobs by user_id
-- This helps identify which user_id format is being used
SELECT
  user_id,
  COUNT(*) as job_count,
  MIN(created_at) as first_job,
  MAX(created_at) as last_job
FROM public.user_jobs
GROUP BY user_id
ORDER BY job_count DESC;

-- ==============================================================================

-- 3. Check the authenticated Supabase user ID
-- Current user: gabrielfootze@gmail.com
-- User ID: 28655924-b0e9-406d-8c85-6cda7bb09726

SELECT
  id,
  email,
  created_at
FROM auth.users
WHERE email = 'gabrielfootze@gmail.com';

-- ==============================================================================

-- 4. Try to find jobs matching the Supabase auth user ID
SELECT
  id,
  user_id,
  youtube_url,
  status,
  created_at
FROM public.user_jobs
WHERE user_id = '28655924-b0e9-406d-8c85-6cda7bb09726'
ORDER BY created_at DESC;

-- ==============================================================================

-- 5. Check user_id format in user_jobs
-- This helps determine if user_id is UUID, Clerk ID, or something else
SELECT
  user_id,
  LENGTH(user_id) as id_length,
  CASE
    WHEN user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'UUID format'
    WHEN user_id ~ '^user_' THEN 'Clerk format'
    ELSE 'Other format'
  END as id_type,
  COUNT(*) as count
FROM public.user_jobs
GROUP BY user_id
ORDER BY count DESC;

-- ==============================================================================

-- 6. Sample of job IDs to match with storage
SELECT
  id,
  user_id,
  youtube_url,
  source,
  status
FROM public.user_jobs
ORDER BY created_at DESC
LIMIT 10;
