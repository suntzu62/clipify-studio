import { MercadoPagoConfig, Payment, Preference, PreApproval } from 'mercadopago';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { pool } from './database.service.js';
import { redis } from '../config/redis.js';

const logger = createLogger('mercadopago');
const DEV_UNLIMITED_MAX = 1_000_000;
const devUnlimitedUserCache = new Map<string, boolean>();

// Redis cache helpers
const CACHE_TTL_SUBSCRIPTION = 300; // 5 minutes
const CACHE_TTL_PLAN = 1800; // 30 minutes

async function getCached<T>(key: string): Promise<T | undefined> {
  try {
    const data = await redis.get(key);
    if (data) return JSON.parse(data) as T;
  } catch {
    // Redis unavailable — fall through to DB
  }
  return undefined;
}

async function setCache(key: string, value: unknown, ttl: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  } catch {
    // Redis unavailable — ignore
  }
}

async function delCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // Redis unavailable — ignore
  }
}

async function isDevUnlimitedUserId(userId: string): Promise<boolean> {
  if (!env.isDevelopment) return false;
  if (!env.devUnlimitedEmails.length) return false;

  const cached = devUnlimitedUserCache.get(userId);
  if (cached !== undefined) return cached;

  try {
    const result = await pool.query('SELECT email FROM profiles WHERE id = $1', [userId]);
    const email = String(result.rows?.[0]?.email || '').trim().toLowerCase();
    const allowed = Boolean(email) && env.devUnlimitedEmails.includes(email);
    devUnlimitedUserCache.set(userId, allowed);
    return allowed;
  } catch (error: any) {
    logger.warn({ userId, error: error?.message }, 'Failed to check dev unlimited user');
    devUnlimitedUserCache.set(userId, false);
    return false;
  }
}

// Inicializar cliente Mercado Pago
const mpClient = env.mercadoPago.accessToken
  ? new MercadoPagoConfig({ accessToken: env.mercadoPago.accessToken })
  : null;

// Tipos
export interface CreateSubscriptionParams {
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  billingCycle: 'monthly' | 'yearly';
}

export interface CreatePaymentParams {
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  paymentMethod?: 'pix' | 'credit_card' | 'boleto';
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  clips_per_month: number;
  minutes_per_month: number;
  features: string[];
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  current_period_start: Date;
  current_period_end: Date;
  clips_used: number;
  minutes_used: number;
  is_trial?: boolean;
  // Campos do JOIN com plans
  plan_name?: string;
  clips_per_month?: number;
  minutes_per_month?: number;
  features?: string[];
  has_watermark?: boolean;
  has_priority_processing?: boolean;
  has_api_access?: boolean;
  has_custom_branding?: boolean;
}

// ==============================================================================
// PLANOS
// ==============================================================================

export async function getPlans(): Promise<Plan[]> {
  const result = await pool.query(`
    SELECT id, name, description, price_monthly, price_yearly,
           clips_per_month, minutes_per_month, max_video_duration,
           max_clip_duration, features, has_watermark, has_priority_processing,
           is_active, sort_order
    FROM plans
    WHERE is_active = true
    ORDER BY sort_order ASC
  `);
  return result.rows;
}

export async function getPlanById(planId: string): Promise<Plan | null> {
  const cacheKey = `plan:${planId}`;
  const cached = await getCached<Plan>(cacheKey);
  if (cached !== undefined) return cached;

  const result = await pool.query('SELECT * FROM plans WHERE id = $1', [planId]);
  const plan = result.rows[0] || null;
  if (plan) await setCache(cacheKey, plan, CACHE_TTL_PLAN);
  return plan;
}

// ==============================================================================
// ASSINATURAS
// ==============================================================================

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const cacheKey = `sub:${userId}`;
  const cached = await getCached<Subscription | null>(cacheKey);
  if (cached !== undefined) return cached;

  const result = await pool.query(`
    SELECT s.*, p.name as plan_name, p.clips_per_month, p.minutes_per_month,
           p.features, p.has_watermark, p.has_priority_processing
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = $1
      AND s.status IN ('active', 'authorized')
      AND s.current_period_end > NOW()
    ORDER BY s.created_at DESC
    LIMIT 1
  `, [userId]);

  const subscription = result.rows[0] || null;
  await setCache(cacheKey, subscription, CACHE_TTL_SUBSCRIPTION);
  return subscription;
}

export async function createSubscription(params: CreateSubscriptionParams) {
  const { userId, userEmail, userName, planId, billingCycle } = params;

  // Buscar plano
  const plan = await getPlanById(planId);
  if (!plan) {
    throw new Error('Plano não encontrado');
  }

  const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

  if (price === 0) {
    // Plano gratuito - criar assinatura direto
    return createFreeSubscription(userId, planId);
  }

  if (!mpClient) {
    throw new Error('Mercado Pago não configurado');
  }

  // Calcular período
  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  // Criar external_reference único
  const externalReference = `sub_${userId}_${Date.now()}`;

  // Webhooks require a public backend URL; redirects require a public frontend URL.
  const hasPublicBackendUrl =
    Boolean(env.baseUrl)
    && !env.baseUrl.includes('localhost')
    && !env.baseUrl.includes('127.0.0.1');
  const hasPublicFrontendUrl =
    Boolean(env.frontendUrl)
    && !env.frontendUrl.includes('localhost')
    && !env.frontendUrl.includes('127.0.0.1');
  const notificationUrl = hasPublicBackendUrl ? `${env.baseUrl}/webhooks/mercadopago` : undefined;

  // Criar preferência de pagamento (checkout)
  const preference = new Preference(mpClient);

  const preferenceData = await preference.create({
    body: {
      items: [
        {
          id: planId,
          title: `${plan.name} - ${billingCycle === 'yearly' ? 'Anual' : 'Mensal'}`,
          description: plan.description || `Assinatura ${plan.name} CortAI`,
          quantity: 1,
          unit_price: Number(price),
          currency_id: 'BRL',
        },
      ],
      payer: {
        email: userEmail,
        name: userName,
      },
      // back_urls e auto_return só funcionam com URLs públicas (não localhost)
      ...(hasPublicFrontendUrl && {
        back_urls: {
          success: `${env.frontendUrl}/billing?payment=success`,
          failure: `${env.frontendUrl}/billing?payment=failure`,
          pending: `${env.frontendUrl}/billing?payment=pending`,
        },
        auto_return: 'approved',
      }),
      external_reference: externalReference,
      ...(notificationUrl && { notification_url: notificationUrl }),
      statement_descriptor: 'CORTAI',
      expires: true,
      expiration_date_from: now.toISOString(),
      expiration_date_to: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24h
    },
  });

  // Criar registro de assinatura pendente
  const subscriptionResult = await pool.query(`
    INSERT INTO subscriptions (
      user_id, plan_id, status, billing_cycle,
      current_period_start, current_period_end,
      mp_external_reference
    )
    VALUES ($1, $2, 'pending', $3, $4, $5, $6)
    RETURNING *
  `, [userId, planId, billingCycle, now, periodEnd, externalReference]);

  const subscription = subscriptionResult.rows[0];

  logger.info({
    userId,
    planId,
    subscriptionId: subscription.id,
    preferenceId: preferenceData.id,
  }, 'Preferência de pagamento criada');

  return {
    subscription,
    checkoutUrl: preferenceData.init_point,
    sandboxUrl: preferenceData.sandbox_init_point,
    preferenceId: preferenceData.id,
  };
}

async function createFreeSubscription(userId: string, planId: string) {
  // Verificar se já tem assinatura ativa
  const existing = await getUserSubscription(userId);
  if (existing && existing.plan_id !== 'plan_free') {
    throw new Error('Usuário já possui uma assinatura ativa');
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  // Cancelar assinaturas anteriores
  await pool.query(`
    UPDATE subscriptions
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE user_id = $1 AND status IN ('active', 'pending')
  `, [userId]);

  // Criar nova assinatura free
  const result = await pool.query(`
    INSERT INTO subscriptions (
      user_id, plan_id, status, billing_cycle,
      current_period_start, current_period_end
    )
    VALUES ($1, $2, 'active', 'monthly', $3, $4)
    RETURNING *
  `, [userId, planId, now, periodEnd]);

  logger.info({ userId, planId }, 'Assinatura gratuita criada');

  return {
    subscription: result.rows[0],
    checkoutUrl: null,
  };
}

// ==============================================================================
// TRIAL (Free Trial)
// ==============================================================================

export async function startFreeTrial(userId: string, trialDays: number = 7) {
  // Prevent multiple trials
  const hasTrial = await pool.query(
    `SELECT 1 FROM subscriptions WHERE user_id = $1 AND is_trial = true LIMIT 1`,
    [userId]
  );

  if ((hasTrial.rowCount ?? 0) > 0) {
    throw new Error('TRIAL_ALREADY_USED');
  }

  // If user already has an active paid subscription, do not allow trial
  const existing = await getUserSubscription(userId);
  if (existing && existing.plan_id !== 'plan_free') {
    throw new Error('USER_ALREADY_SUBSCRIBED');
  }

  // Prefer a hidden trial plan when available, otherwise fallback to Pro
  const trialPlan = (await getPlanById('plan_trial')) || (await getPlanById('plan_pro'));
  if (!trialPlan) {
    throw new Error('PLANO_NAO_ENCONTRADO');
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + Math.max(1, trialDays));

  // Cancel previous subscriptions (including plan_free) to keep a single "current" subscription
  await pool.query(
    `
    UPDATE subscriptions
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancel_reason = 'trial_started'
    WHERE user_id = $1
      AND status IN ('active', 'pending', 'authorized')
    `,
    [userId]
  );

  const result = await pool.query(
    `
    INSERT INTO subscriptions (
      user_id,
      plan_id,
      status,
      billing_cycle,
      current_period_start,
      current_period_end,
      is_trial
    )
    VALUES ($1, $2, 'active', 'monthly', $3, $4, true)
    RETURNING *
    `,
    [userId, trialPlan.id, now, periodEnd]
  );

  logger.info({ userId, planId: trialPlan.id, periodEnd }, 'Free trial started');

  return result.rows[0];
}

// ==============================================================================
// PAGAMENTO ÚNICO (PIX, Cartão, Boleto)
// ==============================================================================

export async function createPayment(params: CreatePaymentParams) {
  const { userId, userEmail, userName, planId, billingCycle, paymentMethod } = params;

  const plan = await getPlanById(planId);
  if (!plan) {
    throw new Error('Plano não encontrado');
  }

  const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

  if (price === 0) {
    return createFreeSubscription(userId, planId);
  }

  if (!mpClient) {
    throw new Error('Mercado Pago não configurado');
  }

  const externalReference = `pay_${userId}_${Date.now()}`;

  // Calcular período
  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  // Criar assinatura pendente primeiro
  const subscriptionResult = await pool.query(`
    INSERT INTO subscriptions (
      user_id, plan_id, status, billing_cycle,
      current_period_start, current_period_end,
      mp_external_reference
    )
    VALUES ($1, $2, 'pending', $3, $4, $5, $6)
    RETURNING *
  `, [userId, planId, billingCycle, now, periodEnd, externalReference]);

  const subscription = subscriptionResult.rows[0];

  // Criar preferência
  const preference = new Preference(mpClient);

  // Webhooks require a public backend URL; redirects require a public frontend URL.
  const hasPublicBackendUrl =
    Boolean(env.baseUrl)
    && !env.baseUrl.includes('localhost')
    && !env.baseUrl.includes('127.0.0.1');
  const hasPublicFrontendUrl =
    Boolean(env.frontendUrl)
    && !env.frontendUrl.includes('localhost')
    && !env.frontendUrl.includes('127.0.0.1');

  // Debug: log URLs
  logger.info({
    frontendUrl: env.frontendUrl,
    baseUrl: env.baseUrl,
    hasPublicBackendUrl,
    hasPublicFrontendUrl,
  }, 'Creating preference with URLs');

  const preferenceBody: any = {
    items: [
      {
        id: planId,
        title: `CortAI ${plan.name} - ${billingCycle === 'yearly' ? 'Anual' : 'Mensal'}`,
        description: plan.description || `Assinatura ${plan.name}`,
        quantity: 1,
        unit_price: Number(price),
        currency_id: 'BRL',
      },
    ],
    payer: {
      email: userEmail,
      name: userName,
    },
    // back_urls e auto_return só funcionam com URLs públicas (não localhost)
    ...(hasPublicFrontendUrl && {
      back_urls: {
        success: `${env.frontendUrl}/billing?payment=success&subscription_id=${subscription.id}`,
        failure: `${env.frontendUrl}/billing?payment=failure&subscription_id=${subscription.id}`,
        pending: `${env.frontendUrl}/billing?payment=pending&subscription_id=${subscription.id}`,
      },
      auto_return: 'approved',
    }),
    ...(hasPublicBackendUrl && { notification_url: `${env.baseUrl}/webhooks/mercadopago` }),
    external_reference: externalReference,
    statement_descriptor: 'CORTAI',
  };

  // Configurar método de pagamento específico
  if (paymentMethod === 'pix') {
    preferenceBody.payment_methods = {
      excluded_payment_types: [
        { id: 'credit_card' },
        { id: 'debit_card' },
        { id: 'ticket' },
      ],
    };
  } else if (paymentMethod === 'credit_card') {
    preferenceBody.payment_methods = {
      excluded_payment_types: [
        { id: 'bank_transfer' },
        { id: 'ticket' },
      ],
      installments: 12,
    };
  } else if (paymentMethod === 'boleto') {
    preferenceBody.payment_methods = {
      excluded_payment_types: [
        { id: 'credit_card' },
        { id: 'debit_card' },
        { id: 'bank_transfer' },
      ],
    };
  }

  logger.info({ preferenceBody: JSON.stringify(preferenceBody, null, 2) }, 'Sending preference body to MercadoPago');

  let preferenceData;
  try {
    preferenceData = await preference.create({ body: preferenceBody });
  } catch (error: any) {
    logger.error({
      error: error.message,
      cause: error.cause,
      statusCode: error.statusCode,
      body: error.body,
    }, 'MercadoPago preference creation failed');
    throw error;
  }

  // Registrar pagamento pendente
  await pool.query(`
    INSERT INTO payments (
      subscription_id, user_id, amount, currency, status,
      mp_preference_id, mp_external_reference, description
    )
    VALUES ($1, $2, $3, 'BRL', 'pending', $4, $5, $6)
  `, [
    subscription.id,
    userId,
    price,
    preferenceData.id,
    externalReference,
    `${plan.name} - ${billingCycle === 'yearly' ? 'Anual' : 'Mensal'}`,
  ]);

  logger.info({
    userId,
    planId,
    subscriptionId: subscription.id,
    preferenceId: preferenceData.id,
    paymentMethod,
  }, 'Pagamento criado');

  return {
    subscription,
    checkoutUrl: preferenceData.init_point,
    sandboxUrl: preferenceData.sandbox_init_point,
    preferenceId: preferenceData.id,
  };
}

// ==============================================================================
// PIX DIRETO (sem redirect)
// ==============================================================================

export async function createPixPayment(params: CreatePaymentParams & { payerCpf?: string }) {
  const { userId, userEmail, userName, planId, billingCycle, payerCpf } = params;

  const plan = await getPlanById(planId);
  if (!plan) {
    throw new Error('Plano não encontrado');
  }

  const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

  if (!mpClient) {
    throw new Error('Mercado Pago não configurado');
  }

  const externalReference = `pix_${userId}_${Date.now()}`;

  // Calcular período
  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  // Criar assinatura pendente
  const subscriptionResult = await pool.query(`
    INSERT INTO subscriptions (
      user_id, plan_id, status, billing_cycle,
      current_period_start, current_period_end,
      mp_external_reference
    )
    VALUES ($1, $2, 'pending', $3, $4, $5, $6)
    RETURNING *
  `, [userId, planId, billingCycle, now, periodEnd, externalReference]);

  const subscription = subscriptionResult.rows[0];

  // Criar pagamento PIX direto
  const payment = new Payment(mpClient);

  const pixExpiration = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutos

  // CPF para pagamento PIX (obrigatório no Brasil)
  // Em ambiente de teste, usar CPF de teste do Mercado Pago se não fornecido
  const cpfNumber = payerCpf || (env.isDevelopment ? '19119119100' : '');

  if (!cpfNumber) {
    throw new Error('CPF do pagador é obrigatório para pagamentos PIX');
  }

  // notification_url só funciona com URLs públicas (não localhost)
  const isPublicUrl = env.baseUrl && !env.baseUrl.includes('localhost') && !env.baseUrl.includes('127.0.0.1');
  const notificationUrl = isPublicUrl ? `${env.baseUrl}/webhooks/mercadopago` : undefined;

  const pixBody = {
    transaction_amount: Number(price),
    description: `CortAI ${plan.name} - ${billingCycle === 'yearly' ? 'Anual' : 'Mensal'}`,
    payment_method_id: 'pix',
    payer: {
      email: userEmail,
      first_name: userName.split(' ')[0],
      last_name: userName.split(' ').slice(1).join(' ') || userName,
      identification: {
        type: 'CPF',
        number: cpfNumber.replace(/\D/g, ''), // Remove formatação
      },
    },
    external_reference: externalReference,
    ...(notificationUrl && { notification_url: notificationUrl }),
    date_of_expiration: pixExpiration.toISOString(),
  };

  logger.info({ pixBody: JSON.stringify(pixBody, null, 2) }, 'Creating PIX payment');

  let paymentData;
  try {
    paymentData = await payment.create({ body: pixBody });
  } catch (error: any) {
    logger.error({
      error: error.message,
      cause: error.cause,
      statusCode: error.statusCode,
      body: error.body,
    }, 'MercadoPago PIX payment creation failed');
    throw error;
  }

  // Extrair dados do PIX
  const pixInfo = paymentData.point_of_interaction?.transaction_data;

  // Registrar pagamento
  await pool.query(`
    INSERT INTO payments (
      subscription_id, user_id, amount, currency, status,
      mp_payment_id, mp_external_reference, mp_payment_method,
      description, pix_qr_code, pix_qr_code_base64, pix_expiration
    )
    VALUES ($1, $2, $3, 'BRL', $4, $5, $6, 'pix', $7, $8, $9, $10)
  `, [
    subscription.id,
    userId,
    price,
    paymentData.status,
    String(paymentData.id),
    externalReference,
    `${plan.name} - ${billingCycle === 'yearly' ? 'Anual' : 'Mensal'}`,
    pixInfo?.qr_code || null,
    pixInfo?.qr_code_base64 || null,
    pixExpiration,
  ]);

  logger.info({
    userId,
    planId,
    subscriptionId: subscription.id,
    paymentId: paymentData.id,
  }, 'Pagamento PIX criado');

  return {
    subscription,
    paymentId: paymentData.id,
    status: paymentData.status,
    pixQrCode: pixInfo?.qr_code,
    pixQrCodeBase64: pixInfo?.qr_code_base64,
    pixCopyPaste: pixInfo?.qr_code,
    expiresAt: pixExpiration,
  };
}

// ==============================================================================
// WEBHOOKS
// ==============================================================================

export async function handleWebhook(data: any) {
  const { type, data: eventData } = data;

  logger.info({ type, eventData }, 'Webhook recebido');

  if (type === 'payment') {
    return handlePaymentWebhook(eventData.id);
  }

  if (type === 'subscription_preapproval') {
    return handleSubscriptionWebhook(eventData.id);
  }

  logger.warn({ type }, 'Tipo de webhook não tratado');
  return { handled: false };
}

async function handlePaymentWebhook(paymentId: string) {
  if (!mpClient) {
    throw new Error('Mercado Pago não configurado');
  }

  // Buscar detalhes do pagamento
  const payment = new Payment(mpClient);
  const paymentData = await payment.get({ id: paymentId });

  logger.info({
    paymentId,
    status: paymentData.status,
    externalReference: paymentData.external_reference,
  }, 'Processando webhook de pagamento');

  // Atualizar pagamento no banco
  await pool.query(`
    UPDATE payments
    SET status = $1,
        mp_payment_id = $2,
        mp_payment_method = $3,
        mp_payment_type = $4,
        paid_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE paid_at END,
        updated_at = NOW()
    WHERE mp_external_reference = $5 OR mp_payment_id = $2
  `, [
    paymentData.status,
    String(paymentData.id),
    paymentData.payment_method_id,
    paymentData.payment_type_id,
    paymentData.external_reference,
  ]);

  // Se pagamento aprovado, ativar assinatura
  if (paymentData.status === 'approved') {
    await pool.query(`
      UPDATE subscriptions
      SET status = 'active',
          updated_at = NOW()
      WHERE mp_external_reference = $1 AND status = 'pending'
    `, [paymentData.external_reference]);

    logger.info({
      paymentId,
      externalReference: paymentData.external_reference,
    }, 'Assinatura ativada');
  }

  return { handled: true, status: paymentData.status };
}

async function handleSubscriptionWebhook(preapprovalId: string) {
  if (!mpClient) {
    throw new Error('Mercado Pago não configurado');
  }

  const preapproval = new PreApproval(mpClient);
  const preapprovalData = await preapproval.get({ id: preapprovalId });

  logger.info({
    preapprovalId,
    status: preapprovalData.status,
  }, 'Processando webhook de assinatura');

  // Mapear status do Mercado Pago para nosso status
  const statusMap: Record<string, string> = {
    pending: 'pending',
    authorized: 'active',
    paused: 'paused',
    cancelled: 'cancelled',
  };

  const newStatus = statusMap[preapprovalData.status || ''] || preapprovalData.status;

  await pool.query(`
    UPDATE subscriptions
    SET status = $1,
        mp_preapproval_id = $2,
        mp_payer_id = $3,
        updated_at = NOW()
    WHERE mp_external_reference = $4 OR mp_preapproval_id = $2
  `, [
    newStatus,
    preapprovalId,
    preapprovalData.payer_id,
    preapprovalData.external_reference,
  ]);

  return { handled: true, status: newStatus };
}

// ==============================================================================
// CANCELAMENTO
// ==============================================================================

export async function cancelSubscription(subscriptionId: string, reason?: string) {
  const result = await pool.query(`
    UPDATE subscriptions
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancel_reason = $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [subscriptionId, reason || 'Cancelado pelo usuário']);

  if (result.rows.length === 0) {
    throw new Error('Assinatura não encontrada');
  }

  logger.info({ subscriptionId, reason }, 'Assinatura cancelada');

  return result.rows[0];
}

// ==============================================================================
// USO E LIMITES
// ==============================================================================

export async function checkUserLimits(userId: string, usageType: 'clip' | 'minute') {
  if (await isDevUnlimitedUserId(userId)) {
    return {
      canUse: true,
      currentUsage: 0,
      maxAllowed: DEV_UNLIMITED_MAX,
      planName: 'Dev (Ilimitado)',
      subscription: null,
    };
  }

  // Buscar assinatura ativa
  const subscription = await getUserSubscription(userId);

  // Se não tem assinatura, usar limites do plano free
  if (!subscription) {
    const freePlan = await getPlanById('plan_free');
    const maxAllowed = usageType === 'clip'
      ? freePlan?.clips_per_month || 5
      : freePlan?.minutes_per_month || 30;

    // Contar uso atual do mês (sem assinatura)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const usageResult = await pool.query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM usage_records
      WHERE user_id = $1
        AND usage_type = $2
        AND created_at >= $3
    `, [userId, usageType, monthStart]);

    const currentUsage = parseInt(usageResult.rows[0].total) || 0;

    return {
      canUse: currentUsage < maxAllowed,
      currentUsage,
      maxAllowed,
      planName: 'Grátis',
      subscription: null,
    };
  }

  const currentUsage = usageType === 'clip'
    ? subscription.clips_used
    : subscription.minutes_used;

  const maxAllowed = usageType === 'clip'
    ? (subscription.clips_per_month || 5)
    : (subscription.minutes_per_month || 30);

  return {
    canUse: currentUsage < maxAllowed,
    currentUsage,
    maxAllowed,
    planName: subscription.plan_name || 'Desconhecido',
    subscription,
  };
}

export async function incrementUsage(
  userId: string,
  usageType: 'clip' | 'minute',
  quantity: number = 1,
  referenceId?: string,
  referenceType?: string,
  idempotencyKey?: string
) {
  const subscription = await getUserSubscription(userId);
  const normalizedIdempotencyKey = typeof idempotencyKey === 'string' && idempotencyKey.trim()
    ? idempotencyKey.trim()
    : null;

  // Registrar uso
  const now = new Date();
  const periodStart = subscription?.current_period_start || new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = subscription?.current_period_end || new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const insertResult = await pool.query(`
    INSERT INTO usage_records (
      user_id, subscription_id, usage_type, quantity,
      reference_id, reference_type, period_start, period_end,
      idempotency_key
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (user_id, usage_type, idempotency_key) DO NOTHING
    RETURNING id
  `, [
    userId,
    subscription?.id || null,
    usageType,
    quantity,
    referenceId || null,
    referenceType || null,
    periodStart,
    periodEnd,
    normalizedIdempotencyKey,
  ]);

  const inserted = insertResult.rows.length > 0;
  if (!inserted) {
    logger.info({ userId, usageType, idempotencyKey: normalizedIdempotencyKey }, 'Uso já registrado (idempotente)');
    return;
  }

  // Atualizar contador na assinatura
  if (subscription) {
    const field = usageType === 'clip' ? 'clips_used' : 'minutes_used';
    await pool.query(`
      UPDATE subscriptions
      SET ${field} = ${field} + $1,
          updated_at = NOW()
      WHERE id = $2
    `, [quantity, subscription.id]);

    // Invalidate cached subscription so next check sees updated counters
    await delCache(`sub:${userId}`);
  }

  logger.info({ userId, usageType, quantity, idempotencyKey: normalizedIdempotencyKey }, 'Uso registrado');
}

// ==============================================================================
// CONSULTAS
// ==============================================================================

export async function getPaymentStatus(paymentId: string) {
  if (!mpClient) {
    throw new Error('Mercado Pago não configurado');
  }

  const payment = new Payment(mpClient);
  return await payment.get({ id: paymentId });
}

export async function getUserPayments(userId: string) {
  const result = await pool.query(`
    SELECT p.*, s.plan_id, pl.name as plan_name
    FROM payments p
    LEFT JOIN subscriptions s ON s.id = p.subscription_id
    LEFT JOIN plans pl ON pl.id = s.plan_id
    WHERE p.user_id = $1
    ORDER BY p.created_at DESC
  `, [userId]);

  return result.rows;
}

export async function getSubscriptionHistory(userId: string) {
  const result = await pool.query(`
    SELECT s.*, p.name as plan_name, p.price_monthly, p.price_yearly
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = $1
    ORDER BY s.created_at DESC
  `, [userId]);

  return result.rows;
}
