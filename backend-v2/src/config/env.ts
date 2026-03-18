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
  JWT_SECRET: z.string().min(32),
  BASE_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),

  // Database
  DATABASE_URL: z.string().url().optional(),

  // Supabase (opcional quando usar DATABASE_URL)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('raw'),

  // Local Storage (alternativa ao Supabase Storage)
  LOCAL_STORAGE_PATH: z.string().optional(),

  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default('0'),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1).optional(),

  // Anthropic (opcional para análise de highlights)
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // MercadoPago (accept both MERCADOPAGO_ and MERCADO_PAGO_ prefixes)
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  MERCADOPAGO_PUBLIC_KEY: z.string().min(1).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  MERCADOPAGO_SANDBOX_MODE: z.string().default('true'),
  PAYMENTS_SUCCESS_URL: z.string().url().optional(),
  PAYMENTS_FAILURE_URL: z.string().url().optional(),
  UNLIMITED_ADMIN_EMAIL: z.string().email(),

  // Optional
  FFMPEG_PATH: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  YTDLP_COOKIES_B64: z.string().optional(),
  YTDLP_VISITOR_DATA: z.string().optional(),
  YTDLP_PO_TOKEN: z.string().optional(),
  YTDLP_PROXY_URL: z.string().url().optional(),
  INGEST_SERVICE_URL: z.string().url().optional(),
  INGEST_SERVICE_API_KEY: z.string().min(1).optional(),
  INGEST_SERVICE_TIMEOUT_MS: z.string().default('300000'),
  JOB_EXECUTION_MODE: z.enum(['auto', 'queue', 'inline']).default('auto'),
  WORKER_CONCURRENCY: z.string().default('1'),
  WORKER_LOCK_DURATION_MS: z.string().default('900000'),
  WORKER_STALLED_INTERVAL_MS: z.string().default('30000'),
  WORKER_MAX_STALLED_COUNT: z.string().default('3'),
  RENDER_SMART_CROP: z.string().default('false'),
  RENDER_BATCH_CONCURRENCY: z.string().default('2'),
  RENDER_FFMPEG_THREADS: z.string().default('2'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Validar e exportar
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

const defaultLocalStoragePath =
  parsed.data.NODE_ENV === 'production' ? '/tmp/clipify-storage' : './uploads';
const configuredLocalStoragePath = parsed.data.LOCAL_STORAGE_PATH?.trim();
const effectiveLocalStoragePath =
  configuredLocalStoragePath && configuredLocalStoragePath !== './uploads'
    ? configuredLocalStoragePath
    : defaultLocalStoragePath;

export const env = {
  // Server
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  apiKey: parsed.data.API_KEY,
  jwtSecret: parsed.data.JWT_SECRET,
  baseUrl: parsed.data.BASE_URL || `http://localhost:${parsed.data.PORT}`,
  frontendUrl: parsed.data.FRONTEND_URL || (parsed.data.NODE_ENV === 'development' ? 'http://localhost:8080' : parsed.data.BASE_URL || `http://localhost:${parsed.data.PORT}`),
  isDevelopment: parsed.data.NODE_ENV === 'development',
  isProduction: parsed.data.NODE_ENV === 'production',

  // Database
  databaseUrl: parsed.data.DATABASE_URL,

  // Supabase
  supabase: {
    url: parsed.data.SUPABASE_URL,
    anonKey: parsed.data.SUPABASE_ANON_KEY,
    serviceKey: parsed.data.SUPABASE_SERVICE_KEY,
    bucket: parsed.data.SUPABASE_STORAGE_BUCKET,
  },

  // Storage
  localStoragePath: effectiveLocalStoragePath,

  // Redis
  redis: (() => {
    const redisUrl = parsed.data.REDIS_URL;
    if (!redisUrl) {
      return {
        url: undefined as string | undefined,
        username: undefined as string | undefined,
        host: parsed.data.REDIS_HOST,
        port: parseInt(parsed.data.REDIS_PORT, 10),
        password: parsed.data.REDIS_PASSWORD,
        db: parseInt(parsed.data.REDIS_DB, 10),
        tls: false,
      };
    }

    try {
      const url = new URL(redisUrl);
      const dbFromPath = url.pathname?.replace('/', '');
      return {
        url: redisUrl,
        username: url.username || undefined,
        host: url.hostname || parsed.data.REDIS_HOST,
        port: Number(url.port || parsed.data.REDIS_PORT),
        password: url.password || parsed.data.REDIS_PASSWORD,
        db: dbFromPath ? Number(dbFromPath) : parseInt(parsed.data.REDIS_DB, 10),
        tls: url.protocol === 'rediss:',
      };
    } catch {
      return {
        url: undefined as string | undefined,
        username: undefined as string | undefined,
        host: parsed.data.REDIS_HOST,
        port: parseInt(parsed.data.REDIS_PORT, 10),
        password: parsed.data.REDIS_PASSWORD,
        db: parseInt(parsed.data.REDIS_DB, 10),
        tls: false,
      };
    }
  })(),

  // APIs
  openai: {
    apiKey: parsed.data.OPENAI_API_KEY,
  },
  anthropic: {
    apiKey: parsed.data.ANTHROPIC_API_KEY,
  },

  // Google OAuth
  google: {
    clientId: parsed.data.GOOGLE_CLIENT_ID,
    clientSecret: parsed.data.GOOGLE_CLIENT_SECRET,
    callbackUrl: parsed.data.GOOGLE_CALLBACK_URL,
  },

  // MercadoPago
  mercadoPago: {
    accessToken: parsed.data.MERCADOPAGO_ACCESS_TOKEN,
    publicKey: parsed.data.MERCADOPAGO_PUBLIC_KEY,
    webhookSecret: parsed.data.MERCADOPAGO_WEBHOOK_SECRET,
    sandboxMode: parsed.data.MERCADOPAGO_SANDBOX_MODE === 'true',
    successUrl: parsed.data.PAYMENTS_SUCCESS_URL,
    failureUrl: parsed.data.PAYMENTS_FAILURE_URL,
  },

  billing: {
    unlimitedAdminEmail: parsed.data.UNLIMITED_ADMIN_EMAIL.toLowerCase(),
  },

  // Optional
  ffmpegPath: parsed.data.FFMPEG_PATH,
  youtubeApiKey: parsed.data.YOUTUBE_API_KEY,
  ytdlp: {
    cookiesBase64: parsed.data.YTDLP_COOKIES_B64,
    visitorData: parsed.data.YTDLP_VISITOR_DATA,
    poToken: parsed.data.YTDLP_PO_TOKEN,
    proxyUrl: parsed.data.YTDLP_PROXY_URL,
  },
  ingestService: {
    url: parsed.data.INGEST_SERVICE_URL,
    apiKey: parsed.data.INGEST_SERVICE_API_KEY,
    timeoutMs: parseInt(parsed.data.INGEST_SERVICE_TIMEOUT_MS, 10),
  },
  jobExecutionMode: parsed.data.JOB_EXECUTION_MODE,
  worker: {
    concurrency: parseInt(parsed.data.WORKER_CONCURRENCY, 10),
    lockDurationMs: parseInt(parsed.data.WORKER_LOCK_DURATION_MS, 10),
    stalledIntervalMs: parseInt(parsed.data.WORKER_STALLED_INTERVAL_MS, 10),
    maxStalledCount: parseInt(parsed.data.WORKER_MAX_STALLED_COUNT, 10),
  },
  render: {
    smartCrop: parsed.data.RENDER_SMART_CROP === 'true',
    batchConcurrency: parseInt(parsed.data.RENDER_BATCH_CONCURRENCY, 10),
    ffmpegThreads: parseInt(parsed.data.RENDER_FFMPEG_THREADS, 10),
  },
  logLevel: parsed.data.LOG_LEVEL,
} as const;
