import Redis from 'ioredis';
import 'dotenv/config';

const url = process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.REDIS_TLS_URL;
const fallbackUrl = 'redis://localhost:6379';

if (!url && process.env.NODE_ENV === 'production') {
  console.error('Warning: No Redis URL found in environment variables. Using fallback URL.');
}

export const connection = new Redis(url || fallbackUrl, {
  // Configuração básica para compatibilidade com BullMQ
  connectionName: 'cortai-worker',
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});
