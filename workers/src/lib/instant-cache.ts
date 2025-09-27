import { connection } from '../redis';
import { createHash } from 'crypto';
import { getOpenAI } from './openai';

export interface InstantClip {
  id: string;
  title: string;
  description: string;
  hashtags: string[];
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  thumbnailUrl?: string;
  previewUrl?: string;
}

export interface CachedVideoData {
  videoId: string;
  youtubeUrl: string;
  metadata: {
    title: string;
    duration: string;
    channelName: string;
    thumbnailUrl: string;
    description?: string;
  };
  clips: InstantClip[];
  embeddings: number[][];
  patterns: string[];
  timestamp: number;
  quality: 'high' | 'medium' | 'low';
}

export class InstantClipsCache {
  private static instance: InstantClipsCache;
  private cachePrefix = 'instant_clips:';
  private patternsPrefix = 'patterns:';
  private popularPrefix = 'popular:';

  static getInstance(): InstantClipsCache {
    if (!InstantClipsCache.instance) {
      InstantClipsCache.instance = new InstantClipsCache();
    }
    return InstantClipsCache.instance;
  }

  private getVideoId(url: string): string {
    const match = url.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/);
    return match ? match[1] : createHash('sha1').update(url).digest('hex').slice(0, 11);
  }

  private getCacheKey(videoId: string): string {
    return `${this.cachePrefix}${videoId}`;
  }

  private getPatternKey(pattern: string): string {
    return `${this.patternsPrefix}${createHash('sha1').update(pattern).digest('hex').slice(0, 8)}`;
  }

  // Get instant clips from cache (< 50ms)
  async getInstantClips(youtubeUrl: string): Promise<CachedVideoData | null> {
    try {
      const videoId = this.getVideoId(youtubeUrl);
      const cacheKey = this.getCacheKey(videoId);
      
      const cached = await connection.get(cacheKey);
      if (!cached) return null;

      const data = JSON.parse(cached) as CachedVideoData;
      
      // Check if cache is still fresh (24 hours for high quality, 6 hours for others)
      const maxAge = data.quality === 'high' ? 24 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
      if (Date.now() - data.timestamp > maxAge) {
        await connection.del(cacheKey);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[InstantCache] Error getting clips:', error);
      return null;
    }
  }

  // Store processed clips in cache
  async cacheVideoData(youtubeUrl: string, data: Omit<CachedVideoData, 'videoId' | 'timestamp'>): Promise<void> {
    try {
      const videoId = this.getVideoId(youtubeUrl);
      const cacheKey = this.getCacheKey(videoId);
      
      const cacheData: CachedVideoData = {
        ...data,
        videoId,
        timestamp: Date.now(),
      };

      // Store with TTL based on quality
      const ttl = data.quality === 'high' ? 7 * 24 * 60 * 60 : 24 * 60 * 60; // 7 days or 1 day
      await connection.setex(cacheKey, ttl, JSON.stringify(cacheData));

      // Store patterns for similarity matching
      for (const pattern of data.patterns) {
        const patternKey = this.getPatternKey(pattern);
        await connection.sadd(patternKey, videoId);
        await connection.expire(patternKey, ttl);
      }

      // Track popularity
      await this.trackPopularity(videoId);
    } catch (error) {
      console.error('[InstantCache] Error caching data:', error);
    }
  }

  // Find similar videos by patterns
  async findSimilarVideos(patterns: string[], limit = 5): Promise<string[]> {
    try {
      const videoIds = new Set<string>();
      
      for (const pattern of patterns.slice(0, 3)) { // Check top 3 patterns
        const patternKey = this.getPatternKey(pattern);
        const similar = await connection.smembers(patternKey);
        similar.forEach(id => videoIds.add(id));
        
        if (videoIds.size >= limit * 2) break; // Get enough candidates
      }

      return Array.from(videoIds).slice(0, limit);
    } catch (error) {
      console.error('[InstantCache] Error finding similar videos:', error);
      return [];
    }
  }

  // Generate instant clips from similar videos
  async generateFromSimilar(youtubeUrl: string, metadata: any): Promise<InstantClip[]> {
    try {
      const patterns = this.extractPatterns(metadata);
      const similarVideoIds = await this.findSimilarVideos(patterns);
      
      if (similarVideoIds.length === 0) return [];

      // Get clips from similar videos
      const allClips: InstantClip[] = [];
      for (const videoId of similarVideoIds) {
        const cached = await connection.get(this.getCacheKey(videoId));
        if (cached) {
          const data = JSON.parse(cached) as CachedVideoData;
          allClips.push(...data.clips.slice(0, 2)); // Get top 2 clips from each similar video
        }
      }

      // Adapt clips to new video (adjust titles, keep structure)
      return this.adaptClipsToVideo(allClips, metadata).slice(0, 3);
    } catch (error) {
      console.error('[InstantCache] Error generating from similar:', error);
      return [];
    }
  }

  // Extract patterns from video metadata
  private extractPatterns(metadata: any): string[] {
    const patterns = [];
    
    if (metadata.title) {
      // Extract key phrases
      const words = metadata.title.toLowerCase().split(/\s+/);
      const keyPhrases = [];
      
      for (let i = 0; i < words.length - 1; i++) {
        keyPhrases.push(`${words[i]} ${words[i + 1]}`);
      }
      
      patterns.push(...keyPhrases.slice(0, 3));
    }

    if (metadata.channelName) {
      patterns.push(`channel:${metadata.channelName.toLowerCase()}`);
    }

    if (metadata.description) {
      const tags = metadata.description.match(/#\w+/g) || [];
      patterns.push(...tags.slice(0, 2));
    }

    return patterns.filter(p => p.length > 3).slice(0, 5);
  }

  // Adapt clips from similar videos to new video
  private adaptClipsToVideo(clips: InstantClip[], metadata: any): InstantClip[] {
    return clips.map((clip, index) => ({
      ...clip,
      id: `instant_${index}`,
      title: this.adaptTitle(clip.title, metadata.title),
      // Keep original timing and structure, just adapt text
    }));
  }

  private adaptTitle(originalTitle: string, newVideoTitle: string): string {
    // Simple adaptation: keep structure, blend with new video context
    const structure = originalTitle.replace(/[A-Z][a-z]+/g, '___');
    const newWords = newVideoTitle.split(' ').filter(w => w.length > 3);
    
    if (newWords.length > 0) {
      const randomWord = newWords[Math.floor(Math.random() * newWords.length)];
      return originalTitle.replace(/^[A-Z][a-z]+/, randomWord);
    }
    
    return originalTitle;
  }

  // Track video popularity for pre-processing priority
  private async trackPopularity(videoId: string): Promise<void> {
    const popularKey = `${this.popularPrefix}${videoId}`;
    await connection.incr(popularKey);
    await connection.expire(popularKey, 7 * 24 * 60 * 60); // 7 days
  }

  // Get popular videos for pre-processing
  async getPopularVideos(limit = 10): Promise<string[]> {
    try {
      const keys = await connection.keys(`${this.popularPrefix}*`);
      const scores = await Promise.all(
        keys.map(async key => ({
          videoId: key.replace(this.popularPrefix, ''),
          score: await connection.get(key).then(s => parseInt(s || '0')),
        }))
      );
      
      return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.videoId);
    } catch (error) {
      console.error('[InstantCache] Error getting popular videos:', error);
      return [];
    }
  }

  // Generate generic template clips for unknown videos
  async generateGenericClips(metadata: any): Promise<InstantClip[]> {
    const templates = [
      {
        title: `🔥 Melhor Momento de \"${metadata.title?.slice(0, 20)}...\"`,
        description: 'O momento mais impactante do vídeo que todos estão comentando!',
        hashtags: ['#viral', '#trending', '#imperdivel'],
        startTime: 60, // Assume good content after intro
        duration: 45,
        score: 0.8,
      },
      {
        title: `💡 Insight Incrível: ${metadata.title?.slice(0, 25)}`,
        description: 'A parte que vai mudar a sua perspectiva sobre o assunto!',
        hashtags: ['#insight', '#mindset', '#aprenda'],
        startTime: 180, // Middle section usually has key insights
        duration: 55,
        score: 0.75,
      },
      {
        title: `⚡ Resumo Rápido: ${metadata.channelName}`,
        description: 'Os pontos principais em menos de 1 minuto!',
        hashtags: ['#resumo', '#rapido', '#essencial'],
        startTime: 120,
        duration: 50,
        score: 0.7,
      },
    ];

    return templates.map((template, index) => ({
      id: `generic_${index}`,
      ...template,
      endTime: template.startTime + template.duration,
    }));
  }
}

export const instantCache = InstantClipsCache.getInstance();
