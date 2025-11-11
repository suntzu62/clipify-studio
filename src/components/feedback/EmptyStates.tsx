import { Button } from '@/components/ui/button';
import { Video, Film, Search, Wifi, AlertTriangle, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  className?: string;
  onAction?: () => void;
}

export const NoProjectsYet = ({ className, onAction }: EmptyStateProps) => (
  <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
    <div className="mb-6 relative">
      <div className="p-6 rounded-full bg-gradient-subtle">
        <Video className="w-16 h-16 text-gray-400" />
      </div>
      <div className="absolute -bottom-2 -right-2 p-2 rounded-full bg-primary shadow-lg">
        <Upload className="w-4 h-4 text-primary-foreground" />
      </div>
    </div>

    <h3 className="text-xl font-semibold text-foreground mb-2">
      Nenhum projeto ainda
    </h3>
    <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
      Transforme seus vídeos em clipes virais! Cole uma URL do YouTube ou faça upload de um arquivo para começar.
    </p>

    {onAction && (
      <Button onClick={onAction} size="lg" className="shadow-lg">
        <Upload className="w-4 h-4 mr-2" />
        Criar Primeiro Projeto
      </Button>
    )}
  </div>
);

export const NoClipsFound = ({ className, onAction }: EmptyStateProps) => (
  <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
    <div className="mb-6 p-6 rounded-full bg-gradient-subtle">
      <Film className="w-16 h-16 text-gray-400" />
    </div>

    <h3 className="text-xl font-semibold text-foreground mb-2">
      Nenhum clipe encontrado
    </h3>
    <p className="text-sm text-muted-foreground max-w-md mb-8">
      Este projeto ainda não tem clipes processados. Aguarde o processamento ou tente novamente.
    </p>

    {onAction && (
      <Button onClick={onAction} variant="outline">
        Voltar ao Dashboard
      </Button>
    )}
  </div>
);

export const SearchNoResults = ({ className, onAction }: EmptyStateProps) => (
  <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
    <div className="mb-6 p-6 rounded-full bg-gradient-subtle">
      <Search className="w-16 h-16 text-gray-400" />
    </div>

    <h3 className="text-xl font-semibold text-foreground mb-2">
      Nenhum resultado encontrado
    </h3>
    <p className="text-sm text-muted-foreground max-w-md mb-8">
      Não encontramos resultados para sua busca. Tente outros termos ou filtros.
    </p>

    {onAction && (
      <Button onClick={onAction} variant="ghost">
        Limpar Filtros
      </Button>
    )}
  </div>
);

export const ConnectionError = ({ className, onAction }: EmptyStateProps) => (
  <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
    <div className="mb-6 p-6 rounded-full bg-destructive/10">
      <Wifi className="w-16 h-16 text-destructive" />
    </div>

    <h3 className="text-xl font-semibold text-foreground mb-2">
      Erro de Conexão
    </h3>
    <p className="text-sm text-muted-foreground max-w-md mb-8">
      Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.
    </p>

    {onAction && (
      <Button onClick={onAction} variant="outline">
        Tentar Novamente
      </Button>
    )}
  </div>
);

export const ProcessingError = ({ className, onAction }: EmptyStateProps) => (
  <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
    <div className="mb-6 p-6 rounded-full bg-warning/10">
      <AlertTriangle className="w-16 h-16 text-warning" />
    </div>

    <h3 className="text-xl font-semibold text-foreground mb-2">
      Erro no Processamento
    </h3>
    <p className="text-sm text-muted-foreground max-w-md mb-8">
      Houve um problema ao processar seu vídeo. Nossa equipe foi notificada e estamos investigando.
    </p>

    <div className="flex gap-3">
      {onAction && (
        <>
          <Button onClick={onAction} variant="outline">
            Voltar
          </Button>
          <Button onClick={onAction}>
            Tentar Novamente
          </Button>
        </>
      )}
    </div>
  </div>
);

// Export all as object for convenience
export const EmptyStates = {
  NoProjectsYet,
  NoClipsFound,
  SearchNoResults,
  ConnectionError,
  ProcessingError,
};
