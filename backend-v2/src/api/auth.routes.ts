import { FastifyInstance, FastifyReply } from 'fastify';
import { randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { registerUser, loginUser, getUserById, registerOrLoginGoogle, updateUserProfile } from '../services/auth.service.js';
import { getUserSettings, upsertUserSettings } from '../services/user-settings.service.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import { buildFrontendAppUrl } from '../utils/frontend-url.js';

const logger = createLogger('auth-routes');

function readObjectStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  const cookieSameSite = env.isProduction ? 'none' : 'lax';
  const sessionCookieOptions = {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: cookieSameSite as 'lax' | 'none',
    path: '/',
    domain: env.security.cookieDomain,
  };
  const oauthStateCookieName = 'google_oauth_state';
  const oauthStateCookieOptions = {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax' as const,
    path: '/auth',
    maxAge: 10 * 60,
    domain: env.security.cookieDomain,
  };

  const clearSessionCookies = (reply: FastifyReply) => {
    reply.clearCookie('access_token', {
      ...sessionCookieOptions,
    });
    reply.clearCookie('refresh_token', {
      ...sessionCookieOptions,
    });
  };

  const setSessionCookies = (
    reply: FastifyReply,
    accessToken: string,
    refreshToken: string
  ) => {
    reply.setCookie('access_token', accessToken, {
      ...sessionCookieOptions,
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.setCookie('refresh_token', refreshToken, {
      ...sessionCookieOptions,
      maxAge: 30 * 24 * 60 * 60,
    });
  };

  const statesMatch = (expected: string | undefined, received: string | undefined): boolean => {
    if (!expected || !received) {
      return false;
    }

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, receivedBuffer);
  };

  // ============================================
  // REGISTER - Criar nova conta
  // ============================================
  app.post('/auth/register', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '10 minutes',
      },
    },
  }, async (request, reply) => {
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

      setSessionCookies(reply, result.accessToken, result.refreshToken);

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
  app.post('/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '10 minutes',
      },
    },
  }, async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });

    try {
      const body = schema.parse(request.body);

      const result = await loginUser(body.email, body.password);

      logger.info({ userId: result.user.id, email: body.email }, 'User logged in');

      setSessionCookies(reply, result.accessToken, result.refreshToken);

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
    clearSessionCookies(reply);
    reply.clearCookie(oauthStateCookieName, {
      ...oauthStateCookieOptions,
    });

    return reply.code(200).send({
      message: 'Logged out successfully',
      success: true,
    });
  });

  // ============================================
  // GOOGLE OAUTH - Redirect to Google
  // ============================================
  app.get('/auth/google', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '10 minutes',
      },
    },
  }, async (_request, reply) => {
    if (!env.google.clientId || !env.google.callbackUrl) {
      return reply.code(500).send({
        error: 'Server Error',
        message: 'Google OAuth not configured',
      });
    }

    const state = randomBytes(32).toString('hex');
    reply.setCookie(oauthStateCookieName, state, oauthStateCookieOptions);

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', env.google.clientId);
    googleAuthUrl.searchParams.set('redirect_uri', env.google.callbackUrl);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'openid email profile');
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'consent');
    googleAuthUrl.searchParams.set('state', state);

    return reply.redirect(googleAuthUrl.toString());
  });

  // ============================================
  // GOOGLE OAUTH - Callback
  // ============================================
  app.get('/auth/google/callback', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '10 minutes',
      },
    },
  }, async (request, reply) => {
    const schema = z.object({
      code: z.string(),
      state: z.string(),
    });

    try {
      const { code, state } = schema.parse(request.query);
      const expectedState = (request.cookies as Record<string, string> | undefined)?.[oauthStateCookieName];

      if (!statesMatch(expectedState, state)) {
        throw new Error('Invalid OAuth state');
      }

      reply.clearCookie(oauthStateCookieName, {
        ...oauthStateCookieOptions,
      });

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
        logger.error({
          status: tokenResponse.status,
          error: readObjectStringField(tokenDataRaw, 'error') || 'token_exchange_failed',
        }, 'Google OAuth token exchange failed');
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
        logger.error({
          status: userInfoResponse.status,
          error: readObjectStringField(userInfoRaw, 'error') || 'userinfo_failed',
        }, 'Google OAuth userinfo failed');
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

      setSessionCookies(reply, result.accessToken, result.refreshToken);

      // Redirecionar para frontend sem tokens na URL (mais seguro)
      return reply.redirect(buildFrontendAppUrl(env.frontendUrl, '/dashboard'));
    } catch (error: any) {
      reply.clearCookie(oauthStateCookieName, {
        ...oauthStateCookieOptions,
      });
      logger.error({ error }, 'Google OAuth callback failed');

      // Redirecionar para login com erro
      return reply.redirect(
        buildFrontendAppUrl(env.frontendUrl, '/auth/login', {
          error: 'google_oauth_failed',
        })
      );
    }
  });
}
