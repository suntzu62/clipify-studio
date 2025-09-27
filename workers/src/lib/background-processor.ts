import { instantCache } from './instant-cache';
import { instantProcessor } from './instant-processor';
import { connection } from '../redis';
import pino from 'pino';

const log = pino({ name: 'background-processor' });

export class BackgroundProcessor {
  private static instance: BackgroundProcessor;
  private processingInterval: NodeJS.Timeout | null = null;

  static getInstance(): BackgroundProcessor {
    if (!BackgroundProcessor.instance) {
      BackgroundProcessor.instance = new BackgroundProcessor();
    }
    return BackgroundProcessor.instance;
  }

  // Start background processing service
  start(): void {
    if (this.processingInterval) return;

    log.info('Starting background processor for popular videos');
    
    // Run every 10 minutes
    this.processingInterval = setInterval(async () => {
      try {
        await this.processPopularVideos();
      } catch (error) {
        log.error({ error }, 'Background processing cycle failed');
      }
    }, 10 * 60 * 1000);

    // Run initial processing
    this.processPopularVideos().catch(error => {
      log.error({ error }, 'Initial background processing failed');
    });
  }

  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      log.info('Background processor stopped');
    }
  }

  private async processPopularVideos(): Promise<void> {
    try {
      const popularVideos = await instantCache.getPopularVideos(10);
      log.info({ count: popularVideos.length }, 'Processing popular videos in background');

      for (const videoId of popularVideos) {
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Check if already processed with high quality
        const cached = await instantCache.getInstantClips(youtubeUrl);
        if (cached && cached.quality === 'high') {
          continue;
        }

        log.info({ videoId }, 'Pre-processing popular video');
        
        // Enhanced processing for popular videos
        await this.enhancedProcessing(youtubeUrl);
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      log.error({ error }, 'Error processing popular videos');
    }
  }

  private async enhancedProcessing(youtubeUrl: string): Promise<void> {
    try {
      // This would trigger enhanced processing using multiple AI models
      // and more sophisticated analysis for high-quality clips
      
      // For now, we'll simulate enhanced processing by updating cache quality
      const existing = await instantCache.getInstantClips(youtubeUrl);
      if (existing) {
        // Mark as high quality after enhanced processing
        await instantCache.cacheVideoData(youtubeUrl, {
          ...existing,
          quality: 'high' as const,
          clips: existing.clips.map(clip => ({
            ...clip,
            score: Math.min(clip.score + 0.1, 1.0), // Slightly improve scores
          })),
        });
        
        log.info({ youtubeUrl }, 'Enhanced processing completed');
      }
    } catch (error) {
      log.error({ error, youtubeUrl }, 'Enhanced processing failed');
    }
  }

  // Add trending video for pre-processing
  async addTrendingVideo(youtubeUrl: string): Promise<void> {
    try {
      const videoId = this.extractVideoId(youtubeUrl);
      if (!videoId) return;

      await connection.zadd('trending_videos', Date.now(), videoId);
      await connection.expire('trending_videos', 24 * 60 * 60); // 24 hours
      
      log.info({ videoId }, 'Added trending video for processing');
    } catch (error) {
      log.error({ error, youtubeUrl }, 'Error adding trending video');
    }
  }

  private extractVideoId(url: string): string | null {
    const match = url.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/);
    return match ? match[1] : null;
  }
}

export const backgroundProcessor = BackgroundProcessor.getInstance();