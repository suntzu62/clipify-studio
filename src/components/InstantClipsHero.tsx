import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Play, Clock, Zap, Sparkles } from 'lucide-react';
import { getInstantClips, enhanceClips, type InstantClip } from '@/lib/instant-clips-api';
import { useAuth } from '@clerk/clerk-react';

export function InstantClipsHero() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [clips, setClips] = useState<InstantClip[]>([]);
  const [processingInfo, setProcessingInfo] = useState<{
    source: string;
    time: number;
  } | null>(null);
  const { getToken } = useAuth();

  const handleGenerate = async () => {
    if (!url.trim()) {
      toast.error('Por favor, insira um URL do YouTube');
      return;
    }

    setLoading(true);
    setClips([]);
    setProcessingInfo(null);

    try {
      const startTime = Date.now();
      const result = await getInstantClips(url, getToken);
      const totalTime = Date.now() - startTime;

      setClips(result.clips);
      setProcessingInfo({
        source: result.source,
        time: totalTime,
      });

      // Success message based on source
      const sourceMessages = {
        cache: '⚡ Clips carregados do cache em tempo recorde!',
        similar: '🎯 Clips gerados com base em vídeos similares!',
        generic: '🚀 Clips criados com templates inteligentes!',
        partial: '⚙️ Processamento parcial concluído!',
      };

      toast.success(sourceMessages[result.source] || 'Clips gerados com sucesso!');

      // Start background enhancement for better results
      if (result.source !== 'cache') {
        enhanceClips(url, result.clips, getToken);
        toast.info('Refinando clips em segundo plano para melhores resultados...', { duration: 3000 });
      }

    } catch (error) {
      console.error('Error generating instant clips:', error);
      toast.error('Erro ao gerar clips. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'cache': return <Zap className="h-4 w-4" />;
      case 'similar': return <Sparkles className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'cache': return 'Cache Hit';
      case 'similar': return 'Vídeos Similares';
      case 'generic': return 'Template Inteligente';
      default: return 'Processado';
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary font-medium">
          <Zap className="h-4 w-4" />
          ULTRA-VELOCIDADE: Clips em 2 segundos
        </div>
        
        <h1 className="text-4xl md:text-6xl font-bold text-foreground">
          Clips <span className="text-primary">Instantâneos</span>
        </h1>
        
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Revolucionário sistema de IA que gera clips virais em segundos, não minutos. 
          Deixe a concorrência para trás com nossa tecnologia de ponta.
        </p>

        {/* Input Section */}
        <div className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto">
          <Input
            type="url"
            placeholder="Cole o URL do YouTube aqui..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 h-12 text-base"
          />
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="h-12 px-8 font-semibold"
            size="lg"
          >
            {loading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                Gerando...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Gerar Clips
              </>
            )}
          </Button>
        </div>

        {/* Processing Info */}
        {processingInfo && (
          <div className="flex items-center justify-center gap-4 text-sm">
            <Badge variant="secondary" className="flex items-center gap-1">
              {getSourceIcon(processingInfo.source)}
              {getSourceLabel(processingInfo.source)}
            </Badge>
            <Badge variant="outline">
              <Clock className="h-3 w-3 mr-1" />
              {processingInfo.time}ms
            </Badge>
          </div>
        )}
      </div>

      {/* Clips Results */}
      {clips.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center">
            Seus Clips Virais Estão Prontos! 🎉
          </h2>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {clips.map((clip, index) => (
              <Card key={clip.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg line-clamp-2">
                      {clip.title}
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs whitespace-nowrap">
                      {Math.round(clip.score * 100)}% viral
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {clip.description}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Timing Info */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Play className="h-3 w-3" />
                      {formatTime(clip.startTime)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {clip.duration}s
                    </div>
                  </div>

                  {/* Hashtags */}
                  <div className="flex flex-wrap gap-1">
                    {clip.hashtags.map((tag, tagIndex) => (
                      <Badge key={tagIndex} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {/* Action Button */}
                  <Button variant="outline" className="w-full" size="sm">
                    <Play className="h-3 w-3 mr-1" />
                    Gerar Clip
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Speed Comparison */}
      <div className="bg-muted/50 rounded-lg p-6 text-center space-y-4">
        <h3 className="text-lg font-semibold">🏆 Velocidade Competitiva</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div className="space-y-1">
            <div className="font-medium text-primary">Cortaí Instant</div>
            <div className="text-2xl font-bold text-primary">2s</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-muted-foreground">OpusClip</div>
            <div className="text-2xl font-bold text-muted-foreground">15min</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-muted-foreground">Descript</div>
            <div className="text-2xl font-bold text-muted-foreground">12min</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-muted-foreground">Kapwing</div>
            <div className="text-2xl font-bold text-muted-foreground">8min</div>
          </div>
        </div>
      </div>
    </div>
  );
}