import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Video, Plus, AlertCircle, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: 'default' | 'error';
  error?: string;
}

export const EmptyState = ({ 
  title = "Nenhum projeto encontrado",
  description = "Cole um link do YouTube acima para criar seu primeiro projeto e começar a gerar clipes virais",
  actionLabel = "Criar Primeiro Projeto",
  onAction,
  variant = 'default',
  error
}: EmptyStateProps) => {
  const isError = variant === 'error';
  
  const getErrorMessage = (errorText?: string) => {
    if (!errorText) return "Houve um problema ao processar o vídeo. Tente novamente.";
    
    const lowerError = errorText.toLowerCase();
    
    if (lowerError.includes('video não está disponível') || lowerError.includes('foi removido')) {
      return "Este vídeo não está mais disponível no YouTube. Verifique se o link está correto e o vídeo é público.";
    }
    
    if (lowerError.includes('problema de conexão') || lowerError.includes('network') || lowerError.includes('timeout')) {
      return "Problema de conexão com o YouTube. Verifique sua internet e tente novamente.";
    }
    
    if (lowerError.includes('privado') || lowerError.includes('private') || lowerError.includes('authentication')) {
      return "Este vídeo é privado ou requer login. Use apenas vídeos públicos do YouTube.";
    }
    
    if (lowerError.includes('região') || lowerError.includes('geo')) {
      return "Este vídeo não está disponível na sua região.";
    }
    
    if (lowerError.includes('yt-dlp') && lowerError.includes('code 2')) {
      return "Erro no download do vídeo. Verifique se o link do YouTube está correto e se o vídeo é público.";
    }
    
    return errorText.replace(/Download failed after fallback: /, '').replace(/UnrecoverableError: /, '');
  };

  const finalTitle = isError ? "Erro ao processar vídeo" : title;
  const finalDescription = isError ? getErrorMessage(error) : description;
  const finalActionLabel = isError ? "Tentar Novamente" : actionLabel;
  const Icon = isError ? AlertCircle : Video;
  const ActionIcon = isError ? RefreshCw : Plus;

  return (
    <Card className={`border-dashed border-2 ${isError ? 'border-red-200 bg-red-50' : 'border-muted-foreground/25'}`}>
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
          isError ? 'bg-red-100' : 'bg-muted'
        }`}>
          <Icon className={`w-8 h-8 ${isError ? 'text-red-600' : 'text-muted-foreground'}`} />
        </div>
        
        <h3 className={`text-lg font-semibold mb-2 ${isError ? 'text-red-800' : ''}`}>
          {finalTitle}
        </h3>
        <p className={`mb-6 max-w-md ${isError ? 'text-red-700' : 'text-muted-foreground'}`}>
          {finalDescription}
        </p>
        
        {onAction && (
          <Button 
            onClick={onAction} 
            className="gap-2"
            variant={isError ? "outline" : "default"}
          >
            <ActionIcon className="w-4 h-4" />
            {finalActionLabel}
          </Button>
        )}
        
        {isError && (
          <div className="text-sm text-red-600 max-w-md mt-4">
            <p className="font-medium mb-2">Dicas para evitar este erro:</p>
            <ul className="text-left space-y-1">
              <li>• Use apenas vídeos públicos do YouTube</li>
              <li>• Verifique se o link está correto</li>
              <li>• Aguarde alguns minutos e tente novamente</li>
              <li>• Teste com um vídeo diferente</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};