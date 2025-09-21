import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';

interface JobStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress?: number;
  eta?: string;
}

interface EnhancedJobProgressProps {
  currentStep?: string;
  jobStatus: 'queued' | 'active' | 'completed' | 'failed';
  progress: number;
  error?: string;
  className?: string;
}

// Mapeamento de etapas técnicas para nomes humanizados
const STEP_MAPPING: Record<string, JobStep> = {
  'ingest': {
    id: 'ingest',
    name: 'Baixando Vídeo',
    description: 'Fazendo download e preparando o arquivo...',
    status: 'pending'
  },
  'transcribe': {
    id: 'transcribe', 
    name: 'Transcrevendo',
    description: 'Convertendo fala em texto com IA...',
    status: 'pending'
  },
  'scenes': {
    id: 'scenes',
    name: 'Analisando Cenas',
    description: 'Identificando os melhores momentos...',
    status: 'pending'
  },
  'rank': {
    id: 'rank',
    name: 'Selecionando Clipes',
    description: 'Escolhendo os momentos mais virais...',
    status: 'pending'
  },
  'render': {
    id: 'render',
    name: 'Criando Vídeos',
    description: 'Gerando clipes otimizados...',
    status: 'pending'
  },
  'texts': {
    id: 'texts',
    name: 'Adicionando Legendas',
    description: 'Aplicando textos e efeitos...',
    status: 'pending'
  },
  'export': {
    id: 'export',
    name: 'Finalizando',
    description: 'Preparando para download...',
    status: 'pending'
  }
};

export function EnhancedJobProgress({ 
  currentStep, 
  jobStatus, 
  progress, 
  error,
  className 
}: EnhancedJobProgressProps) {
  
  const steps = Object.values(STEP_MAPPING);
  
  // Calcular status de cada etapa
  const getStepsWithStatus = (): JobStep[] => {
    return steps.map((step, index) => {
      const stepProgress = Math.floor(progress / (100 / steps.length));
      
      if (jobStatus === 'failed') {
        if (step.id === currentStep) {
          return { ...step, status: 'failed' };
        } else if (index < stepProgress) {
          return { ...step, status: 'completed' };
        }
        return { ...step, status: 'pending' };
      }
      
      if (jobStatus === 'completed') {
        return { ...step, status: 'completed' };
      }
      
      if (step.id === currentStep) {
        return { ...step, status: 'active', progress: progress % (100 / steps.length) };
      } else if (index < stepProgress) {
        return { ...step, status: 'completed' };
      }
      
      return { ...step, status: 'pending' };
    });
  };

  const stepsWithStatus = getStepsWithStatus();
  const activeStep = stepsWithStatus.find(step => step.status === 'active');
  
  const getStepIcon = (step: JobStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'active':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued':
        return <Badge variant="secondary">⏰ Na Fila</Badge>;
      case 'active':
        return <Badge variant="default">🚀 Processando</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500">✅ Concluído</Badge>;
      case 'failed':
        return <Badge variant="destructive">⚠️ Erro</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getETA = () => {
    if (jobStatus === 'completed') return 'Concluído!';
    if (jobStatus === 'failed') return 'Pausado';
    
    const remaining = Math.max(0, Math.ceil((100 - progress) / 20));
    return remaining > 0 ? `~${remaining} min restantes` : 'Quase pronto!';
  };

  return (
    <Card className={cn("", className)}>
      <CardContent className="p-6 space-y-6">
        {/* Header com status geral */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Pipeline de Criação</h3>
            <p className="text-sm text-muted-foreground">{getETA()}</p>
          </div>
          {getStatusBadge(jobStatus)}
        </div>

        {/* Barra de progresso geral */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progresso Geral</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        {/* Etapa atual em destaque */}
        {activeStep && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                {getStepIcon(activeStep)}
                <div className="flex-1">
                  <h4 className="font-medium">{activeStep.name}</h4>
                  <p className="text-sm text-muted-foreground">{activeStep.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista de todas as etapas */}
        <div className="space-y-3">
          {stepsWithStatus.map((step, index) => (
            <div key={step.id} className="flex items-center gap-3">
              {getStepIcon(step)}
              <div className="flex-1">
                <span className={cn(
                  "text-sm font-medium",
                  step.status === 'completed' && "text-green-600",
                  step.status === 'active' && "text-primary",
                  step.status === 'failed' && "text-destructive",
                  step.status === 'pending' && "text-muted-foreground"
                )}>
                  {step.name}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {index + 1}/{steps.length}
              </div>
            </div>
          ))}
        </div>

        {/* Mensagem de erro */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}