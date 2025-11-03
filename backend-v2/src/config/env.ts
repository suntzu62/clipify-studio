import { config } from 'dotenv';
import { z } from 'zod';

// Carregar variáveis de ambiente
config();

// Schema de validação
const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_KEY: z.string().min(1),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().default('raw'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default('0'),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),

  // Optional
  FFMPEG_PATH: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Validar e exportar
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = {
  // Server
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  apiKey: parsed.data.API_KEY,
  isDevelopment: parsed.data.NODE_ENV === 'development',
  isProduction: parsed.data.NODE_ENV === 'production',

  // Supabase
  supabase: {
    url: parsed.data.SUPABASE_URL,
    anonKey: parsed.data.SUPABASE_ANON_KEY,
    serviceKey: parsed.data.SUPABASE_SERVICE_KEY,
    bucket: parsed.data.SUPABASE_STORAGE_BUCKET,
  },

  // Redis
  redis: {
    host: parsed.data.REDIS_HOST,
    port: parseInt(parsed.data.REDIS_PORT, 10),
    password: parsed.data.REDIS_PASSWORD,
    db: parseInt(parsed.data.REDIS_DB, 10),
  },

  // APIs
  openai: {
    apiKey: parsed.data.OPENAI_API_KEY,
  },
  anthropic: {
    apiKey: parsed.data.ANTHROPIC_API_KEY,
  },

  // Optional
  ffmpegPath: parsed.data.FFMPEG_PATH,
  youtubeApiKey: parsed.data.YOUTUBE_API_KEY,
  logLevel: parsed.data.LOG_LEVEL,
} as const;
