import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { authenticateJWT, optionalAuth } from '../middleware/auth.middleware.js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import { buildFrontendAppUrl } from '../utils/frontend-url.js';
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
  const periodEnd = subscription?.current_period_end ?? null;

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
      const userName = request.user!.email?.split('@')[0] || 'Usuário';

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

      // Free plan has no checkout URL
      const checkoutUrl = 'checkoutUrl' in result ? result.checkoutUrl : null;
      const preferenceId = 'preferenceId' in result ? result.preferenceId : null;

      return reply.status(201).send({
        subscription: result.subscription,
        checkoutUrl,
        preferenceId,
      });
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Erro ao criar assinatura');

      if (error.message.includes('já possui')) {
        return reply.status(409).send({
          error: 'CONFLICT',
          message: error.message,
        });
      }

      if (error.message.includes('MERCADOPAGO') || error.message.includes('Pagamentos ainda não')) {
        return reply.status(503).send({
          error: 'PAYMENT_NOT_CONFIGURED',
          message: 'Sistema de pagamentos não está configurado. Entre em contato com o suporte.',
        });
      }

      if (error.message.includes('violates foreign key') || error.message.includes('profiles')) {
        return reply.status(400).send({
          error: 'PROFILE_NOT_FOUND',
          message: 'Perfil de usuário não encontrado. Faça login novamente.',
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
      const userId = request.user!.userId;

      // Verify ownership: user can only cancel their own subscription
      const userSubscription = await mp.getUserSubscription(userId);
      if (!userSubscription || userSubscription.id !== subscriptionId) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'You can only cancel your own subscription',
        });
      }

      const subscription = await mp.cancelSubscription(subscriptionId, reason);

      logger.info({ subscriptionId, userId, reason }, 'Assinatura cancelada');

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
      const userName = request.user!.email?.split('@')[0] || 'Usuário';

      const result = await mp.createPayment({
        userId,
        userEmail,
        userName,
        planId: body.planId,
        billingCycle: body.billingCycle,
        paymentMethod: body.paymentMethod,
      });

      const checkoutUrl = 'checkoutUrl' in result ? result.checkoutUrl : null;
      const preferenceId = 'preferenceId' in result ? result.preferenceId : null;

      return reply.status(201).send({
        subscription: result.subscription,
        checkoutUrl,
        preferenceId,
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
      cpf: z.string().min(11).max(14),
    });

    try {
      const body = schema.parse(request.body);
      const userId = request.user!.userId;
      const userEmail = request.user!.email || 'user@example.com';
      const userName = request.user!.email?.split('@')[0] || 'Usuário';

      const result = await mp.createPixPayment({
        userId,
        userEmail,
        userName,
        planId: body.planId,
        billingCycle: body.billingCycle,
        payerCpf: body.cpf,
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
      const userId = request.user!.userId;

      // Verify ownership: user can only check their own payments
      const userPayments = await mp.getUserPayments(userId);
      const ownsPayment = userPayments.some((p: any) => p.id === paymentId);
      if (!ownsPayment) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'You can only access your own payments',
        });
      }

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

      // Validate MercadoPago webhook signature (MANDATORY)
      if (!env.mercadoPago.webhookSecret) {
        logger.error('MERCADOPAGO_WEBHOOK_SECRET not configured — rejecting webhook for security');
        return reply.status(500).send({ error: 'WEBHOOK_CONFIG_ERROR', message: 'Webhook secret not configured' });
      }

      const xSignature = request.headers['x-signature'] as string | undefined;
      const xRequestId = request.headers['x-request-id'] as string | undefined;

      if (!xSignature || !xRequestId) {
        logger.warn('Webhook rejected: missing x-signature or x-request-id headers');
        return reply.status(401).send({ error: 'INVALID_SIGNATURE', message: 'Missing signature headers' });
      }

      // Parse x-signature header: "ts=...,v1=..."
      const parts = Object.fromEntries(
        xSignature.split(',').map((part) => {
          const [key, ...rest] = part.trim().split('=');
          return [key, rest.join('=')];
        })
      );

      const ts = parts['ts'];
      const v1 = parts['v1'];

      if (!ts || !v1) {
        logger.warn('Webhook rejected: malformed x-signature header');
        return reply.status(401).send({ error: 'INVALID_SIGNATURE', message: 'Malformed signature' });
      }

      // Build the manifest string per MercadoPago docs
      const dataId = (request.query as any)?.['data.id'] || body?.data?.id || '';
      const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

      const hmac = crypto
        .createHmac('sha256', env.mercadoPago.webhookSecret)
        .update(manifest)
        .digest('hex');

      const expectedSignature = Buffer.from(hmac, 'hex');
      const receivedSignature = Buffer.from(v1, 'hex');
      const validSignature =
        expectedSignature.length > 0 &&
        expectedSignature.length === receivedSignature.length &&
        crypto.timingSafeEqual(expectedSignature, receivedSignature);

      if (!validSignature) {
        logger.warn({ requestId: xRequestId }, 'Webhook rejected: invalid signature');
        return reply.status(401).send({ error: 'INVALID_SIGNATURE', message: 'Invalid signature' });
      }

      logger.info('Webhook signature validated successfully');

      await mp.handleWebhook(body);

      return reply.send({ received: true });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro no webhook');
      // Retornar 200 mesmo com erro para não reprocessar
      return reply.send({ received: true });
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
    return reply.redirect(
      buildFrontendAppUrl(frontendUrl, '/billing', {
        payment_status: 'success',
        subscription_id: query.subscription_id,
        payment_id: query.payment_id,
      })
    );
  });

  app.get('/payments/failure', async (request, reply) => {
    const query = request.query as any;

    logger.info({ query }, 'Pagamento falhou - redirect');

    const frontendUrl = env.frontendUrl;
    return reply.redirect(
      buildFrontendAppUrl(frontendUrl, '/billing', {
        payment_status: 'failure',
        subscription_id: query.subscription_id,
      })
    );
  });

  app.get('/payments/pending', async (request, reply) => {
    const query = request.query as any;

    logger.info({ query }, 'Pagamento pendente - redirect');

    const frontendUrl = env.frontendUrl;
    return reply.redirect(
      buildFrontendAppUrl(frontendUrl, '/billing', {
        payment_status: 'pending',
        subscription_id: query.subscription_id,
      })
    );
  });

  // ============================================
  // PUBLIC KEY (para frontend)
  // ============================================

  app.get('/payments/config', async (_request, reply) => {
    return reply.send({
      publicKey: env.mercadoPago.publicKey || null,
      isConfigured: !!env.mercadoPago.accessToken,
      sandboxMode: env.mercadoPago.sandboxMode,
    });
  });
}
