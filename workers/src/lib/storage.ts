import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import { dirname } from 'path';

export const sbAdmin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function downloadToTemp(bucket: string, key: string, tmpPath: string): Promise<void> {
  const supabase = sbAdmin();
  
  // Ensure directory exists
  await fs.mkdir(dirname(tmpPath), { recursive: true });
  
  const { data, error } = await supabase.storage.from(bucket).download(key);
  
  if (error) {
    if (error.message.includes('not found') || error.message.includes('404')) {
      throw { code: 'VIDEO_NOT_FOUND', message: `File not found: ${key}` };
    }
    throw { code: 'STORAGE_ERROR', message: error.message };
  }
  
  if (!data) {
    throw { code: 'VIDEO_NOT_FOUND', message: `No data returned for: ${key}` };
  }
  
  const buffer = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(tmpPath, buffer);
}

export async function uploadFile(
  bucket: string, 
  key: string, 
  filePath: string, 
  contentType?: string
): Promise<void> {
  const supabase = sbAdmin();
  
  const fileBuffer = await fs.readFile(filePath);
  
  const { error } = await supabase.storage
    .from(bucket)
    .upload(key, fileBuffer, {
      contentType,
      upsert: true
    });
  
  if (error) {
    throw { code: 'UPLOAD_ERROR', message: error.message };
  }
}