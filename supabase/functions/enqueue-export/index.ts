import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight, rejectDisallowedOrigin } from "../_shared/cors.ts";
import { isSafeIdentifier, userOwnsJob } from "../_shared/security.ts";

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "POST, OPTIONS");
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight(req, "POST, OPTIONS");
  }

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) {
    return originRejection;
  }

  try {
    const auth = await requireUser(req);
    if ('error' in auth) {
      return new Response(JSON.stringify({ error: auth.error }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: auth.status });
    }

    const { rootId, clipId } = await req.json().catch(() => ({}));
    if (
      !rootId ||
      !clipId ||
      !isSafeIdentifier(rootId) ||
      !isSafeIdentifier(clipId)
    ) {
      return new Response(JSON.stringify({ error: 'rootId_and_clipId_required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    if (!(await userOwnsJob(auth.userId, rootId))) {
      return new Response(JSON.stringify({ error: 'job_not_found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 });
    }

    // Optionally create a queued record if not exists (best-effort)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
      const { data: existing } = await supabase
        .from('clip_exports')
        .select('id')
        .eq('root_id', rootId)
        .eq('clip_id', clipId)
        .eq('user_id', auth.userId)
        .limit(1)
        .maybeSingle();
      if (!existing) {
        await supabase.from('clip_exports').insert({ root_id: rootId, clip_id: clipId, user_id: auth.userId, status: 'queued' });
      }
    } catch (_) {}

    // Enqueue job on Workers API
    const raw = Deno.env.get('WORKERS_API_URL') as string;
    const apiKey = Deno.env.get('WORKERS_API_KEY') as string;
    if (!raw || !apiKey) {
      return new Response(JSON.stringify({ error: 'workers_api_not_configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    const base = raw.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    const primaryUrl = `${base}/api/jobs/export`;
    console.log('[enqueue-export] upstream primary:', primaryUrl);
    let resp = await fetch(primaryUrl, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId, clipId, meta: { userId: auth.userId } }),
    });

    if (resp.status === 404) {
      const altUrl = `${base}/jobs/export`;
      console.log('[enqueue-export] primary 404, trying alt:', altUrl);
      resp = await fetch(altUrl, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ rootId, clipId, meta: { userId: auth.userId } }),
      });
    }

    const data = await resp.json().catch(() => ({}));
    console.log('[enqueue-export] upstream status:', resp.status);
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: resp.status });
  } catch (err) {
    console.error('[enqueue-export] Error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
