import { vi } from 'vitest';

export const mockPreferenceCreate = vi.fn();
export const mockPaymentCreate = vi.fn();
export const mockPaymentGet = vi.fn();
export const mockPreApprovalGet = vi.fn();

export const mockMercadoPagoConfig = vi.fn().mockImplementation(() => ({}));

export const mockPreference = vi.fn().mockImplementation(() => ({
  create: mockPreferenceCreate,
}));

export const mockPayment = vi.fn().mockImplementation(() => ({
  create: mockPaymentCreate,
  get: mockPaymentGet,
}));

export const mockPreApproval = vi.fn().mockImplementation(() => ({
  get: mockPreApprovalGet,
}));

export function setupMercadoPagoMock() {
  vi.mock('mercadopago', () => ({
    MercadoPagoConfig: mockMercadoPagoConfig,
    Preference: mockPreference,
    Payment: mockPayment,
    PreApproval: mockPreApproval,
  }));
}

export function resetMercadoPagoMock() {
  mockPreferenceCreate.mockReset();
  mockPaymentCreate.mockReset();
  mockPaymentGet.mockReset();
  mockPreApprovalGet.mockReset();
}

// Helper to create mock preference response
export function createMockPreferenceResponse(overrides?: Partial<{
  id: string;
  init_point: string;
  sandbox_init_point: string;
}>) {
  return {
    id: 'test-preference-id',
    init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test',
    sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=test',
    ...overrides,
  };
}

// Helper to create mock payment response
export function createMockPaymentResponse(overrides?: Partial<{
  id: number;
  status: string;
  status_detail: string;
  payment_method_id: string;
  payment_type_id: string;
  external_reference: string;
  point_of_interaction: any;
}>) {
  return {
    id: 123456789,
    status: 'approved',
    status_detail: 'accredited',
    payment_method_id: 'pix',
    payment_type_id: 'bank_transfer',
    external_reference: 'test-external-ref',
    point_of_interaction: {
      transaction_data: {
        qr_code: 'test-qr-code-string',
        qr_code_base64: 'base64-encoded-qr-code',
      },
    },
    ...overrides,
  };
}

// Helper to create mock preapproval response
export function createMockPreApprovalResponse(overrides?: Partial<{
  id: string;
  status: string;
  payer_id: string;
  external_reference: string;
}>) {
  return {
    id: 'test-preapproval-id',
    status: 'authorized',
    payer_id: 'test-payer-id',
    external_reference: 'test-external-ref',
    ...overrides,
  };
}
