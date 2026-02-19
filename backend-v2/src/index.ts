import { initSentry, Sentry } from './config/sentry.js';
initSentry();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { registerRoutes } from './api/routes.js';
import { runMigrations } from './scripts/migrate.js';

// Run DB migrations before starting API/worker (safe to run in both processes via advisory lock)
try {
  await runMigrations();
} catch (error) {
  logger.error(error, 'Failed to run migrations');
  process.exit(1);
}

// Importar worker para iniciar processamento (pode ser desativado para separar API e Worker)
if (!env.disableWorker) {
  logger.info('Worker starting in API process');
  await import('./jobs/worker.js');
} else {
  logger.info('Worker disabled (DISABLE_WORKER=true)');
}

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

// CORS - permitir credentials (cookies httpOnly)
await app.register(cors, {
  origin: env.isDevelopment
    ? true // Dev: permitir todos os origins
    : [env.frontendUrl, env.baseUrl, 'https://cortai.com.br', 'https://www.cortai.com.br'], // Prod: apenas domínios autorizados
  credentials: true, // CRITICAL: permite envio de cookies httpOnly
});

// Cookies (para httpOnly JWT tokens)
await app.register(cookie, {
  secret: env.cookieSecret,
  parseOptions: {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
  },
});

// Multipart (para upload de arquivos)
await app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB
  },
});

// ============================================
// REGISTRAR ROTAS
// ============================================
// Nota: Autenticação JWT é feita por rota usando o middleware authenticateJWT
// Tokens são enviados via httpOnly cookies para segurança contra XSS
await registerRoutes(app);

// ============================================
// ERROR HANDLER
// ============================================
app.setErrorHandler((error, request, reply) => {
  Sentry.captureException(error, {
    extra: { url: request.url, method: request.method },
    user: { id: (request as any).userId },
  });

  logger.error({
    error: error.message,
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
  logger.info({ port: env.port, env: env.nodeEnv }, 'Server started');
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
    await Sentry.flush(2000);
    await app.close();
    process.exit(0);
  });
});
