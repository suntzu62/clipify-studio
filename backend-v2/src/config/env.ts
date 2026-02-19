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
  COOKIE_SECRET: z.string().min(32),
  BASE_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),
  RENDER_EXTERNAL_HOSTNAME: z.string().optional(),
  DISABLE_WORKER: z.enum(['true', 'false']).optional(),
  WORKER_CONCURRENCY: z.string().default('1'),
  SOCIAL_MEDIA_ENABLED: z.enum(['true', 'false']).default('false'),
  UPLOADS_ENABLED: z.enum(['true', 'false']).default('true'),
  DIRECT_PUBLISHING_ENABLED: z.enum(['true', 'false']).default('false'),
  SCHEDULER_ENABLED: z.enum(['true', 'false']).default('false'),
  BRAND_KIT_ENABLED: z.enum(['true', 'false']).default('false'),
  LIVE_CLIPPING_ENABLED: z.enum(['true', 'false']).default('false'),

  // Beta gating (optional)
  BETA_MODE: z.enum(['true', 'false']).default('false'),
  // Comma-separated list of allowed emails (lowercased). When empty, beta mode does not block.
  BETA_ALLOWLIST_EMAILS: z.string().optional(),

  // Rate limiting (basic abuse protection)
  // Disabled by default in development.
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true'),
  RATE_LIMIT_REGISTER_MAX: z.string().default('10'),
  RATE_LIMIT_REGISTER_WINDOW_SECONDS: z.string().default('3600'),
  RATE_LIMIT_LOGIN_MAX: z.string().default('50'),
  RATE_LIMIT_LOGIN_WINDOW_SECONDS: z.string().default('300'),
  RATE_LIMIT_TEMP_CONFIG_MAX: z.string().default('60'),
  RATE_LIMIT_TEMP_CONFIG_WINDOW_SECONDS: z.string().default('3600'),
  RATE_LIMIT_JOB_START_MAX: z.string().default('20'),
  RATE_LIMIT_JOB_START_WINDOW_SECONDS: z.string().default('3600'),

  // Database
  DATABASE_URL: z.string().url().optional(),

  // Supabase (opcional quando usar DATABASE_URL)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('raw'),

  // Local Storage (alternativa ao Supabase Storage)
  LOCAL_STORAGE_PATH: z.string().default('./uploads'),

  // Redis
  REDIS_URL: z.string().url().optional(),
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

  // Mercado Pago
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_PUBLIC_KEY: z.string().optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),
  MERCADOPAGO_SANDBOX_MODE: z.enum(['true', 'false']).optional(),

  // Email notifications (job completed/failed)
  NOTIFICATIONS_EMAIL_ENABLED: z.enum(['true', 'false']).default('false'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587'),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Development overrides
  // Comma-separated list of emails that bypass usage limits (development only).
  DEV_UNLIMITED_EMAILS: z.string().optional(),

  // Monitoring
  SENTRY_DSN: z.string().url().optional(),

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

const isProductionMode = parsed.data.NODE_ENV === 'production';
const mercadoPagoAccessToken = parsed.data.MERCADOPAGO_ACCESS_TOKEN?.trim() || '';
const mercadoPagoPublicKey = parsed.data.MERCADOPAGO_PUBLIC_KEY?.trim() || '';
const mercadoPagoWebhookSecret = parsed.data.MERCADOPAGO_WEBHOOK_SECRET?.trim() || '';
const hasMercadoPagoAccessToken = mercadoPagoAccessToken.length > 0;
const hasMercadoPagoPublicKey = mercadoPagoPublicKey.length > 0;
const hasMercadoPagoWebhookSecret = mercadoPagoWebhookSecret.length > 0;

if (hasMercadoPagoAccessToken !== hasMercadoPagoPublicKey) {
  console.error('❌ Invalid Mercado Pago configuration: set both MERCADOPAGO_ACCESS_TOKEN and MERCADOPAGO_PUBLIC_KEY together.');
  process.exit(1);
}

if (isProductionMode && hasMercadoPagoAccessToken) {
  if (/^TEST[-_]/i.test(mercadoPagoAccessToken) || /^TEST[-_]/i.test(mercadoPagoPublicKey)) {
    console.error('❌ Invalid Mercado Pago configuration: TEST credentials are not allowed in production.');
    process.exit(1);
  }

  if (!hasMercadoPagoWebhookSecret) {
    console.error('❌ Invalid Mercado Pago configuration: MERCADOPAGO_WEBHOOK_SECRET is required in production when billing is enabled.');
    process.exit(1);
  }
}

export const env = {
  // Server
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  apiKey: parsed.data.API_KEY,
  jwtSecret: parsed.data.JWT_SECRET,
  cookieSecret: parsed.data.COOKIE_SECRET,
  baseUrl: parsed.data.BASE_URL || (
    parsed.data.NODE_ENV === 'production' && parsed.data.RENDER_EXTERNAL_HOSTNAME
      ? `https://${parsed.data.RENDER_EXTERNAL_HOSTNAME}`
      : `http://localhost:${parsed.data.PORT}`
  ),
  frontendUrl: parsed.data.FRONTEND_URL || 'http://localhost:8080',
  disableWorker: parsed.data.DISABLE_WORKER === 'true',
  workerConcurrency: Math.max(1, parseInt(parsed.data.WORKER_CONCURRENCY, 10) || 1),
  socialMediaEnabled: parsed.data.SOCIAL_MEDIA_ENABLED === 'true',
  uploadsEnabled: parsed.data.UPLOADS_ENABLED !== 'false',
  directPublishingEnabled: parsed.data.DIRECT_PUBLISHING_ENABLED === 'true',
  schedulerEnabled: parsed.data.SCHEDULER_ENABLED === 'true',
  brandKitEnabled: parsed.data.BRAND_KIT_ENABLED === 'true',
  liveClippingEnabled: parsed.data.LIVE_CLIPPING_ENABLED === 'true',
  betaMode: parsed.data.BETA_MODE === 'true',
  betaAllowlistEmails: (parsed.data.BETA_ALLOWLIST_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean),
  rateLimit: {
    enabled: parsed.data.RATE_LIMIT_ENABLED !== 'false' && parsed.data.NODE_ENV !== 'development',
    register: {
      max: Math.max(1, parseInt(parsed.data.RATE_LIMIT_REGISTER_MAX, 10) || 10),
      windowSeconds: Math.max(1, parseInt(parsed.data.RATE_LIMIT_REGISTER_WINDOW_SECONDS, 10) || 3600),
    },
    login: {
      max: Math.max(1, parseInt(parsed.data.RATE_LIMIT_LOGIN_MAX, 10) || 50),
      windowSeconds: Math.max(1, parseInt(parsed.data.RATE_LIMIT_LOGIN_WINDOW_SECONDS, 10) || 300),
    },
    tempConfig: {
      max: Math.max(1, parseInt(parsed.data.RATE_LIMIT_TEMP_CONFIG_MAX, 10) || 60),
      windowSeconds: Math.max(1, parseInt(parsed.data.RATE_LIMIT_TEMP_CONFIG_WINDOW_SECONDS, 10) || 3600),
    },
    jobStart: {
      max: Math.max(1, parseInt(parsed.data.RATE_LIMIT_JOB_START_MAX, 10) || 20),
      windowSeconds: Math.max(1, parseInt(parsed.data.RATE_LIMIT_JOB_START_WINDOW_SECONDS, 10) || 3600),
    },
  },
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
  localStoragePath: parsed.data.LOCAL_STORAGE_PATH,

  // Redis
  redis: {
    ...(parsed.data.REDIS_URL ? (() => {
      const url = new URL(parsed.data.REDIS_URL);
      const db = url.pathname?.length > 1 ? parseInt(url.pathname.slice(1), 10) : 0;
      return {
        url: parsed.data.REDIS_URL,
        host: url.hostname,
        port: parseInt(url.port || '6379', 10),
        password: url.password || undefined,
        db: Number.isFinite(db) ? db : 0,
        tls: url.protocol === 'rediss:',
      };
    })() : {
      url: undefined,
      host: parsed.data.REDIS_HOST,
      port: parseInt(parsed.data.REDIS_PORT, 10),
      password: parsed.data.REDIS_PASSWORD,
      db: parseInt(parsed.data.REDIS_DB, 10),
      tls: false,
    }),
  },

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

  // Mercado Pago
  mercadoPago: {
    accessToken: hasMercadoPagoAccessToken ? mercadoPagoAccessToken : undefined,
    publicKey: hasMercadoPagoPublicKey ? mercadoPagoPublicKey : undefined,
    webhookSecret: hasMercadoPagoWebhookSecret ? mercadoPagoWebhookSecret : undefined,
    sandboxMode: parsed.data.MERCADOPAGO_SANDBOX_MODE
      ? parsed.data.MERCADOPAGO_SANDBOX_MODE === 'true'
      : !isProductionMode,
  },

  // Email notifications
  notifications: {
    emailEnabled: parsed.data.NOTIFICATIONS_EMAIL_ENABLED === 'true',
    smtpHost: parsed.data.SMTP_HOST,
    smtpPort: Math.max(1, parseInt(parsed.data.SMTP_PORT, 10) || 587),
    smtpSecure: parsed.data.SMTP_SECURE === 'true',
    smtpUser: parsed.data.SMTP_USER,
    smtpPass: parsed.data.SMTP_PASS,
    smtpFrom: parsed.data.SMTP_FROM,
  },

  // Development overrides
  devUnlimitedEmails: (parsed.data.DEV_UNLIMITED_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean),

  // Monitoring
  sentryDsn: parsed.data.SENTRY_DSN,

  // Optional
  ffmpegPath: parsed.data.FFMPEG_PATH,
  youtubeApiKey: parsed.data.YOUTUBE_API_KEY,
  logLevel: parsed.data.LOG_LEVEL,
} as const;
