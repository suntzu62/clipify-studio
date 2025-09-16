import { useState, useEffect } from 'react';

export interface TimelineStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress: number;
}

const defaultSteps = [
  { id: 'ingest', label: 'Ingestão', description: 'Download e análise do vídeo' },
  { id: 'transcribe', label: 'Transcrição', description: 'Gerando legendas automáticas' },
  { id: 'scenes', label: 'Cenas', description: 'Detectando momentos marcantes' },
  { id: 'rank', label: 'Classificação', description: 'Selecionando os melhores cortes' },
  { id: 'render', label: 'Renderização', description: 'Criando clipes em 9:16' },
  { id: 'texts', label: 'Textos', description: 'Gerando títulos e hashtags' },
  { id: 'export', label: 'Exportação', description: 'Finalizando tudo para você' },
];

export const useTimeline = (currentStep?: string, jobStatus?: string) => {
  const [steps, setSteps] = useState<TimelineStep[]>([]);

  useEffect(() => {
    const currentStepIndex = currentStep ? defaultSteps.findIndex(s => s.id === currentStep) : -1;
    
    const updatedSteps = defaultSteps.map((step, index) => {
      let status: 'pending' | 'active' | 'completed' | 'failed' = 'pending';
      let progress = 0;

      if (jobStatus === 'failed') {
        if (index < currentStepIndex) {
          status = 'completed';
          progress = 100;
        } else if (index === currentStepIndex) {
          status = 'failed';
          progress = 0;
        }
      } else if (index < currentStepIndex) {
        status = 'completed';
        progress = 100;
      } else if (index === currentStepIndex) {
        status = 'active';
        progress = Math.min(Math.max((currentStepIndex + 1) * 14, 10), 95);
      }

      return {
        ...step,
        status,
        progress
      };
    });

    setSteps(updatedSteps);
  }, [currentStep, jobStatus]);

  const getActiveStep = () => steps.find(s => s.status === 'active');
  const getCompletedCount = () => steps.filter(s => s.status === 'completed').length;
  const getTotalProgress = () => {
    const totalProgress = steps.reduce((acc, step) => acc + step.progress, 0);
    return Math.round(totalProgress / steps.length);
  };

  return {
    steps,
    activeStep: getActiveStep(),
    completedCount: getCompletedCount(),
    totalSteps: steps.length,
    overallProgress: getTotalProgress()
  };
};