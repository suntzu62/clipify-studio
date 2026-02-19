import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import bcrypt from 'bcryptjs';

/**
 * Integration tests for the complete authentication flow.
 * These tests verify the end-to-end behavior of auth operations.
 *
 * Note: These tests use mocked database but test the full route handlers
 * and service interactions.
 */

// Use vi.hoisted for variables used in mock factories
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

// Mock the database pool
vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: mockQuery,
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  })),
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
    jwtSecret: 'test-jwt-secret-12345678901234567890123456789012',
    cookieSecret: 'test-cookie-secret-12345678901234567890',
    databaseUrl: 'postgresql://test:test@localhost:5432/test',
    isProduction: false,
    isDevelopment: true,
    // Keep rate limiting off in integration tests to avoid depending on redis.
    rateLimit: {
      enabled: false,
      register: { max: 10, windowSeconds: 3600 },
      login: { max: 50, windowSeconds: 300 },
      tempConfig: { max: 60, windowSeconds: 3600 },
      jobStart: { max: 20, windowSeconds: 3600 },
    },
    redis: {
      url: undefined,
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
      tls: false,
    },
    // Optional fields referenced by Google OAuth routes (not exercised here).
    baseUrl: 'http://localhost:3000',
    frontendUrl: 'http://localhost:8080',
    google: {
      clientId: undefined,
      clientSecret: undefined,
      callbackUrl: undefined,
    },
  },
}));

import { registerAuthRoutes } from '../../api/auth.routes.js';

describe('Auth Flow Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(cookie, { secret: 'test-cookie-secret-12345678901234567890' });
    await registerAuthRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Registration Flow', () => {
    it('should complete full registration flow', async () => {
      // Setup: User doesn't exist
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Setup: Insert user returns new user
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-user-uuid',
          email: 'newuser@test.com',
          full_name: 'New User',
          avatar_url: null,
          created_at: new Date(),
        }],
      });

      // Action: Register
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'newuser@test.com',
          password: 'securePassword123',
          fullName: 'New User',
        },
      });

      // Verify: Registration successful
      expect(registerResponse.statusCode).toBe(201);
      const registerBody = JSON.parse(registerResponse.body);
      expect(registerBody.success).toBe(true);
      expect(registerBody.user.email).toBe('newuser@test.com');

      // Verify: Cookies are set
      const cookies = registerResponse.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(Array.isArray(cookies) ? cookies.join(';') : cookies).toContain('access_token');
      expect(Array.isArray(cookies) ? cookies.join(';') : cookies).toContain('refresh_token');
    });

    it('should prevent duplicate registration', async () => {
      // Setup: User already exists
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }], rowCount: 1 });

      // Action: Try to register with existing email
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'existing@test.com',
          password: 'password123',
        },
      });

      // Verify: Registration rejected
      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Email already registered');
    });

    it('should validate registration input', async () => {
      // Test invalid email
      const invalidEmailResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'not-an-email',
          password: 'password123',
        },
      });
      expect(invalidEmailResponse.statusCode).toBe(400);

      // Test short password
      const shortPasswordResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'valid@test.com',
          password: '123', // Less than 6 chars
        },
      });
      expect(shortPasswordResponse.statusCode).toBe(400);
    });
  });

  describe('Login Flow', () => {
    it('should complete full login flow', async () => {
      const hashedPassword = await bcrypt.hash('correctPassword', 10);

      // Setup: User exists with hashed password
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-uuid',
          email: 'user@test.com',
          full_name: 'Test User',
          avatar_url: null,
          password_hash: hashedPassword,
          created_at: new Date(),
        }],
      });

      // Action: Login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@test.com',
          password: 'correctPassword',
        },
      });

      // Verify: Login successful
      expect(loginResponse.statusCode).toBe(200);
      const loginBody = JSON.parse(loginResponse.body);
      expect(loginBody.success).toBe(true);
      expect(loginBody.user.email).toBe('user@test.com');

      // Verify: Access token cookie is set
      const cookies = loginResponse.headers['set-cookie'];
      expect(cookies).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      const hashedPassword = await bcrypt.hash('correctPassword', 10);

      // Setup: User exists
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-uuid',
          email: 'user@test.com',
          password_hash: hashedPassword,
        }],
      });

      // Action: Login with wrong password
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@test.com',
          password: 'wrongPassword',
        },
      });

      // Verify: Login rejected
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      // Setup: User doesn't exist
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Action: Login
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'nonexistent@test.com',
          password: 'anyPassword',
        },
      });

      // Verify: Login rejected
      expect(response.statusCode).toBe(401);
    });
  });

  describe('Session Verification Flow', () => {
    it('should verify valid session', async () => {
      // First, simulate a successful login to get tokens
      const hashedPassword = await bcrypt.hash('password', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-uuid',
          email: 'session@test.com',
          full_name: 'Session User',
          password_hash: hashedPassword,
          created_at: new Date(),
        }],
      });

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'session@test.com',
          password: 'password',
        },
      });

      expect(loginResponse.statusCode).toBe(200);

      // Extract access_token from cookies
      const setCookieHeaders = loginResponse.headers['set-cookie'];
      const cookiesArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
      const accessTokenCookie = cookiesArray.find(c => c?.startsWith('access_token='));
      const accessToken = accessTokenCookie?.split(';')[0].split('=')[1];

      // Setup: User exists for /me endpoint
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-uuid',
          email: 'session@test.com',
          full_name: 'Session User',
          avatar_url: null,
          created_at: new Date(),
        }],
      });

      // Action: Check session
      const meResponse = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { access_token: accessToken },
      });

      // Verify: Session is valid
      expect(meResponse.statusCode).toBe(200);
      const meBody = JSON.parse(meResponse.body);
      expect(meBody.user).toBeDefined();
      expect(meBody.user.email).toBe('session@test.com');
    });

    it('should handle unauthenticated /me request gracefully', async () => {
      // Action: Check session without token
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });

      // Verify: Returns 200 with null user (not 401)
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeNull();
    });
  });

  describe('Complete User Journey', () => {
    it('should handle register → login → verify → logout flow', async () => {
      const email = 'journey@test.com';
      const password = 'journeyPassword123';

      // Step 1: Register
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // User doesn't exist
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'journey-user-id',
          email,
          full_name: 'Journey User',
          created_at: new Date(),
        }],
      });

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password, fullName: 'Journey User' },
      });

      expect(registerResponse.statusCode).toBe(201);

      // Step 2: Login with new account
      const hashedPassword = await bcrypt.hash(password, 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'journey-user-id',
          email,
          full_name: 'Journey User',
          password_hash: hashedPassword,
          created_at: new Date(),
        }],
      });

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
      });

      expect(loginResponse.statusCode).toBe(200);

      // Extract token
      const cookies = loginResponse.headers['set-cookie'];
      const cookiesArray = Array.isArray(cookies) ? cookies : [cookies];
      const accessTokenCookie = cookiesArray.find(c => c?.startsWith('access_token='));
      const accessToken = accessTokenCookie?.split(';')[0].split('=')[1];

      // Step 3: Verify session
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'journey-user-id',
          email,
          full_name: 'Journey User',
          created_at: new Date(),
        }],
      });

      const meResponse = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { access_token: accessToken },
      });

      expect(meResponse.statusCode).toBe(200);
      const meBody = JSON.parse(meResponse.body);
      expect(meBody.user.email).toBe(email);

      // Step 4: Logout
      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { access_token: accessToken },
      });

      expect(logoutResponse.statusCode).toBe(200);
      // Verify cookies are cleared (maxAge=0 or expired)
      const logoutCookies = logoutResponse.headers['set-cookie'];
      expect(logoutCookies).toBeDefined();
    });
  });
});
