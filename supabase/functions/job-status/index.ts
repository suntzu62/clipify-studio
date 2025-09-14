import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function requireAuth(req: Request) {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return { ok: false, res: new Response(JSON.stringify({ error: 'unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }) };
  }
  return { ok: true };
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
    const primaryUrl = `${base}/api/jobs/${id}/status`;
    console.log('[job-status] upstream primary:', primaryUrl);
    let resp = await fetch(primaryUrl, { headers: { 'x-api-key': apiKey } });

    if (resp.status === 404) {
      const altUrl = `${base}/jobs/${id}/status`;
      console.log('[job-status] primary 404, trying alt:', altUrl);
      resp = await fetch(altUrl, { headers: { 'x-api-key': apiKey } });
    }

    const data = await resp.json().catch(() => ({}));
    console.log('[job-status] upstream status:', resp.status);
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: resp.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
