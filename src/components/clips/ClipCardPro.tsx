import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

interface ClipCardProProps {
  clip: Clip;
  index: number;
  jobId?: string;
  apiKey?: string;
  totalClips?: number;
  onOpenPlayer?: (clipIndex: number) => void;
}

// Score color helpers
const getScoreColor = (score: number) => {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 80) return 'text-blue-400';
  if (score >= 70) return 'text-amber-400';
  return 'text-zinc-400';
};

const getScoreRingColor = (score: number) => {
  if (score >= 90) return 'stroke-emerald-400';
  if (score >= 80) return 'stroke-blue-400';
  if (score >= 70) return 'stroke-amber-400';
  return 'stroke-zinc-500';
};

const getScoreGlow = (score: number) => {
  if (score >= 90) return 'shadow-emerald-500/25';
  if (score >= 80) return 'shadow-blue-500/20';
  if (score >= 70) return 'shadow-amber-500/15';
  return '';
};

const getScoreLabel = (score: number) => {
  if (score >= 90) return 'Viral';
  if (score >= 80) return 'Excelente';
  if (score >= 70) return 'Bom';
  return 'Medio';
};

const getScoreBadgeBg = (score: number) => {
  if (score >= 90) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (score >= 80) return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (score >= 70) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
};

// Keep these for the modals
const getScoreBg = (score: number) => {
  if (score >= 90) return 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30';
  if (score >= 80) return 'from-blue-500/20 to-blue-500/5 border-blue-500/30';
  if (score >= 70) return 'from-amber-500/20 to-amber-500/5 border-amber-500/30';
  return 'from-zinc-500/20 to-zinc-500/5 border-zinc-500/30';
};

// Score Ring SVG component
const ScoreRing = ({ score, size = 56 }: { score: number; size?: number }) => {
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-white/[0.06]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          className={cn("transition-all duration-700", getScoreRingColor(score))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-lg font-black leading-none", getScoreColor(score))}>
          {score}
        </span>
      </div>
    </div>
  );
};

// Platform icons (compact)
const PlatformIcon = ({ platform, className = 'w-3.5 h-3.5' }: { platform: string; className?: string }) => {
  switch (platform) {
    case 'tiktok':
      return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/></svg>;
    case 'instagram':
      return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>;
    case 'youtube':
      return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>;
    default:
      return null;
  }
};

export const ClipCardPro = ({
  clip,
  index,
  jobId = '',
  apiKey = import.meta.env.VITE_API_KEY || '',
  totalClips = 1,
  onOpenPlayer,
}: ClipCardProProps) => {
  const [showPlayer, setShowPlayer] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const openPlayer = () => {
    if (onOpenPlayer) {
      onOpenPlayer(index);
    } else {
      setShowPlayer(true);
    }
  };

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

  if (clip.status === 'processing') {
    return <ClipCardSkeletonCompact index={index} />;
  }

  if (!viralIntel) return null;

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.round(s % 60);
    return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
  };

  return (
    <TooltipProvider>
      {/* ========== VERTICAL CARD ========== */}
      <Card className="group overflow-hidden bg-zinc-950/80 border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 rounded-xl hover:shadow-2xl hover:shadow-black/40">
        <CardContent className="p-0">
          {/* Thumbnail area - taller, vertical feel */}
          <div
            className="relative aspect-video cursor-pointer overflow-hidden bg-zinc-900"
            onClick={openPlayer}
          >
            {clip.thumbnailUrl ? (
              <img
                src={clip.thumbnailUrl}
                alt={clip.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/10 via-zinc-900 to-zinc-950 flex items-center justify-center">
                <Play className="w-10 h-10 text-white/20" />
              </div>
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

            {/* Play overlay on hover */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
              <div className="w-14 h-14 bg-white/95 rounded-full flex items-center justify-center shadow-2xl shadow-black/50 scale-90 group-hover:scale-100 transition-transform duration-300">
                <Play className="w-6 h-6 text-zinc-900 ml-0.5" />
              </div>
            </div>

            {/* Top bar: Ranking + Duration */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
              {viralIntel.ranking && (
                <span className="text-[11px] font-bold bg-black/60 text-white/80 px-2 py-0.5 rounded-md backdrop-blur-sm">
                  #{viralIntel.ranking.position}
                </span>
              )}
              <span className="text-[11px] font-medium bg-black/60 text-white/80 px-2 py-0.5 rounded-md backdrop-blur-sm flex items-center gap-1 ml-auto">
                <Clock className="w-3 h-3" />
                {formatDuration(clip.duration)}
              </span>
            </div>

            {/* Bottom: Score label overlay */}
            <div className="absolute bottom-3 left-3">
              <Badge className={cn("text-[10px] font-bold uppercase border backdrop-blur-md", getScoreBadgeBg(viralIntel.overallScore))}>
                {getScoreLabel(viralIntel.overallScore)}
              </Badge>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Title row with score ring */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[13px] leading-snug text-white line-clamp-2 mb-1">
                  {clip.title}
                </h3>
                <p className="text-[11px] text-white/35 line-clamp-1">
                  {clip.description}
                </p>
              </div>
              <div className={cn("flex-shrink-0 shadow-lg rounded-full", getScoreGlow(viralIntel.overallScore))}>
                <ScoreRing score={viralIntel.overallScore} size={52} />
              </div>
            </div>

            {/* Platform predictions - minimal pills */}
            <div className="flex gap-1.5">
              {viralIntel.platformPredictions.map((pred) => (
                <Tooltip key={pred.platform}>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-help transition-all",
                      pred.platform === viralIntel.recommendedPlatform
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.06]"
                    )}>
                      <PlatformIcon platform={pred.platform} className="w-3 h-3" />
                      <span>{pred.viralScore}</span>
                      {pred.platform === viralIntel.recommendedPlatform && (
                        <Sparkles className="w-2.5 h-2.5" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-semibold capitalize mb-1">{pred.platform}</p>
                    <p className="text-xs text-muted-foreground">{pred.reason}</p>
                    {pred.bestPostingTime && (
                      <p className="text-xs mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{pred.bestPostingTime}</p>
                    )}
                    {pred.estimatedReach && (
                      <p className="text-xs text-emerald-500 flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {pred.estimatedReach.min.toLocaleString()}-{pred.estimatedReach.max.toLocaleString()} views
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleDownload}
                disabled={!canPerformActions || isDownloading}
                className="flex-1 h-9 text-xs font-semibold rounded-lg bg-white text-zinc-900 hover:bg-white/90"
              >
                {isDownloading ? (
                  <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                )}
                Baixar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={openPlayer}
                className="h-9 px-3 text-xs text-white/50 hover:text-white hover:bg-white/[0.06] rounded-lg"
              >
                <Play className="w-3.5 h-3.5 mr-1" />
                Ver
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails(true)}
                    className="h-9 w-9 p-0 text-white/30 hover:text-primary hover:bg-primary/10 rounded-lg"
                  >
                    <Zap className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Insights virais</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ========== PLAYER MODAL ========== */}
      <Dialog open={showPlayer} onOpenChange={setShowPlayer}>
        <DialogContent className="max-w-[95vw] md:max-w-7xl h-[95vh] p-0 overflow-hidden bg-gradient-to-br from-background via-background to-muted/20">
          <div className="flex flex-col lg:flex-row h-full overflow-hidden">
            {/* Left Side - Video Player */}
            <div className="lg:w-[500px] xl:w-[600px] flex-shrink-0 bg-black flex flex-col">
              <div className="relative flex-1 overflow-hidden">
                {(clip.previewUrl || clip.downloadUrl) ? (
                  <Player
                    url={clip.previewUrl || clip.downloadUrl || ''}
                    poster={clip.thumbnailUrl}
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
                    "flex items-center gap-2 px-4 py-3 rounded-xl border-2 backdrop-blur-xl shadow-2xl bg-gradient-to-r",
                    getScoreBg(viralIntel.overallScore)
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

            {/* Right Side - Rich Information */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                {/* Header */}
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
                    <div className="text-xs text-muted-foreground mb-1">Emocao</div>
                    <div className="text-lg font-bold capitalize">{viralIntel.contentAnalysis.emotion}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20">
                    <div className="text-xs text-muted-foreground mb-1">Retencao</div>
                    <div className="text-lg font-bold">{viralIntel.contentAnalysis.audienceRetention}%</div>
                  </div>
                  <div className="p-3 rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20">
                    <div className="text-xs text-muted-foreground mb-1">Duracao</div>
                    <div className="text-lg font-bold">{formatDuration(clip.duration)}</div>
                  </div>
                </div>

                {/* Platform Performance */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Previsao por Plataforma
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
                              <PlatformIcon platform={pred.platform} className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-bold capitalize flex items-center gap-2">
                                {pred.platform}
                                {pred.platform === viralIntel.recommendedPlatform && (
                                  <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0">MELHOR</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{pred.confidence} confianca</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn(
                              "text-3xl font-black",
                              pred.viralScore >= 85 ? "text-emerald-500" :
                              pred.viralScore >= 75 ? "text-blue-500" : "text-amber-500"
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
                                <div className="font-medium">Melhor horario</div>
                                <div className="text-muted-foreground">{pred.bestPostingTime}</div>
                              </div>
                            </div>
                          )}
                          {pred.estimatedReach && (
                            <div className="flex items-center gap-2 p-2 bg-background/50 rounded">
                              <Eye className="w-3 h-3 text-emerald-500" />
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
                          insight.type === 'strength' && "bg-emerald-950/20 border-emerald-500",
                          insight.type === 'opportunity' && "bg-blue-950/20 border-blue-500",
                          insight.type === 'warning' && "bg-amber-950/20 border-amber-500"
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

      {/* ========== INSIGHTS MODAL ========== */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Inteligencia Viral - {clip.title}
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
                Insights Acionaveis
              </h3>
              {viralIntel.insights.map((insight, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "p-4 rounded-lg border-2",
                    insight.type === 'strength' && "bg-emerald-950/20 border-emerald-500/30",
                    insight.type === 'opportunity' && "bg-blue-950/20 border-blue-500/30",
                    insight.type === 'warning' && "bg-amber-950/20 border-amber-500/30"
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
                Previsoes por Plataforma
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
                      <PlatformIcon platform={pred.platform} />
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
                          <div className="font-medium">Melhor horario</div>
                          <div className="text-xs text-muted-foreground">{pred.bestPostingTime}</div>
                        </div>
                      </div>
                    )}
                    {pred.estimatedReach && (
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
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
                Analise de Conteudo
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Ritmo</div>
                  <div className="font-semibold capitalize">{viralIntel.contentAnalysis.pacing}</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Emocao</div>
                  <div className="font-semibold capitalize">{viralIntel.contentAnalysis.emotion}</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg col-span-2">
                  <div className="text-xs text-muted-foreground mb-1">Retencao de Audiencia</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white/10 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all"
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
