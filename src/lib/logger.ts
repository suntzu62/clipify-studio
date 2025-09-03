import posthog from 'posthog-js';

export const log = {
  info: (msg: string, props?: any) => {
    console.info(msg, props);
    posthog.capture?.('info', { msg, ...props });
  },
  warn: (msg: string, props?: any) => {
    console.warn(msg, props);
    posthog.capture?.('warn', { msg, ...props });
  },
  error: (msg: string, props?: any) => {
    console.error(msg, props);
    posthog.capture?.('error', { msg, ...props });
  },
};

