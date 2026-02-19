import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

/**
 * Integration tests for the complete subscription flow.
 * These tests verify the end-to-end behavior of subscription operations.
 */

// Use vi.hoisted for variables used in mock factories
const {
  mockQuery,
  mockPreferenceCreate,
  mockPaymentCreate,
  mockPaymentGet,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockPreferenceCreate: vi.fn(),
  mockPaymentCreate: vi.fn(),
  mockPaymentGet: vi.fn(),
}));

// Mock pg Pool
vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: mockQuery,
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  })),
}));

// Mock MercadoPago SDK
vi.mock('mercadopago', () => ({
  MercadoPagoConfig: vi.fn(() => ({})),
  Preference: vi.fn(() => ({ create: mockPreferenceCreate })),
  Payment: vi.fn(() => ({ create: mockPaymentCreate, get: mockPaymentGet })),
  PreApproval: vi.fn(() => ({ get: vi.fn() })),
}));

// Mock logger
vi.mock('../../config/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock env
vi.mock('../../config/env.js', () => ({
  env: {
    isDevelopment: false,
    isProduction: false,
    baseUrl: 'https://api.test.com',
    frontendUrl: 'https://test.com',
    mercadoPago: {
      accessToken: 'TEST-access-token',
      publicKey: 'TEST-public-key',
      webhookSecret: 'test-webhook-secret',
    },
    devUnlimitedEmails: [],
  },
}));

import * as mp from '../../services/mercadopago.service.js';
import { plans as planFixtures } from '../fixtures/subscriptions.fixture.js';

describe('Subscription Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Free Plan Flow', () => {
    it('should allow user to use free plan without payment', async () => {
      // Setup: User has no subscription
      mockQuery.mockResolvedValueOnce({ rows: [] }); // getUserSubscription
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.free] }); // getPlanById for limits
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '2' }] }); // usage count

      // Action: Check limits
      const limits = await mp.checkUserLimits('user-123', 'clip');

      // Verify: User can use free tier
      expect(limits.canUse).toBe(true);
      expect(limits.maxAllowed).toBe(5);
      expect(limits.currentUsage).toBe(2);
      expect(limits.planName).toBe('Grátis');
    });

    it('should block when free plan limit exceeded', async () => {
      // Setup: User has no subscription and used all clips
      mockQuery.mockResolvedValueOnce({ rows: [] }); // getUserSubscription
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.free] }); // getPlanById
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '5' }] }); // usage count = max

      // Action: Check limits
      const limits = await mp.checkUserLimits('user-123', 'clip');

      // Verify: User is blocked
      expect(limits.canUse).toBe(false);
      expect(limits.currentUsage).toBe(5);
      expect(limits.maxAllowed).toBe(5);
    });
  });

  describe('Trial Flow', () => {
    it('should start trial for eligible user', async () => {
      // Setup
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // No existing trial
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No active subscription
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.trial] }); // Get trial plan
      mockQuery.mockResolvedValueOnce({ rowCount: 0 }); // Cancel previous
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'trial-sub-123',
          user_id: 'user-123',
          plan_id: 'plan_trial',
          status: 'active',
          is_trial: true,
        }],
      });

      // Action: Start trial
      const subscription = await mp.startFreeTrial('user-123', 7);

      // Verify
      expect(subscription.is_trial).toBe(true);
      expect(subscription.status).toBe('active');
      expect(subscription.plan_id).toBe('plan_trial');
    });

    it('should prevent second trial', async () => {
      // Setup: User already had trial
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'old-trial' }], rowCount: 1 });

      // Action & Verify
      await expect(mp.startFreeTrial('user-123')).rejects.toThrow('TRIAL_ALREADY_USED');
    });

    it('should allow trial for free plan user', async () => {
      // Setup
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // No existing trial
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'free-sub',
          plan_id: 'plan_free', // Has free plan, should allow trial
          status: 'active',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.trial] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Cancel free plan
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'trial-123', is_trial: true, status: 'active' }],
      });

      // Action: Start trial
      const subscription = await mp.startFreeTrial('user-123');

      // Verify
      expect(subscription.is_trial).toBe(true);
    });
  });

  describe('Paid Subscription Flow', () => {
    it('should create payment and pending subscription', async () => {
      // Setup
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.pro] }); // getPlanById
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-sub-123', status: 'pending' }],
      }); // Insert subscription
      mockPreferenceCreate.mockResolvedValueOnce({
        id: 'pref-123',
        init_point: 'https://mercadopago.com/checkout/123',
        sandbox_init_point: 'https://sandbox.mercadopago.com/checkout/123',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Insert payment

      // Action: Create payment
      const result = await mp.createPayment({
        userId: 'user-123',
        userEmail: 'user@test.com',
        userName: 'Test User',
        planId: 'plan_pro',
        billingCycle: 'monthly',
      });

      // Verify
      expect(result.subscription).toBeDefined();
      expect(result.checkoutUrl).toBeDefined();
      expect(result.preferenceId).toBe('pref-123');
    });

    it('should activate subscription on webhook', async () => {
      // Setup: Payment approved
      mockPaymentGet.mockResolvedValueOnce({
        id: 123456,
        status: 'approved',
        external_reference: 'pay_user-123_123456',
        payment_method_id: 'pix',
        payment_type_id: 'bank_transfer',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update payment
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Activate subscription

      // Action: Handle webhook
      const result = await mp.handleWebhook({
        type: 'payment',
        data: { id: '123456' },
      });

      // Verify
      expect(result.handled).toBe(true);
      expect(result.status).toBe('approved');

      // Verify subscription was activated
      const activateCall = mockQuery.mock.calls.find(
        call => call[0].includes("status = 'active'")
      );
      expect(activateCall).toBeDefined();
    });
  });

  describe('Usage Tracking Flow', () => {
    it('should track usage with idempotency', async () => {
      const subscription = {
        id: 'sub-123',
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      // First call: Record usage
      mockQuery.mockResolvedValueOnce({ rows: [subscription] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'usage-1' }] }); // Insert succeeds
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update counter

      await mp.incrementUsage('user-123', 'clip', 1, 'job-123', 'job', 'job-123:clip');

      expect(mockQuery).toHaveBeenCalledTimes(3);

      vi.clearAllMocks();

      // Second call with same idempotency key: Should skip
      mockQuery.mockResolvedValueOnce({ rows: [subscription] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert returns empty (conflict)

      await mp.incrementUsage('user-123', 'clip', 1, 'job-123', 'job', 'job-123:clip');

      // Should not update counter (only 2 calls, not 3)
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('Subscription Cancellation Flow', () => {
    it('should cancel subscription', async () => {
      // Setup
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'sub-123',
          status: 'cancelled',
          cancelled_at: new Date(),
          cancel_reason: 'User requested',
        }],
      });

      // Action
      const result = await mp.cancelSubscription('sub-123', 'User requested');

      // Verify
      expect(result.status).toBe('cancelled');
      expect(result.cancel_reason).toBe('User requested');
    });

    it('should fail when subscription not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(mp.cancelSubscription('nonexistent'))
        .rejects.toThrow('Assinatura não encontrada');
    });
  });

  describe('Complete Upgrade Journey', () => {
    it('should handle upgrade from free to pro plan', async () => {
      const userId = 'upgrade-user-123';

      // Step 1: Check current limits (free plan)
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No subscription
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.free] }); // Free plan
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '4' }] }); // Near limit

      const freeLimits = await mp.checkUserLimits(userId, 'clip');
      expect(freeLimits.maxAllowed).toBe(5);
      expect(freeLimits.currentUsage).toBe(4);

      vi.clearAllMocks();

      // Step 2: Create payment for Pro plan
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.pro] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-sub', status: 'pending' }],
      });
      mockPreferenceCreate.mockResolvedValueOnce({
        id: 'pref-upgrade',
        init_point: 'https://mercadopago.com/checkout',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const payment = await mp.createPayment({
        userId,
        userEmail: 'upgrade@test.com',
        userName: 'Upgrade User',
        planId: 'plan_pro',
        billingCycle: 'monthly',
      });

      expect(payment.checkoutUrl).toBeDefined();

      vi.clearAllMocks();

      // Step 3: Simulate payment approval via webhook
      mockPaymentGet.mockResolvedValueOnce({
        id: 999,
        status: 'approved',
        external_reference: payment.subscription.mp_external_reference,
        payment_method_id: 'credit_card',
        payment_type_id: 'credit_card',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update payment
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Activate subscription

      await mp.handleWebhook({
        type: 'payment',
        data: { id: '999' },
      });

      vi.clearAllMocks();

      // Step 4: Verify new limits (Pro plan)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-sub',
          plan_id: 'plan_pro',
          status: 'active',
          clips_used: 4,
          minutes_used: 0,
          clips_per_month: 200,
          minutes_per_month: 1200,
          plan_name: 'Pro',
        }],
      });

      const proLimits = await mp.checkUserLimits(userId, 'clip');

      expect(proLimits.maxAllowed).toBe(200);
      expect(proLimits.currentUsage).toBe(4);
      expect(proLimits.planName).toBe('Pro');
      expect(proLimits.canUse).toBe(true);
    });
  });
});
