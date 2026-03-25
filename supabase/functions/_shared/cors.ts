const DEFAULT_ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";
const FALLBACK_ALLOWED_ORIGINS = [
  "https://clipify-studio.lovable.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(): string[] {
  const configuredOrigins = [
    Deno.env.get("APP_URL"),
    Deno.env.get("SITE_URL"),
    Deno.env.get("FRONTEND_URL"),
    ...(Deno.env.get("EDGE_ALLOWED_ORIGINS") || "").split(","),
  ]
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(configuredOrigins.length > 0 ? configuredOrigins : FALLBACK_ALLOWED_ORIGINS));
}

export function getRequestOrigin(req: Request): string | null {
  return normalizeOrigin(req.headers.get("origin"));
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) {
    return true;
  }

  return getAllowedOrigins().includes(origin);
}

export function buildCorsHeaders(
  req: Request,
  methods: string,
  allowHeaders = DEFAULT_ALLOWED_HEADERS,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": methods,
    Vary: "Origin",
  };

  const origin = getRequestOrigin(req);
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function rejectDisallowedOrigin(req: Request): Response | null {
  const origin = getRequestOrigin(req);
  if (origin && !isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        Vary: "Origin",
      },
    });
  }

  return null;
}

export function handleCorsPreflight(req: Request, methods: string): Response {
  const rejection = rejectDisallowedOrigin(req);
  if (rejection) {
    return rejection;
  }

  return new Response(null, {
    headers: buildCorsHeaders(req, methods),
  });
}
