import type { FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';

const logger = createLogger('rate-limit');

const memory = new Map<string, { count: number; resetAtMs: number }>();

function getClientIp(request: FastifyRequest): string {
  const header = request.headers['x-forwarded-for'];
  const forwarded = Array.isArray(header) ? header[0] : header;
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const ip = (request as any).ip;
  if (typeof ip === 'string' && ip.trim()) return ip;

  const remote = (request as any).socket?.remoteAddress;
  if (typeof remote === 'string' && remote.trim()) return remote;

  return 'unknown';
}

async function incrWithWindow(key: string, windowSeconds: number): Promise<{ count: number; retryAfterSeconds?: number }> {
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    // Only fetch TTL when we actually need it.
    return { count };
  } catch (error: any) {
    const now = Date.now();
    const item = memory.get(key);
    if (!item || item.resetAtMs <= now) {
      memory.set(key, { count: 1, resetAtMs: now + windowSeconds * 1000 });
      return { count: 1 };
    }

    item.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((item.resetAtMs - now) / 1000));
    return { count: item.count, retryAfterSeconds };
  }
}

type RateLimitKey = (request: FastifyRequest) => string | null;

export function rateLimit(options: {
  name: string;
  max: number;
  windowSeconds: number;
  key: RateLimitKey;
}) {
  return async function rateLimitPreHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!env.rateLimit.enabled) return;

    const keyPart = options.key(request);
    if (!keyPart) return;

    const windowSeconds = Math.max(1, options.windowSeconds);
    const max = Math.max(1, options.max);

    const redisKey = `rl:${options.name}:${keyPart}`;
    const { count, retryAfterSeconds } = await incrWithWindow(redisKey, windowSeconds);

    if (count > max) {
      const ip = getClientIp(request);
      logger.warn({ name: options.name, keyPart, ip, count, max }, 'Rate limit exceeded');
      if (retryAfterSeconds) reply.header('Retry-After', String(retryAfterSeconds));
      return reply.status(429).send({
        error: 'RATE_LIMITED',
        message: 'Muitas requisicoes. Tente novamente em alguns minutos.',
      });
    }
  };
}

export function rateLimitByIp(name: string, max: number, windowSeconds: number) {
  return rateLimit({
    name,
    max,
    windowSeconds,
    key: (request) => `ip:${getClientIp(request)}`,
  });
}

export function rateLimitByUser(name: string, max: number, windowSeconds: number) {
  return rateLimit({
    name,
    max,
    windowSeconds,
    key: (request) => {
      const userId = request.user?.userId;
      if (!userId) return null;
      return `user:${userId}`;
    },
  });
}

