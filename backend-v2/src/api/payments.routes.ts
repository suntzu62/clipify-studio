import { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { authenticateJWT, optionalAuth } from '../middleware/auth.middleware.js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import * as mp from '../services/mercadopago.service.js';

const logger = createLogger('payments-routes');
const billingEnabled = Boolean(env.mercadoPago.accessToken && env.mercadoPago.publicKey);

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseSignatureHeader(signatureHeader: string): Record<string, string> {
  return signatureHeader
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) {
        return acc;
      }
      const key = entry.slice(0, separatorIndex).trim().toLowerCase();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function isMercadoPagoWebhookValid(request: FastifyRequest, body: unknown): boolean {
  const secret = env.mercadoPago.webhookSecret;
  if (!secret) {
    return true;
  }

  const signatureHeader = getHeaderValue(request.headers['x-signature']);
  if (!signatureHeader) {
    return false;
  }

  if (safeEqual(signatureHeader, secret)) {
    return true;
  }

  const parsedSignature = parseSignatureHeader(signatureHeader);
  const v1 = parsedSignature.v1;
  const ts = parsedSignature.ts;
  if (!v1 || !ts) {
    return false;
  }

  const query = (request.query || {}) as Record<string, unknown>;
  const queryDataId = query['data.id'] ?? (query.data as any)?.id;
  const bodyDataId = (body as any)?.data?.id;
  const requestId = getHeaderValue(request.headers['x-request-id']) || '';

  const idCandidates = [queryDataId, bodyDataId]
    .map((value) => (value == null ? '' : String(value).trim()))
    .filter(Boolean);

  for (const id of idCandidates) {
    const manifest = `id:${id};request-id:${requestId};ts:${ts};`;
    const digest = createHmac('sha256', secret).update(manifest).digest('hex');
    if (safeEqual(digest, v1)) {
      return true;
    }
  }

  const fallbackDigest = createHmac('sha256', secret)
    .update(JSON.stringify(body ?? {}))
    .digest('hex');
  return safeEqual(fallbackDigest, v1);
}

const DEFAULT_USAGE = {
  plan: 'free',
  status: 'active',
  minutesUsed: 0,
  minutesQuota: 30,
  minutesRemaining: 30,
  shortsUsed: 0,
  shortsQuota: 5,
  shortsRemaining: 5,
  periodEnd: null as string | null,
};

async function buildUsagePayload(userId?: string) {
  if (!userId) {
    return DEFAULT_USAGE;
  }

  const [clipLimits, minuteLimits] = await Promise.all([
    mp.checkUserLimits(userId, 'clip'),
    mp.checkUserLimits(userId, 'minute'),
  ]);

  const subscription = clipLimits.subscription || minuteLimits.subscription;
  const periodEndValue = subscription?.current_period_end;
  const periodEnd = typeof periodEndValue === 'string'
    ? periodEndValue
    : periodEndValue?.toISOString?.() ?? null;

  return {
    plan: clipLimits.planName || 'free',
    status: subscription?.status || 'active',
    minutesUsed: minuteLimits.currentUsage,
    minutesQuota: minuteLimits.maxAllowed,
    minutesRemaining: Math.max(0, minuteLimits.maxAllowed - minuteLimits.currentUsage),
    shortsUsed: clipLimits.currentUsage,
    shortsQuota: clipLimits.maxAllowed,
    shortsRemaining: Math.max(0, clipLimits.maxAllowed - clipLimits.currentUsage),
    periodEnd,
  };
}

export async function registerPaymentsRoutes(app: FastifyInstance) {
  // ============================================
  // PLANOS
  // ============================================

  // Listar todos os planos disponíveis
  app.get('/plans', async (_request, reply) => {
    try {
      const plans = await mp.getPlans();
      return reply.send(plans);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao listar planos');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erro ao listar planos',
      });
    }
  });

  // Obter plano específico
  app.get('/plans/:planId', async (request, reply) => {
    const { planId } = request.params as { planId: string };

    try {
      const plan = await mp.getPlanById(planId);

      if (!plan) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Plano não encontrado',
        });
      }

      return reply.send(plan);
    } catch (error: any) {
      logger.error({ error: error.message, planId }, 'Erro ao buscar plano');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erro ao buscar plano',
      });
    }
  });

  // ============================================
  // ASSINATURAS
  // ============================================

  // Obter assinatura atual do usuário
  app.get('/subscriptions/current', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const subscription = await mp.getUserSubscription(userId);

      if (!subscription) {
        // Retornar info do plano free
        const freePlan = await mp.getPlanById('plan_free');
        return reply.send({
          subscription: null,
          plan: freePlan,
          isFreeTier: true,
        });
      }

      const plan = await mp.getPlanById(subscription.plan_id) || await mp.getPlanById('plan_free');

      return reply.send({
        subscription,
        plan,
        isFreeTier: subscription.plan_id === 'plan_free',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao buscar assinatura');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erro ao buscar assinatura',
      });
    }
  });

  // Histórico de assinaturas
  app.get('/subscriptions/history', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const history = await mp.getSubscriptionHistory(userId);
      return reply.send(history);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao buscar histórico');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erro ao buscar histórico de assinaturas',
      });
    }
  });

  // ============================================
  // TRIAL (Free Trial)
  // ============================================

  app.post('/trial/start', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      if (!billingEnabled) {
        return reply.status(501).send({
          error: 'BILLING_DISABLED',
          message: 'Billing desativado no beta.',
        });
      }

      const userId = request.user!.userId;
      const subscription = await mp.startFreeTrial(userId, 7);
      const plan = await mp.getPlanById(subscription.plan_id) || await mp.getPlanById('plan_free');

      return reply.status(201).send({
        subscription,
        plan,
        message: 'Trial started successfully',
      });
    } catch (error: any) {
      const message = error?.message || 'unknown';
      logger.warn({ userId: request.user?.userId, error: message }, 'Failed to start trial');

      if (message === 'TRIAL_ALREADY_USED') {
        return reply.status(409).send({
          error: 'TRIAL_ALREADY_USED',
          message: 'Você já utilizou o teste grátis anteriormente.',
        });
      }

      if (message === 'USER_ALREADY_SUBSCRIBED') {
        return reply.status(409).send({
          error: 'USER_ALREADY_SUBSCRIBED',
          message: 'Você já possui uma assinatura ativa. O trial é apenas para novos usuários.',
        });
      }

      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erro ao iniciar o teste grátis',
      });
    }
  });

  // Criar nova assinatura (checkout redirect)
  app.post('/subscriptions', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const schema = z.object({
      planId: z.string(),
      billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
    });

    try {
      if (!billingEnabled) {
        return reply.status(501).send({
          error: 'BILLING_DISABLED',
          message: 'Billing desativado no beta.',
        });
      }

      const body = schema.parse(request.body);
      const userId = request.user!.userId;
      const userEmail = request.user!.email || 'user@example.com';
      const userName = request.user!.name || 'Usuário';

      const result = await mp.createSubscription({
        userId,
        userEmail,
        userName,
        planId: body.planId,
        billingCycle: body.billingCycle,
      });

      logger.info({
        userId,
        planId: body.planId,
        subscriptionId: result.subscription.id,
      }, 'Assinatura criada');

      // Verificar se é plano grátis (sem checkout)
      const checkoutUrl = 'sandboxUrl' in result
        ? (env.mercadoPago.sandboxMode ? result.sandboxUrl : result.checkoutUrl)
        : null;

      return reply.status(201).send({
        subscription: result.subscription,
        checkoutUrl,
        preferenceId: 'preferenceId' in result ? result.preferenceId : null,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao criar assinatura');

      if (error.message.includes('já possui')) {
        return reply.status(409).send({
          error: 'CONFLICT',
          message: error.message,
        });
      }

      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: error.message || 'Erro ao criar assinatura',
      });
    }
  });

  // Cancelar assinatura
  app.post('/subscriptions/:subscriptionId/cancel', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { subscriptionId } = request.params as { subscriptionId: string };
    const { reason } = (request.body as { reason?: string }) || {};

    try {
      const subscription = await mp.cancelSubscription(subscriptionId, reason);

      logger.info({ subscriptionId, reason }, 'Assinatura cancelada');

      return reply.send({
        message: 'Assinatura cancelada com sucesso',
        subscription,
      });
    } catch (error: any) {
      logger.error({ error: error.message, subscriptionId }, 'Erro ao cancelar');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: error.message || 'Erro ao cancelar assinatura',
      });
    }
  });

  // ============================================
  // PAGAMENTOS
  // ============================================

  // Criar pagamento (checkout redirect)
  app.post('/payments', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const schema = z.object({
      planId: z.string(),
      billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
      paymentMethod: z.enum(['pix', 'credit_card', 'boleto']).optional(),
    });

    try {
      if (!billingEnabled) {
        return reply.status(501).send({
          error: 'BILLING_DISABLED',
          message: 'Billing desativado no beta.',
        });
      }

      const body = schema.parse(request.body);
      const userId = request.user!.userId;
      const userEmail = request.user!.email || 'user@example.com';
      const userName = request.user!.name || 'Usuário';

      const result = await mp.createPayment({
        userId,
        userEmail,
        userName,
        planId: body.planId,
        billingCycle: body.billingCycle,
        paymentMethod: body.paymentMethod,
      });

      const checkoutUrl = 'sandboxUrl' in result
        ? (env.mercadoPago.sandboxMode ? result.sandboxUrl : result.checkoutUrl)
        : null;

      return reply.status(201).send({
        subscription: result.subscription,
        checkoutUrl,
        preferenceId: 'preferenceId' in result ? result.preferenceId : null,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao criar pagamento');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: error.message || 'Erro ao criar pagamento',
      });
    }
  });

  // Criar pagamento PIX direto (sem redirect)
  app.post('/payments/pix', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const schema = z.object({
      planId: z.string(),
      billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
    });

    try {
      if (!billingEnabled) {
        return reply.status(501).send({
          error: 'BILLING_DISABLED',
          message: 'Billing desativado no beta.',
        });
      }

      const body = schema.parse(request.body);
      const userId = request.user!.userId;
      const userEmail = request.user!.email || 'user@example.com';
      const userName = request.user!.name || 'Usuário';

      const result = await mp.createPixPayment({
        userId,
        userEmail,
        userName,
        planId: body.planId,
        billingCycle: body.billingCycle,
      });

      return reply.status(201).send({
        subscription: result.subscription,
        paymentId: result.paymentId,
        status: result.status,
        pix: {
          qrCode: result.pixQrCode,
          qrCodeBase64: result.pixQrCodeBase64,
          copyPaste: result.pixCopyPaste,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao criar pagamento PIX');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: error.message || 'Erro ao criar pagamento PIX',
      });
    }
  });

  // Verificar status do pagamento
  app.get('/payments/:paymentId/status', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { paymentId } = request.params as { paymentId: string };

    try {
      const status = await mp.getPaymentStatus(paymentId);

      return reply.send({
        paymentId,
        status: status.status,
        statusDetail: status.status_detail,
      });
    } catch (error: any) {
      logger.error({ error: error.message, paymentId }, 'Erro ao verificar status');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erro ao verificar status do pagamento',
      });
    }
  });

  // Histórico de pagamentos
  app.get('/payments/history', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const payments = await mp.getUserPayments(userId);
      return reply.send(payments);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao buscar pagamentos');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erro ao buscar histórico de pagamentos',
      });
    }
  });

  // ============================================
  // USO E LIMITES
  // ============================================

  // Verificar limites do usuário
  app.get('/usage/limits', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const userId = request.user!.userId;

      const [clipLimits, minuteLimits] = await Promise.all([
        mp.checkUserLimits(userId, 'clip'),
        mp.checkUserLimits(userId, 'minute'),
      ]);

      const subscription = clipLimits.subscription || minuteLimits.subscription || null;
      const planId = subscription?.plan_id || 'plan_free';
      const plan = await mp.getPlanById(planId) || await mp.getPlanById('plan_free');

      return reply.send({
        canUse: clipLimits.canUse && minuteLimits.canUse,
        plan,
        subscription,
        usage: {
          clips_used: clipLimits.currentUsage,
          clips_limit: clipLimits.maxAllowed,
          clips_remaining: Math.max(0, clipLimits.maxAllowed - clipLimits.currentUsage),
          minutes_used: minuteLimits.currentUsage,
          minutes_limit: minuteLimits.maxAllowed,
          minutes_remaining: Math.max(0, minuteLimits.maxAllowed - minuteLimits.currentUsage),
        },
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao verificar limites');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Erro ao verificar limites de uso',
      });
    }
  });

  // Resumo de uso (compatível com frontend legado)
  app.post('/get-usage', {
    preHandler: optionalAuth,
  }, async (request, reply) => {
    try {
      const usage = await buildUsagePayload(request.user?.userId);
      return reply.send(usage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      logger.error({ error: message }, 'Erro ao obter uso');
      return reply.send(DEFAULT_USAGE);
    }
  });

  // Incrementar uso manualmente (compatível com frontend legado)
  app.post('/increment-usage', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const schema = z.object({
      minutes: z.number().min(0).optional(),
      shorts: z.number().min(0).optional(),
      idempotencyKey: z.string().min(1).optional(),
    });

    try {
      const { minutes = 0, shorts = 0, idempotencyKey } = schema.parse(request.body);
      const userId = request.user!.userId;

      if (minutes > 0) {
        await mp.incrementUsage(userId, 'minute', minutes, idempotencyKey, 'manual', idempotencyKey);
      }

      if (shorts > 0) {
        await mp.incrementUsage(userId, 'clip', shorts, idempotencyKey, 'manual', idempotencyKey);
      }

      const usage = await buildUsagePayload(userId);
      return reply.send(usage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      logger.error({ error: message }, 'Erro ao incrementar uso');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Erro ao incrementar uso',
      });
    }
  });

  // ============================================
  // WEBHOOKS (Mercado Pago)
  // ============================================

  // Webhook do Mercado Pago (não autenticado - vem do MP)
  app.post('/webhooks/mercadopago', async (request, reply) => {
    const body = request.body as any;
    if (!isMercadoPagoWebhookValid(request, body)) {
      logger.warn({
        hasSecret: Boolean(env.mercadoPago.webhookSecret),
        hasSignature: Boolean(getHeaderValue(request.headers['x-signature'])),
      }, 'Webhook signature invalid');
      return reply.status(401).send({
        error: 'INVALID_SIGNATURE',
        message: 'Invalid webhook signature',
      });
    }

    try {
      logger.info({ type: body.type, action: body.action }, 'Webhook recebido');

      const result = await mp.handleWebhook(body);

      return reply.send({ received: true, ...result });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro no webhook');
      // Retornar 200 mesmo com erro para não reprocessar
      return reply.send({ received: true, error: error.message });
    }
  });

  // ============================================
  // CALLBACKS (Redirecionamentos do checkout)
  // ============================================

  app.get('/payments/success', async (request, reply) => {
    const query = request.query as any;

    logger.info({ query }, 'Pagamento sucesso - redirect');

    // Redirecionar para frontend com status de sucesso
    const frontendUrl = env.frontendUrl;
    const redirectUrl = new URL('/billing', frontendUrl);
    redirectUrl.searchParams.set('payment', 'success');
    redirectUrl.searchParams.set('payment_status', 'success');

    if (query.subscription_id) {
      redirectUrl.searchParams.set('subscription_id', query.subscription_id);
    }
    if (query.payment_id) {
      redirectUrl.searchParams.set('payment_id', query.payment_id);
    }

    return reply.redirect(redirectUrl.toString());
  });

  app.get('/payments/failure', async (request, reply) => {
    const query = request.query as any;

    logger.info({ query }, 'Pagamento falhou - redirect');

    const frontendUrl = env.frontendUrl;
    const redirectUrl = new URL('/billing', frontendUrl);
    redirectUrl.searchParams.set('payment', 'failure');
    redirectUrl.searchParams.set('payment_status', 'failure');

    if (query.subscription_id) {
      redirectUrl.searchParams.set('subscription_id', query.subscription_id);
    }

    return reply.redirect(redirectUrl.toString());
  });

  app.get('/payments/pending', async (request, reply) => {
    const query = request.query as any;

    logger.info({ query }, 'Pagamento pendente - redirect');

    const frontendUrl = env.frontendUrl;
    const redirectUrl = new URL('/billing', frontendUrl);
    redirectUrl.searchParams.set('payment', 'pending');
    redirectUrl.searchParams.set('payment_status', 'pending');

    if (query.subscription_id) {
      redirectUrl.searchParams.set('subscription_id', query.subscription_id);
    }

    return reply.redirect(redirectUrl.toString());
  });

  // ============================================
  // PUBLIC KEY (para frontend)
  // ============================================

  app.get('/payments/config', async (_request, reply) => {
    return reply.send({
      publicKey: env.mercadoPago.publicKey || null,
      isConfigured: billingEnabled,
      sandboxMode: env.mercadoPago.sandboxMode,
    });
  });
}
