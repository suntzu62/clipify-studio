import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getJobStatus } from '@/lib/jobs-api';
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
  
  const { getToken } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const lastJobStatus = useRef<JobStatus | null>(null);
  const sseFailedAt = useRef<number | null>(null);

  // Check if job is terminal (completed or failed)
  const isJobTerminal = useCallback((status?: JobStatus) => {
    if (!status) return false;
    return status.status === 'completed' || status.status === 'failed';
  }, []);

  // Calculate exponential backoff delay with jitter
  const getReconnectDelay = useCallback(() => {
    const baseDelay = 10000; // 10 seconds (increased from 3)
    const maxDelay = 60000; // 60 seconds (increased from 30)
    const exponentialDelay = baseDelay * Math.pow(2, Math.min(reconnectAttempts.current, 4));
    const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
    return Math.min(exponentialDelay + jitter, maxDelay);
  }, []);

  // Clean up all connections
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setConnectionType('none');
    setIsConnected(false);
  }, []);

  // Start polling fallback
  const startPolling = useCallback(async () => {
    if (!enabled || !jobId || isJobTerminal(lastJobStatus.current)) return;

    setConnectionType('polling');
    setIsConnected(true);
    setError(null);

    const poll = async () => {
      try {
        const status = await getJobStatus(jobId, getToken);
        
        // Only update if data actually changed
        if (JSON.stringify(status) !== JSON.stringify(lastJobStatus.current)) {
          setJobStatus(status as JobStatus);
          lastJobStatus.current = status as JobStatus;
        }
        
        // Stop polling if job is terminal
        if (isJobTerminal(status as JobStatus)) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } catch (err: any) {
        console.error('Polling error:', err);
        setError(err.message || 'Failed to fetch job status');
      }
    };

    // Initial poll
    await poll();

    // Set up interval only if job is not terminal
    if (!isJobTerminal(lastJobStatus.current)) {
      pollingIntervalRef.current = setInterval(poll, 15000); // Even slower polling - 15 seconds
    }
  }, [enabled, jobId, getToken, isJobTerminal]);

  // Start SSE connection
  const startSSE = useCallback(async () => {
    if (!enabled || !jobId || isJobTerminal(lastJobStatus.current)) return;

    try {
      const token = await getToken();
      if (!token) {
        setError('No authentication token available');
        return;
      }

      const url = `https://qibjqqucmbrtuirysexl.functions.supabase.co/job-stream?id=${jobId}&token=${token}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      
      setConnectionType('sse');
      reconnectAttempts.current = 0;
      sseFailedAt.current = null;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        console.log('[useJobStatus] SSE connected');
        
        // Stop polling when SSE works
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };

      // Handle all message types
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle rate limiting info events
          if (event.type === 'info' && data.reason === 'rate_limited') {
            console.log('[useJobStatus] Rate limited, backing off for', data.retryAfter);
            setError('Rate limited - backing off');
            eventSource.close();
            
            // Long cooldown for rate limiting
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log('[useJobStatus] Rate limit cooldown finished, switching to polling');
              startPolling();
            }, data.retryAfter || 60000);
            return;
          }
          
          if (data && (data.status || data.state || data.result)) {
            // Only update if data actually changed
            if (JSON.stringify(data) !== JSON.stringify(lastJobStatus.current)) {
              setJobStatus(data);
              lastJobStatus.current = data;
            }
            
            // Stop SSE if job is terminal
            if (isJobTerminal(data)) {
              eventSource.close();
            }
          }
        } catch (err) {
          console.error('Failed to parse SSE message:', err);
        }
      };

      eventSource.onmessage = handleMessage;
      eventSource.addEventListener('progress', (event) => handleMessage(event as MessageEvent));
      eventSource.addEventListener('completed', (event) => handleMessage(event as MessageEvent));
      eventSource.addEventListener('failed', (event) => handleMessage(event as MessageEvent));
      eventSource.addEventListener('info', (event) => handleMessage(event as MessageEvent));

      eventSource.onerror = () => {
        setIsConnected(false);
        setError('SSE connection failed');
        eventSource.close();
        
        if (!sseFailedAt.current) {
          sseFailedAt.current = Date.now();
        }
        
        // Only retry if job is not terminal
        if (!isJobTerminal(lastJobStatus.current)) {
          reconnectAttempts.current++;
          const delay = getReconnectDelay();
          
          console.log(`[useJobStatus] SSE retry #${reconnectAttempts.current} in ${delay}ms`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            // After 20 seconds of SSE failure, switch to polling
            const failureDuration = Date.now() - (sseFailedAt.current || 0);
            if (failureDuration > 20000) {
              console.log('[useJobStatus] SSE failed for 20s, switching to polling');
              startPolling();
            } else {
              startSSE();
            }
          }, delay);
        }
      };

    } catch (err) {
      setError('Failed to start SSE connection');
      console.error('SSE connection error:', err);
      
      // Fallback to polling after SSE setup failure
      setTimeout(startPolling, 1000);
    }
  }, [enabled, jobId, getToken, isJobTerminal, getReconnectDelay, startPolling]);

  // Main effect to start connection
  useEffect(() => {
    if (!enabled || !jobId) {
      cleanup();
      return;
    }

    // Don't start new connections if job is already terminal
    if (isJobTerminal(jobStatus)) {
      cleanup();
      return;
    }

    // Start with SSE
    startSSE();

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden && !isConnected && !isJobTerminal(lastJobStatus.current)) {
        // Page became visible and we're not connected, try reconnecting
        cleanup();
        setTimeout(startSSE, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cleanup();
    };
  }, [enabled, jobId, startSSE, cleanup, isConnected, isJobTerminal, jobStatus]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    cleanup();
    setError(null);
    reconnectAttempts.current = 0;
    sseFailedAt.current = null;
    
    setTimeout(() => {
      if (!isJobTerminal(lastJobStatus.current)) {
        startSSE();
      }
    }, 100);
  }, [cleanup, startSSE, isJobTerminal]);

  return {
    jobStatus,
    isConnected,
    connectionType,
    error,
    reconnect,
    isTerminal: isJobTerminal(jobStatus)
  };
};