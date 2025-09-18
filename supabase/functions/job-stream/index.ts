import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Per-user connection tracking for rate limiting
const userConnections = new Map<string, { count: number; lastConnection: number }>();
const MAX_CONNECTIONS_PER_USER = 3;
const CONNECTION_RESET_WINDOW = 60000; // 1 minute

function requireAuth(req: Request) {
  // Check for token in Authorization header
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return { ok: true };
  }
  
  // Check for token in query parameters (for SSE EventSource compatibility)
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (token) {
    return { ok: true };
  }
  
  return { ok: false, res: new Response(JSON.stringify({ error: 'unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }) };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUser(req);
  if ('error' in auth) {
    console.error('[job-stream] Authentication failed:', auth.error);
    return new Response(JSON.stringify({ error: auth.error }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: auth.status });
  }

  const userId = auth.userId;
  console.log('[job-stream] Request from user:', userId);

  // Per-user rate limiting
  const now = Date.now();
  const userConn = userConnections.get(userId) || { count: 0, lastConnection: now };
  
  // Reset count if window has passed
  if (now - userConn.lastConnection > CONNECTION_RESET_WINDOW) {
    userConn.count = 0;
  }
  
  userConn.count++;
  userConn.lastConnection = now;
  userConnections.set(userId, userConn);
  
  console.log(`[job-stream] User ${userId} connection count: ${userConn.count}`);
  
  // Reject if too many connections
  if (userConn.count > MAX_CONNECTIONS_PER_USER) {
    console.warn(`[job-stream] Rate limit exceeded for user ${userId}: ${userConn.count} connections`);
    
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Content-Type', 'text/event-stream');
    headers.set('Cache-Control', 'no-cache');
    headers.set('Connection', 'keep-alive');

    const retryAfter = 60000; // 60 seconds
    const sseResponse = `retry: ${retryAfter}\n\nevent: info\ndata: ${JSON.stringify({ 
      reason: "user_rate_limited", 
      retryAfter,
      message: "Too many concurrent connections from this user"
    })}\n\n`;

    return new Response(sseResponse, { status: 200, headers });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      console.error('[job-stream] Missing job id parameter');
      return new Response(JSON.stringify({ error: 'id required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    console.log(`[job-stream] Streaming job ${id} for user ${userId}`);

    const raw = Deno.env.get('WORKERS_API_URL') as string;
    const apiKey = Deno.env.get('WORKERS_API_KEY') as string;
    if (!raw || !apiKey) {
      console.error('[job-stream] Workers API not configured');
      return new Response(JSON.stringify({ error: 'workers_api_not_configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    const base = raw.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    const primaryUrl = `${base}/api/jobs/${id}/stream`;
    console.log(`[job-stream] Upstream primary: ${primaryUrl}`);
    
    const startTime = Date.now();
    let upstream = await fetch(primaryUrl, { headers: { 'x-api-key': apiKey } });
    const primaryDuration = Date.now() - startTime;

    if (upstream.status === 404) {
      const altUrl = `${base}/jobs/${id}/stream`;
      console.log(`[job-stream] Primary 404 (${primaryDuration}ms), trying alt: ${altUrl}`);
      const altStartTime = Date.now();
      upstream = await fetch(altUrl, { headers: { 'x-api-key': apiKey } });
      const altDuration = Date.now() - altStartTime;
      console.log(`[job-stream] Alt response: ${upstream.status} (${altDuration}ms)`);
    } else {
      console.log(`[job-stream] Primary response: ${upstream.status} (${primaryDuration}ms)`);
    }

    // Handle rate limiting gracefully with more aggressive backoff
    if (upstream.status === 429 || upstream.status === 503) {
      console.warn(`[job-stream] Upstream rate limited (${upstream.status}) for job ${id}, user ${userId}`);
      
      const headers = new Headers();
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Content-Type', 'text/event-stream');
      headers.set('Cache-Control', 'no-cache');
      headers.set('Connection', 'keep-alive');

      // Much more aggressive backoff for rate limits
      const retryAfter = 120000; // 2 minutes instead of 30 seconds
      const sseResponse = `retry: ${retryAfter}\n\nevent: info\ndata: ${JSON.stringify({ 
        reason: "upstream_rate_limited", 
        retryAfter,
        message: "Upstream API rate limit exceeded, backing off for 2 minutes",
        jobId: id
      })}\n\n`;

      return new Response(sseResponse, { status: 200, headers });
    }

    // Handle other error responses
    if (!upstream.ok) {
      console.error(`[job-stream] Upstream error ${upstream.status} for job ${id}, user ${userId}`);
      
      const headers = new Headers();
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Content-Type', 'text/event-stream');
      headers.set('Cache-Control', 'no-cache');
      headers.set('Connection', 'keep-alive');

      const sseResponse = `event: error\ndata: ${JSON.stringify({ 
        error: `Upstream error ${upstream.status}`,
        jobId: id,
        status: upstream.status
      })}\n\n`;

      return new Response(sseResponse, { status: 200, headers });
    }

    console.log(`[job-stream] Successfully established stream for job ${id}, user ${userId}`);
    
    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Content-Type', 'text/event-stream');
    headers.set('Cache-Control', 'no-cache');
    headers.set('Connection', 'keep-alive');

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[job-stream] Error processing request: ${message}`);
    return new Response(JSON.stringify({ error: message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
