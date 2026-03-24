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

// ============================================
// CRIAR SERVIDOR FASTIFY
// ============================================
const app = Fastify({
  logger: logger as any,
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false,
  bodyLimit: 100 * 1024 * 1024, // 100MB para uploads
});

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
const allowedOrigins = env.isDevelopment
  ? [/localhost:\d+$/, /127\.0\.0\.1:\d+$/]
  : [
      env.frontendUrl,
      // Add any other production domains here
    ].filter(Boolean) as string[];

await app.register(cors, {
  origin: allowedOrigins,
  credentials: true,
});

// Cookie parser (necessario para auth via httpOnly cookies)
await app.register(cookie);

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
app.addHook('onRequest', async (request, reply) => {
  // Skip API key para rotas publicas e fluxo de autenticacao
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

  if (request.url === '/health' || publicPrefixes.some((prefix) => request.url.startsWith(prefix))) {
    return;
  }

  const xApiKey = request.headers['x-api-key'];
  const bearerToken = request.headers['authorization']?.replace('Bearer ', '');
  const cookieToken = (request.cookies as { access_token?: string } | undefined)?.access_token;

  // 1) API key explicita (recomendado para integrações internas)
  //    Still try to decode JWT cookie so request.user is available for
  //    admin and other user-scoped endpoints.
  if (xApiKey && xApiKey === env.apiKey) {
    for (const token of [cookieToken, bearerToken]) {
      if (!token || token === env.apiKey) continue;
      const decoded = verifyToken(token);
      if (decoded) { (request as any).user = decoded; break; }
    }
    return;
  }

  // 2) Compatibilidade: Bearer <api-key>
  if (bearerToken && bearerToken === env.apiKey) {
    if (cookieToken) {
      const decoded = verifyToken(cookieToken);
      if (decoded) (request as any).user = decoded;
    }
    return;
  }

  // 3) JWT válido (fluxo autenticado por usuário), via header ou cookie
  for (const token of [bearerToken, cookieToken]) {
    if (!token) continue;
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
  logger.info(`🔧 API Key authentication enabled`);

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
