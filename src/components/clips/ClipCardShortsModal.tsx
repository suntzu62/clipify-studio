import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, MessageCircle, Share2, Repeat2, Download, Volume2, Play, X } from 'lucide-react';
import { Clip } from '@/hooks/useClipList';
import { Player } from '@/components/Player';

interface ClipShortsModalProps {
  clip: Clip;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void;
  onPublish: (platform: string) => void;
  isDownloading: boolean;
  canPerformActions: boolean;
}

export const ClipShortsModal = ({
  clip,
  open,
  onOpenChange,
  onDownload,
  onPublish,
  isDownloading,
  canPerformActions,
}: ClipShortsModalProps) => {
  const [likes, setLikes] = useState(6200);
  const [liked, setLiked] = useState(false);
  const [comments] = useState(38);

  const handleLike = () => {
    if (liked) {
      setLikes(likes - 1);
      setLiked(false);
    } else {
      setLikes(likes + 1);
      setLiked(true);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-full max-h-screen w-screen h-screen p-0 m-0 bg-black border-0 rounded-none"
        aria-labelledby="shorts-title"
        aria-describedby="shorts-description"
      >
        {/* Container estilo YouTube Shorts - fundo preto contínuo */}
        <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">

          {/* Botão fechar (X) no topo esquerdo */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-6 left-6 z-50 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition-all"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Controles do topo (play + volume) - Estilo YouTube Shorts */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white transition-all"
              aria-label="Reproduzir/Pausar"
            >
              <Play className="h-6 w-6 fill-white" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white transition-all"
              aria-label="Volume"
            >
              <Volume2 className="h-6 h-6" />
            </Button>
          </div>

          {/* Player vertical 9:16 - TAMANHO AUMENTADO para melhor qualidade */}
          <div className="w-full h-full max-w-[min(75vh*9/16,700px)] mx-auto relative">
            <div className="absolute inset-0">
              {clip.previewUrl || clip.downloadUrl ? (
                <Player
                  url={clip.previewUrl || clip.downloadUrl || ''}
                  title={clip.title}
                  className="w-full h-full"
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-black">
                  <p className="text-white text-sm">Vídeo não disponível</p>
                </div>
              )}
            </div>

            {/* Texto grande "TOTA" centralizado no vídeo - igual referência */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <h1 className="text-white text-8xl font-black tracking-wider drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                TOTA
              </h1>
            </div>

            {/* Título do vídeo na parte inferior esquerda */}
            <div className="absolute bottom-20 left-4 right-24 z-30">
              <h2
                id="shorts-title"
                className="text-white text-base font-semibold mb-2 drop-shadow-lg line-clamp-2"
              >
                {clip.title}
              </h2>
              {clip.description && (
                <p
                  id="shorts-description"
                  className="text-white/90 text-sm drop-shadow-md line-clamp-1"
                >
                  {clip.description}
                </p>
              )}
            </div>

            {/* Botões laterais verticais - Estilo YouTube Shorts */}
            <div className="absolute right-4 bottom-20 z-30 flex flex-col items-center gap-5">

              {/* Like */}
              <button
                onClick={handleLike}
                className="flex flex-col items-center gap-1 group"
                aria-label="Curtir"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-all group-hover:scale-110">
                  <ThumbsUp
                    className={`w-6 h-6 transition-all ${
                      liked ? 'fill-white text-white' : 'text-white'
                    }`}
                  />
                </div>
                <span className="text-white text-xs font-medium drop-shadow-md">
                  {formatNumber(likes)}
                </span>
              </button>

              {/* Dislike */}
              <button
                className="flex flex-col items-center gap-1 group"
                aria-label="Não curtir"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-all group-hover:scale-110">
                  <ThumbsDown className="w-6 h-6 text-white" />
                </div>
                <span className="text-white text-xs font-medium drop-shadow-md">
                  Dislike
                </span>
              </button>

              {/* Comentários */}
              <button
                className="flex flex-col items-center gap-1 group"
                aria-label="Comentários"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-all group-hover:scale-110">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <span className="text-white text-xs font-medium drop-shadow-md">
                  {comments}
                </span>
              </button>

              {/* Compartilhar */}
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: clip.title,
                      text: clip.description,
                      url: window.location.href,
                    });
                  }
                }}
                className="flex flex-col items-center gap-1 group"
                aria-label="Compartilhar"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-all group-hover:scale-110">
                  <Share2 className="w-6 h-6 text-white" />
                </div>
                <span className="text-white text-xs font-medium drop-shadow-md">
                  Share
                </span>
              </button>

              {/* Remix */}
              <button
                onClick={() => onPublish('tiktok')}
                disabled={!canPerformActions}
                className="flex flex-col items-center gap-1 group"
                aria-label="Remix"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-all group-hover:scale-110 disabled:opacity-50">
                  <Repeat2 className="w-6 h-6 text-white" />
                </div>
                <span className="text-white text-xs font-medium drop-shadow-md">
                  Remix
                </span>
              </button>

              {/* Download */}
              <button
                onClick={onDownload}
                disabled={!canPerformActions || isDownloading}
                className="flex flex-col items-center gap-1 group"
                aria-label="Download"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-all group-hover:scale-110 disabled:opacity-50">
                  <Download className={`w-6 h-6 text-white ${isDownloading ? 'animate-bounce' : ''}`} />
                </div>
                <span className="text-white text-xs font-medium drop-shadow-md">
                  {isDownloading ? '...' : 'Download'}
                </span>
              </button>

            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};
