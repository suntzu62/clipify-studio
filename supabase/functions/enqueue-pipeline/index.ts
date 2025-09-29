import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const { youtubeUrl, storagePath, source, fileName, neededMinutes = 0, targetDuration, meta } = await req.json();
    
    // Validate input: must have either youtubeUrl or storagePath
    if (!youtubeUrl && !storagePath) {
      return new Response(JSON.stringify({ error: 'youtubeUrl or storagePath required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    // Per-user rate limiting (10 pipelines per hour)
    const userId = auth.userId;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );
    
    // Check user's recent pipeline requests
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentJobs, error: jobsError } = await supabase
      .from('user_jobs')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', oneHourAgo);
    
    if (!jobsError && recentJobs && recentJobs.length >= 10) {
      return new Response(
        JSON.stringify({ error: 'user_rate_limit_exceeded', message: 'Máximo de 10 projetos por hora atingido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Best-effort usage check via get-usage (do not block on failure)
    try {
      const authHeader = req.headers.get('authorization') || undefined;
      const { data: usage } = await supabase.functions.invoke('get-usage', {
        method: 'GET',
        headers: authHeader ? { authorization: authHeader } : undefined,
      });
      const remaining = Number((usage as any)?.minutesRemaining ?? 0);
      const need = Number(neededMinutes) || 0;
      if (remaining && need && remaining < need) {
        return new Response(
          JSON.stringify({ error: 'quota_exceeded', remaining, needed: need }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 }
        );
      }
    } catch (_) {
      // ignore and proceed
    }

    // Proxy to Workers API with normalized base and fallback
    const raw = Deno.env.get('WORKERS_API_URL') as string;
    const apiKey = Deno.env.get('WORKERS_API_KEY') as string;
    if (!raw || !apiKey) {
      return new Response(JSON.stringify({ error: 'workers_api_not_configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    const base = raw.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    const primaryUrl = `${base}/api/jobs/pipeline`;
    
    // Build job data based on source
    const jobData = youtubeUrl 
      ? { youtubeUrl, source: 'youtube', meta: { ...(meta || {}), userId, targetDuration, neededMinutes } }
      : { storagePath, source: 'upload', fileName, meta: { ...(meta || {}), userId, targetDuration, neededMinutes } };
    
    console.log('[enqueue-pipeline] upstream primary:', primaryUrl, 'source:', source || 'youtube');
    let resp = await fetch(primaryUrl, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(jobData),
    });

    if (resp.status === 404) {
      const altUrl = `${base}/jobs/pipeline`;
      console.log('[enqueue-pipeline] primary 404, trying alt:', altUrl);
      resp = await fetch(altUrl, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(jobData),
      });
    }

    const data = await resp.json().catch(() => ({}));
    console.log('[enqueue-pipeline] upstream status:', resp.status);
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: resp.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});