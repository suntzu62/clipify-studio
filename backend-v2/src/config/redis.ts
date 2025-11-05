import IORedis from 'ioredis';
import { env } from './env.js';
import { createLogger } from './logger.js';

const logger = createLogger('redis');

// Shared Redis connection for general use
export const redis = new IORedis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db || 0,
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

export default redis;
