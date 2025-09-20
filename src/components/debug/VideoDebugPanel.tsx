import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Bug, ChevronDown, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';

interface VideoDebugPanelProps {
  jobStatus?: any;
  clipDebugInfo?: any;
  connectionInfo?: {
    isConnected: boolean;
    connectionType: string;
    error?: string;
  };
  onRefresh?: () => void;
}

export const VideoDebugPanel = ({ 
  jobStatus, 
  clipDebugInfo, 
  connectionInfo,
  onRefresh 
}: VideoDebugPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!jobStatus && !clipDebugInfo) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'active': return 'bg-blue-100 text-blue-800';
      case 'queued': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="mt-6 border-dashed border-yellow-300 bg-yellow-50/50">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-yellow-100/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-yellow-800">
                <Bug className="w-5 h-5" />
                Debug Panel - Video Processing
                {clipDebugInfo?.foundClips > 0 && (
                  <Badge className="bg-green-100 text-green-800">
                    {clipDebugInfo.foundClips} clips found
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {onRefresh && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefresh();
                    }}
                    className="gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </Button>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent>
            <Tabs defaultValue="status" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="status">Job Status</TabsTrigger>
                <TabsTrigger value="clips">Clips Data</TabsTrigger>
                <TabsTrigger value="connection">Connection</TabsTrigger>
                <TabsTrigger value="raw">Raw Data</TabsTrigger>
              </TabsList>
              
              <TabsContent value="status" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Job Information</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>ID:</span>
                        <code className="bg-gray-100 px-1 rounded">{jobStatus?.id || 'N/A'}</code>
                      </div>
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <Badge className={getStatusColor(jobStatus?.status || 'unknown')}>
                          {jobStatus?.status || 'unknown'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Progress:</span>
                        <span>{jobStatus?.progress || 0}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Step:</span>
                        <span>{jobStatus?.currentStep || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Data Structure</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        {jobStatus?.result?.clips ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        )}
                        <span>result.clips: {jobStatus?.result?.clips?.length || 0}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {jobStatus?.result?.texts ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        )}
                        <span>result.texts: {jobStatus?.result?.texts ? 'present' : 'missing'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {jobStatus?.debug ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        )}
                        <span>debug info: {jobStatus?.debug ? 'present' : 'missing'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {jobStatus?.error && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <h4 className="font-semibold text-red-800 mb-1">Error</h4>
                    <code className="text-sm text-red-700">{jobStatus.error}</code>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="clips" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Clip Processing</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Strategy Used:</span>
                        <Badge variant="outline">{clipDebugInfo?.strategy || 'none'}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Clips Found:</span>
                        <span>{clipDebugInfo?.foundClips || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Processed:</span>
                        <span>{clipDebugInfo?.processed ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Timestamp:</span>
                        <span className="text-xs">{clipDebugInfo?.timestamp?.split('T')[1]?.split('.')[0] || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Edge Function Debug</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        {jobStatus?.debug?.enriched ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        )}
                        <span>Data Enriched: {jobStatus?.debug?.enriched ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Clip Files:</span>
                        <span>{jobStatus?.debug?.clipFilesFound || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Text Folders:</span>
                        <span>{jobStatus?.debug?.textFoldersFound || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="connection" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Connection Status</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        {connectionInfo?.isConnected ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        )}
                        <span>Connected: {connectionInfo?.isConnected ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Type:</span>
                        <Badge variant="outline">{connectionInfo?.connectionType || 'none'}</Badge>
                      </div>
                    </div>
                  </div>
                </div>
                
                {connectionInfo?.error && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <h4 className="font-semibold text-red-800 mb-1">Connection Error</h4>
                    <code className="text-sm text-red-700">{connectionInfo.error}</code>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="raw" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Job Status Raw Data</h4>
                    <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-64">
                      {JSON.stringify(jobStatus, null, 2)}
                    </pre>
                  </div>
                  
                  {clipDebugInfo?.raw && (
                    <div>
                      <h4 className="font-semibold mb-2">Clip Debug Raw Data</h4>
                      <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-64">
                        {JSON.stringify(clipDebugInfo.raw, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};