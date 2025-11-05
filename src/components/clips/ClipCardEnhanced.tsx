import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Upload, Copy, FileText, Hash, Play, Sparkles, Loader, Settings, ExternalLink, Check } from 'lucide-react';
import { Clip } from '@/hooks/useClipList';
import { Player } from '@/components/Player';
import { useClipActions } from '@/hooks/useClipActions';
import { SubtitleCustomizer } from './SubtitleCustomizer';
import type { SubtitlePreferences } from './SubtitleCustomizer';
import { cn } from '@/lib/utils';

interface ClipCardEnhancedProps {
  clip: Clip;
  index: number;
  jobId?: string;
  apiKey?: string;
}

export const ClipCardEnhanced = ({ clip, index, jobId = '', apiKey = '93560857g' }: ClipCardEnhancedProps) => {
  const [showPlayer, setShowPlayer] = useState(false);
  const [showSubtitleCustomizer, setShowSubtitleCustomizer] = useState(false);

  const {
    canPerformActions,
    isDownloading,
    isPublishing,
    publishHistory,
    handleDownload: download,
    handlePublish,
    handleCopy,
    isPublishedTo,
    getPublishUrl,
    getPlatformName,
  } = useClipActions({
    clipId: clip.id,
    jobId,
    clipStatus: clip.status,
    downloadUrl: clip.downloadUrl,
    apiKey,
  });

  // Debug: Log clip data when opening player
  const handleOpenPlayer = () => {
    console.log('[ClipCard] Opening player with clip:', {
      id: clip.id,
      title: clip.title,
      previewUrl: clip.previewUrl,
      downloadUrl: clip.downloadUrl,
      thumbnailUrl: clip.thumbnailUrl,
      hasPreviewUrl: !!clip.previewUrl,
      hasDownloadUrl: !!clip.downloadUrl,
    });
    setShowPlayer(true);
  };

  const handleSaveSubtitlePreferences = async (preferences: SubtitlePreferences) => {
    try {
      const response = await fetch(
        `http://localhost:3001/jobs/${jobId}/clips/${clip.id}/subtitle-settings`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify(preferences),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }

      setShowSubtitleCustomizer(false);

      // Show success message
      handleCopy('Preferências salvas! Regere o vídeo para aplicar', 'Legendas');
    } catch (error) {
      console.error('Failed to save subtitle preferences:', error);
    }
  };

  if (clip.status === 'processing') {
    return (
      <Card className="overflow-hidden bg-gradient-card border-2 border-dashed border-primary/20">
        <CardContent className="p-0">
          <AspectRatio ratio={9/16} className="bg-gradient-to-br from-primary/10 to-primary/5">
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                <Loader className="w-8 h-8 text-primary animate-spin" />
              </div>
              <h3 className="font-semibold text-sm mb-2">Clipe {index + 1}</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Criando algo incrível...
              </p>
              <div className="flex items-center gap-1 text-xs text-primary">
                <Sparkles className="w-3 h-3" />
                <span>Em processamento</span>
              </div>
            </div>
          </AspectRatio>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="overflow-hidden bg-gradient-card border hover:shadow-xl transition-all duration-300 hover:scale-[1.02] group">
        <CardContent className="p-0">
          <AspectRatio ratio={9/16} className="relative">
            {/* Video thumbnail/preview */}
            <div
              className="bg-gradient-to-br from-primary/20 to-primary/5 h-full flex items-center justify-center cursor-pointer group relative overflow-hidden"
              onClick={handleOpenPlayer}
            >
              {clip.thumbnailUrl ? (
                <img
                  src={clip.thumbnailUrl}
                  alt={clip.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-4">
                  <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-4 mx-auto group-hover:bg-primary/30 transition-colors">
                    <Play className="w-10 h-10 text-primary ml-1" />
                  </div>
                </div>
              )}

              {/* Ready badge */}
              <Badge className="absolute top-3 right-3 bg-green-500 text-white border-0 shadow-lg">
                <Sparkles className="w-3 h-3 mr-1" />
                Pronto
              </Badge>

              {/* Play overlay */}
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                  <Play className="w-8 h-8 text-primary ml-1" />
                </div>
              </div>
            </div>
          </AspectRatio>

          {/* Clip info and actions */}
          <div className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-sm leading-tight mb-1 line-clamp-2">
                {clip.title}
              </h3>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {clip.description}
              </p>
            </div>

            {/* Hashtags */}
            {clip.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {clip.hashtags.slice(0, 3).map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-xs px-2 py-0.5">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Publish History */}
            {publishHistory.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {publishHistory.map((pub, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs px-2 py-0.5 cursor-pointer">
                        <Check className="w-3 h-3 mr-1" />
                        {getPlatformName(pub.platform)}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Publicado em {new Date(pub.publishedAt).toLocaleDateString()}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}

            {/* Primary actions */}
            <div className="grid grid-cols-2 gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={download}
                    disabled={!canPerformActions || isDownloading}
                    className="text-xs gap-1"
                  >
                    {isDownloading ? (
                      <Loader className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    Baixar
                  </Button>
                </TooltipTrigger>
                {!canPerformActions && (
                  <TooltipContent>
                    <p>Aguardando processamento...</p>
                  </TooltipContent>
                )}
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSubtitleCustomizer(true)}
                    disabled={!canPerformActions}
                    className="text-xs gap-1"
                  >
                    <Settings className="w-3 h-3" />
                    Legendas
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Personalizar legendas</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Export buttons */}
            <div className="grid grid-cols-3 gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePublish('youtube', {
                      title: clip.title,
                      description: clip.description,
                      hashtags: clip.hashtags,
                    })}
                    disabled={!canPerformActions || isPublishing === 'youtube'}
                    className="text-xs gap-1"
                  >
                    {isPublishing === 'youtube' ? (
                      <Loader className="w-3 h-3 animate-spin" />
                    ) : isPublishedTo('youtube') ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    YT
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isPublishedTo('youtube') ? 'Já publicado no YouTube' : 'Publicar no YouTube'}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePublish('tiktok', {
                      title: clip.title,
                      description: clip.description,
                      hashtags: clip.hashtags,
                    })}
                    disabled={!canPerformActions || isPublishing === 'tiktok'}
                    className="text-xs gap-1"
                  >
                    {isPublishing === 'tiktok' ? (
                      <Loader className="w-3 h-3 animate-spin" />
                    ) : isPublishedTo('tiktok') ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    TT
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isPublishedTo('tiktok') ? 'Já publicado no TikTok' : 'Em breve: TikTok'}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePublish('instagram', {
                      title: clip.title,
                      description: clip.description,
                      hashtags: clip.hashtags,
                    })}
                    disabled={!canPerformActions || isPublishing === 'instagram'}
                    className="text-xs gap-1"
                  >
                    {isPublishing === 'instagram' ? (
                      <Loader className="w-3 h-3 animate-spin" />
                    ) : isPublishedTo('instagram') ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    IG
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isPublishedTo('instagram') ? 'Já publicado no Instagram' : 'Em breve: Instagram'}</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Copy actions */}
            <div className="grid grid-cols-3 gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(clip.title, 'Título')}
                className="text-xs gap-1 h-8"
              >
                <Copy className="w-3 h-3" />
                Título
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(clip.description, 'Descrição')}
                className="text-xs gap-1 h-8"
              >
                <FileText className="w-3 h-3" />
                Desc
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(clip.hashtags.map(t => `#${t}`).join(' '), 'Hashtags')}
                className="text-xs gap-1 h-8"
              >
                <Hash className="w-3 h-3" />
                Tags
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Player Modal */}
      <Dialog open={showPlayer} onOpenChange={setShowPlayer}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">{clip.title}</DialogTitle>
          </DialogHeader>
          <AspectRatio ratio={9/16}>
            {clip.previewUrl ? (
              <Player url={clip.previewUrl} title={clip.title} />
            ) : clip.downloadUrl ? (
              <Player url={clip.downloadUrl} title={clip.title} />
            ) : (
              <div className="flex items-center justify-center h-full bg-gradient-to-br from-primary/10 to-primary/5">
                <p className="text-sm text-muted-foreground">Vídeo não disponível</p>
              </div>
            )}
          </AspectRatio>
        </DialogContent>
      </Dialog>

      {/* Subtitle Customizer Modal */}
      <Dialog open={showSubtitleCustomizer} onOpenChange={setShowSubtitleCustomizer}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Personalizar Legendas</DialogTitle>
          </DialogHeader>
          <SubtitleCustomizer
            initialPreferences={clip.subtitleSettings}
            onSave={handleSaveSubtitlePreferences}
            onCancel={() => setShowSubtitleCustomizer(false)}
            clipId={clip.id}
          />
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};
