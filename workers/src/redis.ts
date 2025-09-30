import Redis from 'ioredis';
import 'dotenv/config';

const url = process.env.REDIS_URL;

if (!url) {
  throw new Error('Missing REDIS_URL. Create workers/.env and set REDIS_URL to a valid redis:// or rediss:// connection string (e.g., Upstash).');
}

export const connection = new Redis(url, {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  enableReadyCheck: false,
  connectionName: 'cortai-worker',
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // Limitar conexões por instância
  maxLoadingRetryTime: 2000,
  disconnectTimeout: 2000,
});
