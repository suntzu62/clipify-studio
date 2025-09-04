import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ExternalLink, Clock, Play } from 'lucide-react';
import { Job } from '@/lib/jobs-api';
import { Link } from 'react-router-dom';

interface ClipCardProps {
  job: Job;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'queued':
      return 'secondary';
    case 'active':
      return 'default';
    case 'completed':
      return 'secondary';
    case 'failed':
      return 'destructive';
    default:
      return 'secondary';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'queued':
      return 'Na Fila';
    case 'active':
      return 'Processando';
    case 'completed':
      return 'Concluído';
    case 'failed':
      return 'Falhou';
    default:
      return status;
  }
};

export const ClipCard = ({ job }: ClipCardProps) => {
  const formatUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname;
    } catch {
      return url;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Card className="bg-gradient-card hover:shadow-card transition-all duration-300 group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg mb-2 group-hover:text-primary transition-colors">
              Projeto #{job.id.slice(0, 8)}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{formatUrl(job.youtubeUrl)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>{formatDate(job.createdAt)}</span>
            </div>
          </div>
          <Badge variant={getStatusColor(job.status)} className="ml-2">
            {getStatusText(job.status)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {(job.status === 'active' || job.status === 'queued') && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Progresso</span>
              <span>{job.progress}%</span>
            </div>
            <Progress value={job.progress} className="h-2" />
          </div>
        )}
        
        {job.error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{job.error}</p>
          </div>
        )}
        
        <div className="flex gap-2">
          <Button asChild className="flex-1">
            <Link to={`/projects/${job.id}`}>
              <Play className="w-4 h-4 mr-2" />
              Ver Detalhes
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};