import { Card } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { memo } from 'react';

interface OptimizedPlayerProps {
  url: string;
  title?: string;
  className?: string;
  playing?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
}

const OptimizedPlayer = memo(({ url, title, className, playing = false, loop = false, muted = false, controls = true }: OptimizedPlayerProps) => {
  const handleOpenVideo = () => {
    window.open(url, '_blank');
  };

  // Debug: Log when player is rendered
  console.log('[OptimizedPlayer] Rendering with:', { url, title, hasUrl: !!url });

  // Test URL accessibility
  if (url) {
    fetch(url, { method: 'HEAD' })
      .then(response => {
        console.log('[OptimizedPlayer] URL accessibility test:', {
          url,
          status: response.status,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
        });
      })
      .catch(error => {
        console.error('[OptimizedPlayer] URL fetch test failed:', { url, error });
      });
  }

  if (!url) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <div className="relative bg-gradient-to-br from-red-500/20 to-red-700/20 h-[300px] flex items-center justify-center">
          <div className="text-center text-white">
            <p className="text-lg font-semibold mb-2">URL do vídeo não encontrada</p>
            <p className="text-sm text-gray-300">Entre em contato com o suporte</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="relative bg-black">
        {/* HTML5 Video Player */}
        <video
          src={url}
          controls={controls}
          autoPlay={playing}
          loop={loop}
          muted={muted}
          playsInline
          className="w-full h-full"
          style={{ maxHeight: '80vh' }}
          onError={(e) => {
            console.error('[OptimizedPlayer] Video load error:', {
              url,
              error: e,
              currentTarget: e.currentTarget,
              networkState: e.currentTarget.networkState,
              readyState: e.currentTarget.readyState,
            });
          }}
          onLoadStart={() => console.log('[OptimizedPlayer] Video load started:', url)}
          onLoadedData={() => console.log('[OptimizedPlayer] Video data loaded:', url)}
        >
          Seu navegador não suporta reprodução de vídeo.
        </video>

        {/* External link button */}
        <div className="absolute top-2 right-2">
          <Button
            onClick={handleOpenVideo}
            size="sm"
            variant="secondary"
            className="bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
});

OptimizedPlayer.displayName = 'OptimizedPlayer';

export { OptimizedPlayer };
export default OptimizedPlayer;
