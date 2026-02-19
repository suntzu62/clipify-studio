import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../services/auth.service.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('auth-middleware');

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
      name?: string;
    };
  }
}

/**
 * Middleware para verificar JWT token
 * Adiciona user ao request se token for válido
 */
export async function authenticateJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Tentar obter token de httpOnly cookie (preferencial) ou header Authorization (fallback)
    let token = request.cookies?.access_token;

    if (!token) {
      // Fallback para header Authorization (compatibilidade temporária)
      const authHeader = request.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7); // Remove "Bearer "
      }
    }

    if (!token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing authentication token',
      });
    }

    // Verificar token
    const decoded = verifyToken(token);

    if (!decoded) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Adicionar user ao request
    request.user = decoded;

    logger.debug({ userId: decoded.userId }, 'User authenticated');
  } catch (error) {
    logger.error({ error }, 'Authentication error');
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed',
    });
  }
}

/**
 * Middleware opcional - não retorna erro se não autenticado
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    // Tentar obter token de httpOnly cookie ou header Authorization
    let token = request.cookies?.access_token;

    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        request.user = decoded;
      }
    }
  } catch (error) {
    // Silently fail - optional auth
    logger.debug({ error }, 'Optional auth failed');
  }
}
