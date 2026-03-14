import { memo, useMemo, useState } from 'react';

interface OptimizedPlayerProps {
  url: string;
  title?: string;
  className?: string;
  playing?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  poster?: string;
}

const OptimizedPlayer = memo(({
  url,
  title,
  className,
  playing = false,
  loop = false,
  muted = false,
  controls = true,
  poster,
}: OptimizedPlayerProps) => {
  const [hasError, setHasError] = useState(false);
  const videoUrl = useMemo(() => url?.trim() || '', [url]);

  if (!videoUrl) {
    return (
      <div className={`overflow-hidden ${className}`}>
        <div className="relative bg-gradient-to-br from-red-500/20 to-red-700/20 h-[300px] flex items-center justify-center">
          <div className="text-center text-white">
            <p className="text-lg font-semibold mb-2">URL do vídeo não encontrada</p>
            <p className="text-sm text-gray-300">Entre em contato com o suporte</p>
          </div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className={`overflow-hidden ${className}`}>
        <div className="relative bg-gradient-to-br from-zinc-800 to-zinc-900 h-full flex items-center justify-center">
          <div className="text-center text-white px-6">
            <p className="text-lg font-semibold mb-2">Não foi possível reproduzir este clipe</p>
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline underline-offset-4"
            >
              Abrir vídeo diretamente
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full overflow-hidden ${className}`}>
      <div className="relative w-full h-full bg-black video-player-container">
        <video
          key={videoUrl}
          src={videoUrl}
          poster={poster}
          controls={controls}
          autoPlay={playing}
          loop={loop}
          muted={muted}
          playsInline
          crossOrigin="anonymous"
          preload="metadata"
          className="w-full h-full video-enhanced-controls object-contain"
          onError={(e) => {
            setHasError(true);
            console.error('[OptimizedPlayer] Video load error:', {
              url: videoUrl,
              error: e,
              currentTarget: e.currentTarget,
              networkState: e.currentTarget.networkState,
              readyState: e.currentTarget.readyState,
            });
          }}
          onLoadStart={() => {
            setHasError(false);
            console.log('[OptimizedPlayer] Video load started:', videoUrl);
          }}
          onLoadedData={() => console.log('[OptimizedPlayer] Video data loaded:', videoUrl)}
        >
          Seu navegador não suporta reprodução de vídeo.
        </video>

        <style>{`
          /* Remover qualquer overlay ou escurecimento no hover */
          .video-player-container::before,
          .video-player-container::after {
            display: none !important;
          }

          .video-enhanced-controls::before,
          .video-enhanced-controls::after {
            display: none !important;
          }

          /* Desabilitar qualquer efeito de hover no container e no vídeo */
          .video-player-container:hover::before,
          .video-player-container:hover::after,
          .video-enhanced-controls:hover::before,
          .video-enhanced-controls:hover::after {
            display: none !important;
            opacity: 0 !important;
          }

          .video-enhanced-controls,
          .video-player-container video {
            filter: none !important;
            backdrop-filter: none !important;
            -webkit-filter: none !important;
          }

          /* Controles do player mais discretos e transparentes */
          .video-enhanced-controls::-webkit-media-controls-panel {
            background: linear-gradient(to top, rgba(0,0,0,0.4), transparent) !important;
            height: 35px !important;
          }

          .video-enhanced-controls::-moz-media-control-panel {
            background: linear-gradient(to top, rgba(0,0,0,0.4), transparent) !important;
            height: 35px !important;
          }

          /* Reduzir altura dos controles nativos */
          .video-enhanced-controls::-webkit-media-controls-enclosure {
            height: 35px !important;
            bottom: 0 !important;
          }

          .video-enhanced-controls::-webkit-media-controls {
            height: 35px !important;
          }

        `}</style>
      </div>
    </div>
  );
});

OptimizedPlayer.displayName = 'OptimizedPlayer';

export { OptimizedPlayer };
export default OptimizedPlayer;
