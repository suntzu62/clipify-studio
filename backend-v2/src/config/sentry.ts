import * as Sentry from '@sentry/node';
import { env } from './env.js';

export function initSentry() {
  if (!env.sentryDsn) return;

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    tracesSampleRate: env.isProduction ? 0.2 : 1.0,
    enabled: env.isProduction,
  });
}

export { Sentry };
