import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { Pool } from 'pg';

const logger = createLogger('auth');

// PostgreSQL connection
const pool = new Pool({
  connectionString: env.databaseUrl || 'postgresql://postgres:postgres@localhost:5432/cortai_dev',
});

export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

/**
 * Hash de senha usando bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verificar senha
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Gerar JWT token
 */
export function generateAccessToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email },
    env.jwtSecret,
    { expiresIn: '7d' } // 7 dias
  );
}

/**
 * Gerar refresh token
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign(
    { userId, type: 'refresh' },
    env.jwtSecret,
    { expiresIn: '30d' } // 30 dias
  );
}

/**
 * Verificar JWT token
 */
export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as { userId: string; email: string };
    return decoded;
  } catch (error) {
    logger.warn({ error }, 'Invalid token');
    return null;
  }
}

/**
 * Registrar novo usuário
 */
export async function registerUser(
  email: string,
  password: string,
  fullName?: string
): Promise<AuthTokens> {
  logger.info({ email }, 'Registering new user');

  // Verificar se usuário já existe
  const existing = await pool.query(
    'SELECT id FROM profiles WHERE email = $1',
    [email]
  );

  if (existing.rows.length > 0) {
    throw new Error('Email already registered');
  }

  // Hash da senha
  const passwordHash = await hashPassword(password);

  // Criar usuário
  const result = await pool.query(
    `INSERT INTO profiles (id, email, full_name, password_hash, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
     RETURNING id, email, full_name, avatar_url, created_at`,
    [email, fullName || null, passwordHash]
  );

  const user = result.rows[0];

  // Gerar tokens
  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id);

  logger.info({ userId: user.id, email }, 'User registered successfully');

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    },
  };
}

/**
 * Login de usuário
 */
export async function loginUser(email: string, password: string): Promise<AuthTokens> {
  logger.info({ email }, 'User login attempt');

  // Buscar usuário
  const result = await pool.query(
    `SELECT id, email, full_name, avatar_url, password_hash, created_at
     FROM profiles
     WHERE email = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid credentials');
  }

  const user = result.rows[0];

  // Verificar senha
  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  // Gerar tokens
  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id);

  logger.info({ userId: user.id, email }, 'User logged in successfully');

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    },
  };
}

/**
 * Buscar usuário por ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const result = await pool.query(
    `SELECT id, email, full_name, avatar_url, created_at
     FROM profiles
     WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Atualizar perfil do usuário
 */
export async function updateUserProfile(
  userId: string,
  updates: { full_name?: string; avatar_url?: string }
): Promise<User> {
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (updates.full_name !== undefined) {
    fields.push(`full_name = $${paramCount++}`);
    values.push(updates.full_name);
  }

  if (updates.avatar_url !== undefined) {
    fields.push(`avatar_url = $${paramCount++}`);
    values.push(updates.avatar_url);
  }

  fields.push(`updated_at = NOW()`);
  values.push(userId);

  const query = `
    UPDATE profiles
    SET ${fields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING id, email, full_name, avatar_url, created_at
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Registrar ou fazer login de usuário via Google OAuth
 */
export async function registerOrLoginGoogle(
  email: string,
  fullName?: string,
  avatarUrl?: string
): Promise<AuthTokens> {
  logger.info({ email }, 'Google OAuth login attempt');

  // Verificar se usuário já existe
  const existing = await pool.query(
    'SELECT id, email, full_name, avatar_url, created_at FROM profiles WHERE email = $1',
    [email]
  );

  let user;

  if (existing.rows.length > 0) {
    // Usuário já existe, fazer login
    user = existing.rows[0];

    // Atualizar avatar se mudou
    if (avatarUrl && avatarUrl !== user.avatar_url) {
      await pool.query(
        'UPDATE profiles SET avatar_url = $1, updated_at = NOW() WHERE id = $2',
        [avatarUrl, user.id]
      );
      user.avatar_url = avatarUrl;
    }

    logger.info({ userId: user.id, email }, 'Google OAuth login successful');
  } else {
    // Criar novo usuário (sem password_hash para OAuth)
    const result = await pool.query(
      `INSERT INTO profiles (id, email, full_name, avatar_url, password_hash, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, '', NOW(), NOW())
       RETURNING id, email, full_name, avatar_url, created_at`,
      [email, fullName || null, avatarUrl || null]
    );

    user = result.rows[0];
    logger.info({ userId: user.id, email }, 'Google OAuth user registered');
  }

  // Gerar tokens
  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    },
  };
}
