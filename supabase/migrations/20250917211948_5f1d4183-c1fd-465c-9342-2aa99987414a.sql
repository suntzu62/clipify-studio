-- Fix critical security vulnerability in subscriptions table
-- Add comprehensive RLS policies to prevent unauthorized access to payment data

-- Policy to prevent unauthorized subscription creation
-- Only service role (backend) should create subscriptions via Stripe webhooks
CREATE POLICY "Prevent direct subscription creation"
ON public.subscriptions
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Policy to prevent unauthorized subscription updates  
-- Only service role (backend) should update subscriptions via Stripe webhooks
CREATE POLICY "Prevent direct subscription updates"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

-- Policy to prevent unauthorized subscription deletion
-- Only service role (backend) should delete subscriptions if needed
CREATE POLICY "Prevent direct subscription deletion"
ON public.subscriptions
FOR DELETE
TO authenticated
USING (false);

-- Allow service role to bypass RLS for webhook operations
-- This ensures Stripe webhooks can still manage subscriptions
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;