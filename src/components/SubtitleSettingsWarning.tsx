import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Sparkles } from 'lucide-react';

interface SubtitleSettingsWarningProps {
  jobStatus: 'queued' | 'active' | 'completed' | 'failed';
}

export const SubtitleSettingsWarning = ({ jobStatus }: SubtitleSettingsWarningProps) => {
  // Show warning only if job is completed or failed
  if (jobStatus === 'queued' || jobStatus === 'active') {
    return null;
  }

  return (
    <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
      <Info className="h-4 w-4 text-blue-600" />
      <AlertTitle className="text-blue-900 dark:text-blue-100">
        Sobre as Configurações de Legendas
      </AlertTitle>
      <AlertDescription className="text-blue-800 dark:text-blue-200">
        <div className="space-y-2 mt-2">
          <p>
            As preferências de legendas são aplicadas <strong>durante a renderização</strong> do vídeo.
          </p>
          <p>
            Para este job que já foi processado, as configurações de legendas não podem ser modificadas.
            Se desejar alterar as legendas, você precisará:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Criar um novo job com o mesmo vídeo</li>
            <li>Configurar as legendas antes de iniciar o processamento</li>
          </ul>
          <div className="flex items-center gap-2 mt-3 p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
            <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="text-sm">
              <strong>Dica:</strong> Na próxima vez, configure as legendas na página inicial antes de enviar o vídeo!
            </span>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
};
