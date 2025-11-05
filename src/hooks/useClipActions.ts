import { useState } from 'react';
import { useToast } from './use-toast';

export type SocialPlatform = 'youtube' | 'tiktok' | 'instagram';
export type ClipStatus = 'processing' | 'ready' | 'failed';

interface UseClipActionsProps {
  clipId: string;
  jobId: string;
  clipStatus: ClipStatus;
  downloadUrl?: string;
  apiKey: string;
}

interface PublishResult {
  success: boolean;
  url?: string;
  error?: string;
}

export const useClipActions = ({
  clipId,
  jobId,
  clipStatus,
  downloadUrl,
  apiKey,
}: UseClipActionsProps) => {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPublishing, setIsPublishing] = useState<SocialPlatform | null>(null);
  const [publishHistory, setPublishHistory] = useState<
    Array<{ platform: SocialPlatform; url: string; publishedAt: string }>
  >([]);

  // Check if actions are allowed based on status
  const canPerformActions = clipStatus === 'ready';

  /**
   * Download clip
   */
  const handleDownload = async () => {
    if (!canPerformActions || !downloadUrl) {
      toast({
        title: 'Download indisponível',
        description: 'O clipe ainda está sendo processado ou não tem URL de download',
        variant: 'destructive',
      });
      return;
    }

    setIsDownloading(true);
    try {
      // Open in new tab for download
      window.open(downloadUrl, '_blank');

      toast({
        title: 'Download iniciado!',
        description: 'O vídeo está sendo baixado',
      });
    } catch (error) {
      toast({
        title: 'Erro ao baixar',
        description: 'Não foi possível iniciar o download',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  /**
   * Publish to social media platform
   */
  const handlePublish = async (
    platform: SocialPlatform,
    metadata?: {
      title?: string;
      description?: string;
      hashtags?: string[];
    }
  ): Promise<PublishResult> => {
    if (!canPerformActions) {
      toast({
        title: 'Publicação indisponível',
        description: 'O clipe ainda está sendo processado',
        variant: 'destructive',
      });
      return { success: false, error: 'Clip not ready' };
    }

    setIsPublishing(platform);

    try {
      // For now, this is a placeholder
      // In the future, this will call the actual API
      const response = await fetch(`http://localhost:3001/clips/${clipId}/publish-${platform}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          jobId,
          metadata,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to publish to ${platform}`);
      }

      const result = await response.json();

      // Add to publish history
      setPublishHistory((prev) => [
        ...prev,
        {
          platform,
          url: result.url || '#',
          publishedAt: new Date().toISOString(),
        },
      ]);

      toast({
        title: `Publicado no ${getPlatformName(platform)}! 🎉`,
        description: result.url ? 'Clique para visualizar' : 'Publicação concluída',
      });

      return { success: true, url: result.url };
    } catch (error: any) {
      // For now, show "coming soon" messages for platforms not yet implemented
      const comingSoonPlatforms: SocialPlatform[] = ['tiktok', 'instagram'];

      if (comingSoonPlatforms.includes(platform)) {
        toast({
          title: `Em breve no ${getPlatformName(platform)}! 🚀`,
          description: 'Integração em desenvolvimento',
        });
        return { success: false, error: 'Coming soon' };
      }

      toast({
        title: 'Erro ao publicar',
        description: error.message || 'Não foi possível publicar o vídeo',
        variant: 'destructive',
      });

      return { success: false, error: error.message };
    } finally {
      setIsPublishing(null);
    }
  };

  /**
   * Copy text to clipboard
   */
  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: `${type} copiado!`,
        description: 'Colado na área de transferência',
      });
    } catch (err) {
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar o texto',
        variant: 'destructive',
      });
    }
  };

  /**
   * Get platform display name
   */
  const getPlatformName = (platform: SocialPlatform): string => {
    const names: Record<SocialPlatform, string> = {
      youtube: 'YouTube',
      tiktok: 'TikTok',
      instagram: 'Instagram',
    };
    return names[platform];
  };

  /**
   * Check if clip has been published to a platform
   */
  const isPublishedTo = (platform: SocialPlatform): boolean => {
    return publishHistory.some((pub) => pub.platform === platform);
  };

  /**
   * Get publish URL for a platform
   */
  const getPublishUrl = (platform: SocialPlatform): string | undefined => {
    return publishHistory.find((pub) => pub.platform === platform)?.url;
  };

  return {
    // State
    canPerformActions,
    isDownloading,
    isPublishing,
    publishHistory,

    // Actions
    handleDownload,
    handlePublish,
    handleCopy,

    // Helpers
    isPublishedTo,
    getPublishUrl,
    getPlatformName,
  };
};
