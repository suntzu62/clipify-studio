import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { registerRoutes } from './api/routes.js';
import { verifyToken } from './services/auth.service.js';
import { getJobExecutionDecision } from './jobs/execution-mode.js';
import { recoverStaleInlineJobs } from './jobs/inline-queue.js';
import { pool } from './services/database.service.js';
import {
  getRequestOrigin,
  isAllowedOrigin as isAllowedSecurityOrigin,
  isMutationMethod,
} from './utils/security.js';

// ============================================
// CRIAR SERVIDOR FASTIFY
// ============================================
const app = Fastify({
  logger: logger as any,
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false,
  bodyLimit: 100 * 1024 * 1024, // 100MB para uploads
  trustProxy: env.security.trustProxy,
});

const allowedOrigins = Array.from(
  new Set([
    env.frontendUrl,
    env.baseUrl,
    ...env.security.corsAllowedOrigins,
    ...(env.isDevelopment
      ? [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3001',
          'http://localhost:8080',
          'http://127.0.0.1:8080',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
        ]
      : []),
  ].filter(Boolean))
);
const internalApiPrefixes = ['/internal/', '/queue/stats', '/health/details'];
const publicPrefixes = [
  '/clips/',
  '/auth/',
  '/plans',
  '/payments/config',
  '/webhooks/mercadopago',
  '/payments/webhooks/mercadopago',
  '/payments/success',
  '/payments/failure',
  '/payments/pending',
];
const originCheckExemptPrefixes = [
  '/internal/',
  '/webhooks/mercadopago',
  '/payments/webhooks/mercadopago',
];

function isAllowedRequestOrigin(origin: string | undefined | null): boolean {
  if (!origin) {
    return false;
  }

  return isAllowedSecurityOrigin(origin, allowedOrigins);
}

function isAllowedReferer(referer: string | undefined): boolean {
  if (!referer) {
    return false;
  }

  return isAllowedRequestOrigin(getRequestOrigin(undefined, referer));
}

// ============================================
// PLUGINS
// ============================================

// Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, etc.)
await app.register(helmet, {
  contentSecurityPolicy: false, // CSP handled via frontend meta tag
  crossOriginResourcePolicy: {
    policy: 'cross-origin',
  },
});

// Rate limiting — protect against brute force and abuse
await app.register(rateLimit, {
  max: 100, // 100 requests per window
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    // Use user ID if authenticated, otherwise IP
    return (request as any).user?.userId || request.ip;
  },
  errorResponseBuilder: (_request, context) => ({
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Muitas requisições. Tente novamente em ${Math.ceil((context.ttl || 60000) / 1000)} segundos.`,
    retryAfter: Math.ceil((context.ttl || 60000) / 1000),
  }),
});

// CORS — whitelist allowed origins
await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || isAllowedRequestOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
  maxAge: 600,
  strictPreflight: true,
});

// Cookie parser (necessario para auth via httpOnly cookies)
await app.register(cookie);

app.addHook('onRequest', async (request, reply) => {
  if (!env.security.strictOriginChecks) {
    return;
  }

  if (!isMutationMethod(request.method)) {
    return;
  }

  const requestPath = request.url.split('?')[0] || request.url;
  if (originCheckExemptPrefixes.some((prefix) => requestPath.startsWith(prefix))) {
    return;
  }

  const origin = request.headers.origin;
  const referer = request.headers.referer;

  if (
    (origin && !isAllowedRequestOrigin(origin)) ||
    (!origin && referer && !isAllowedReferer(referer))
  ) {
    return reply.status(403).send({
      error: 'INVALID_ORIGIN',
      message: 'Origin not allowed',
    });
  }
});

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
app.addHook('onRequest', async (request, reply) => {
  const requestPath = request.url.split('?')[0] || request.url;

  if (requestPath === '/health' || publicPrefixes.some((prefix) => requestPath.startsWith(prefix))) {
    return;
  }

  const xApiKey = request.headers['x-api-key'];
  const bearerToken = request.headers['authorization']?.replace('Bearer ', '');
  const cookieToken = (request.cookies as { access_token?: string } | undefined)?.access_token;
  const internalRequest = internalApiPrefixes.some((prefix) => requestPath.startsWith(prefix));
  const hasValidInternalApiKey =
    Boolean(env.internalApiKey) &&
    (xApiKey === env.internalApiKey || bearerToken === env.internalApiKey);

  if (internalRequest) {
    if (!env.internalApiKey) {
      return reply.status(503).send({
        error: 'INTERNAL_API_NOT_CONFIGURED',
        message: 'Internal API key not configured',
      });
    }

    if (!hasValidInternalApiKey) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid or missing internal API key',
      });
    }

    for (const token of [cookieToken, bearerToken]) {
      if (!token || token === env.apiKey) continue;
      const decoded = verifyToken(token);
      if (decoded) {
        (request as any).user = decoded;
        break;
      }
    }

    return;
  }

  // JWT válido (fluxo autenticado por usuário), via header ou cookie.
  // A API_KEY pública do frontend não pode mais autenticar rotas de usuário.
  for (const token of [bearerToken, cookieToken]) {
    if (!token || token === env.apiKey) continue;
    const decoded = verifyToken(token);
    if (decoded) {
      (request as any).user = decoded;
      return;
    }
  }

  return reply.status(401).send({
    error: 'UNAUTHORIZED',
    message: 'Invalid or missing API key/token',
  });
});

// ============================================
// REGISTRAR ROTAS
// ============================================
await registerRoutes(app);

// ============================================
// ERROR HANDLER
// ============================================
app.setErrorHandler((error, request, reply) => {
  logger.error({
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
  }, 'Request error');

  reply.status(500).send({
    error: 'INTERNAL_SERVER_ERROR',
    message: env.isDevelopment ? error.message : 'An unexpected error occurred',
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
try {
  await app.listen({ port: env.port, host: '0.0.0.0' });
  logger.info(`🚀 Server running on http://localhost:${env.port}`);
  logger.info(`📝 Environment: ${env.nodeEnv}`);
  logger.info({
    userAuth: 'jwt_or_cookie',
    internalApiKeyConfigured: Boolean(env.internalApiKey),
  }, 'Security gates configured');

  const jobExecution = await getJobExecutionDecision();
  logger.info(jobExecution, 'Job execution mode resolved');

  if (jobExecution.mode === 'queue') {
    try {
      await import('./jobs/worker.js');
      logger.info('👷 Worker loaded');
    } catch (workerError: any) {
      logger.error(
        { error: workerError?.message || workerError },
        'Worker failed to load; API will continue running with fallback processing'
      );
    }
  } else {
    logger.warn(jobExecution, 'Skipping BullMQ worker startup; jobs will run inline');
    const recoveredJobs = await recoverStaleInlineJobs();
    logger.info({ recoveredJobs }, 'Inline queue recovery completed');
  }
  // ============================================
  // PERIODIC STALL RECOVERY (every 5 min)
  // ============================================
  const STALL_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const STALL_THRESHOLD_MINUTES = 30;

  const recoverStalledJobs = async () => {
    try {
      const result = await pool.query(
        `UPDATE jobs
         SET status = 'failed',
             error = 'O processamento travou e foi encerrado automaticamente. Tente criar um novo projeto.',
             updated_at = NOW()
         WHERE status IN ('active', 'processing', 'queued')
           AND updated_at < NOW() - INTERVAL '${STALL_THRESHOLD_MINUTES} minutes'
         RETURNING id, current_step`
      );
      if (result.rowCount && result.rowCount > 0) {
        logger.warn(
          { count: result.rowCount, jobs: result.rows },
          'Auto-recovered stalled jobs'
        );
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'Stall recovery sweep failed');
    }
  };

  // Run once at startup, then periodically
  await recoverStalledJobs();
  setInterval(recoverStalledJobs, STALL_CHECK_INTERVAL_MS);
  logger.info(`🔄 Stall recovery sweep running every ${STALL_CHECK_INTERVAL_MS / 60000} min`);

} catch (error) {
  logger.error(error, 'Failed to start server');
  process.exit(1);
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
const signals = ['SIGTERM', 'SIGINT'];

signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`${signal} received, closing server...`);
    await app.close();
    process.exit(0);
  });
});
