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

    // Process actual results when available
    const titles = jobResult.texts?.titles || [];
    const descriptions = jobResult.texts?.descriptions || [];
    const hashtags = jobResult.texts?.hashtags || [];

    const processedClips = titles.map((title: string, index: number) => ({
      id: `clip-${index + 1}`,
      title,
      description: descriptions[index] || 'Descrição gerada automaticamente',
      hashtags: hashtags.slice(index * 3, (index + 1) * 3), // 3 hashtags per clip
      previewUrl: jobResult.previewUrl,
      downloadUrl: jobResult.downloadUrl,
      thumbnailUrl: jobResult.thumbnailUrl,
      duration: 45, // Default duration
      status: 'ready' as const
    }));

    setClips(processedClips);
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