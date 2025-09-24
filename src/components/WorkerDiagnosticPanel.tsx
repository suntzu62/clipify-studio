import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, RefreshCw, Copy, ExternalLink, Activity, Database, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { checkWorkerHealth } from '@/lib/worker-health';
import { useState } from 'react';

interface WorkerDiagnosticPanelProps {
  jobId: string;
  jobStatus?: string;
  workerHealth?: any;
  onRefresh?: () => void;
}

export function WorkerDiagnosticPanel({ 
  jobId, 
  jobStatus, 
  workerHealth, 
  onRefresh 
}: WorkerDiagnosticPanelProps) {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleCheckHealth = async () => {
    setIsRefreshing(true);
    try {
      const health = await checkWorkerHealth();
      console.log('Worker Health:', health);
      
      toast({
        title: health.isHealthy ? "✅ Workers Online" : "⚠️ Workers Offline",
        description: health.diagnostics?.recommendations?.[0] || 'Check console for details'
      });
    } catch (error) {
      toast({
        title: "❌ Health Check Failed",
        description: "Could not connect to workers API",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyCurl = () => {
    const baseUrl = workerHealth?.workerBaseUrl || 'YOUR_WORKERS_URL';
    const curlCommand = `curl -X POST "${baseUrl}/api/jobs/pipeline" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"youtubeUrl": "https://youtube.com/watch?v=EXAMPLE"}'`;
    
    navigator.clipboard.writeText(curlCommand);
    toast({
      title: "📋 cURL Command Copied",
      description: "Test command copied to clipboard"
    });
  };

  const getQueueStatus = () => {
    const queues = workerHealth?.queueStatus?.queues || [];
    const total = workerHealth?.queueStatus?.totalJobs || {};
    return { queues, total };
  };

  const isWorkerProblem = jobStatus === 'waiting-children' || 
    (workerHealth && !workerHealth.isHealthy) ||
    (workerHealth?.diagnostics && !workerHealth.diagnostics.workersConsuming);

  if (!isWorkerProblem) return null;

  const { queues, total } = getQueueStatus();

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
          <AlertCircle className="w-5 h-5" />
          Diagnóstico do Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Issue */}
        <div className="p-3 bg-white/60 dark:bg-black/20 rounded-lg">
          <div className="font-medium text-sm mb-2">
            {jobStatus === 'waiting-children' 
              ? '⏳ Jobs criados mas workers não estão consumindo filas'
              : '❌ Sistema de processamento indisponível'
            }
          </div>
          <div className="text-xs text-muted-foreground">
            {jobStatus === 'waiting-children' 
              ? 'Os jobs foram criados no Redis mas nenhum worker está processando. Provavelmente problema no comando Start do Render.com.'
              : 'Não foi possível conectar com o serviço de workers. Verifique se está rodando no Render.com.'
            }
          </div>
        </div>

        {/* Queue Status */}
        {total && Object.keys(total).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span>Aguardando: {total.waiting || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Processando: {total.active || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Concluídos: {total.completed || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span>Falhas: {total.failed || 0}</span>
            </div>
          </div>
        )}

        {/* Environment Status */}
        {workerHealth?.queueStatus?.environment && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between p-2 bg-white/40 rounded">
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                Redis
              </span>
              <Badge variant={workerHealth.queueStatus.redis?.connected ? "default" : "destructive"} className="text-xs">
                {workerHealth.queueStatus.redis?.connected ? 'OK' : 'Failed'}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-white/40 rounded">
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                OpenAI
              </span>
              <Badge variant={workerHealth.queueStatus.environment.openaiKey === 'configured' ? "default" : "destructive"} className="text-xs">
                {workerHealth.queueStatus.environment.openaiKey === 'configured' ? 'OK' : 'Missing'}
              </Badge>
            </div>
          </div>
        )}

        {/* Recommendations */}
        {workerHealth?.diagnostics?.recommendations && workerHealth.diagnostics.recommendations.length > 0 && (
          <div className="text-xs space-y-1">
            <div className="font-medium">Passos para resolver:</div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              {workerHealth.diagnostics.recommendations.slice(0, 3).map((rec: string, index: number) => (
                <li key={index}>{rec}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-amber-200">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleCheckHealth}
            disabled={isRefreshing}
            className="gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Verificando...' : 'Verificar Workers'}
          </Button>
          
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1">
              <Activity className="w-3 h-3" />
              Reconectar SSE
            </Button>
          )}
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleCopyCurl}
            className="gap-1"
          >
            <Copy className="w-3 h-3" />
            Copiar cURL
          </Button>
          
          {workerHealth?.workerBaseUrl && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.open(`${workerHealth.workerBaseUrl}/health`, '_blank')}
              className="gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Health API
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}