import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{6,120}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

export function isSafeIdentifier(value: string): boolean {
  return SAFE_IDENTIFIER_PATTERN.test(value);
}

export function normalizeStoragePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

export function isUserOwnedUploadPath(userId: string, storagePath: string): boolean {
  const normalized = normalizeStoragePath(storagePath);
  return normalized.startsWith(`uploads/${userId}/`);
}

export function sanitizeStorageFilename(fileName: string): string {
  const baseName = fileName
    .split(/[\\/]/)
    .pop()
    ?.normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return baseName && baseName.length > 0 ? baseName.slice(0, 120) : "upload.mp4";
}

export function normalizeYoutubeUrl(raw: string): string {
  const trimmed = raw.trim();

  try {
    const parsed = new URL(trimmed);
    const videoId = parsed.hostname === "youtu.be"
      ? parsed.pathname.replace(/^\/+/, "").split("/")[0]
      : parsed.searchParams.get("v");

    if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
  } catch {}

  const idMatch = trimmed.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/);
  if (idMatch?.[1]) {
    return `https://www.youtube.com/watch?v=${idMatch[1]}`;
  }

  return trimmed;
}

export function isValidYouTubeUrl(raw: string): boolean {
  try {
    const parsed = new URL(normalizeYoutubeUrl(raw));
    if (!YOUTUBE_HOSTS.has(parsed.hostname)) {
      return false;
    }

    const videoId = parsed.hostname === "youtu.be"
      ? parsed.pathname.replace(/^\/+/, "").split("/")[0]
      : parsed.searchParams.get("v");

    return Boolean(videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId));
  } catch {
    return false;
  }
}

function createServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    throw new Error("supabase_not_configured");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function userOwnsJob(userId: string, jobId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`job_lookup_failed:${error.message}`);
  }

  return Boolean(data);
}
