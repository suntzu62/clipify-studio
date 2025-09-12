import { useAuth } from '@clerk/clerk-react';

// Tries to obtain a Clerk JWT suitable for backend calls.
// If no token is available with default getToken(), it attempts common templates
// (e.g., 'supabase') to support cross-origin requests to Edge Functions.
export async function getAuthHeader(
  getToken?: (options?: any) => Promise<string | null>
) {
  let token: string | null = null;

  if (getToken) {
    try {
      token = await getToken();
    } catch {
      token = null;
    }

    // If no token returned, try common Clerk JWT templates
    if (!token) {
      const templates = ['supabase', 'backend', 'api', 'server'];
      for (const template of templates) {
        try {
          token = await getToken({ template } as any);
          if (token) break;
        } catch {
          // continue trying next template
        }
      }
    }
  }

  return token ? { Authorization: `Bearer ${token}` } : {};
}
