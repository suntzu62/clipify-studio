import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';

export interface JobStatus {
  id: string;
  status: 'queued' | 'active' | 'completed' | 'failed';
  progress: number;
  currentStep?: string;
  error?: string;
  result?: {
    previewUrl?: string;
    texts?: {
      titles?: string[];
      descriptions?: string[];
      hashtags?: string[];
    };
    blogDraftUrl?: string;
  };
}

export const useJobStream = (jobId: string) => {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { getToken } = useAuth();

  useEffect(() => {
    if (!jobId) return;

    const connectSSE = async () => {
      try {
        const token = await getToken();
        if (!token) {
          setError('No authentication token available');
          return;
        }

        const url = `https://qibjqqucmbrtuirysexl.functions.supabase.co/job-stream?id=${jobId}&token=${token}`;
        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setIsConnected(true);
          setError(null);
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setJobStatus(data);
          } catch (err) {
            console.error('Failed to parse SSE message:', err);
          }
        };

        eventSource.onerror = (event) => {
          setIsConnected(false);
          setError('Connection error');
          console.error('SSE error:', event);
        };

      } catch (err) {
        setError('Failed to connect to job stream');
        console.error('SSE connection error:', err);
      }
    };

    connectSSE();

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, keep connection for now
      } else {
        // Page is visible again, reconnect if needed
        if (!isConnected && eventSourceRef.current?.readyState !== EventSource.OPEN) {
          connectSSE();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [jobId, getToken]);

  return {
    jobStatus,
    isConnected,
    error,
    reconnect: () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      setError(null);
      // Trigger reconnection by updating the effect
    }
  };
};
