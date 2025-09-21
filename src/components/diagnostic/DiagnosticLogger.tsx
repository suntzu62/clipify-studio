import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Clock, AlertCircle, CheckCircle, Loader2, Bug } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  step: string;
  message: string;
  details?: any;
}

interface DiagnosticLoggerProps {
  jobId: string;
  isVisible?: boolean;
  className?: string;
}

export function DiagnosticLogger({ jobId, isVisible = false, className }: DiagnosticLoggerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(isVisible);

  // Simulate receiving diagnostic logs
  useEffect(() => {
    if (!jobId) return;

    // Add initial log
    addLog({
      level: 'info',
      step: 'init',
      message: 'Pipeline iniciada para processamento',
      details: { jobId }
    });

    // Simulate progress logs
    const progressSteps = [
      { step: 'ingest', message: 'Baixando vídeo do YouTube...', delay: 1000 },
      { step: 'ingest', message: 'Verificando formato e qualidade...', delay: 3000 },
      { step: 'transcribe', message: 'Extraindo áudio para transcrição...', delay: 5000 },
      { step: 'transcribe', message: 'Processando com IA de reconhecimento de voz...', delay: 8000 },
      { step: 'scenes', message: 'Analisando cenas e momentos importantes...', delay: 12000 },
      { step: 'rank', message: 'Classificando clipes por potencial viral...', delay: 15000 }
    ];

    const timeouts = progressSteps.map(({ step, message, delay }) =>
      setTimeout(() => {
        addLog({
          level: 'info',
          step,
          message,
          details: { progress: `${step} em andamento` }
        });
      }, delay)
    );

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [jobId]);

  const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const logEntry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      ...entry
    };
    
    setLogs(prev => [...prev, logEntry].slice(-50)); // Keep last 50 logs
  };

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      case 'warn':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
    }
  };

  const getLevelBadge = (level: LogEntry['level']) => {
    switch (level) {
      case 'success':
        return <Badge variant="default" className="bg-green-500">Sucesso</Badge>;
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
      case 'warn':
        return <Badge variant="secondary" className="bg-yellow-500">Aviso</Badge>;
      default:
        return <Badge variant="outline">Info</Badge>;
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStepName = (step: string) => {
    const stepNames: Record<string, string> = {
      'init': 'Inicialização',
      'ingest': 'Download',
      'transcribe': 'Transcrição',
      'scenes': 'Análise de Cenas',
      'rank': 'Classificação',
      'render': 'Renderização',
      'texts': 'Legendas',
      'export': 'Exportação'
    };
    return stepNames[step] || step;
  };

  if (!isExpanded && logs.length === 0) return null;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-primary" />
            Diagnóstico em Tempo Real
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Minimizar' : 'Expandir'}
          </Button>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2" />
                  <p>Aguardando logs de diagnóstico...</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                    {getLevelIcon(log.level)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatTime(log.timestamp)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getStepName(log.step)}
                        </Badge>
                        {getLevelBadge(log.level)}
                      </div>
                      <p className="text-sm">{log.message}</p>
                      {log.details && (
                        <pre className="text-xs text-muted-foreground mt-1 bg-background/50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}