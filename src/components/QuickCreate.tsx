import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Zap, Loader2, CheckCircle2, XCircle, Sparkles, Captions, Scissors, Upload as UploadIcon, TrendingUp } from 'lucide-react';
import { isValidYouTubeUrl, normalizeYoutubeUrl } from '@/lib/youtube';
import { createTempConfig, startJobFromTempConfig, type Job } from '@/lib/jobs-api';
import { saveUserJob } from '@/lib/storage';
import { FileUploadZone } from '@/components/FileUploadZone';
import {
  DEFAULT_CLIP_SETTINGS,
  DEFAULT_SUBTITLE_PREFERENCES,
  type ClipSettings,
  type SubtitlePreferences,
} from '@/types/project-config';

interface QuickCreateProps {
  userId: string;
  getToken: () => Promise<string | null>;
  onProjectCreated?: (tempId: string) => void;
  variant?: 'full' | 'compact';
}

export const QuickCreate = ({ userId, getToken, onProjectCreated, variant = 'full' }: QuickCreateProps) => {
  const isCompact = variant === 'compact';
  const isOneClickAvailable = Boolean(import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_API_KEY);

  const [url, setUrl] = useState('');
  const [objective, setObjective] = useState('');
  const [targetDuration, setTargetDuration] = useState<30 | 60 | 90>(30);
  const [subtitleStyle, setSubtitleStyle] = useState<'viral' | 'clean'>('viral');
  const [oneClickMode, setOneClickMode] = useState(isOneClickAvailable);
  const [showQuickOptions, setShowQuickOptions] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const effectiveOneClickMode = isCompact ? isOneClickAvailable : oneClickMode;

  const getClipSettingsByDuration = (duration: 30 | 60 | 90): ClipSettings => {
    if (duration === 30) {
      return {
        ...DEFAULT_CLIP_SETTINGS,
        targetDuration: 30,
        minDuration: 15,
        maxDuration: 60,
        clipCount: 30,
        model: 'Fast',
      };
    }

    if (duration === 90) {
      return {
        ...DEFAULT_CLIP_SETTINGS,
        targetDuration: 90,
        minDuration: 45,
        maxDuration: 120,
        clipCount: 18,
        model: 'ClipAnything',
      };
    }

    return {
      ...DEFAULT_CLIP_SETTINGS,
      targetDuration: 60,
      minDuration: 20,
      maxDuration: 60,
      clipCount: 30,
      model: 'ClipAnything',
    };
  };

  const getSubtitlePreferencesByStyle = (style: 'viral' | 'clean'): SubtitlePreferences => {
    if (style === 'clean') {
      return {
        ...DEFAULT_SUBTITLE_PREFERENCES,
        format: 'single-line',
        font: 'Inter',
        fontSize: 30,
        outline: false,
        backgroundOpacity: 0.55,
      };
    }

    return {
      ...DEFAULT_SUBTITLE_PREFERENCES,
      format: 'multi-line',
      font: 'Montserrat',
      fontSize: 34,
      outline: true,
      backgroundOpacity: 0.86,
      shadow: true,
    };
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    
    if (!value.trim()) {
      setIsValid(null);
      return;
    }

    // Validação em tempo real com debounce
    setIsValidating(true);
    const timer = setTimeout(() => {
      const valid = isValidYouTubeUrl(value);
      setIsValid(valid);
      setIsValidating(false);
    }, 300);

    return () => clearTimeout(timer);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      toast({
        title: "URL obrigatória",
        description: "Cole o link do YouTube para começar",
        variant: "destructive"
      });
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      toast({
        title: "❌ Link inválido",
        description: "Insira um link válido do YouTube (youtube.com/watch ou youtu.be)",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const normalizedUrl = normalizeYoutubeUrl(url);
      const { tempId } = await createTempConfig(normalizedUrl, getToken, userId);

      const shouldUseOneClick = effectiveOneClickMode && isOneClickAvailable;

      if (shouldUseOneClick) {
        const clipSettings = getClipSettingsByDuration(targetDuration);
        const subtitlePreferences = getSubtitlePreferencesByStyle(subtitleStyle);

        const { jobId } = await startJobFromTempConfig(
          tempId,
          {
            clipSettings,
            subtitlePreferences,
            specificMoments: objective.trim() || undefined,
          },
          getToken
        );

        const queuedJob: Job = {
          id: jobId,
          youtubeUrl: normalizedUrl,
          status: 'queued',
          progress: 0,
          createdAt: new Date().toISOString(),
          neededMinutes: 10,
        };

        saveUserJob(userId, queuedJob);

        toast({
          title: "🚀 Processamento iniciado",
          description: "Seu vídeo entrou na fila com score de viralidade e configuração rápida.",
        });

        // Resetar form após iniciar
        setUrl('');
        setObjective('');
        setIsValid(null);

        navigate(`/projects/${jobId}`);
        return;
      }

      toast({
        title: "✨ Link validado com sucesso!",
        description: isOneClickAvailable
          ? "Agora personalize suas configurações antes de processar."
          : "Modo 1 clique indisponível nesse ambiente. Abrindo configuração completa.",
      });

      // Resetar form
      setUrl('');
      setIsValid(null);

      // Callback ou navegação para a página de configuração
      if (onProjectCreated) {
        onProjectCreated(tempId);
      }
      // Sempre navegar para a página de configuração
      navigate(`/projects/configure/${tempId}`);
    } catch (error: unknown) {
      console.error('Error creating project:', error);

      const errorMsg = error instanceof Error ? error.message : '';
      
      if (errorMsg.includes('quota') || errorMsg.includes('rate limit') || errorMsg.includes('429')) {
        toast({
          title: "⏰ Limite atingido",
          description: "Você atingiu o limite de 10 projetos/hora. Tente em alguns minutos.",
          variant: "destructive"
        });
      } else if (errorMsg.includes('invalid') || errorMsg.includes('URL')) {
        toast({
          title: "❌ Link inválido",
          description: "Verifique se o link é de um vídeo público do YouTube.",
          variant: "destructive"
        });
      } else if (errorMsg.includes('private') || errorMsg.includes('authentication')) {
        toast({
          title: "🔒 Vídeo privado",
          description: "Este vídeo é privado ou requer login. Use apenas vídeos públicos.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "⚠️ Erro ao criar projeto",
          description: errorMsg || "Tente novamente em alguns instantes.",
          variant: "destructive"
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInputClassName = () => {
    const base = "h-14 text-base pr-10 transition-all";
    if (isValidating) return `${base} border-muted`;
    if (isValid === true) return `${base} border-green-500 focus-visible:ring-green-500`;
    if (isValid === false) return `${base} border-destructive focus-visible:ring-destructive`;
    return base;
  };

  if (isCompact) {
    return (
      <div className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="relative flex-1">
              <Input
                id="youtube-url-compact"
                type="url"
                placeholder="Cole o link do YouTube"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                disabled={isSubmitting}
                className={`h-12 text-sm pr-10 ${isValid === true ? 'border-green-500' : ''} ${isValid === false ? 'border-destructive' : ''}`}
                aria-label="Link do YouTube"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isValidating && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                )}
                {!isValidating && isValid === true && (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                )}
                {!isValidating && isValid === false && (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
              </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                type="submit"
                disabled={isSubmitting || isValid === false}
                className="h-12 flex-1 sm:flex-none sm:min-w-[170px] gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {effectiveOneClickMode ? 'Gerando...' : 'Validando...'}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    {effectiveOneClickMode ? 'Gerar em 1 clique' : 'Configurar'}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12"
                onClick={() => setShowQuickOptions((prev) => !prev)}
              >
                {showQuickOptions ? 'Ocultar ajustes' : 'Ajustes rápidos'}
              </Button>
            </div>
          </div>

          {showQuickOptions && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Duração alvo</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[30, 60, 90].map((duration) => (
                    <Button
                      key={`compact-${duration}`}
                      type="button"
                      size="sm"
                      variant={targetDuration === duration ? 'default' : 'outline'}
                      className="h-8 text-xs"
                      onClick={() => setTargetDuration(duration as 30 | 60 | 90)}
                      disabled={isSubmitting}
                      aria-label={`Duração alvo: ${duration} segundos`}
                      aria-pressed={targetDuration === duration}
                    >
                      {duration}s
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Legenda</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={subtitleStyle === 'viral' ? 'default' : 'outline'}
                    className="h-8 text-xs"
                    onClick={() => setSubtitleStyle('viral')}
                    disabled={isSubmitting}
                  >
                    Viral
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={subtitleStyle === 'clean' ? 'default' : 'outline'}
                    className="h-8 text-xs"
                    onClick={() => setSubtitleStyle('clean')}
                    disabled={isSubmitting}
                  >
                    Clean
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isValid === false && (
            <p className="text-xs text-destructive">
              Insira um link válido do YouTube (youtube.com/watch ou youtu.be)
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <Card className="border-2 border-primary/20 shadow-lg bg-gradient-to-br from-background to-accent/5">
      <CardContent className="pt-6 pb-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="text-2xl font-bold text-foreground">Criar novo projeto</h3>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Cole o link, defina objetivo rápido (legendas + duração) e gere clipes com score viral em poucos cliques
          </p>
        </div>

        <div className="rounded-xl border border-primary/20 bg-accent/20 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Modo 1 clique</p>
              <p className="text-xs text-muted-foreground">
                Envia direto para processamento sem abrir a tela avançada
              </p>
            </div>
            <Switch
              checked={oneClickMode}
              onCheckedChange={setOneClickMode}
              disabled={isSubmitting || !isOneClickAvailable}
              aria-label="Ativar modo 1 clique"
            />
          </div>

          {!isOneClickAvailable && (
            <p className="text-xs text-muted-foreground">
              No ambiente atual, o fluxo abre a configuração completa antes de processar.
            </p>
          )}

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Duração alvo</Label>
            <div className="grid grid-cols-3 gap-2">
              {[30, 60, 90].map((duration) => (
                <Button
                  key={duration}
                  type="button"
                  size="sm"
                  variant={targetDuration === duration ? 'default' : 'outline'}
                  className="h-9"
                  onClick={() => setTargetDuration(duration as 30 | 60 | 90)}
                  disabled={isSubmitting}
                >
                  {duration}s
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Legendas</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={subtitleStyle === 'viral' ? 'default' : 'outline'}
                className="h-9"
                onClick={() => setSubtitleStyle('viral')}
                disabled={isSubmitting}
              >
                Viral Boost
              </Button>
              <Button
                type="button"
                size="sm"
                variant={subtitleStyle === 'clean' ? 'default' : 'outline'}
                className="h-9"
                onClick={() => setSubtitleStyle('clean')}
                disabled={isSubmitting}
              >
                Clean Glass
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="objective-input" className="text-xs uppercase tracking-wide text-muted-foreground">
              Objetivo do corte (opcional)
            </Label>
            <Input
              id="objective-input"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              disabled={isSubmitting}
              placeholder="Ex: priorizar momentos emocionantes com CTA forte"
              className="h-10 text-sm"
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Input 
                id="youtube-url"
                type="url"
                placeholder="Cole o link do YouTube (≥10 min) ou arraste seu arquivo"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                disabled={isSubmitting}
                className={getInputClassName()}
                aria-label="Link do YouTube"
                aria-invalid={isValid === false}
                aria-describedby={isValid === false ? "url-error" : "url-help"}
              />
              {/* Ícone de validação */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isValidating && (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                )}
                {!isValidating && isValid === true && (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                )}
                {!isValidating && isValid === false && (
                  <XCircle className="w-5 h-5 text-destructive" />
                )}
              </div>
            </div>
            
            <Button 
              type="submit" 
              size="lg"
              disabled={isSubmitting || isValid === false}
              className="h-14 px-8 gap-2 font-semibold whitespace-nowrap"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {effectiveOneClickMode ? 'Gerando...' : 'Validando...'}
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  {effectiveOneClickMode ? 'Gerar em 1 Clique' : 'Configurar Clipes'}
                </>
              )}
            </Button>
          </div>

          {/* Mensagens de ajuda/erro */}
          {isValid === false && (
            <p id="url-error" className="text-sm text-destructive flex items-center gap-2" role="alert">
              <XCircle className="w-4 h-4" />
              Insira um link válido do YouTube (youtube.com/watch ou youtu.be)
            </p>
          )}
          {!isValid && !url && (
            <p id="url-help" className="text-xs text-muted-foreground text-center">
              Exemplo: https://youtube.com/watch?v=dQw4w9WgXcQ
            </p>
          )}
        </form>
        
        {/* Badges de features */}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
            <Captions className="w-3.5 h-3.5" />
            Legendas queimadas
          </Badge>
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
            <TrendingUp className="w-3.5 h-3.5" />
            Score viral
          </Badge>
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
            <Scissors className="w-3.5 h-3.5" />
            Cortes inteligentes
          </Badge>
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
            <UploadIcon className="w-3.5 h-3.5" />
            Exportação direta
          </Badge>
        </div>

        {/* Separador */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              ou faça upload direto
            </span>
          </div>
        </div>

        {/* Upload Zone */}
        <FileUploadZone
          className="border-primary/20"
          onUploadSuccess={(jobId) => {
            toast({
              title: "Upload concluído! ✨",
              description: "Redirecionando para o projeto..."
            });
          }}
        />
      </CardContent>
    </Card>
  );
};
