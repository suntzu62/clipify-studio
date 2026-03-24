import { MercadoPagoConfig, Preference, Payment as MPPaymentClient } from 'mercadopago';
import { randomUUID } from 'crypto';
import { pool } from './database.service.js';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('mercadopago-service');
const UNLIMITED_MAX_ALLOWED = 999999999;

// ============================================
// MercadoPago SDK Config
// ============================================

const mpConfig = env.mercadoPago.accessToken
  ? new MercadoPagoConfig({ accessToken: env.mercadoPago.accessToken })
  : null;

function getMpConfig(): MercadoPagoConfig {
  if (!mpConfig) {
    throw new Error('MercadoPago not configured: MERCADO_PAGO_ACCESS_TOKEN is missing');
  }
  return mpConfig;
}

// ============================================
// Types
// ============================================

type BillingCycle = 'monthly' | 'yearly';
type UsageMetric = 'clip' | 'minute';

export interface Plan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  clipQuota: number;
  minuteQuota: number;
  features: string[];
  hasWatermark: boolean;
  hasPriorityProcessing: boolean;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  billing_cycle: BillingCycle;
  current_period_start: string | null;
  current_period_end: string | null;
  mp_subscription_id: string | null;
  clips_used: number;
  minutes_used: number;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  plan_name?: string;
}

type UsageResponse = {
  planName: string;
  currentUsage: number;
  maxAllowed: number;
  canUse: boolean;
  subscription: Subscription | null;
};

interface CreateSubscriptionInput {
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  billingCycle: BillingCycle;
}

interface CreatePaymentInput extends CreateSubscriptionInput {
  paymentMethod?: 'pix' | 'credit_card' | 'boleto';
}

// ============================================
// Helpers
// ============================================

function mapPlanRow(row: any): Plan {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    monthlyPrice: parseFloat(row.price_monthly),
    yearlyPrice: parseFloat(row.price_yearly),
    clipQuota: row.clips_per_month,
    minuteQuota: row.minutes_per_month,
    features: row.features || [],
    hasWatermark: row.has_watermark,
    hasPriorityProcessing: row.has_priority_processing,
    isActive: row.is_active,
  };
}

function getPrice(plan: Plan, cycle: BillingCycle): number {
  return cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
}

function getPeriodEnd(cycle: BillingCycle): Date {
  const now = new Date();
  if (cycle === 'yearly') {
    return new Date(now.getTime() + 365 * 24 * 3600 * 1000);
  }
  return new Date(now.getTime() + 30 * 24 * 3600 * 1000);
}

async function isUnlimitedAdminUserId(userId: string): Promise<boolean> {
  if (!userId) {
    return false;
  }

  try {
    const { rows } = await pool.query(
      'SELECT email FROM profiles WHERE id = $1 LIMIT 1',
      [userId]
    );

    const email = String(rows[0]?.email || '').trim().toLowerCase();
    return email === env.billing.unlimitedAdminEmail;
  } catch (error: any) {
    logger.warn({ userId, error: error?.message }, 'Failed to resolve admin unlimited user');
    return false;
  }
}

// ============================================
// Plans (from PostgreSQL)
// ============================================

export async function getPlans(): Promise<Plan[]> {
  const { rows } = await pool.query(
    'SELECT * FROM plans WHERE is_active = true ORDER BY sort_order'
  );
  return rows.map(mapPlanRow);
}

export async function getPlanById(planId: string): Promise<Plan | null> {
  const { rows } = await pool.query('SELECT * FROM plans WHERE id = $1', [planId]);
  return rows[0] ? mapPlanRow(rows[0]) : null;
}

// ============================================
// Subscriptions
// ============================================

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const { rows } = await pool.query(
    `SELECT s.*, p.name as plan_name
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = $1 AND s.status IN ('active', 'authorized')
     ORDER BY s.created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function getSubscriptionHistory(userId: string): Promise<Subscription[]> {
  const { rows } = await pool.query(
    `SELECT s.*, p.name as plan_name
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function createSubscription(input: CreateSubscriptionInput): Promise<
  | { subscription: Subscription }
  | { subscription: Subscription; checkoutUrl: string; preferenceId: string }
> {
  const plan = await getPlanById(input.planId);
  if (!plan) {
    throw new Error(`Plano não encontrado: ${input.planId}`);
  }

  // Free plan — activate immediately, no payment needed
  if (plan.monthlyPrice === 0) {
    const subId = randomUUID();
    const periodEnd = getPeriodEnd(input.billingCycle);
    const { rows } = await pool.query(
      `INSERT INTO subscriptions (id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
       VALUES ($1, $2, $3, 'active', $4, NOW(), $5)
       RETURNING *`,
      [subId, input.userId, plan.id, input.billingCycle, periodEnd]
    );
    return { subscription: rows[0] };
  }

  // Paid plan — create MercadoPago Preference
  if (!mpConfig) {
    throw new Error('Pagamentos ainda não estão configurados. Configure MERCADOPAGO_ACCESS_TOKEN no servidor.');
  }
  const preference = new Preference(mpConfig);
  const externalRef = `sub_${randomUUID().replace(/-/g, '')}`;
  const price = getPrice(plan, input.billingCycle);
  const periodLabel = input.billingCycle === 'yearly' ? 'anual' : 'mensal';

  const baseUrl = env.baseUrl;
  const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
  const successUrl = env.mercadoPago.successUrl || `${baseUrl}/payments/success`;
  const failureUrl = env.mercadoPago.failureUrl || `${baseUrl}/payments/failure`;
  const pendingUrl = `${baseUrl}/payments/pending`;

  // MercadoPago rejects localhost back_urls — omit them in local dev
  const backUrlsConfig = isLocalhost
    ? {}
    : {
        back_urls: {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        },
        auto_return: 'approved' as const,
      };

  const mpPreference = await preference.create({
    body: {
      items: [
        {
          id: plan.id,
          title: `CortAI ${plan.name} - ${periodLabel}`,
          description: plan.description,
          quantity: 1,
          unit_price: price,
          currency_id: 'BRL',
        },
      ],
      payer: {
        email: input.userEmail,
        name: input.userName,
      },
      external_reference: externalRef,
      ...backUrlsConfig,
      notification_url: isLocalhost ? undefined : `${baseUrl}/webhooks/mercadopago`,
    },
  });

  // Insert subscription as pending
  const subId = randomUUID();
  const periodEnd = getPeriodEnd(input.billingCycle);
  const { rows } = await pool.query(
    `INSERT INTO subscriptions (id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, mp_subscription_id, mp_external_reference)
     VALUES ($1, $2, $3, 'pending', $4, NOW(), $5, $6, $7)
     RETURNING *`,
    [subId, input.userId, plan.id, input.billingCycle, periodEnd, mpPreference.id, externalRef]
  );

  // Insert pending payment
  await pool.query(
    `INSERT INTO payments (id, subscription_id, user_id, amount, currency, status, mp_preference_id, mp_external_reference, description)
     VALUES ($1, $2, $3, $4, 'BRL', 'pending', $5, $6, $7)`,
    [randomUUID(), subId, input.userId, price, mpPreference.id, externalRef, `CortAI ${plan.name} - ${periodLabel}`]
  );

  const checkoutUrl = env.mercadoPago.sandboxMode
    ? mpPreference.sandbox_init_point!
    : mpPreference.init_point!;

  logger.info(
    { userId: input.userId, planId: plan.id, preferenceId: mpPreference.id, sandbox: env.mercadoPago.sandboxMode },
    'MercadoPago preference created'
  );

  return {
    subscription: rows[0],
    checkoutUrl,
    preferenceId: mpPreference.id!,
  };
}

export async function cancelSubscription(subscriptionId: string, reason?: string): Promise<Subscription> {
  const { rows } = await pool.query(
    `UPDATE subscriptions
     SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [subscriptionId, reason || null]
  );

  if (!rows[0]) {
    throw new Error('Assinatura não encontrada');
  }

  logger.info({ subscriptionId, reason }, 'Subscription cancelled');
  return rows[0];
}

// ============================================
// Payments
// ============================================

export async function createPayment(input: CreatePaymentInput) {
  return createSubscription(input);
}

export async function createPixPayment(input: CreatePaymentInput): Promise<{
  subscription: Subscription;
  paymentId: string;
  status: string;
  pixQrCode: string;
  pixQrCodeBase64: string;
  pixCopyPaste: string;
  expiresAt: string;
}> {
  const plan = await getPlanById(input.planId);
  if (!plan) throw new Error(`Plano não encontrado: ${input.planId}`);

  const config = getMpConfig();
  const paymentClient = new MPPaymentClient(config);
  const price = getPrice(plan, input.billingCycle);
  const externalRef = `pix_${randomUUID().replace(/-/g, '')}`;
  const periodLabel = input.billingCycle === 'yearly' ? 'anual' : 'mensal';

  // Create real MercadoPago PIX payment
  const mpPayment = await paymentClient.create({
    body: {
      transaction_amount: price,
      description: `CortAI ${plan.name} - ${periodLabel}`,
      payment_method_id: 'pix',
      payer: {
        email: input.userEmail,
        first_name: input.userName,
      },
      external_reference: externalRef,
      notification_url: `${env.baseUrl}/webhooks/mercadopago`,
    },
  });

  const pixData = mpPayment.point_of_interaction?.transaction_data;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Create subscription (pending)
  const subId = randomUUID();
  const periodEnd = getPeriodEnd(input.billingCycle);
  const { rows: subRows } = await pool.query(
    `INSERT INTO subscriptions (id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, mp_external_reference)
     VALUES ($1, $2, $3, 'pending', $4, NOW(), $5, $6)
     RETURNING *`,
    [subId, input.userId, plan.id, input.billingCycle, periodEnd, externalRef]
  );

  // Store payment with PIX data
  const paymentId = randomUUID();
  await pool.query(
    `INSERT INTO payments (id, subscription_id, user_id, amount, currency, status, mp_payment_id, mp_external_reference, mp_payment_method, mp_payment_type, description, pix_qr_code, pix_qr_code_base64, pix_expiration)
     VALUES ($1, $2, $3, $4, 'BRL', 'pending', $5, $6, 'pix', 'bank_transfer', $7, $8, $9, $10)`,
    [
      paymentId, subId, input.userId, price,
      mpPayment.id?.toString(), externalRef,
      `CortAI ${plan.name} - ${periodLabel}`,
      pixData?.qr_code || '',
      pixData?.qr_code_base64 || '',
      expiresAt,
    ]
  );

  logger.info({ userId: input.userId, mpPaymentId: mpPayment.id, planId: plan.id }, 'PIX payment created');

  return {
    subscription: subRows[0],
    paymentId,
    status: mpPayment.status || 'pending',
    pixQrCode: pixData?.qr_code || '',
    pixQrCodeBase64: pixData?.qr_code_base64 || '',
    pixCopyPaste: pixData?.qr_code || '',
    expiresAt,
  };
}

export async function getPaymentStatus(paymentId: string): Promise<{
  id: string;
  status: string;
  status_detail: string;
}> {
  const { rows } = await pool.query(
    'SELECT id, status, COALESCE(failure_reason, status) as status_detail FROM payments WHERE id = $1',
    [paymentId]
  );

  if (!rows[0]) {
    return { id: paymentId, status: 'not_found', status_detail: 'not_found' };
  }

  return rows[0];
}

export async function getUserPayments(userId: string) {
  const { rows } = await pool.query(
    'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

// ============================================
// Webhook
// ============================================

export async function handleWebhook(payload: any): Promise<{ processed: boolean; type?: string; action?: string }> {
  logger.info({ type: payload?.type, action: payload?.action, data: payload?.data }, 'MercadoPago webhook received');

  try {
    // payment.created or payment.updated
    if (payload?.type === 'payment' && payload?.data?.id) {
      const config = getMpConfig();
      const paymentClient = new MPPaymentClient(config);
      const mpPayment = await paymentClient.get({ id: Number(payload.data.id) });

      if (!mpPayment) {
        logger.warn({ mpPaymentId: payload.data.id }, 'Payment not found in MercadoPago');
        return { processed: false };
      }

      const mpPaymentId = mpPayment.id?.toString();
      const externalRef = mpPayment.external_reference;
      const mpStatus = mpPayment.status; // approved, pending, rejected, etc

      logger.info({ mpPaymentId, externalRef, mpStatus }, 'Processing webhook payment update');

      // Update payment record
      await pool.query(
        `UPDATE payments
         SET status = $1, mp_payment_id = $2, mp_payment_method = $3, mp_payment_type = $4,
             paid_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE paid_at END,
             updated_at = NOW()
         WHERE mp_external_reference = $5`,
        [mpStatus, mpPaymentId, mpPayment.payment_method_id, mpPayment.payment_type_id, externalRef]
      );

      // If approved, activate the subscription
      if (mpStatus === 'approved') {
        await pool.query(
          `UPDATE subscriptions
           SET status = 'active', updated_at = NOW()
           WHERE mp_external_reference = $1 AND status = 'pending'`,
          [externalRef]
        );
        logger.info({ externalRef }, 'Subscription activated via webhook');
      }

      return { processed: true, type: payload.type, action: payload.action };
    }

    return { processed: true, type: payload?.type, action: payload?.action };
  } catch (error: any) {
    logger.error({ error: error.message, payload }, 'Webhook processing error');
    return { processed: false };
  }
}

// ============================================
// Usage / Limits
// ============================================

export async function checkUserLimits(userId: string, metric: UsageMetric): Promise<UsageResponse> {
  try {
    if (await isUnlimitedAdminUserId(userId)) {
      return {
        planName: 'Admin Ilimitado',
        currentUsage: 0,
        maxAllowed: UNLIMITED_MAX_ALLOWED,
        canUse: true,
        subscription: null,
      };
    }

    const sub = await getUserSubscription(userId);

    // No active subscription: use free plan quotas + usage_records monthly aggregation.
    if (!sub) {
      const freePlan = await getPlanById('plan_free');
      const maxAllowed = metric === 'clip'
        ? freePlan?.clipQuota || 5
        : freePlan?.minuteQuota || 30;

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0)::INT AS total
         FROM usage_records
         WHERE user_id = $1
           AND usage_type = $2
           AND created_at >= $3`,
        [userId, metric, monthStart]
      );

      const currentUsage = Number(rows[0]?.total || 0);
      return {
        planName: freePlan?.name || 'Grátis',
        currentUsage,
        maxAllowed,
        canUse: currentUsage < maxAllowed,
        subscription: null,
      };
    }

    const plan = await getPlanById(sub.plan_id);
    const maxAllowed = metric === 'clip'
      ? plan?.clipQuota || 5
      : plan?.minuteQuota || 30;
    const currentUsage = metric === 'clip' ? sub.clips_used : sub.minutes_used;

    return {
      planName: plan?.name || sub.plan_name || 'Desconhecido',
      currentUsage,
      maxAllowed,
      canUse: currentUsage < maxAllowed,
      subscription: sub,
    };
  } catch (error: any) {
    logger.error({ userId, metric, error: error?.message }, 'Failed to check user limits; using fallback');
    return {
      planName: 'Grátis',
      currentUsage: 0,
      maxAllowed: metric === 'clip' ? 5 : 30,
      canUse: true,
      subscription: null,
    };
  }
}

export async function incrementUsage(
  userId: string,
  metric: UsageMetric,
  amount: number,
  idempotencyKey?: string,
  source = 'unknown'
): Promise<void> {
  if (await isUnlimitedAdminUserId(userId)) {
    logger.info({ userId, metric, amount }, 'Skipping usage increment for unlimited admin');
    return;
  }

  // Get active subscription
  const sub = await getUserSubscription(userId);

  const periodStart = sub?.current_period_start || new Date().toISOString();
  const periodEnd = sub?.current_period_end || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  // Insert usage record (idempotency via reference_id)
  if (idempotencyKey) {
    const { rows: existing } = await pool.query(
      'SELECT id FROM usage_records WHERE user_id = $1 AND usage_type = $2 AND reference_id = $3',
      [userId, metric, idempotencyKey]
    );
    if (existing.length > 0) return;
  }

  await pool.query(
    `INSERT INTO usage_records (id, user_id, subscription_id, usage_type, quantity, reference_id, reference_type, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [randomUUID(), userId, sub?.id || null, metric, amount, idempotencyKey || null, source, periodStart, periodEnd]
  );

  // Also update the subscription's inline counters
  if (sub) {
    const col = metric === 'clip' ? 'clips_used' : 'minutes_used';
    await pool.query(
      `UPDATE subscriptions SET ${col} = ${col} + $1, updated_at = NOW() WHERE id = $2`,
      [amount, sub.id]
    );
  }

  logger.info({ userId, metric, amount, source }, 'Usage incremented');
}
