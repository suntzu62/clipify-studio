import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateJWT, optionalAuth } from '../middleware/auth.middleware.js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import * as mp from '../services/mercadopago.service.js';

const logger = createLogger('payments-routes');

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

      return reply.send({
        subscription,
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

  // Criar nova assinatura (checkout redirect)
  app.post('/subscriptions', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const schema = z.object({
      planId: z.string(),
      billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
    });

    try {
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
        ? (env.isDevelopment ? result.sandboxUrl : result.checkoutUrl)
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
        ? (env.isDevelopment ? result.sandboxUrl : result.checkoutUrl)
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

      return reply.send({
        planName: clipLimits.planName,
        clips: {
          used: clipLimits.currentUsage,
          limit: clipLimits.maxAllowed,
          remaining: clipLimits.maxAllowed - clipLimits.currentUsage,
          canCreate: clipLimits.canUse,
        },
        minutes: {
          used: minuteLimits.currentUsage,
          limit: minuteLimits.maxAllowed,
          remaining: minuteLimits.maxAllowed - minuteLimits.currentUsage,
          canProcess: minuteLimits.canUse,
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
        await mp.incrementUsage(userId, 'minute', minutes, idempotencyKey, 'manual');
      }

      if (shorts > 0) {
        await mp.incrementUsage(userId, 'clip', shorts, idempotencyKey, 'manual');
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
    try {
      const body = request.body as any;

      logger.info({ type: body.type, action: body.action }, 'Webhook recebido');

      // Verificar assinatura do webhook (opcional mas recomendado)
      // const signature = request.headers['x-signature'];
      // if (env.mercadoPago.webhookSecret && signature) {
      //   // Validar assinatura
      // }

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
    const frontendUrl = env.isDevelopment ? 'http://localhost:8080' : env.baseUrl;
    const redirectUrl = new URL('/billing', frontendUrl);
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

    const frontendUrl = env.isDevelopment ? 'http://localhost:8080' : env.baseUrl;
    const redirectUrl = new URL('/billing', frontendUrl);
    redirectUrl.searchParams.set('payment_status', 'failure');

    if (query.subscription_id) {
      redirectUrl.searchParams.set('subscription_id', query.subscription_id);
    }

    return reply.redirect(redirectUrl.toString());
  });

  app.get('/payments/pending', async (request, reply) => {
    const query = request.query as any;

    logger.info({ query }, 'Pagamento pendente - redirect');

    const frontendUrl = env.isDevelopment ? 'http://localhost:8080' : env.baseUrl;
    const redirectUrl = new URL('/billing', frontendUrl);
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
      isConfigured: !!env.mercadoPago.accessToken,
    });
  });
}
