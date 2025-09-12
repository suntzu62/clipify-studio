-- Fix critical security issue: Add comprehensive RLS policies for youtube_accounts table
-- This protects OAuth access and refresh tokens from unauthorized access

-- Allow users to insert their own YouTube account records
CREATE POLICY "Users can insert own YouTube accounts" 
ON public.youtube_accounts 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own YouTube account records
CREATE POLICY "Users can update own YouTube accounts" 
ON public.youtube_accounts 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own YouTube account records
CREATE POLICY "Users can delete own YouTube accounts" 
ON public.youtube_accounts 
FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);