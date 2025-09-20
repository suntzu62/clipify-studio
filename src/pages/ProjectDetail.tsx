import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Copy, ExternalLink, AlertCircle, Sparkles, TrendingUp } from 'lucide-react';
import { useJobStatus } from '@/hooks/useJobStatus';
import { useTimeline } from '@/hooks/useTimeline';
import { useClipList } from '@/hooks/useClipList';
import { ProgressHeader } from '@/components/progress/ProgressHeader';
import { TimelineStep } from '@/components/timeline/TimelineStep';
import { ClipCard } from '@/components/clips/ClipCard';
import { SocialProof } from '@/components/social/SocialProof';
import { VideoDebugPanel } from '@/components/debug/VideoDebugPanel';
import { getUserJobs, updateJobStatus } from '@/lib/storage';
import { Job } from '@/lib/jobs-api';
import { useToast } from '@/hooks/use-toast';
import { enqueueExport } from '@/lib/exports';
import posthog from 'posthog-js';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const telemetryFired = useRef<'none' | 'completed' | 'failed'>('none');
  
  // Use unified job status hook with intelligent SSE/polling fallback
  const { jobStatus, isConnected, connectionType, error } = useJobStatus({
    jobId: id || '',
    enabled: !!id
  });
  
  // Custom hooks for timeline and clips
  const { steps, activeStep, completedCount, totalSteps, overallProgress } = useTimeline(
    jobStatus?.currentStep, 
    jobStatus?.status
  );
  // Get clips data - pass full jobStatus or job object
  const { clips, readyCount, debugInfo, setEstimatedClipCount } = useClipList(jobStatus || job);

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
    // Update local job status when we get updates
    if (jobStatus && job && user?.id) {
      // Only update if status or progress actually changed
      const hasStatusChanged = job.status !== jobStatus.status;
      const hasProgressChanged = Math.abs((job.progress || 0) - overallProgress) > 1;
      
      if (hasStatusChanged || hasProgressChanged) {
        const updatedJob = {
          ...job,
          status: jobStatus.status,
          progress: overallProgress,
          error: jobStatus.error
        };
        
        setJob(updatedJob);
        updateJobStatus(user.id, job.id, {
          status: jobStatus.status,
          progress: overallProgress,
          error: jobStatus.error
        });
      }

      // Telemetry on completion/failure
      try {
        if (jobStatus.status === 'completed' && telemetryFired.current === 'none') {
          telemetryFired.current = 'completed';
          const clips = jobStatus?.result?.texts?.titles?.length ?? readyCount;
          posthog.capture('pipeline completed', { rootId: job.id, clips });
        } else if (jobStatus.status === 'failed' && telemetryFired.current === 'none') {
          telemetryFired.current = 'failed';
          const stage = jobStatus.currentStep || 'unknown';
          posthog.capture('pipeline failed', { rootId: job.id, stage });
        }
      } catch {}
    }
  }, [jobStatus, job, user?.id, overallProgress, readyCount]);

  const handleCopyJobId = () => {
    if (id) {
      navigator.clipboard.writeText(id);
      toast({
        title: "ID copiado! ✨",
        description: "ID do projeto copiado para a área de transferência"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'secondary';
      case 'active': return 'default';
      case 'completed': return 'default';
      case 'failed': return 'destructive';
      default: return 'secondary';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'queued': return '⏰ Na Fila';
      case 'active': return '🚀 Criando Magia';
      case 'completed': return '✅ Pronto para Viralizar';
      case 'failed': return '⚠️ Precisa de Atenção';
      default: return status;
    }
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
      return 'Quota do YouTube estourada. Vamos tentar novamente em breve! 🔄';
    }
    if (m.includes('401') || m.includes('unauthorized')) {
      return 'Problema de autenticação. Recarregue a página! 🔐';
    }
    return 'Ops! Algo deu errado, mas vamos resolver rapidinho 💪';
  }

  const getEstimatedTime = () => {
    if (!job || !jobStatus) return '3-5 min';
    
    if (jobStatus.status === 'completed') return 'Concluído';
    if (jobStatus.status === 'failed') return 'Pausado';
    
    const remaining = Math.max(0, 5 - Math.floor(overallProgress / 20));
    return remaining > 0 ? `~${remaining} min` : 'Quase pronto!';
  };

  if (!job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando seu projeto...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Minimalist Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Button
              variant="ghost" 
              onClick={() => navigate('/dashboard')}
              className="gap-2 hover:bg-primary/10"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Button>
            
            <div className="flex items-center gap-3">
              <Badge variant={getStatusColor(job.status)} className="gap-1">
                {getStatusText(job.status)}
              </Badge>
              {(connectionType === 'polling' || !isConnected) && (
                <Badge variant="outline" className="text-yellow-600 gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Sincronizando...
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Hero Progress Header */}
        <div className="mb-8">
          <ProgressHeader
            progress={overallProgress}
            activeStepLabel={activeStep?.label}
            completedSteps={completedCount}
            totalSteps={totalSteps}
            estimatedTime={getEstimatedTime()}
            clipCount={clips.length}
            status={job.status as any}
          />
        </div>

        {/* Project Info */}
        <Card className="mb-8 bg-gradient-card">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Projeto #{job.id.slice(0, 8)}
                </h2>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ExternalLink className="w-4 h-4" />
                  <span className="text-sm">{formatUrl(job.youtubeUrl)}</span>
                </div>
              </div>
              
              <Button variant="outline" onClick={handleCopyJobId} className="gap-2 hover:bg-primary/10">
                <Copy className="w-4 h-4" />
                Copiar ID
              </Button>
            </div>
            
            {/* Error Display */}
            {friendlyError(job?.error || error) && (
              <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                <span className="text-sm text-destructive">{friendlyError(job?.error || error)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Debug Panel - Only in development */}
            {process.env.NODE_ENV === 'development' && (
              <VideoDebugPanel 
                jobStatus={jobStatus}
                clipDebugInfo={debugInfo}
                connectionInfo={{
                  isConnected,
                  connectionType,
                  error
                }}
                onRefresh={() => window.location.reload()}
              />
            )}
            
            <Tabs defaultValue="progress" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="progress" className="gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Progresso
                </TabsTrigger>
                <TabsTrigger 
                  value="results" 
                  disabled={job?.status === 'queued'}
                  className="gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Resultados {readyCount > 0 ? `(${readyCount})` : ''}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="progress" className="space-y-6">
                {/* Visual Timeline */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      Pipeline de Criação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {steps.map((step, index) => (
                      <TimelineStep 
                        key={step.id} 
                        step={step} 
                        index={index} 
                        total={steps.length} 
                      />
                    ))}
                  </CardContent>
                </Card>

                {/* Current Status Card */}
                {job.status === 'active' && activeStep && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="p-6 text-center">
                      <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <TrendingUp className="w-8 h-8 text-primary animate-pulse" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">
                        {activeStep.label} em Andamento
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        Estamos na etapa mais importante: criar conteúdo que vai fazer você brilhar! ✨
                      </p>
                      <div className="text-sm text-primary font-medium">
                        Primeiro clipe pronto em ~{Math.max(1, 5 - completedCount)} minutos
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="results" className="space-y-6">
                {readyCount > 0 ? (
                  <>
                    {/* Results Header */}
                    <Card className="bg-gradient-primary text-primary-foreground">
                      <CardContent className="p-6 text-center">
                        <h2 className="text-2xl font-bold mb-2">
                          🎉 {readyCount} Shorts Prontos para Viralizar!
                        </h2>
                        <p className="text-primary-foreground/90">
                          Cada clipe foi criado para maximizar engajamento e alcance
                        </p>
                      </CardContent>
                    </Card>

                    {/* Clips Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {clips.map((clip, index) => (
                        <ClipCard key={clip.id} clip={clip} index={index} />
                      ))}
                    </div>

                    {/* Success CTA */}
                    {job.status === 'completed' && (
                      <Card className="bg-green-50 border-green-200">
                        <CardContent className="p-6 text-center">
                          <h3 className="text-lg font-semibold text-green-800 mb-2">
                            Pronto para Conquistar as Redes! 🚀
                          </h3>
                          <p className="text-green-700 mb-4">
                            Seus clipes estão otimizados para YouTube Shorts, Instagram Reels e TikTok
                          </p>
                          <Button className="bg-green-600 hover:bg-green-700 text-white">
                            <TrendingUp className="w-4 h-4 mr-2" />
                            Baixar Todos os Clipes
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <>
                    {/* Show all clips including processing ones */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {clips.map((clip, index) => (
                        <ClipCard key={clip.id} clip={clip} index={index} />
                      ))}
                    </div>
                    
                    {/* No clips message */}
                    {clips.length === 0 && job?.status === 'completed' && (
                      <Card className="p-8 text-center">
                        <div className="space-y-4">
                          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                            <AlertCircle className="w-8 h-8 text-muted-foreground" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold mb-2">Nenhum clipe disponível</h3>
                            <p className="text-muted-foreground">
                              Não foi possível gerar clipes a partir deste vídeo. Tente com um vídeo mais longo ou com conteúdo diferente.
                            </p>
                          </div>
                        </div>
                      </Card>
                    )}
                    
                    {/* Processing message */}
                    {clips.length === 0 && job?.status !== 'completed' && (
                      <Card className="bg-gradient-card">
                        <CardContent className="py-16 text-center">
                          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Sparkles className="w-10 h-10 text-primary animate-pulse" />
                          </div>
                          <h3 className="text-xl font-semibold mb-3">
                            Preparando Algo Incrível...
                          </h3>
                          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                            Estamos analisando seu conteúdo para criar os clipes mais envolventes. 
                            Os primeiros resultados aparecerão aqui em breve!
                          </p>
                          <div className="text-sm text-primary font-medium">
                            ⏱️ Primeiro clipe em aproximadamente {getEstimatedTime()}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <SocialProof />
          </div>
        </div>
      </div>
    </div>
  );
}