import { v4 as uuidv4 } from 'crypto';

export interface PlanFixture {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  clips_per_month: number;
  minutes_per_month: number;
  max_video_duration: number;
  max_clip_duration: number;
  features: string[];
  has_watermark: boolean;
  has_priority_processing: boolean;
  has_api_access: boolean;
  has_custom_branding: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface SubscriptionFixture {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'pending' | 'cancelled' | 'paused' | 'authorized';
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: Date;
  current_period_end: Date;
  clips_used: number;
  minutes_used: number;
  is_trial: boolean;
  mp_external_reference?: string;
  mp_preapproval_id?: string;
  mp_payer_id?: string;
  cancelled_at?: Date;
  cancel_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentFixture {
  id: string;
  subscription_id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  mp_preference_id?: string;
  mp_payment_id?: string;
  mp_external_reference?: string;
  mp_payment_method?: string;
  mp_payment_type?: string;
  description: string;
  pix_qr_code?: string;
  pix_qr_code_base64?: string;
  pix_expiration?: Date;
  paid_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UsageRecordFixture {
  id: string;
  user_id: string;
  subscription_id?: string;
  usage_type: 'clip' | 'minute';
  quantity: number;
  reference_id?: string;
  reference_type?: string;
  period_start: Date;
  period_end: Date;
  idempotency_key?: string;
  created_at: Date;
}

// Plan fixtures
export const plans: Record<string, PlanFixture> = {
  free: {
    id: 'plan_free',
    name: 'Grátis',
    description: 'Plano gratuito para experimentar',
    price_monthly: 0,
    price_yearly: 0,
    clips_per_month: 5,
    minutes_per_month: 30,
    max_video_duration: 3600,
    max_clip_duration: 60,
    features: ['basic_export'],
    has_watermark: true,
    has_priority_processing: false,
    has_api_access: false,
    has_custom_branding: false,
    is_active: true,
    sort_order: 0,
  },
  starter: {
    id: 'plan_starter',
    name: 'Starter',
    description: 'Para criadores iniciantes',
    price_monthly: 29.90,
    price_yearly: 299.00,
    clips_per_month: 50,
    minutes_per_month: 300,
    max_video_duration: 7200,
    max_clip_duration: 90,
    features: ['basic_export', 'no_watermark'],
    has_watermark: false,
    has_priority_processing: false,
    has_api_access: false,
    has_custom_branding: false,
    is_active: true,
    sort_order: 1,
  },
  pro: {
    id: 'plan_pro',
    name: 'Pro',
    description: 'Para criadores profissionais',
    price_monthly: 79.90,
    price_yearly: 799.00,
    clips_per_month: 200,
    minutes_per_month: 1200,
    max_video_duration: 14400,
    max_clip_duration: 180,
    features: ['basic_export', 'no_watermark', 'priority_processing', 'api_access'],
    has_watermark: false,
    has_priority_processing: true,
    has_api_access: true,
    has_custom_branding: false,
    is_active: true,
    sort_order: 2,
  },
  enterprise: {
    id: 'plan_enterprise',
    name: 'Enterprise',
    description: 'Para empresas e equipes',
    price_monthly: 299.90,
    price_yearly: 2999.00,
    clips_per_month: 1000,
    minutes_per_month: 6000,
    max_video_duration: 28800,
    max_clip_duration: 300,
    features: ['basic_export', 'no_watermark', 'priority_processing', 'api_access', 'custom_branding'],
    has_watermark: false,
    has_priority_processing: true,
    has_api_access: true,
    has_custom_branding: true,
    is_active: true,
    sort_order: 3,
  },
  trial: {
    id: 'plan_trial',
    name: 'Trial',
    description: 'Período de teste gratuito',
    price_monthly: 0,
    price_yearly: 0,
    clips_per_month: 100,
    minutes_per_month: 600,
    max_video_duration: 7200,
    max_clip_duration: 120,
    features: ['basic_export', 'no_watermark', 'priority_processing'],
    has_watermark: false,
    has_priority_processing: true,
    has_api_access: false,
    has_custom_branding: false,
    is_active: true,
    sort_order: -1,
  },
};

export function createSubscriptionFixture(overrides?: Partial<SubscriptionFixture>): SubscriptionFixture {
  const id = overrides?.id ?? uuidv4();
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return {
    id,
    user_id: overrides?.user_id ?? 'user-test-1234',
    plan_id: overrides?.plan_id ?? 'plan_free',
    status: overrides?.status ?? 'active',
    billing_cycle: overrides?.billing_cycle ?? 'monthly',
    current_period_start: overrides?.current_period_start ?? now,
    current_period_end: overrides?.current_period_end ?? periodEnd,
    clips_used: overrides?.clips_used ?? 0,
    minutes_used: overrides?.minutes_used ?? 0,
    is_trial: overrides?.is_trial ?? false,
    mp_external_reference: overrides?.mp_external_reference,
    mp_preapproval_id: overrides?.mp_preapproval_id,
    mp_payer_id: overrides?.mp_payer_id,
    cancelled_at: overrides?.cancelled_at,
    cancel_reason: overrides?.cancel_reason,
    created_at: overrides?.created_at ?? now,
    updated_at: overrides?.updated_at ?? now,
  };
}

export function createPaymentFixture(overrides?: Partial<PaymentFixture>): PaymentFixture {
  const id = overrides?.id ?? uuidv4();
  const now = new Date();

  return {
    id,
    subscription_id: overrides?.subscription_id ?? 'sub-test-1234',
    user_id: overrides?.user_id ?? 'user-test-1234',
    amount: overrides?.amount ?? 29.90,
    currency: overrides?.currency ?? 'BRL',
    status: overrides?.status ?? 'pending',
    mp_preference_id: overrides?.mp_preference_id,
    mp_payment_id: overrides?.mp_payment_id,
    mp_external_reference: overrides?.mp_external_reference,
    mp_payment_method: overrides?.mp_payment_method,
    mp_payment_type: overrides?.mp_payment_type,
    description: overrides?.description ?? 'Starter - Mensal',
    pix_qr_code: overrides?.pix_qr_code,
    pix_qr_code_base64: overrides?.pix_qr_code_base64,
    pix_expiration: overrides?.pix_expiration,
    paid_at: overrides?.paid_at,
    created_at: overrides?.created_at ?? now,
    updated_at: overrides?.updated_at ?? now,
  };
}

export function createUsageRecordFixture(overrides?: Partial<UsageRecordFixture>): UsageRecordFixture {
  const id = overrides?.id ?? uuidv4();
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    id,
    user_id: overrides?.user_id ?? 'user-test-1234',
    subscription_id: overrides?.subscription_id,
    usage_type: overrides?.usage_type ?? 'clip',
    quantity: overrides?.quantity ?? 1,
    reference_id: overrides?.reference_id,
    reference_type: overrides?.reference_type,
    period_start: overrides?.period_start ?? periodStart,
    period_end: overrides?.period_end ?? periodEnd,
    idempotency_key: overrides?.idempotency_key,
    created_at: overrides?.created_at ?? now,
  };
}

// Pre-built subscription fixtures
export const subscriptions = {
  activeProMonthly: createSubscriptionFixture({
    id: 'sub-pro-monthly-1234',
    plan_id: 'plan_pro',
    status: 'active',
    billing_cycle: 'monthly',
    clips_used: 50,
    minutes_used: 300,
  }),

  activeStarterYearly: createSubscriptionFixture({
    id: 'sub-starter-yearly-1234',
    plan_id: 'plan_starter',
    status: 'active',
    billing_cycle: 'yearly',
    clips_used: 10,
    minutes_used: 60,
  }),

  pendingPayment: createSubscriptionFixture({
    id: 'sub-pending-1234',
    plan_id: 'plan_pro',
    status: 'pending',
    mp_external_reference: 'sub_test_1234567890',
  }),

  cancelledSubscription: createSubscriptionFixture({
    id: 'sub-cancelled-1234',
    plan_id: 'plan_starter',
    status: 'cancelled',
    cancelled_at: new Date(),
    cancel_reason: 'Cancelado pelo usuário',
  }),

  trialSubscription: createSubscriptionFixture({
    id: 'sub-trial-1234',
    plan_id: 'plan_trial',
    status: 'active',
    is_trial: true,
    clips_used: 5,
    minutes_used: 30,
  }),

  limitReached: createSubscriptionFixture({
    id: 'sub-limit-1234',
    plan_id: 'plan_free',
    status: 'active',
    clips_used: 5,
    minutes_used: 30,
  }),
};

// Helper to create subscription with plan data (simulates JOIN)
export function subscriptionWithPlan(subscription: SubscriptionFixture): SubscriptionFixture & PlanFixture {
  const plan = plans[subscription.plan_id.replace('plan_', '')] || plans.free;
  return {
    ...subscription,
    ...plan,
    plan_name: plan.name,
  };
}
