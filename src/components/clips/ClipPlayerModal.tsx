import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Download,
  Share2,
  ChevronRight,
  ChevronLeft,
  Copy,
  Clock,
  Eye,
  TrendingUp,
  Zap,
  X,
} from 'lucide-react';
import { Clip } from '@/hooks/useClipList';
import { Player } from '@/components/Player';
import type { AspectRatioType } from '@/components/Player';
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
  if (score >= 85) return 'text-emerald-400';
  if (score >= 70) return 'text-amber-400';
  if (score >= 55) return 'text-orange-400';
  return 'text-white/50';
};

const getScoreRing = (score: number) => {
  if (score >= 85) return 'ring-emerald-500/40';
  if (score >= 70) return 'ring-amber-500/40';
  if (score >= 55) return 'ring-orange-500/40';
  return 'ring-white/20';
};

const getScoreLabel = (score: number) => {
  if (score >= 85) return 'Viral';
  if (score >= 70) return 'Bom';
  if (score >= 55) return 'Medio';
  return 'Baixo';
};

const getGradeColor = (score: number) => {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 75) return 'text-blue-400';
  if (score >= 65) return 'text-amber-400';
  return 'text-white/40';
};

const getGrade = (score: number) => {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  return 'C';
};

const PlatformIcon = ({ platform, className = 'w-4 h-4' }: { platform: string; className?: string }) => {
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
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType | null>(null);

  useEffect(() => {
    setAspectRatio(null);
  }, [currentIndex]);

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

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'Escape') { e.preventDefault(); onOpenChange(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, goPrev, goNext, onOpenChange]);

  if (!clip || !viralIntel) return null;

  const bestPlatform = viralIntel.platformPredictions.find(
    (p) => p.platform === viralIntel.recommendedPlatform
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[920px] w-[95vw] p-0 overflow-hidden bg-[#0c0c14] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 gap-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white/90">
              #{currentIndex + 1}
            </span>
            <h2 className="text-sm font-medium text-white/80 truncate max-w-[400px]">
              {clip.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/30 mr-1">
              {currentIndex + 1} de {clips.length}
            </span>
            <button
              onClick={() => onOpenChange(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-col md:flex-row items-start">
          {/* Video section */}
          <div className="relative flex-shrink-0 rounded-bl-2xl overflow-hidden bg-black"
            style={{
              width: aspectRatio === 'landscape' ? 520 : aspectRatio === 'square' ? 380 : 300,
              aspectRatio: aspectRatio === 'landscape' ? '16/9' : aspectRatio === 'square' ? '1/1' : '9/16',
              maxHeight: '70vh',
              transition: 'width 0.3s ease',
            }}
          >
            <div className="relative w-full h-full">
              {(clip.previewUrl || clip.downloadUrl) ? (
                <Player
                  url={clip.previewUrl || clip.downloadUrl || ''}
                  poster={clip.thumbnailUrl}
                  className="w-full h-full"
                  onAspectRatioDetected={(ratio) => setAspectRatio(ratio)}
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full">
                  <p className="text-white/40 text-sm">Video indisponivel</p>
                </div>
              )}

              {/* Navigation arrows */}
              {hasPrev && (
                <button
                  onClick={goPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {hasNext && (
                <button
                  onClick={goNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Info panel */}
          <div className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight: '70vh' }}>
            <div className="p-5 space-y-5">

              {/* Score + Quick metrics row */}
              <div className="flex items-start gap-4">
                {/* Score ring */}
                <div className={cn(
                  'flex-shrink-0 w-16 h-16 rounded-2xl ring-2 flex flex-col items-center justify-center bg-white/[0.04]',
                  getScoreRing(viralIntel.overallScore)
                )}>
                  <span className={cn('text-2xl font-black leading-none', getScoreColor(viralIntel.overallScore))}>
                    {viralIntel.overallScore}
                  </span>
                  <span className={cn('text-[9px] font-bold uppercase tracking-wider mt-0.5', getScoreColor(viralIntel.overallScore))}>
                    {getScoreLabel(viralIntel.overallScore)}
                  </span>
                </div>

                {/* Quick metrics */}
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider">Hook</span>
                    <span className={cn('block text-base font-bold', getGradeColor(viralIntel.contentAnalysis.audienceRetention))}>
                      {getGrade(viralIntel.contentAnalysis.audienceRetention)}
                    </span>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider">Ritmo</span>
                    <span className="block text-base font-bold text-white/80 capitalize">
                      {viralIntel.contentAnalysis.pacing}
                    </span>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider">Emocao</span>
                    <span className="block text-base font-bold text-white/80 capitalize">
                      {viralIntel.contentAnalysis.emotion}
                    </span>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider">Duracao</span>
                    <span className="block text-base font-bold text-white/80">
                      {formatDuration(clip.duration)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-[13px] text-white/50 leading-relaxed line-clamp-2">
                {clip.description}
              </p>

              {/* Platform scores — compact row */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <TrendingUp className="w-3.5 h-3.5 text-white/30" />
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Plataformas</span>
                </div>
                <div className="space-y-1.5">
                  {viralIntel.platformPredictions.map((pred) => {
                    const isBest = pred.platform === viralIntel.recommendedPlatform;
                    return (
                      <div
                        key={pred.platform}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all',
                          isBest
                            ? 'bg-gradient-to-r from-purple-500/[0.12] to-blue-500/[0.08] border border-purple-500/20'
                            : 'bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.05]'
                        )}
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center',
                          isBest ? 'bg-purple-500/20 text-purple-300' : 'bg-white/[0.06] text-white/40'
                        )}>
                          <PlatformIcon platform={pred.platform} className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white/90 capitalize">{pred.platform}</span>
                            {isBest && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded">
                                Melhor
                              </span>
                            )}
                          </div>
                          {pred.bestPostingTime && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Clock className="w-2.5 h-2.5 text-white/20" />
                              <span className="text-[10px] text-white/30">{pred.bestPostingTime}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <span className={cn(
                            'text-xl font-black',
                            pred.viralScore >= 80 ? 'text-emerald-400' :
                            pred.viralScore >= 65 ? 'text-amber-400' : 'text-white/40'
                          )}>
                            {pred.viralScore}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Insights — compact */}
              {viralIntel.insights.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Zap className="w-3.5 h-3.5 text-white/30" />
                    <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Insights</span>
                  </div>
                  <div className="space-y-1.5">
                    {viralIntel.insights.slice(0, 3).map((insight, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]"
                      >
                        <span className="text-sm mt-0.5">{insight.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[12px] font-medium text-white/70">{insight.title}</span>
                          {insight.actionable && (
                            <span className="text-[11px] text-purple-300/70 block mt-0.5">{insight.actionable}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hashtags */}
              {clip.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {clip.hashtags.map((tag, i) => (
                    <button
                      key={i}
                      onClick={() => handleCopy(`#${tag}`, 'Hashtag')}
                      className="text-[11px] px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-colors"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={goPrev}
              disabled={!hasPrev}
              className="h-8 px-2.5 text-white/40 hover:text-white disabled:opacity-20"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-[11px] text-white/25 min-w-[60px] text-center">
              Setas ←→
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={goNext}
              disabled={!hasNext}
              className="h-8 px-2.5 text-white/40 hover:text-white disabled:opacity-20"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(clip.title, 'Titulo')}
              className="h-8 gap-1.5 text-[12px] text-white/40 hover:text-white"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar titulo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(clip.downloadUrl || '', 'Link')}
              className="h-8 gap-1.5 text-[12px] text-white/40 hover:text-white"
            >
              <Share2 className="w-3.5 h-3.5" />
              Compartilhar
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={!canPerformActions || isDownloading}
              className="h-8 gap-1.5 text-[12px] bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 border-0 text-white font-semibold"
            >
              {isDownloading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Baixar HD
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
