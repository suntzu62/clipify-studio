import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.PORT = '3099';
process.env.API_KEY = 'test-api-key-12345678901234567890';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890123456789012345678901234567890';
process.env.COOKIE_SECRET = 'test-cookie-secret-12345678901234567890123456789012';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5433/clipify_test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = '';
process.env.REDIS_DB = '1';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-access-token-12345';
process.env.MERCADOPAGO_PUBLIC_KEY = 'TEST-public-key-12345';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.DEV_UNLIMITED_EMAILS = '';
process.env.LOG_LEVEL = 'error';

// Mock logger to prevent console noise during tests
vi.mock('../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  },
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Global test utilities
beforeAll(() => {
  // Setup that runs before all tests in a file
});

afterAll(() => {
  // Cleanup after all tests in a file
  vi.clearAllMocks();
});

afterEach(() => {
  // Reset mocks between tests
  vi.clearAllMocks();
});
