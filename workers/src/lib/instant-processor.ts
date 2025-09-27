import { getOpenAI } from './openai';
import { instantCache, InstantClip, CachedVideoData } from './instant-cache';
import pino from 'pino';

const log = pino({ name: 'instant-processor' });

export interface InstantResponse {
  success: true;
  clips: InstantClip[];
  source: 'cache' | 'similar' | 'generic' | 'partial';
  processingTime: number;
  backgroundJobId?: string;
}

export interface YouTubeMetadata {
  title: string;
  duration: string;
  channelName: string;
  thumbnailUrl: string;
  description?: string;
  viewCount?: number;
}

export class InstantProcessor {
  private static instance: InstantProcessor;

  static getInstance(): InstantProcessor {
    if (!InstantProcessor.instance) {
      InstantProcessor.instance = new InstantProcessor();
    }
    return InstantProcessor.instance;
  }

  // Main instant processing function - designed for < 2 second response
  async processInstantly(youtubeUrl: string): Promise<InstantResponse> {
    const startTime = Date.now();
    
    try {
      // Step 1: Check direct cache (< 50ms)
      const cached = await instantCache.getInstantClips(youtubeUrl);
      if (cached) {
        log.info({ youtubeUrl, source: 'cache' }, 'Instant clips served from cache');
        return {
          success: true,
          clips: cached.clips,
          source: 'cache',
          processingTime: Date.now() - startTime,
        };
      }

      // Step 2: Get basic metadata (< 300ms)
      const metadata = await this.getYouTubeMetadata(youtubeUrl);
      if (!metadata) {
        throw new Error('Failed to get video metadata');
      }

      // Step 3: Try similar videos (< 800ms)
      const similarClips = await instantCache.generateFromSimilar(youtubeUrl, metadata);
      if (similarClips.length > 0) {
        log.info({ youtubeUrl, source: 'similar' }, 'Instant clips generated from similar videos');
        
        // Start background processing for better results
        this.startBackgroundProcessing(youtubeUrl, metadata);
        
        return {
          success: true,
          clips: similarClips,
          source: 'similar',
          processingTime: Date.now() - startTime,
        };
      }

      // Step 4: Generate generic templates (< 100ms)
      const genericClips = await instantCache.generateGenericClips(metadata);
      log.info({ youtubeUrl, source: 'generic' }, 'Instant clips generated from templates');
      
      // Start background processing for better results
      this.startBackgroundProcessing(youtubeUrl, metadata);
      
      return {
        success: true,
        clips: genericClips,
        source: 'generic',
        processingTime: Date.now() - startTime,
      };
      
    } catch (error) {
      log.error({ error, youtubeUrl }, 'Error in instant processing');
      
      // Fallback to basic generic clips
      const fallbackClips = await this.generateFallbackClips(youtubeUrl);
      
      return {
        success: true,
        clips: fallbackClips,
        source: 'generic',
        processingTime: Date.now() - startTime,
      };
    }
  }

  // Get YouTube metadata quickly using oEmbed API
  private async getYouTubeMetadata(url: string): Promise<YouTubeMetadata | null> {
    try {
      const videoId = this.extractVideoId(url);
      if (!videoId) return null;

      // Use oEmbed for fast metadata
      const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (!response.ok) return null;

      const data = await response.json();
      
      return {
        title: data.title || 'Unknown Video',
        duration: '00:00', // oEmbed doesn't provide duration, we'll estimate
        channelName: data.author_name || 'Unknown Channel',
        thumbnailUrl: data.thumbnail_url || '',
        description: data.title, // Use title as description fallback
      };
    } catch (error) {
      log.error({ error, url }, 'Error getting YouTube metadata');
      return null;
    }
  }

  private extractVideoId(url: string): string | null {
    const match = url.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  // Generate very basic fallback clips
  private async generateFallbackClips(youtubeUrl: string): Promise<InstantClip[]> {
    return [
      {
        id: 'fallback_1',
        title: '🔥 Momento Destaque',
        description: 'O momento mais importante do vídeo!',
        hashtags: ['#destaque', '#viral', '#imperdivel'],
        startTime: 60,
        endTime: 105,
        duration: 45,
        score: 0.7,
      },
      {
        id: 'fallback_2',  
        title: '💡 Insight Principal',
        description: 'A parte que você não pode perder!',
        hashtags: ['#insight', '#dica', '#aprenda'],
        startTime: 180,
        endTime: 235,
        duration: 55,
        score: 0.65,
      },
      {
        id: 'fallback_3',
        title: '⚡ Resumo Essencial',
        description: 'Os pontos principais em 50 segundos!',
        hashtags: ['#resumo', '#essencial', '#rapido'],
        startTime: 300,
        endTime: 350,
        duration: 50,
        score: 0.6,
      },
    ];
  }

  // Start background processing for better results (non-blocking)
  private startBackgroundProcessing(youtubeUrl: string, metadata: YouTubeMetadata): void {
    // Don't await - this runs in background
    this.processInBackground(youtubeUrl, metadata).catch(error => {
      log.error({ error, youtubeUrl }, 'Background processing failed');
    });
  }

  private async processInBackground(youtubeUrl: string, metadata: YouTubeMetadata): Promise<void> {
    try {
      log.info({ youtubeUrl }, 'Starting background processing for better results');
      
      // Use AI to generate better clips based on metadata
      const enhancedClips = await this.generateAIClips(youtubeUrl, metadata);
      
      if (enhancedClips.length > 0) {
        // Cache the improved results
        await instantCache.cacheVideoData(youtubeUrl, {
          youtubeUrl,
          metadata,
          clips: enhancedClips,
          embeddings: [], // Will be filled by full processing
          patterns: this.extractPatternsFromMetadata(metadata),
          quality: 'medium' as const,
        });
        
        log.info({ youtubeUrl, clipCount: enhancedClips.length }, 'Background AI processing completed');
      }
      
    } catch (error) {
      log.error({ error, youtubeUrl }, 'Background processing error');
    }
  }

  // Use AI to generate better clips based on metadata
  private async generateAIClips(youtubeUrl: string, metadata: YouTubeMetadata): Promise<InstantClip[]> {
    try {
      const openai = getOpenAI();
      
      const prompt = `Based on this YouTube video metadata, generate 3 potential viral clips:
      
Title: ${metadata.title}
Channel: ${metadata.channelName}
Description: ${metadata.description || 'Not available'}

For each clip, provide:
1. A catchy title with emojis
2. A compelling description
3. 3 relevant hashtags
4. Estimated start time (in seconds)
5. Duration (30-60 seconds)
6. A score (0-1) for viral potential

Focus on moments that would be most engaging on social media.
Format as JSON array with fields: title, description, hashtags, startTime, duration, score`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      // Try to parse AI response
      const clipsData = JSON.parse(content);
      if (!Array.isArray(clipsData)) return [];

      return clipsData.map((clip: any, index: number) => ({
        id: `ai_${index}`,
        title: clip.title || `Clip ${index + 1}`,
        description: clip.description || 'Momento interessante do vídeo',
        hashtags: Array.isArray(clip.hashtags) ? clip.hashtags.slice(0, 3) : ['#viral'],
        startTime: Number(clip.startTime) || (60 + index * 60),
        endTime: Number(clip.startTime) + Number(clip.duration) || (60 + index * 60 + 45),
        duration: Number(clip.duration) || 45,
        score: Number(clip.score) || 0.7,
      })).slice(0, 3);
      
    } catch (error) {
      log.error({ error }, 'Error generating AI clips');
      return [];
    }
  }

  private extractPatternsFromMetadata(metadata: YouTubeMetadata): string[] {
    const patterns = [];
    
    if (metadata.title) {
      const words = metadata.title.toLowerCase().split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        patterns.push(`${words[i]} ${words[i + 1]}`);
      }
    }

    patterns.push(`channel:${metadata.channelName.toLowerCase()}`);
    
    return patterns.filter(p => p.length > 3).slice(0, 5);
  }

  // Pre-process popular videos (called by background job)
  async preProcessPopularVideos(): Promise<void> {
    try {
      const popularVideos = await instantCache.getPopularVideos(20);
      log.info({ count: popularVideos.length }, 'Pre-processing popular videos');
      
      for (const videoId of popularVideos) {
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Check if already cached with high quality
        const cached = await instantCache.getInstantClips(youtubeUrl);
        if (cached && cached.quality === 'high') continue;
        
        // Process with full pipeline (non-blocking)
        this.triggerFullProcessing(youtubeUrl).catch(error => {
          log.error({ error, videoId }, 'Pre-processing failed for popular video');
        });
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      log.error({ error }, 'Error pre-processing popular videos');
    }
  }

  private async triggerFullProcessing(youtubeUrl: string): Promise<void> {
    // This would trigger the full pipeline for high-quality processing
    // Implementation depends on your pipeline setup
    log.info({ youtubeUrl }, 'Triggering full pipeline for high-quality processing');
  }
}

export const instantProcessor = InstantProcessor.getInstance();