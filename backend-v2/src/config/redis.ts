import IORedis from 'ioredis';
import { env } from './env.js';
import { createLogger } from './logger.js';

const logger = createLogger('redis');
const memoryStore = new Map<string, { value: any; expiresAt: number }>();

// Periodic cleanup of expired in-memory entries to prevent memory leaks
const MEMORY_CLEANUP_INTERVAL_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, item] of memoryStore.entries()) {
    if (item.expiresAt < now) {
      memoryStore.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug({ cleaned, remaining: memoryStore.size }, 'Memory store cleanup completed');
  }
}, MEMORY_CLEANUP_INTERVAL_MS).unref();

// Shared Redis connection for general use
export const redis = new IORedis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db || 0,
  ...(env.redis.tls ? { tls: {} } : {}),
  maxRetriesPerRequest: 3,
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
  const expiresAt = Date.now() + ttlSeconds * 1000;
  try {
    await redis.set(key, JSON.stringify(config), 'EX', ttlSeconds);
    logger.info({ tempId, ttl: ttlSeconds }, 'Temporary config saved');
  } catch (error: any) {
    logger.warn({ error: error.message, tempId }, 'Redis unavailable, using in-memory temp config');
    memoryStore.set(key, { value: config, expiresAt });
  }
}

/**
 * Get temporary configuration
 * @param tempId - Unique temporary ID
 * @returns Configuration object or null if not found/expired
 */
export async function getTempConfig(tempId: string): Promise<any | null> {
  const key = `temp:config:${tempId}`;
  try {
    const data = await redis.get(key);
    if (data) {
      logger.debug({ tempId }, 'Temporary config retrieved');
      return JSON.parse(data);
    }
  } catch (error: any) {
    logger.warn({ error: error.message, tempId }, 'Redis unavailable, checking in-memory temp config');
  }

  const mem = memoryStore.get(key);
  if (mem) {
    if (mem.expiresAt > Date.now()) {
      logger.debug({ tempId }, 'Temporary config retrieved from memory');
      return mem.value;
    }
    memoryStore.delete(key);
  }

  logger.debug({ tempId }, 'Temporary config not found or expired');
  return null;
}

/**
 * Delete temporary configuration
 * @param tempId - Unique temporary ID
 */
export async function deleteTempConfig(tempId: string): Promise<void> {
  const key = `temp:config:${tempId}`;
  try {
    await redis.del(key);
    logger.info({ tempId }, 'Temporary config deleted');
  } catch (error: any) {
    logger.warn({ error: error.message, tempId }, 'Redis unavailable, deleting from memory');
    memoryStore.delete(key);
  }
}

export default redis;
