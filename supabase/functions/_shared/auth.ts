import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "npm:jose";

const supabaseJwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
const clerkIssuer = Deno.env.get("CLERK_ISSUER");
const clerkJwksUrl = Deno.env.get("CLERK_JWKS_URL");
const clerkJwks = clerkJwksUrl ? createRemoteJWKSet(new URL(clerkJwksUrl)) : null;

function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  let token = authHeader?.split(" ")[1];

  if (!token) {
    try {
      const url = new URL(req.url);
      token = url.searchParams.get("token") || undefined;
    } catch {}
  }

  return token;
}

async function verifyClerkToken(token: string): Promise<{ userId: string; email?: string }> {
  if (!clerkJwks) {
    throw new Error("clerk_not_configured");
  }

  const header = decodeProtectedHeader(token);
  if (header.alg === "HS256") {
    throw new Error("not_a_clerk_token");
  }

  const { payload } = await jwtVerify(token, clerkJwks, {
    issuer: clerkIssuer || undefined,
  });

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("invalid_clerk_subject");
  }

  return {
    userId: payload.sub,
    email:
      typeof (payload as { email?: unknown }).email === "string"
        ? ((payload as { email?: string }).email)
        : undefined,
  };
}

async function verifySupabaseToken(token: string): Promise<{ userId: string; email?: string }> {
  if (!supabaseJwtSecret) {
    throw new Error("supabase_auth_not_configured");
  }

  const secretKey = new TextEncoder().encode(supabaseJwtSecret);
  const { payload } = await jwtVerify(token, secretKey, {
    algorithms: ["HS256"],
  });

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("invalid_supabase_subject");
  }

  return {
    userId: payload.sub,
    email: typeof (payload as any).email === "string" ? (payload as any).email : undefined,
  };
}

export async function requireUser(req: Request): Promise<
  | { userId: string; email?: string }
  | { error: string; status: number }
> {
  try {
    const token = extractBearerToken(req);
    if (!token) return { error: "missing token", status: 401 };

    if (clerkJwks) {
      try {
        return await verifyClerkToken(token);
      } catch {}
    }

    if (supabaseJwtSecret) {
      try {
        return await verifySupabaseToken(token);
      } catch {}
    }

    if (!clerkJwks && !supabaseJwtSecret) {
      return { error: "auth_not_configured", status: 500 };
    }

    return { error: "invalid_token", status: 401 };
  } catch (err: any) {
    return { error: "invalid_token", status: 401 };
  }
}
