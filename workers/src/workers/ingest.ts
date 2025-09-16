import { Job, UnrecoverableError } from 'bullmq';
import youtubedl from 'youtube-dl-exec';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import ffmpegPath from 'ffmpeg-static';
import pino from 'pino';

// Configure youtube-dl-exec to use system binary when available
const ytdlBinaryPath = process.env.YTDL_BINARY_PATH || '/usr/bin/yt-dlp';

// Check if system binary exists and configure if available
async function configureYtdl() {
  try {
    if (process.env.YTDL_BINARY_PATH) {
      return youtubedl.create(ytdlBinaryPath);
    }
    await fs.access(ytdlBinaryPath);
    return youtubedl.create(ytdlBinaryPath);
  } catch {
    return youtubedl; // Use default binary
  }
}

const log = pino({ name: 'ingest' });

interface IngestResult {
  rootId: string;
  bucket: string;
  sourceKey: string;
  infoKey: string;
  durationSec: number;
  title: string;
  url: string;
}

interface VideoInfo {
  duration: number;
  title: string;
  webpage_url: string;
  [key: string]: any;
}

export async function runIngest(job: Job): Promise<IngestResult> {
  const { youtubeUrl } = job.data;
  const rootId = job.data.rootId || job.id!;
  const jobId = job.id!;
  
  log.info({ jobId, rootId, youtubeUrl }, 'Ingest started');
  
  // Create temp directory
  const tempDir = path.join(os.tmpdir(), `cortai-${jobId}`);
  await fs.mkdir(tempDir, { recursive: true });
  
  try {
    // Step 1: Probe video info
    log.info({ jobId }, 'ProbeStarted');
    const info = await probeVideo(youtubeUrl);
    
    if (info.duration < 600) {
      throw new UnrecoverableError('VIDEO_TOO_SHORT: Video must be at least 10 minutes long');
    }
    
    log.info({ jobId, duration: info.duration, title: info.title }, 'ProbeOk');
    
    // Step 2: Download with progress (0-85%)
    log.info({ jobId }, 'DownloadStarted');
    const { videoPath, infoPath } = await downloadVideo(youtubeUrl, tempDir, jobId, job);
    log.info({ jobId }, 'DownloadOk');
    
    // Step 3: Upload to Supabase Storage (85-100%)
    log.info({ jobId }, 'UploadStarted');
    const result = await uploadToStorage(videoPath, infoPath, rootId, job, info);
    log.info({ jobId }, 'UploadOk');
    
    await job.updateProgress(100);
    
    return result;
    
  } catch (error: any) {
    log.error({ jobId, error: error.message, code: error.code }, 'Ingest failed');
    
    // Map common error codes
    if (error.code === 'VIDEO_TOO_SHORT' || String(error?.message || '').startsWith('VIDEO_TOO_SHORT')) {
      throw new UnrecoverableError('VIDEO_TOO_SHORT');
    }
    
    // Handle yt-dlp specific errors
    if (error.message?.includes('Sign in to confirm your age')) {
      throw { code: 'AGE_RESTRICTED', message: 'Video is age-restricted' };
    }
    
    if (error.message?.includes('Private video')) {
      throw { code: 'PRIVATE_VIDEO', message: 'Video is private' };
    }
    
    if (error.message?.includes('quota')) {
      throw { code: 'QUOTA_EXCEEDED', message: 'YouTube quota exceeded' };
    }
    
    throw { code: 'DOWNLOAD_FAILED', message: error.message || 'Failed to download video' };
    
  } finally {
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      log.info({ jobId }, 'Cleanup completed');
    } catch (cleanupError) {
      log.warn({ jobId, error: cleanupError }, 'Cleanup failed');
    }
  }
}

async function probeVideo(url: string): Promise<VideoInfo> {
  try {
    const ytdl = await configureYtdl();
    const info = await ytdl(url, {
      dumpSingleJson: true,
      skipDownload: true,
      noPlaylist: true,
    });
    
    return info as VideoInfo;
  } catch (error: any) {
    throw new Error(`Failed to probe video: ${error.message}`);
  }
}

async function downloadVideo(
  url: string, 
  tempDir: string, 
  jobId: string, 
  job: Job
): Promise<{ videoPath: string; infoPath: string }> {
  const outputTemplate = path.join(tempDir, 'source.%(ext)s');
  const cookiesPath = process.env.YTDLP_COOKIES_PATH;
  
  const options: any = {
    output: outputTemplate,
    format: 'best[height<=1080]',
    mergeOutputFormat: 'mp4',
    remuxVideo: 'mp4',
    writeInfoJson: true,
    noPlaylist: true,
    // Robustness: resume and avoid overwrites
    continue: true,
    noOverwrites: true,
    retries: 4,
    fragmentRetries: 'infinite',
    retrySleep: 'fragment:exp=1:20',
    limitRate: '5M',
    newline: true,
    progressTemplate: 'download:%(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s',
  };
  
  if (cookiesPath && await fs.access(cookiesPath).then(() => true).catch(() => false)) {
    options.cookies = cookiesPath;
  }
  
  // Set custom ffmpeg path if available
  if (ffmpegPath) {
    options.ffmpegLocation = ffmpegPath;
  }
  
  return new Promise(async (resolve, reject) => {
    const ytdl = await configureYtdl();
    const process = ytdl.exec(url, options);
    
    let lastProgress = 0;
    
    process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('download:')) {
          const parts = line.split('|');
          if (parts.length >= 3) {
            const percentStr = parts[0].replace('download:', '').trim();
            const percent = parseFloat(percentStr.replace('%', ''));
            
            if (!isNaN(percent) && percent > lastProgress) {
              // Map 0-100% download to 0-85% job progress
              const jobProgress = Math.floor((percent / 100) * 85);
              job.updateProgress(jobProgress);
              lastProgress = percent;
            }
          }
        }
      }
    });
    
    process.on('close', async (code) => {
      if (code === 0) {
        try {
          // Find the downloaded files
          const files = await fs.readdir(tempDir);
          const videoFile = files.find(f => f.endsWith('.mp4'));
          const infoFile = files.find(f => f.endsWith('.info.json'));
          
          if (!videoFile || !infoFile) {
            reject(new Error('Downloaded files not found'));
            return;
          }
          
          const videoPath = path.join(tempDir, videoFile);
          const infoPath = path.join(tempDir, infoFile);
          
          // Verify video file exists and has content
          const stats = await fs.stat(videoPath);
          if (stats.size === 0) {
            reject(new Error('Downloaded video file is empty'));
            return;
          }
          
          resolve({ videoPath, infoPath });
        } catch (error) {
          reject(error);
        }
      } else {
        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });
    
    process.on('error', (error) => {
      reject(error);
    });
  });
}

async function uploadToStorage(
  videoPath: string,
  infoPath: string,
  rootId: string,
  job: Job,
  info: VideoInfo
): Promise<IngestResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase configuration');
  }
  
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  // Update progress to 85% (start of upload)
  await job.updateProgress(85);
  
  const sourceKey = `projects/${rootId}/source.mp4`;
  const infoKey = `projects/${rootId}/info.json`;
  
  try {
    // Upload video file
    const videoBuffer = await fs.readFile(videoPath);
    const { error: videoError } = await supabase.storage
      .from(bucket)
      .upload(sourceKey, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true
      });
    
    if (videoError) {
      throw new Error(`Failed to upload video: ${videoError.message}`);
    }
    
    await job.updateProgress(95);
    
    // Upload info file
    const infoBuffer = await fs.readFile(infoPath);
    const { error: infoError } = await supabase.storage
      .from(bucket)
      .upload(infoKey, infoBuffer, {
        contentType: 'application/json',
        upsert: true
      });
    
    if (infoError) {
      throw new Error(`Failed to upload info: ${infoError.message}`);
    }
    
    return {
      rootId,
      bucket,
      sourceKey,
      infoKey,
      durationSec: Math.floor(info.duration),
      title: info.title,
      url: info.webpage_url
    };
    
  } catch (error: any) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}
