import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted for variables used in mock factories
const {
  mockEnv,
  mockCheckUserLimits,
  mockGetUserSubscription,
  mockIncrementUsage,
} = vi.hoisted(() => ({
  mockEnv: {
    isDevelopment: false,
    devUnlimitedEmails: [] as string[],
  },
  mockCheckUserLimits: vi.fn(),
  mockGetUserSubscription: vi.fn(),
  mockIncrementUsage: vi.fn(),
}));

// Mock logger
vi.mock('../config/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock env
vi.mock('../config/env.js', () => ({
  env: mockEnv,
}));

// Mock mercadopago service
vi.mock('../services/mercadopago.service.js', () => ({
  checkUserLimits: mockCheckUserLimits,
  getUserSubscription: mockGetUserSubscription,
  incrementUsage: mockIncrementUsage,
}));

import {
  checkClipLimit,
  checkMinuteLimit,
  requirePlan,
  requireFeature,
  trackClipUsage,
  trackMinuteUsage,
} from './subscription.middleware.js';
import {
  createMockRequest,
  createMockReply,
  createAuthenticatedRequest,
} from '../test/helpers/fastify.helper.js';

describe('subscription.middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.isDevelopment = false;
    mockEnv.devUnlimitedEmails = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkClipLimit', () => {
    it('should return 401 when user not authenticated', async () => {
      const { reply, state } = createMockReply();
      const request = createMockRequest({});

      await checkClipLimit(request, reply);

      expect(state.statusCode).toBe(401);
      expect(state.body.error).toBe('UNAUTHORIZED');
    });

    it('should allow request when user has available clips', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockCheckUserLimits.mockResolvedValueOnce({
        canUse: true,
        currentUsage: 10,
        maxAllowed: 100,
        planName: 'Pro',
        subscription: { id: 'sub-123' },
      });

      await checkClipLimit(request, reply);

      expect(state.sent).toBe(false);
      expect((request as any).userLimits).toBeDefined();
      expect((request as any).userLimits.canUse).toBe(true);
    });

    it('should return 403 when clip limit exceeded', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockCheckUserLimits.mockResolvedValueOnce({
        canUse: false,
        currentUsage: 100,
        maxAllowed: 100,
        planName: 'Pro',
        subscription: null,
      });

      await checkClipLimit(request, reply);

      expect(state.statusCode).toBe(403);
      expect(state.body.error).toBe('LIMIT_EXCEEDED');
      expect(state.body.upgradeUrl).toBe('/billing');
    });

    it('should bypass limits for dev unlimited users in development', async () => {
      mockEnv.isDevelopment = true;
      mockEnv.devUnlimitedEmails = ['dev@unlimited.test'];

      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'dev@unlimited.test');

      await checkClipLimit(request, reply);

      expect(state.sent).toBe(false);
      expect((request as any).userLimits.planName).toBe('Dev (Ilimitado)');
      expect((request as any).userLimits.maxAllowed).toBe(1_000_000);
      expect(mockCheckUserLimits).not.toHaveBeenCalled();
    });

    it('should not bypass for dev email in production', async () => {
      mockEnv.isDevelopment = false;
      mockEnv.devUnlimitedEmails = ['dev@unlimited.test'];

      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'dev@unlimited.test');

      mockCheckUserLimits.mockResolvedValueOnce({
        canUse: false,
        currentUsage: 5,
        maxAllowed: 5,
        planName: 'Grátis',
        subscription: null,
      });

      await checkClipLimit(request, reply);

      expect(mockCheckUserLimits).toHaveBeenCalled();
      expect(state.statusCode).toBe(403);
    });

    it('should handle errors gracefully (fail-open)', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockCheckUserLimits.mockRejectedValueOnce(new Error('Database error'));

      await checkClipLimit(request, reply);

      expect(state.sent).toBe(false); // Should not block on error
    });
  });

  describe('checkMinuteLimit', () => {
    it('should return 401 when user not authenticated', async () => {
      const { reply, state } = createMockReply();
      const request = createMockRequest({});

      await checkMinuteLimit(request, reply);

      expect(state.statusCode).toBe(401);
      expect(state.body.error).toBe('UNAUTHORIZED');
    });

    it('should allow request when user has available minutes', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockCheckUserLimits.mockResolvedValueOnce({
        canUse: true,
        currentUsage: 100,
        maxAllowed: 600,
        planName: 'Starter',
        subscription: { id: 'sub-123' },
      });

      await checkMinuteLimit(request, reply);

      expect(state.sent).toBe(false);
      expect(mockCheckUserLimits).toHaveBeenCalledWith('user-123', 'minute');
    });

    it('should return 403 when minute limit exceeded', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockCheckUserLimits.mockResolvedValueOnce({
        canUse: false,
        currentUsage: 600,
        maxAllowed: 600,
        planName: 'Starter',
        subscription: null,
      });

      await checkMinuteLimit(request, reply);

      expect(state.statusCode).toBe(403);
      expect(state.body.error).toBe('LIMIT_EXCEEDED');
      expect(state.body.message).toContain('minutos');
    });

    it('should bypass for dev unlimited users', async () => {
      mockEnv.isDevelopment = true;
      mockEnv.devUnlimitedEmails = ['dev@test.com'];

      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'dev@test.com');

      await checkMinuteLimit(request, reply);

      expect(state.sent).toBe(false);
      expect(mockCheckUserLimits).not.toHaveBeenCalled();
    });
  });

  describe('requirePlan', () => {
    it('should return 401 when user not authenticated', async () => {
      const { reply, state } = createMockReply();
      const request = createMockRequest({});
      const middleware = requirePlan(['plan_pro', 'plan_enterprise']);

      await middleware(request, reply);

      expect(state.statusCode).toBe(401);
    });

    it('should allow access when user has required plan', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockGetUserSubscription.mockResolvedValueOnce({
        id: 'sub-123',
        plan_id: 'plan_pro',
      });

      const middleware = requirePlan(['plan_pro', 'plan_enterprise']);
      await middleware(request, reply);

      expect(state.sent).toBe(false);
      expect((request as any).subscription).toBeDefined();
    });

    it('should return 403 when user does not have required plan', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockGetUserSubscription.mockResolvedValueOnce({
        id: 'sub-123',
        plan_id: 'plan_starter',
      });

      const middleware = requirePlan(['plan_pro', 'plan_enterprise']);
      await middleware(request, reply);

      expect(state.statusCode).toBe(403);
      expect(state.body.error).toBe('PLAN_REQUIRED');
    });

    it('should use plan_free when user has no subscription', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockGetUserSubscription.mockResolvedValueOnce(null);

      const middleware = requirePlan(['plan_pro']);
      await middleware(request, reply);

      expect(state.statusCode).toBe(403);
      expect(state.body.details.currentPlan).toBe('plan_free');
    });

    it('should allow access for plan_free when required', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockGetUserSubscription.mockResolvedValueOnce(null);

      const middleware = requirePlan(['plan_free', 'plan_starter']);
      await middleware(request, reply);

      expect(state.sent).toBe(false);
    });
  });

  describe('requireFeature', () => {
    it('should return 401 when user not authenticated', async () => {
      const { reply, state } = createMockReply();
      const request = createMockRequest({});
      const middleware = requireFeature('api_access');

      await middleware(request, reply);

      expect(state.statusCode).toBe(401);
    });

    it('should allow access when user has required feature', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockGetUserSubscription.mockResolvedValueOnce({
        id: 'sub-123',
        plan_id: 'plan_pro',
        has_api_access: true,
      });

      const middleware = requireFeature('api_access');
      await middleware(request, reply);

      expect(state.sent).toBe(false);
    });

    it('should return 403 when feature not available', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockGetUserSubscription.mockResolvedValueOnce({
        id: 'sub-123',
        plan_id: 'plan_starter',
        has_api_access: false,
      });

      const middleware = requireFeature('api_access');
      await middleware(request, reply);

      expect(state.statusCode).toBe(403);
      expect(state.body.error).toBe('FEATURE_NOT_AVAILABLE');
    });

    it('should check priority_processing feature', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockGetUserSubscription.mockResolvedValueOnce({
        id: 'sub-123',
        has_priority_processing: true,
      });

      const middleware = requireFeature('priority_processing');
      await middleware(request, reply);

      expect(state.sent).toBe(false);
    });

    it('should check custom_branding feature', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockGetUserSubscription.mockResolvedValueOnce({
        id: 'sub-123',
        has_custom_branding: false,
      });

      const middleware = requireFeature('custom_branding');
      await middleware(request, reply);

      expect(state.statusCode).toBe(403);
    });

    it('should return 403 when no subscription', async () => {
      const { reply, state } = createMockReply();
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockGetUserSubscription.mockResolvedValueOnce(null);

      const middleware = requireFeature('api_access');
      await middleware(request, reply);

      expect(state.statusCode).toBe(403);
    });
  });

  describe('trackClipUsage', () => {
    it('should track usage on successful response', async () => {
      const { reply } = createMockReply();
      reply.statusCode = 200;
      const request = createAuthenticatedRequest('user-123', 'test@example.com', {
        body: { jobId: 'job-123' },
      });

      await trackClipUsage(request, reply);

      expect(mockIncrementUsage).toHaveBeenCalledWith(
        'user-123',
        'clip',
        1,
        'job-123',
        'job',
        'job-123:clip'
      );
    });

    it('should not track usage on error response', async () => {
      const { reply } = createMockReply();
      reply.statusCode = 400;
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      await trackClipUsage(request, reply);

      expect(mockIncrementUsage).not.toHaveBeenCalled();
    });

    it('should not track usage when user not authenticated', async () => {
      const { reply } = createMockReply();
      reply.statusCode = 200;
      const request = createMockRequest({});

      await trackClipUsage(request, reply);

      expect(mockIncrementUsage).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const { reply } = createMockReply();
      reply.statusCode = 200;
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      mockIncrementUsage.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      await expect(trackClipUsage(request, reply)).resolves.not.toThrow();
    });

    it('should extract jobId from params when not in body', async () => {
      const { reply } = createMockReply();
      reply.statusCode = 200;
      const request = createAuthenticatedRequest('user-123', 'test@example.com', {
        params: { jobId: 'job-456' },
      });

      await trackClipUsage(request, reply);

      expect(mockIncrementUsage).toHaveBeenCalledWith(
        'user-123',
        'clip',
        1,
        'job-456',
        'job',
        'job-456:clip'
      );
    });
  });

  describe('trackMinuteUsage', () => {
    it('should track minute usage with specified amount', async () => {
      const { reply } = createMockReply();
      reply.statusCode = 200;
      const request = createAuthenticatedRequest('user-123', 'test@example.com', {
        params: { jobId: 'job-123' },
      });

      await trackMinuteUsage(request, reply, 15);

      expect(mockIncrementUsage).toHaveBeenCalledWith(
        'user-123',
        'minute',
        15,
        'job-123',
        'job',
        'job-123:minute'
      );
    });

    it('should not track on non-success response', async () => {
      const { reply } = createMockReply();
      reply.statusCode = 500;
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      await trackMinuteUsage(request, reply, 10);

      expect(mockIncrementUsage).not.toHaveBeenCalled();
    });

    it('should track for all 2xx status codes', async () => {
      const { reply } = createMockReply();
      reply.statusCode = 201;
      const request = createAuthenticatedRequest('user-123', 'test@example.com');

      await trackMinuteUsage(request, reply, 5);

      expect(mockIncrementUsage).toHaveBeenCalled();
    });
  });
});
