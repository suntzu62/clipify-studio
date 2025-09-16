import { useState, useEffect } from 'react';

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
}

export const useClipList = (jobResult?: any) => {
  const [clips, setClips] = useState<Clip[]>([]);
  const [estimatedClipCount, setEstimatedClipCount] = useState(8);

  useEffect(() => {
    console.log('🎬 useClipList - jobResult:', jobResult);
    
    if (!jobResult) {
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

    // Handle different data structures from API
    const texts = jobResult.texts || jobResult.result?.texts;
    const titles = texts?.titles || [];
    const descriptions = texts?.descriptions || [];
    const hashtags = texts?.hashtags || [];

    console.log('🎬 Extracted data:', { titles, descriptions, hashtags });

    if (titles.length > 0) {
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
      console.log('🎬 Processed clips:', processedClips);
      setClips(processedClips);
    } else {
      // Keep placeholder clips if no titles yet
      const placeholderClips = Array.from({ length: estimatedClipCount }, (_, index) => ({
        id: `clip-${index + 1}`,
        title: `Clipe ${index + 1}`,
        description: 'Processando...',
        hashtags: [],
        duration: 0,
        status: 'processing' as const
      }));
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
    setEstimatedClipCount
  };
};