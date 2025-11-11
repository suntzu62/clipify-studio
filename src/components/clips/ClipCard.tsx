import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Download, Upload, Copy, FileText, Hash, Play, Sparkles, Loader } from 'lucide-react';
import { Clip } from '@/hooks/useClipList';
import { Player } from '@/components/Player';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ClipCardProps {
  clip: Clip;
  index: number;
}

export const ClipCard = ({ clip, index }: ClipCardProps) => {
  const [showPlayer, setShowPlayer] = useState(false);
  const { toast } = useToast();

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

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: `${type} copiado!`,
        description: "Colado na área de transferência ✨"
      });
    } catch (err) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o texto",
        variant: "destructive"
      });
    }
  };

  const handleDownload = () => {
    if (clip.downloadUrl) {
      window.open(clip.downloadUrl, '_blank');
    } else {
      toast({
        title: "Download indisponível",
        description: "O arquivo ainda está sendo processado",
        variant: "destructive"
      });
    }
  };

  const handleYouTubeExport = () => {
    toast({
      title: "Exportação iniciada! 🚀",
      description: "Seu clipe está sendo enviado para o YouTube"
    });
  };

  const handleTikTokExport = () => {
    toast({
      title: "Em breve no TikTok! 🎵",
      description: "Integração com TikTok em desenvolvimento"
    });
  };

  if (clip.status === 'processing') {
    return (
      <Card className="overflow-hidden bg-gradient-card border-2 border-dashed border-primary/20">
        <CardContent className="p-0">
          <AspectRatio ratio={9/16} className="bg-gradient-to-br from-primary/10 to-primary/5">
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                <Loader className="w-8 h-8 text-primary animate-spin" />
              </div>
              <h3 className="font-semibold text-sm mb-2">Clipe {index + 1}</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Criando algo incrível...
              </p>
              <div className="flex items-center gap-1 text-xs text-primary">
                <Sparkles className="w-3 h-3" />
                <span>Em processamento</span>
              </div>
            </div>
          </AspectRatio>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
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
            
            {/* Primary action button */}
            <Button
              variant="default"
              size="sm"
              onClick={handleDownload}
              className="w-full text-xs gap-1"
            >
              <Download className="w-3 h-3" />
              Baixar Vídeo
            </Button>

            {/* Export buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleYouTubeExport}
                className="text-xs gap-1"
              >
                <Upload className="w-3 h-3" />
                YouTube
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleTikTokExport}
                className="text-xs gap-1"
              >
                <Upload className="w-3 h-3" />
                TikTok
              </Button>
            </div>
            
            {/* Copy actions */}
            <div className="grid grid-cols-3 gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => copyToClipboard(clip.title, 'Título')}
                className="text-xs gap-1 h-8"
              >
                <Copy className="w-3 h-3" />
                Título
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => copyToClipboard(clip.description, 'Descrição')}
                className="text-xs gap-1 h-8"
              >
                <FileText className="w-3 h-3" />
                Desc
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => copyToClipboard(clip.hashtags.map(t => `#${t}`).join(' '), 'Hashtags')}
                className="text-xs gap-1 h-8"
              >
                <Hash className="w-3 h-3" />
                Tags
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Player Modal */}
      <Dialog open={showPlayer} onOpenChange={setShowPlayer}>
        <DialogContent className="max-w-md" aria-describedby="player-description">
          <DialogHeader>
            <DialogTitle className="text-lg">{clip.title}</DialogTitle>
          </DialogHeader>
          <div id="player-description" className="sr-only">
            Reproduzindo vídeo: {clip.title}. {clip.description}
          </div>
          <AspectRatio ratio={9/16}>
            {clip.previewUrl ? (
              <Player url={clip.previewUrl} title={clip.title} />
            ) : clip.downloadUrl ? (
              <Player url={clip.downloadUrl} title={clip.title} />
            ) : (
              <div className="flex items-center justify-center h-full bg-gradient-to-br from-primary/10 to-primary/5">
                <p className="text-sm text-muted-foreground">Vídeo não disponível</p>
              </div>
            )}
          </AspectRatio>
        </DialogContent>
      </Dialog>
    </>
  );
};