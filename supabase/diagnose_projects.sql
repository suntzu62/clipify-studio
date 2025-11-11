-- ==============================================================================
-- DIAGNOSTIC SCRIPT: Projects Ownership Issue
-- ==============================================================================
-- This script helps diagnose why projects aren't appearing in the UI
-- Run these queries in the Supabase SQL Editor to debug the issue
-- ==============================================================================

-- 1. Check all projects in the database (regardless of user)
-- This shows you all projects that exist
SELECT
  id,
  user_id,
  title,
  youtube_url,
  status,
  created_at
FROM public.projects
ORDER BY created_at DESC;

-- ==============================================================================

-- 2. Get the authenticated user's ID from your application
-- Run this in your browser console while logged in:
-- console.log(await supabase.auth.getUser())
-- Copy the user ID and replace 'YOUR_USER_ID_HERE' below

-- ==============================================================================

-- 3. Check projects for a specific user
-- Replace 'YOUR_USER_ID_HERE' with the actual user ID from step 2
SELECT
  id,
  user_id,
  title,
  youtube_url,
  status,
  created_at
FROM public.projects
WHERE user_id = 'YOUR_USER_ID_HERE'
ORDER BY created_at DESC;

-- ==============================================================================

-- 4. Count projects by user_id
-- This helps identify if projects are assigned to different users
SELECT
  user_id,
  COUNT(*) as project_count,
  MIN(created_at) as first_project,
  MAX(created_at) as last_project
FROM public.projects
GROUP BY user_id
ORDER BY project_count DESC;

-- ==============================================================================

-- 5. Check users in auth.users table
-- Compare with the user_id values from projects table
SELECT
  id,
  email,
  created_at,
  last_sign_in_at
FROM auth.users
ORDER BY created_at DESC;

-- ==============================================================================

-- 6. Find orphaned projects (user_id doesn't match any auth.users)
SELECT
  p.id,
  p.user_id,
  p.title,
  p.youtube_url,
  p.created_at
FROM public.projects p
LEFT JOIN auth.users u ON p.user_id = u.id
WHERE u.id IS NULL;

-- ==============================================================================
-- FIX SCRIPT: Update project ownership
-- ==============================================================================
-- ONLY RUN THIS AFTER CONFIRMING THE ISSUE!
-- This will reassign all projects to a specific user
-- Replace 'YOUR_CORRECT_USER_ID' with the authenticated user's ID
-- ==============================================================================

-- Option A: Update ALL projects to belong to one user
-- UNCOMMENT BELOW TO RUN (remove the -- at the start of each line)
-- UPDATE public.projects
-- SET user_id = 'YOUR_CORRECT_USER_ID'
-- WHERE user_id != 'YOUR_CORRECT_USER_ID';

-- ==============================================================================

-- Option B: Update specific projects by ID
-- UNCOMMENT BELOW TO RUN (replace the IDs with actual project IDs)
-- UPDATE public.projects
-- SET user_id = 'YOUR_CORRECT_USER_ID'
-- WHERE id IN (
--   'project-id-1',
--   'project-id-2',
--   'project-id-3'
-- );

-- ==============================================================================

-- 7. Verify the fix worked - check projects after update
-- Replace 'YOUR_USER_ID_HERE' with your user ID
SELECT
  id,
  user_id,
  title,
  youtube_url,
  status,
  created_at
FROM public.projects
WHERE user_id = 'YOUR_USER_ID_HERE'
ORDER BY created_at DESC;

-- ==============================================================================
-- Additional debugging: Check RLS policies
-- ==============================================================================

-- View current RLS policies on projects table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'projects';

-- ==============================================================================
-- Check if RLS is enabled on the projects table
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'projects';
