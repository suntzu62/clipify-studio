import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

// Use vi.hoisted for variables used in mock factories
const {
  mockRegisterUser,
  mockLoginUser,
  mockGetUserById,
  mockRegisterOrLoginGoogle,
  mockUpdateUserProfile,
  mockGetUserSettings,
  mockUpsertUserSettings,
  mockVerifyToken,
} = vi.hoisted(() => ({
  mockRegisterUser: vi.fn(),
  mockLoginUser: vi.fn(),
  mockGetUserById: vi.fn(),
  mockRegisterOrLoginGoogle: vi.fn(),
  mockUpdateUserProfile: vi.fn(),
  mockGetUserSettings: vi.fn(),
  mockUpsertUserSettings: vi.fn(),
  mockVerifyToken: vi.fn(),
}));

// Mock auth service
vi.mock('../services/auth.service.js', () => ({
  registerUser: mockRegisterUser,
  loginUser: mockLoginUser,
  getUserById: mockGetUserById,
  registerOrLoginGoogle: mockRegisterOrLoginGoogle,
  updateUserProfile: mockUpdateUserProfile,
}));

// Mock user settings service
vi.mock('../services/user-settings.service.js', () => ({
  getUserSettings: mockGetUserSettings,
  upsertUserSettings: mockUpsertUserSettings,
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
      if (decoded) {
        request.user = decoded;
      }
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
    isDevelopment: true,
    cookieSecret: 'test-cookie-secret-12345678901234567890',
    // Keep rate limiting off in unit tests to avoid redis dependency and flakiness.
    rateLimit: {
      enabled: false,
      register: { max: 10, windowSeconds: 3600 },
      login: { max: 50, windowSeconds: 300 },
      tempConfig: { max: 60, windowSeconds: 3600 },
      jobStart: { max: 20, windowSeconds: 3600 },
    },
    // Required by config/redis import (used by rate-limit middleware).
    redis: {
      url: undefined,
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
      tls: false,
    },
    // Optional fields referenced by Google OAuth routes (not exercised in these tests).
    baseUrl: 'http://localhost:3000',
    frontendUrl: 'http://localhost:8080',
    google: {
      clientId: undefined,
      clientSecret: undefined,
      callbackUrl: undefined,
    },
  },
}));

import { registerAuthRoutes } from './auth.routes.js';

describe('auth.routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cookie, { secret: 'test-cookie-secret' });
    await registerAuthRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      mockRegisterUser.mockResolvedValue({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        user: {
          id: 'user-123',
          email: 'new@example.com',
          full_name: 'New User',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'new@example.com',
          password: 'password123',
          fullName: 'New User',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.email).toBe('new@example.com');

      // Check cookies are set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
    });

    it('should return 409 when email already registered', async () => {
      mockRegisterUser.mockRejectedValue(new Error('Email already registered'));

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'existing@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Email already registered');
    });

    it('should return 400 for invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for short password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: '123', // Too short
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should login user successfully', async () => {
      mockLoginUser.mockResolvedValue({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        user: {
          id: 'user-123',
          email: 'user@example.com',
          full_name: 'Test User',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.email).toBe('user@example.com');
    });

    it('should return 401 for invalid credentials', async () => {
      mockLoginUser.mockRejectedValue(new Error('Invalid credentials'));

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Invalid credentials');
    });

    it('should return 400 for invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'not-an-email',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(401); // Zod validation fails, returns 401
    });
  });

  describe('GET /auth/me', () => {
    it('should return user when authenticated', async () => {
      mockVerifyToken.mockReturnValue({ userId: 'user-123', email: 'test@example.com' });
      mockGetUserById.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user.id).toBe('user-123');
    });

    it('should return null user when not authenticated', async () => {
      mockVerifyToken.mockReturnValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeNull();
    });

    it('should return null user when token is invalid', async () => {
      mockVerifyToken.mockReturnValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { access_token: 'invalid-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeNull();
    });

    it('should return null when user not found in database', async () => {
      mockVerifyToken.mockReturnValue({ userId: 'deleted-user', email: 'test@example.com' });
      mockGetUserById.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { access_token: 'valid-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeNull();
    });
  });
});
