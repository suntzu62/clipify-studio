import { invokeFn } from './api';

export const createCheckout = async (
  plan: 'pro' | 'scale',
  headers?: Record<string, string>
) => invokeFn<{ url: string }>('create-checkout', { body: { plan }, headers });

export const openPortal = async (headers?: Record<string, string>) =>
  invokeFn<{ url: string }>('customer-portal', { body: {}, headers });

