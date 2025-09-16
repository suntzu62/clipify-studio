import { useState, useEffect, useRef } from 'react';
import { getJobStatus } from '@/lib/jobs-api';
import { JobStatus } from './useJobStream';

export const usePolling = (
  jobId: string, 
  enabled: boolean,
  getToken?: () => Promise<string | null>
) => {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || !jobId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    setError(null);

    const poll = async () => {
      try {
        const status = await getJobStatus(jobId, getToken);
        setJobStatus(status as JobStatus);
        setError(null);
        
        // Stop polling if job is completed or failed
        if (status.status === 'completed' || status.status === 'failed') {
          setIsPolling(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (err: any) {
        console.error('Polling error:', err);
        setError(err.message || 'Failed to fetch job status');
      }
    };

    // Initial poll
    poll();

    // Set up interval
    intervalRef.current = setInterval(poll, 5000); // Poll every 5 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsPolling(false);
    };
  }, [enabled, jobId, getToken]);

  return {
    jobStatus,
    isPolling,
    error
  };
};