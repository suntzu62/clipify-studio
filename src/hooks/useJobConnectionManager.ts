import { useAuth } from '@clerk/clerk-react';
import { JobStatus } from './useJobStream';

interface ConnectionState {
  eventSource: EventSource | null;
  subscribers: Set<(status: JobStatus) => void>;
  currentStatus: JobStatus | null;
  isConnected: boolean;
  connectionType: 'sse' | 'polling' | 'none';
  error: string | null;
  abortController: AbortController | null;
  lastReconnectTime: number;
  consecutiveFailures: number;
}

class JobConnectionManager {
  private connections = new Map<string, ConnectionState>();
  private readonly DEBOUNCE_DELAY = 5000; // 5 seconds minimum between reconnects
  private readonly MAX_CONNECTIONS_GLOBAL = 5; // Global connection limit
  
  subscribe(jobId: string, callback: (status: JobStatus) => void) {
    if (!this.connections.has(jobId)) {
      this.connections.set(jobId, {
        eventSource: null,
        subscribers: new Set(),
        currentStatus: null,
        isConnected: false,
        connectionType: 'none',
        error: null,
        abortController: null,
        lastReconnectTime: 0,
        consecutiveFailures: 0
      });
    }
    
    const connection = this.connections.get(jobId)!;
    connection.subscribers.add(callback);
    
    // If we already have status, emit it immediately
    if (connection.currentStatus) {
      callback(connection.currentStatus);
    }
    
    return () => {
      connection.subscribers.delete(callback);
      if (connection.subscribers.size === 0) {
        this.cleanup(jobId);
      }
    };
  }
  
  async startConnection(jobId: string, getToken: () => Promise<string | null>) {
    const connection = this.connections.get(jobId);
    if (!connection) return;
    
    // Check if we're already connected
    if (connection.eventSource && connection.isConnected) {
      return;
    }
    
    // Debounce rapid reconnections
    const now = Date.now();
    if (now - connection.lastReconnectTime < this.DEBOUNCE_DELAY) {
      console.log(`[ConnectionManager] Debouncing reconnection for job ${jobId}`);
      return;
    }
    
    // Check global connection limit
    const activeConnections = Array.from(this.connections.values())
      .filter(c => c.isConnected && c.eventSource).length;
    
    if (activeConnections >= this.MAX_CONNECTIONS_GLOBAL) {
      console.log(`[ConnectionManager] Global connection limit reached (${activeConnections})`);
      this.fallbackToPolling(jobId, getToken);
      return;
    }
    
    connection.lastReconnectTime = now;
    this.cleanup(jobId, false); // Clean existing connection but keep subscribers
    
    // Create abort controller for this connection
    connection.abortController = new AbortController();
    
    try {
      const token = await getToken();
      if (!token) {
        this.notifyError(jobId, 'No authentication token available');
        return;
      }
      
      // Check if aborted during token fetch
      if (connection.abortController.signal.aborted) {
        return;
      }
      
      const url = `https://qibjqqucmbrtuirysexl.functions.supabase.co/job-stream?id=${jobId}&token=${token}`;
      const eventSource = new EventSource(url);
      
      connection.eventSource = eventSource;
      connection.connectionType = 'sse';
      connection.consecutiveFailures = 0;
      
      eventSource.onopen = () => {
        if (connection.abortController?.signal.aborted) return;
        
        connection.isConnected = true;
        connection.error = null;
        this.notifyConnectionChange(jobId);
        console.log(`[ConnectionManager] SSE connected for job ${jobId}`);
      };
      
      const handleMessage = (event: MessageEvent) => {
        if (connection.abortController?.signal.aborted) return;
        
        try {
          const data = JSON.parse(event.data);
          
          // Handle rate limiting
          if (event.type === 'info' && data.reason === 'rate_limited') {
            console.log(`[ConnectionManager] Rate limited for job ${jobId}`);
            this.notifyError(jobId, 'Rate limited');
            eventSource.close();
            
            // Fallback to polling with delay
            setTimeout(() => {
              if (!connection.abortController?.signal.aborted) {
                this.fallbackToPolling(jobId, getToken);
              }
            }, data.retryAfter || 60000);
            return;
          }
          
          if (data && (data.status || data.state || data.result)) {
            // Only update if data changed
            if (JSON.stringify(data) !== JSON.stringify(connection.currentStatus)) {
              connection.currentStatus = data;
              connection.subscribers.forEach(callback => callback(data));
            }
            
            // Close if terminal
            if (this.isJobTerminal(data)) {
              eventSource.close();
            }
          }
        } catch (err) {
          console.error(`[ConnectionManager] Failed to parse message for job ${jobId}:`, err);
        }
      };
      
      eventSource.onmessage = handleMessage;
      eventSource.addEventListener('progress', (e) => handleMessage(e as MessageEvent));
      eventSource.addEventListener('completed', (e) => handleMessage(e as MessageEvent));
      eventSource.addEventListener('failed', (e) => handleMessage(e as MessageEvent));
      eventSource.addEventListener('info', (e) => handleMessage(e as MessageEvent));
      
      eventSource.onerror = () => {
        if (connection.abortController?.signal.aborted) return;
        
        connection.isConnected = false;
        connection.consecutiveFailures++;
        eventSource.close();
        
        this.notifyError(jobId, 'SSE connection failed');
        console.log(`[ConnectionManager] SSE error for job ${jobId}, attempt ${connection.consecutiveFailures}`);
        
        // Circuit breaker: after 3 failures, wait longer or use polling
        if (connection.consecutiveFailures >= 3) {
          console.log(`[ConnectionManager] Circuit breaker for job ${jobId}, switching to polling`);
          this.fallbackToPolling(jobId, getToken);
        } else if (!this.isJobTerminal(connection.currentStatus)) {
          // Exponential backoff retry
          const delay = Math.min(30000 * Math.pow(2, connection.consecutiveFailures - 1), 300000);
          setTimeout(() => {
            if (!connection.abortController?.signal.aborted) {
              this.startConnection(jobId, getToken);
            }
          }, delay);
        }
      };
      
    } catch (err) {
      console.error(`[ConnectionManager] Failed to start connection for job ${jobId}:`, err);
      this.notifyError(jobId, 'Failed to start connection');
      
      // Fallback to polling after setup failure
      setTimeout(() => {
        if (!connection.abortController?.signal.aborted) {
          this.fallbackToPolling(jobId, getToken);
        }
      }, 1000);
    }
  }
  
  private async fallbackToPolling(jobId: string, getToken: () => Promise<string | null>) {
    const connection = this.connections.get(jobId);
    if (!connection) return;
    
    connection.connectionType = 'polling';
    connection.isConnected = true;
    connection.error = null;
    this.notifyConnectionChange(jobId);
    
    const { getJobStatus } = await import('@/lib/jobs-api');
    
    const poll = async () => {
      if (connection.abortController?.signal.aborted) return;
      
      try {
        const status = await getJobStatus(jobId, getToken);
        
        if (JSON.stringify(status) !== JSON.stringify(connection.currentStatus)) {
          connection.currentStatus = status as JobStatus;
          connection.subscribers.forEach(callback => callback(status as JobStatus));
        }
        
        if (!this.isJobTerminal(status as JobStatus) && !connection.abortController?.signal.aborted) {
          setTimeout(poll, 15000); // Poll every 15 seconds
        }
      } catch (err: any) {
        console.error(`[ConnectionManager] Polling error for job ${jobId}:`, err);
        this.notifyError(jobId, err.message || 'Polling failed');
      }
    };
    
    poll();
  }
  
  private cleanup(jobId: string, removeConnection = true) {
    const connection = this.connections.get(jobId);
    if (!connection) return;
    
    if (connection.eventSource) {
      connection.eventSource.close();
      connection.eventSource = null;
    }
    
    if (connection.abortController) {
      connection.abortController.abort();
      connection.abortController = null;
    }
    
    connection.isConnected = false;
    connection.connectionType = 'none';
    
    if (removeConnection) {
      this.connections.delete(jobId);
    }
  }
  
  private notifyConnectionChange(jobId: string) {
    // Connection state change notification could be added here
  }
  
  private notifyError(jobId: string, error: string) {
    const connection = this.connections.get(jobId);
    if (!connection) return;
    
    connection.error = error;
    // Error notification could be added here
  }
  
  private isJobTerminal(status?: JobStatus | null) {
    if (!status) return false;
    return status.status === 'completed' || status.status === 'failed';
  }
  
  getConnectionInfo(jobId: string) {
    const connection = this.connections.get(jobId);
    return {
      isConnected: connection?.isConnected ?? false,
      connectionType: connection?.connectionType ?? 'none',
      error: connection?.error ?? null,
      status: connection?.currentStatus ?? null
    };
  }
}

// Singleton instance
const connectionManager = new JobConnectionManager();

export const useJobConnectionManager = (jobId: string) => {
  const { getToken } = useAuth();
  
  return {
    subscribe: (callback: (status: JobStatus) => void) => 
      connectionManager.subscribe(jobId, callback),
    startConnection: () => connectionManager.startConnection(jobId, getToken),
    getConnectionInfo: () => connectionManager.getConnectionInfo(jobId)
  };
};