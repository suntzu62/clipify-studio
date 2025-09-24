import { supabaseFunctions } from '@/integrations/supabase/client';

export interface WorkerHealthStatus {
  configured: boolean;
  isHealthy: boolean;
  workerBaseUrl?: string;
  basicHealth?: any;
  detailedHealth?: any;
  queueStatus?: any;
  timestamp: string;
  diagnostics?: {
    canConnect: boolean;
    hasDetailedEndpoint: boolean;
    hasQueueEndpoint: boolean;
    hasWorkers: boolean;
    workersConsuming: boolean;
    queuesDepth: any;
    environment: any;
    workerUrl: string;
    healthUrl: string;
    recommendations: string[];
  };
  error?: string;
}

export async function checkWorkerHealth(): Promise<WorkerHealthStatus> {
  try {
    const { data, error } = await supabaseFunctions.functions.invoke<WorkerHealthStatus>('worker-health', {
      method: 'GET'
    });
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  } catch (error) {
    console.error('[checkWorkerHealth] Failed to check worker health:', error);
    return {
      configured: false,
      isHealthy: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    };
  }
}