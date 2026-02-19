import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Use vi.hoisted for variables used in mock factories
const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
}));

// Mock dependencies
vi.mock('../config/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../services/auth.service.js', () => ({
  verifyToken: mockVerifyToken,
}));

import { authenticateJWT, optionalAuth } from './auth.middleware.js';
import {
  createMockRequest,
  createMockReply,
  createBearerAuthRequest,
} from '../test/helpers/fastify.helper.js';

describe('auth.middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticateJWT', () => {
    describe('token extraction', () => {
      it('should extract token from access_token cookie', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'cookie-token' },
        });

        mockVerifyToken.mockReturnValue({ userId: 'user-123', email: 'test@example.com' });

        await authenticateJWT(request, reply);

        expect(mockVerifyToken).toHaveBeenCalledWith('cookie-token');
        expect(request.user).toEqual({ userId: 'user-123', email: 'test@example.com' });
      });

      it('should fallback to Authorization header if no cookie', async () => {
        const { reply, state } = createMockReply();
        const request = createBearerAuthRequest('bearer-token');

        mockVerifyToken.mockReturnValue({ userId: 'user-456', email: 'bearer@example.com' });

        await authenticateJWT(request, reply);

        expect(mockVerifyToken).toHaveBeenCalledWith('bearer-token');
        expect(request.user).toEqual({ userId: 'user-456', email: 'bearer@example.com' });
      });

      it('should prefer cookie over Authorization header', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'cookie-token' },
          headers: { authorization: 'Bearer header-token' },
        });

        mockVerifyToken.mockReturnValue({ userId: 'user-789', email: 'cookie@example.com' });

        await authenticateJWT(request, reply);

        expect(mockVerifyToken).toHaveBeenCalledWith('cookie-token');
      });

      it('should handle Bearer prefix in Authorization header', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          headers: { authorization: 'Bearer my-token-123' },
        });

        mockVerifyToken.mockReturnValue({ userId: 'user-123', email: 'test@example.com' });

        await authenticateJWT(request, reply);

        expect(mockVerifyToken).toHaveBeenCalledWith('my-token-123');
      });

      it('should ignore Authorization header without Bearer prefix', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          headers: { authorization: 'Basic sometoken' },
        });

        await authenticateJWT(request, reply);

        expect(state.statusCode).toBe(401);
        expect(state.body.message).toBe('Missing authentication token');
      });
    });

    describe('authentication success', () => {
      it('should add user to request on valid token', async () => {
        const { reply } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'valid-token' },
        });

        mockVerifyToken.mockReturnValue({
          userId: 'user-id-123',
          email: 'user@example.com',
        });

        await authenticateJWT(request, reply);

        expect(request.user).toEqual({
          userId: 'user-id-123',
          email: 'user@example.com',
        });
      });

      it('should not send response on success', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'valid-token' },
        });

        mockVerifyToken.mockReturnValue({ userId: 'user-123', email: 'test@example.com' });

        await authenticateJWT(request, reply);

        expect(state.sent).toBe(false);
      });
    });

    describe('authentication failure', () => {
      it('should return 401 when no token provided', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({});

        await authenticateJWT(request, reply);

        expect(state.statusCode).toBe(401);
        expect(state.body).toEqual({
          error: 'Unauthorized',
          message: 'Missing authentication token',
        });
      });

      it('should return 401 when token is invalid', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'invalid-token' },
        });

        mockVerifyToken.mockReturnValue(null);

        await authenticateJWT(request, reply);

        expect(state.statusCode).toBe(401);
        expect(state.body).toEqual({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        });
      });

      it('should return 401 when token verification throws error', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'error-token' },
        });

        mockVerifyToken.mockImplementation(() => {
          throw new Error('Token verification failed');
        });

        await authenticateJWT(request, reply);

        expect(state.statusCode).toBe(401);
        expect(state.body.error).toBe('Unauthorized');
        expect(state.body.message).toBe('Authentication failed');
      });

      it('should not set user on request when authentication fails', async () => {
        const { reply } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'invalid-token' },
        });

        mockVerifyToken.mockReturnValue(null);

        await authenticateJWT(request, reply);

        expect(request.user).toBeUndefined();
      });
    });

    describe('edge cases', () => {
      it('should handle empty access_token cookie', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: '' },
        });

        await authenticateJWT(request, reply);

        expect(state.statusCode).toBe(401);
      });

      it('should handle undefined cookies object', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({});
        (request as any).cookies = undefined;

        await authenticateJWT(request, reply);

        expect(state.statusCode).toBe(401);
      });

      it('should handle empty Authorization header', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          headers: { authorization: '' },
        });

        await authenticateJWT(request, reply);

        expect(state.statusCode).toBe(401);
      });

      it('should handle "Bearer " with no token after', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          headers: { authorization: 'Bearer ' },
        });

        await authenticateJWT(request, reply);

        expect(state.statusCode).toBe(401);
      });
    });
  });

  describe('optionalAuth', () => {
    describe('with valid token', () => {
      it('should set user when valid token in cookie', async () => {
        const { reply } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'valid-token' },
        });

        mockVerifyToken.mockReturnValue({
          userId: 'user-123',
          email: 'test@example.com',
        });

        await optionalAuth(request, reply);

        expect(request.user).toEqual({
          userId: 'user-123',
          email: 'test@example.com',
        });
      });

      it('should set user when valid token in Authorization header', async () => {
        const { reply } = createMockReply();
        const request = createBearerAuthRequest('valid-token');

        mockVerifyToken.mockReturnValue({
          userId: 'user-456',
          email: 'header@example.com',
        });

        await optionalAuth(request, reply);

        expect(request.user).toEqual({
          userId: 'user-456',
          email: 'header@example.com',
        });
      });
    });

    describe('without token', () => {
      it('should not set user when no token provided', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({});

        await optionalAuth(request, reply);

        expect(request.user).toBeUndefined();
        expect(state.sent).toBe(false); // No error response
      });

      it('should not return error response', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({});

        await optionalAuth(request, reply);

        expect(state.sent).toBe(false);
        expect(reply.code).not.toHaveBeenCalled();
      });
    });

    describe('with invalid token', () => {
      it('should not set user when token is invalid', async () => {
        const { reply } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'invalid-token' },
        });

        mockVerifyToken.mockReturnValue(null);

        await optionalAuth(request, reply);

        expect(request.user).toBeUndefined();
      });

      it('should not return error response for invalid token', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'invalid-token' },
        });

        mockVerifyToken.mockReturnValue(null);

        await optionalAuth(request, reply);

        expect(state.sent).toBe(false);
      });

      it('should handle token verification errors silently', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'error-token' },
        });

        mockVerifyToken.mockImplementation(() => {
          throw new Error('Verification error');
        });

        await optionalAuth(request, reply);

        expect(request.user).toBeUndefined();
        expect(state.sent).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty token gracefully', async () => {
        const { reply, state } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: '' },
        });

        await optionalAuth(request, reply);

        expect(request.user).toBeUndefined();
        expect(state.sent).toBe(false);
      });

      it('should prefer cookie over header like authenticateJWT', async () => {
        const { reply } = createMockReply();
        const request = createMockRequest({
          cookies: { access_token: 'cookie-token' },
          headers: { authorization: 'Bearer header-token' },
        });

        mockVerifyToken.mockReturnValue({ userId: 'user-123', email: 'test@example.com' });

        await optionalAuth(request, reply);

        expect(mockVerifyToken).toHaveBeenCalledWith('cookie-token');
      });
    });
  });
});
