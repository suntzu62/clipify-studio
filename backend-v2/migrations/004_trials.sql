-- ==============================================================================
-- CORTAI - Trials (Free Trial)
-- ==============================================================================

-- Add a marker to prevent multiple trials per user
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false;

-- Seed a hidden trial plan (used internally by the backend)
INSERT INTO public.plans (
  id,
  name,
  description,
  price_monthly,
  price_yearly,
  clips_per_month,
  minutes_per_month,
  max_video_duration,
  max_clip_duration,
  features,
  has_watermark,
  has_priority_processing,
  has_api_access,
  has_custom_branding,
  is_active,
  sort_order
)
VALUES (
  'plan_trial',
  'Pro (Teste)',
  'Teste grátis por 7 dias',
  0,
  0,
  10,
  60,
  30,
  90,
  '["10 clips", "60 minutos", "Sem marca d''água", "Legendas avançadas"]'::jsonb,
  false,
  false,
  false,
  false,
  false,
  -1
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  clips_per_month = EXCLUDED.clips_per_month,
  minutes_per_month = EXCLUDED.minutes_per_month,
  features = EXCLUDED.features,
  has_watermark = EXCLUDED.has_watermark,
  has_priority_processing = EXCLUDED.has_priority_processing,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

