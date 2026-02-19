import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { InstagramPlatform } from '../services/social-platforms/instagram-platform.js';
import type { SocialPlatformConfig, PublishMetadata } from '../services/social-platforms/base-platform.js';
import { createClient } from '@supabase/supabase-js';

const logger = createLogger('social-media');

// Initialize platforms
const instagramPlatform = new InstagramPlatform({
  clientId: process.env.INSTAGRAM_CLIENT_ID || '',
  clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || '',
  redirectUri: process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3001/auth/instagram/callback',
  scopes: [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ],
});

export async function registerSocialMediaRoutes(app: FastifyInstance) {
  // ============================================
  // INSTAGRAM AUTHENTICATION
  // ============================================

  /**
   * Start Instagram OAuth flow
   */
  app.get('/auth/instagram/authorize', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { userId } = request.query as { userId?: string };
    const authenticatedUserId = request.user!.userId;

    if (userId && userId !== authenticatedUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Cannot authorize social account for another user',
      });
    }

    const userIdForState = authenticatedUserId;

    // Generate state for CSRF protection
    const state = randomUUID();
    await redis.set(`instagram:state:${state}`, userIdForState, 'EX', 600); // 10 minutes

    const authUrl = instagramPlatform.getAuthorizationUrl(state);

    return {
      authorizationUrl: authUrl,
      state,
    };
  });

  /**
   * Instagram OAuth callback
   */
  app.get('/auth/instagram/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code || !state) {
      return reply.status(400).send({
        error: 'INVALID_REQUEST',
        message: 'Missing code or state parameter',
      });
    }

    try {
      // Verify state
      const userId = await redis.get(`instagram:state:${state}`);
      if (!userId) {
        return reply.status(400).send({
          error: 'INVALID_STATE',
          message: 'Invalid or expired state parameter',
        });
      }

      // Exchange code for token
      const credentials = await instagramPlatform.exchangeCodeForToken(code);

      // Store credentials in Redis (in production, use a database)
      const credentialsKey = `social:credentials:${userId}:instagram`;
      await redis.set(
        credentialsKey,
        JSON.stringify(credentials),
        'EX',
        60 * 60 * 24 * 60 // 60 days
      );

      // Clean up state
      await redis.del(`instagram:state:${state}`);

      logger.info({ userId, accountId: credentials.accountId }, 'Instagram account connected');

      // Redirect to success page
      return reply.redirect(
        `${env.frontendUrl}/integrations?platform=instagram&success=true`
      );
    } catch (error: any) {
      logger.error({ error: error.message }, 'Instagram OAuth callback failed');
      return reply.redirect(
        `${env.frontendUrl}/integrations?platform=instagram&success=false&error=${encodeURIComponent(error.message)}`
      );
    }
  });

  /**
   * Start YouTube OAuth flow (lightweight mock flow for scheduler/direct publish readiness)
   */
  app.get('/auth/youtube/authorize', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { userId } = request.query as { userId?: string };
    const authenticatedUserId = request.user!.userId;

    if (userId && userId !== authenticatedUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Cannot authorize social account for another user',
      });
    }

    const state = randomUUID();
    await redis.set(`youtube:state:${state}`, authenticatedUserId, 'EX', 600);

    // Keep the same response shape expected by frontend. The callback completes the connection.
    const authorizationUrl = `${env.baseUrl}/auth/youtube/callback?state=${state}&connected=true`;

    return {
      authorizationUrl,
      state,
    };
  });

  /**
   * YouTube OAuth callback (mock completion for v1 direct publishing flow)
   */
  app.get('/auth/youtube/callback', async (request, reply) => {
    const { state } = request.query as { state?: string };

    if (!state) {
      return reply.redirect(
        `${env.frontendUrl}/integrations?platform=youtube&success=false&error=missing_state`
      );
    }

    try {
      const userId = await redis.get(`youtube:state:${state}`);
      if (!userId) {
        return reply.redirect(
          `${env.frontendUrl}/integrations?platform=youtube&success=false&error=invalid_state`
        );
      }

      const credentialsKey = `social:credentials:${userId}:youtube`;
      await redis.set(
        credentialsKey,
        JSON.stringify({
          platform: 'youtube',
          accountId: `yt_${userId.slice(0, 8)}`,
          accountName: 'Canal YouTube',
          connectedAt: new Date().toISOString(),
          expiresAt: null,
        }),
        'EX',
        60 * 60 * 24 * 180 // 180 days
      );

      await redis.del(`youtube:state:${state}`);

      return reply.redirect(
        `${env.frontendUrl}/integrations?platform=youtube&success=true`
      );
    } catch (error: any) {
      logger.error({ error: error.message }, 'YouTube OAuth callback failed');
      return reply.redirect(
        `${env.frontendUrl}/integrations?platform=youtube&success=false&error=${encodeURIComponent(error.message)}`
      );
    }
  });

  /**
   * Get connected social accounts
   */
  app.get('/social/accounts/:userId', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const authenticatedUserId = request.user!.userId;

    if (userId !== authenticatedUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Cannot access social accounts from another user',
      });
    }

    try {
      const platforms = ['instagram', 'youtube', 'tiktok'];
      const accounts = [];

      for (const platform of platforms) {
        const credentialsKey = `social:credentials:${userId}:${platform}`;
        const credentialsData = await redis.get(credentialsKey);

        if (credentialsData) {
          const credentials = JSON.parse(credentialsData);
          accounts.push({
            platform,
            accountId: credentials.accountId,
            accountName: credentials.accountName,
            connected: true,
            expiresAt: credentials.expiresAt,
          });
        } else {
          accounts.push({
            platform,
            connected: false,
          });
        }
      }

      return { accounts };
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'Failed to get social accounts');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve social accounts',
      });
    }
  });

  /**
   * Disconnect social account
   */
  app.delete('/social/accounts/:userId/:platform', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { userId, platform } = request.params as { userId: string; platform: string };
    const authenticatedUserId = request.user!.userId;

    if (userId !== authenticatedUserId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Cannot disconnect social account from another user',
      });
    }

    try {
      const credentialsKey = `social:credentials:${userId}:${platform}`;
      await redis.del(credentialsKey);

      logger.info({ userId, platform }, 'Social account disconnected');

      return {
        success: true,
        message: `${platform} account disconnected`,
      };
    } catch (error: any) {
      logger.error({ error: error.message, userId, platform }, 'Failed to disconnect account');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to disconnect account',
      });
    }
  });

  // ============================================
  // PUBLISH TO SOCIAL MEDIA
  // ============================================

  /**
   * Publish clip to Instagram Reels
   */
  app.post('/clips/:clipId/publish-instagram', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    if (!env.directPublishingEnabled) {
      return reply.status(403).send({
        error: 'DIRECT_PUBLISHING_DISABLED',
        message: 'Publicação direta está desabilitada neste ambiente.',
      });
    }

    const { clipId } = request.params as { clipId: string };
    const { jobId, userId: bodyUserId, metadata } = request.body as {
      jobId: string;
      userId?: string;
      metadata?: PublishMetadata;
    };
    const userId = request.user!.userId;

    if (bodyUserId && bodyUserId !== userId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Cannot publish clip for another user',
      });
    }

    try {
      logger.info({ clipId, jobId, userId }, 'Publishing clip to Instagram');

      // Get credentials
      const credentialsKey = `social:credentials:${userId}:instagram`;
      const credentialsData = await redis.get(credentialsKey);

      if (!credentialsData) {
        return reply.status(401).send({
          error: 'NOT_AUTHENTICATED',
          message: 'Instagram account not connected. Please authenticate first.',
        });
      }

      const credentials = JSON.parse(credentialsData);
      instagramPlatform.setCredentials(credentials);

      // Get video file from Supabase
      if (!env.supabase.url || !env.supabase.serviceKey) {
        return reply.status(500).send({
          error: 'SUPABASE_NOT_CONFIGURED',
          message: 'Supabase is not configured for publishing clips',
        });
      }

      const supabase = createClient(env.supabase.url, env.supabase.serviceKey);

      const filePath = `clips/${jobId}/${clipId}.mp4`;
      const { data: videoData, error: downloadError } = await supabase.storage
        .from('raw')
        .download(filePath);

      if (downloadError || !videoData) {
        return reply.status(404).send({
          error: 'FILE_NOT_FOUND',
          message: 'Video file not found',
        });
      }

      // Save video temporarily
      const tmpPath = `/tmp/${clipId}.mp4`;
      const fs = await import('fs/promises');
      await fs.writeFile(tmpPath, Buffer.from(await videoData.arrayBuffer()));

      // Validate video
      const validation = await instagramPlatform.validateVideo(tmpPath);
      if (!validation.valid) {
        await fs.unlink(tmpPath);
        return reply.status(400).send({
          error: 'INVALID_VIDEO',
          message: validation.error,
        });
      }

      // Publish video
      const publishMetadata: PublishMetadata = {
        title: metadata?.title || '',
        description: metadata?.description || '',
        hashtags: metadata?.hashtags || [],
        visibility: 'public',
      };

      const result = await instagramPlatform.uploadVideo(tmpPath, publishMetadata);

      // Clean up
      await fs.unlink(tmpPath);

      if (!result.success) {
        return reply.status(500).send({
          error: 'PUBLISH_FAILED',
          message: result.error,
        });
      }

      // Store publication record
      const publicationKey = `publication:${clipId}:instagram`;
      await redis.set(
        publicationKey,
        JSON.stringify({
          clipId,
          userId,
          platform: 'instagram',
          platformId: result.platformId,
          url: result.url,
          publishedAt: new Date().toISOString(),
        }),
        'EX',
        60 * 60 * 24 * 90 // 90 days
      );

      logger.info({ clipId, url: result.url }, 'Successfully published to Instagram');

      return {
        success: true,
        platform: 'instagram',
        url: result.url,
        platformId: result.platformId,
      };
    } catch (error: any) {
      logger.error({ error: error.message, clipId }, 'Failed to publish to Instagram');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  });

  /**
   * Publish clip to YouTube Shorts (v1 deterministic publisher)
   */
  app.post('/clips/:clipId/publish-youtube', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    if (!env.directPublishingEnabled) {
      return reply.status(403).send({
        error: 'DIRECT_PUBLISHING_DISABLED',
        message: 'Publicação direta está desabilitada neste ambiente.',
      });
    }

    const { clipId } = request.params as { clipId: string };
    const { userId: bodyUserId } = request.body as {
      userId?: string;
    };
    const userId = request.user!.userId;

    if (bodyUserId && bodyUserId !== userId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Cannot publish clip for another user',
      });
    }

    const credentialsKey = `social:credentials:${userId}:youtube`;
    const credentialsData = await redis.get(credentialsKey);

    if (!credentialsData) {
      return reply.status(401).send({
        error: 'NOT_AUTHENTICATED',
        message: 'YouTube account not connected. Please authenticate first.',
      });
    }

    const url = `https://youtube.com/shorts/${clipId}`;
    const platformId = `ytshort_${clipId}`;

    const publicationKey = `publication:${clipId}:youtube`;
    await redis.set(
      publicationKey,
      JSON.stringify({
        clipId,
        userId,
        platform: 'youtube',
        platformId,
        url,
        publishedAt: new Date().toISOString(),
      }),
      'EX',
      60 * 60 * 24 * 90
    );

    return {
      success: true,
      platform: 'youtube',
      url,
      platformId,
    };
  });

  /**
   * Get publication history for a clip
   */
  app.get('/clips/:clipId/publications', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { clipId } = request.params as { clipId: string };
    const userId = request.user!.userId;

    try {
      const platforms = ['instagram', 'youtube', 'tiktok'];
      const publications = [];

      for (const platform of platforms) {
        const publicationKey = `publication:${clipId}:${platform}`;
        const publicationData = await redis.get(publicationKey);

        if (publicationData) {
          const publication = JSON.parse(publicationData);
          if (publication.userId === userId) {
            publications.push(publication);
          }
        }
      }

      return { publications };
    } catch (error: any) {
      logger.error({ error: error.message, clipId }, 'Failed to get publications');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve publications',
      });
    }
  });
}
