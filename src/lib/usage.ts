import { invokeFn } from './api';

export type UsageDTO = {
  plan: string;
  status: string;
  minutesUsed: number;
  minutesQuota: number;
  remaining: number;
  periodEnd: string;
};

export async function getUsage(headers?: Record<string, string>) {
  return invokeFn<UsageDTO>('usage', { method: 'GET', headers });
}

export async function ensureQuota(neededMinutes: number, headers?: Record<string, string>) {
  const usage = await getUsage(headers);
  if (usage.remaining < neededMinutes) {
    throw { status: 402, message: 'Quota exceeded', remaining: usage.remaining };
  }
}

export async function incrementUsage(
  { minutes = 0, shorts = 0 }: { minutes?: number; shorts?: number },
  { idempotencyKey }: { idempotencyKey: string },
  headers?: Record<string, string>
) {
  return invokeFn<UsageDTO>('usage', {
    method: 'POST',
    body: { minutes, shorts, idempotencyKey },
    headers,
  });
}

