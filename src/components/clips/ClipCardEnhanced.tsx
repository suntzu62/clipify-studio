import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Download, Upload, Copy, FileText, Hash, Play, Sparkles, Loader, Settings, ExternalLink, Check, Share2, Link as LinkIcon, X, ThumbsUp, ThumbsDown, MessageCircle, Repeat2, Volume2, Pause } from 'lucide-react';
import { Clip } from '@/hooks/useClipList';
import { Player } from '@/components/Player';
import { useClipActions } from '@/hooks/useClipActions';
import { SubtitleCustomizer } from './SubtitleCustomizer';
import type { SubtitlePreferences } from './SubtitleCustomizer';
import { ClipCardSkeletonCompact } from './ClipCardSkeleton';
import { ClipShortsModal } from './ClipCardShortsModal';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface ClipCardEnhancedProps {
  clip: Clip;
  index: number;
  jobId?: string;
  apiKey?: string;
}

export const ClipCardEnhanced = ({ clip, index, jobId = '', apiKey = '93560857g' }: ClipCardEnhancedProps) => {
  const [showPlayer, setShowPlayer] = useState(false);
  const [showSubtitleCustomizer, setShowSubtitleCustomizer] = useState(false);
  const [loadingPreferences, setLoadingPreferences] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [currentPreferences, setCurrentPreferences] = useState<SubtitlePreferences | undefined>(clip.subtitleSettings);
  const { toast } = useToast();

  // Base URL for API calls
  const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

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

  // Buscar preferências do servidor ao abrir o modal
  const handleOpenSubtitleCustomizer = async () => {
    console.log('[SubtitleCustomizer] Botão Legendas clicado', {
      clipId: clip.id,
      clipTitle: clip.title,
      jobId,
      apiKey,
    });

    setShowSubtitleCustomizer(true);
    setLoadingPreferences(true);

    try {
      const url = `${baseUrl}/jobs/${jobId}/clips/${clip.id}/subtitle-settings`;
      console.log('[SubtitleCustomizer] Fetching preferences from:', url);

      const response = await fetch(url, {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      console.log('[SubtitleCustomizer] Fetch response:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[SubtitleCustomizer] Preferências carregadas:', data.preferences);
        setCurrentPreferences(data.preferences);
      } else if (response.status === 404) {
        console.log('[SubtitleCustomizer] Nenhuma preferência salva, usando padrões');
        toast({
          title: 'Nenhuma personalização salva',
          description: 'Usando configurações padrão',
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[SubtitleCustomizer] Erro ao carregar:', errorData);
        toast({
          title: 'Erro ao carregar preferências',
          description: 'Usando preferências padrão',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[SubtitleCustomizer] Exceção ao carregar preferências:', error);
      toast({
        title: 'Erro ao carregar preferências',
        description: 'Usando preferências padrão',
        variant: 'destructive',
      });
    } finally {
      setLoadingPreferences(false);
    }
  };

  const handleSaveSubtitlePreferences = async (preferences: SubtitlePreferences) => {
    console.log('[SubtitleCustomizer] Salvando preferências:', {
      clipId: clip.id,
      preferences,
    });

    try {
      const url = `${baseUrl}/jobs/${jobId}/clips/${clip.id}/subtitle-settings`;
      console.log('[SubtitleCustomizer] Enviando PATCH para:', url);

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(preferences),
      });

      console.log('[SubtitleCustomizer] PATCH response:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[SubtitleCustomizer] Erro ao salvar:', errorData);
        throw new Error('Failed to save preferences');
      }

      const data = await response.json();
      console.log('[SubtitleCustomizer] Preferências salvas com sucesso:', data);

      // Atualizar preferências localmente
      setCurrentPreferences(data.preferences);

      // Fechar modal
      setShowSubtitleCustomizer(false);

      toast({
        title: 'Preferências salvas!',
        description: 'As mudanças serão aplicadas no próximo processamento',
      });
    } catch (error) {
      console.error('[SubtitleCustomizer] Exceção ao salvar:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as preferências. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveAndReprocess = async (preferences: SubtitlePreferences) => {
    console.log('[SubtitleCustomizer] Salvando E reprocessando:', {
      clipId: clip.id,
      preferences,
    });

    setReprocessing(true);

    try {
      // 1. Salvar preferências primeiro
      const saveUrl = `${baseUrl}/jobs/${jobId}/clips/${clip.id}/subtitle-settings`;
      console.log('[SubtitleCustomizer] Salvando preferências:', saveUrl);

      const saveResponse = await fetch(saveUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(preferences),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save preferences');
      }

      const saveData = await saveResponse.json();
      console.log('[SubtitleCustomizer] Preferências salvas:', saveData);

      // 2. Iniciar reprocessamento
      const reprocessUrl = `${baseUrl}/jobs/${jobId}/clips/${clip.id}/reprocess`;
      console.log('[SubtitleCustomizer] Iniciando reprocessamento:', reprocessUrl);

      const reprocessResponse = await fetch(reprocessUrl, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (!reprocessResponse.ok) {
        const errorData = await reprocessResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to start reprocessing');
      }

      // Fechar modal
      setShowSubtitleCustomizer(false);

      // Toast de progresso
      toast({
        title: '⚡ Reprocessando...',
        description: 'O vídeo está sendo reprocessado com as novas legendas (~5s)',
      });

      // 3. Polling para detectar quando o clip foi atualizado
      const startTime = Date.now();
      const pollInterval = setInterval(async () => {
        try {
          // Força reload da página após 6 segundos
          if (Date.now() - startTime > 6000) {
            clearInterval(pollInterval);
            window.location.reload();
          }
        } catch (error) {
          console.error('[SubtitleCustomizer] Erro no polling:', error);
        }
      }, 1000);

    } catch (error: any) {
      console.error('[SubtitleCustomizer] Exceção ao reprocessar:', error);
      toast({
        title: 'Erro ao reprocessar',
        description: error.message || 'Não foi possível reprocessar o clip. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setReprocessing(false);
    }
  };

  // Pega a transcrição completa para exibir como legenda
  const transcriptFull = Array.isArray(clip.transcript) && clip.transcript.length
    ? clip.transcript
        .map(segment => segment?.text?.trim())
        .filter(Boolean)
        .join(' ')
    : '';

  // Usa apenas a transcrição (não a descrição)
  const captionText = transcriptFull.trim();
  const condensedCaption = captionText.length > 150
    ? `${captionText.slice(0, 147)}…`
    : captionText;
  const hasCaption = Boolean(condensedCaption);

  // Show skeleton loader for processing clips
  if (clip.status === 'processing') {
    return <ClipCardSkeletonCompact index={index} />;
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
                    onClick={handleOpenSubtitleCustomizer}
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

      {/* Player Modal - Layout Profissional com Card */}
      <Dialog open={showPlayer} onOpenChange={setShowPlayer}>
        <DialogContent
          className="max-w-[95vw] md:max-w-5xl max-h-[95vh] p-0 overflow-hidden bg-background"
          aria-labelledby="clip-title"
          aria-describedby="clip-description"
        >
          {/* Container com scroll */}
          <div className="overflow-y-auto max-h-[95vh] p-6">

            {/* Layout Flex: Player à esquerda + Informações à direita (Desktop) */}
            <div className="flex flex-col md:flex-row gap-6 items-start">

              {/* Coluna Esquerda: Player + Botões de Ação */}
              <div className="relative flex-shrink-0 w-full md:w-auto">
                {/* Player Container */}
                <div className="w-full max-w-[min(90vw,480px)] aspect-[9/16] bg-black rounded-lg overflow-hidden mx-auto md:mx-0">
                  {/* Vídeo limpo sem sobreposições */}
                  {clip.previewUrl ? (
                    <Player
                      url={clip.previewUrl}
                      className="w-full h-full"
                    />
                  ) : clip.downloadUrl ? (
                    <Player
                      url={clip.downloadUrl}
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-white text-sm">Vídeo não disponível</p>
                    </div>
                  )}
                </div>

                {/* Botões de Ação abaixo do player (Desktop e Mobile) */}
                <div className="flex gap-3 justify-center mt-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        onClick={download}
                        disabled={!canPerformActions || isDownloading}
                        className="flex-1 md:flex-initial"
                      >
                        {isDownloading ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Baixar
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Baixar vídeo</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          try {
                            const clipUrl = clip.previewUrl ?? clip.downloadUrl ?? window.location.href;
                            const shareData = {
                              title: clip.title,
                              text: clip.description,
                              url: clipUrl,
                            };
                            if (navigator.share) {
                              await navigator.share(shareData);
                              toast({ title: 'Compartilhado!', description: 'Link copiado com sucesso' });
                            } else {
                              handleCopy(clipUrl, 'Link');
                            }
                          } catch (error: any) {
                            if (error.name !== 'AbortError') {
                              toast({
                                title: 'Erro ao compartilhar',
                                description: 'Tente novamente',
                                variant: 'destructive'
                              });
                            }
                          }
                        }}
                        disabled={!canPerformActions}
                        className="flex-1 md:flex-initial"
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Compartilhar
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Compartilhar vídeo</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => handleCopy(clip.downloadUrl || '', 'Link do vídeo')}
                        disabled={!canPerformActions || !clip.downloadUrl}
                        aria-label="Copiar link"
                      >
                        <LinkIcon className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {clip.downloadUrl ? 'Copiar link do vídeo' : 'Link não disponível'}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Coluna Direita: Informações do Vídeo (Desktop) / Abaixo do Player (Mobile) */}
              <div className="flex-1 space-y-4 w-full">
                {/* Título e Descrição */}
                <div>
                  <h2 id="clip-title" className="text-2xl font-bold mb-2">
                    {clip.title}
                  </h2>
                  {clip.description && (
                    <p id="clip-description" className="text-muted-foreground leading-relaxed">
                      {clip.description}
                    </p>
                  )}
                </div>

                {/* Tags */}
                {clip.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {clip.hashtags.map((tag, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80"
                        onClick={() => handleCopy(`#${tag}`, 'Hashtag')}
                      >
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Botões de Publicação em Redes Sociais */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Publicar em:</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {/* TikTok */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          onClick={() => handlePublish('tiktok', {
                            title: clip.title,
                            description: clip.description,
                            hashtags: clip.hashtags,
                          })}
                          disabled={!canPerformActions || isPublishing === 'tiktok'}
                          className="flex-col gap-2 h-auto py-3"
                          aria-label="Publicar no TikTok"
                        >
                          {isPublishing === 'tiktok' ? (
                            <Loader className="w-5 h-5 animate-spin" />
                          ) : isPublishedTo('tiktok') ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
                            </svg>
                          )}
                          <span className="text-xs font-semibold">TikTok</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isPublishedTo('tiktok') ? 'Publicado' : 'Publicar'}
                      </TooltipContent>
                    </Tooltip>

                    {/* Instagram */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          onClick={() => handlePublish('instagram', {
                            title: clip.title,
                            description: clip.description,
                            hashtags: clip.hashtags,
                          })}
                          disabled={!canPerformActions || isPublishing === 'instagram'}
                          className="flex-col gap-2 h-auto py-3"
                          aria-label="Publicar no Instagram"
                        >
                          {isPublishing === 'instagram' ? (
                            <Loader className="w-5 h-5 animate-spin" />
                          ) : isPublishedTo('instagram') ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                          )}
                          <span className="text-xs font-semibold">Instagram</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isPublishedTo('instagram') ? 'Publicado' : 'Publicar'}
                      </TooltipContent>
                    </Tooltip>

                    {/* YouTube */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          onClick={() => handlePublish('youtube', {
                            title: clip.title,
                            description: clip.description,
                            hashtags: clip.hashtags,
                          })}
                          disabled={!canPerformActions || isPublishing === 'youtube'}
                          className="flex-col gap-2 h-auto py-3"
                          aria-label="Publicar no YouTube"
                        >
                          {isPublishing === 'youtube' ? (
                            <Loader className="w-5 h-5 animate-spin" />
                          ) : isPublishedTo('youtube') ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                            </svg>
                          )}
                          <span className="text-xs font-semibold">YouTube</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isPublishedTo('youtube') ? 'Publicado' : 'Publicar'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subtitle Customizer Modal */}
      <Dialog open={showSubtitleCustomizer} onOpenChange={setShowSubtitleCustomizer}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="subtitle-description">
          <DialogHeader>
            <DialogTitle>Personalizar Legendas</DialogTitle>
          </DialogHeader>
          <div id="subtitle-description" className="sr-only">
            Personalize o estilo, posição e formato das legendas do clipe {clip.title}
          </div>
          {loadingPreferences ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Carregando preferências...</span>
            </div>
          ) : (
            <SubtitleCustomizer
              initialPreferences={currentPreferences}
              onSave={handleSaveSubtitlePreferences}
              onSaveAndReprocess={handleSaveAndReprocess}
              onCancel={() => setShowSubtitleCustomizer(false)}
              clipId={clip.id}
            />
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};
