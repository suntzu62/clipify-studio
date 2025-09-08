import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if ('error' in auth) {
      return new Response(JSON.stringify({ error: auth.error }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: auth.status });
    }

    const { rootId, clipId } = await req.json().catch(() => ({}));
    if (!rootId || !clipId) {
      return new Response(JSON.stringify({ error: 'rootId_and_clipId_required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
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
    const apiUrl = Deno.env.get('WORKERS_API_URL') as string;
    const apiKey = Deno.env.get('WORKERS_API_KEY') as string;
    if (!apiUrl || !apiKey) {
      return new Response(JSON.stringify({ error: 'workers_api_not_configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    const resp = await fetch(`${apiUrl}/api/jobs/export`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ rootId, clipId, meta: { userId: auth.userId } }),
    });
    const data = await resp.json().catch(() => ({}));
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: resp.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
