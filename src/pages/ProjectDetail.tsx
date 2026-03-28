import { useParams, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import { ClipDebugPanel } from '@/components/debug/ClipDebugPanel';
import { SubtitleSettingsWarning } from '@/components/SubtitleSettingsWarning';
import { EmptyState } from '@/components/EmptyState';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getUserJobs, updateJobStatus, saveUserJob } from '@/lib/storage';
import { Job, createTempConfig } from '@/lib/jobs-api';
import { getBackendUrl } from '@/lib/backend-url';
import { useToast } from '@/hooks/use-toast';
import { toastError } from '@/lib/error-messages';
import { createProjectTitle } from '@/lib/youtube-metadata';
import posthog from 'posthog-js';
import { isValidYouTubeUrl } from '@/lib/youtube';
import { cn } from '@/lib/utils';
import type { Clip, RemixVariant } from '@/hooks/useClipList';

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
  render: { label: 'Renderização', activeLabel: 'Criando vídeos otimizados...' },
  texts: { label: 'Metadados', activeLabel: 'Gerando títulos e hashtags com GPT-4...' },
  export: { label: 'Exportação', activeLabel: 'Finalizando e preparando downloads...' },
};

const REMIX_PLATFORM_LABELS: Record<RemixVariant['platform'], string> = {
  youtube_shorts: 'YouTube Shorts',
  instagram_reels: 'Instagram Reels',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
};

const REMIX_GOAL_LABELS = {
  viral: 'Viralizar',
  conversion: 'Converter',
  authority: 'Autoridade',
  engagement: 'Engajar',
} as const;

const REMIX_HOOK_LABELS = {
  bold: 'Bold',
  curiosity: 'Curiosidade',
  teaching: 'Educacional',
  story: 'Story',
} as const;

const REMIX_COPY_LABELS = {
  punchy: 'Punchy',
  conversational: 'Conversational',
  expert: 'Expert',
} as const;

const LIVE_DECK_COPY: Record<string, { badge: string; title: string; description: string }> = {
  ingest: {
    badge: 'Montando a fila',
    title: 'Separando os primeiros cortes',
    description: 'Estamos baixando o video e organizando os lotes que vao entrar na esteira.',
  },
  transcribe: {
    badge: 'Ouvindo o conteudo',
    title: 'Transformando fala em materia-prima',
    description: 'A base textual esta sendo preparada para encontrar os melhores ganchos.',
  },
  scenes: {
    badge: 'Momentos detectados',
    title: 'Mapeando trechos com chance de reter',
    description: 'A IA esta pinçando os pontos mais promissores para virar clip.',
  },
  rank: {
    badge: 'Ranking ao vivo',
    title: 'Priorizando o que merece sair primeiro',
    description: 'Os cortes mais fortes sobem para a frente da fila antes do restante.',
  },
  render: {
    badge: 'Renderizando agora',
    title: 'Montando vertical, crop e legenda',
    description: 'Os primeiros clips podem ficar prontos antes do job inteiro terminar.',
  },
  texts: {
    badge: 'Lapidando copy',
    title: 'Fechando titulo, descricao e hashtags',
    description: 'Os proximos clips estao ganhando o pacote completo para publicacao.',
  },
  export: {
    badge: 'Saindo da esteira',
    title: 'Empacotando os downloads finais',
    description: 'Os clips prontos entram na frente enquanto o resto termina de fechar.',
  },
};

const formatClipDuration = (duration?: number) => {
  if (!duration || duration <= 0) return 'Calculando';

  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60);

  if (minutes === 0) return `${seconds}s`;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const getClipTeaser = (clip: Clip) => {
  const transcriptText = clip.transcript
    ?.map((entry) => entry.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sourceText = transcriptText || clip.description || '';
  const cleaned = sourceText === 'Processando...' ? '' : sourceText;

  if (!cleaned) return 'A IA esta preparando este corte agora para colocar ele na frente da fila.';

  return cleaned.length > 150 ? `${cleaned.slice(0, 147)}...` : cleaned;
};

const WorkerDiagnosticPanel = lazy(() =>
  import('@/components/WorkerDiagnosticPanel').then((module) => ({
    default: module.WorkerDiagnosticPanel,
  }))
);

const VideoDebugPanel = lazy(() =>
  import('@/components/debug/VideoDebugPanel').then((module) => ({
    default: module.VideoDebugPanel,
  }))
);

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
  const [selectedRemixClipId, setSelectedRemixClipId] = useState<string | null>(null);
  const [highlightedReadyClipId, setHighlightedReadyClipId] = useState<string | null>(null);
  const telemetryFired = useRef<'none' | 'completed' | 'failed'>('none');
  const firstValueTelemetryFired = useRef(false);
  const previousReadyClipIdsRef = useRef<string[]>([]);

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
    const currentStatus = jobStatus?.status || job?.status;

    if (readyCount > 0 && !showResults && (currentStatus === 'completed' || currentStatus === 'failed')) {
      const timer = setTimeout(() => {
        setShowResults(true);
        toast({
          title: currentStatus === 'completed' ? "Seus clips estao prontos!" : "Resultado parcial disponivel",
          description: currentStatus === 'completed'
            ? `${readyCount} clips foram gerados com sucesso`
            : `${readyCount} clips ficaram prontos, mas o processamento nao concluiu como esperado`,
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [jobStatus?.status, job?.status, readyCount, showResults, toast]);

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

        const response = await fetch(`${baseUrl}/jobs/${id}`, {
          credentials: 'include',
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
        title: "Projeto não encontrado",
        description: "O projeto solicitado não foi encontrado. Tente novamente.",
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

          // TTV tracking: clips are ready. The real "viewed" event fires only
          // after the results UI is visible to the user.
          const allUserJobs = user?.id ? getUserJobs(user.id) : [];
          const completedJobs = allUserJobs.filter(j => j.status === 'completed');
          if (completedJobs.length <= 1) {
            posthog.capture('first_clips_ready', {
              job_id: job.id,
              clips_count: clipsCount,
              timestamp: new Date().toISOString(),
            });
          }
        } else if (jobStatus.status === 'failed' && telemetryFired.current === 'none') {
          telemetryFired.current = 'failed';
          posthog.capture('pipeline failed', { rootId: job.id, stage: jobStatus.currentStep || 'unknown' });
        }
      } catch {}
    }
  }, [jobStatus, job, user?.id, overallProgress, readyCount]);

  useEffect(() => {
    if (!showResults || readyCount <= 0 || !job || !user?.id || firstValueTelemetryFired.current) {
      return;
    }

    const completedJobs = getUserJobs(user.id).filter((existingJob) => existingJob.status === 'completed');
    if (completedJobs.length > 1) {
      return;
    }

    firstValueTelemetryFired.current = true;
    try {
      posthog.capture('first_clip_viewed', {
        job_id: job.id,
        clips_count: readyCount,
        result_type: jobStatus?.status === 'failed' ? 'partial' : 'completed',
        timestamp: new Date().toISOString(),
      });
    } catch {}
  }, [showResults, readyCount, job, user?.id, jobStatus?.status]);

  const handleCopyJobId = () => {
    if (id) {
      navigator.clipboard.writeText(id);
      toast({ title: "ID copiado!", description: "ID do projeto copiado para a área de transferência" });
    }
  };

  const handleRetry = async () => {
    const youtubeUrl = job?.youtubeUrl || jobStatus?.result?.metadata?.url;
    if (!youtubeUrl || !isValidYouTubeUrl(youtubeUrl)) {
      toast({
        title: "Não é possível reprocessar",
        description: "A URL original não está disponível. Crie um novo projeto com o mesmo vídeo.",
        variant: "destructive",
      });
      navigate('/projects/new');
      return;
    }
    setIsRetrying(true);
    try {
      posthog.capture('job retry', { jobId: id });
      const { tempId } = await createTempConfig(youtubeUrl, getToken);
      toast({ title: "Novo processamento criado!", description: "Revise as configurações e tente novamente." });
      navigate(`/projects/configure/${tempId}`);
    } catch (error: any) {
      toastError(toast, error, "Erro ao reprocessar");
    } finally {
      setIsRetrying(false);
    }
  };

  function friendlyError(msg?: string | null) {
    if (!msg) return null;
    const m = String(msg);
    if (m.includes('QUOTA_EXCEEDED') || m.toLowerCase().includes('quota')) return 'Quota do YouTube atingida. Tente novamente em alguns minutos.';
    if (m.includes('401') || m.includes('unauthorized')) return 'Problema de autenticação. Recarregue a página.';
    if (
      m.toLowerCase().includes('youtube') ||
      m.toLowerCase().includes('blocked') ||
      m.toLowerCase().includes('bot') ||
      m.toLowerCase().includes('cookies') ||
      m.toLowerCase().includes('visitor_data') ||
      m.toLowerCase().includes('po_token')
    ) return 'YouTube temporariamente indisponível. Tente fazer upload do arquivo.';
    if (m.toLowerCase().includes('timeout') || m.toLowerCase().includes('network')) return 'Conexão instável. Verificando status automaticamente...';
    if (m.toLowerCase().includes('private') || m.toLowerCase().includes('unavailable')) return 'Vídeo privado ou indisponível. Use apenas vídeos públicos.';
    return 'Ocorreu um erro no processamento. Tente novamente.';
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
  const readyClips = clips.filter((clip) => clip.status === 'ready');
  const queuedClips = clips.filter((clip) => clip.status !== 'ready' && clip.status !== 'failed');
  const highlightedReadyClip = highlightedReadyClipId
    ? readyClips.find((clip) => clip.id === highlightedReadyClipId) || null
    : null;
  const prioritizedReadyClips = highlightedReadyClip
    ? [highlightedReadyClip, ...readyClips.filter((clip) => clip.id !== highlightedReadyClip.id)]
    : readyClips;
  const liveDeckClips = [...prioritizedReadyClips, ...queuedClips];
  const remixReadyClips = sortedClips.filter((clip) => clip.remixPackage?.variants?.length);
  const selectedRemixClip =
    remixReadyClips.find((clip) => clip.id === selectedRemixClipId) || remixReadyClips[0] || null;
  const isProcessing = job?.status === 'active' || job?.status === 'queued';
  const isCompleted = job?.status === 'completed';
  const isFailed = job?.status === 'failed';

  const stepOrder = ['ingest', 'transcribe', 'scenes', 'rank', 'render', 'texts', 'export'];
  const liveDeckCopy = LIVE_DECK_COPY[activeStep?.id || 'ingest'] || LIVE_DECK_COPY.ingest;
  const readyClipIdsSignature = readyClips.map((clip) => clip.id).join('|');

  useEffect(() => {
    const currentReadyIds = readyClips.map((clip) => clip.id);
    const previousReadyIds = previousReadyClipIdsRef.current;
    const newReadyClipId = currentReadyIds.find((clipId) => !previousReadyIds.includes(clipId));

    previousReadyClipIdsRef.current = currentReadyIds;

    if (!newReadyClipId) return;

    setHighlightedReadyClipId(newReadyClipId);

    const timer = setTimeout(() => {
      setHighlightedReadyClipId((current) => current === newReadyClipId ? null : current);
    }, 1800);

    return () => clearTimeout(timer);
  }, [readyClipIdsSignature]);

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

  useEffect(() => {
    if (remixReadyClips.length === 0) {
      if (selectedRemixClipId !== null) {
        setSelectedRemixClipId(null);
      }
      return;
    }

    const stillExists = remixReadyClips.some((clip) => clip.id === selectedRemixClipId);
    if (!stillExists) {
      setSelectedRemixClipId(remixReadyClips[0].id);
    }
  }, [remixReadyClips, selectedRemixClipId]);

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: `${label} copiado`,
        description: 'Conteúdo enviado para a área de transferência.',
      });
    } catch (error) {
      toast({
        title: `Falha ao copiar ${label.toLowerCase()}`,
        description: 'Não foi possível copiar agora.',
        variant: 'destructive',
      });
    }
  };

  const buildVariantCopy = (variant: RemixVariant) => {
    return [
      `PLATAFORMA: ${REMIX_PLATFORM_LABELS[variant.platform]}`,
      `HOOK: ${variant.hook}`,
      `TITULO: ${variant.title}`,
      `DESCRICAO: ${variant.description}`,
      `CTA: ${variant.cta}`,
      `HASHTAGS: ${variant.hashtags.join(' ')}`,
      `NOTAS: ${variant.editingNotes.join(' | ')}`,
    ].join('\n');
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
    const isPartialResult = isFailed;

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
            <Badge className={cn(
              isPartialResult
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
            )}>
              <CheckCircle2 className="w-3 h-3 mr-1" /> {isPartialResult ? 'Parcial' : 'Concluido'}
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
              {isPartialResult ? `${readyCount} clips parciais` : `${readyCount} clips prontos!`}
            </h1>
            <p className="text-white/50 text-sm max-w-md mx-auto">
              {isPartialResult
                ? 'Parte dos clips ficou pronta, mas o processamento terminou abaixo da meta esperada. Recomendado reprocessar.'
                : 'Seus clips foram analisados com inteligencia viral. Baixe e poste nas redes sociais.'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 mb-8">
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

          {selectedRemixClip?.remixPackage && (
            <section className="mb-8 rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
              <div className="border-b border-white/[0.06] px-6 py-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-purple-300/70 mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    Remix Por Plataforma
                  </div>
                  <h2 className="text-xl font-semibold text-white">Pacote pronto para reaproveitar os clips</h2>
                  <p className="text-sm text-white/45 mt-1">
                    Hooks, títulos, CTA e copy ajustados por canal para o clipe selecionado.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-purple-500/15 text-purple-200 border-purple-500/25">
                    Meta: {REMIX_GOAL_LABELS[selectedRemixClip.remixPackage.goal]}
                  </Badge>
                  <Badge className="bg-white/[0.06] text-white/70 border-white/[0.08]">
                    Hook: {REMIX_HOOK_LABELS[selectedRemixClip.remixPackage.hookStyle]}
                  </Badge>
                  <Badge className="bg-white/[0.06] text-white/70 border-white/[0.08]">
                    Copy: {REMIX_COPY_LABELS[selectedRemixClip.remixPackage.captionStyle]}
                  </Badge>
                </div>
              </div>

              <div className="px-6 py-5 border-b border-white/[0.06]">
                <div className="flex flex-wrap gap-2">
                  {remixReadyClips.map((clip, index) => (
                    <button
                      key={clip.id}
                      type="button"
                      onClick={() => setSelectedRemixClipId(clip.id)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-xs transition-all border',
                        selectedRemixClip.id === clip.id
                          ? 'bg-purple-500/18 text-white border-purple-500/35'
                          : 'bg-white/[0.03] text-white/55 border-white/[0.08] hover:text-white hover:bg-white/[0.06]'
                      )}
                    >
                      {`Clipe ${index + 1}`}
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-white/[0.06] bg-[#0c0c14] px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.18em] text-white/30 mb-2">Clipe Base</p>
                      <h3 className="text-base font-semibold text-white">{selectedRemixClip.title}</h3>
                      <p className="text-sm text-white/45 mt-1 max-w-3xl">{selectedRemixClip.description}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.08]"
                      onClick={() => copyText('pacote completo', JSON.stringify(selectedRemixClip.remixPackage, null, 2))}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar JSON
                    </Button>
                  </div>

                  {selectedRemixClip.remixPackage.altHooks.length > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-xs uppercase tracking-[0.18em] text-white/30">Hooks Alternativos</p>
                        <button
                          type="button"
                          onClick={() => copyText('hooks alternativos', selectedRemixClip.remixPackage!.altHooks.join('\n'))}
                          className="text-xs text-purple-300/80 hover:text-purple-200"
                        >
                          Copiar hooks
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedRemixClip.remixPackage.altHooks.map((hook, index) => (
                          <button
                            key={`${selectedRemixClip.id}-hook-${index}`}
                            type="button"
                            onClick={() => copyText('hook', hook)}
                            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/[0.07] text-left"
                          >
                            {hook}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
                {selectedRemixClip.remixPackage.variants.map((variant) => (
                  <article
                    key={`${selectedRemixClip.id}-${variant.platform}`}
                    className="rounded-2xl border border-white/[0.08] bg-[#0c0c14] p-5"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold text-white">
                            {REMIX_PLATFORM_LABELS[variant.platform]}
                          </h3>
                          {variant.platform === selectedRemixClip.remixPackage!.primaryPlatform && (
                            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25">
                              Principal
                            </Badge>
                          )}
                          <Badge className="bg-white/[0.06] text-white/60 border-white/[0.08]">
                            {variant.aspectRatio}
                          </Badge>
                        </div>
                        <p className="text-sm text-white/35 mt-1">{variant.cta}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.08]"
                        onClick={() => copyText(REMIX_PLATFORM_LABELS[variant.platform], buildVariantCopy(variant))}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-white/30 mb-2">Hook</p>
                        <button
                          type="button"
                          onClick={() => copyText('hook', variant.hook)}
                          className="w-full rounded-xl border border-purple-500/20 bg-purple-500/[0.08] px-3 py-3 text-left text-sm text-purple-100 hover:bg-purple-500/[0.12]"
                        >
                          {variant.hook}
                        </button>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-white/30 mb-2">Título</p>
                        <p className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-sm text-white/85">
                          {variant.title}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-white/30 mb-2">Descrição</p>
                        <p className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-sm text-white/70">
                          {variant.description}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-white/30 mb-2">Hashtags</p>
                        <div className="flex flex-wrap gap-2">
                          {variant.hashtags.map((hashtag) => (
                            <button
                              key={`${selectedRemixClip.id}-${variant.platform}-${hashtag}`}
                              type="button"
                              onClick={() => copyText('hashtag', hashtag)}
                              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-white/70 hover:text-white hover:bg-white/[0.07]"
                            >
                              {hashtag}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-white/30 mb-2">Notas de edição</p>
                        <div className="space-y-2">
                          {variant.editingNotes.map((note, index) => (
                            <div
                              key={`${selectedRemixClip.id}-${variant.platform}-note-${index}`}
                              className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/60"
                            >
                              {note}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

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
        <div className="mx-auto max-w-6xl flex items-center justify-between">
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
      <div className="relative z-10 px-6 pt-4 pb-16">
        <div className="mx-auto w-full max-w-6xl">
          {/* Status indicator */}
          <div className="mx-auto mb-8 max-w-[560px] text-center">
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

          <div className={cn(
            'grid gap-6',
            isProcessing && 'xl:grid-cols-[minmax(0,540px)_minmax(0,1fr)] xl:items-start',
          )}>
            <div className="min-w-0">
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

              {/* Error banner — only show when job actually failed, not during active processing */}
              {errorMsg && isFailed && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.15] flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-sm text-red-300">{errorMsg}</span>
                </div>
              )}

              {/* Stalled warning — only show if job is not actively processing */}
              {(stalled || jobStatus?.pipelineStatus?.isStalled) && !isProcessing && (
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
                      <Suspense fallback={<div className="text-xs text-white/30">Carregando diagnosticos...</div>}>
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
                      </Suspense>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>

            {isProcessing && (
              <aside className="min-w-0">
                <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0d0d14]/85 p-5 backdrop-blur-2xl md:p-6">
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute -top-20 right-[-5%] h-56 w-56 rounded-full bg-purple-500/[0.16] blur-[110px]" />
                    <div className="absolute bottom-[-15%] left-[-5%] h-52 w-52 rounded-full bg-emerald-500/[0.12] blur-[100px]" />
                    <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                  </div>

                  <div className="relative">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/[0.10] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-purple-200/90">
                          <Sparkles className="w-3.5 h-3.5" />
                          Mesa de cortes ao vivo
                        </div>
                        <h2 className="mt-4 text-2xl font-semibold text-white">Os clips prontos entram na frente</h2>
                        <p className="mt-2 max-w-xl text-sm text-white/50">{liveDeckCopy.description}</p>
                      </div>

                      {readyCount > 0 && (
                        <Button
                          variant="outline"
                          onClick={() => setShowResults(true)}
                          className="border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.08]"
                        >
                          Ver {readyCount} prontos
                        </Button>
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Badge className="bg-white/[0.06] text-white/75 border-white/[0.08]">
                        {readyCount}/{clips.length} prontos
                      </Badge>
                      <Badge className="bg-purple-500/15 text-purple-200 border-purple-500/25">
                        {liveDeckCopy.badge}
                      </Badge>
                      <Badge className="bg-white/[0.06] text-white/60 border-white/[0.08]">
                        <Clock className="w-3 h-3 mr-1.5" />
                        {getEstimatedTime()}
                      </Badge>
                    </div>

                    <div className="relative mt-8 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 -mx-2 px-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
                      <div className="flex gap-4" style={{ width: `${liveDeckClips.length * 340}px` }}>
                      {liveDeckClips.map((clip, index) => {
                        const isReadyCard = clip.status === 'ready';
                        const isFreshReadyCard = isReadyCard && clip.id === highlightedReadyClipId;
                        const readyClipIndex = readyClips.findIndex((readyClip) => readyClip.id === clip.id);
                        const progressValue = isReadyCard ? 100 : Math.max(18, Math.min(92, overallProgress - index * 9));

                        return (
                          <div
                            key={`${clip.id}-${index}`}
                            className="snap-start flex-shrink-0 w-[320px] transition-all duration-500 ease-out"
                          >
                            <div className={cn(
                              'relative overflow-hidden rounded-[30px] border shadow-[0_30px_80px_rgba(0,0,0,0.35)]',
                              isFreshReadyCard && 'fresh-ready-card',
                              isReadyCard ? 'border-emerald-400/25 bg-[#10141b]' : 'border-white/[0.08] bg-[#101018]/90',
                            )}>
                              {isFreshReadyCard && (
                                <>
                                  <div className="fresh-ready-halo pointer-events-none absolute inset-[-8px] rounded-[34px] border border-emerald-300/45" />
                                  <div className="fresh-ready-badge pointer-events-none absolute right-5 top-5 rounded-full border border-emerald-300/35 bg-emerald-500/18 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100 shadow-[0_10px_30px_rgba(16,185,129,0.25)]">
                                    Novo clip
                                  </div>
                                </>
                              )}
                              {isReadyCard && clip.thumbnailUrl && (
                                <div
                                  className="absolute inset-0 bg-cover bg-center"
                                  style={{ backgroundImage: `url(${clip.thumbnailUrl})` }}
                                />
                              )}
                              <div className={cn(
                                'absolute inset-0',
                                isReadyCard
                                  ? 'bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(8,8,16,0.15)_32%,rgba(8,8,16,0.94)_88%)]'
                                  : 'bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]',
                              )} />
                              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#080810] to-transparent" />

                              <div className="relative p-5 md:p-6">
                                <div className="flex items-start justify-between gap-3">
                                  <div className={cn(
                                    'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                                    isReadyCard
                                      ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                                      : 'border-white/[0.08] bg-white/[0.05] text-white/70',
                                  )}>
                                    {isReadyCard ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    {isReadyCard ? (isFreshReadyCard ? 'Entrou agora' : 'Pronto agora') : liveDeckCopy.badge}
                                  </div>

                                  <div className="text-right">
                                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                                      {isReadyCard ? `Clip ${readyClipIndex + 1}` : `Fila ${String(index + 1).padStart(2, '0')}`}
                                    </p>
                                    <p className="mt-1 text-xs font-medium text-white/55">
                                      {isReadyCard ? formatClipDuration(clip.duration) : 'em progresso'}
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-10 space-y-3 md:mt-12">
                                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/30">
                                    {isReadyCard ? (
                                      <TrendingUp className="w-3.5 h-3.5 text-emerald-300/80" />
                                    ) : (
                                      <Video className="w-3.5 h-3.5 text-purple-300/80" />
                                    )}
                                    {isReadyCard ? 'Clip liberado' : 'Ainda na esteira'}
                                  </div>

                                  <h3 className="max-w-lg text-xl font-semibold text-white md:text-2xl">
                                    {isReadyCard ? clip.title : liveDeckCopy.title}
                                  </h3>

                                  <p className="max-w-xl text-sm leading-6 text-white/60">
                                    {isReadyCard ? getClipTeaser(clip) : liveDeckCopy.description}
                                  </p>
                                </div>

                                <div className="mt-6 flex flex-wrap items-end justify-between gap-4 md:mt-8">
                                  <div className="space-y-3">
                                    <div className="h-1.5 w-44 overflow-hidden rounded-full bg-white/[0.07]">
                                      <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{
                                          width: `${progressValue}%`,
                                          background: isReadyCard
                                            ? 'linear-gradient(90deg, rgba(52,211,153,0.8), rgba(16,185,129,1))'
                                            : 'linear-gradient(90deg, hsl(262 100% 65%), hsl(200 100% 60%))',
                                        }}
                                      />
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      {isReadyCard && clip.viralIntel?.overallScore && (
                                        <Badge className="bg-emerald-500/12 text-emerald-200 border-emerald-500/20">
                                          Score {clip.viralIntel.overallScore}
                                        </Badge>
                                      )}
                                      <Badge className="bg-white/[0.06] text-white/60 border-white/[0.08]">
                                        {isReadyCard ? (isFreshReadyCard ? 'Acabou de sair da esteira' : 'Preview liberado antes do fim') : 'Os prontos passam na frente'}
                                      </Badge>
                                    </div>
                                  </div>

                                  {isReadyCard ? (
                                    <Button
                                      onClick={() => {
                                        const clipIndex = readyClips.findIndex((readyClip) => readyClip.id === clip.id);
                                        if (clipIndex >= 0) setPlayerClipIndex(clipIndex);
                                      }}
                                      className="bg-white text-[#080810] hover:bg-white/90"
                                    >
                                      Abrir preview
                                    </Button>
                                  ) : (
                                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white/50">
                                      O proximo clip aparece aqui assim que sair.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    </div>

                    <div className="mt-6 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Fila Inteligente</p>
                        <p className="mt-2 text-sm font-medium text-white">O primeiro clip pronto toma a frente automaticamente.</p>
                      </div>
                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Saida Parcial</p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {readyCount > 0 ? `${readyCount} clip${readyCount > 1 ? 's' : ''} ja pode${readyCount > 1 ? 'm' : ''} ser aberto${readyCount > 1 ? 's' : ''}.` : 'Os primeiros previews vao aparecer assim que a renderizacao comecar.'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">Sensacao de Progresso</p>
                        <p className="mt-2 text-sm font-medium text-white">A tela agora mostra o resultado nascendo, nao apenas esperando a fila terminar.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            )}
          </div>

          {isProcessing && readyClips.length > 0 && (
            <ClipPlayerModal
              clips={readyClips}
              currentIndex={playerClipIndex ?? 0}
              open={playerClipIndex !== null}
              onOpenChange={(open) => { if (!open) setPlayerClipIndex(null); }}
              onNavigate={setPlayerClipIndex}
              jobId={id || ''}
              apiKey={import.meta.env.VITE_API_KEY || ''}
            />
          )}
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes freshReadyPop {
          0% {
            opacity: 0.3;
            transform: translateY(38px) scale(0.92);
            box-shadow: 0 0 0 rgba(16, 185, 129, 0);
          }
          55% {
            opacity: 1;
            transform: translateY(-10px) scale(1.03);
            box-shadow: 0 30px 90px rgba(16, 185, 129, 0.24);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
          }
        }

        @keyframes freshReadyHalo {
          0% {
            opacity: 0;
            transform: scale(0.92);
          }
          20% {
            opacity: 0.9;
          }
          100% {
            opacity: 0;
            transform: scale(1.06);
          }
        }

        @keyframes freshReadyBadge {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(0.86);
          }
          60% {
            opacity: 1;
            transform: translateY(-4px) scale(1.04);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .fresh-ready-card {
          will-change: transform, opacity, box-shadow;
          animation: freshReadyPop 1100ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .fresh-ready-halo {
          animation: freshReadyHalo 1400ms ease-out;
        }

        .fresh-ready-badge {
          will-change: transform, opacity;
          animation: freshReadyBadge 1000ms cubic-bezier(0.22, 1, 0.36, 1);
        }
      `}</style>
    </div>
  );
}
