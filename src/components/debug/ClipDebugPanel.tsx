import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import { ChevronDown, RefreshCw, Bug } from 'lucide-react';

interface ClipDebugPanelProps {
  jobResult?: any;
  clipDebugInfo?: any;
  onRefresh?: () => void;
  className?: string;
}

export function ClipDebugPanel({ 
  jobResult, 
  clipDebugInfo, 
  onRefresh,
  className 
}: ClipDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasClips = jobResult?.result?.clips?.length > 0;
  const hasTexts = jobResult?.result?.texts;
  const isCompleted = jobResult?.status === 'completed';

  return (
    <Card className={className}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4" />
                Debug: Clips Detection
                <Badge variant={hasClips ? 'default' : 'destructive'}>
                  {hasClips ? `${jobResult.result.clips.length} clips found` : 'No clips found'}
                </Badge>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Status Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Badge variant={isCompleted ? 'default' : 'secondary'}>
                Status: {jobResult?.status || 'unknown'}
              </Badge>
              <Badge variant={hasClips ? 'default' : 'destructive'}>
                Clips: {jobResult?.result?.clips?.length || 0}
              </Badge>
              <Badge variant={hasTexts ? 'default' : 'secondary'}>
                Texts: {hasTexts ? 'Found' : 'Missing'}
              </Badge>
              <Badge variant={jobResult?.debug?.enriched ? 'default' : 'destructive'}>
                Enhanced: {jobResult?.debug?.enriched ? 'Yes' : 'No'}
              </Badge>
            </div>

            {/* Enhanced Debug Info */}
            {jobResult?.debug && (
              <div className="bg-muted/50 p-3 rounded text-xs space-y-2">
                <div><strong>Job ID:</strong> {jobResult.debug.jobId}</div>
                <div><strong>Clip Files Found:</strong> {jobResult.debug.clipFilesFound}</div>
                <div><strong>Text Folders Found:</strong> {jobResult.debug.textFoldersFound}</div>
                <div><strong>Clip Groups Processed:</strong> {jobResult.debug.clipGroupsProcessed}</div>
                <div><strong>Enrichment Time:</strong> {jobResult.debug.timestamp}</div>
                {jobResult.debug.error && (
                  <div className="text-destructive">
                    <strong>Error:</strong> {jobResult.debug.error}
                  </div>
                )}
              </div>
            )}

            {/* Clip Processing Strategy Debug */}
            {clipDebugInfo && (
              <div className="bg-muted/50 p-3 rounded text-xs space-y-2">
                <div><strong>Processing Strategy:</strong> {clipDebugInfo.strategy}</div>
                <div><strong>Found Clips:</strong> {clipDebugInfo.foundClips}</div>
                <div><strong>Processing Time:</strong> {clipDebugInfo.timestamp}</div>
              </div>
            )}

            {/* Raw Data Preview */}
            <details className="text-xs">
              <summary className="cursor-pointer font-medium mb-2">Raw Job Data</summary>
              <pre className="bg-background border rounded p-2 text-xs max-h-40 overflow-auto">
                {JSON.stringify(jobResult, null, 2)}
              </pre>
            </details>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onRefresh}
                disabled={!onRefresh}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh Data
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}