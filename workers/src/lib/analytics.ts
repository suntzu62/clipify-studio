import { PostHog } from 'posthog-node';

export const ph = new PostHog(process.env.POSTHOG_KEY || '', {
  host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
  flushAt: 1,
  flushInterval: 500,
});

export async function track(distinctId: string, event: string, properties: Record<string, any> = {}) {
  if (!process.env.POSTHOG_KEY) return; // no-op when not configured
  ph.capture({ distinctId, event, properties });
}

export async function shutdown() {
  // Optional in newer SDKs
  // @ts-ignore
  if (typeof ph.shutdownAsync === 'function') {
    // @ts-ignore
    await ph.shutdownAsync();
  } else if (typeof (ph as any).shutdown === 'function') {
    await new Promise<void>((resolve) => (ph as any).shutdown(() => resolve()));
  }
}

