-- Fix security vulnerability in subscriptions table
-- The current SELECT policy applies to 'public' role which includes anonymous users
-- We need to restrict it to only authenticated users

-- Drop the existing vulnerable policy
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;

-- Create a new policy that only applies to authenticated users
CREATE POLICY "Authenticated users can view own subscriptions" 
ON public.subscriptions 
FOR SELECT 
TO authenticated
USING (clerk_user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'clerk_user_id'::text));

-- Also fix the youtube_accounts table to ensure it's restricted to authenticated users only
-- Check current policies first
DO $$
BEGIN
    -- Drop and recreate the YouTube accounts SELECT policy to be extra secure
    DROP POLICY IF EXISTS "yt self" ON public.youtube_accounts;
    
    CREATE POLICY "Authenticated users can view own youtube accounts" 
    ON public.youtube_accounts 
    FOR SELECT 
    TO authenticated
    USING (auth.uid() = user_id);
END
$$;