import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight, rejectDisallowedOrigin } from "../_shared/cors.ts";
import { isSafeIdentifier, userOwnsJob } from "../_shared/security.ts";

const userConnections = new Map<string, { count: number; lastConnection: number }>();
const MAX_CONNECTIONS_PER_USER = 3;
const CONNECTION_RESET_WINDOW = 60000;

function getPollingUrl(req: Request, jobId: string): string {
  const pollingUrl = new URL(req.url);
  pollingUrl.pathname = pollingUrl.pathname.replace(/job-stream$/, "job-status");
  pollingUrl.search = `?id=${encodeURIComponent(jobId)}`;
  return pollingUrl.toString();
}

function buildSseHeaders(corsHeaders: Record<string, string>, baseHeaders?: Headers): Headers {
  const headers = new Headers(baseHeaders);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-cache");
  headers.set("Connection", "keep-alive");
  return headers;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return handleCorsPreflight(req, "GET, OPTIONS");
  }

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) {
    return originRejection;
  }

  const auth = await requireUser(req);
  if ("error" in auth) {
    console.error("[job-stream] Authentication failed:", auth.error);
    return new Response(JSON.stringify({ error: auth.error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: auth.status,
    });
  }

  const userId = auth.userId;
  console.log("[job-stream] Request from user:", userId);

  const now = Date.now();
  const userConn = userConnections.get(userId) || { count: 0, lastConnection: now };

  if (now - userConn.lastConnection > CONNECTION_RESET_WINDOW) {
    userConn.count = 0;
  }

  userConn.count++;
  userConn.lastConnection = now;
  userConnections.set(userId, userConn);

  console.log(`[job-stream] User ${userId} connection count: ${userConn.count}`);

  if (userConn.count > MAX_CONNECTIONS_PER_USER) {
    console.warn(`[job-stream] Rate limit exceeded for user ${userId}: ${userConn.count} connections`);

    const retryAfter = 60000;
    const sseResponse = `retry: ${retryAfter}\n\nevent: info\ndata: ${JSON.stringify({
      reason: "user_rate_limited",
      retryAfter,
      message: "Too many concurrent connections from this user",
    })}\n\n`;

    return new Response(sseResponse, {
      status: 200,
      headers: buildSseHeaders(corsHeaders),
    });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id || !isSafeIdentifier(id)) {
      console.error("[job-stream] Missing or invalid job id parameter");
      return new Response(JSON.stringify({ error: "id required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!(await userOwnsJob(userId, id))) {
      return new Response(JSON.stringify({ error: "job_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    console.log(`[job-stream] Streaming job ${id} for user ${userId}`);

    const raw = Deno.env.get("WORKERS_API_URL") as string;
    const apiKey = Deno.env.get("WORKERS_API_KEY") as string;
    if (!raw || !apiKey) {
      console.error("[job-stream] Workers API not configured");
      return new Response(JSON.stringify({ error: "workers_api_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const base = raw.trim().replace(/\/+$/, "").replace(/\/api$/, "");
    const primaryUrl = `${base}/api/jobs/${id}/stream`;
    console.log(`[job-stream] Upstream primary: ${primaryUrl}`);

    const startTime = Date.now();
    let upstream = await fetch(primaryUrl, { headers: { "x-api-key": apiKey } });
    const primaryDuration = Date.now() - startTime;

    if (upstream.status === 404) {
      const altUrl = `${base}/jobs/${id}/stream`;
      console.log(`[job-stream] Primary 404 (${primaryDuration}ms), trying alt: ${altUrl}`);
      const altStartTime = Date.now();
      upstream = await fetch(altUrl, { headers: { "x-api-key": apiKey } });
      const altDuration = Date.now() - altStartTime;
      console.log(`[job-stream] Alt response: ${upstream.status} (${altDuration}ms)`);
    } else {
      console.log(`[job-stream] Primary response: ${upstream.status} (${primaryDuration}ms)`);
    }

    if (upstream.status === 429 || upstream.status === 503) {
      console.warn(`[job-stream] Upstream rate limited (${upstream.status}) for job ${id}, user ${userId}`);

      const retryAfter = 120000;
      const fallbackInfo = {
        reason: "upstream_rate_limited",
        retryAfter,
        message: "Upstream API rate limit exceeded, backing off for 2 minutes",
        jobId: id,
        fallbackAction: "use_polling",
        pollingInterval: 10000,
        pollingUrl: getPollingUrl(req, id),
        authNote: "Include Authorization: Bearer <token> header for polling",
      };

      const sseResponse = `retry: ${retryAfter}\n\nevent: info\ndata: ${JSON.stringify(fallbackInfo)}\n\n`;

      return new Response(sseResponse, {
        status: 200,
        headers: buildSseHeaders(corsHeaders),
      });
    }

    if (!upstream.ok) {
      console.error(`[job-stream] Upstream error ${upstream.status} for job ${id}, user ${userId}`);

      const fallbackInfo = {
        error: `Upstream error ${upstream.status}`,
        jobId: id,
        status: upstream.status,
        fallbackAction: "use_polling",
        pollingInterval: 5000,
        pollingUrl: getPollingUrl(req, id),
        message: "SSE unavailable, client should switch to polling",
      };

      const sseResponse = `event: error\ndata: ${JSON.stringify(fallbackInfo)}\n\n`;

      return new Response(sseResponse, {
        status: 200,
        headers: buildSseHeaders(corsHeaders),
      });
    }

    console.log(`[job-stream] Successfully established stream for job ${id}, user ${userId}`);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: buildSseHeaders(corsHeaders, upstream.headers),
    });
  } catch (err) {
    console.error("[job-stream] Error processing request:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
