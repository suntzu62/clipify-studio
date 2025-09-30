import { Job, UnrecoverableError } from 'bullmq';
import youtubedl from 'youtube-dl-exec';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createWriteStream, constants as fsConstants } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import pino from 'pino';
import { enqueueUnique } from '../lib/bullmq';
import { QUEUES } from '../queues';
import { runFFmpeg } from '../lib/ffmpeg';
import type { VideoInfo } from '../types/pipeline';
import { execFile } from 'child_process';

const log = pino({ name: 'ingest' });

interface Upload {
  bucket: string;
  objectKey: string;
  originalName?: string;
}

interface StorageResult {
  rootId: string;
  storagePaths: {
    video: string;
    audio: string;
    info: string;
  };
  duration: number;
  title: string;
  url: string;
}

async function validateVideoFile(videoPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(videoPath);
    if (stats.size < 1024) {
      log.warn({ videoPath, size: stats.size }, 'Video file too small');
      return false;
    }

    return new Promise((resolve) => {
      ffmpeg(videoPath)
        .ffprobe((err, data) => {
          if (err) {
            log.warn({ videoPath, error: err.message }, 'Failed to probe video file');
            resolve(false);
            return;
          }

          const videoStream = data.streams.find(s => s.codec_type === 'video');
          if (!videoStream) {
            log.warn({ videoPath }, 'No video stream found');
            resolve(false);
            return;
          }

          resolve(true);
        });
    });
  } catch (error) {
    log.warn({ videoPath, error: (error as Error)?.message }, 'Error validating video file');
    return false;
  }
}

async function ensureRootId(rootId: string | undefined): Promise<string> {
  if (!rootId) {
    return `ingest-${Date.now()}`;
  }
  return rootId;
}

async function ensureYtdlp(): Promise<string> {
  // Primeiro tentar usar o yt-dlp do sistema
  try {
    // Tentar usar o binário do PATH primeiro
    await new Promise((resolve, reject) => {
      execFile('yt-dlp', ['--version'], (error) => {
        if (error) reject(error);
        else resolve(null);
      });
    });
    log.info('Found yt-dlp in PATH');
    return 'yt-dlp';
  } catch (error) {
    log.warn({ error: (error as Error)?.message }, 'yt-dlp not found in PATH');
  }

  // Tentar o caminho configurado
  try {
    const ytdlpPath = process.env.YTDL_BINARY || '/usr/local/bin/yt-dlp';
    await fs.access(ytdlpPath, fsConstants.X_OK);
    log.info({ ytdlpPath }, 'Found configured yt-dlp');
    return ytdlpPath;
  } catch (error) {
    log.error({ error: (error as Error)?.message }, 'No working yt-dlp found');
    throw new Error('yt-dlp not found. Please install it first.');
  }
}

async function downloadYoutubeVideo(url: string, outputDir: string): Promise<string> {
  const videoPath = path.join(outputDir, 'video.mp4');
  
  try {
    const ytdlpPath = await ensureYtdlp();
    log.info({ ytdlpPath, url }, 'Starting YouTube download');

    // Primeiro pegar info do vídeo
    const ytdl = youtubedl.create(ytdlpPath);
    await ytdl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true
    });

    // Depois baixar o vídeo
    await ytdl(url, {
      output: videoPath,
      format: 'mp4',
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true
    });
    
    return videoPath;
  } catch (error: any) {
    throw new UnrecoverableError(`Failed to download YouTube video: ${error?.message || 'Unknown error'}`);
  }
}

async function processVideoFile(videoPath: string, jobId: string, rootId: string): Promise<StorageResult> {
  log.info({ jobId, videoPath, rootId }, 'Starting video file processing');
  
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath).ffprobe((err, metadata) => {
      if (err) {
        log.error({ jobId, videoPath, error: err.message }, 'Failed to probe video file');
        reject(new Error(`Failed to analyze video: ${err.message}`));
        return;
      }
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        log.error({ jobId, videoPath }, 'No video stream found in file');
        reject(new Error('Invalid video file: no video stream found'));
        return;
      }

      log.info({ jobId, metadata: metadata.format }, 'Video metadata extracted');

      const info = {
        duration: metadata.format.duration || 0,
        width: videoStream.width || 1920,
        height: videoStream.height || 1080,
        fps: eval(videoStream.r_frame_rate || '30/1'),
        title: path.basename(videoPath, path.extname(videoPath))
      };

      resolve({
        rootId,
        storagePaths: {
          video: videoPath,
          audio: videoPath, // assumindo que é o mesmo path por enquanto
          info: JSON.stringify(info)
        },
        duration: info.duration || 0,
        title: info.title || path.basename(videoPath, path.extname(videoPath)),
        url: videoPath // usando o path local como url por enquanto
      });
    });
  });
}

export async function runIngest(job: Job): Promise<StorageResult> {
  const { filePath, url, rootId: inputRootId } = job.data;
  const jobId = job.id || 'unknown';
  const rootId = await ensureRootId(inputRootId);

  log.info({ jobId, filePath, url, rootId }, 'Starting ingest process');

  // Validação melhorada de entrada
  if (!filePath && !url) {
    log.error({ jobId }, 'Missing required input: filePath or url');
    throw new UnrecoverableError('INVALID_INPUT: filePath or url is required');
  }

  // Se for URL do YouTube, vamos baixar o vídeo primeiro
  if (url && url.includes('youtube.com')) {
    log.info({ jobId, url }, 'Detected YouTube URL, starting download');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cortai-'));
    try {
      const videoPath = await downloadYoutubeVideo(url, tempDir);
      log.info({ jobId, videoPath }, 'YouTube video downloaded successfully');
      
      if (!await validateVideoFile(videoPath)) {
        throw new UnrecoverableError('INVALID_VIDEO: The downloaded video file is invalid or corrupt');
      }
      
      return await processVideoFile(videoPath, jobId, rootId);
    } catch (error) {
      log.error({ jobId, error: (error as Error)?.message }, 'Failed to process YouTube video');
      throw new UnrecoverableError(`YOUTUBE_PROCESSING_FAILED: ${(error as Error)?.message}`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch((e) => 
        log.warn({ jobId, error: e?.message }, 'Failed to cleanup temp directory')
      );
    }
  }

  // Se chegou aqui, é porque temos um filePath
  if (!await validateVideoFile(filePath!)) {
    throw new UnrecoverableError('INVALID_VIDEO: The provided video file is invalid or corrupt');
  }

  return await processVideoFile(filePath!, jobId, rootId);
}

export default runIngest;
