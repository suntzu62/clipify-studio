/**
 * Base interface for all social media platforms
 * Provides a unified API for authentication, publishing, and management
 */

export interface SocialPlatformConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface SocialAccountCredentials {
  userId: string;
  platform: SocialPlatformType;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  accountId?: string;
  accountName?: string;
  metadata?: Record<string, any>;
}

export type SocialPlatformType = 'youtube' | 'tiktok' | 'instagram';

export interface PublishMetadata {
  title: string;
  description: string;
  hashtags?: string[];
  visibility?: 'public' | 'private' | 'unlisted';
  location?: string;
  coverImage?: string;
}

export interface PublishResult {
  success: boolean;
  platformId?: string;
  url?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PublishStatus {
  platformId: string;
  status: 'processing' | 'published' | 'failed';
  url?: string;
  error?: string;
  publishedAt?: Date;
}

/**
 * Abstract base class for social media platform integrations
 */
export abstract class SocialPlatform {
  protected config: SocialPlatformConfig;
  protected credentials?: SocialAccountCredentials;

  constructor(config: SocialPlatformConfig) {
    this.config = config;
  }

  /**
   * Get platform name
   */
  abstract getPlatformName(): SocialPlatformType;

  /**
   * Get OAuth authorization URL
   */
  abstract getAuthorizationUrl(state: string): string;

  /**
   * Exchange authorization code for access token
   */
  abstract exchangeCodeForToken(code: string): Promise<SocialAccountCredentials>;

  /**
   * Refresh access token
   */
  abstract refreshAccessToken(refreshToken: string): Promise<SocialAccountCredentials>;

  /**
   * Set credentials for authenticated requests
   */
  setCredentials(credentials: SocialAccountCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Check if credentials are valid and not expired
   */
  isAuthenticated(): boolean {
    if (!this.credentials) return false;
    if (!this.credentials.expiresAt) return true;
    return new Date() < this.credentials.expiresAt;
  }

  /**
   * Upload video and publish to platform
   */
  abstract uploadVideo(
    videoPath: string,
    metadata: PublishMetadata
  ): Promise<PublishResult>;

  /**
   * Get publication status
   */
  abstract getPublishStatus(platformId: string): Promise<PublishStatus>;

  /**
   * Validate video before upload
   */
  validateVideo(videoPath: string): Promise<{ valid: boolean; error?: string }> {
    // Default implementation - can be overridden
    return Promise.resolve({ valid: true });
  }

  /**
   * Get platform-specific limits
   */
  abstract getLimits(): {
    maxDuration: number; // seconds
    maxFileSize: number; // bytes
    allowedFormats: string[];
    maxTitleLength: number;
    maxDescriptionLength: number;
    maxHashtags: number;
  };
}
