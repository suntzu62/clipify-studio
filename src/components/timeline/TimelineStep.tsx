import { CheckCircle, Circle, Loader, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimelineStep as TimelineStepType } from '@/hooks/useTimeline';

interface TimelineStepProps {
  step: TimelineStepType;
  index: number;
  total: number;
}

export const TimelineStep = ({ step, index, total }: TimelineStepProps) => {
  const getStepIcon = () => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'active':
        return <Loader className="w-6 h-6 text-primary animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-6 h-6 text-destructive" />;
      default:
        return <Circle className="w-6 h-6 text-muted-foreground" />;
    }
  };

  const getStepColors = () => {
    switch (step.status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'active':
        return 'text-primary bg-primary/10 border-primary/30 animate-pulse-glow';
      case 'failed':
        return 'text-destructive bg-destructive/10 border-destructive/30';
      default:
        return 'text-muted-foreground bg-muted/50 border-border';
    }
  };

  return (
    <div className="flex items-center gap-4 relative">
      {/* Connection line */}
      {index < total - 1 && (
        <div 
          className={cn(
            "absolute left-3 top-8 w-0.5 h-12 transition-colors duration-500",
            step.status === 'completed' ? "bg-green-200" : "bg-border"
          )}
        />
      )}
      
      {/* Step icon */}
      <div className={cn(
        "flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 relative z-10",
        getStepColors()
      )}>
        {getStepIcon()}
      </div>
      
      {/* Step content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h4 className={cn(
            "font-semibold text-sm transition-colors duration-300",
            step.status === 'active' ? 'text-primary' : 
            step.status === 'completed' ? 'text-foreground' : 
            step.status === 'failed' ? 'text-destructive' :
            'text-muted-foreground'
          )}>
            {step.label}
          </h4>
          
          {step.status === 'active' && (
            <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-full">
              {step.progress}%
            </span>
          )}
        </div>
        
        <p className={cn(
          "text-xs transition-colors duration-300",
          step.status === 'active' ? 'text-primary/80' : 'text-muted-foreground'
        )}>
          {step.status === 'active' && step.id === 'ingest' && "Analisando seu vídeo..."}
          {step.status === 'active' && step.id === 'transcribe' && "Gerando legendas incríveis..."}
          {step.status === 'active' && step.id === 'scenes' && "Encontrando os melhores momentos..."}
          {step.status === 'active' && step.id === 'rank' && "Selecionando cortes que vão viralizar..."}
          {step.status === 'active' && step.id === 'render' && "Renderizando em 9:16 perfeito..."}
          {step.status === 'active' && step.id === 'texts' && "Criando títulos irresistíveis..."}
          {step.status === 'active' && step.id === 'export' && "Preparando tudo para você..."}
          {step.status !== 'active' && step.description}
        </p>
      </div>
    </div>
  );
};