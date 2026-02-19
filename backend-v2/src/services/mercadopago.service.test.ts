import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted for variables used in mock factories
const {
  mockQuery,
  mockPreferenceCreate,
  mockPaymentCreate,
  mockPaymentGet,
  mockPreApprovalGet,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockPreferenceCreate: vi.fn(),
  mockPaymentCreate: vi.fn(),
  mockPaymentGet: vi.fn(),
  mockPreApprovalGet: vi.fn(),
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

// Mock logger
vi.mock('../config/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock MercadoPago SDK
vi.mock('mercadopago', () => ({
  MercadoPagoConfig: vi.fn(() => ({})),
  Preference: vi.fn(() => ({
    create: mockPreferenceCreate,
  })),
  Payment: vi.fn(() => ({
    create: mockPaymentCreate,
    get: mockPaymentGet,
  })),
  PreApproval: vi.fn(() => ({
    get: mockPreApprovalGet,
  })),
}));

// Mock env
vi.mock('../config/env.js', () => ({
  env: {
    isDevelopment: false,
    isProduction: false,
    baseUrl: 'https://api.clipify.studio',
    frontendUrl: 'https://clipify.studio',
    mercadoPago: {
      accessToken: 'TEST-access-token-12345',
      publicKey: 'TEST-public-key-12345',
      webhookSecret: 'test-webhook-secret',
    },
    devUnlimitedEmails: [],
  },
}));

// Mock database service
vi.mock('./database.service.js', () => ({
  pool: {
    query: mockQuery,
  },
}));

import {
  getPlans,
  getPlanById,
  getUserSubscription,
  createSubscription,
  startFreeTrial,
  createPayment,
  createPixPayment,
  handleWebhook,
  cancelSubscription,
  checkUserLimits,
  incrementUsage,
  getPaymentStatus,
  getUserPayments,
  getSubscriptionHistory,
} from './mercadopago.service.js';
import { plans as planFixtures } from '../test/fixtures/subscriptions.fixture.js';

describe('mercadopago.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockPreferenceCreate.mockReset();
    mockPaymentCreate.mockReset();
    mockPaymentGet.mockReset();
    mockPreApprovalGet.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlans', () => {
    it('should return all active plans', async () => {
      const mockPlans = [planFixtures.free, planFixtures.starter, planFixtures.pro];
      mockQuery.mockResolvedValueOnce({ rows: mockPlans });

      const result = await getPlans();

      expect(result).toHaveLength(3);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM plans'));
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('is_active = true'));
    });

    it('should order plans by sort_order', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getPlans();

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY sort_order'));
    });

    it('should return empty array when no plans found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getPlans();

      expect(result).toEqual([]);
    });
  });

  describe('getPlanById', () => {
    it('should return plan when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.pro] });

      const result = await getPlanById('plan_pro');

      expect(result).toEqual(planFixtures.pro);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM plans WHERE id'),
        ['plan_pro']
      );
    });

    it('should return null when plan not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getPlanById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getUserSubscription', () => {
    it('should return active subscription with plan data', async () => {
      const mockSubscription = {
        id: 'sub-123',
        user_id: 'user-123',
        plan_id: 'plan_pro',
        status: 'active',
        clips_used: 10,
        minutes_used: 60,
        plan_name: 'Pro',
        clips_per_month: 200,
        minutes_per_month: 1200,
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockSubscription] });

      const result = await getUserSubscription('user-123');

      expect(result).toEqual(mockSubscription);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN plans'),
        ['user-123']
      );
    });

    it('should return null when no active subscription', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getUserSubscription('user-without-sub');

      expect(result).toBeNull();
    });

    it('should filter by active or authorized status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getUserSubscription('user-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('active', 'authorized')"),
        expect.any(Array)
      );
    });

    it('should filter expired subscriptions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getUserSubscription('user-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('current_period_end > NOW()'),
        expect.any(Array)
      );
    });
  });

  describe('createSubscription', () => {
    const validParams = {
      userId: 'user-123',
      userEmail: 'user@example.com',
      userName: 'Test User',
      planId: 'plan_pro',
      billingCycle: 'monthly' as const,
    };

    it('should create subscription for paid plan', async () => {
      // Mock getPlanById
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.pro] });
      // Mock insert subscription
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'sub-new-123',
          user_id: validParams.userId,
          plan_id: validParams.planId,
          status: 'pending',
        }],
      });
      // Mock preference creation
      mockPreferenceCreate.mockResolvedValueOnce({
        id: 'pref-123',
        init_point: 'https://mercadopago.com/checkout',
        sandbox_init_point: 'https://sandbox.mercadopago.com/checkout',
      });

      const result = await createSubscription(validParams);

      expect(result.subscription).toBeDefined();
      expect(result.checkoutUrl).toBeDefined();
      expect(result.preferenceId).toBe('pref-123');
    });

    it('should create free subscription directly without checkout', async () => {
      // Mock getPlanById - free plan
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.free] });
      // Mock getUserSubscription (no existing)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Mock cancel previous subscriptions
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      // Mock insert free subscription
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'sub-free-123',
          user_id: 'user-123',
          plan_id: 'plan_free',
          status: 'active',
        }],
      });

      const result = await createSubscription({
        ...validParams,
        planId: 'plan_free',
      });

      expect(result.subscription.status).toBe('active');
      expect(result.checkoutUrl).toBeNull();
      expect(mockPreferenceCreate).not.toHaveBeenCalled();
    });

    it('should throw error when plan not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(createSubscription({
        ...validParams,
        planId: 'nonexistent',
      })).rejects.toThrow('Plano não encontrado');
    });

    it('should use yearly price for yearly billing cycle', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.pro] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sub-123', status: 'pending' }],
      });
      mockPreferenceCreate.mockResolvedValueOnce({
        id: 'pref-123',
        init_point: 'https://mercadopago.com/checkout',
      });

      await createSubscription({
        ...validParams,
        billingCycle: 'yearly',
      });

      expect(mockPreferenceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                unit_price: planFixtures.pro.price_yearly,
              }),
            ]),
          }),
        })
      );
    });

    it('should set correct period end for yearly subscription', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.pro] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sub-123', status: 'pending' }],
      });
      mockPreferenceCreate.mockResolvedValueOnce({
        id: 'pref-123',
        init_point: 'https://mercadopago.com/checkout',
      });

      await createSubscription({
        ...validParams,
        billingCycle: 'yearly',
      });

      // Check that the period_end is about 1 year from now
      const insertCall = mockQuery.mock.calls[1];
      const periodEnd = new Date(insertCall[1][4]);
      const now = new Date();
      const yearFromNow = new Date(now);
      yearFromNow.setFullYear(yearFromNow.getFullYear() + 1);

      // Within 1 day tolerance
      expect(Math.abs(periodEnd.getTime() - yearFromNow.getTime())).toBeLessThan(86400000);
    });
  });

  describe('startFreeTrial', () => {
    it('should start trial for eligible user', async () => {
      // Mock: no existing trial
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Mock: no active subscription
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Mock: get trial plan
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.trial] });
      // Mock: cancel previous subscriptions
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      // Mock: insert trial subscription
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'trial-123',
          user_id: 'user-123',
          plan_id: 'plan_trial',
          status: 'active',
          is_trial: true,
        }],
      });

      const result = await startFreeTrial('user-123', 7);

      expect(result.is_trial).toBe(true);
      expect(result.status).toBe('active');
    });

    it('should throw error if trial already used', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-trial' }], rowCount: 1 });

      await expect(startFreeTrial('user-123')).rejects.toThrow('TRIAL_ALREADY_USED');
    });

    it('should throw error if user already has paid subscription', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // No trial
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'sub-123',
          plan_id: 'plan_pro',
          status: 'active',
        }],
      });

      await expect(startFreeTrial('user-123')).rejects.toThrow('USER_ALREADY_SUBSCRIBED');
    });

    it('should allow trial for users with only free plan', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // No trial
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'sub-free',
          plan_id: 'plan_free',
          status: 'active',
        }],
      }); // Has free plan
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.trial] }); // Get trial plan
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Cancel previous
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'trial-123',
          is_trial: true,
          status: 'active',
        }],
      });

      const result = await startFreeTrial('user-123');

      expect(result.is_trial).toBe(true);
    });

    it('should set correct trial period', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.trial] });
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'trial-123', is_trial: true }],
      });

      await startFreeTrial('user-123', 14);

      const insertCall = mockQuery.mock.calls[4];
      const periodEnd = new Date(insertCall[1][3]);
      const now = new Date();
      const expectedEnd = new Date(now);
      expectedEnd.setDate(expectedEnd.getDate() + 14);

      // Within 1 day tolerance
      expect(Math.abs(periodEnd.getTime() - expectedEnd.getTime())).toBeLessThan(86400000);
    });
  });

  describe('createPayment', () => {
    const validParams = {
      userId: 'user-123',
      userEmail: 'user@example.com',
      userName: 'Test User',
      planId: 'plan_starter',
      billingCycle: 'monthly' as const,
    };

    it('should create payment preference for paid plan', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.starter] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sub-123', status: 'pending' }],
      });
      mockPreferenceCreate.mockResolvedValueOnce({
        id: 'pref-123',
        init_point: 'https://mercadopago.com/checkout',
        sandbox_init_point: 'https://sandbox.mercadopago.com/checkout',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Insert payment

      const result = await createPayment(validParams);

      expect(result.checkoutUrl).toBeDefined();
      expect(result.subscription).toBeDefined();
    });

    it('should configure PIX payment method', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.starter] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sub-123' }],
      });
      mockPreferenceCreate.mockResolvedValueOnce({
        id: 'pref-123',
        init_point: 'https://mercadopago.com/checkout',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await createPayment({
        ...validParams,
        paymentMethod: 'pix',
      });

      expect(mockPreferenceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            payment_methods: expect.objectContaining({
              excluded_payment_types: expect.arrayContaining([
                { id: 'credit_card' },
              ]),
            }),
          }),
        })
      );
    });

    it('should configure credit card payment method', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.starter] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sub-123' }],
      });
      mockPreferenceCreate.mockResolvedValueOnce({
        id: 'pref-123',
        init_point: 'https://mercadopago.com/checkout',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await createPayment({
        ...validParams,
        paymentMethod: 'credit_card',
      });

      expect(mockPreferenceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            payment_methods: expect.objectContaining({
              installments: 12,
            }),
          }),
        })
      );
    });
  });

  describe('createPixPayment', () => {
    const validParams = {
      userId: 'user-123',
      userEmail: 'user@example.com',
      userName: 'Test User',
      planId: 'plan_starter',
      billingCycle: 'monthly' as const,
      payerCpf: '12345678901',
    };

    it('should create direct PIX payment', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.starter] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sub-123' }],
      });
      mockPaymentCreate.mockResolvedValueOnce({
        id: 123456,
        status: 'pending',
        point_of_interaction: {
          transaction_data: {
            qr_code: 'pix-qr-code-string',
            qr_code_base64: 'base64-encoded-qr',
          },
        },
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Insert payment

      const result = await createPixPayment(validParams);

      expect(result.pixQrCode).toBe('pix-qr-code-string');
      expect(result.pixQrCodeBase64).toBe('base64-encoded-qr');
      expect(result.paymentId).toBe(123456);
    });

    it('should set PIX expiration to 30 minutes', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.starter] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'sub-123' }] });
      mockPaymentCreate.mockResolvedValueOnce({
        id: 123456,
        status: 'pending',
        point_of_interaction: { transaction_data: {} },
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await createPixPayment(validParams);

      const now = new Date();
      const thirtyMinutes = 30 * 60 * 1000;
      const expiresAt = new Date(result.expiresAt!);

      expect(Math.abs(expiresAt.getTime() - now.getTime() - thirtyMinutes)).toBeLessThan(5000);
    });
  });

  describe('handleWebhook', () => {
    it('should handle payment webhook', async () => {
      mockPaymentGet.mockResolvedValueOnce({
        id: 123456,
        status: 'approved',
        external_reference: 'pay_user-123_123456',
        payment_method_id: 'pix',
        payment_type_id: 'bank_transfer',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update payment
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Activate subscription

      const result = await handleWebhook({
        type: 'payment',
        data: { id: '123456' },
      });

      expect(result.handled).toBe(true);
      expect(result.status).toBe('approved');
    });

    it('should activate subscription on approved payment', async () => {
      mockPaymentGet.mockResolvedValueOnce({
        id: 123456,
        status: 'approved',
        external_reference: 'pay_user-123_123456',
        payment_method_id: 'pix',
        payment_type_id: 'bank_transfer',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await handleWebhook({
        type: 'payment',
        data: { id: '123456' },
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'active'"),
        expect.any(Array)
      );
    });

    it('should handle subscription preapproval webhook', async () => {
      mockPreApprovalGet.mockResolvedValueOnce({
        id: 'preapproval-123',
        status: 'authorized',
        payer_id: 'payer-123',
        external_reference: 'sub_user-123_123456',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await handleWebhook({
        type: 'subscription_preapproval',
        data: { id: 'preapproval-123' },
      });

      expect(result.handled).toBe(true);
      expect(result.status).toBe('active'); // 'authorized' maps to 'active'
    });

    it('should return handled: false for unknown webhook type', async () => {
      const result = await handleWebhook({
        type: 'unknown_type',
        data: { id: '123' },
      });

      expect(result.handled).toBe(false);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'sub-123',
          status: 'cancelled',
          cancelled_at: new Date(),
        }],
      });

      const result = await cancelSubscription('sub-123', 'User requested');

      expect(result.status).toBe('cancelled');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'cancelled'"),
        ['sub-123', 'User requested']
      );
    });

    it('should throw error when subscription not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(cancelSubscription('nonexistent')).rejects.toThrow('Assinatura não encontrada');
    });

    it('should use default reason when not provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sub-123', status: 'cancelled' }],
      });

      await cancelSubscription('sub-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['sub-123', 'Cancelado pelo usuário']
      );
    });
  });

  describe('checkUserLimits', () => {
    it('should return limits for user with subscription', async () => {
      const subscription = {
        id: 'sub-123',
        plan_id: 'plan_pro',
        clips_used: 50,
        minutes_used: 300,
        clips_per_month: 200,
        minutes_per_month: 1200,
        plan_name: 'Pro',
      };
      mockQuery.mockResolvedValueOnce({ rows: [subscription] });

      const result = await checkUserLimits('user-123', 'clip');

      expect(result.canUse).toBe(true);
      expect(result.currentUsage).toBe(50);
      expect(result.maxAllowed).toBe(200);
      expect(result.planName).toBe('Pro');
    });

    it('should return false when limit exceeded', async () => {
      const subscription = {
        id: 'sub-123',
        clips_used: 200,
        clips_per_month: 200,
        plan_name: 'Pro',
      };
      mockQuery.mockResolvedValueOnce({ rows: [subscription] });

      const result = await checkUserLimits('user-123', 'clip');

      expect(result.canUse).toBe(false);
    });

    it('should check minute limits correctly', async () => {
      const subscription = {
        id: 'sub-123',
        minutes_used: 100,
        minutes_per_month: 300,
        plan_name: 'Starter',
      };
      mockQuery.mockResolvedValueOnce({ rows: [subscription] });

      const result = await checkUserLimits('user-123', 'minute');

      expect(result.canUse).toBe(true);
      expect(result.currentUsage).toBe(100);
      expect(result.maxAllowed).toBe(300);
    });

    it('should use free plan limits when no subscription', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No subscription
      mockQuery.mockResolvedValueOnce({ rows: [planFixtures.free] }); // Get free plan
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '3' }] }); // Usage count

      const result = await checkUserLimits('user-123', 'clip');

      expect(result.currentUsage).toBe(3);
      expect(result.maxAllowed).toBe(5);
      expect(result.planName).toBe('Grátis');
    });
  });

  describe('incrementUsage', () => {
    it('should record usage for user with subscription', async () => {
      const subscription = {
        id: 'sub-123',
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
      mockQuery.mockResolvedValueOnce({ rows: [subscription] }); // getUserSubscription
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'usage-123' }] }); // Insert usage
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update subscription counter

      await incrementUsage('user-123', 'clip', 1, 'job-123', 'job', 'job-123:clip');

      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should skip duplicate usage with same idempotency key', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'sub-123' }] }); // subscription
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert returns empty (conflict)

      await incrementUsage('user-123', 'clip', 1, 'job-123', 'job', 'job-123:clip');

      // Should not update subscription counter if insert was skipped
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should record usage without subscription', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No subscription
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'usage-123' }] }); // Insert usage

      await incrementUsage('user-123', 'clip', 1);

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should update subscription counter on successful insert', async () => {
      const subscription = { id: 'sub-123' };
      mockQuery.mockResolvedValueOnce({ rows: [subscription] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'usage-123' }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await incrementUsage('user-123', 'minute', 5);

      expect(mockQuery).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('minutes_used = minutes_used + $1'),
        [5, 'sub-123']
      );
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status from MercadoPago', async () => {
      mockPaymentGet.mockResolvedValueOnce({
        id: 123456,
        status: 'approved',
        status_detail: 'accredited',
      });

      const result = await getPaymentStatus('123456');

      expect(result.status).toBe('approved');
      expect(mockPaymentGet).toHaveBeenCalledWith({ id: '123456' });
    });
  });

  describe('getUserPayments', () => {
    it('should return user payment history', async () => {
      const payments = [
        { id: 'pay-1', amount: 29.90, status: 'approved' },
        { id: 'pay-2', amount: 79.90, status: 'pending' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: payments });

      const result = await getUserPayments('user-123');

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM payments'),
        ['user-123']
      );
    });

    it('should include plan name in payment records', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getUserPayments('user-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN plans'),
        expect.any(Array)
      );
    });
  });

  describe('getSubscriptionHistory', () => {
    it('should return subscription history with plan details', async () => {
      const history = [
        { id: 'sub-1', plan_id: 'plan_pro', plan_name: 'Pro' },
        { id: 'sub-2', plan_id: 'plan_starter', plan_name: 'Starter' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: history });

      const result = await getSubscriptionHistory('user-123');

      expect(result).toHaveLength(2);
      expect(result[0].plan_name).toBe('Pro');
    });

    it('should order by created_at descending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getSubscriptionHistory('user-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY s.created_at DESC'),
        expect.any(Array)
      );
    });
  });
});
