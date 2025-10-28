import { jwtVerify } from "npm:jose";

const supabaseJwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");

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
    if (!supabaseJwtSecret) return { error: "auth_not_configured", status: 500 };

    // Verify Supabase JWT (uses HS256 algorithm)
    const secretKey = new TextEncoder().encode(supabaseJwtSecret);
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });
    
    return { 
      userId: payload.sub as string, 
      email: (payload as any).email as string | undefined 
    };
  } catch (err: any) {
    return { error: "invalid_token", status: 401 };
  }
}
