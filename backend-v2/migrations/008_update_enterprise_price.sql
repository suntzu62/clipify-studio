-- Update Enterprise plan pricing (monthly/yearly).
-- Rationale: keep quotas (500 clips / 3000 minutes) but increase price to protect margins.

UPDATE public.plans
SET
  price_monthly = 399.90,
  price_yearly = 3839.00,
  updated_at = NOW()
WHERE id = 'plan_enterprise';

