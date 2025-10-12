import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ErrorStateProps {
  error?: string;
  onRetry?: () => void;
  title?: string;
  description?: string;
}

export const ErrorState = ({ 
  error, 
  onRetry, 
  title = "Erro ao processar vídeo",
  description = "Houve um problema ao gerar os clipes. Tente novamente." 
}: ErrorStateProps) => {
  // Parse common error types and provide user-friendly messages
  const getErrorMessage = (errorText?: string) => {
    if (!errorText) return description;
    
    const lowerError = errorText.toLowerCase();
    
    if (lowerError.includes('video não está disponível') || lowerError.includes('foi removido')) {
      return "Este vídeo não está mais disponível no YouTube. Verifique se o link está correto e o vídeo é público.";
    }
    
    if (lowerError.includes('problema de conexão') || lowerError.includes('network') || lowerError.includes('timeout')) {
      return "Problema de conexão com o YouTube. Verifique sua internet e tente novamente em alguns minutos.";
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
    
    // Return original error if no pattern matches, but cleaned up
    return errorText.replace(/Download failed after fallback: /, '').replace(/UnrecoverableError: /, '');
  };

  const errorMessage = getErrorMessage(error);

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-6">
      <Alert className="max-w-md border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertTitle className="text-red-800">{title}</AlertTitle>
        <AlertDescription className="text-red-700 mt-2">
          {errorMessage}
        </AlertDescription>
      </Alert>
      
      {onRetry && (
        <Button 
          onClick={onRetry}
          variant="outline" 
          className="flex items-center gap-2 border-red-200 text-red-700 hover:bg-red-50"
        >
          <RefreshCw className="h-4 w-4" />
          Tentar Novamente
        </Button>
      )}
      
      <div className="text-sm text-gray-500 max-w-md">
        <p className="font-medium mb-2">Dicas para evitar este erro:</p>
        <ul className="text-left space-y-1">
          <li>• Use apenas vídeos públicos do YouTube</li>
          <li>• Verifique se o link está correto</li>
          <li>• Aguarde alguns minutos e tente novamente</li>
          <li>• Teste com um vídeo diferente</li>
        </ul>
      </div>
    </div>
  );
};
