import { invokeFn } from './api';

export type UsageDTO = {
  plan: string;
  status: string;
  minutesUsed: number;
  minutesQuota: number;
  minutesRemaining: number;
  remaining: number;
  periodEnd: string;
};

export async function getUsage(headers?: Record<string, string>) {
  return invokeFn<UsageDTO>('get-usage', { method: 'POST', headers });
}

export async function ensureQuota(neededMinutes: number, headers?: Record<string, string>) {
  const usage = await getUsage(headers);
  const remaining = usage.minutesRemaining || usage.remaining || 0;
  if (remaining < neededMinutes) {
    throw { status: 402, message: 'Quota exceeded', remaining };
  }
}

export async function incrementUsage(
  { minutes = 0, shorts = 0 }: { minutes?: number; shorts?: number },
  { idempotencyKey }: { idempotencyKey: string },
  headers?: Record<string, string>
) {
  return invokeFn<UsageDTO>('increment-usage', {
    method: 'POST',
    body: { minutes, shorts, idempotencyKey },
    headers,
  });
}

