import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser } from "../_shared/auth.ts";
import { encryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if ('error' in auth) {
      console.error('[clerk-oauth-sync] Auth error:', auth.error);
      return new Response(JSON.stringify({ error: auth.error }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: auth.status 
      });
    }

    const { accessToken, refreshToken, expiresAt, channelId, channelTitle } = await req.json();
    
    if (!accessToken || !refreshToken) {
      console.error('[clerk-oauth-sync] Missing tokens');
      return new Response(JSON.stringify({ error: "missing_tokens" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 400 
      });
    }

    const encryptionKey = Deno.env.get("OAUTH_ENCRYPTION_KEY");
    if (!encryptionKey) {
      console.error('[clerk-oauth-sync] Encryption key not configured');
      return new Response(
        JSON.stringify({ error: "oauth_encryption_not_configured" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !serviceKey) {
      console.error('[clerk-oauth-sync] Supabase credentials not configured');
      return new Response(
        JSON.stringify({ error: "supabase_not_configured" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    console.log('[clerk-oauth-sync] Encrypting tokens for user:', auth.userId);
    const encryptedAccessToken = await encryptToken(accessToken);
    const encryptedRefreshToken = await encryptToken(refreshToken);

    const expiryDate = expiresAt ? new Date(expiresAt).toISOString() : new Date(Date.now() + 3600000).toISOString();

    console.log('[clerk-oauth-sync] Upserting to youtube_accounts table');
    const { error: dbErr } = await supabase
      .from('youtube_accounts')
      .upsert({
        user_id: auth.userId,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        expiry_date: expiryDate,
        channel_id: channelId || null,
        channel_title: channelTitle || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (dbErr) {
      console.error('[clerk-oauth-sync] Database error:', dbErr);
      return new Response(JSON.stringify({ error: dbErr.message }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 500 
      });
    }

    console.log('[clerk-oauth-sync] Successfully synced tokens for user:', auth.userId);
    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[clerk-oauth-sync] Unexpected error:', message);
    return new Response(JSON.stringify({ error: message }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" }, 
      status: 500 
    });
  }
});
