import { useCallback, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  Share2,
  Clock,
  Target,
  Eye,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Play,
} from 'lucide-react';
import { Clip } from '@/hooks/useClipList';
import { Player } from '@/components/Player';
import { useClipActions } from '@/hooks/useClipActions';
import { cn } from '@/lib/utils';

interface ClipPlayerModalProps {
  clips: Clip[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (index: number) => void;
  jobId: string;
  apiKey?: string;
}

const getScoreColor = (score: number) => {
  if (score >= 90) return 'text-green-400';
  if (score >= 80) return 'text-blue-400';
  if (score >= 70) return 'text-yellow-400';
  return 'text-gray-400';
};

const getScoreBg = (score: number) => {
  if (score >= 90) return 'from-green-500/20 to-green-500/5 border-green-500/30';
  if (score >= 80) return 'from-blue-500/20 to-blue-500/5 border-blue-500/30';
  if (score >= 70) return 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30';
  return 'from-gray-500/20 to-gray-500/5 border-gray-500/30';
};

const getScoreLabel = (score: number) => {
  if (score >= 90) return 'Viral';
  if (score >= 80) return 'Excelente';
  if (score >= 70) return 'Bom';
  return 'Medio';
};

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

const formatDuration = (s: number) => {
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
};

export const ClipPlayerModal = ({
  clips,
  currentIndex,
  open,
  onOpenChange,
  onNavigate,
  jobId,
  apiKey = import.meta.env.VITE_API_KEY || '',
}: ClipPlayerModalProps) => {
  const clip = clips[currentIndex];
  const viralIntel = clip?.viralIntel;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < clips.length - 1;

  const {
    canPerformActions,
    isDownloading,
    handleDownload,
    handleCopy,
  } = useClipActions({
    clipId: clip?.id || '',
    jobId,
    clipStatus: clip?.status || 'processing',
    downloadUrl: clip?.downloadUrl,
    apiKey,
  });

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(currentIndex - 1);
  }, [hasPrev, currentIndex, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(currentIndex + 1);
  }, [hasNext, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, goPrev, goNext]);

  if (!clip || !viralIntel) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-7xl h-[95vh] p-0 overflow-hidden bg-gradient-to-br from-background via-background to-muted/20">
        <div className="flex flex-col lg:flex-row h-full overflow-hidden">
          {/* Left Side - Video Player */}
          <div className="lg:w-[500px] xl:w-[600px] flex-shrink-0 bg-black flex flex-col relative">
            <div className="relative flex-1 overflow-hidden">
              {(clip.previewUrl || clip.downloadUrl) ? (
                <Player
                  url={clip.previewUrl || clip.downloadUrl || ''}
                  className="absolute inset-0 w-full h-full"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-white text-sm">Video nao disponivel</p>
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

              {/* Clip counter */}
              <div className="absolute top-4 right-4 z-10">
                <span className="text-xs font-semibold bg-black/70 text-white px-2.5 py-1 rounded-lg backdrop-blur-sm">
                  {currentIndex + 1} / {clips.length}
                </span>
              </div>

              {/* Navigation arrows over video */}
              {hasPrev && (
                <button
                  onClick={goPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {hasNext && (
                <button
                  onClick={goNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
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
                <div className="p-3 rounded-lg bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20">
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
                                <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0">MELHOR</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{pred.confidence} confianca</div>
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
                              <div className="font-medium">Melhor horario</div>
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
                        insight.type === 'strength' && "bg-green-950/20 border-green-500",
                        insight.type === 'opportunity' && "bg-blue-950/20 border-blue-500",
                        insight.type === 'warning' && "bg-yellow-950/20 border-yellow-500"
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

              {/* Navigation footer */}
              {clips.length > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-white/10">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goPrev}
                    disabled={!hasPrev}
                    className="gap-2 text-white/60 hover:text-white disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Clip anterior
                  </Button>
                  <span className="text-xs text-white/40">
                    Use as setas do teclado para navegar
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goNext}
                    disabled={!hasNext}
                    className="gap-2 text-white/60 hover:text-white disabled:opacity-30"
                  >
                    Proximo clip
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
