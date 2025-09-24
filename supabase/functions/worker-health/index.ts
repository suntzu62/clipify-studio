import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const workerApiUrl = Deno.env.get('WORKERS_API_URL') as string;
    const apiKey = Deno.env.get('WORKERS_API_KEY') as string;
    
    if (!workerApiUrl || !apiKey) {
      console.error('[worker-health] Workers API not configured');
      return new Response(JSON.stringify({ 
        error: 'workers_api_not_configured',
        configured: false,
        workerApiUrl: !!workerApiUrl,
        apiKey: !!apiKey
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      });
    }

    const base = workerApiUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    console.log('[worker-health] Checking worker health at:', base);
    
    // Check basic health
    const healthUrl = `${base}/health`;
    const healthResp = await fetch(healthUrl, { 
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(5000)
    });
    
    const isHealthy = healthResp.ok;
    let healthData: any = {};
    
    if (isHealthy) {
      try {
        healthData = await healthResp.json();
      } catch (e) {
        healthData = { status: 'ok', raw: await healthResp.text() };
      }
    } else {
      healthData = { 
        status: 'error', 
        httpStatus: healthResp.status,
        statusText: healthResp.statusText
      };
    }
    
    // Try detailed health endpoint
    let detailedHealth: any = null;
    try {
      const detailedUrl = `${base}/health/details`;
      const detailedResp = await fetch(detailedUrl, { 
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(3000)
      });
      
      if (detailedResp.ok) {
        detailedHealth = await detailedResp.json();
      } else {
        detailedHealth = { 
          available: false, 
          status: detailedResp.status,
          statusText: detailedResp.statusText
        };
      }
    } catch (e) {
      detailedHealth = { 
        available: false, 
        error: e instanceof Error ? e.message : String(e) 
      };
    }
    
    // Test job queue status endpoint
    let queueStatus: any = null;
    try {
      const queueUrl = `${base}/api/queues/status`;
      const queueResp = await fetch(queueUrl, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(3000)
      });
      
      if (queueResp.ok) {
        queueStatus = await queueResp.json();
      } else {
        queueStatus = {
          available: false,
          status: queueResp.status,
          statusText: queueResp.statusText
        };
      }
    } catch (e) {
      queueStatus = {
        available: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }

    const result = {
      configured: true,
      isHealthy,
      workerBaseUrl: base,
      basicHealth: healthData,
      detailedHealth,
      queueStatus,
      timestamp: new Date().toISOString(),
      // Enhanced diagnostic info
      diagnostics: {
        canConnect: isHealthy,
        hasDetailedEndpoint: detailedHealth?.available !== false,
        hasQueueEndpoint: queueStatus?.available !== false,
        hasWorkers: queueStatus?.ok && queueStatus?.totalJobs ? (queueStatus.totalJobs.active > 0 || queueStatus.totalJobs.waiting < 10) : false,
        workersConsuming: queueStatus?.ok ? queueStatus.queues?.some((q: any) => q.active > 0) : false,
        queuesDepth: queueStatus?.ok ? queueStatus.totalJobs : null,
        environment: queueStatus?.environment || null,
        workerUrl: base,
        healthUrl,
        recommendations: []
      }
    };
    
    // Add intelligent recommendations based on findings
    if (!isHealthy) {
      result.diagnostics.recommendations.push('Worker service is not responding - check if it\'s running and accessible');
    }
    if (!detailedHealth?.available) {
      result.diagnostics.recommendations.push('Detailed health endpoint not available - worker may be using basic setup');
    }
    if (!queueStatus?.available) {
      result.diagnostics.recommendations.push('Queue status endpoint not available - may indicate missing queue management');
    }
    if (queueStatus?.ok && !result.diagnostics.workersConsuming && queueStatus.totalJobs?.waiting > 0) {
      result.diagnostics.recommendations.push('Jobs are queued but no workers are consuming them - check Render.com start command should be "npm start"');
    }
    if (queueStatus?.environment?.workersApiKey === 'missing') {
      result.diagnostics.recommendations.push('WORKERS_API_KEY not configured in workers environment');
    }
    if (queueStatus?.environment?.openaiKey === 'missing') {
      result.diagnostics.recommendations.push('OPENAI_API_KEY not configured - transcription and text generation will fail');
    }
    if (!queueStatus?.redis?.connected) {
      result.diagnostics.recommendations.push('Redis connection failed - check REDIS_URL configuration');
    }
    
    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
    
  } catch (error) {
    console.error('[worker-health] Unhandled error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      configured: false,
      timestamp: new Date().toISOString()
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 500 
    });
  }
});