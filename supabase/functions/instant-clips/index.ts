import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function normalizeYoutubeUrl(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const idMatch = trimmed.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})(?=[^A-Za-z0-9_-]|$)/);
  if (idMatch && idMatch[1]) {
    return `https://www.youtube.com/watch?v=${idMatch[1]}`;
  }
  const firstUrl = trimmed.match(/https?:\/\/[^\s]+/);
  if (firstUrl) {
    return firstUrl[0];
  }
  return trimmed.split(/\s+/)[0];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUser(req);
  if ('error' in auth) {
    return new Response(JSON.stringify({ error: auth.error }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: auth.status 
    });
  }

  try {
    const { youtubeUrl } = await req.json();
    if (!youtubeUrl) {
      return new Response(JSON.stringify({ error: 'youtubeUrl required' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      });
    }

    const normalizedUrl = normalizeYoutubeUrl(youtubeUrl);
    if (!normalizedUrl) {
      return new Response(JSON.stringify({ error: 'invalid YouTube URL' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      });
    }

    // Call Workers API instant endpoint
    const workersApiUrl = Deno.env.get('WORKERS_API_URL');
    const workersApiKey = Deno.env.get('WORKERS_API_KEY');
    
    if (!workersApiUrl || !workersApiKey) {
      return new Response(JSON.stringify({ error: 'workers_api_not_configured' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      });
    }

    const base = workersApiUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    const instantUrl = `${base}/api/jobs/instant`;
    
    console.log('[instant-clips] calling workers API:', instantUrl);
    
    const response = await fetch(instantUrl, {
      method: 'POST',
      headers: {
        'x-api-key': workersApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ youtubeUrl: normalizedUrl }),
    });

    const data = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      console.error('[instant-clips] workers API error:', response.status, data);
      return new Response(JSON.stringify({ 
        error: 'instant_processing_failed',
        details: data 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: response.status 
      });
    }

    console.log('[instant-clips] success:', data.source, `${data.processingTime}ms`);
    
    return new Response(JSON.stringify(data), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 200 
    });

  } catch (err) {
    console.error('[instant-clips] error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 500 
    });
  }
});