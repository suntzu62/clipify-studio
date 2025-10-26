import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function exchangeCodeForTokens(code: string, redirectUri: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`token_exchange_failed: ${resp.status} ${text}`);
  }
  return await resp.json();
}

async function fetchChannelInfo(accessToken: string) {
  const resp = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const item = data?.items?.[0];
  if (!item) return null;
  return {
    channel_id: item.id as string,
    channel_title: item.snippet?.title as string,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // user_id
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(JSON.stringify({ error }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }
    if (!code || !state) {
      return new Response(JSON.stringify({ error: "missing_code_or_state" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
    const redirectUri = Deno.env.get("YT_REDIRECT_URI") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const encryptionKey = Deno.env.get("OAUTH_ENCRYPTION_KEY");
    
    if (!encryptionKey) {
      return new Response(
        JSON.stringify({ error: "oauth_encryption_not_configured" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    
    if (!clientId || !clientSecret || !redirectUri || !supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "oauth_not_configured" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
    }

    const tokens = await exchangeCodeForTokens(code, redirectUri, clientId, clientSecret);
    const access_token = tokens.access_token as string | undefined;
    const refresh_token = tokens.refresh_token as string | undefined;
    const expires_in = Number(tokens.expires_in || 0);
    const scope = tokens.scope as string | undefined;

    if (!refresh_token) {
      // Sometimes Google omits refresh_token on subsequent consents without prompt=consent
      // In this flow we always request prompt=consent, but handle this defensively
      return new Response(JSON.stringify({ error: "no_refresh_token_returned" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const expiry_date = new Date(Date.now() + Math.max(0, expires_in - 30) * 1000).toISOString();

    // Optional: fetch channel info
    let channel: { channel_id?: string; channel_title?: string } | null = null;
    if (access_token) {
      try { channel = await fetchChannelInfo(access_token); } catch {}
    }

    // Criptografar tokens antes de armazenar
    const encryptedAccessToken = access_token ? await encryptToken(access_token) : null;
    const encryptedRefreshToken = await encryptToken(refresh_token);

    // Upsert account com tokens criptografados
    const upsertPayload: any = {
      user_id: state,
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      expiry_date,
      scope: scope ?? null,
      channel_id: channel?.channel_id ?? null,
      channel_title: channel?.channel_title ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error: dbErr } = await supabase
      .from('youtube_accounts')
      .upsert(upsertPayload, { onConflict: 'user_id' });

    if (dbErr) {
      return new Response(JSON.stringify({ error: dbErr.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
    }

    // Redirect back to app with flag
    const appUrl = new URL(Deno.env.get("APP_URL") || "https://clipify-studio.lovable.app");
    appUrl.searchParams.set("connected", "youtube");
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: appUrl.toString() } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});

