import IORedis from 'ioredis';
import { env } from './env.js';
import { createLogger } from './logger.js';

const logger = createLogger('redis');

// Shared Redis connection for general use
export const redis = env.redis.url
  ? new IORedis(env.redis.url, {
      ...(env.redis.username ? { username: env.redis.username } : {}),
      db: env.redis.db || 0,
      maxRetriesPerRequest: 3,
      ...(env.redis.tls ? { tls: {} } : {}),
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        logger.warn({ error: err.message }, 'Redis connection error, reconnecting...');
        return true;
      },
    })
  : new IORedis({
      ...(env.redis.username ? { username: env.redis.username } : {}),
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password,
      db: env.redis.db || 0,
      maxRetriesPerRequest: 3,
      ...(env.redis.tls ? { tls: {} } : {}),
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        logger.warn({ error: err.message }, 'Redis connection error, reconnecting...');
        return true;
      },
    });

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (err) => {
  logger.error({ error: err.message }, 'Redis connection error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

let queueSafetyPromise: Promise<{ safe: boolean; reason: string; policy?: string }> | null = null;

export async function getRedisQueueSafety(): Promise<{ safe: boolean; reason: string; policy?: string }> {
  if (queueSafetyPromise) {
    return queueSafetyPromise;
  }

  queueSafetyPromise = (async () => {
    try {
      const info = await redis.info('memory');
      const policyLine = info
        .split('\n')
        .find((line) => line.toLowerCase().startsWith('maxmemory_policy:'));
      const policy = policyLine?.split(':')[1]?.trim().toLowerCase();

      if (policy && policy !== 'noeviction') {
        return {
          safe: false,
          policy,
          reason: `Redis maxmemory_policy=${policy} is unsafe for BullMQ locks`,
        };
      }

      return {
        safe: true,
        policy,
        reason: policy ? `Redis maxmemory_policy=${policy}` : 'Redis maxmemory_policy unavailable',
      };
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Failed to inspect Redis memory policy');
      return {
        safe: true,
        reason: 'Redis memory policy check unavailable',
      };
    }
  })();

  return queueSafetyPromise;
}

/**
 * Helper functions for temporary configuration storage
 */

/**
 * Save temporary configuration with TTL
 * @param tempId - Unique temporary ID
 * @param config - Configuration object to store
 * @param ttlSeconds - Time to live in seconds (default: 3600 = 1 hour)
 */
export async function setTempConfig(
  tempId: string,
  config: any,
  ttlSeconds: number = 3600
): Promise<void> {
  const key = `temp:config:${tempId}`;
  await redis.set(key, JSON.stringify(config), 'EX', ttlSeconds);
  logger.info({ tempId, ttl: ttlSeconds }, 'Temporary config saved');
}

/**
 * Get temporary configuration
 * @param tempId - Unique temporary ID
 * @returns Configuration object or null if not found/expired
 */
export async function getTempConfig(tempId: string): Promise<any | null> {
  const key = `temp:config:${tempId}`;
  const data = await redis.get(key);

  if (!data) {
    logger.debug({ tempId }, 'Temporary config not found or expired');
    return null;
  }

  logger.debug({ tempId }, 'Temporary config retrieved');
  return JSON.parse(data);
}

/**
 * Delete temporary configuration
 * @param tempId - Unique temporary ID
 */
export async function deleteTempConfig(tempId: string): Promise<void> {
  const key = `temp:config:${tempId}`;
  await redis.del(key);
  logger.info({ tempId }, 'Temporary config deleted');
}

export default redis;
