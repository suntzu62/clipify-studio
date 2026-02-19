import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Use vi.hoisted for variables used in mock factories
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

// Mock pg Pool before importing the service
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

// Mock env
vi.mock('../config/env.js', () => ({
  env: {
    jwtSecret: 'test-jwt-secret-12345678901234567890123456789012',
    databaseUrl: 'postgresql://test:test@localhost:5432/test',
  },
}));

import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  registerUser,
  loginUser,
  getUserById,
  updateUserProfile,
  registerOrLoginGoogle,
} from './auth.service.js';

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true); // bcrypt hash prefix
    });

    it('should create different hashes for the same password', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2); // Salt should be different
    });

    it('should handle empty password', async () => {
      const hash = await hashPassword('');
      expect(hash).toBeDefined();
      expect(hash.startsWith('$2')).toBe(true);
    });

    it('should handle long passwords', async () => {
      const longPassword = 'a'.repeat(100);
      const hash = await hashPassword(longPassword);
      expect(hash).toBeDefined();
    });

    it('should handle special characters in password', async () => {
      const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const hash = await hashPassword(specialPassword);
      expect(hash).toBeDefined();
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const password = 'testPassword123';
      const hash = await bcrypt.hash(password, 10);

      const result = await verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'testPassword123';
      const hash = await bcrypt.hash(password, 10);

      const result = await verifyPassword('wrongPassword', hash);
      expect(result).toBe(false);
    });

    it('should return false for empty password against hash', async () => {
      const hash = await bcrypt.hash('realPassword', 10);

      const result = await verifyPassword('', hash);
      expect(result).toBe(false);
    });

    it('should handle invalid hash format', async () => {
      const result = await verifyPassword('password', 'invalid-hash');
      expect(result).toBe(false);
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT token', () => {
      const userId = 'user-123';
      const email = 'test@example.com';

      const token = generateAccessToken(userId, email);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include userId and email in token payload', () => {
      const userId = 'user-123';
      const email = 'test@example.com';

      const token = generateAccessToken(userId, email);
      const decoded = jwt.decode(token) as any;

      expect(decoded.userId).toBe(userId);
      expect(decoded.email).toBe(email);
    });

    it('should set expiration to 7 days', () => {
      const token = generateAccessToken('user-123', 'test@example.com');
      const decoded = jwt.decode(token) as any;

      const now = Math.floor(Date.now() / 1000);
      const sevenDays = 7 * 24 * 60 * 60;

      expect(decoded.exp - decoded.iat).toBe(sevenDays);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', () => {
      const userId = 'user-123';

      const token = generateRefreshToken(userId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should include userId and type in payload', () => {
      const userId = 'user-123';

      const token = generateRefreshToken(userId);
      const decoded = jwt.decode(token) as any;

      expect(decoded.userId).toBe(userId);
      expect(decoded.type).toBe('refresh');
    });

    it('should set expiration to 30 days', () => {
      const token = generateRefreshToken('user-123');
      const decoded = jwt.decode(token) as any;

      const thirtyDays = 30 * 24 * 60 * 60;
      expect(decoded.exp - decoded.iat).toBe(thirtyDays);
    });
  });

  describe('verifyToken', () => {
    it('should return decoded payload for valid token', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const token = generateAccessToken(userId, email);

      const result = verifyToken(token);

      expect(result).toBeDefined();
      expect(result?.userId).toBe(userId);
      expect(result?.email).toBe(email);
    });

    it('should return null for expired token', () => {
      const token = jwt.sign(
        { userId: 'user-123', email: 'test@example.com' },
        'test-jwt-secret-12345678901234567890123456789012',
        { expiresIn: '-1s' }
      );

      const result = verifyToken(token);
      expect(result).toBeNull();
    });

    it('should return null for invalid token', () => {
      const result = verifyToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null for token with wrong secret', () => {
      const token = jwt.sign(
        { userId: 'user-123', email: 'test@example.com' },
        'wrong-secret',
        { expiresIn: '7d' }
      );

      const result = verifyToken(token);
      expect(result).toBeNull();
    });

    it('should return null for malformed JWT', () => {
      const result = verifyToken('not.a.valid.jwt.token');
      expect(result).toBeNull();
    });
  });

  describe('registerUser', () => {
    it('should register a new user successfully', async () => {
      const email = 'new@example.com';
      const password = 'password123';
      const fullName = 'New User';

      // Mock: user doesn't exist
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Mock: insert user
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-user-id',
          email,
          full_name: fullName,
          avatar_url: null,
          created_at: new Date(),
        }],
      });

      const result = await registerUser(email, password, fullName);

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(email);
      expect(result.user.full_name).toBe(fullName);
    });

    it('should throw error if email already exists', async () => {
      const email = 'existing@example.com';

      // Mock: user exists
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }], rowCount: 1 });

      await expect(registerUser(email, 'password123')).rejects.toThrow('Email already registered');
    });

    it('should hash the password before storing', async () => {
      const email = 'new@example.com';
      const password = 'password123';

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-user-id',
          email,
          full_name: null,
          avatar_url: null,
          created_at: new Date(),
        }],
      });

      await registerUser(email, password);

      // Check that the INSERT query was called with a hashed password
      const insertCall = mockQuery.mock.calls[1];
      const passwordParam = insertCall[1][2]; // Third parameter is password_hash
      expect(passwordParam).not.toBe(password);
      expect(passwordParam.startsWith('$2')).toBe(true);
    });

    it('should work without fullName parameter', async () => {
      const email = 'new@example.com';

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-user-id',
          email,
          full_name: null,
          avatar_url: null,
          created_at: new Date(),
        }],
      });

      const result = await registerUser(email, 'password123');

      expect(result.user.full_name).toBeNull();
    });
  });

  describe('loginUser', () => {
    it('should login user with correct credentials', async () => {
      const email = 'user@example.com';
      const password = 'password123';
      const passwordHash = await bcrypt.hash(password, 10);

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-id',
          email,
          full_name: 'Test User',
          avatar_url: null,
          password_hash: passwordHash,
          created_at: new Date(),
        }],
      });

      const result = await loginUser(email, password);

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(email);
    });

    it('should throw error for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(loginUser('nonexistent@example.com', 'password')).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for wrong password', async () => {
      const passwordHash = await bcrypt.hash('correctPassword', 10);

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-id',
          email: 'user@example.com',
          full_name: 'Test User',
          avatar_url: null,
          password_hash: passwordHash,
          created_at: new Date(),
        }],
      });

      await expect(loginUser('user@example.com', 'wrongPassword')).rejects.toThrow('Invalid credentials');
    });

    it('should generate valid tokens on successful login', async () => {
      const email = 'user@example.com';
      const password = 'password123';
      const passwordHash = await bcrypt.hash(password, 10);

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-id',
          email,
          full_name: 'Test User',
          avatar_url: null,
          password_hash: passwordHash,
          created_at: new Date(),
        }],
      });

      const result = await loginUser(email, password);

      // Verify tokens are valid
      const accessDecoded = verifyToken(result.accessToken);
      expect(accessDecoded?.userId).toBe('user-id');
      expect(accessDecoded?.email).toBe(email);
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'user@example.com',
        full_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await getUserById(userId);

      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getUserById('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should query with correct user ID', async () => {
      const userId = 'specific-user-id';
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getUserById(userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [userId]
      );
    });
  });

  describe('updateUserProfile', () => {
    it('should update full_name', async () => {
      const userId = 'user-123';
      const updates = { full_name: 'New Name' };

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'user@example.com',
          full_name: 'New Name',
          avatar_url: null,
          created_at: new Date(),
        }],
      });

      const result = await updateUserProfile(userId, updates);

      expect(result.full_name).toBe('New Name');
    });

    it('should update avatar_url', async () => {
      const userId = 'user-123';
      const updates = { avatar_url: 'https://example.com/new-avatar.jpg' };

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'user@example.com',
          full_name: 'Test User',
          avatar_url: 'https://example.com/new-avatar.jpg',
          created_at: new Date(),
        }],
      });

      const result = await updateUserProfile(userId, updates);

      expect(result.avatar_url).toBe('https://example.com/new-avatar.jpg');
    });

    it('should update multiple fields at once', async () => {
      const userId = 'user-123';
      const updates = {
        full_name: 'Updated Name',
        avatar_url: 'https://example.com/avatar.jpg',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'user@example.com',
          full_name: 'Updated Name',
          avatar_url: 'https://example.com/avatar.jpg',
          created_at: new Date(),
        }],
      });

      const result = await updateUserProfile(userId, updates);

      expect(result.full_name).toBe('Updated Name');
      expect(result.avatar_url).toBe('https://example.com/avatar.jpg');
    });
  });

  describe('registerOrLoginGoogle', () => {
    it('should create new user for first-time Google login', async () => {
      const email = 'google@gmail.com';
      const fullName = 'Google User';
      const avatarUrl = 'https://lh3.googleusercontent.com/avatar';

      // Mock: user doesn't exist
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Mock: insert user
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-google-user-id',
          email,
          full_name: fullName,
          avatar_url: avatarUrl,
          created_at: new Date(),
        }],
      });

      const result = await registerOrLoginGoogle(email, fullName, avatarUrl);

      expect(result).toBeDefined();
      expect(result.user.email).toBe(email);
      expect(result.user.full_name).toBe(fullName);
      expect(result.accessToken).toBeDefined();
    });

    it('should login existing Google user', async () => {
      const email = 'existing@gmail.com';
      const existingUser = {
        id: 'existing-user-id',
        email,
        full_name: 'Existing User',
        avatar_url: 'https://lh3.googleusercontent.com/old-avatar',
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [existingUser], rowCount: 1 });

      const result = await registerOrLoginGoogle(email);

      expect(result.user.id).toBe('existing-user-id');
      expect(result.accessToken).toBeDefined();
    });

    it('should update avatar if changed for existing user', async () => {
      const email = 'existing@gmail.com';
      const newAvatar = 'https://lh3.googleusercontent.com/new-avatar';
      const existingUser = {
        id: 'existing-user-id',
        email,
        full_name: 'Existing User',
        avatar_url: 'https://lh3.googleusercontent.com/old-avatar',
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [existingUser], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Update avatar

      const result = await registerOrLoginGoogle(email, 'Existing User', newAvatar);

      expect(result.user.avatar_url).toBe(newAvatar);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should not update avatar if unchanged', async () => {
      const email = 'existing@gmail.com';
      const sameAvatar = 'https://lh3.googleusercontent.com/same-avatar';
      const existingUser = {
        id: 'existing-user-id',
        email,
        full_name: 'Existing User',
        avatar_url: sameAvatar,
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [existingUser], rowCount: 1 });

      await registerOrLoginGoogle(email, 'Existing User', sameAvatar);

      // Should only call once (select), not update
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should work without avatar for new user', async () => {
      const email = 'noavatar@gmail.com';

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-user-id',
          email,
          full_name: 'No Avatar User',
          avatar_url: null,
          created_at: new Date(),
        }],
      });

      const result = await registerOrLoginGoogle(email, 'No Avatar User');

      expect(result.user.avatar_url).toBeNull();
    });
  });
});
