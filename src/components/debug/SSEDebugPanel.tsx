import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useJobConnectionManager } from '@/hooks/useJobConnectionManager';

interface SSEDebugPanelProps {
  jobId?: string;
}

export const SSEDebugPanel = ({ jobId }: SSEDebugPanelProps) => {
  const [allConnections, setAllConnections] = useState<Record<string, any>>({});
  const [metrics, setMetrics] = useState<any>({});
  const [refreshCount, setRefreshCount] = useState(0);
  
  const connectionManager = useJobConnectionManager(jobId || 'debug');
  
  useEffect(() => {
    const interval = setInterval(() => {
      const connections = connectionManager.getAllConnections();
      const currentMetrics = connectionManager.getMetrics();
      setAllConnections(connections);
      setMetrics(currentMetrics);
      setRefreshCount(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [connectionManager]);
  
  const formatConnectionType = (type: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      'sse': 'default',
      'polling': 'secondary', 
      'none': 'outline'
    };
    return variants[type] || 'outline';
  };
  
  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          SSE Connection Debug Panel
          <div className="flex items-center gap-2">
            <Badge variant="outline">Refresh #{refreshCount}</Badge>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                setAllConnections(connectionManager.getAllConnections());
                setMetrics(connectionManager.getMetrics());
                setRefreshCount(prev => prev + 1);
              }}
            >
              Refresh Now
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Global Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-primary">{metrics.totalConnections || 0}</div>
              <div className="text-xs text-muted-foreground">Total Connections</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-green-600">{metrics.activeSSEConnections || 0}</div>
              <div className="text-xs text-muted-foreground">Active SSE</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-blue-600">{metrics.activePollingConnections || 0}</div>
              <div className="text-xs text-muted-foreground">Active Polling</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-orange-600">{metrics.circuitBreakerTriggered || 0}</div>
              <div className="text-xs text-muted-foreground">Circuit Breakers</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-red-600">{metrics.rateLimitedConnections || 0}</div>
              <div className="text-xs text-muted-foreground">Rate Limited</div>
            </CardContent>
          </Card>
        </div>
        
        {/* Individual Connections */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Individual Connections</h3>
          {Object.keys(allConnections).length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              No active connections
            </div>
          ) : (
            Object.entries(allConnections).map(([jobId, connection]) => (
              <Card key={jobId}>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-muted px-2 py-1 rounded">{jobId}</code>
                        <Badge variant={formatConnectionType(connection.connectionType)}>
                          {connection.connectionType.toUpperCase()}
                        </Badge>
                        {connection.isConnected && (
                          <Badge variant="default" className="bg-green-600">Connected</Badge>
                        )}
                        {connection.isConnecting && (
                          <Badge variant="secondary" className="bg-yellow-600 text-white">Connecting...</Badge>
                        )}
                        {connection.circuitBreakerActive && (
                          <Badge variant="destructive">Circuit Breaker</Badge>
                        )}
                        {connection.isCleaningUp && (
                          <Badge variant="outline">Cleaning Up</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Refs: {connection.referenceCount} | Failures: {connection.consecutiveFailures} | Attempts: {connection.connectionAttempts}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Last Heartbeat: {connection.lastHeartbeat} | EventSource: {connection.hasEventSource ? '✓' : '✗'}
                      {connection.connectionHistory && connection.connectionHistory.length > 0 && (
                        <div className="mt-1">
                          History: {connection.connectionHistory.slice(-3).map((h, i) => (
                            <span key={i} className={`inline-block w-2 h-2 rounded-full mr-1 ${h.success ? 'bg-green-500' : 'bg-red-500'}`} title={`${h.type} at ${new Date(h.timestamp).toLocaleTimeString()}`}></span>
                          ))}
                        </div>
                      )}
                    </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};