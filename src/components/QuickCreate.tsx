import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Zap, Loader2, CheckCircle2, XCircle, Sparkles, Captions, Scissors, Upload as UploadIcon } from 'lucide-react';
import { isValidYouTubeUrl, normalizeYoutubeUrl } from '@/lib/youtube';
import { createTempConfig } from '@/lib/jobs-api';

interface QuickCreateProps {
  userId: string;
  getToken: () => Promise<string | null>;
  onProjectCreated?: (tempId: string) => void;
}

export const QuickCreate = ({ userId, getToken, onProjectCreated }: QuickCreateProps) => {
  const [url, setUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

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
      const { tempId } = await createTempConfig(normalizedUrl, getToken);

      toast({
        title: "✨ Link validado com sucesso!",
        description: "Agora personalize suas configurações antes de processar.",
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
    } catch (error: any) {
      console.error('Error creating project:', error);
      
      const errorMsg = error.message || '';
      
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

  return (
    <Card className="border-2 border-primary/20 shadow-lg bg-gradient-to-br from-background to-accent/5">
      <CardContent className="pt-6 pb-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="text-2xl font-bold text-foreground">Criar novo projeto</h3>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Cole o link do YouTube e configure legendas, duração e estilo antes de gerar seus clipes
          </p>
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
                  Validando...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Configurar Clipes
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
            <Scissors className="w-3.5 h-3.5" />
            Cortes inteligentes
          </Badge>
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
            <UploadIcon className="w-3.5 h-3.5" />
            Exportação direta
          </Badge>
        </div>

        {/* Drag & Drop Placeholder (futuro) */}
        <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
          <UploadIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Ou arraste um arquivo de vídeo aqui</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Upload em breve!</p>
        </div>
      </CardContent>
    </Card>
  );
};
