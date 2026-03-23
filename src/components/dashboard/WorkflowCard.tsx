import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Play, Download, Clock, CheckCircle2, AlertCircle, Loader, Trash2, type LucideIcon } from 'lucide-react';
import { TiltCard } from '@/components/landing';

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
  onDelete?: () => void;
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
  onDelete,
  className,
}: WorkflowCardProps) => {
  // Guard: BullMQ may return progress as {progress, message} object
  const safeProgress = typeof progress === 'object' && progress !== null
    ? (progress as any).progress ?? 0
    : typeof progress === 'number' ? progress : 0;
  const statusConfig: Record<string, {
    label: string;
    variant: 'default' | 'secondary' | 'destructive';
    icon: LucideIcon;
    chipClass: string;
  }> = {
    queued: {
      label: 'Na fila',
      variant: 'secondary' as const,
      icon: Clock,
      chipClass: 'border-gray-500/30 bg-gray-500/10 text-gray-200',
    },
    active: {
      label: 'Processando',
      variant: 'default' as const,
      icon: Loader,
      chipClass: 'border-primary/30 bg-primary/10 text-primary',
    },
    completed: {
      label: 'Concluído',
      variant: 'default' as const,
      icon: CheckCircle2,
      chipClass: 'border-success/30 bg-success/10 text-success',
    },
    failed: {
      label: 'Pausado',
      variant: 'destructive' as const,
      icon: AlertCircle,
      chipClass: 'border-destructive/40 bg-destructive/10 text-destructive',
    },
  };

  // Fallback para status desconhecidos
  const config = statusConfig[status] || statusConfig.queued;
  const StatusIcon = config.icon;

  return (
    <TiltCard tiltDegree={5} glare className={className}>
      <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
        <Card className="overflow-hidden border border-white/10 glass-card glass-card-hover shadow-card backdrop-blur-xl transition-all duration-300">
          <CardContent className="p-4">
            <div className="flex gap-4">
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.3 }}
                className="relative h-24 w-40 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-primary/15 to-primary/5"
              >
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Play className="h-10 w-10 text-primary/60" />
                  </div>
                )}
                {status === 'active' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 animate-glow-pulse">
                    <Loader className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
              </motion.div>

              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="line-clamp-2 text-base font-semibold leading-tight text-foreground">
                    {title}
                  </h3>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.2 }}
                  >
                    <Badge
                      variant={config.variant}
                      className={cn('flex-shrink-0 border px-2.5 py-1 text-xs', config.chipClass)}
                    >
                      <StatusIcon className={cn('mr-1 h-3 w-3', status === 'active' && 'animate-spin')} />
                      {config.label}
                    </Badge>
                  </motion.div>
                </div>

                {status === 'active' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{safeProgress}%</span>
                      <span>{clipsGenerated} de {totalClips} clipes</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full bg-gradient-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${safeProgress}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {status === 'completed' && (
                    <span>{totalClips} clipes gerados</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div className="flex gap-2">
                  {onView && (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onView}>
                        <Play className="mr-1 h-3 w-3" />
                        Abrir
                      </Button>
                    </motion.div>
                  )}
                  {onDownload && status === 'completed' && (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onDownload}>
                        <Download className="mr-1 h-3 w-3" />
                        Baixar
                      </Button>
                    </motion.div>
                  )}
                  {onDelete && (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        onClick={onDelete}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Excluir
                      </Button>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </TiltCard>
  );
};
