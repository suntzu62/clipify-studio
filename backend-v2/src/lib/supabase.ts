import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('supabase');

// Cliente com service role (bypass RLS)
export const supabase = createClient(
  env.supabase.url,
  env.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Upload de arquivo para storage
export async function uploadFile(
  bucket: string,
  path: string,
  file: Buffer | string,
  contentType: string
): Promise<string> {
  logger.info({ bucket, path, contentType }, 'Uploading file to storage');

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType,
      upsert: true,
    });

  if (error) {
    logger.error({ error, bucket, path }, 'Failed to upload file');
    throw new Error(`Upload failed: ${error.message}`);
  }

  logger.info({ bucket, path }, 'File uploaded successfully');
  return data.path;
}

// Download de arquivo do storage
export async function downloadFile(
  bucket: string,
  path: string
): Promise<Blob> {
  logger.info({ bucket, path }, 'Downloading file from storage');

  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error) {
    logger.error({ error, bucket, path }, 'Failed to download file');
    throw new Error(`Download failed: ${error.message}`);
  }

  logger.info({ bucket, path, size: data.size }, 'File downloaded successfully');
  return data;
}

// Get public URL
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
