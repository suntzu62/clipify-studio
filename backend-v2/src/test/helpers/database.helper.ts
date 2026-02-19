import { vi } from 'vitest';
import { mockQueryFn, mockQueryResult, type MockQueryResult } from '../mocks/database.mock.js';

export type QueryMatcher = string | RegExp | ((query: string) => boolean);

export interface QuerySetup {
  matcher: QueryMatcher;
  result: MockQueryResult;
}

// Helper to match queries
function matchQuery(query: string, matcher: QueryMatcher): boolean {
  if (typeof matcher === 'string') {
    return query.includes(matcher);
  }
  if (matcher instanceof RegExp) {
    return matcher.test(query);
  }
  return matcher(query);
}

// Setup multiple query responses
export function setupQueries(queries: QuerySetup[]) {
  mockQueryFn.mockImplementation(async (query: string) => {
    for (const { matcher, result } of queries) {
      if (matchQuery(query, matcher)) {
        return result;
      }
    }
    // Default empty result
    return { rows: [], rowCount: 0 };
  });
}

// Setup a single query response
export function mockQuery(matcher: QueryMatcher, rows: any[], rowCount?: number) {
  const existing = mockQueryFn.getMockImplementation();

  mockQueryFn.mockImplementation(async (query: string, params?: any[]) => {
    if (matchQuery(query, matcher)) {
      return mockQueryResult(rows, rowCount);
    }
    if (existing) {
      return existing(query, params);
    }
    return { rows: [], rowCount: 0 };
  });
}

// Setup query to throw error
export function mockQueryError(matcher: QueryMatcher, error: Error | string) {
  const existing = mockQueryFn.getMockImplementation();

  mockQueryFn.mockImplementation(async (query: string, params?: any[]) => {
    if (matchQuery(query, matcher)) {
      throw typeof error === 'string' ? new Error(error) : error;
    }
    if (existing) {
      return existing(query, params);
    }
    return { rows: [], rowCount: 0 };
  });
}

// Reset all query mocks
export function resetQueryMocks() {
  mockQueryFn.mockReset();
  mockQueryFn.mockResolvedValue({ rows: [], rowCount: 0 });
}

// Helper to verify query was called with specific parameters
export function expectQueryCalledWith(matcher: QueryMatcher, expectedParams?: any[]) {
  const calls = mockQueryFn.mock.calls;
  const matchingCall = calls.find(([query]) => matchQuery(query, matcher));

  expect(matchingCall).toBeDefined();

  if (expectedParams && matchingCall) {
    expect(matchingCall[1]).toEqual(expectedParams);
  }

  return matchingCall;
}

// Helper to verify query was not called
export function expectQueryNotCalled(matcher: QueryMatcher) {
  const calls = mockQueryFn.mock.calls;
  const matchingCall = calls.find(([query]) => matchQuery(query, matcher));
  expect(matchingCall).toBeUndefined();
}

// Helper to count query calls
export function countQueryCalls(matcher: QueryMatcher): number {
  const calls = mockQueryFn.mock.calls;
  return calls.filter(([query]) => matchQuery(query, matcher)).length;
}

// Common query patterns
export const QueryPatterns = {
  // Users/Profiles
  selectUserByEmail: 'SELECT id FROM profiles WHERE email',
  selectUserById: 'SELECT * FROM profiles WHERE id',
  insertUser: 'INSERT INTO profiles',
  updateUser: 'UPDATE profiles',

  // Subscriptions
  selectActiveSubscription: 'FROM subscriptions s',
  insertSubscription: 'INSERT INTO subscriptions',
  updateSubscription: 'UPDATE subscriptions',

  // Plans
  selectPlans: 'FROM plans',
  selectPlanById: 'SELECT * FROM plans WHERE id',

  // Payments
  insertPayment: 'INSERT INTO payments',
  updatePayment: 'UPDATE payments',

  // Usage
  selectUsage: 'FROM usage_records',
  insertUsage: 'INSERT INTO usage_records',

  // Jobs
  selectJobById: 'SELECT * FROM jobs WHERE id',
  insertJob: 'INSERT INTO jobs',
  updateJob: 'UPDATE jobs',

  // Clips
  selectClipById: 'SELECT * FROM clips WHERE id',
  selectClipsByJob: 'FROM clips WHERE job_id',
  insertClip: 'INSERT INTO clips',
  updateClip: 'UPDATE clips',
};

// Setup for common subscription scenarios
export function setupNoSubscription(userId: string) {
  mockQuery(QueryPatterns.selectActiveSubscription, []);
}

export function setupActiveSubscription(subscription: any) {
  mockQuery(QueryPatterns.selectActiveSubscription, [subscription]);
}

// Setup for common user scenarios
export function setupUserExists(user: any) {
  mockQuery(QueryPatterns.selectUserByEmail, [{ id: user.id }]);
  mockQuery(QueryPatterns.selectUserById, [user]);
}

export function setupUserNotExists() {
  mockQuery(QueryPatterns.selectUserByEmail, []);
  mockQuery(QueryPatterns.selectUserById, []);
}
