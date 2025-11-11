import { useAuth } from '@/contexts/AuthContext';
import { JobStatus } from './useJobStream';
import { getJobStatus } from '@/lib/jobs-api';

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
  isCleaningUp: boolean;
  pollingTimeoutId: number | null;
  referenceCount: number;
  lastHeartbeat: number;
  circuitBreakerUntil: number;
  connectionAttempts: number;
  isConnecting: boolean; // NEW: prevent simultaneous connection attempts
  connectionHistory: Array<{ timestamp: number; type: string; success: boolean }>; // NEW: track connection history
}

interface ConnectionMetrics {
  totalConnections: number;
  activeSSEConnections: number;
  activePollingConnections: number;
  circuitBreakerTriggered: number;
  rateLimitedConnections: number;
}

class JobConnectionManager {
  private connections = new Map<string, ConnectionState>();
  private readonly DEBOUNCE_DELAY = 2000; // 2 seconds minimum between reconnects (more responsive)
  private readonly MAX_CONNECTIONS_GLOBAL = 1; // Strict: only 1 SSE connection total
  private readonly CIRCUIT_BREAKER_FAILURES = 5; // Relaxed: 5 failures before circuit breaker (was 2)
  private readonly CIRCUIT_BREAKER_COOLDOWN = 30000; // 30 seconds cooldown (was 60s)
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds heartbeat check
  private readonly ZOMBIE_TIMEOUT = 90000; // 90 seconds without heartbeat = zombie
  private readonly MAX_CONNECTION_ATTEMPTS = 5; // Max 5 attempts before permanent fallback (was 2)
  private metrics: ConnectionMetrics = {
    totalConnections: 0,
    activeSSEConnections: 0,
    activePollingConnections: 0,
    circuitBreakerTriggered: 0,
    rateLimitedConnections: 0
  };
  
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
        consecutiveFailures: 0,
        isCleaningUp: false,
        pollingTimeoutId: null,
        referenceCount: 0,
        lastHeartbeat: Date.now(),
        circuitBreakerUntil: 0,
        connectionAttempts: 0,
        isConnecting: false, // NEW: prevent simultaneous connections
        connectionHistory: [] // NEW: track connection attempts
      });
      this.metrics.totalConnections++;
    }
    
    const connection = this.connections.get(jobId)!;
    connection.subscribers.add(callback);
    connection.referenceCount++;
    
    console.log(`[ConnectionManager] Subscribed to job ${jobId}, references: ${connection.referenceCount}`);
    
    // If we already have status, emit it immediately
    if (connection.currentStatus) {
      callback(connection.currentStatus);
    }
    
    return () => {
      connection.subscribers.delete(callback);
      connection.referenceCount--;
      console.log(`[ConnectionManager] Unsubscribed from job ${jobId}, references: ${connection.referenceCount}`);
      
      if (connection.referenceCount <= 0) {
        console.log(`[ConnectionManager] No more references for job ${jobId}, cleaning up`);
        this.cleanup(jobId, true);
      }
    };
  }
  
  async startConnection(jobId: string, getToken: () => Promise<string | null>) {
    const connection = this.connections.get(jobId);
    if (!connection || connection.isCleaningUp) return;
    
    // CRITICAL FIX: Prevent simultaneous connection attempts
    if (connection.isConnecting) {
      console.log(`[ConnectionManager] Already connecting to job ${jobId}, skipping`);
      return;
    }
    
    // Check circuit breaker
    const now = Date.now();
    if (connection.circuitBreakerUntil > now) {
      const remainingTime = Math.ceil((connection.circuitBreakerUntil - now) / 1000);
      console.log(`[ConnectionManager] Circuit breaker active for job ${jobId}, ${remainingTime}s remaining`);
      this.fallbackToPolling(jobId, getToken);
      return;
    }
    
    // Check if we're already connected via SSE
    if (connection.eventSource && connection.isConnected && connection.connectionType === 'sse') {
      console.log(`[ConnectionManager] Already connected via SSE for job ${jobId}`);
      return;
    }
    
    // ENHANCED: More aggressive debouncing
    const timeSinceLastReconnect = now - connection.lastReconnectTime;
    if (timeSinceLastReconnect < this.DEBOUNCE_DELAY) {
      console.log(`[ConnectionManager] Debouncing reconnection for job ${jobId} (${timeSinceLastReconnect}ms < ${this.DEBOUNCE_DELAY}ms)`);
      return;
    }
    
    // Check if we've exceeded max connection attempts
    if (connection.connectionAttempts >= this.MAX_CONNECTION_ATTEMPTS) {
      console.log(`[ConnectionManager] Max connection attempts reached for job ${jobId} (${connection.connectionAttempts}/${this.MAX_CONNECTION_ATTEMPTS}), using polling only`);
      this.fallbackToPolling(jobId, getToken);
      return;
    }
    
    // Global SSE connection limit - only allow 1 SSE connection at a time
    const activeSSEConnections = Array.from(this.connections.values())
      .filter(c => c.isConnected && c.connectionType === 'sse').length;
    
    if (activeSSEConnections >= this.MAX_CONNECTIONS_GLOBAL) {
      console.log(`[ConnectionManager] Global SSE limit reached (${activeSSEConnections}/${this.MAX_CONNECTIONS_GLOBAL}), using polling for job ${jobId}`);
      this.fallbackToPolling(jobId, getToken);
      return;
    }
    
    // CRITICAL: Set connecting flag to prevent race conditions
    connection.isConnecting = true;
    connection.lastReconnectTime = now;
    connection.connectionAttempts++;
    
    // Log connection attempt
    connection.connectionHistory.push({
      timestamp: now,
      type: 'sse_attempt',
      success: false // Will be updated on success
    });
    
    // Keep only last 10 history entries
    if (connection.connectionHistory.length > 10) {
      connection.connectionHistory = connection.connectionHistory.slice(-10);
    }
    
    this.cleanup(jobId, false); // Clean existing connection but keep subscribers
    
    // Create abort controller for this connection
    connection.abortController = new AbortController();
    const abortSignal = connection.abortController.signal;
    
    try {
      const token = await getToken();
      if (!token) {
        this.notifyError(jobId, 'No authentication token available');
        return;
      }
      
      // Check if aborted during token fetch
      if (abortSignal.aborted || connection.isCleaningUp) {
        return;
      }
      
      console.log(`[ConnectionManager] Starting SSE connection for job ${jobId} (attempt ${connection.connectionAttempts})`);
      
      // CRITICAL: Only use local workers API in development mode
      // In production, ALWAYS use Supabase Edge Function (job-stream) to avoid CORS issues
      const useLocalAPI = import.meta.env.DEV && import.meta.env.VITE_WORKERS_API_URL && import.meta.env.VITE_WORKERS_API_KEY;
      let url: string;
      
      if (useLocalAPI) {
        // Development only: connect directly to local workers API
        const apiKey = import.meta.env.VITE_WORKERS_API_KEY;
        url = `${import.meta.env.VITE_WORKERS_API_URL}/api/jobs/${jobId}/stream?api_key=${apiKey}`;
        console.log(`[ConnectionManager] 🔧 DEV MODE: Using local workers API: ${url}`);
      } else {
        // Production: ALWAYS use Supabase Edge Function (job-stream) as proxy
        // The Edge Function uses WORKERS_API_URL and WORKERS_API_KEY from Supabase Secrets
        url = `https://qibjqqucmbrtuirysexl.supabase.co/functions/v1/job-stream?id=${jobId}&token=${token}`;
        console.log(`[ConnectionManager] 🚀 PRODUCTION: Using Supabase Edge Function: https://qibjqqucmbrtuirysexl.supabase.co/functions/v1/job-stream`);
      }
      
      const eventSource = new EventSource(url);
      
      connection.eventSource = eventSource;
      connection.connectionType = 'sse';
      connection.lastHeartbeat = now;
      this.metrics.activeSSEConnections++;
      
      // Setup heartbeat monitor
      this.startHeartbeatMonitor(jobId);
      
      eventSource.onopen = () => {
        if (abortSignal.aborted || connection.isCleaningUp) return;
        
        connection.isConnected = true;
        connection.isConnecting = false; // CRITICAL: Clear connecting flag on success
        connection.error = null;
        connection.consecutiveFailures = 0;
        connection.lastHeartbeat = Date.now();
        
        // Update connection history
        const lastEntry = connection.connectionHistory[connection.connectionHistory.length - 1];
        if (lastEntry && lastEntry.type === 'sse_attempt') {
          lastEntry.success = true;
        }
        
        this.notifyConnectionChange(jobId);
        console.log(`[ConnectionManager] SSE connected for job ${jobId}`);
      };
      
      const handleMessage = (event: MessageEvent) => {
        if (abortSignal.aborted || connection.isCleaningUp) return;
        
        connection.lastHeartbeat = Date.now(); // Update heartbeat on any message
        
        try {
          const data = JSON.parse(event.data);
          
          // Handle rate limiting
          if (event.type === 'info' && data.reason === 'rate_limited') {
            console.log(`[ConnectionManager] Rate limited for job ${jobId}`);
            this.metrics.rateLimitedConnections++;
            this.notifyError(jobId, 'Rate limited');
            eventSource.close();
            
            // Immediate fallback to polling with extended delay
            setTimeout(() => {
              const conn = this.connections.get(jobId);
              if (conn && !conn.isCleaningUp && !abortSignal.aborted) {
                this.fallbackToPolling(jobId, getToken);
              }
            }, data.retryAfter || 60000);
            return;
          }
          
          if (data && (data.status || data.state || data.result)) {
            // Only update if data changed
            if (JSON.stringify(data) !== JSON.stringify(connection.currentStatus)) {
              connection.currentStatus = data;
              connection.subscribers.forEach(callback => {
                try {
                  callback(data);
                } catch (err) {
                  console.error(`[ConnectionManager] Error in subscriber callback for job ${jobId}:`, err);
                }
              });
            }
            
            // Close if terminal
            if (this.isJobTerminal(data)) {
              console.log(`[ConnectionManager] Job ${jobId} is terminal, closing connection`);
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
        if (abortSignal.aborted || connection.isCleaningUp) return;
        
        connection.isConnected = false;
        connection.isConnecting = false; // CRITICAL: Clear connecting flag on error
        connection.consecutiveFailures++;
        this.metrics.activeSSEConnections = Math.max(0, this.metrics.activeSSEConnections - 1);
        
        try {
          eventSource.close();
        } catch (e) {
          // Ignore close errors
        }
        
        this.notifyError(jobId, 'SSE connection failed');
        console.log(`[ConnectionManager] SSE error for job ${jobId}, failure ${connection.consecutiveFailures}/${this.CIRCUIT_BREAKER_FAILURES}`);
        
        // Circuit breaker: after 2 failures, activate circuit breaker with longer cooldown
        if (connection.consecutiveFailures >= this.CIRCUIT_BREAKER_FAILURES) {
          connection.circuitBreakerUntil = Date.now() + this.CIRCUIT_BREAKER_COOLDOWN;
          this.metrics.circuitBreakerTriggered++;
          console.log(`[ConnectionManager] Circuit breaker activated for job ${jobId} for ${this.CIRCUIT_BREAKER_COOLDOWN}ms`);
          this.fallbackToPolling(jobId, getToken);
        } else if (!this.isJobTerminal(connection.currentStatus)) {
          // ENHANCED: More aggressive exponential backoff
          const baseDelay = 15000; // Start with 15 seconds
          const delay = Math.min(baseDelay * Math.pow(3, connection.consecutiveFailures - 1), 120000); // Max 2 minutes
          console.log(`[ConnectionManager] Retrying SSE connection for job ${jobId} in ${delay}ms (attempt ${connection.connectionAttempts + 1})`);
          
          setTimeout(() => {
            const conn = this.connections.get(jobId);
            if (conn && !conn.isCleaningUp && !abortSignal.aborted && !conn.isConnecting) {
              this.startConnection(jobId, getToken);
            }
          }, delay);
        }
      };
      
    } catch (err) {
      console.error(`[ConnectionManager] Failed to start connection for job ${jobId}:`, err);
      connection.isConnecting = false; // CRITICAL: Clear connecting flag on setup failure
      this.notifyError(jobId, 'Failed to start connection');
      
      // Fallback to polling after setup failure
      setTimeout(() => {
        const conn = this.connections.get(jobId);
        if (conn && !conn.isCleaningUp && !abortSignal.aborted && !conn.isConnecting) {
          this.fallbackToPolling(jobId, getToken);
        }
      }, 5000); // Increased delay after failure
    }
  }
  
  private startHeartbeatMonitor(jobId: string) {
    const checkHeartbeat = () => {
      const connection = this.connections.get(jobId);
      if (!connection || connection.isCleaningUp || connection.connectionType !== 'sse') {
        return;
      }
      
      const now = Date.now();
      const timeSinceLastHeartbeat = now - connection.lastHeartbeat;
      
      if (timeSinceLastHeartbeat > this.ZOMBIE_TIMEOUT) {
        console.log(`[ConnectionManager] Zombie connection detected for job ${jobId}, last heartbeat ${timeSinceLastHeartbeat}ms ago`);
        connection.consecutiveFailures++;
        this.cleanup(jobId, false);
        
        // Trigger circuit breaker if too many zombie connections
        if (connection.consecutiveFailures >= this.CIRCUIT_BREAKER_FAILURES) {
          connection.circuitBreakerUntil = Date.now() + this.CIRCUIT_BREAKER_COOLDOWN;
          this.metrics.circuitBreakerTriggered++;
        }
        
        // Don't try to start polling from heartbeat monitor
        // Let the main connection manager handle reconnection
      } else {
        // Schedule next heartbeat check
        setTimeout(checkHeartbeat, this.HEARTBEAT_INTERVAL);
      }
    };
    
    setTimeout(checkHeartbeat, this.HEARTBEAT_INTERVAL);
  }
  
  private async fallbackToPolling(jobId: string, getToken: () => Promise<string | null>) {
    const connection = this.connections.get(jobId);
    if (!connection || connection.isCleaningUp) return;
    
    // Update metrics
    if (connection.connectionType === 'sse') {
      this.metrics.activeSSEConnections = Math.max(0, this.metrics.activeSSEConnections - 1);
    }
    
    // Clear any existing polling
    if (connection.pollingTimeoutId) {
      clearTimeout(connection.pollingTimeoutId);
      connection.pollingTimeoutId = null;
    }
    
    connection.connectionType = 'polling';
    connection.isConnected = true;
    connection.error = null;
    this.metrics.activePollingConnections++;
    this.notifyConnectionChange(jobId);
    
    console.log(`[ConnectionManager] Fallback to polling for job ${jobId}`);
    
    const poll = async () => {
      const conn = this.connections.get(jobId);
      if (!conn || conn.isCleaningUp) return;
      
      const abortController = conn.abortController;
      if (!abortController || abortController.signal.aborted) return;
      
      try {
        const status = await getJobStatus(jobId, getToken);
        
        // Check again after async operation
        if (!conn || conn.isCleaningUp || abortController.signal.aborted) return;
        
        if (JSON.stringify(status) !== JSON.stringify(conn.currentStatus)) {
          conn.currentStatus = status as JobStatus;
          conn.subscribers.forEach(callback => {
            try {
              callback(status as JobStatus);
            } catch (err) {
              console.error(`[ConnectionManager] Error in polling callback for job ${jobId}:`, err);
            }
          });
        }
        
        if (!this.isJobTerminal(status as JobStatus) && !conn.isCleaningUp && !abortController.signal.aborted) {
          // Exponential backoff polling
          const baseInterval = 5000; // Start with 5 seconds (was 10s) for more responsive updates
          const backoffMultiplier = Math.min(Math.pow(1.5, conn.consecutiveFailures), 6); // Max 6x backoff
          const interval = baseInterval * backoffMultiplier;

          conn.pollingTimeoutId = window.setTimeout(poll, interval);
        }
      } catch (err: any) {
        console.error(`[ConnectionManager] Polling error for job ${jobId}:`, err);
        this.notifyError(jobId, err.message || 'Polling failed');
        
        // Retry polling after error if connection is still active
        if (!conn.isCleaningUp && conn.abortController && !conn.abortController.signal.aborted && conn.referenceCount > 0) {
          conn.pollingTimeoutId = window.setTimeout(poll, 60000); // Wait longer after error
        }
      }
    };
    
    // Start polling immediately
    poll();
  }
  
  private cleanup(jobId: string, removeConnection = true) {
    const connection = this.connections.get(jobId);
    if (!connection) return;
    
    console.log(`[ConnectionManager] Cleaning up job ${jobId}, removeConnection: ${removeConnection}`);
    
    // Mark as cleaning up to prevent race conditions
    connection.isCleaningUp = true;
    
    // Update metrics
    if (connection.connectionType === 'sse' && connection.isConnected) {
      this.metrics.activeSSEConnections = Math.max(0, this.metrics.activeSSEConnections - 1);
    }
    if (connection.connectionType === 'polling' && connection.isConnected) {
      this.metrics.activePollingConnections = Math.max(0, this.metrics.activePollingConnections - 1);
    }
    
    // Clear polling timeout
    if (connection.pollingTimeoutId) {
      clearTimeout(connection.pollingTimeoutId);
      connection.pollingTimeoutId = null;
    }
    
    // Close EventSource
    if (connection.eventSource) {
      try {
        connection.eventSource.close();
        console.log(`[ConnectionManager] EventSource closed for job ${jobId}`);
      } catch (e) {
        console.error(`[ConnectionManager] Error closing EventSource for job ${jobId}:`, e);
      }
      connection.eventSource = null;
    }
    
    // Abort any ongoing operations
    if (connection.abortController) {
      try {
        connection.abortController.abort();
        console.log(`[ConnectionManager] AbortController aborted for job ${jobId}`);
      } catch (e) {
        console.error(`[ConnectionManager] Error aborting controller for job ${jobId}:`, e);
      }
      connection.abortController = null;
    }
    
    connection.isConnected = false;
    connection.isConnecting = false; // CRITICAL: Clear connecting flag on cleanup
    connection.connectionType = 'none';
    connection.error = null;
    
    if (removeConnection) {
      this.connections.delete(jobId);
      console.log(`[ConnectionManager] Connection removed for job ${jobId}`);
    } else {
      // Reset cleanup flag if keeping connection
      connection.isCleaningUp = false;
    }
  }
  
  private notifyConnectionChange(jobId: string) {
    const connection = this.connections.get(jobId);
    if (!connection) return;
    
    console.log(`[ConnectionManager] Connection change for job ${jobId}: ${connection.connectionType} (connected: ${connection.isConnected})`);
  }
  
  private notifyError(jobId: string, error: string) {
    const connection = this.connections.get(jobId);
    if (!connection) return;
    
    connection.error = error;
    console.error(`[ConnectionManager] Error for job ${jobId}: ${error}`);
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
      status: connection?.currentStatus ?? null,
      referenceCount: connection?.referenceCount ?? 0,
      consecutiveFailures: connection?.consecutiveFailures ?? 0,
      circuitBreakerActive: connection ? connection.circuitBreakerUntil > Date.now() : false,
      connectionAttempts: connection?.connectionAttempts ?? 0
    };
  }
  
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }
  
  // Debug method to get all connection states
  getAllConnections() {
    const result: Record<string, any> = {};
    this.connections.forEach((connection, jobId) => {
      result[jobId] = {
        isConnected: connection.isConnected,
        connectionType: connection.connectionType,
        referenceCount: connection.referenceCount,
        consecutiveFailures: connection.consecutiveFailures,
        circuitBreakerActive: connection.circuitBreakerUntil > Date.now(),
        connectionAttempts: connection.connectionAttempts,
        lastHeartbeat: new Date(connection.lastHeartbeat).toISOString(),
        hasEventSource: !!connection.eventSource,
        isCleaningUp: connection.isCleaningUp
      };
    });
    return result;
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
    getConnectionInfo: () => connectionManager.getConnectionInfo(jobId),
    getMetrics: () => connectionManager.getMetrics(),
    getAllConnections: () => connectionManager.getAllConnections()
  };
};