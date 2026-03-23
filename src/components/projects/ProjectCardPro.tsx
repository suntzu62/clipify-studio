import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Play, Clock, CheckCircle2, AlertCircle, Loader2, MoreVertical, Edit, Trash2 } from 'lucide-react';
import type { Project } from '@/services/projects';
import { cn } from '@/lib/utils';
import { extractVideoId } from '@/lib/youtube-metadata';
import { TiltCard } from '@/components/landing';

interface ProjectCardProProps {
  project: Project;
  onEdit?: (project: Project) => void;
  onDelete?: (project: Project) => void;
}

export const ProjectCardPro = ({ project, onEdit, onDelete }: ProjectCardProProps) => {
  // Guard: BullMQ may store progress as {progress, message} object
  const rawProgress = project.progress;
  const safeProgress = typeof rawProgress === 'object' && rawProgress !== null
    ? (rawProgress as any).progress ?? 0
    : typeof rawProgress === 'number' ? rawProgress : 0;
  // Extrair ID do vídeo do YouTube da URL
  const getYouTubeVideoId = (url: string | null): string | null => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

  const videoId = getYouTubeVideoId(project.youtube_url);
  const thumbnailUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    : null;

  // Determinar status visual
  const getStatusInfo = () => {
    const normalizedStatus = (project.status || '').toLowerCase();

    switch (normalizedStatus) {
      case 'completed':
        return {
          icon: <CheckCircle2 className="w-3 h-3" />,
          label: 'Concluído',
          color: 'bg-green-500',
          badgeVariant: 'default' as const
        };
      case 'active':
      case 'processing':
      case 'queued':
      case 'pending':
      case 'waiting':
        return {
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          label: 'Processando',
          color: 'bg-blue-500',
          badgeVariant: 'secondary' as const
        };
      case 'failed':
        return {
          icon: <AlertCircle className="w-3 h-3" />,
          label: 'Erro',
          color: 'bg-red-500',
          badgeVariant: 'destructive' as const
        };
      default:
        return {
          icon: <Clock className="w-3 h-3" />,
          label: 'Na fila',
          color: 'bg-yellow-500',
          badgeVariant: 'secondary' as const
        };
    }
  };

  const statusInfo = getStatusInfo();

  // Calcular score simulado (baseado no progresso e status)
  const getScore = () => {
    if (project.status === 'completed') return 85 + Math.floor(Math.random() * 15); // 85-100
    if (project.status === 'active') return safeProgress || 50;
    return 0;
  };

  const score = getScore();

  // Formatação de data relativa
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMins = Math.floor(diffInMs / 60000);
    const diffInHours = Math.floor(diffInMs / 3600000);
    const diffInDays = Math.floor(diffInMs / 86400000);

    if (diffInMins < 60) return `${diffInMins}m atrás`;
    if (diffInHours < 24) return `${diffInHours}h atrás`;
    return `${diffInDays}d atrás`;
  };

  // Extrair título limpo do YouTube URL ou usar file_name
  const getProjectTitle = () => {
    if (project.display_title) return project.display_title;
    if (project.title) return project.title;
    if (project.file_name) return project.file_name.replace(/\.[^/.]+$/, '');
    if (project.youtube_url) {
      const videoId = extractVideoId(project.youtube_url);
      return videoId ? `YouTube ${videoId}` : `Projeto #${project.id.slice(0, 8)}`;
    }
    return `Projeto #${project.id.slice(0, 8)}`;
  };

  return (
    <TiltCard tiltDegree={8} glare>
      <div className="relative group">
        {/* Actions Menu */}
        <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/10"
                onClick={(e) => e.preventDefault()}
              >
                <MoreVertical className="h-4 w-4 text-white" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {onEdit && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(project);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar projeto
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(project);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir projeto
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Link to={`/projects/${project.id}`} className="block">
          <Card className="overflow-hidden glass-card glass-card-hover border-2 border-white/10 hover:border-primary/50 transition-all duration-300 hover:shadow-2xl">
            <CardContent className="p-0">
              {/* Thumbnail Area */}
              <AspectRatio ratio={16/9} className="relative">
              <div className="bg-gradient-to-br from-primary/20 to-primary/5 h-full flex items-center justify-center relative overflow-hidden">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={getProjectTitle()}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-4">
                    <motion.div
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-3 group-hover:bg-primary/30 transition-colors"
                    >
                      <Play className="w-8 h-8 text-primary ml-1" />
                    </motion.div>
                    <p className="text-xs text-muted-foreground">Vídeo do Projeto</p>
                  </div>
                )}

                {/* Overlay gradient no bottom */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* Score Badge (só se completo) */}
                {project.status === 'completed' && score > 0 && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                    className="absolute top-3 left-3"
                  >
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 neon-glow">
                      <span className="text-2xl font-black text-white">{score}</span>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-white/70 leading-none">SCORE</span>
                        <span className="text-xs font-semibold text-green-400 leading-none">
                          {score >= 90 ? 'Viral' : score >= 80 ? 'Ótimo' : 'Bom'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Status Badge */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.2 }}
                  className="absolute top-3 right-3"
                >
                  <Badge
                    variant={statusInfo.badgeVariant}
                    className={cn(
                      "backdrop-blur-md border border-white/10 shadow-lg flex items-center gap-1.5",
                      project.status === 'completed' && "bg-green-500/90 text-white hover:bg-green-500",
                      project.status === 'active' && "bg-blue-500/90 text-white hover:bg-blue-500",
                      project.status === 'failed' && "bg-red-500/90 text-white hover:bg-red-500"
                    )}
                  >
                    {statusInfo.icon}
                    {statusInfo.label}
                  </Badge>
                </motion.div>

                {/* Progress Bar (se em processamento) */}
                {project.status === 'active' && safeProgress !== null && safeProgress > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                    <motion.div
                      className="h-full bg-gradient-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${safeProgress}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                )}

                {/* Play Overlay on Hover */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="w-16 h-16 bg-white/95 rounded-full flex items-center justify-center shadow-2xl transform scale-75 group-hover:scale-100 transition-transform"
                  >
                    <Play className="w-8 h-8 text-primary ml-1" />
                  </motion.div>
                </div>
              </div>
            </AspectRatio>

            {/* Info Section */}
            <div className="p-4 space-y-2">
              {/* Title */}
              <h3 className="font-bold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {getProjectTitle()}
              </h3>

              {/* Meta Info */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {getRelativeTime(project.created_at)}
                </span>
                {project.status === 'active' && safeProgress !== null && (
                  <span className="font-medium text-primary">
                    {safeProgress}%
                  </span>
                )}
                {project.status === 'completed' && (
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    Pronto
                  </span>
                )}
              </div>

              {/* Source info */}
              {(project.source || project.clips_ready_count !== undefined) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {project.source && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0">
                      {project.source === 'youtube' ? '📺 YouTube' : '📁 Upload'}
                    </Badge>
                  )}
                  {typeof project.clips_ready_count === 'number' && (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0">
                      {project.clips_ready_count} {project.clips_ready_count === 1 ? 'corte pronto' : 'cortes prontos'}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
      </div>
    </TiltCard>
  );
};
