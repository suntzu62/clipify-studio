import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useJobConnectionManager } from './useJobConnectionManager';
import { JobStatus } from './useJobStream';
import { getJobStatus } from '@/lib/jobs-api';

interface UseJobStatusOptions {
  jobId: string;
  enabled?: boolean;
}

export const useJobStatus = ({ jobId, enabled = true }: UseJobStatusOptions) => {
  const { getToken } = useAuth();
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionType, setConnectionType] = useState<'sse' | 'polling' | 'none'>('none');
  const [error, setError] = useState<string | null>(null);
  const [enrichedDataFetched, setEnrichedDataFetched] = useState(false);
  
  const getSupabaseToken = useCallback(async (opts?: any) => {
    if (!getToken) return null;

    const options = { ...(opts || {}) };
    if (!options.template) {
      options.template = 'supabase';
    }

    try {
      return await getToken(options);
    } catch {
      return null;
    }
  }, [getToken]);
  
  const { subscribe, startConnection, getConnectionInfo } = useJobConnectionManager(jobId);

  // Check if job is terminal (completed or failed)
  const isJobTerminal = useCallback((status?: JobStatus) => {
    if (!status) return false;
    return status.status === 'completed' || status.status === 'failed';
  }, []);

  // Subscribe to connection manager updates - FIXED: removed jobStatus from deps to prevent infinite loop
  useEffect(() => {
    if (!enabled || !jobId) return;

    console.log(`[useJobStatus] Subscribing to job ${jobId}`);
    let currentJobStatus: JobStatus | null = null;
    
    const unsubscribe = subscribe((status: JobStatus) => {
      console.log(`[useJobStatus] Status update for job ${jobId}:`, status);
      currentJobStatus = status;
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

    // Only start connection once on mount, not on every jobStatus change
    const shouldConnect = () => {
      return !isJobTerminal(currentJobStatus);
    };

    if (shouldConnect()) {
      startConnection();
    }

    const interval = setInterval(updateConnectionInfo, 3000); // Increased to 3s to reduce overhead

    return () => {
      console.log(`[useJobStatus] Unsubscribing from job ${jobId}`);
      unsubscribe();
      clearInterval(interval);
    };
  }, [enabled, jobId]); // CRITICAL FIX: removed subscribe, startConnection, getConnectionInfo, isJobTerminal, jobStatus from deps

  // Manual reconnect function
  const reconnect = useCallback(() => {
    setError(null);
    if (!isJobTerminal(jobStatus)) {
      startConnection();
    }
  }, [startConnection, isJobTerminal, jobStatus]);

  // Periodic enrichment polling - fetch clips every 20 seconds while job is active
  useEffect(() => {
    if (!enabled || !jobId || isJobTerminal(jobStatus)) return;

    console.log('[useJobStatus] Starting periodic enrichment polling');
    
    const fetchEnrichedData = async () => {
      try {
        console.log('[useJobStatus] Fetching enriched job status via polling');
        const enrichedJob = await getJobStatus(jobId, getSupabaseToken);
        console.log('[useJobStatus] Enriched job status fetched:', enrichedJob);
        
        // Merge enriched data with current status, prioritizing enriched clips
        setJobStatus(prevStatus => {
          const hasClips = enrichedJob.result?.clips && enrichedJob.result.clips.length > 0;
          console.log('[useJobStatus] Merging enriched data, hasClips:', hasClips);
          
          return {
            ...prevStatus,
            ...enrichedJob,
            result: {
              ...prevStatus?.result,
              ...enrichedJob.result,
              clips: enrichedJob.result?.clips || prevStatus?.result?.clips || []
            }
          } as JobStatus;
        });

        // Stop polling once we have clips
        if (enrichedJob.result?.clips && enrichedJob.result.clips.length > 0) {
          console.log('[useJobStatus] Clips found, stopping enrichment polling');
          setEnrichedDataFetched(true);
        }
      } catch (error) {
        console.error('[useJobStatus] Failed to fetch enriched job status:', error);
      }
    };

    // Initial fetch
    fetchEnrichedData();

    // Set up polling interval every 20 seconds
    const pollInterval = setInterval(() => {
      if (!isJobTerminal(jobStatus) && !enrichedDataFetched) {
        fetchEnrichedData();
      }
    }, 20000);

    return () => {
      console.log('[useJobStatus] Cleaning up enrichment polling');
      clearInterval(pollInterval);
    };
  }, [enabled, jobId, jobStatus?.status, enrichedDataFetched, isJobTerminal, getSupabaseToken]);

  return {
    jobStatus,
    isConnected,
    connectionType,
    error,
    reconnect,
    isTerminal: isJobTerminal(jobStatus)
  };
};
