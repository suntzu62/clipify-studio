import { FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import * as mp from '../services/mercadopago.service.js';

const logger = createLogger('subscription-middleware');
const DEV_UNLIMITED_MAX = 1_000_000;

function isDevUnlimitedUser(request: FastifyRequest): boolean {
  if (!env.isDevelopment) return false;
  const email = request.user?.email?.trim().toLowerCase();
  if (!email) return false;
  if (!env.devUnlimitedEmails.length) return false;
  return env.devUnlimitedEmails.includes(email);
}

/**
 * Middleware para verificar se o usuário pode criar mais clips
 * Bloqueia a requisição se o limite foi atingido
 */
export async function checkClipLimit(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    if (!request.user) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Autenticação necessária',
      });
    }

    if (isDevUnlimitedUser(request)) {
      // Dev bypass: allow unlimited generations for whitelisted emails.
      (request as any).userLimits = {
        canUse: true,
        currentUsage: 0,
        maxAllowed: DEV_UNLIMITED_MAX,
        planName: 'Dev (Ilimitado)',
        subscription: null,
      };
      return;
    }

    const userId = request.user.userId;
    const limits = await mp.checkUserLimits(userId, 'clip');

    if (!limits.canUse) {
      logger.warn({
        userId,
        currentUsage: limits.currentUsage,
        maxAllowed: limits.maxAllowed,
        planName: limits.planName,
      }, 'Limite de clips atingido');

      return reply.status(403).send({
        error: 'LIMIT_EXCEEDED',
        message: `Você atingiu o limite de ${limits.maxAllowed} clips do plano ${limits.planName}`,
        details: {
          currentUsage: limits.currentUsage,
          maxAllowed: limits.maxAllowed,
          planName: limits.planName,
        },
        upgradeUrl: '/billing',
      });
    }

    // Adicionar info de limites ao request para uso posterior
    (request as any).userLimits = limits;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Erro ao verificar limite de clips');
    // Em caso de erro, permitir continuar (fail-open)
  }
}

/**
 * Middleware para verificar se o usuário pode processar mais minutos de vídeo
 */
export async function checkMinuteLimit(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    if (!request.user) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Autenticação necessária',
      });
    }

    if (isDevUnlimitedUser(request)) {
      (request as any).userLimits = {
        canUse: true,
        currentUsage: 0,
        maxAllowed: DEV_UNLIMITED_MAX,
        planName: 'Dev (Ilimitado)',
        subscription: null,
      };
      return;
    }

    const userId = request.user.userId;
    const limits = await mp.checkUserLimits(userId, 'minute');

    if (!limits.canUse) {
      logger.warn({
        userId,
        currentUsage: limits.currentUsage,
        maxAllowed: limits.maxAllowed,
        planName: limits.planName,
      }, 'Limite de minutos atingido');

      return reply.status(403).send({
        error: 'LIMIT_EXCEEDED',
        message: `Você atingiu o limite de ${limits.maxAllowed} minutos do plano ${limits.planName}`,
        details: {
          currentUsage: limits.currentUsage,
          maxAllowed: limits.maxAllowed,
          planName: limits.planName,
        },
        upgradeUrl: '/billing',
      });
    }

    (request as any).userLimits = limits;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Erro ao verificar limite de minutos');
  }
}

/**
 * Middleware para verificar se o usuário tem um plano específico ou superior
 * Útil para features que requerem plano Pro ou Enterprise
 */
export function requirePlan(requiredPlans: string[]) {
  return async function(request: FastifyRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Autenticação necessária',
        });
      }

      const userId = request.user.userId;
      const subscription = await mp.getUserSubscription(userId);

      // Se não tem assinatura, está no plano free
      const currentPlan = subscription?.plan_id || 'plan_free';

      if (!requiredPlans.includes(currentPlan)) {
        logger.warn({
          userId,
          currentPlan,
          requiredPlans,
        }, 'Plano insuficiente');

        return reply.status(403).send({
          error: 'PLAN_REQUIRED',
          message: `Esta funcionalidade requer um dos seguintes planos: ${requiredPlans.join(', ')}`,
          details: {
            currentPlan,
            requiredPlans,
          },
          upgradeUrl: '/billing',
        });
      }

      (request as any).subscription = subscription;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao verificar plano');
    }
  };
}

/**
 * Middleware para verificar se o usuário tem feature específica habilitada
 */
export function requireFeature(featureName: 'api_access' | 'priority_processing' | 'custom_branding') {
  return async function(request: FastifyRequest, reply: FastifyReply) {
    try {
      if (!request.user) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Autenticação necessária',
        });
      }

      const userId = request.user.userId;
      const subscription = await mp.getUserSubscription(userId);

      // Mapear feature para campo do plano
      const featureMap: Record<string, string> = {
        api_access: 'has_api_access',
        priority_processing: 'has_priority_processing',
        custom_branding: 'has_custom_branding',
      };

      const featureField = featureMap[featureName];

      // Se não tem assinatura ou feature não está habilitada
      if (!subscription || !(subscription as any)[featureField]) {
        logger.warn({
          userId,
          featureName,
          planId: subscription?.plan_id || 'plan_free',
        }, 'Feature não disponível no plano');

        return reply.status(403).send({
          error: 'FEATURE_NOT_AVAILABLE',
          message: `A funcionalidade "${featureName}" não está disponível no seu plano atual`,
          details: {
            feature: featureName,
            currentPlan: subscription?.plan_id || 'plan_free',
          },
          upgradeUrl: '/billing',
        });
      }

      (request as any).subscription = subscription;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao verificar feature');
    }
  };
}

/**
 * Hook para registrar uso após criação de clip bem-sucedida
 * Usar como onResponse hook
 */
export async function trackClipUsage(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Só registrar se a resposta foi bem-sucedida (2xx)
  if (reply.statusCode >= 200 && reply.statusCode < 300) {
    try {
      if (request.user) {
        const userId = request.user.userId;
        const body = request.body as any;

        // Extrair referência do clip se disponível
        const jobId = body?.jobId || (request.params as any)?.jobId;

        await mp.incrementUsage(userId, 'clip', 1, jobId, 'job', jobId ? `${jobId}:clip` : undefined);

        logger.info({ userId, jobId }, 'Uso de clip registrado');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao registrar uso de clip');
    }
  }
}

/**
 * Hook para registrar uso de minutos após processamento
 */
export async function trackMinuteUsage(
  request: FastifyRequest,
  reply: FastifyReply,
  minutes: number
) {
  if (reply.statusCode >= 200 && reply.statusCode < 300) {
    try {
      if (request.user) {
        const userId = request.user.userId;
        const jobId = (request.params as any)?.jobId;

        await mp.incrementUsage(userId, 'minute', minutes, jobId, 'job', jobId ? `${jobId}:minute` : undefined);

        logger.info({ userId, jobId, minutes }, 'Uso de minutos registrado');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Erro ao registrar uso de minutos');
    }
  }
}
