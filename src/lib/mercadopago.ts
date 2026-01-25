// Mercado Pago API Service
// Conecta o frontend aos endpoints de pagamento do backend

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ============================================
// TYPES
// ============================================

export interface Plan {
  id: string;
  name: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  clips_per_month: number;
  minutes_per_month: number;
  max_video_duration: number;
  max_clip_duration: number;
  features: string[];
  has_watermark: boolean;
  has_priority_processing: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'pending' | 'authorized' | 'active' | 'paused' | 'cancelled' | 'expired';
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: string;
  current_period_end: string;
  clips_used: number;
  minutes_used: number;
  mp_subscription_id?: string;
  created_at: string;
}

export interface PixPaymentResult {
  subscription: Subscription;
  paymentId: string;
  status: string;
  pix: {
    qrCode: string;
    qrCodeBase64: string;
    copyPaste: string;
    expiresAt: string;
  };
}

export interface CardPaymentResult {
  subscription: Subscription;
  checkoutUrl: string;
  preferenceId: string;
}

export interface UsageLimits {
  canUse: boolean;
  plan: Plan;
  subscription: Subscription | null;
  usage: {
    clips_used: number;
    clips_limit: number;
    clips_remaining: number;
    minutes_used: number;
    minutes_limit: number;
    minutes_remaining: number;
  };
}

export interface PaymentHistory {
  id: string;
  amount: string;
  status: string;
  mp_payment_method: string;
  created_at: string;
  paid_at: string | null;
}

// ============================================
// API CALLS
// ============================================

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Importante: envia cookies httpOnly
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}

// ============================================
// PLANS
// ============================================

export async function getPlans(): Promise<Plan[]> {
  return apiFetch<Plan[]>('/plans');
}

export async function getPlanById(planId: string): Promise<Plan> {
  return apiFetch<Plan>(`/plans/${planId}`);
}

// ============================================
// SUBSCRIPTIONS
// ============================================

export async function getCurrentSubscription(): Promise<{
  subscription: Subscription | null;
  plan: Plan;
  isFreeTier: boolean;
}> {
  return apiFetch('/subscriptions/current');
}

export async function getSubscriptionHistory(): Promise<Subscription[]> {
  return apiFetch('/subscriptions/history');
}

export async function cancelSubscription(subscriptionId: string, reason?: string): Promise<void> {
  return apiFetch(`/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ============================================
// PAYMENTS - PIX
// ============================================

export async function createPixPayment(
  planId: string,
  billingCycle: 'monthly' | 'yearly' = 'monthly'
): Promise<PixPaymentResult> {
  return apiFetch('/payments/pix', {
    method: 'POST',
    body: JSON.stringify({ planId, billingCycle }),
  });
}

// ============================================
// PAYMENTS - CARD/CHECKOUT
// ============================================

export async function createCardPayment(
  planId: string,
  billingCycle: 'monthly' | 'yearly' = 'monthly'
): Promise<CardPaymentResult> {
  return apiFetch('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ planId, billingCycle }),
  });
}

// ============================================
// PAYMENT STATUS
// ============================================

export async function getPaymentStatus(paymentId: string): Promise<{
  status: string;
  subscription?: Subscription;
}> {
  return apiFetch(`/payments/${paymentId}/status`);
}

export async function getPaymentHistory(): Promise<PaymentHistory[]> {
  return apiFetch('/payments/history');
}

// ============================================
// USAGE & LIMITS
// ============================================

export async function getUsageLimits(): Promise<UsageLimits> {
  return apiFetch('/usage/limits');
}

// ============================================
// HELPERS
// ============================================

export function formatPrice(price: string | number, cycle?: 'monthly' | 'yearly'): string {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  const formatted = numPrice.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  if (cycle === 'yearly') {
    return `${formatted}/ano`;
  }
  return `${formatted}/mês`;
}

export function getPlanBadgeColor(planId: string): string {
  switch (planId) {
    case 'plan_free':
      return 'bg-gray-100 text-gray-800';
    case 'plan_pro':
      return 'bg-blue-100 text-blue-800';
    case 'plan_enterprise':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
    case 'approved':
      return 'default';
    case 'pending':
    case 'authorized':
    case 'in_process':
      return 'secondary';
    case 'cancelled':
    case 'rejected':
    case 'expired':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function translateStatus(status: string): string {
  const translations: Record<string, string> = {
    pending: 'Pendente',
    authorized: 'Autorizado',
    active: 'Ativo',
    paused: 'Pausado',
    cancelled: 'Cancelado',
    expired: 'Expirado',
    approved: 'Aprovado',
    in_process: 'Processando',
    rejected: 'Rejeitado',
    refunded: 'Reembolsado',
  };
  return translations[status] || status;
}
