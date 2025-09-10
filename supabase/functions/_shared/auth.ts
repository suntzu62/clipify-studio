import { jwtVerify, createRemoteJWKSet } from "npm:jose";

const jwksUrl = Deno.env.get("CLERK_JWKS_URL");
const issuer = Deno.env.get("CLERK_ISSUER");
// Use remote JWKS so keys are fetched from Clerk correctly.
const JWKS = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;

export async function requireUser(req: Request): Promise<
  | { userId: string; email?: string }
  | { error: string; status: number }
> {
  try {
    // Prefer Authorization: Bearer <token>
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    let token = authHeader?.split(" ")[1];

    // Fallback for SSE/EventSource: ?token=...
    if (!token) {
      try {
        const url = new URL(req.url);
        token = url.searchParams.get("token") || undefined;
      } catch {}
    }

    if (!token) return { error: "missing token", status: 401 };
    if (!JWKS || !issuer) return { error: "auth_not_configured", status: 500 };

    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
      algorithms: ["RS256"],
    });
    return { userId: payload.sub as string, email: (payload as any).email as string | undefined };
  } catch (err: any) {
    return { error: "invalid_token", status: 401 };
  }
}
