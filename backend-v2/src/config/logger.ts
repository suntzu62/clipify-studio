import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["x-signature"]',
      'headers.authorization',
      'headers.cookie',
      'headers["x-api-key"]',
      'headers["x-signature"]',
      'authorization',
      'cookie',
      '["x-api-key"]',
      '["x-signature"]',
      'password',
      'password_hash',
      'accessToken',
      'refreshToken',
      'access_token',
      'refresh_token',
      'apiKey',
      'api_key',
      'clientSecret',
      'client_secret',
      'secret',
      'token',
    ],
    censor: '[REDACTED]',
  },
  transport: env.isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

// Helper para criar child loggers com contexto
export function createLogger(context: string) {
  return logger.child({ context });
}
