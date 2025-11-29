import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerUser, loginUser, getUserById, registerOrLoginGoogle } from '../services/auth.service.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';

const logger = createLogger('auth-routes');

export async function registerAuthRoutes(app: FastifyInstance) {
  // ============================================
  // REGISTER - Criar nova conta
  // ============================================
  app.post('/auth/register', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      fullName: z.string().optional(),
    });

    try {
      const body = schema.parse(request.body);

      const result = await registerUser(
        body.email,
        body.password,
        body.fullName
      );

      logger.info({ userId: result.user.id, email: body.email }, 'User registered');

      return reply.code(201).send({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (error: any) {
      logger.error({ error }, 'Registration failed');

      if (error.message === 'Email already registered') {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Email already registered',
        });
      }

      return reply.code(400).send({
        error: 'Bad Request',
        message: error.message || 'Registration failed',
      });
    }
  });

  // ============================================
  // LOGIN - Autenticar usuário
  // ============================================
  app.post('/auth/login', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });

    try {
      const body = schema.parse(request.body);

      const result = await loginUser(body.email, body.password);

      logger.info({ userId: result.user.id, email: body.email }, 'User logged in');

      return reply.code(200).send({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (error: any) {
      logger.error({ error }, 'Login failed');

      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    }
  });

  // ============================================
  // ME - Buscar usuário autenticado
  // ============================================
  app.get('/auth/me', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Not authenticated',
        });
      }

      const user = await getUserById(request.user.userId);

      if (!user) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'User not found',
        });
      }

      return reply.code(200).send({ user });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch user');

      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch user',
      });
    }
  });

  // ============================================
  // LOGOUT - Logout (client-side only, invalidar token)
  // ============================================
  app.post('/auth/logout', async (_request, reply) => {
    // JWT é stateless, logout é feito no client removendo o token
    return reply.code(200).send({
      message: 'Logged out successfully',
    });
  });

  // ============================================
  // GOOGLE OAUTH - Redirect to Google
  // ============================================
  app.get('/auth/google', async (_request, reply) => {
    if (!env.google.clientId || !env.google.callbackUrl) {
      return reply.code(500).send({
        error: 'Server Error',
        message: 'Google OAuth not configured',
      });
    }

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', env.google.clientId);
    googleAuthUrl.searchParams.set('redirect_uri', env.google.callbackUrl);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'openid email profile');
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'consent');

    return reply.redirect(googleAuthUrl.toString());
  });

  // ============================================
  // GOOGLE OAUTH - Callback
  // ============================================
  app.get('/auth/google/callback', async (request, reply) => {
    const schema = z.object({
      code: z.string(),
    });

    try {
      const { code } = schema.parse(request.query);

      if (!env.google.clientId || !env.google.clientSecret || !env.google.callbackUrl) {
        throw new Error('Google OAuth not configured');
      }

      // Trocar code por access_token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: env.google.clientId,
          client_secret: env.google.clientSecret,
          redirect_uri: env.google.callbackUrl,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        logger.error({ error: tokenData }, 'Google OAuth token exchange failed');
        throw new Error('Failed to exchange code for token');
      }

      // Buscar informações do usuário
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const userInfo = await userInfoResponse.json();

      if (!userInfoResponse.ok) {
        logger.error({ error: userInfo }, 'Google OAuth userinfo failed');
        throw new Error('Failed to fetch user info');
      }

      // Registrar ou fazer login do usuário
      const result = await registerOrLoginGoogle(
        userInfo.email,
        userInfo.name,
        userInfo.picture
      );

      logger.info({ userId: result.user.id, email: userInfo.email }, 'Google OAuth successful');

      // Redirecionar para frontend com tokens
      const frontendUrl = env.isDevelopment ? 'http://localhost:8080' : env.baseUrl;
      const redirectUrl = new URL('/auth/callback', frontendUrl);
      redirectUrl.searchParams.set('access_token', result.accessToken);
      redirectUrl.searchParams.set('refresh_token', result.refreshToken);

      return reply.redirect(redirectUrl.toString());
    } catch (error: any) {
      logger.error({ error }, 'Google OAuth callback failed');

      // Redirecionar para login com erro
      const frontendUrl = env.isDevelopment ? 'http://localhost:8080' : env.baseUrl;
      const errorUrl = new URL('/auth/login', frontendUrl);
      errorUrl.searchParams.set('error', 'google_oauth_failed');

      return reply.redirect(errorUrl.toString());
    }
  });
}
