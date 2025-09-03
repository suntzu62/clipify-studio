-- Add RLS policies for security as guardrails
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
FOR SELECT USING (clerk_user_id = current_setting('request.jwt.claims', true)::json->>'clerk_user_id');

CREATE POLICY "Users can view own usage" ON public.usage
FOR SELECT USING (clerk_user_id = current_setting('request.jwt.claims', true)::json->>'clerk_user_id');

CREATE POLICY "Users can view own usage events" ON public.usage_events
FOR SELECT USING (clerk_user_id = current_setting('request.jwt.claims', true)::json->>'clerk_user_id');

-- Add unique constraint for idempotency on usage_events
CREATE UNIQUE INDEX IF NOT EXISTS usage_events_idempotency_unique 
ON public.usage_events(idempotency_key, clerk_user_id);

-- Harden the database function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;