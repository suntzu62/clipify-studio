import { useAuth } from '@clerk/clerk-react';

export async function getAuthHeader(getToken?: () => Promise<string | null>) {
  const token = getToken ? await getToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

