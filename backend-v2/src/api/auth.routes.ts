import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerUser, loginUser, getUserById, registerOrLoginGoogle, updateUserProfile } from '../services/auth.service.js';
import { getUserSettings, upsertUserSettings } from '../services/user-settings.service.js';
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

      // Set httpOnly cookies for security
      reply.setCookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/',
      });

      reply.setCookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });

      return reply.code(201).send({
        user: result.user,
        success: true,
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

      // Set httpOnly cookies for security
      reply.setCookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/',
      });

      reply.setCookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });

      return reply.code(200).send({
        user: result.user,
        success: true,
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
  // UPDATE PROFILE - Atualizar dados do usuário
  // ============================================
  app.patch('/auth/me', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const schema = z.object({
      fullName: z.string().min(1).optional(),
      avatarUrl: z.string().url().optional(),
    });

    try {
      const body = schema.parse(request.body);

      if (!request.user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Not authenticated',
        });
      }

      const updates: { full_name?: string; avatar_url?: string } = {};
      if (body.fullName) {
        updates.full_name = body.fullName.trim();
      }
      if (body.avatarUrl) {
        updates.avatar_url = body.avatarUrl.trim();
      }

      if (!Object.keys(updates).length) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No valid fields to update',
        });
      }

      const user = await updateUserProfile(request.user.userId, updates);

      return reply.code(200).send({ user });
    } catch (error: any) {
      logger.error({ error }, 'Failed to update profile');
      return reply.code(400).send({
        error: 'Bad Request',
        message: error.message || 'Failed to update profile',
      });
    }
  });

  // ============================================
  // USER SETTINGS - Preferencias do usuario
  // ============================================
  app.get('/user/settings', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const settings = await getUserSettings(userId);
      return reply.code(200).send({ settings });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch user settings');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch user settings',
      });
    }
  });

  app.patch('/user/settings', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const schema = z.object({
      notifications: z.object({
        jobCompleteEmail: z.boolean().optional(),
        jobFailedEmail: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
      }).optional(),
      privacy: z.object({
        profileVisible: z.boolean().optional(),
        shareAnalytics: z.boolean().optional(),
        personalizedRecommendations: z.boolean().optional(),
      }).optional(),
      appearance: z.object({
        reduceMotion: z.boolean().optional(),
        glassEffects: z.boolean().optional(),
        highContrast: z.boolean().optional(),
      }).optional(),
      language: z.enum(['pt-BR', 'en-US', 'es-ES']).optional(),
    });

    try {
      const updates = schema.parse(request.body);
      const userId = request.user!.userId;
      const settings = await upsertUserSettings(userId, updates);
      return reply.code(200).send({ settings });
    } catch (error) {
      logger.error({ error }, 'Failed to update user settings');
      return reply.code(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Failed to update user settings',
      });
    }
  });

  // ============================================
  // LOGOUT - Clear httpOnly cookies
  // ============================================
  app.post('/auth/logout', async (_request, reply) => {
    // Clear httpOnly cookies
    reply.clearCookie('access_token', { path: '/' });
    reply.clearCookie('refresh_token', { path: '/' });

    return reply.code(200).send({
      message: 'Logged out successfully',
      success: true,
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

      const tokenDataRaw = await tokenResponse.json();

      if (!tokenResponse.ok) {
        logger.error({ error: tokenDataRaw }, 'Google OAuth token exchange failed');
        throw new Error('Failed to exchange code for token');
      }

      const tokenData = z.object({
        access_token: z.string(),
      }).passthrough().parse(tokenDataRaw);

      // Buscar informações do usuário
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const userInfoRaw = await userInfoResponse.json();

      if (!userInfoResponse.ok) {
        logger.error({ error: userInfoRaw }, 'Google OAuth userinfo failed');
        throw new Error('Failed to fetch user info');
      }

      const userInfo = z.object({
        email: z.string().email(),
        name: z.string().optional(),
        picture: z.string().optional(),
      }).passthrough().parse(userInfoRaw);

      // Registrar ou fazer login do usuário
      const result = await registerOrLoginGoogle(
        userInfo.email,
        userInfo.name,
        userInfo.picture
      );

      logger.info({ userId: result.user.id, email: userInfo.email }, 'Google OAuth successful');

      // Set httpOnly cookies for security
      reply.setCookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/',
      });

      reply.setCookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });

      // Redirecionar para frontend sem tokens na URL (mais seguro)
      const frontendUrl = env.isDevelopment ? 'http://localhost:8080' : env.baseUrl;
      const redirectUrl = new URL('/auth/callback', frontendUrl);
      redirectUrl.searchParams.set('success', 'true');

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
