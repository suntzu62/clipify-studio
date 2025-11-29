import { useState, useEffect } from 'react';
import { log } from '@/lib/logger';
import type { SubtitlePreferences } from '@/components/clips/SubtitleCustomizer';
import type { ViralIntelligence } from '@/types/viral-intelligence';
import { generateViralIntelligence } from '@/types/viral-intelligence';

export interface Clip {
  id: string;
  title: string;
  description: string;
  hashtags: string[];
  previewUrl?: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  duration: number;
  status: 'processing' | 'ready' | 'failed';
  transcript?: Array<{ start: number; end: number; text: string }>;
  subtitleSettings?: SubtitlePreferences;
  viralIntel?: ViralIntelligence;
}

export const useClipList = (jobResult?: any) => {
  const [clips, setClips] = useState<Clip[]>([]);
  const [estimatedClipCount, setEstimatedClipCount] = useState(8);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    // Advanced debugging
    log.info('[useClipList] Processing jobResult', { 
      hasJobResult: !!jobResult, 
      jobResultKeys: jobResult ? Object.keys(jobResult) : [],
      jobResultType: typeof jobResult,
      jobStatus: jobResult?.status,
      resultKeys: jobResult?.result ? Object.keys(jobResult.result) : [],
      rawJobResult: JSON.stringify(jobResult, null, 2)
    });

    // Store debug info
    setDebugInfo({
      raw: jobResult,
      timestamp: new Date().toISOString(),
      processed: false
    });

    // Extract result from jobResult (support multiple formats)
    const result = jobResult?.result ?? jobResult ?? {};
    
    if (!jobResult) {
      log.info('[useClipList] No jobResult, creating placeholders', { estimatedClipCount });
      // Create placeholder clips while processing
      const placeholderClips = Array.from({ length: estimatedClipCount }, (_, index) => ({
        id: `clip-${index + 1}`,
        title: `Clipe ${index + 1}`,
        description: 'Processando...',
        hashtags: [],
        duration: 0,
        status: 'processing' as const
      }));
      setClips(placeholderClips);
      return;
    }

    // Strategy 1: Check for ready clips first (from enhanced job-status response)
    if (result.clips && Array.isArray(result.clips) && result.clips.length > 0) {
      log.info('[useClipList] ✅ Found clips in result.clips', {
        clipCount: result.clips.length,
        sampleClip: result.clips[0] ? {
          id: result.clips[0].id,
          title: result.clips[0].title,
          hasPreviewUrl: !!result.clips[0].previewUrl,
          hasDownloadUrl: !!result.clips[0].downloadUrl
        } : null
      });
      const validClips = result.clips.map((clip: any, index: number): Clip => {
        const clipData: Clip = {
          id: clip.id || `clip-${index + 1}`,
          title: clip.title || `Clipe ${index + 1}`,
          description: clip.description || 'Descrição gerada automaticamente',
          hashtags: Array.isArray(clip.hashtags) ? clip.hashtags : [],
          previewUrl: clip.previewUrl || clip.downloadUrl,
          downloadUrl: clip.downloadUrl || clip.previewUrl,
          thumbnailUrl: clip.thumbnailUrl,
          duration: clip.duration || 45,
          status: clip.status || 'ready',
          transcript: clip.transcript
        };

        // Gerar Inteligência Viral para clipes prontos
        if (clipData.status === 'ready') {
          clipData.viralIntel = generateViralIntelligence(clipData);
        }

        return clipData;
      });

      // Adicionar ranking baseado no score viral
      const clipsWithRanking = validClips
        .map((clip, idx) => ({ ...clip, originalIndex: idx }))
        .sort((a, b) => (b.viralIntel?.overallScore || 0) - (a.viralIntel?.overallScore || 0))
        .map((clip, idx) => {
          if (clip.viralIntel) {
            clip.viralIntel.ranking = {
              position: idx + 1,
              total: validClips.length,
              percentile: Math.round((1 - idx / validClips.length) * 100)
            };
          }
          return clip;
        })
        .sort((a, b) => a.originalIndex - b.originalIndex); // Manter ordem original

      setDebugInfo((prev: any) => ({ ...prev, processed: true, strategy: 'clips_array', foundClips: clipsWithRanking.length }));
      setClips(clipsWithRanking);
      log.info('[useClipList] ✅ Successfully set clips from result.clips', { count: clipsWithRanking.length });
      return;
    }

    // Strategy 2: Check for clips directly in jobResult
    if (jobResult.clips && Array.isArray(jobResult.clips) && jobResult.clips.length > 0) {
      log.info('[useClipList] Found clips in jobResult.clips', { clipCount: jobResult.clips.length });
      const validClips = jobResult.clips.map((clip: any, index: number) => ({
        id: clip.id || `clip-${index + 1}`,
        title: clip.title || `Clipe ${index + 1}`,
        description: clip.description || 'Descrição gerada automaticamente',
        hashtags: Array.isArray(clip.hashtags) ? clip.hashtags : [],
        previewUrl: clip.previewUrl || clip.downloadUrl,
        downloadUrl: clip.downloadUrl || clip.previewUrl,
        thumbnailUrl: clip.thumbnailUrl,
        duration: clip.duration || 45,
        status: clip.status || 'ready'
      }));
      setDebugInfo(prev => ({ ...prev, processed: true, strategy: 'direct_clips', foundClips: validClips.length }));
      setClips(validClips);
      return;
    }

    // Strategy 3: Fallback to extracting from texts (legacy support)
    const texts = result.texts || jobResult.texts || {};
    const titles = Array.isArray(texts?.titles) ? texts.titles : [];
    const descriptions = Array.isArray(texts?.descriptions) ? texts.descriptions : [];
    const hashtags = Array.isArray(texts?.hashtags) ? texts.hashtags : [];

    log.info('[useClipList] Checking texts fallback', { 
      hasTexts: !!texts,
      titlesCount: titles.length,
      descriptionsCount: descriptions.length,
      hashtagsCount: hashtags.length
    });

    if (titles.length > 0 && jobResult?.status === 'completed') {
      log.info('[useClipList] Creating clips from texts', { titleCount: titles.length });
      const processedClips = titles.map((title: string, index: number) => ({
        id: `clip-${index + 1}`,
        title,
        description: descriptions[index] || 'Descrição gerada automaticamente',
        hashtags: hashtags.slice(index * 3, (index + 1) * 3), // 3 hashtags per clip
        previewUrl: jobResult.previewUrl || jobResult.result?.previewUrl,
        downloadUrl: jobResult.downloadUrl || jobResult.result?.downloadUrl,
        thumbnailUrl: jobResult.thumbnailUrl || jobResult.result?.thumbnailUrl,
        duration: 45, // Default duration
        status: 'ready' as const
      }));
      setDebugInfo(prev => ({ ...prev, processed: true, strategy: 'texts_fallback', foundClips: processedClips.length }));
      setClips(processedClips);
      return;
    }

    // Strategy 4: Check if job is completed but has no clips
    if (jobResult?.status === 'completed') {
      log.warn('[useClipList] Job completed but no clips found', { jobResult });
      setDebugInfo(prev => ({ ...prev, processed: true, strategy: 'completed_no_clips', foundClips: 0 }));
      setClips([]);
      return;
    }

    // Strategy 4.5: Handle failed jobs - don't create placeholders for failed jobs
    if (jobResult?.status === 'failed') {
      log.error('[useClipList] Job failed, not creating clips', { 
        jobId: jobResult?.id,
        error: jobResult?.error,
        status: jobResult?.status 
      });
      setDebugInfo(prev => ({ ...prev, processed: true, strategy: 'failed_job', foundClips: 0 }));
      // Create failed clips to show error state
      const failedClips = Array.from({ length: 1 }, (_, index) => ({
        id: `failed-clip-${index + 1}`,
        title: 'Falha no processamento',
        description: jobResult?.error || 'Erro ao processar o vídeo. Tente novamente.',
        hashtags: [],
        duration: 0,
        status: 'failed' as const
      }));
      setClips(failedClips);
      return;
    }

    // Strategy 5: Default to placeholder clips for processing jobs only
    if (jobResult?.status && !['completed', 'failed'].includes(jobResult.status)) {
      log.info('[useClipList] Creating placeholder clips for processing job', { 
        status: jobResult?.status,
        estimatedClipCount 
      });
      const placeholderClips = Array.from({ length: estimatedClipCount }, (_, index) => ({
        id: `clip-${index + 1}`,
        title: `Clipe ${index + 1}`,
        description: 'Processando...',
        hashtags: [],
        duration: 0,
        status: 'processing' as const
      }));
      setDebugInfo(prev => ({ ...prev, processed: true, strategy: 'placeholders', foundClips: placeholderClips.length }));
      setClips(placeholderClips);
    }
  }, [jobResult, estimatedClipCount]);

  const readyClips = clips.filter(c => c.status === 'ready');
  const processingClips = clips.filter(c => c.status === 'processing');

  return {
    clips,
    readyClips,
    processingClips,
    totalClips: clips.length,
    readyCount: readyClips.length,
    debugInfo,
    setEstimatedClipCount
  };
};