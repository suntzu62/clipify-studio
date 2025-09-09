import baseLogger from '../logger';

// Backward-compatible logger helper expected by some modules
export function createLogger(name: string) {
  try {
    // pino child logger with contextual name
    // @ts-ignore
    if (typeof baseLogger.child === 'function') return baseLogger.child({ name });
  } catch {}
  return baseLogger as any;
}

export const logger = baseLogger;

export default baseLogger;

