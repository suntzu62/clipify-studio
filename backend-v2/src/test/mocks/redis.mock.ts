import { vi } from 'vitest';

export const mockRedisGet = vi.fn();
export const mockRedisSet = vi.fn();
export const mockRedisDel = vi.fn();
export const mockRedisExpire = vi.fn();
export const mockRedisKeys = vi.fn();
export const mockRedisPing = vi.fn();
export const mockRedisQuit = vi.fn();
export const mockRedisHget = vi.fn();
export const mockRedisHset = vi.fn();
export const mockRedisHgetall = vi.fn();
export const mockRedisIncr = vi.fn();
export const mockRedisDecr = vi.fn();
export const mockRedisTtl = vi.fn();

export const mockRedisClient = {
  get: mockRedisGet,
  set: mockRedisSet,
  del: mockRedisDel,
  expire: mockRedisExpire,
  keys: mockRedisKeys,
  ping: mockRedisPing,
  quit: mockRedisQuit,
  hget: mockRedisHget,
  hset: mockRedisHset,
  hgetall: mockRedisHgetall,
  incr: mockRedisIncr,
  decr: mockRedisDecr,
  ttl: mockRedisTtl,
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  status: 'ready',
};

export const MockRedis = vi.fn().mockImplementation(() => mockRedisClient);

export function setupRedisMock() {
  vi.mock('ioredis', () => ({
    default: MockRedis,
    Redis: MockRedis,
  }));
}

export function resetRedisMock() {
  mockRedisGet.mockReset();
  mockRedisSet.mockReset();
  mockRedisDel.mockReset();
  mockRedisExpire.mockReset();
  mockRedisKeys.mockReset();
  mockRedisPing.mockReset();
  mockRedisQuit.mockReset();
  mockRedisHget.mockReset();
  mockRedisHset.mockReset();
  mockRedisHgetall.mockReset();
  mockRedisIncr.mockReset();
  mockRedisDecr.mockReset();
  mockRedisTtl.mockReset();
}

// Helper to set up common responses
export function setupRedisResponses(responses: Record<string, any>) {
  mockRedisGet.mockImplementation(async (key: string) => {
    return responses[key] ?? null;
  });
}

// Helper to simulate key-value store
export function createMockRedisStore() {
  const store = new Map<string, any>();

  mockRedisGet.mockImplementation(async (key: string) => store.get(key) ?? null);
  mockRedisSet.mockImplementation(async (key: string, value: any) => {
    store.set(key, value);
    return 'OK';
  });
  mockRedisDel.mockImplementation(async (key: string) => {
    const had = store.has(key);
    store.delete(key);
    return had ? 1 : 0;
  });
  mockRedisKeys.mockImplementation(async (pattern: string) => {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(store.keys()).filter(k => regex.test(k));
  });

  return store;
}
