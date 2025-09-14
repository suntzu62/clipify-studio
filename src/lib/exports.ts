import { supabaseFunctions } from '@/integrations/supabase/client';
import { getAuthHeader } from './auth-token';

export async function enqueueExport(
  rootId: string,
  clipId: string,
  getToken?: () => Promise<string | null>
): Promise<{ jobId: string }> {
  const headers = await getAuthHeader(getToken);
  const { data, error } = await supabaseFunctions.functions.invoke('enqueue-export', {
    body: { rootId, clipId },
    headers,
  });
  if (error) throw new Error(error.message);
  return data as { jobId: string };
}

