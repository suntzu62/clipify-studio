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
