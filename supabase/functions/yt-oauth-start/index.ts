import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if ('error' in auth) {
      return new Response(JSON.stringify({ error: auth.error }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: auth.status });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
    const redirectUri = Deno.env.get("YT_REDIRECT_URI") ?? "";
    const scope = Deno.env.get("YT_SCOPES") ?? "https://www.googleapis.com/auth/youtube.upload";

    if (!clientId || !redirectUri) {
      return new Response(JSON.stringify({ error: "oauth_not_configured" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
    }

    const params = new URLSearchParams({
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state: auth.userId,
    });

    const consentUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: consentUrl } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
