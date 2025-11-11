import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
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
  app.get('/auth/instagram/authorize', async (request, reply) => {
    const { userId } = request.query as { userId?: string };

    if (!userId) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'userId is required',
      });
    }

    // Generate state for CSRF protection
    const state = randomUUID();
    await redis.set(`instagram:state:${state}`, userId, 'EX', 600); // 10 minutes

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
        `http://localhost:8080/social-connected?platform=instagram&success=true`
      );
    } catch (error: any) {
      logger.error({ error: error.message }, 'Instagram OAuth callback failed');
      return reply.redirect(
        `http://localhost:8080/social-connected?platform=instagram&success=false&error=${encodeURIComponent(error.message)}`
      );
    }
  });

  /**
   * Get connected social accounts
   */
  app.get('/social/accounts/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };

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
  app.delete('/social/accounts/:userId/:platform', async (request, reply) => {
    const { userId, platform } = request.params as { userId: string; platform: string };

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
  app.post('/clips/:clipId/publish-instagram', async (request, reply) => {
    const { clipId } = request.params as { clipId: string };
    const { jobId, userId, metadata } = request.body as {
      jobId: string;
      userId: string;
      metadata?: PublishMetadata;
    };

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
   * Get publication history for a clip
   */
  app.get('/clips/:clipId/publications', async (request, reply) => {
    const { clipId } = request.params as { clipId: string };

    try {
      const platforms = ['instagram', 'youtube', 'tiktok'];
      const publications = [];

      for (const platform of platforms) {
        const publicationKey = `publication:${clipId}:${platform}`;
        const publicationData = await redis.get(publicationKey);

        if (publicationData) {
          publications.push(JSON.parse(publicationData));
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
