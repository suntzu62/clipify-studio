import { FastifyRequest, FastifyReply } from 'fastify';
import { isSuperAdmin } from '../config/admin.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('admin-middleware');

/**
 * Middleware that requires super admin access
 * Must be used AFTER authenticateJWT middleware
 * Returns 403 Forbidden if user is not the super admin
 */
export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Verify user is authenticated (should be done by authenticateJWT first)
  if (!request.user) {
    logger.warn('Admin access attempt without authentication');
    return reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  // Check if user is super admin
  if (!isSuperAdmin(request.user.email)) {
    logger.warn(
      { userId: request.user.userId, email: request.user.email },
      'Unauthorized admin access attempt'
    );
    return reply.code(403).send({
      error: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }

  logger.debug(
    { userId: request.user.userId },
    'Super admin access granted'
  );
}
