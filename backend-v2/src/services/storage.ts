import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';

const logger = createLogger('storage');

const supabase = env.supabase.url && env.supabase.serviceKey
  ? createClient(env.supabase.url, env.supabase.serviceKey)
  : null;

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase storage is not configured');
  }
  return supabase;
}

interface UploadResult {
  path: string;
  publicUrl: string;
}

/**
 * Faz upload de um arquivo para o Supabase Storage ou armazenamento local
 */
export async function uploadFile(
  bucket: string,
  path: string,
  filePath: string,
  contentType: string
): Promise<UploadResult> {
  // Se Supabase não estiver configurado, usar armazenamento local
  if (!supabase) {
    return uploadToLocalStorage(path, filePath);
  }

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
  const client = requireSupabase();

  try {
    const { data, error } = await client.storage.from(bucket).download(path);

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
  const client = requireSupabase();

  try {
    const { data, error } = await client.storage.from(bucket).list(prefix);

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
  const client = requireSupabase();

  try {
    const { error } = await client.storage.from(bucket).remove([path]);

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
  const client = requireSupabase();

  try {
    const { error } = await client.storage.from(bucket).remove(paths);

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
  if (!supabase) {
    return false;
  }

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

/**
 * Faz upload para armazenamento local quando Supabase não está configurado
 */
async function uploadToLocalStorage(
  path: string,
  sourceFilePath: string
): Promise<UploadResult> {
  logger.info({ path, sourceFilePath }, 'Uploading file to local storage');

  try {
    // Caminho de destino: ./uploads/{path}
    const storagePath = env.localStoragePath || './uploads';
    const destPath = join(storagePath, path);

    // Criar diretórios se não existirem
    await fs.mkdir(dirname(destPath), { recursive: true });

    // Evita duplicar arquivos grandes no disco: move no mesmo filesystem,
    // e so faz copy+unlink se o rename nao for possivel.
    try {
      await fs.rename(sourceFilePath, destPath);
    } catch (moveError: any) {
      if (moveError?.code !== 'EXDEV' && moveError?.code !== 'EPERM') {
        throw moveError;
      }

      await fs.copyFile(sourceFilePath, destPath);
      await fs.unlink(sourceFilePath).catch(() => undefined);
    }

    // URL pública para servir o arquivo
    // O servidor deve ter uma rota para servir arquivos de /clips/*
    const baseUrl = env.baseUrl || `http://localhost:${env.port}`;
    const publicUrl = `${baseUrl}/${path}`;

    logger.info({ path, publicUrl, destPath }, 'File uploaded to local storage successfully');

    return {
      path: destPath,
      publicUrl,
    };
  } catch (error: any) {
    const storagePath = env.localStoragePath || './uploads';
    const destPath = join(storagePath, path);
    await fs.rm(destPath, { force: true }).catch(() => undefined);
    logger.error({ error: error.message, path }, 'Local file upload failed');
    throw new Error(`Local upload failed: ${error.message}`);
  }
}
