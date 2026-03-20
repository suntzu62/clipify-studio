import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useJobConnectionManager } from './useJobConnectionManager';
import { JobStatus } from './useJobStream';
import { getJobStatus, type Job } from '@/lib/jobs-api';

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
  const [finalSnapshotFetched, setFinalSnapshotFetched] = useState(false);
  const [stallStartAt, setStallStartAt] = useState<number | null>(null);
  const [stalled, setStalled] = useState(false);
  
  const getSupabaseToken = useCallback(async () => {
    if (!getToken) return null;

    try {
      return await getToken();
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

  const mergeJobStatus = useCallback((nextJob: Job) => {
    setJobStatus(prevStatus => ({
      ...prevStatus,
      ...nextJob,
      result: {
        ...prevStatus?.result,
        ...nextJob.result,
        clips: nextJob.result?.clips || prevStatus?.result?.clips || []
      }
    } as JobStatus));
  }, []);

  useEffect(() => {
    setJobStatus(null);
    setIsConnected(false);
    setConnectionType('none');
    setError(null);
    setFinalSnapshotFetched(false);
    setStalled(false);
    setStallStartAt(null);
  }, [jobId, enabled]);

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

  // Always do one final GET fetch when the job becomes terminal so the page does not
  // stay stuck with a partial in-flight snapshot after the backend already finished.
  useEffect(() => {
    if (!enabled || !jobId || finalSnapshotFetched) return;
    if (!isJobTerminal(jobStatus)) return;

    console.log('[useJobStatus] Job terminal, fetching final snapshot');

    const fetchFallback = async () => {
      try {
        const enrichedJob: Job = await getJobStatus(jobId, getSupabaseToken);
        console.log('[useJobStatus] Fallback enriched data fetched:', enrichedJob);
        mergeJobStatus(enrichedJob);
      } catch (error) {
        console.error('[useJobStatus] Fallback fetch failed:', error);
      } finally {
        setFinalSnapshotFetched(true);
        setStalled(false);
      }
    };

    fetchFallback();
  }, [enabled, jobId, jobStatus?.status, finalSnapshotFetched, isJobTerminal, getSupabaseToken, mergeJobStatus]);

  // Periodic enrichment polling - keep syncing while the job is active.
  // Partial clips are not enough to stop polling because the backend may still
  // complete later and the UI needs the terminal snapshot.
  useEffect(() => {
    if (!enabled || !jobId || isJobTerminal(jobStatus)) {
      return;
    }

    console.log('[useJobStatus] Starting periodic enrichment polling');
    
    const fetchEnrichedData = async () => {
      try {
        // Check again before fetching to avoid race conditions
        if (isJobTerminal(jobStatus)) {
          console.log('[useJobStatus] Job is terminal, skipping enrichment fetch');
          return;
        }
        
        console.log('[useJobStatus] Fetching enriched job status via polling');
        const enrichedJob: Job = await getJobStatus(jobId, getSupabaseToken);
        console.log('[useJobStatus] Enriched job status fetched:', enrichedJob);

        mergeJobStatus(enrichedJob);

        const isTerminal = enrichedJob.status === 'completed' || enrichedJob.status === 'failed';
        if (isTerminal) {
          console.log('[useJobStatus] Job became terminal via polling');
          setFinalSnapshotFetched(true);
          setStalled(false);
        }
      } catch (error) {
        console.error('[useJobStatus] Failed to fetch enriched job status:', error);
      }
    };

    // Initial fetch
    fetchEnrichedData();

    // Poll frequently so the UI reflects progress and completion without waiting
    // for SSE to succeed.
    const pollInterval = setInterval(() => {
      if (!isJobTerminal(jobStatus)) {
        fetchEnrichedData();
      } else {
        clearInterval(pollInterval);
      }
    }, 5000);

    return () => {
      console.log('[useJobStatus] Cleaning up enrichment polling');
      clearInterval(pollInterval);
    };
  }, [enabled, jobId, jobStatus?.status, isJobTerminal, getSupabaseToken, mergeJobStatus]);

  // Any meaningful progress resets the stall timer.
  useEffect(() => {
    if (!enabled || !jobId) return;

    if (isJobTerminal(jobStatus)) {
      setStalled(false);
      setStallStartAt(null);
      return;
    }

    if (!jobStatus) return;

    setStalled(false);
    setStallStartAt(Date.now());
  }, [
    enabled,
    jobId,
    jobStatus?.status,
    jobStatus?.currentStep,
    jobStatus?.progress,
    jobStatus?.pipelineStatus?.stage,
    jobStatus?.pipelineStatus?.progress,
    jobStatus?.result?.clips?.length,
    jobStatus?.result?.clips?.filter(clip => clip.status === 'ready').length,
    isJobTerminal
  ]);

  // Detect stalled processing when nothing changes for >10 minutes.
  useEffect(() => {
    if (!enabled || !jobId) return;

    if (isJobTerminal(jobStatus)) {
      setStalled(false);
      setStallStartAt(null);
      return;
    }
    if (stallStartAt === null) return;

    let timeout: any;
    const elapsed = Date.now() - stallStartAt;
    const remaining = Math.max(0, 10 * 60 * 1000 - elapsed);
    timeout = setTimeout(() => setStalled(true), remaining);

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [enabled, jobId, jobStatus?.status, stallStartAt, isJobTerminal]);

  // Manual refresh to fetch enriched data immediately
  const refreshNow = useCallback(async () => {
    try {
      const enrichedJob: Job = await getJobStatus(jobId, getSupabaseToken);
      mergeJobStatus(enrichedJob);

      if (enrichedJob.status === 'completed' || enrichedJob.status === 'failed') {
        setFinalSnapshotFetched(true);
        setStalled(false);
      }
    } catch (e) {
      console.error('[useJobStatus] refreshNow failed:', e);
    }
  }, [jobId, getSupabaseToken, mergeJobStatus]);

  return {
    jobStatus,
    isConnected,
    connectionType,
    error,
    reconnect,
    refreshNow,
    stalled,
    isTerminal: isJobTerminal(jobStatus)
  };
};
