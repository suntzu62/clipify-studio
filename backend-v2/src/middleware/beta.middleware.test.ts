import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted for variables used in mock factories
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    betaMode: false,
    betaAllowlistEmails: [] as string[],
  },
}));

vi.mock('../config/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../config/env.js', () => ({
  env: mockEnv,
}));

import { requireBetaAllowlist } from './beta.middleware.js';
import {
  createAuthenticatedRequest,
  createMockReply,
  createMockRequest,
} from '../test/helpers/fastify.helper.js';

describe('beta.middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.betaMode = false;
    mockEnv.betaAllowlistEmails = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should no-op when beta mode is disabled', async () => {
    const { reply, state } = createMockReply();
    const request = createAuthenticatedRequest('user-123', 'test@example.com');

    await requireBetaAllowlist(request, reply);

    expect(state.sent).toBe(false);
  });

  it('should no-op when allowlist is empty (even if beta mode is enabled)', async () => {
    mockEnv.betaMode = true;
    mockEnv.betaAllowlistEmails = [];

    const { reply, state } = createMockReply();
    const request = createAuthenticatedRequest('user-123', 'test@example.com');

    await requireBetaAllowlist(request, reply);

    expect(state.sent).toBe(false);
  });

  it('should return 401 when user is missing', async () => {
    mockEnv.betaMode = true;
    mockEnv.betaAllowlistEmails = ['allowed@example.com'];

    const { reply, state } = createMockReply();
    const request = createMockRequest({});

    await requireBetaAllowlist(request, reply);

    expect(state.statusCode).toBe(401);
    expect(state.body.error).toBe('UNAUTHORIZED');
  });

  it('should allow allowlisted users', async () => {
    mockEnv.betaMode = true;
    mockEnv.betaAllowlistEmails = ['allowed@example.com'];

    const { reply, state } = createMockReply();
    const request = createAuthenticatedRequest('user-123', 'allowed@example.com');

    await requireBetaAllowlist(request, reply);

    expect(state.sent).toBe(false);
  });

  it('should block non-allowlisted users with 403', async () => {
    mockEnv.betaMode = true;
    mockEnv.betaAllowlistEmails = ['allowed@example.com'];

    const { reply, state } = createMockReply();
    const request = createAuthenticatedRequest('user-123', 'blocked@example.com');

    await requireBetaAllowlist(request, reply);

    expect(state.statusCode).toBe(403);
    expect(state.body.error).toBe('BETA_CLOSED');
  });
});

