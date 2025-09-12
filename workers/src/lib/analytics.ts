import { PostHog } from 'posthog-node';

let ph: PostHog | null = null;
if (process.env.POSTHOG_KEY) {
  ph = new PostHog(process.env.POSTHOG_KEY, {
    host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
    flushAt: 1,
    flushInterval: 500,
  });
}

export async function track(
  distinctId: string,
  event: string,
  properties: Record<string, any> = {}
) {
  if (!ph) return; // no-op when not configured
  ph.capture({ distinctId, event, properties });
}

export async function shutdown() {
  if (!ph) return;
  // Optional in newer SDKs
  // @ts-ignore
  if (typeof ph.shutdownAsync === 'function') {
    // @ts-ignore
    await ph.shutdownAsync();
  } else if (typeof (ph as any).shutdown === 'function') {
    await new Promise<void>((resolve) => (ph as any).shutdown(() => resolve()));
  }
}
