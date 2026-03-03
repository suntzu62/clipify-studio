import { createLogger } from '../../config/logger.js';
import {
  SocialPlatform,
  SocialPlatformConfig,
  SocialAccountCredentials,
  PublishMetadata,
  PublishResult,
  PublishStatus,
  SocialPlatformType,
} from './base-platform.js';
import { statSync } from 'fs';

const logger = createLogger('instagram-platform');

function parseJsonObject(payload: unknown, context: string): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`Invalid ${context} payload`);
  }
  return payload as Record<string, unknown>;
}

function readStringField(payload: Record<string, unknown>, field: string, context: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing ${field} in ${context} payload`);
  }
  return value;
}

/**
 * Instagram Graph API Integration
 * Docs: https://developers.facebook.com/docs/instagram-api/guides/reels-publishing
 */
export class InstagramPlatform extends SocialPlatform {
  private readonly baseUrl = 'https://graph.facebook.com/v18.0';
  private readonly authUrl = 'https://www.facebook.com/v18.0/dialog/oauth';

  constructor(config: SocialPlatformConfig) {
    super(config);
  }

  getPlatformName(): SocialPlatformType {
    return 'instagram';
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(','),
      response_type: 'code',
      state,
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<SocialAccountCredentials> {
    try {
      // Step 1: Exchange code for short-lived token
      const tokenResponse = await fetch(
        `${this.baseUrl}/oauth/access_token?` +
          new URLSearchParams({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            redirect_uri: this.config.redirectUri,
            code,
          }),
        { method: 'POST' }
      );

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for token');
      }

      const tokenData = parseJsonObject(await tokenResponse.json(), 'token');
      const shortLivedToken = readStringField(tokenData, 'access_token', 'token');

      // Step 2: Exchange short-lived token for long-lived token
      const longLivedResponse = await fetch(
        `${this.baseUrl}/oauth/access_token?` +
          new URLSearchParams({
            grant_type: 'fb_exchange_token',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            fb_exchange_token: shortLivedToken,
          })
      );

      if (!longLivedResponse.ok) {
        throw new Error('Failed to get long-lived token');
      }

      const longLivedData = parseJsonObject(await longLivedResponse.json(), 'long-lived token');
      const longLivedToken = readStringField(longLivedData, 'access_token', 'long-lived token');

      // Step 3: Get Instagram Business Account ID
      const meResponse = await fetch(
        `${this.baseUrl}/me?fields=id,name&access_token=${longLivedToken}`
      );

      const meData = parseJsonObject(await meResponse.json(), 'instagram me');
      const accountId = readStringField(meData, 'id', 'instagram me');
      const accountName = typeof meData.name === 'string' ? meData.name : 'Instagram';

      // Calculate expiration (long-lived tokens last 60 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      return {
        userId: accountId,
        platform: 'instagram',
        accessToken: longLivedToken,
        refreshToken: undefined, // Instagram doesn't use refresh tokens
        expiresAt,
        accountId,
        accountName,
        metadata: {
          tokenType: typeof longLivedData.token_type === 'string' ? longLivedData.token_type : undefined,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to exchange code for token');
      throw error;
    }
  }

  /**
   * Refresh access token (Instagram uses token exchange instead)
   */
  async refreshAccessToken(currentToken: string): Promise<SocialAccountCredentials> {
    try {
      // Instagram uses token refresh endpoint
      const response = await fetch(
        `${this.baseUrl}/oauth/access_token?` +
          new URLSearchParams({
            grant_type: 'ig_refresh_token',
            access_token: currentToken,
          })
      );

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const data = parseJsonObject(await response.json(), 'refresh token');
      const accessToken = readStringField(data, 'access_token', 'refresh token');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      return {
        userId: this.credentials?.userId || '',
        platform: 'instagram',
        accessToken,
        expiresAt,
        accountId: this.credentials?.accountId,
        accountName: this.credentials?.accountName,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to refresh token');
      throw error;
    }
  }

  /**
   * Upload video and publish as Instagram Reel
   */
  async uploadVideo(
    videoPath: string,
    metadata: PublishMetadata
  ): Promise<PublishResult> {
    if (!this.isAuthenticated()) {
      return {
        success: false,
        error: 'Not authenticated. Please connect your Instagram account.',
      };
    }

    try {
      logger.info({ videoPath, metadata }, 'Starting Instagram Reel upload');

      // Step 1: Create Media Container
      const containerId = await this.createMediaContainer(videoPath, metadata);

      // Step 2: Publish the container
      const publishResult = await this.publishMediaContainer(containerId);
      const publishedId = readStringField(publishResult, 'id', 'media publish');

      logger.info({ publishResult }, 'Instagram Reel published successfully');

      return {
        success: true,
        platformId: publishedId,
        url: `https://www.instagram.com/reel/${publishedId}/`,
        metadata: {
          containerId,
          ...publishResult,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message, videoPath }, 'Failed to upload to Instagram');
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create media container for Reel
   */
  private async createMediaContainer(
    videoPath: string,
    metadata: PublishMetadata
  ): Promise<string> {
    // Build caption with hashtags
    let caption = metadata.description;
    if (metadata.hashtags && metadata.hashtags.length > 0) {
      caption += '\n\n' + metadata.hashtags.map((tag) => `#${tag}`).join(' ');
    }

    // For Reels, we need to upload to a URL accessible by Instagram
    // In production, you'd upload to your own CDN/S3 and provide the URL
    // For now, we'll use the local file (THIS NEEDS TO BE REPLACED)

    const params = new URLSearchParams({
      media_type: 'REELS',
      video_url: videoPath, // THIS SHOULD BE A PUBLIC URL!
      caption: caption.substring(0, 2200), // Instagram limit
      share_to_feed: 'true',
      access_token: this.credentials!.accessToken,
    });

    if (metadata.location) {
      params.append('location_id', metadata.location);
    }

    const response = await fetch(
      `${this.baseUrl}/${this.credentials!.accountId}/media?${params.toString()}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create media container: ${JSON.stringify(error)}`);
    }

    const data = parseJsonObject(await response.json(), 'media container');
    return readStringField(data, 'id', 'media container');
  }

  /**
   * Publish media container
   */
  private async publishMediaContainer(containerId: string): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({
      creation_id: containerId,
      access_token: this.credentials!.accessToken,
    });

    const response = await fetch(
      `${this.baseUrl}/${this.credentials!.accountId}/media_publish?${params.toString()}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to publish media: ${JSON.stringify(error)}`);
    }

    return parseJsonObject(await response.json(), 'media publish');
  }

  /**
   * Get publication status
   */
  async getPublishStatus(platformId: string): Promise<PublishStatus> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/${platformId}?fields=id,media_type,media_url,permalink,timestamp&access_token=${this.credentials!.accessToken}`
      );

      if (!response.ok) {
        throw new Error('Failed to get media status');
      }

      const data = parseJsonObject(await response.json(), 'publish status');
      const platformIdFromApi = readStringField(data, 'id', 'publish status');
      const permalink = typeof data.permalink === 'string' ? data.permalink : undefined;
      const timestamp = typeof data.timestamp === 'string' ? data.timestamp : new Date().toISOString();

      return {
        platformId: platformIdFromApi,
        status: 'published',
        url: permalink,
        publishedAt: new Date(timestamp),
      };
    } catch (error: any) {
      logger.error({ error: error.message, platformId }, 'Failed to get publish status');
      return {
        platformId,
        status: 'failed',
        error: error.message,
      };
    }
  }

  /**
   * Get Instagram Reels limits
   */
  getLimits() {
    return {
      maxDuration: 90, // 90 seconds for Reels
      maxFileSize: 1024 * 1024 * 1024, // 1GB
      allowedFormats: ['mp4', 'mov'],
      maxTitleLength: 0, // No title for Reels
      maxDescriptionLength: 2200, // Caption limit
      maxHashtags: 30,
    };
  }

  /**
   * Validate video for Instagram Reels
   */
  async validateVideo(videoPath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const stats = statSync(videoPath);
      const limits = this.getLimits();

      if (stats.size > limits.maxFileSize) {
        return {
          valid: false,
          error: `File size exceeds limit (${limits.maxFileSize / (1024 * 1024)}MB)`,
        };
      }

      // Additional validation can be added here (duration, format, etc.)

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }
}
