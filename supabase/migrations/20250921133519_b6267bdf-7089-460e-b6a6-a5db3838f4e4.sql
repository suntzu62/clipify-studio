-- Enhanced security fix for subscriptions table
-- The security scanner is still flagging the table, so we need to ensure
-- the policies are completely bulletproof and explicit

-- Drop existing policies to recreate them with enhanced security
DROP POLICY IF EXISTS "Authenticated users can view own subscriptions" ON public.subscriptions;

-- Create new policy with explicit authenticated role check and additional security
CREATE POLICY "Secure user subscription access" 
ON public.subscriptions 
FOR SELECT 
TO authenticated
USING (
  -- Ensure user is authenticated via Clerk
  auth.role() = 'authenticated' AND
  -- User can only see their own subscription data
  clerk_user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'clerk_user_id'::text)
);

-- Also ensure the other policies are properly restricted to authenticated users
DROP POLICY IF EXISTS "Prevent direct subscription creation" ON public.subscriptions;
DROP POLICY IF EXISTS "Prevent direct subscription updates" ON public.subscriptions;  
DROP POLICY IF EXISTS "Prevent direct subscription deletion" ON public.subscriptions;

-- Recreate with explicit authenticated checks
CREATE POLICY "Block subscription creation" 
ON public.subscriptions 
FOR INSERT 
TO authenticated
WITH CHECK (false);

CREATE POLICY "Block subscription updates" 
ON public.subscriptions 
FOR UPDATE 
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block subscription deletion" 
ON public.subscriptions 
FOR DELETE 
TO authenticated
USING (false);