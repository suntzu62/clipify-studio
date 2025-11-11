import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Loader2,
  Clock,
  AlertCircle,
  Download,
  FileText,
  Scissors,
  TrendingUp,
  Video,
  Type,
  Upload,
  Sparkles
} from 'lucide-react';

interface ProcessingStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress?: number;
}

interface ProcessingPipelineProps {
  currentStep?: string;
  jobStatus: 'queued' | 'active' | 'completed' | 'failed';
  progress: number;
  error?: string | null;
  estimatedTime?: string;
  clipCount?: number;
}

const STEP_ICONS: Record<string, React.ReactNode> = {
  ingest: <Download className="w-5 h-5" />,
  transcribe: <FileText className="w-5 h-5" />,
  scenes: <Scissors className="w-5 h-5" />,
  rank: <TrendingUp className="w-5 h-5" />,
  render: <Video className="w-5 h-5" />,
  texts: <Type className="w-5 h-5" />,
  export: <Upload className="w-5 h-5" />,
};

const STEP_LABELS: Record<string, { label: string; description: string }> = {
  ingest: { label: 'Download', description: 'Baixando vídeo...' },
  transcribe: { label: 'Transcrição', description: 'Convertendo fala em texto...' },
  scenes: { label: 'Detecção de Cenas', description: 'Identificando melhores momentos...' },
  rank: { label: 'Ranking', description: 'Selecionando clipes virais...' },
  render: { label: 'Renderização', description: 'Criando vídeos otimizados...' },
  texts: { label: 'Metadados', description: 'Gerando títulos e hashtags...' },
  export: { label: 'Exportação', description: 'Finalizando para download...' },
};

export const ProcessingPipeline = ({
  currentStep,
  jobStatus,
  progress,
  error,
  estimatedTime = '~3 min',
  clipCount = 8,
}: ProcessingPipelineProps) => {
  const stepOrder = ['ingest', 'transcribe', 'scenes', 'rank', 'render', 'texts', 'export'];

  const getStepStatus = (stepId: string): 'pending' | 'active' | 'completed' | 'failed' => {
    if (jobStatus === 'failed') {
      const currentIndex = stepOrder.indexOf(currentStep || '');
      const stepIndex = stepOrder.indexOf(stepId);

      if (stepId === currentStep) return 'failed';
      if (stepIndex < currentIndex) return 'completed';
      return 'pending';
    }

    if (jobStatus === 'completed') return 'completed';

    const currentIndex = stepOrder.indexOf(currentStep || '');
    const stepIndex = stepOrder.indexOf(stepId);

    if (stepId === currentStep) return 'active';
    if (stepIndex < currentIndex) return 'completed';
    return 'pending';
  };

  const steps: ProcessingStep[] = stepOrder.map((stepId) => ({
    id: stepId,
    label: STEP_LABELS[stepId].label,
    description: STEP_LABELS[stepId].description,
    icon: STEP_ICONS[stepId],
    status: getStepStatus(stepId),
  }));

  const activeStep = steps.find((s) => s.status === 'active');
  const completedSteps = steps.filter((s) => s.status === 'completed').length;

  const getStatusIcon = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'active':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = () => {
    switch (jobStatus) {
      case 'queued':
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Na Fila</Badge>;
      case 'active':
        return <Badge variant="default" className="gap-1"><Sparkles className="w-3 h-3 animate-pulse" /> Processando</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Concluído</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Erro</Badge>;
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-primary text-primary-foreground">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Video className="w-5 h-5" />
            Pipeline de Criação
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Overall Progress */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <p className="text-sm font-medium">Progresso Geral</p>
              <p className="text-xs text-muted-foreground">
                {completedSteps} de {steps.length} etapas concluídas
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">{Math.round(progress)}%</p>
              <p className="text-xs text-muted-foreground">{estimatedTime}</p>
            </div>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        {/* Active Step Highlight */}
        {activeStep && jobStatus === 'active' && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="text-primary">{activeStep.icon}</div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm">{activeStep.label}</h4>
                  <p className="text-xs text-muted-foreground">{activeStep.description}</p>
                </div>
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Steps Timeline */}
        <div className="space-y-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg transition-all',
                step.status === 'active' && 'bg-primary/5 border border-primary/20',
                step.status === 'completed' && 'opacity-60'
              )}
            >
              <div className="flex-shrink-0">
                {getStatusIcon(step.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium truncate',
                      step.status === 'completed' && 'text-green-600',
                      step.status === 'active' && 'text-primary',
                      step.status === 'failed' && 'text-destructive',
                      step.status === 'pending' && 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {step.status === 'active' && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                )}
              </div>
              <div className="flex-shrink-0 text-xs text-muted-foreground">
                {index + 1}/{steps.length}
              </div>
            </div>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          </div>
        )}

        {/* Success Message */}
        {jobStatus === 'completed' && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-700">Processamento Concluído!</p>
                <p className="text-xs text-green-600 mt-1">
                  {clipCount} clipes prontos para viralizar 🎉
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
