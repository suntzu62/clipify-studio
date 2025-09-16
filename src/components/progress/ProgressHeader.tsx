import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProgressHeaderProps {
  progress: number;
  activeStepLabel?: string;
  completedSteps: number;
  totalSteps: number;
  estimatedTime?: string;
  clipCount?: number;
  status: 'queued' | 'active' | 'completed' | 'failed';
}

export const ProgressHeader = ({ 
  progress, 
  activeStepLabel, 
  completedSteps, 
  totalSteps,
  estimatedTime = '3-5 min',
  clipCount = 10,
  status
}: ProgressHeaderProps) => {
  const getStatusMessage = () => {
    if (status === 'completed') {
      return {
        title: '🎉 Seus Shorts estão prontos!',
        subtitle: 'Agora é só baixar e arrasar nas redes sociais'
      };
    }
    
    if (status === 'failed') {
      return {
        title: '⚠️ Ops, algo deu errado',
        subtitle: 'Não se preocupe, vamos resolver isso rapidinho'
      };
    }

    return {
      title: '🎬 Estamos gerando seus Shorts!',
      subtitle: 'Isso pode levar alguns minutos — o primeiro clipe chega rapidinho'
    };
  };

  const { title, subtitle } = getStatusMessage();

  return (
    <Card className="bg-gradient-primary text-primary-foreground border-0 shadow-xl">
      <CardContent className="p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2">{title}</h1>
          <p className="text-primary-foreground/90 text-lg">{subtitle}</p>
        </div>

        {/* Progress Section */}
        {status === 'active' && (
          <>
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium">
                  {activeStepLabel || 'Processando...'}
                </span>
                <span className="text-sm font-bold">
                  {progress}%
                </span>
              </div>
              <Progress 
                value={progress} 
                className="h-3 bg-white/20"
              />
            </div>

            {/* Step counter */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-white/20 text-primary-foreground border-0">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Etapa {completedSteps + 1} de {totalSteps}
                </Badge>
              </div>
              
              <div className="text-sm text-primary-foreground/80">
                Preparando cortes incríveis em sequência...
              </div>
            </div>
          </>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/20">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-semibold">{clipCount} clipes</span>
            </div>
            <p className="text-xs text-primary-foreground/80">Estimativa</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-semibold">{estimatedTime}</span>
            </div>
            <p className="text-xs text-primary-foreground/80">
              {status === 'completed' ? 'Concluído' : 'Tempo restante'}
            </p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-semibold">9:16</span>
            </div>
            <p className="text-xs text-primary-foreground/80">Formato perfeito</p>
          </div>
        </div>

        {/* Motivational message */}
        {status === 'active' && (
          <div className="mt-6 text-center">
            <p className="text-sm text-primary-foreground/90 italic">
              "Estamos criando conteúdo que vai fazer você brilhar ✨"
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};