import Redis from 'ioredis';
import { ConnectionOptions } from 'bullmq';
import 'dotenv/config';

const url = process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.REDIS_TLS_URL;
const fallbackUrl = 'redis://localhost:6379';

if (!url && process.env.NODE_ENV === 'production') {
  console.error('Warning: No Redis URL found in environment variables. Using fallback URL.');
}

// Parse Redis URL to get host, port, and password
const parseRedisUrl = (url: string) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined
  };
};

// BullMQ specific connection
export const bullmqConnection: ConnectionOptions = {
  ...parseRedisUrl(url || fallbackUrl),
  connectTimeout: 10000,
  lazyConnect: true,
  maxRetriesPerRequest: null // Required by BullMQ
};

// General Redis connection for other purposes
export const connection = new Redis(url || fallbackUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  connectTimeout: 10000
});
