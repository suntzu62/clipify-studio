import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { registerRoutes } from './api/routes.js';

// Importar worker para iniciar processamento
import './jobs/worker.js';

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

// CORS
await app.register(cors, {
  origin: true, // Permitir todos os origins em dev, configurar para produção
  credentials: true,
});

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
app.addHook('onRequest', async (request, reply) => {
  // Skip auth para health check
  if (request.url === '/health') {
    return;
  }

  // Verificar API Key
  const apiKey = request.headers['x-api-key'] || request.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey || apiKey !== env.apiKey) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Invalid or missing API key',
    });
  }
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
