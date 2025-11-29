import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Download,
  Play,
  Sparkles,
  TrendingUp,
  Clock,
  Target,
  Zap,
  Copy,
  Share2,
  Eye,
  ChevronRight,
  ThumbsUp
} from 'lucide-react';
import { Clip } from '@/hooks/useClipList';
import { Player } from '@/components/Player';
import { useClipActions } from '@/hooks/useClipActions';
import { ClipCardSkeletonCompact } from './ClipCardSkeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface ClipCardProProps {
  clip: Clip;
  index: number;
  jobId?: string;
  apiKey?: string;
  totalClips?: number;
}

export const ClipCardPro = ({
  clip,
  index,
  jobId = '',
  apiKey = '93560857g',
  totalClips = 1
}: ClipCardProProps) => {
  const [showPlayer, setShowPlayer] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();

  const {
    canPerformActions,
    isDownloading,
    handleDownload,
    handleCopy,
  } = useClipActions({
    clipId: clip.id,
    jobId,
    clipStatus: clip.status,
    downloadUrl: clip.downloadUrl,
    apiKey,
  });

  const viralIntel = clip.viralIntel;

  // Show skeleton for processing clips
  if (clip.status === 'processing') {
    return <ClipCardSkeletonCompact index={index} />;
  }

  if (!viralIntel) {
    return null; // Fallback to old card if no viral intel
  }

  // Função para determinar cor do score
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 80) return 'text-blue-500';
    if (score >= 70) return 'text-yellow-500';
    return 'text-gray-500';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-green-500/10 border-green-500/30';
    if (score >= 80) return 'bg-blue-500/10 border-blue-500/30';
    if (score >= 70) return 'bg-yellow-500/10 border-yellow-500/30';
    return 'bg-gray-500/10 border-gray-500/30';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Viral';
    if (score >= 80) return 'Excelente';
    if (score >= 70) return 'Bom';
    return 'Médio';
  };

  // Ícones de plataforma
  const platformIcons = {
    tiktok: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
      </svg>
    ),
    instagram: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    ),
    youtube: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
  };

  const bestPlatform = viralIntel.platformPredictions.find(
    p => p.platform === viralIntel.recommendedPlatform
  );

  return (
    <TooltipProvider>
      <Card className="group overflow-hidden bg-gradient-to-br from-background to-muted/20 border-2 hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:scale-[1.02]">
        <CardContent className="p-0">
          {/* Thumbnail com Score Overlay */}
          <AspectRatio ratio={9/16} className="relative">
            <div
              className="bg-gradient-to-br from-primary/20 to-primary/5 h-full flex items-center justify-center cursor-pointer relative overflow-hidden"
              onClick={() => setShowPlayer(true)}
            >
              {clip.thumbnailUrl ? (
                <img
                  src={clip.thumbnailUrl}
                  alt={clip.title}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="text-center p-4">
                  <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-4 mx-auto group-hover:bg-primary/30 transition-colors">
                    <Play className="w-10 h-10 text-primary ml-1" />
                  </div>
                </div>
              )}

              {/* Score Badge - Grande e Visível */}
              <div className="absolute top-3 left-3">
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border-2 backdrop-blur-md",
                  getScoreBgColor(viralIntel.overallScore)
                )}>
                  <span className={cn("text-2xl font-bold", getScoreColor(viralIntel.overallScore))}>
                    {viralIntel.overallScore}
                  </span>
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] text-muted-foreground leading-none">SCORE</span>
                    <span className={cn("text-xs font-semibold leading-none", getScoreColor(viralIntel.overallScore))}>
                      {getScoreLabel(viralIntel.overallScore)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ranking Badge */}
              {viralIntel.ranking && (
                <Badge className="absolute top-3 right-3 bg-black/70 text-white border-0 backdrop-blur-sm">
                  #{viralIntel.ranking.position} de {viralIntel.ranking.total}
                </Badge>
              )}

              {/* Play Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <div className="w-20 h-20 bg-white/95 rounded-full flex items-center justify-center shadow-xl">
                  <Play className="w-10 h-10 text-primary ml-1" />
                </div>
              </div>

              {/* Platform Recommendation Overlay - Canto inferior */}
              {bestPlatform && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pb-3">
                  <div className="flex items-center gap-2 text-white">
                    <Target className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-medium">Melhor para:</span>
                    <div className="flex items-center gap-1">
                      {platformIcons[bestPlatform.platform as keyof typeof platformIcons]}
                      <span className="text-sm font-bold capitalize">{bestPlatform.platform}</span>
                    </div>
                    <Badge className="ml-auto bg-green-500 text-white border-0 text-xs">
                      {bestPlatform.viralScore}%
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </AspectRatio>

          {/* Content Section */}
          <div className="p-4 space-y-3">
            {/* Title */}
            <div>
              <h3 className="font-bold text-base leading-tight line-clamp-2 mb-1">
                {clip.title}
              </h3>
            </div>

            {/* Top Insight - Destaque */}
            {viralIntel.insights[0] && (
              <div className={cn(
                "flex items-start gap-2 p-3 rounded-lg text-sm border",
                viralIntel.insights[0].type === 'strength' && "bg-green-50 border-green-200 dark:bg-green-950/20",
                viralIntel.insights[0].type === 'opportunity' && "bg-blue-50 border-blue-200 dark:bg-blue-950/20",
                viralIntel.insights[0].type === 'warning' && "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20"
              )}>
                <span className="text-lg">{viralIntel.insights[0].icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-xs mb-0.5">{viralIntel.insights[0].title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {viralIntel.insights[0].description}
                  </div>
                </div>
              </div>
            )}

            {/* Platform Predictions */}
            <div className="grid grid-cols-3 gap-2">
              {viralIntel.platformPredictions.map((pred) => (
                <Tooltip key={pred.platform}>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-lg border-2 cursor-help transition-all hover:scale-105",
                      pred.platform === viralIntel.recommendedPlatform
                        ? "bg-primary/10 border-primary"
                        : "bg-muted/30 border-muted"
                    )}>
                      {platformIcons[pred.platform as keyof typeof platformIcons]}
                      <span className="text-xs font-bold">{pred.viralScore}</span>
                      {pred.platform === viralIntel.recommendedPlatform && (
                        <Sparkles className="w-3 h-3 text-primary" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-semibold capitalize">{pred.platform}</p>
                      <p className="text-xs">{pred.reason}</p>
                      {pred.bestPostingTime && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {pred.bestPostingTime}
                        </p>
                      )}
                      {pred.estimatedReach && (
                        <p className="text-xs text-green-500 flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {pred.estimatedReach.min.toLocaleString()}-{pred.estimatedReach.max.toLocaleString()} views
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleDownload}
                disabled={!canPerformActions || isDownloading}
                className="font-semibold"
              >
                {isDownloading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Baixar
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetails(true)}
                className="font-semibold"
              >
                <Zap className="w-4 h-4 mr-2" />
                Insights
              </Button>
            </div>

            {/* Quick Copy Actions */}
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(clip.title, 'Título')}
                className="flex-1 text-xs h-8"
              >
                <Copy className="w-3 h-3 mr-1" />
                Título
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(clip.hashtags.map(t => `#${t}`).join(' '), 'Hashtags')}
                className="flex-1 text-xs h-8"
              >
                <Copy className="w-3 h-3 mr-1" />
                Tags
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Player Modal - Enhanced Rich View - SEM SCROLL E SEM BARRAS PRETAS */}
      <Dialog open={showPlayer} onOpenChange={setShowPlayer}>
        <DialogContent className="max-w-[95vw] md:max-w-7xl h-[95vh] p-0 overflow-hidden bg-gradient-to-br from-background via-background to-muted/20">
          <div className="flex flex-col lg:flex-row h-full overflow-hidden">
            {/* Left Side - Video Player - TAMANHO AUMENTADO para melhor qualidade */}
            <div className="lg:w-[500px] xl:w-[600px] flex-shrink-0 bg-black flex flex-col">
              {/* Video - Altura fixa sem aspect ratio que cria barras */}
              <div className="relative flex-1 overflow-hidden">
                {(clip.previewUrl || clip.downloadUrl) ? (
                  <Player
                    url={clip.previewUrl || clip.downloadUrl || ''}
                    className="absolute inset-0 w-full h-full"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-white text-sm">Vídeo não disponível</p>
                  </div>
                )}

                {/* Floating Score Badge */}
                <div className="absolute top-4 left-4 z-10">
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-3 rounded-xl border-2 backdrop-blur-xl shadow-2xl",
                    getScoreBgColor(viralIntel.overallScore)
                  )}>
                    <div className="flex flex-col items-center">
                      <span className={cn("text-3xl font-black", getScoreColor(viralIntel.overallScore))}>
                        {viralIntel.overallScore}
                      </span>
                      <span className="text-[10px] text-white/80 font-semibold">/100</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-white/70 leading-none mb-1">VIRAL</span>
                      <span className={cn("text-sm font-bold leading-none", getScoreColor(viralIntel.overallScore))}>
                        {getScoreLabel(viralIntel.overallScore)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 bg-black/90 backdrop-blur grid grid-cols-2 gap-3">
                <Button
                  variant="secondary"
                  onClick={handleDownload}
                  disabled={!canPerformActions || isDownloading}
                  className="w-full"
                >
                  {isDownloading ? (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-2" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Baixar HD
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleCopy(clip.downloadUrl || '', 'Link')}
                  className="w-full"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Compartilhar
                </Button>
              </div>
            </div>

            {/* Right Side - Rich Information - COM SCROLL INTERNO */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                {/* Header - Title & Description */}
                <div>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <h2 className="text-2xl font-bold leading-tight">{clip.title}</h2>
                    {viralIntel.ranking && (
                      <Badge className="bg-primary text-primary-foreground shrink-0">
                        #{viralIntel.ranking.position} de {viralIntel.ranking.total}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{clip.description}</p>
                </div>

                {/* Viral Metrics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20">
                    <div className="text-xs text-muted-foreground mb-1">Ritmo</div>
                    <div className="text-lg font-bold capitalize">{viralIntel.contentAnalysis.pacing}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20">
                    <div className="text-xs text-muted-foreground mb-1">Emoção</div>
                    <div className="text-lg font-bold capitalize">{viralIntel.contentAnalysis.emotion}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20">
                    <div className="text-xs text-muted-foreground mb-1">Retenção</div>
                    <div className="text-lg font-bold">{viralIntel.contentAnalysis.audienceRetention}%</div>
                  </div>
                  <div className="p-3 rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20">
                    <div className="text-xs text-muted-foreground mb-1">Duração</div>
                    <div className="text-lg font-bold">{clip.duration}s</div>
                  </div>
                </div>

                {/* Platform Performance */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Previsão por Plataforma
                  </h3>
                  <div className="space-y-3">
                    {viralIntel.platformPredictions.map((pred) => (
                      <div
                        key={pred.platform}
                        className={cn(
                          "p-4 rounded-lg border-2 transition-all",
                          pred.platform === viralIntel.recommendedPlatform
                            ? "bg-primary/5 border-primary shadow-lg shadow-primary/10"
                            : "bg-muted/30 border-muted"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              pred.platform === viralIntel.recommendedPlatform
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            )}>
                              {platformIcons[pred.platform as keyof typeof platformIcons]}
                            </div>
                            <div>
                              <div className="font-bold capitalize flex items-center gap-2">
                                {pred.platform}
                                {pred.platform === viralIntel.recommendedPlatform && (
                                  <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0">MELHOR</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{pred.confidence} confiança</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn(
                              "text-3xl font-black",
                              pred.viralScore >= 85 ? "text-green-500" :
                              pred.viralScore >= 75 ? "text-blue-500" : "text-yellow-500"
                            )}>
                              {pred.viralScore}
                            </div>
                            <div className="text-xs text-muted-foreground">score</div>
                          </div>
                        </div>

                        <p className="text-sm text-muted-foreground mb-3">{pred.reason}</p>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          {pred.bestPostingTime && (
                            <div className="flex items-center gap-2 p-2 bg-background/50 rounded">
                              <Clock className="w-3 h-3 text-primary" />
                              <div>
                                <div className="font-medium">Melhor horário</div>
                                <div className="text-muted-foreground">{pred.bestPostingTime}</div>
                              </div>
                            </div>
                          )}
                          {pred.estimatedReach && (
                            <div className="flex items-center gap-2 p-2 bg-background/50 rounded">
                              <Eye className="w-3 h-3 text-green-500" />
                              <div>
                                <div className="font-medium">Alcance previsto</div>
                                <div className="text-muted-foreground">
                                  {pred.estimatedReach.min >= 1000
                                    ? `${(pred.estimatedReach.min/1000).toFixed(0)}k`
                                    : pred.estimatedReach.min}-
                                  {pred.estimatedReach.max >= 1000
                                    ? `${(pred.estimatedReach.max/1000).toFixed(0)}k`
                                    : pred.estimatedReach.max}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Viral Insights */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Insights para Maximizar Resultados
                  </h3>
                  <div className="space-y-2">
                    {viralIntel.insights.map((insight, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "p-3 rounded-lg border-l-4",
                          insight.type === 'strength' && "bg-green-50 border-green-500 dark:bg-green-950/20",
                          insight.type === 'opportunity' && "bg-blue-50 border-blue-500 dark:bg-blue-950/20",
                          insight.type === 'warning' && "bg-yellow-50 border-yellow-500 dark:bg-yellow-950/20"
                        )}
                      >
                        <div className="flex gap-3">
                          <span className="text-xl">{insight.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm mb-1">{insight.title}</div>
                            <div className="text-xs text-muted-foreground mb-1">{insight.description}</div>
                            {insight.actionable && (
                              <div className="flex items-center gap-1 text-xs font-medium text-primary mt-2">
                                <ChevronRight className="w-3 h-3" />
                                {insight.actionable}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hashtags */}
                {clip.hashtags.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Hashtags Sugeridas</h3>
                    <div className="flex flex-wrap gap-2">
                      {clip.hashtags.map((tag, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                          onClick={() => handleCopy(`#${tag}`, 'Hashtag')}
                        >
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Insights Detail Modal */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Inteligência Viral - {clip.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Overall Score */}
            <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg border-2 border-primary/20">
              <div className={cn("text-6xl font-bold mb-2", getScoreColor(viralIntel.overallScore))}>
                {viralIntel.overallScore}
              </div>
              <div className="text-lg font-semibold mb-1">{getScoreLabel(viralIntel.overallScore)}</div>
              <p className="text-sm text-muted-foreground">Potencial Viral Geral</p>
            </div>

            {/* All Insights */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Insights Acionáveis
              </h3>
              {viralIntel.insights.map((insight, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "p-4 rounded-lg border-2",
                    insight.type === 'strength' && "bg-green-50 border-green-200 dark:bg-green-950/20",
                    insight.type === 'opportunity' && "bg-blue-50 border-blue-200 dark:bg-blue-950/20",
                    insight.type === 'warning' && "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{insight.icon}</span>
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">{insight.title}</h4>
                      <p className="text-sm text-muted-foreground mb-2">{insight.description}</p>
                      {insight.actionable && (
                        <div className="flex items-center gap-2 text-sm font-medium text-primary">
                          <ChevronRight className="w-4 h-4" />
                          {insight.actionable}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Platform Details */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Target className="w-4 h-4" />
                Previsões por Plataforma
              </h3>
              {viralIntel.platformPredictions.map((pred) => (
                <div
                  key={pred.platform}
                  className={cn(
                    "p-4 rounded-lg border-2 transition-all",
                    pred.platform === viralIntel.recommendedPlatform
                      ? "bg-primary/10 border-primary"
                      : "bg-muted/30 border-muted"
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {platformIcons[pred.platform as keyof typeof platformIcons]}
                      <span className="font-bold capitalize">{pred.platform}</span>
                      {pred.platform === viralIntel.recommendedPlatform && (
                        <Badge className="bg-primary text-primary-foreground">Recomendado</Badge>
                      )}
                    </div>
                    <div className="text-2xl font-bold">{pred.viralScore}%</div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{pred.reason}</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {pred.bestPostingTime && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" />
                        <div>
                          <div className="font-medium">Melhor horário</div>
                          <div className="text-xs text-muted-foreground">{pred.bestPostingTime}</div>
                        </div>
                      </div>
                    )}
                    {pred.estimatedReach && (
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        <div>
                          <div className="font-medium">Alcance estimado</div>
                          <div className="text-xs text-muted-foreground">
                            {pred.estimatedReach.min.toLocaleString()}-{pred.estimatedReach.max.toLocaleString()} views
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Content Analysis */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <ThumbsUp className="w-4 h-4" />
                Análise de Conteúdo
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Ritmo</div>
                  <div className="font-semibold capitalize">{viralIntel.contentAnalysis.pacing}</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Emoção</div>
                  <div className="font-semibold capitalize">{viralIntel.contentAnalysis.emotion}</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg col-span-2">
                  <div className="text-xs text-muted-foreground mb-1">Retenção de Audiência</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${viralIntel.contentAnalysis.audienceRetention}%` }}
                      />
                    </div>
                    <span className="font-bold text-sm">{viralIntel.contentAnalysis.audienceRetention}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};
