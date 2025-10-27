// Helper to get auth header for backend calls with Supabase JWT
export async function getAuthHeader(
  getToken?: () => Promise<string | null>
) {
  let token: string | null = null;

  if (getToken) {
    try {
      token = await getToken();
    } catch {
      token = null;
    }
  }

  return token ? { Authorization: `Bearer ${token}` } : {};
}
