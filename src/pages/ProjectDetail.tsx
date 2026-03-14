import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  AlertCircle,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Loader2,
  Clock,
  Download,
  FileText,
  Scissors,
  Video,
  Type,
  Upload,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { useJobStatus } from '@/hooks/useJobStatus';
import { useTimeline } from '@/hooks/useTimeline';
import { useClipList } from '@/hooks/useClipList';
import { ClipCardPro } from '@/components/clips/ClipCardPro';
import { ClipPlayerModal } from '@/components/clips/ClipPlayerModal';
import { ClipCardEnhanced as ClipCard } from '@/components/clips/ClipCardEnhanced';
import { VideoDebugPanel } from '@/components/debug/VideoDebugPanel';
import { ClipDebugPanel } from '@/components/debug/ClipDebugPanel';
import { WorkerDiagnosticPanel } from '@/components/WorkerDiagnosticPanel';
import { SubtitleSettingsWarning } from '@/components/SubtitleSettingsWarning';
import { EmptyState } from '@/components/EmptyState';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getUserJobs, updateJobStatus, saveUserJob } from '@/lib/storage';
import { Job, createTempConfig } from '@/lib/jobs-api';
import { getBackendUrl } from '@/lib/backend-url';
import { useToast } from '@/hooks/use-toast';
import { createProjectTitle } from '@/lib/youtube-metadata';
import posthog from 'posthog-js';
import { isValidYouTubeUrl } from '@/lib/youtube';
import { cn } from '@/lib/utils';

// Rotating tips shown during processing
const PROCESSING_TIPS = [
  { emoji: '🎯', text: 'Clips com legendas ganham 85% mais engajamento no TikTok' },
  { emoji: '📐', text: 'O formato 9:16 vertical tem 3x mais alcance no Instagram Reels' },
  { emoji: '⏱️', text: 'O comprimento ideal de um clip viral é entre 45-90 segundos' },
  { emoji: '🤖', text: 'Nossa IA analisa padrões de viralidade de milhões de vídeos' },
  { emoji: '🎬', text: 'O face-tracking mantém os falantes sempre centralizados' },
  { emoji: '📊', text: 'Cada clip recebe uma pontuação de viralidade personalizada' },
  { emoji: '🔤', text: 'Legendas estilizadas aumentam o tempo de visualização em 40%' },
  { emoji: '🚀', text: 'Criadores usando IA geram 10x mais conteúdo por semana' },
];

const STEP_ICONS: Record<string, React.ReactNode> = {
  ingest: <Download className="w-4 h-4" />,
  transcribe: <FileText className="w-4 h-4" />,
  scenes: <Scissors className="w-4 h-4" />,
  rank: <TrendingUp className="w-4 h-4" />,
  render: <Video className="w-4 h-4" />,
  texts: <Type className="w-4 h-4" />,
  export: <Upload className="w-4 h-4" />,
};

const STEP_DETAILS: Record<string, { label: string; activeLabel: string }> = {
  ingest: { label: 'Download', activeLabel: 'Baixando vídeo...' },
  transcribe: { label: 'Transcrição', activeLabel: 'Convertendo fala em texto com IA...' },
  scenes: { label: 'Detecção', activeLabel: 'Identificando os melhores momentos...' },
  rank: { label: 'Ranking', activeLabel: 'Selecionando clips mais virais...' },
  render: { label: 'Renderização', activeLabel: 'Criando vídeos otimizados em 9:16...' },
  texts: { label: 'Metadados', activeLabel: 'Gerando títulos e hashtags com GPT-4...' },
  export: { label: 'Exportação', activeLabel: 'Finalizando e preparando downloads...' },
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, getToken } = useAuth();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [sortBy, setSortBy] = useState<'original' | 'viral'>('original');
  const [tipIndex, setTipIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [playerClipIndex, setPlayerClipIndex] = useState<number | null>(null);
  const telemetryFired = useRef<'none' | 'completed' | 'failed'>('none');

  // Use unified job status hook
  const { jobStatus, isConnected, connectionType, error, reconnect, refreshNow, stalled } = useJobStatus({
    jobId: id || '',
    enabled: !!id
  });

  const { steps, activeStep, completedCount, totalSteps, overallProgress } = useTimeline(
    jobStatus?.currentStep,
    jobStatus?.status
  );

  const { clips, readyCount, debugInfo, setEstimatedClipCount } = useClipList(jobStatus || job);

  // Rotate tips every 6 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % PROCESSING_TIPS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Update estimated clip count from texts
  useEffect(() => {
    const texts = jobStatus?.result?.texts || job?.result?.texts;
    if (texts?.titles && Array.isArray(texts.titles) && texts.titles.length > 0) {
      setEstimatedClipCount(texts.titles.length);
    }
  }, [jobStatus, job, setEstimatedClipCount]);

  // Auto-switch to results when clips ready
  useEffect(() => {
    if (readyCount > 0 && !showResults) {
      const timer = setTimeout(() => {
        setShowResults(true);
        toast({
          title: "Seus clips estao prontos!",
          description: `${readyCount} clips foram gerados com sucesso`,
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [readyCount, showResults, toast]);

  // Load job data
  useEffect(() => {
    if (!id || !user?.id) return;

    const loadJob = async () => {
      const jobs = getUserJobs(user.id);
      const foundJob = jobs.find(j => j.id === id);

      if (foundJob) {
        setJob(foundJob);
        return;
      }

      console.log('Job not found in localStorage, waiting and checking backend...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const baseUrl = getBackendUrl();
        const apiKey = import.meta.env.VITE_API_KEY || '';

        const response = await fetch(`${baseUrl}/jobs/${id}`, {
          headers: { 'X-API-Key': apiKey },
        });

        if (response.ok) {
          const jobData = await response.json();
          const newJob: Job = {
            id: jobData.jobId || id,
            youtubeUrl: '',
            status: jobData.state || 'queued',
            progress: jobData.progress || 0,
            createdAt: new Date().toISOString(),
            neededMinutes: 10,
          };
          saveUserJob(user.id, newJob);
          setJob(newJob);
          return;
        }
      } catch (error) {
        console.error('Failed to fetch job from backend:', error);
      }

      toast({
        title: "Projeto nao encontrado",
        description: "O projeto solicitado nao foi encontrado. Tente novamente.",
        variant: "destructive"
      });
      navigate('/dashboard');
    };

    loadJob();
  }, [id, user?.id, navigate, toast]);

  // Sync job status updates
  useEffect(() => {
    if (jobStatus && job && user?.id) {
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

      try {
        if (jobStatus.status === 'completed' && telemetryFired.current === 'none') {
          telemetryFired.current = 'completed';
          const clipsCount = jobStatus?.result?.texts?.titles?.length ?? readyCount;
          posthog.capture('pipeline completed', { rootId: job.id, clips: clipsCount });
        } else if (jobStatus.status === 'failed' && telemetryFired.current === 'none') {
          telemetryFired.current = 'failed';
          posthog.capture('pipeline failed', { rootId: job.id, stage: jobStatus.currentStep || 'unknown' });
        }
      } catch {}
    }
  }, [jobStatus, job, user?.id, overallProgress, readyCount]);

  const handleCopyJobId = () => {
    if (id) {
      navigator.clipboard.writeText(id);
      toast({ title: "ID copiado!", description: "ID do projeto copiado para a area de transferencia" });
    }
  };

  const handleRetry = async () => {
    const youtubeUrl = job?.youtubeUrl || jobStatus?.result?.metadata?.url;
    if (!youtubeUrl || !isValidYouTubeUrl(youtubeUrl)) {
      toast({ title: "Nao e possivel tentar novamente", description: "URL do YouTube nao disponivel.", variant: "destructive" });
      navigate('/dashboard');
      return;
    }
    setIsRetrying(true);
    try {
      posthog.capture('job retry', { jobId: id });
      const { tempId } = await createTempConfig(youtubeUrl, getToken);
      toast({ title: "Novo processamento criado!", description: "Revise as configuracoes e tente novamente." });
      navigate(`/projects/configure/${tempId}`);
    } catch (error: any) {
      toast({ title: "Erro ao tentar novamente", description: error.message || "Tente criar um novo projeto", variant: "destructive" });
    } finally {
      setIsRetrying(false);
    }
  };

  function friendlyError(msg?: string | null) {
    if (!msg) return null;
    const m = String(msg);
    if (m.includes('QUOTA_EXCEEDED') || m.toLowerCase().includes('quota')) return 'Quota do YouTube estourada. Vamos tentar novamente em breve!';
    if (m.includes('401') || m.includes('unauthorized')) return 'Problema de autenticacao. Recarregue a pagina!';
    if (m.toLowerCase().includes('youtube') || m.toLowerCase().includes('blocked')) return 'YouTube temporariamente indisponivel. Tente fazer upload do arquivo!';
    if (m.toLowerCase().includes('timeout') || m.toLowerCase().includes('network')) return 'Conexao instavel. Verificando status automaticamente...';
    return null;
  }

  const getProjectDisplayTitle = () => {
    if (job!.result?.metadata?.title) return job!.result.metadata.title;
    const title = createProjectTitle(job!.youtubeUrl);
    return title !== 'Novo Projeto' ? title : `Projeto #${job!.id.slice(0, 8)}`;
  };

  const formatUrl = (url: string) => {
    try { return new URL(url).hostname; } catch { return url; }
  };

  const getEstimatedTime = () => {
    if (!job || !jobStatus) return '3-5 min';
    if (jobStatus.status === 'completed') return 'Concluido';
    if (jobStatus.status === 'failed') return 'Pausado';
    const remaining = Math.max(0, 5 - Math.floor(overallProgress / 20));
    return remaining > 0 ? `~${remaining} min` : 'Quase pronto!';
  };

  const getSortedClips = () => {
    if (sortBy === 'viral') {
      return [...clips].sort((a, b) => (b.viralIntel?.overallScore || 0) - (a.viralIntel?.overallScore || 0));
    }
    return clips;
  };

  const sortedClips = getSortedClips();
  const isProcessing = job?.status === 'active' || job?.status === 'queued';
  const isCompleted = job?.status === 'completed';
  const isFailed = job?.status === 'failed';

  const stepOrder = ['ingest', 'transcribe', 'scenes', 'rank', 'render', 'texts', 'export'];

  const getStepStatus = (stepId: string): 'pending' | 'active' | 'completed' | 'failed' => {
    const currentStep = jobStatus?.currentStep;
    if (isFailed) {
      const ci = stepOrder.indexOf(currentStep || '');
      const si = stepOrder.indexOf(stepId);
      if (stepId === currentStep) return 'failed';
      if (si < ci) return 'completed';
      return 'pending';
    }
    if (isCompleted) return 'completed';
    const ci = stepOrder.indexOf(currentStep || '');
    const si = stepOrder.indexOf(stepId);
    if (stepId === currentStep) return 'active';
    if (si < ci) return 'completed';
    return 'pending';
  };

  // --- Loading state ---
  if (!job) {
    return (
      <div className="fixed inset-0 bg-[#080810] flex items-center justify-center">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[20%] left-[20%] w-[400px] h-[400px] rounded-full bg-purple-500/[0.08] blur-[120px]" />
          <div className="absolute bottom-[20%] right-[20%] w-[350px] h-[350px] rounded-full bg-blue-500/[0.06] blur-[120px]" />
        </div>
        <div className="relative text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
          <p className="text-white/50 text-sm">Carregando seu projeto...</p>
        </div>
      </div>
    );
  }

  // --- RESULTS VIEW (when clips are ready) ---
  if (showResults && readyCount > 0) {
    return (
      <div className="min-h-screen bg-[#080810]">
        {/* Ambient orbs */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[10%] left-[15%] w-[500px] h-[500px] rounded-full bg-purple-500/[0.06] blur-[150px]" />
          <div className="absolute bottom-[10%] right-[15%] w-[400px] h-[400px] rounded-full bg-blue-500/[0.05] blur-[130px]" />
        </div>

        {/* Header */}
        <header className="relative z-10 border-b border-white/[0.06] bg-[#080810]/80 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
            <Button variant="ghost" onClick={() => navigate('/dashboard')} className="gap-2 text-white/60 hover:text-white hover:bg-white/5">
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </Button>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Concluido
            </Badge>
          </div>
        </header>

        <div className="relative z-10 mx-auto max-w-6xl px-6 py-8">
          {/* Success Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <Sparkles className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {readyCount} clips prontos!
            </h1>
            <p className="text-white/50 text-sm max-w-md mx-auto">
              Seus clips foram analisados com inteligencia viral. Baixe e poste nas redes sociais.
            </p>
          </div>

          {/* Sort Controls */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setShowResults(false)}
              className="text-sm text-white/40 hover:text-white/60 transition-colors flex items-center gap-1"
            >
              <TrendingUp className="w-3.5 h-3.5" /> Ver pipeline
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('original')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  sortBy === 'original' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
                )}
              >
                Original
              </button>
              <button
                onClick={() => setSortBy('viral')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1',
                  sortBy === 'viral' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
                )}
              >
                <TrendingUp className="w-3 h-3" /> Por Score
              </button>
            </div>
          </div>

          {/* Clips Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 mb-8">
            {sortedClips.map((clip, index) => (
              <ClipCardPro
                key={clip.id}
                clip={clip}
                index={index}
                jobId={id}
                apiKey={import.meta.env.VITE_API_KEY || ''}
                totalClips={clips.length}
                onOpenPlayer={(i) => setPlayerClipIndex(i)}
              />
            ))}
          </div>

          {/* Shared Player Modal with navigation */}
          <ClipPlayerModal
            clips={sortedClips}
            currentIndex={playerClipIndex ?? 0}
            open={playerClipIndex !== null}
            onOpenChange={(open) => { if (!open) setPlayerClipIndex(null); }}
            onNavigate={setPlayerClipIndex}
            jobId={id || ''}
            apiKey={import.meta.env.VITE_API_KEY || ''}
          />

          {/* Debug in dev */}
          {process.env.NODE_ENV === 'development' && (
            <Accordion type="single" collapsible className="w-full mb-8">
              <AccordionItem value="debug">
                <AccordionTrigger className="text-sm text-white/40">Debug</AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <ClipDebugPanel jobResult={jobStatus || job} clipDebugInfo={debugInfo} onRefresh={() => window.location.reload()} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </div>
    );
  }

  // --- MAIN PROCESSING VIEW ---
  const currentTip = PROCESSING_TIPS[tipIndex];
  const errorMsg = friendlyError(job?.error || error);

  return (
    <div className="fixed inset-0 bg-[#080810] overflow-y-auto">
      {/* Ambient gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[15%] left-[18%] w-[500px] h-[500px] rounded-full bg-purple-500/[0.08] blur-[150px] animate-float" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[15%] right-[18%] w-[400px] h-[400px] rounded-full bg-blue-500/[0.06] blur-[130px] animate-float" style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute top-[60%] left-[50%] w-[300px] h-[300px] rounded-full bg-emerald-500/[0.04] blur-[100px] -translate-x-1/2" />
      </div>

      {/* Minimal header */}
      <header className="relative z-10 px-6 pt-6 pb-2">
        <div className="mx-auto max-w-[560px] flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="gap-2 text-white/50 hover:text-white hover:bg-white/5 h-9 px-3 text-sm">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </Button>
          <div className="flex items-center gap-2">
            {(connectionType === 'polling' || !isConnected) && isProcessing && (
              <span className="text-[10px] text-yellow-500/60 flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Sincronizando
              </span>
            )}
            <button onClick={handleCopyJobId} className="text-white/30 hover:text-white/50 transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main centered content */}
      <div className="relative z-10 flex flex-col items-center px-6 pt-4 pb-16">
        <div className="w-full max-w-[560px]">

          {/* Status indicator */}
          <div className="text-center mb-8">
            {isProcessing && (
              <>
                <div className="relative w-20 h-20 mx-auto mb-5">
                  {/* Rotating gradient ring */}
                  <div className="absolute inset-0 rounded-full animate-spin" style={{
                    animationDuration: '3s',
                    background: 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, hsl(262 100% 65%) 330deg, hsl(200 100% 60%) 360deg)',
                    mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), white calc(100% - 3px))',
                    WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), white calc(100% - 3px))',
                  }} />
                  {/* Inner circle with percentage */}
                  <div className="absolute inset-[6px] rounded-full bg-[#080810] flex items-center justify-center">
                    <span className="text-lg font-bold text-white tabular-nums">{Math.round(overallProgress)}%</span>
                  </div>
                </div>
                <h1 className="text-xl font-semibold text-white mb-1.5">
                  Gerando seus clips...
                </h1>
                <p className="text-sm text-white/40">
                  {activeStep ? STEP_DETAILS[activeStep.id]?.activeLabel || activeStep.label : 'Iniciando processamento...'}
                </p>
              </>
            )}

            {isCompleted && readyCount === 0 && (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h1 className="text-xl font-semibold text-white mb-1.5">Processamento concluido</h1>
                <p className="text-sm text-white/40">Nenhum clip foi gerado para este video.</p>
              </>
            )}

            {isFailed && (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <h1 className="text-xl font-semibold text-white mb-1.5">Algo deu errado</h1>
                <p className="text-sm text-white/40">{errorMsg || 'Ocorreu um erro durante o processamento.'}</p>
              </>
            )}
          </div>

          {/* Main glass card — Pipeline */}
          <div className={cn(
            'relative rounded-2xl p-[1px] mb-6',
            isProcessing && 'processing-border-glow',
          )}>
            {/* Animated border for processing state */}
            {isProcessing && (
              <div className="absolute inset-0 rounded-2xl overflow-hidden">
                <div className="absolute inset-0 animate-spin" style={{
                  animationDuration: '4s',
                  background: 'conic-gradient(from 0deg, transparent, hsl(262 100% 65% / 0.4), hsl(200 100% 60% / 0.4), transparent)',
                }} />
              </div>
            )}
            {isCompleted && !isFailed && (
              <div className="absolute inset-0 rounded-2xl bg-emerald-500/20" style={{
                boxShadow: '0 0 30px rgba(16, 185, 129, 0.1)',
              }} />
            )}
            {isFailed && (
              <div className="absolute inset-0 rounded-2xl bg-red-500/20" />
            )}

            {/* Card content */}
            <div className="relative rounded-2xl bg-[#0d0d14]/90 backdrop-blur-xl border border-white/[0.06] overflow-hidden">
              {/* Project info — minimal */}
              <div className="px-5 pt-5 pb-4 border-b border-white/[0.04]">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-medium text-white truncate">{getProjectDisplayTitle()}</h2>
                    <div className="flex items-center gap-1.5 mt-1 text-white/30">
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      <span className="text-xs truncate">{formatUrl(job.youtubeUrl)}</span>
                    </div>
                  </div>
                  <span className="text-xs text-white/30 ml-3 flex-shrink-0">{getEstimatedTime()}</span>
                </div>
              </div>

              {/* Steps */}
              <div className="px-5 py-4 space-y-1">
                {stepOrder.map((stepId, index) => {
                  const status = getStepStatus(stepId);
                  const detail = STEP_DETAILS[stepId];
                  const isActive = status === 'active';
                  const isComplete = status === 'completed';
                  const hasFailed = status === 'failed';

                  return (
                    <div
                      key={stepId}
                      className={cn(
                        'flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-300',
                        isActive && 'bg-purple-500/[0.08] border border-purple-500/[0.12]',
                        hasFailed && 'bg-red-500/[0.06] border border-red-500/[0.12]',
                      )}
                    >
                      {/* Status icon */}
                      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center">
                        {isComplete && (
                          <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          </div>
                        )}
                        {isActive && (
                          <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                          </div>
                        )}
                        {hasFailed && (
                          <div className="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center">
                            <AlertCircle className="w-4 h-4 text-red-400" />
                          </div>
                        )}
                        {status === 'pending' && (
                          <div className="w-7 h-7 rounded-full border border-white/[0.08] flex items-center justify-center">
                            <span className="text-white/20">{STEP_ICONS[stepId]}</span>
                          </div>
                        )}
                      </div>

                      {/* Label */}
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          'text-sm font-medium',
                          isComplete && 'text-emerald-400/80',
                          isActive && 'text-white',
                          hasFailed && 'text-red-400',
                          status === 'pending' && 'text-white/25',
                        )}>
                          {detail.label}
                        </span>
                        {isActive && (
                          <p className="text-xs text-white/40 mt-0.5">{detail.activeLabel}</p>
                        )}
                      </div>

                      {/* Step number */}
                      <span className={cn(
                        'text-[10px] flex-shrink-0',
                        isComplete && 'text-emerald-400/40',
                        isActive && 'text-purple-400/60',
                        hasFailed && 'text-red-400/40',
                        status === 'pending' && 'text-white/15',
                      )}>
                        {index + 1}/{stepOrder.length}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar at bottom */}
              {isProcessing && (
                <div className="px-5 pb-4">
                  <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${overallProgress}%`,
                        background: 'linear-gradient(90deg, hsl(262 100% 65%), hsl(200 100% 60%))',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error banner */}
          {errorMsg && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.15] flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-300">{errorMsg}</span>
            </div>
          )}

          {/* Stalled warning */}
          {(stalled || jobStatus?.pipelineStatus?.isStalled) && (
            <div className="mb-6 px-4 py-4 rounded-xl bg-yellow-500/[0.06] border border-yellow-500/[0.12]">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-yellow-300">Processamento travado</span>
              </div>
              <p className="text-xs text-white/40 mb-3">
                Sem progresso ha alguns minutos no estagio: <strong className="text-white/60">{jobStatus?.pipelineStatus?.stage || 'desconhecido'}</strong>
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={reconnect} className="text-xs h-8 border-white/10 text-white/60 hover:text-white">
                  Reconectar
                </Button>
                <Button size="sm" onClick={refreshNow} className="text-xs h-8">
                  Atualizar agora
                </Button>
              </div>
            </div>
          )}

          {/* Failed actions */}
          {isFailed && (
            <div className="flex gap-3 mb-6">
              <Button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex-1 h-11 bg-white text-[#080810] font-semibold hover:bg-white/90"
              >
                {isRetrying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Tentar novamente
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/dashboard')}
                className="h-11 border-white/10 text-white/60 hover:text-white"
              >
                Dashboard
              </Button>
            </div>
          )}

          {/* Completed with no clips */}
          {isCompleted && readyCount === 0 && (
            <div className="flex gap-3 mb-6">
              <Button
                onClick={() => navigate('/dashboard')}
                className="flex-1 h-11 bg-white text-[#080810] font-semibold hover:bg-white/90"
              >
                Tentar novo video
              </Button>
            </div>
          )}

          {/* Rotating tip */}
          {isProcessing && (
            <div className="text-center mb-8">
              <div
                key={tipIndex}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]"
                style={{ animation: 'fadeInUp 0.4s ease-out' }}
              >
                <span className="text-base">{currentTip.emoji}</span>
                <span className="text-xs text-white/40">{currentTip.text}</span>
              </div>
            </div>
          )}

          {/* "You can leave" message */}
          {isProcessing && (
            <p className="text-center text-[11px] text-white/20 mb-8">
              Voce pode sair desta pagina — o processamento continua em background.
            </p>
          )}

          {/* Show partial clips if available during processing */}
          {isProcessing && clips.length > 0 && clips.some(c => c.status === 'ready') && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-white/60">Primeiros clips prontos</span>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {clips.filter(c => c.status === 'ready').slice(0, 3).map((clip, index) => (
                  <ClipCard key={clip.id} clip={clip} index={index} jobId={id} apiKey={import.meta.env.VITE_API_KEY || ''} />
                ))}
              </div>
            </div>
          )}

          {/* Results hint when complete */}
          {isCompleted && readyCount > 0 && !showResults && (
            <div className="text-center">
              <Button
                onClick={() => setShowResults(true)}
                className="h-12 px-8 bg-white text-[#080810] font-semibold hover:bg-white/90 rounded-xl"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Ver {readyCount} clips prontos
              </Button>
            </div>
          )}

          {/* Debug panels — dev only */}
          {process.env.NODE_ENV === 'development' && (
            <Accordion type="single" collapsible className="w-full mt-8">
              <AccordionItem value="diagnostics" className="border-white/[0.06]">
                <AccordionTrigger className="text-xs text-white/30 hover:text-white/50">
                  Debug & Diagnostics
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <WorkerDiagnosticPanel
                    jobId={id || ''}
                    jobStatus={jobStatus?.status}
                    workerHealth={jobStatus?.workerHealth}
                    onRefresh={reconnect}
                  />
                  <VideoDebugPanel
                    jobStatus={jobStatus}
                    clipDebugInfo={debugInfo}
                    connectionInfo={{ isConnected, connectionType, error }}
                    onRefresh={() => window.location.reload()}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
