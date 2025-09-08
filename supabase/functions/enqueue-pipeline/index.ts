import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function requireAuth(req: Request) {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return { ok: false, res: new Response(JSON.stringify({ error: 'unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }) };
  }
  return { ok: true, auth };
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
    const { youtubeUrl, neededMinutes = 0, meta } = await req.json();
    if (!youtubeUrl) {
      return new Response(JSON.stringify({ error: 'youtubeUrl required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    // Check usage quota via existing get-usage function
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const usageResp = await fetch(`${supabaseUrl}/functions/v1/get-usage`, {
      method: 'POST',
      headers: { authorization: req.headers.get('authorization') || '', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!usageResp.ok) {
      return new Response(JSON.stringify({ error: 'usage_check_failed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }
    const usage = await usageResp.json();
    const remaining = Number(usage?.minutesRemaining ?? 0);
    if (remaining < Number(neededMinutes)) {
      return new Response(JSON.stringify({ error: 'quota_exceeded', remaining }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 });
    }

    // Proxy to Workers API
    const apiUrl = Deno.env.get('WORKERS_API_URL') as string;
    const apiKey = Deno.env.get('WORKERS_API_KEY') as string;
    if (!apiUrl || !apiKey) {
      return new Response(JSON.stringify({ error: 'workers_api_not_configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    const userId = auth.userId;
    const resp = await fetch(`${apiUrl}/api/jobs/pipeline`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ youtubeUrl, meta: { ...meta, userId } }),
    });

    const data = await resp.json().catch(() => ({}));
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: resp.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
