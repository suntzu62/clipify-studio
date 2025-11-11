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
import FormData from 'form-data';
import { createReadStream, statSync } from 'fs';

const logger = createLogger('instagram-platform');

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

      const tokenData = await tokenResponse.json();
      const shortLivedToken = tokenData.access_token;

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

      const longLivedData = await longLivedResponse.json();

      // Step 3: Get Instagram Business Account ID
      const meResponse = await fetch(
        `${this.baseUrl}/me?fields=id,name&access_token=${longLivedData.access_token}`
      );

      const meData = await meResponse.json();

      // Calculate expiration (long-lived tokens last 60 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      return {
        userId: meData.id,
        platform: 'instagram',
        accessToken: longLivedData.access_token,
        refreshToken: undefined, // Instagram doesn't use refresh tokens
        expiresAt,
        accountId: meData.id,
        accountName: meData.name,
        metadata: {
          tokenType: longLivedData.token_type,
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

      const data = await response.json();

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      return {
        userId: this.credentials?.userId || '',
        platform: 'instagram',
        accessToken: data.access_token,
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

      logger.info({ publishResult }, 'Instagram Reel published successfully');

      return {
        success: true,
        platformId: publishResult.id,
        url: `https://www.instagram.com/reel/${publishResult.id}/`,
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

    const data = await response.json();
    return data.id;
  }

  /**
   * Publish media container
   */
  private async publishMediaContainer(containerId: string): Promise<any> {
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

    return response.json();
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

      const data = await response.json();

      return {
        platformId: data.id,
        status: 'published',
        url: data.permalink,
        publishedAt: new Date(data.timestamp),
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
