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
    clips?: Array<{
      id: string;
      title: string;
      description: string;
      hashtags: string[];
      previewUrl?: string;
      downloadUrl?: string;
      thumbnailUrl?: string;
      duration: number;
      status: 'processing' | 'ready' | 'failed';
    }>;
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

        // SSE doesn't support custom headers, so we still need to use query params
        // The backend will validate the token from query params
        const url = `https://qibjqqucmbrtuirysexl.functions.supabase.co/job-stream?id=${jobId}&token=${token}`;
        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setIsConnected(true);
          setError(null);
        };

        // Handle different event types
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Only update jobStatus if the event contains meaningful status or result data
            if (data && (data.status || data.state || data.result)) {
              setJobStatus(data);
            }
          } catch (err) {
            console.error('Failed to parse SSE message:', err);
          }
        };

        // Listen for specific named events
        eventSource.addEventListener('connected', (event) => {
          setIsConnected(true);
        });

        eventSource.addEventListener('progress', (event) => {
          try {
            const data = JSON.parse((event as MessageEvent).data);
            
            // Only update if it has meaningful status or result data
            if (data && (data.status || data.state || data.result)) {
              setJobStatus(data);
            }
          } catch (err) {
            console.error('Failed to parse progress event:', err);
          }
        });

        eventSource.addEventListener('completed', (event) => {
          try {
            const data = JSON.parse((event as MessageEvent).data);
            setJobStatus(data);
          } catch (err) {
            console.error('Failed to parse completed event:', err);
          }
        });

        eventSource.addEventListener('failed', (event) => {
          try {
            const data = JSON.parse((event as MessageEvent).data);
            setJobStatus(data);
          } catch (err) {
            console.error('Failed to parse failed event:', err);
          }
        });

        eventSource.onerror = (event) => {
          setIsConnected(false);
          setError('SSE connection failed - will retry');
          console.error('SSE error:', event);
          
          // Close the failed connection
          eventSource.close();
          
          // Retry after a delay
          setTimeout(() => {
            if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
              connectSSE();
            }
          }, 3000);
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
