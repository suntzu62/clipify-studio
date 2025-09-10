import { supabase } from '@/integrations/supabase/client';

export async function invokeFn<T = any>(
  name: string,
  opts: { method?: 'GET' | 'POST'; body?: any; headers?: Record<string, string> } = {}
): Promise<T> {
  const { method = 'POST', body, headers = {} } = opts;
  const { data, error } = await supabase.functions.invoke<T>(name, { method, body, headers });
  if (error) throw new Error(error.message);
  return data as T;
}
