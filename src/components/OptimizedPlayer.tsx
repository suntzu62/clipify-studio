import { Card } from '@/components/ui/card';
import { Play, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { memo } from 'react';

interface OptimizedPlayerProps {
  url: string;
  title?: string;
  className?: string;
}

export const OptimizedPlayer = memo(({ url, title, className }: OptimizedPlayerProps) => {
  const handleOpenVideo = () => {
    window.open(url, '_blank');
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="relative bg-gradient-to-br from-black to-gray-800 h-[300px] flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mb-4 mx-auto hover:bg-primary-hover transition-colors cursor-pointer group">
            <Play className="w-10 h-10 text-primary-foreground ml-1 group-hover:scale-110 transition-transform" />
          </div>
          
          <h3 className="text-lg font-semibold mb-2">
            {title || 'Preview do Clipe'}
          </h3>
          
          <p className="text-gray-300 mb-4 text-sm">
            Clique para visualizar o vídeo
          </p>
          
          <Button 
            onClick={handleOpenVideo}
            variant="outline" 
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Abrir Vídeo
          </Button>
        </div>
        
        {/* Decorative gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />
      </div>
    </Card>
  );
});

OptimizedPlayer.displayName = 'OptimizedPlayer';