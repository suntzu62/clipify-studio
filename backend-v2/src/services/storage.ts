import { promises as fs } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';

const logger = createLogger('storage');

const supabase = createClient(env.supabase.url, env.supabase.serviceKey);

interface UploadResult {
  path: string;
  publicUrl: string;
}

/**
 * Faz upload de um arquivo para o Supabase Storage
 */
export async function uploadFile(
  bucket: string,
  path: string,
  filePath: string,
  contentType: string
): Promise<UploadResult> {
  logger.info({ bucket, path, filePath, contentType }, 'Uploading file to storage');

  try {
    const fileBuffer = await fs.readFile(filePath);

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

    logger.info({ path, publicUrl: urlData.publicUrl }, 'File uploaded successfully');

    return {
      path: data.path,
      publicUrl: urlData.publicUrl,
    };
  } catch (error: any) {
    logger.error({ error: error.message, bucket, path }, 'File upload failed');
    throw new Error(`Upload failed: ${error.message}`);
  }
}

/**
 * Faz upload de múltiplos arquivos em paralelo
 */
export async function uploadFiles(
  uploads: Array<{
    bucket: string;
    path: string;
    filePath: string;
    contentType: string;
  }>
): Promise<UploadResult[]> {
  logger.info({ count: uploads.length }, 'Uploading multiple files');

  const results = await Promise.all(
    uploads.map((upload) =>
      uploadFile(upload.bucket, upload.path, upload.filePath, upload.contentType)
    )
  );

  logger.info({ count: results.length }, 'Multiple files uploaded successfully');

  return results;
}

/**
 * Faz download de um arquivo do Supabase Storage
 */
export async function downloadFile(bucket: string, path: string): Promise<Blob> {
  logger.info({ bucket, path }, 'Downloading file from storage');

  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error) {
      if (error.message.includes('not found')) {
        throw new Error('VIDEO_NOT_FOUND');
      }
      throw error;
    }

    logger.info({ bucket, path, size: data.size }, 'File downloaded successfully');

    return data;
  } catch (error: any) {
    logger.error({ error: error.message, bucket, path }, 'File download failed');
    throw new Error(`Download failed: ${error.message}`);
  }
}

/**
 * Lista arquivos em um diretório do storage
 */
export async function listFiles(
  bucket: string,
  prefix: string
): Promise<Array<{ name: string; size: number; createdAt: string }>> {
  logger.info({ bucket, prefix }, 'Listing files from storage');

  try {
    const { data, error } = await supabase.storage.from(bucket).list(prefix);

    if (error) {
      throw error;
    }

    const files = (data || []).map((file) => ({
      name: file.name,
      size: file.metadata?.size || 0,
      createdAt: file.created_at || new Date().toISOString(),
    }));

    logger.info({ bucket, prefix, count: files.length }, 'Files listed successfully');

    return files;
  } catch (error: any) {
    logger.error({ error: error.message, bucket, prefix }, 'File listing failed');
    throw new Error(`List failed: ${error.message}`);
  }
}

/**
 * Deleta um arquivo do storage
 */
export async function deleteFile(bucket: string, path: string): Promise<void> {
  logger.info({ bucket, path }, 'Deleting file from storage');

  try {
    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      throw error;
    }

    logger.info({ bucket, path }, 'File deleted successfully');
  } catch (error: any) {
    logger.error({ error: error.message, bucket, path }, 'File deletion failed');
    throw new Error(`Delete failed: ${error.message}`);
  }
}

/**
 * Deleta múltiplos arquivos
 */
export async function deleteFiles(bucket: string, paths: string[]): Promise<void> {
  logger.info({ bucket, count: paths.length }, 'Deleting multiple files');

  try {
    const { error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      throw error;
    }

    logger.info({ bucket, count: paths.length }, 'Files deleted successfully');
  } catch (error: any) {
    logger.error({ error: error.message, bucket, count: paths.length }, 'Files deletion failed');
    throw new Error(`Delete failed: ${error.message}`);
  }
}

/**
 * Verifica se um arquivo existe
 */
export async function fileExists(bucket: string, path: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error) {
      return false;
    }

    return Boolean(data);
  } catch {
    return false;
  }
}
