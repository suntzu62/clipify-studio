-- ==============================================================================
-- CORTAI - Subscription System (Mercado Pago)
-- ==============================================================================

-- ==============================================================================
-- Table: plans
-- Define os planos disponíveis (Free, Pro, Enterprise)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',

  -- Limites do plano
  clips_per_month INTEGER NOT NULL DEFAULT 10,
  minutes_per_month INTEGER NOT NULL DEFAULT 60,
  max_video_duration INTEGER NOT NULL DEFAULT 30, -- minutos
  max_clip_duration INTEGER NOT NULL DEFAULT 60,  -- segundos

  -- Features
  features JSONB DEFAULT '[]'::jsonb,
  has_watermark BOOLEAN DEFAULT true,
  has_priority_processing BOOLEAN DEFAULT false,
  has_api_access BOOLEAN DEFAULT false,
  has_custom_branding BOOLEAN DEFAULT false,

  -- Mercado Pago IDs (criados via API)
  mp_plan_id_monthly TEXT,
  mp_plan_id_yearly TEXT,

  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- Table: subscriptions
-- Assinaturas dos usuários
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plans(id),

  -- Status da assinatura
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Aguardando pagamento
    'authorized',   -- Pagamento autorizado, aguardando captura
    'active',       -- Assinatura ativa
    'paused',       -- Pausada pelo usuário
    'cancelled',    -- Cancelada
    'expired'       -- Expirada
  )),

  -- Período de faturamento
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,

  -- Mercado Pago
  mp_subscription_id TEXT,
  mp_preapproval_id TEXT,
  mp_payer_id TEXT,
  mp_external_reference TEXT,

  -- Uso do período atual
  clips_used INTEGER DEFAULT 0,
  minutes_used INTEGER DEFAULT 0,

  -- Metadados
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancel_reason TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- Table: payments
-- Histórico de pagamentos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  subscription_id TEXT REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Valores
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',

  -- Status do pagamento
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'approved',
    'authorized',
    'in_process',
    'in_mediation',
    'rejected',
    'cancelled',
    'refunded',
    'charged_back'
  )),

  -- Mercado Pago
  mp_payment_id TEXT,
  mp_preference_id TEXT,
  mp_external_reference TEXT,
  mp_payment_method TEXT,
  mp_payment_type TEXT,
  mp_installments INTEGER DEFAULT 1,

  -- Detalhes
  description TEXT,
  failure_reason TEXT,

  -- PIX específico
  pix_qr_code TEXT,
  pix_qr_code_base64 TEXT,
  pix_expiration TIMESTAMP WITH TIME ZONE,

  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- Table: usage_records
-- Registro de uso para controle de limites
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.usage_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES public.subscriptions(id) ON DELETE SET NULL,

  -- Tipo de uso
  usage_type TEXT NOT NULL CHECK (usage_type IN ('clip', 'minute', 'export', 'api_call')),
  quantity INTEGER NOT NULL DEFAULT 1,

  -- Referência (job_id, clip_id, etc)
  reference_id TEXT,
  reference_type TEXT,

  -- Período
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- Indexes
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_mp_subscription_id ON public.subscriptions(mp_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period ON public.subscriptions(current_period_end);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_mp_payment_id ON public.payments(mp_payment_id);

CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON public.usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_period ON public.usage_records(user_id, period_start, period_end);

-- ==============================================================================
-- Triggers
-- ==============================================================================
DROP TRIGGER IF EXISTS update_plans_updated_at ON public.plans;
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- Seed: Planos padrão
-- ==============================================================================
INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, clips_per_month, minutes_per_month, max_video_duration, max_clip_duration, features, has_watermark, has_priority_processing, sort_order) VALUES
  ('plan_free', 'Grátis', 'Perfeito para começar', 0, 0, 5, 30, 15, 60,
   '["5 clips por mês", "30 minutos de vídeo", "Marca d''água CortAI", "Legendas básicas"]'::jsonb,
   true, false, 0),

  ('plan_pro', 'Pro', 'Para criadores de conteúdo', 49.90, 479.00, 50, 300, 60, 90,
   '["50 clips por mês", "5 horas de vídeo", "Sem marca d''água", "Legendas avançadas", "Templates premium", "Suporte prioritário"]'::jsonb,
   false, true, 1),

  ('plan_enterprise', 'Enterprise', 'Para agências e empresas', 199.90, 1919.00, 500, 3000, 120, 120,
   '["500 clips por mês", "50 horas de vídeo", "Sem marca d''água", "Todas as features", "API access", "Branding customizado", "Suporte dedicado"]'::jsonb,
   false, true, 2)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  clips_per_month = EXCLUDED.clips_per_month,
  minutes_per_month = EXCLUDED.minutes_per_month,
  features = EXCLUDED.features,
  updated_at = NOW();

-- ==============================================================================
-- Function: Check user limits
-- ==============================================================================
CREATE OR REPLACE FUNCTION check_user_limits(p_user_id TEXT, p_usage_type TEXT)
RETURNS TABLE (
  can_use BOOLEAN,
  current_usage INTEGER,
  max_allowed INTEGER,
  plan_name TEXT
) AS $$
DECLARE
  v_subscription RECORD;
  v_plan RECORD;
  v_current_usage INTEGER;
  v_max_allowed INTEGER;
BEGIN
  -- Buscar assinatura ativa do usuário
  SELECT s.*, p.clips_per_month, p.minutes_per_month, p.name as plan_name
  INTO v_subscription
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.current_period_end > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Se não tem assinatura, usar plano free
  IF v_subscription IS NULL THEN
    SELECT * INTO v_plan FROM plans WHERE id = 'plan_free';
    v_current_usage := 0;

    IF p_usage_type = 'clip' THEN
      v_max_allowed := v_plan.clips_per_month;
    ELSE
      v_max_allowed := v_plan.minutes_per_month;
    END IF;

    RETURN QUERY SELECT true, 0, v_max_allowed, v_plan.name;
    RETURN;
  END IF;

  -- Calcular uso atual
  IF p_usage_type = 'clip' THEN
    v_current_usage := v_subscription.clips_used;
    v_max_allowed := v_subscription.clips_per_month;
  ELSE
    v_current_usage := v_subscription.minutes_used;
    v_max_allowed := v_subscription.minutes_per_month;
  END IF;

  RETURN QUERY SELECT
    v_current_usage < v_max_allowed,
    v_current_usage,
    v_max_allowed,
    v_subscription.plan_name;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- Grant permissions
-- ==============================================================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres;
