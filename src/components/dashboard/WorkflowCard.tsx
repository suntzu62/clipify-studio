import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Play, Download, Clock, CheckCircle2, AlertCircle, Loader } from 'lucide-react';

interface WorkflowCardProps {
  id: string;
  title: string;
  thumbnailUrl?: string;
  status: 'queued' | 'active' | 'completed' | 'failed';
  progress?: number;
  clipsGenerated?: number;
  totalClips?: number;
  createdAt: string;
  onView?: () => void;
  onDownload?: () => void;
  className?: string;
}

export const WorkflowCard = ({
  id,
  title,
  thumbnailUrl,
  status,
  progress = 0,
  clipsGenerated = 0,
  totalClips = 10,
  createdAt,
  onView,
  onDownload,
  className,
}: WorkflowCardProps) => {
  const statusConfig: Record<string, {
    label: string;
    variant: 'default' | 'secondary' | 'destructive';
    icon: any;
    color: string;
  }> = {
    queued: {
      label: 'Na fila',
      variant: 'secondary' as const,
      icon: Clock,
      color: 'text-gray-500',
    },
    active: {
      label: 'Processando',
      variant: 'default' as const,
      icon: Loader,
      color: 'text-primary',
    },
    completed: {
      label: 'Concluído',
      variant: 'default' as const,
      icon: CheckCircle2,
      color: 'text-success',
    },
    failed: {
      label: 'Pausado',
      variant: 'destructive' as const,
      icon: AlertCircle,
      color: 'text-destructive',
    },
  };

  // Fallback para status desconhecidos
  const config = statusConfig[status] || statusConfig.queued;
  const StatusIcon = config.icon;

  return (
    <Card className={cn('overflow-hidden hover:shadow-lg transition-all duration-300', className)}>
      <CardContent className="p-0">
        <div className="flex gap-4 p-4">
          {/* Thumbnail */}
          <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Play className="w-10 h-10 text-primary opacity-50" />
              </div>
            )}
            {status === 'active' && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-sm leading-tight line-clamp-2">
                {title}
              </h3>
              <Badge variant={config.variant} className="flex-shrink-0">
                <StatusIcon className={cn('w-3 h-3 mr-1', status === 'active' && 'animate-spin')} />
                {config.label}
              </Badge>
            </div>

            <div className="space-y-2">
              {/* Progress Bar (only for active) */}
              {status === 'active' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{progress}%</span>
                    <span>{clipsGenerated} de {totalClips} clipes</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Stats */}
              {status === 'completed' && (
                <p className="text-xs text-muted-foreground">
                  {totalClips} clipes gerados
                </p>
              )}

              {/* Time */}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {onView && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={onView}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Ver Projeto
                  </Button>
                )}
                {onDownload && status === 'completed' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={onDownload}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Baixar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
