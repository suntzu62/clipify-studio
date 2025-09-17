import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

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
    return new Response(JSON.stringify({ error: auth.error }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'id required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const raw = Deno.env.get('WORKERS_API_URL') as string;
    const apiKey = Deno.env.get('WORKERS_API_KEY') as string;
    if (!raw || !apiKey) {
      return new Response(JSON.stringify({ error: 'workers_api_not_configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    const base = raw.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    const primaryUrl = `${base}/api/jobs/${id}/stream`;
    console.log('[job-stream] upstream primary:', primaryUrl);
    let upstream = await fetch(primaryUrl, { headers: { 'x-api-key': apiKey } });

    if (upstream.status === 404) {
      const altUrl = `${base}/jobs/${id}/stream`;
      console.log('[job-stream] primary 404, trying alt:', altUrl);
      upstream = await fetch(altUrl, { headers: { 'x-api-key': apiKey } });
    }
    console.log('[job-stream] upstream status:', upstream.status);

    // Handle rate limiting gracefully
    if (upstream.status === 429 || upstream.status === 503) {
      console.log('[job-stream] rate limited, sending retry directive');
      
      const headers = new Headers();
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Content-Type', 'text/event-stream');
      headers.set('Cache-Control', 'no-cache');
      headers.set('Connection', 'keep-alive');

      // Create a custom SSE response with retry directive
      const retryAfter = 30000; // 30 seconds
      const sseResponse = `retry: ${retryAfter}\n\nevent: info\ndata: ${JSON.stringify({ 
        reason: "rate_limited", 
        retryAfter,
        message: "Rate limit exceeded, backing off"
      })}\n\n`;

      return new Response(sseResponse, { status: 200, headers });
    }

    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Content-Type', 'text/event-stream');
    headers.set('Cache-Control', 'no-cache');
    headers.set('Connection', 'keep-alive');

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
