import { useState, useEffect, useCallback } from 'react';
import { useJobConnectionManager } from './useJobConnectionManager';
import { JobStatus } from './useJobStream';

interface UseJobStatusOptions {
  jobId: string;
  enabled?: boolean;
}

export const useJobStatus = ({ jobId, enabled = true }: UseJobStatusOptions) => {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionType, setConnectionType] = useState<'sse' | 'polling' | 'none'>('none');
  const [error, setError] = useState<string | null>(null);
  
  const { subscribe, startConnection, getConnectionInfo } = useJobConnectionManager(jobId);

  // Check if job is terminal (completed or failed)
  const isJobTerminal = useCallback((status?: JobStatus) => {
    if (!status) return false;
    return status.status === 'completed' || status.status === 'failed';
  }, []);

  // Subscribe to connection manager updates
  useEffect(() => {
    if (!enabled || !jobId) return;

    console.log(`[useJobStatus] Subscribing to job ${jobId}`);
    const unsubscribe = subscribe((status: JobStatus) => {
      console.log(`[useJobStatus] Status update for job ${jobId}:`, status);
      setJobStatus(status);
    });

    // Update connection info from manager
    const updateConnectionInfo = () => {
      const info = getConnectionInfo();
      setIsConnected(info.isConnected);
      setConnectionType(info.connectionType);
      setError(info.error);
    };

    updateConnectionInfo();

    // Don't start connection if job is already terminal
    if (!isJobTerminal(jobStatus)) {
      startConnection();
    }

    const interval = setInterval(updateConnectionInfo, 2000); // Reduced from 1s to 2s

    return () => {
      console.log(`[useJobStatus] Unsubscribing from job ${jobId}`);
      unsubscribe();
      clearInterval(interval);
    };
  }, [enabled, jobId, subscribe, startConnection, getConnectionInfo, isJobTerminal, jobStatus]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    setError(null);
    if (!isJobTerminal(jobStatus)) {
      startConnection();
    }
  }, [startConnection, isJobTerminal, jobStatus]);

  return {
    jobStatus,
    isConnected,
    connectionType,
    error,
    reconnect,
    isTerminal: isJobTerminal(jobStatus)
  };
};