import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight, rejectDisallowedOrigin } from "../_shared/cors.ts";
import {
  isUserOwnedUploadPath,
  isValidYouTubeUrl,
  normalizeStoragePath,
  normalizeYoutubeUrl,
  sanitizeStorageFilename,
} from "../_shared/security.ts";

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return handleCorsPreflight(req, "POST, OPTIONS");
  }

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) {
    return originRejection;
  }

  const auth = await requireUser(req);
  if ("error" in auth) {
    return new Response(JSON.stringify({ error: auth.error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: auth.status,
    });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "invalid_body" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const userId = auth.userId;

    let source: {
      type: "youtube";
      youtubeUrl: string;
    } | {
      type: "upload";
      storagePath: string;
      fileName: string;
      bucket: "raw";
    };

    if (body.youtubeUrl) {
      const youtubeUrl = normalizeYoutubeUrl(String(body.youtubeUrl));
      if (!isValidYouTubeUrl(youtubeUrl)) {
        return new Response(JSON.stringify({ error: "invalid_youtube_url" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      source = { type: "youtube", youtubeUrl };
    } else if (body.storagePath || body.upload) {
      const uploadData = typeof body.upload === "object" && body.upload ? body.upload : {};
      const storagePath = normalizeStoragePath(String(body.storagePath || uploadData.objectKey || ""));
      const bucket = String(uploadData.bucket || "raw");

      if (!storagePath || bucket !== "raw" || !isUserOwnedUploadPath(userId, storagePath)) {
        return new Response(JSON.stringify({ error: "invalid_upload_source" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      source = {
        type: "upload",
        storagePath,
        fileName: sanitizeStorageFilename(String(body.fileName || uploadData.originalName || storagePath.split("/").pop() || "upload.mp4")),
        bucket: "raw",
      };
    } else {
      return new Response(JSON.stringify({ error: "invalid_source" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const targetDuration = Number(body.targetDuration || body.meta?.targetDuration || 30);
    const neededMinutes = Number(body.neededMinutes || body.meta?.neededMinutes || 0);

    if (!Number.isFinite(targetDuration) || targetDuration < 5 || targetDuration > 600) {
      return new Response(JSON.stringify({ error: "invalid_target_duration" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!Number.isFinite(neededMinutes) || neededMinutes < 0 || neededMinutes > 1440) {
      return new Response(JSON.stringify({ error: "invalid_needed_minutes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const rootId = `job_${crypto.randomUUID().replace(/-/g, "")}`;
    const jobData = {
      rootId,
      source,
      meta: {
        userId,
        targetDuration,
        neededMinutes,
        createdAt: new Date().toISOString(),
      },
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recentJobs } = await supabase
      .from("user_jobs")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo);

    if (recentJobs && recentJobs.length >= 10) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 429,
      });
    }

    const { error: insertError } = await supabase.from("user_jobs").insert({
      id: rootId,
      user_id: userId,
      status: "queued",
      progress: 0,
      youtube_url: source.type === "youtube" ? source.youtubeUrl : null,
      storage_path: source.type === "upload" ? source.storagePath : null,
      file_name: source.type === "upload" ? source.fileName : null,
      source: source.type,
    });

    if (insertError) {
      throw new Error(`job_insert_failed:${insertError.message}`);
    }

    const workersApiUrl = Deno.env.get("WORKERS_API_URL");
    if (!workersApiUrl) {
      console.error("[enqueue-pipeline] WORKERS_API_URL not configured");
      return new Response(JSON.stringify({ error: "workers_api_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const workersApiKey = Deno.env.get("WORKERS_API_KEY");
    if (!workersApiKey) {
      console.error("[enqueue-pipeline] WORKERS_API_KEY not configured");
      return new Response(JSON.stringify({ error: "workers_api_key_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    console.log("[enqueue-pipeline] Using Workers API:", workersApiUrl);

    const response = await fetch(`${workersApiUrl}/api/jobs/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": workersApiKey },
      body: JSON.stringify(jobData),
    });

    if (!response.ok) {
      throw new Error(`workers_api_error:${response.status}`);
    }

    return new Response(JSON.stringify({ jobId: rootId, source: source.type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[enqueue-pipeline] Error:", error);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
