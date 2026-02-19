import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

// Use vi.hoisted for variables used in mock factories
const {
  mockGetPlans,
  mockGetPlanById,
  mockGetUserSubscription,
  mockGetSubscriptionHistory,
  mockCreatePayment,
  mockCreatePixPayment,
  mockCancelSubscription,
  mockStartFreeTrial,
  mockCheckUserLimits,
  mockHandleWebhook,
  mockGetUserPayments,
  mockVerifyToken,
} = vi.hoisted(() => ({
  mockGetPlans: vi.fn(),
  mockGetPlanById: vi.fn(),
  mockGetUserSubscription: vi.fn(),
  mockGetSubscriptionHistory: vi.fn(),
  mockCreatePayment: vi.fn(),
  mockCreatePixPayment: vi.fn(),
  mockCancelSubscription: vi.fn(),
  mockStartFreeTrial: vi.fn(),
  mockCheckUserLimits: vi.fn(),
  mockHandleWebhook: vi.fn(),
  mockGetUserPayments: vi.fn(),
  mockVerifyToken: vi.fn(),
}));

// Mock mercadopago service
vi.mock('../services/mercadopago.service.js', () => ({
  getPlans: mockGetPlans,
  getPlanById: mockGetPlanById,
  getUserSubscription: mockGetUserSubscription,
  getSubscriptionHistory: mockGetSubscriptionHistory,
  createPayment: mockCreatePayment,
  createPixPayment: mockCreatePixPayment,
  cancelSubscription: mockCancelSubscription,
  startFreeTrial: mockStartFreeTrial,
  checkUserLimits: mockCheckUserLimits,
  handleWebhook: mockHandleWebhook,
  getUserPayments: mockGetUserPayments,
}));

// Mock auth middleware
vi.mock('../middleware/auth.middleware.js', () => ({
  authenticateJWT: vi.fn(async (request, reply) => {
    const token = request.cookies?.access_token || request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const decoded = mockVerifyToken(token);
    if (!decoded) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    request.user = decoded;
  }),
  optionalAuth: vi.fn(async (request) => {
    const token = request.cookies?.access_token;
    if (token) {
      const decoded = mockVerifyToken(token);
      if (decoded) request.user = decoded;
    }
  }),
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
  env: {
    isProduction: false,
    mercadoPago: {
      accessToken: 'TEST-access-token',
      publicKey: 'TEST-public-key',
      webhookSecret: 'test-webhook-secret',
      sandboxMode: true,
    },
  },
}));

import { registerPaymentsRoutes } from './payments.routes.js';

describe('payments.routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cookie, { secret: 'test-cookie-secret' });
    await registerPaymentsRoutes(app);
    await app.ready();

    // Default mock implementations
    mockVerifyToken.mockReturnValue({ userId: 'user-123', email: 'test@example.com' });
    mockCheckUserLimits.mockResolvedValue({
      canUse: true,
      currentUsage: 0,
      maxAllowed: 100,
      planName: 'Free',
      subscription: null,
    });
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /plans', () => {
    it('should return all active plans', async () => {
      const plans = [
        { id: 'plan_free', name: 'Free', price_monthly: 0 },
        { id: 'plan_pro', name: 'Pro', price_monthly: 79.90 },
      ];
      mockGetPlans.mockResolvedValue(plans);

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
      expect(body[0].id).toBe('plan_free');
    });

    it('should return 500 on error', async () => {
      mockGetPlans.mockRejectedValue(new Error('Database error'));

      const response = await app.inject({
        method: 'GET',
        url: '/plans',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /plans/:planId', () => {
    it('should return specific plan', async () => {
      const plan = { id: 'plan_pro', name: 'Pro', price_monthly: 79.90 };
      mockGetPlanById.mockResolvedValue(plan);

      const response = await app.inject({
        method: 'GET',
        url: '/plans/plan_pro',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('plan_pro');
    });

    it('should return 404 when plan not found', async () => {
      mockGetPlanById.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/plans/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /subscriptions/current', () => {
    it('should return current subscription', async () => {
      const subscription = {
        id: 'sub-123',
        plan_id: 'plan_pro',
        status: 'active',
      };
      mockGetUserSubscription.mockResolvedValue(subscription);
      mockGetPlanById.mockResolvedValue({ id: 'plan_pro', name: 'Pro' });

      const response = await app.inject({
        method: 'GET',
        url: '/subscriptions/current',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.subscription.id).toBe('sub-123');
      expect(body.isFreeTier).toBe(false);
    });

    it('should return free tier when no subscription', async () => {
      mockGetUserSubscription.mockResolvedValue(null);
      mockGetPlanById.mockResolvedValue({ id: 'plan_free', name: 'Free' });

      const response = await app.inject({
        method: 'GET',
        url: '/subscriptions/current',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.subscription).toBeNull();
      expect(body.isFreeTier).toBe(true);
    });

    it('should return 401 when not authenticated', async () => {
      mockVerifyToken.mockReturnValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/subscriptions/current',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /subscriptions/history', () => {
    it('should return subscription history', async () => {
      const history = [
        { id: 'sub-1', plan_id: 'plan_pro' },
        { id: 'sub-2', plan_id: 'plan_starter' },
      ];
      mockGetSubscriptionHistory.mockResolvedValue(history);

      const response = await app.inject({
        method: 'GET',
        url: '/subscriptions/history',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
    });
  });

  describe('POST /trial/start', () => {
    it('should start free trial', async () => {
      const trialSubscription = {
        id: 'trial-123',
        plan_id: 'plan_trial',
        is_trial: true,
        status: 'active',
      };
      mockStartFreeTrial.mockResolvedValue(trialSubscription);

      const response = await app.inject({
        method: 'POST',
        url: '/trial/start',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.subscription.is_trial).toBe(true);
    });

    it('should return 409 when trial already used', async () => {
      mockStartFreeTrial.mockRejectedValue(new Error('TRIAL_ALREADY_USED'));

      const response = await app.inject({
        method: 'POST',
        url: '/trial/start',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('TRIAL_ALREADY_USED');
    });

    it('should return 409 when user already subscribed', async () => {
      mockStartFreeTrial.mockRejectedValue(new Error('USER_ALREADY_SUBSCRIBED'));

      const response = await app.inject({
        method: 'POST',
        url: '/trial/start',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('USER_ALREADY_SUBSCRIBED');
    });
  });

  describe('POST /get-usage', () => {
    it('should return usage for authenticated user', async () => {
      mockCheckUserLimits.mockImplementation(async (userId, type) => {
        if (type === 'clip') {
          return { currentUsage: 5, maxAllowed: 50, planName: 'Starter' };
        }
        return { currentUsage: 30, maxAllowed: 300, planName: 'Starter' };
      });

      const response = await app.inject({
        method: 'POST',
        url: '/get-usage',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.shortsUsed).toBe(5);
      expect(body.shortsQuota).toBe(50);
      expect(body.minutesUsed).toBe(30);
    });

    it('should return default usage for unauthenticated user', async () => {
      mockVerifyToken.mockReturnValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/get-usage',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.plan).toBe('free');
      expect(body.shortsQuota).toBe(5);
    });
  });

  describe('POST /webhooks/mercadopago', () => {
    it('should handle payment webhook', async () => {
      mockHandleWebhook.mockResolvedValue({ handled: true, status: 'approved' });

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/mercadopago',
        headers: {
          'x-signature': 'test-webhook-secret',
        },
        payload: {
          type: 'payment',
          data: { id: '123456' },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockHandleWebhook).toHaveBeenCalledWith({
        type: 'payment',
        data: { id: '123456' },
      });
    });

    it('should return 200 even for unhandled webhook types', async () => {
      mockHandleWebhook.mockResolvedValue({ handled: false });

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/mercadopago',
        headers: {
          'x-signature': 'test-webhook-secret',
        },
        payload: {
          type: 'unknown',
          data: { id: '123' },
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 401 when webhook signature is invalid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/mercadopago',
        headers: {
          'x-signature': 'invalid-signature',
        },
        payload: {
          type: 'payment',
          data: { id: '123456' },
        },
      });

      expect(response.statusCode).toBe(401);
      expect(mockHandleWebhook).not.toHaveBeenCalled();
    });
  });

  describe('POST /subscriptions/:id/cancel', () => {
    it('should cancel subscription', async () => {
      const cancelledSub = {
        id: 'sub-123',
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      };
      mockCancelSubscription.mockResolvedValue(cancelledSub);

      const response = await app.inject({
        method: 'POST',
        url: '/subscriptions/sub-123/cancel',
        cookies: { access_token: 'valid-token' },
        payload: { reason: 'No longer needed' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.subscription.status).toBe('cancelled');
    });

    it('should return 500 when subscription not found', async () => {
      mockCancelSubscription.mockRejectedValue(new Error('Assinatura não encontrada'));

      const response = await app.inject({
        method: 'POST',
        url: '/subscriptions/nonexistent/cancel',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('INTERNAL_ERROR');
      expect(body.message).toContain('não encontrada');
    });
  });

  describe('GET /payments/history', () => {
    it('should return payment history', async () => {
      const payments = [
        { id: 'pay-1', amount: 79.90, status: 'approved' },
        { id: 'pay-2', amount: 29.90, status: 'pending' },
      ];
      mockGetUserPayments.mockResolvedValue(payments);

      const response = await app.inject({
        method: 'GET',
        url: '/payments/history',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
    });
  });

  describe('GET /payments/config', () => {
    it('should return billing public config', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/payments/config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        publicKey: 'TEST-public-key',
        isConfigured: true,
        sandboxMode: true,
      });
    });
  });
});
