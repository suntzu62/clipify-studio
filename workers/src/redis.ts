import Redis from 'ioredis';
import 'dotenv/config';

const url = process.env.REDIS_URL;

if (!url) {
  throw new Error('Missing REDIS_URL. Create workers/.env and set REDIS_URL to a valid redis:// or rediss:// connection string (e.g., Upstash).');
}

export const connection = new Redis(url, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
});
