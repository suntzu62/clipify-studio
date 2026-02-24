-- ==============================================================================
-- CORTAI - Migration 005: Update plan prices for market competitiveness
-- Reducing Pro: R$97 → R$50/mês | Enterprise: R$297 → R$150/mês
-- ==============================================================================

-- Upsert all plans with the updated competitive pricing
-- Uses ON CONFLICT to update if plans already exist with these IDs
INSERT INTO public.plans (
  id, name, description,
  price_monthly, price_yearly, currency,
  clips_per_month, minutes_per_month,
  max_video_duration, max_clip_duration,
  features, has_watermark, has_priority_processing,
  has_api_access, has_custom_branding,
  is_active, sort_order
) VALUES
  (
    'plan_free',
    'Grátis',
    'Perfeito para começar',
    0, 0, 'BRL',
    5, 30, 15, 60,
    '["5 clips por mês", "30 minutos de vídeo", "Marca d''água CortAI", "Legendas básicas"]'::jsonb,
    true, false, false, false,
    true, 0
  ),
  (
    'plan_pro',
    'Pro',
    'Para criadores de conteúdo',
    50.00, 480.00, 'BRL',
    50, 300, 60, 90,
    '["50 clips por mês", "5 horas de vídeo", "Sem marca d''água", "Legendas avançadas", "Templates premium", "Suporte prioritário"]'::jsonb,
    false, true, false, false,
    true, 1
  ),
  (
    'plan_enterprise',
    'Enterprise',
    'Para agências e empresas',
    150.00, 1440.00, 'BRL',
    500, 1500, 120, 120,
    '["500 clips por mês", "25 horas de vídeo", "Sem marca d''água", "Todas as features", "API access", "Branding customizado", "Suporte dedicado"]'::jsonb,
    false, true, true, true,
    true, 2
  )
ON CONFLICT (id) DO UPDATE SET
  name                    = EXCLUDED.name,
  description             = EXCLUDED.description,
  price_monthly           = EXCLUDED.price_monthly,
  price_yearly            = EXCLUDED.price_yearly,
  clips_per_month         = EXCLUDED.clips_per_month,
  minutes_per_month       = EXCLUDED.minutes_per_month,
  max_video_duration      = EXCLUDED.max_video_duration,
  max_clip_duration       = EXCLUDED.max_clip_duration,
  features                = EXCLUDED.features,
  has_watermark           = EXCLUDED.has_watermark,
  has_priority_processing = EXCLUDED.has_priority_processing,
  has_api_access          = EXCLUDED.has_api_access,
  has_custom_branding     = EXCLUDED.has_custom_branding,
  is_active               = EXCLUDED.is_active,
  sort_order              = EXCLUDED.sort_order,
  updated_at              = NOW();

-- Deactivate any legacy plans that are no longer part of the lineup
-- (plans with IDs different from the standard set, e.g. old 'starter', 'professional')
UPDATE public.plans
SET is_active = false, updated_at = NOW()
WHERE id NOT IN ('plan_free', 'plan_pro', 'plan_enterprise', 'plan_trial');
