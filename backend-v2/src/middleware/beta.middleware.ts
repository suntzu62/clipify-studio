import type { FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';

const logger = createLogger('beta-middleware');

/**
 * Blocks cost-generating endpoints when beta mode is enabled and the user is not allowlisted.
 *
 * Behavior:
 * - If BETA_MODE=false: no-op
 * - If BETA_MODE=true and BETA_ALLOWLIST_EMAILS is empty: no-op
 * - Else: require request.user.email to be present in the allowlist
 */
export async function requireBetaAllowlist(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!env.betaMode) return;
  if (!env.betaAllowlistEmails.length) return;

  if (!request.user) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Autenticação necessária',
    });
  }

  const email = String(request.user.email || '').trim().toLowerCase();
  const allowed = Boolean(email) && env.betaAllowlistEmails.includes(email);

  if (!allowed) {
    logger.warn({ userId: request.user.userId, email }, 'Blocked request (beta closed)');
    return reply.status(403).send({
      error: 'BETA_CLOSED',
      message: 'Beta fechado. Solicite acesso para continuar.',
    });
  }
}

