import { vi } from 'vitest';

export interface MockQueryResult {
  rows: any[];
  rowCount: number;
}

export const mockQueryFn = vi.fn<[string, any[]?], Promise<MockQueryResult>>();

export const mockPool = {
  query: mockQueryFn,
  connect: vi.fn().mockResolvedValue({
    query: mockQueryFn,
    release: vi.fn(),
  }),
  end: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
};

export function createMockPool() {
  return mockPool;
}

export function resetDatabaseMock() {
  mockQueryFn.mockReset();
}

export function mockQueryResult(rows: any[], rowCount?: number): MockQueryResult {
  return {
    rows,
    rowCount: rowCount ?? rows.length,
  };
}

export function setupDatabaseMock() {
  vi.mock('pg', () => ({
    Pool: vi.fn(() => mockPool),
  }));
}

// Helper to set up common query responses
export function setupQueryResponses(responses: Record<string, MockQueryResult>) {
  mockQueryFn.mockImplementation(async (query: string) => {
    for (const [pattern, result] of Object.entries(responses)) {
      if (query.includes(pattern)) {
        return result;
      }
    }
    return { rows: [], rowCount: 0 };
  });
}
