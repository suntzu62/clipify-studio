import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Copy, Clock, ExternalLink, CheckCircle, Circle, AlertCircle } from 'lucide-react';
import { useJobStream } from '@/hooks/useJobStream';
import { JobProgress } from '@/components/JobProgress';
import { Player } from '@/components/Player';
import { getUserJobs, updateJobStatus } from '@/lib/storage';
import { Job } from '@/lib/jobs-api';
import { useToast } from '@/hooks/use-toast';
import { enqueueExport } from '@/lib/exports';
import posthog from 'posthog-js';

const steps = [
  { id: 'ingest', label: 'Ingestão', description: 'Download e análise do vídeo' },
  { id: 'transcribe', label: 'Transcrição', description: 'Geração de legendas' },
  { id: 'scenes', label: 'Cenas', description: 'Detecção de cenas' },
  { id: 'rank', label: 'Classificação', description: 'Ranking de momentos' },
  { id: 'render', label: 'Renderização', description: 'Criação do clipe' },
  { id: 'texts', label: 'Textos', description: 'Geração de títulos' },
  { id: 'export', label: 'Exportação', description: 'Finalização' },
];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const telemetryFired = useRef<'none' | 'completed' | 'failed'>('none');
  
  const { jobStatus, isConnected, error } = useJobStream(id || '');

  useEffect(() => {
    if (!id || !user?.id) return;
    
    // Load job from localStorage
    const jobs = getUserJobs(user.id);
    const foundJob = jobs.find(j => j.id === id);
    
    if (!foundJob) {
      toast({
        title: "Projeto não encontrado",
        description: "O projeto solicitado não foi encontrado",
        variant: "destructive"
      });
      navigate('/dashboard');
      return;
    }
    
    setJob(foundJob);
  }, [id, user?.id, navigate, toast]);

  useEffect(() => {
    // Update local job status when SSE provides updates
    if (jobStatus && job && user?.id) {
      const updatedJob = {
        ...job,
        status: jobStatus.status,
        progress: jobStatus.progress,
        error: jobStatus.error
      };
      
      setJob(updatedJob);
      updateJobStatus(user.id, job.id, {
        status: jobStatus.status,
        progress: jobStatus.progress,
        error: jobStatus.error
      });

      // Telemetry on completion/failure
      try {
        if (jobStatus.status === 'completed' && telemetryFired.current === 'none') {
          telemetryFired.current = 'completed';
          const clips = jobStatus?.result?.texts?.titles?.length ?? undefined;
          posthog.capture('pipeline completed', { rootId: job.id, clips });
        } else if (jobStatus.status === 'failed' && telemetryFired.current === 'none') {
          telemetryFired.current = 'failed';
          const stage = jobStatus.currentStep || 'unknown';
          posthog.capture('pipeline failed', { rootId: job.id, stage });
        }
      } catch {}
    }
  }, [jobStatus, job, user?.id]);

  const handleCopyJobId = () => {
    if (id) {
      navigator.clipboard.writeText(id);
      toast({
        title: "ID copiado",
        description: "ID do projeto copiado para a área de transferência"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'secondary';
      case 'active': return 'default';
      case 'completed': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'secondary';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'queued': return 'Na Fila';
      case 'active': return 'Processando';
      case 'completed': return 'Concluído';
      case 'failed': return 'Falhou';
      default: return status;
    }
  };

  const getCurrentStepIndex = () => {
    if (!jobStatus?.currentStep) return -1;
    return steps.findIndex(step => step.id === jobStatus.currentStep);
  };

  const formatUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname;
    } catch {
      return url;
    }
  };

  function friendlyError(msg?: string | null) {
    if (!msg) return null;
    const m = String(msg);
    if (m.includes('QUOTA_EXCEEDED') || m.toLowerCase().includes('quota')) {
      return 'Quota do YouTube estourada (cada upload consome ~1600 unidades). Consulte a documentação de quotas.';
    }
    return m;
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Button
              variant="ghost" 
              onClick={() => navigate('/dashboard')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
            
            <div className="flex items-center gap-3">
              <Badge variant={getStatusColor(job.status)}>
                {getStatusText(job.status)}
              </Badge>
              {!isConnected && job.status === 'active' && (
                <Badge variant="outline" className="text-yellow-600">
                  Reconectando...
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Project Header */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                Projeto #{job.id.slice(0, 8)}
              </h1>
              <div className="flex items-center gap-2 text-muted-foreground">
                <ExternalLink className="w-4 h-4" />
                <span>{formatUrl(job.youtubeUrl)}</span>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCopyJobId} className="gap-2">
                <Copy className="w-4 h-4" />
                Copiar ID
              </Button>
            </div>
          </div>
          
          {/* Progress Overview */}
          <Card>
            <CardContent className="pt-6">
              <JobProgress 
                value={job.progress} 
                label="Progresso Geral"
                className="mb-4"
              />
              {friendlyError(job?.error || error) && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-destructive">{friendlyError(job?.error || error)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="timeline" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="results" disabled={job.status !== 'completed'}>
              Resultados
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="timeline" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline de Processamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {steps.map((step, index) => {
                    const currentStepIndex = getCurrentStepIndex();
                    const isCompleted = currentStepIndex > index;
                    const isCurrent = currentStepIndex === index;
                    const isPending = currentStepIndex < index;
                    
                    return (
                      <div key={step.id} className="flex items-center gap-4">
                        <div className="flex-shrink-0">
                          {isCompleted ? (
                            <CheckCircle className="w-6 h-6 text-green-500" />
                          ) : isCurrent ? (
                            <div className="w-6 h-6 rounded-full border-2 border-primary bg-primary/20 animate-pulse" />
                          ) : (
                            <Circle className="w-6 h-6 text-muted-foreground" />
                          )}
                        </div>
                        
                        <div className="flex-1">
                          <h4 className={`font-medium ${isCurrent ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {step.label}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="results" className="space-y-6">
            {job.status === 'completed' ? (
              <>
                {/* Video Player */}
                {jobStatus?.result?.previewUrl && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Preview do Clipe</CardTitle>
                        <Button
                          variant="default"
                          onClick={async () => {
                            const clipId = window.prompt('ID do clipe para exportar (ex.: clip-default)')?.trim();
                            if (!clipId) return;
                            try {
                              await enqueueExport(job.id, clipId, getToken);
                              toast({ title: 'Exportação iniciada', description: `Clip ${clipId} enviado para fila` });
                            } catch (e: any) {
                              toast({ title: 'Falha ao enfileirar exportação', description: e?.message || String(e), variant: 'destructive' });
                            }
                          }}
                        >
                          Exportar para YouTube
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Player url={jobStatus.result.previewUrl} />
                    </CardContent>
                  </Card>
                )}
                
                {/* Generated Texts */}
                <Card>
                  <CardHeader>
                    <CardTitle>Textos Gerados</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {jobStatus?.result?.texts?.titles && (
                      <div>
                        <h4 className="font-medium mb-2">Títulos Sugeridos</h4>
                        <div className="space-y-2">
                          {jobStatus.result.texts.titles.map((title, index) => (
                            <div key={index} className="p-3 bg-muted rounded-md">
                              <p className="text-sm">{title}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {jobStatus?.result?.texts?.descriptions && (
                      <div>
                        <h4 className="font-medium mb-2">Descrições</h4>
                        <div className="space-y-2">
                          {jobStatus.result.texts.descriptions.map((desc, index) => (
                            <div key={index} className="p-3 bg-muted rounded-md">
                              <p className="text-sm">{desc}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {jobStatus?.result?.texts?.hashtags && (
                      <div>
                        <h4 className="font-medium mb-2">Hashtags</h4>
                        <div className="flex flex-wrap gap-2">
                          {jobStatus.result.texts.hashtags.map((tag, index) => (
                            <Badge key={index} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {jobStatus?.result?.blogDraftUrl && (
                      <div>
                        <h4 className="font-medium mb-2">Blog Draft</h4>
                        <Button asChild variant="outline">
                          <a href={jobStatus.result.blogDraftUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Abrir Draft
                          </a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Processamento em Andamento</h3>
                  <p className="text-muted-foreground">
                    Os resultados aparecerão aqui quando o processamento for concluído
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
