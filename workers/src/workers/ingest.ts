import { Job, UnrecoverableError } from 'bullmq';
import youtubedl from 'youtube-dl-exec';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createWriteStream, constants as fsConstants } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import ffmpegPath from 'ffmpeg-static';
import pino from 'pino';
import { enqueueUnique } from '../lib/bullmq';
import { QUEUES } from '../queues';
import { runFFmpeg } from '../lib/ffmpeg';

// Configure youtube-dl-exec to use system binary when available
const ytdlBinaryPath = process.env.YTDL_BINARY_PATH || '/usr/bin/yt-dlp';

if (ffmpegPath && !process.env.FFMPEG_PATH) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

const DIRECT_DOWNLOAD_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

// Check if system binary exists and configure if available
async function ensureBundledBinary(): Promise<string> {
  const constants = (youtubedl as any)?.constants;
  if (!constants) {
    throw new Error('youtube-dl-exec constants unavailable');
  }

  const {
    YOUTUBE_DL_PATH,
    YOUTUBE_DL_DIR,
    YOUTUBE_DL_FILE,
    YOUTUBE_DL_HOST,
  } = constants as {
    YOUTUBE_DL_PATH: string;
    YOUTUBE_DL_DIR: string;
    YOUTUBE_DL_FILE: string;
    YOUTUBE_DL_HOST: string;
  };

  try {
    await fs.access(YOUTUBE_DL_PATH, fsConstants.X_OK);
    return YOUTUBE_DL_PATH;
  } catch {}

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const baseHeaders: Record<string, string> = {
    'User-Agent': 'cortai-workers/1.0 (+https://cortai.example)',
  };
  if (token) {
    baseHeaders.Authorization = `Bearer ${token}`;
  }

  const downloadDirect = async () => {
    const response = await fetch(DIRECT_DOWNLOAD_URL, {
      headers: { ...baseHeaders, Accept: 'application/octet-stream' },
    });
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Direct download failed: ${response.status} ${response.statusText} ${detail}`,
      );
    }
    return response.body;
  };

  const downloadFromRelease = async () => {
    const response = await fetch(YOUTUBE_DL_HOST, {
      headers: {
        ...baseHeaders,
        Accept: 'application/vnd.github+json',
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Failed to query GitHub release metadata: ${response.status} ${detail}`,
      );
    }

    const payload = await response.json();
    const asset = payload?.assets?.find(
      (item: any) => item?.name === YOUTUBE_DL_FILE,
    );
    if (!asset?.browser_download_url) {
      const detail = payload?.message || 'asset not found';
      throw new Error(
        `yt-dlp binary asset not found in GitHub release payload: ${detail}`,
      );
    }

    const binaryResponse = await fetch(asset.browser_download_url, {
      headers: { ...baseHeaders, Accept: 'application/octet-stream' },
    });
    if (!binaryResponse.ok || !binaryResponse.body) {
      const detail = await binaryResponse.text().catch(() => '');
      throw new Error(
        `Failed to download yt-dlp binary: ${binaryResponse.status} ${binaryResponse.statusText} ${detail}`,
      );
    }

    return binaryResponse.body;
  };

  const body = await downloadDirect().catch((directError) => {
    console.warn(
      'Direct yt-dlp download failed, falling back to GitHub API',
      directError,
    );
    return downloadFromRelease();
  });
  if (!body) {
    throw new Error('Unable to download yt-dlp binary (empty body)');
  }

  await fs.mkdir(YOUTUBE_DL_DIR, { recursive: true });
  const nodeStream = Readable.fromWeb(body as any);
  await pipeline(nodeStream, createWriteStream(YOUTUBE_DL_PATH));
  await fs.chmod(YOUTUBE_DL_PATH, 0o755);

  return YOUTUBE_DL_PATH;
}

async function configureYtdl() {
  try {
    if (process.env.YTDL_BINARY_PATH) {
      await fs.access(ytdlBinaryPath, fsConstants.X_OK);
      return youtubedl.create(ytdlBinaryPath);
    }
  } catch (error) {
    log.warn({ error: (error as Error)?.message }, 'Configured YTDL binary missing, falling back');
  }

  try {
    await fs.access(ytdlBinaryPath, fsConstants.X_OK);
    return youtubedl.create(ytdlBinaryPath);
  } catch {}

  try {
    const bundledPath = await ensureBundledBinary();
    return youtubedl.create(bundledPath);
  } catch (error) {
    log.error({ error: (error as Error)?.message }, 'Failed to prepare bundled yt-dlp');
    return youtubedl; // Final fallback uses package defaults
  }
}

const log = pino({ name: 'ingest' });

interface IngestResult {
  rootId: string;
  bucket: string;
  sourceKey: string;
  infoKey: string;
  audioKey: string;
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
  const { youtubeUrl, storagePath, source = 'youtube', fileName } = job.data;
  const rootId = job.data.rootId || job.id!;
  const jobId = job.id!;
  
  log.info({ jobId, rootId, youtubeUrl, storagePath, source }, 'Ingest started');
  
  // Route based on source type
  if (source === 'upload' && storagePath) {
    return await processUploadedVideo(job, storagePath, fileName || 'video');
  }
  
  // Create temp directory
  const tempDir = path.join(os.tmpdir(), `cortai-${jobId}`);
  await fs.mkdir(tempDir, { recursive: true });
  
  try {
    // Steps 1-2: Parallel probe and download preparation
    log.info({ jobId }, 'ProbeStarted');
    
    // Start probe and download setup in parallel
    const [info] = await Promise.all([
      probeVideo(youtubeUrl)
    ]);
    
    if (info.duration < 600) {
      throw new UnrecoverableError('VIDEO_TOO_SHORT: Video must be at least 10 minutes long');
    }
    
    log.info({ jobId, duration: info.duration, title: info.title }, 'ProbeOk');
    
    // Step 2: Download with progress (0-85%)
    log.info({ jobId }, 'DownloadStarted');
    const { videoPath, infoPath } = await downloadVideo(youtubeUrl, tempDir, jobId, job);
    log.info({ jobId }, 'DownloadOk');

    // Step 3: Extract normalized audio for downstream stages (85-90%)
    log.info({ jobId }, 'AudioExtractStarted');
    const audioPath = await extractAudio(videoPath, tempDir, info.duration, job);
    log.info({ jobId }, 'AudioExtractOk');

    // Step 4: Upload to Supabase Storage (90-100%)
    log.info({ jobId }, 'UploadStarted');
    const result = await uploadToStorage(videoPath, audioPath, infoPath, rootId, job, info);
    log.info({ jobId }, 'UploadOk');
    
    await job.updateProgress(100);

    await enqueueUnique(
      QUEUES.TRANSCRIBE,
      'transcribe',
      `${rootId}:transcribe`,
      { rootId, meta: job.data.meta || {} }
    );

    return result;
    
  } catch (error: any) {
    const detail = {
      message: error?.message,
      code: error?.code,
      stderr: error?.stderr,
      stdout: error?.stdout,
      stack: error?.stack,
    };
    log.error({ jobId, rootId, youtubeUrl, detail }, 'Ingest failed');
    
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
    const detail = [error?.message, error?.stderr, error?.stdout]
      .filter((part) => typeof part === 'string' && part.trim().length > 0)
      .join(' | ');
    throw new Error(`Failed to probe video: ${detail || String(error)}`);
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
    limitRate: '15M', // Increased from 5M for faster downloads
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
  audioPath: string,
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
  
  // Update progress to 90% (start of upload)
  await job.updateProgress(90);

  const sourceKey = `projects/${rootId}/source.mp4`;
  const infoKey = `projects/${rootId}/info.json`;
  const audioKey = `projects/${rootId}/media/audio.wav`;

  try {
    const [videoBuffer, audioBuffer, infoBuffer] = await Promise.all([
      fs.readFile(videoPath),
      fs.readFile(audioPath),
      fs.readFile(infoPath),
    ]);

    const [videoUpload, audioUpload, infoUpload] = await Promise.all([
      supabase.storage
        .from(bucket)
        .upload(sourceKey, videoBuffer, {
          contentType: 'video/mp4',
          upsert: true,
        }),
      supabase.storage
        .from(bucket)
        .upload(audioKey, audioBuffer, {
          contentType: 'audio/wav',
          upsert: true,
        }),
      supabase.storage
        .from(bucket)
        .upload(infoKey, infoBuffer, {
          contentType: 'application/json',
          upsert: true,
        }),
    ]);

    if (videoUpload.error) {
      throw new Error(`Failed to upload video: ${videoUpload.error.message}`);
    }

    if (audioUpload.error) {
      throw new Error(`Failed to upload audio: ${audioUpload.error.message}`);
    }

    if (infoUpload.error) {
      throw new Error(`Failed to upload info: ${infoUpload.error.message}`);
    }

    await job.updateProgress(98);

    return {
      rootId,
      bucket,
      sourceKey,
      infoKey,
      audioKey,
      durationSec: Math.floor(info.duration),
      title: info.title,
      url: info.webpage_url
    };
    
  } catch (error: any) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}

async function extractAudio(
  videoPath: string,
  tempDir: string,
  durationSec: number,
  job: Job
): Promise<string> {
  const audioPath = path.join(tempDir, 'source.wav');

  const durationMs = Math.max(1, Math.floor(durationSec * 1000));

  await runFFmpeg(
    [
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      audioPath,
    ],
    (progress) => {
      const scaled = 85 + Math.floor((progress / 100) * 5);
      job.updateProgress(Math.min(90, scaled));
    },
    durationMs
  );

  await job.updateProgress(90);

  return audioPath;
}

// Process uploaded video files (alternative to YouTube download)
async function processUploadedVideo(
  job: Job,
  storagePath: string,
  fileName: string
): Promise<IngestResult> {
  const rootId = job.data.rootId || job.id!;
  const jobId = job.id!;
  const tempDir = path.join(os.tmpdir(), `cortai-${jobId}`);
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    log.info({ jobId, storagePath }, 'Processing uploaded video');
    
    // Step 1: Download from storage (0-30%)
    const videoPath = path.join(tempDir, 'source.mp4');
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration');
    }
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    const { data: videoData, error: downloadError } = await supabase.storage
      .from('raw')
      .download(storagePath);
    
    if (downloadError || !videoData) {
      throw new Error(`Failed to download uploaded video: ${downloadError?.message}`);
    }
    
    await fs.writeFile(videoPath, Buffer.from(await videoData.arrayBuffer()));
    await job.updateProgress(30);
    
    log.info({ jobId }, 'Video downloaded from storage');
    
    // Step 2: Probe video with ffprobe (30-40%)
    const probeResult = await new Promise<any>((resolve, reject) => {
      const ffprobe = require('fluent-ffmpeg');
      ffprobe.ffprobe(videoPath, (err: any, metadata: any) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
    
    const durationSec = probeResult.format?.duration || 0;
    const title = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
    
    if (durationSec < 600) {
      throw new UnrecoverableError('VIDEO_TOO_SHORT: Video must be at least 10 minutes long');
    }
    
    await job.updateProgress(40);
    log.info({ jobId, duration: durationSec, title }, 'Video probed');
    
    // Step 3: Extract audio (40-70%)
    log.info({ jobId }, 'AudioExtractStarted');
    const audioPath = await extractAudioForUpload(videoPath, tempDir, durationSec, job, 40, 70);
    log.info({ jobId }, 'AudioExtractOk');
    
    // Step 4: Create synthetic info.json (70-75%)
    const infoPath = path.join(tempDir, 'info.json');
    const info = {
      duration: durationSec,
      title,
      webpage_url: `upload://${fileName}`,
      uploader: 'Direct Upload',
      upload_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
    };
    await fs.writeFile(infoPath, JSON.stringify(info, null, 2));
    await job.updateProgress(75);
    
    // Step 5: Upload to storage (75-100%)
    log.info({ jobId }, 'UploadStarted');
    const result = await uploadToStorage(videoPath, audioPath, infoPath, rootId, job, info as VideoInfo);
    log.info({ jobId }, 'UploadOk');
    
    await job.updateProgress(100);
    
    // Enqueue transcription
    await enqueueUnique(
      QUEUES.TRANSCRIBE,
      'transcribe',
      `${rootId}:transcribe`,
      { rootId, meta: job.data.meta || {} }
    );
    
    return result;
    
  } catch (error: any) {
    log.error({ jobId, storagePath, error: error.message }, 'Upload processing failed');
    
    if (error.code === 'VIDEO_TOO_SHORT' || String(error?.message || '').startsWith('VIDEO_TOO_SHORT')) {
      throw new UnrecoverableError('VIDEO_TOO_SHORT');
    }
    
    throw { code: 'UPLOAD_PROCESSING_FAILED', message: error.message };
    
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      log.info({ jobId }, 'Cleanup completed');
    } catch (cleanupError) {
      log.warn({ jobId, error: cleanupError }, 'Cleanup failed');
    }
  }
}

// Specialized audio extraction with custom progress range
async function extractAudioForUpload(
  videoPath: string,
  tempDir: string,
  durationSec: number,
  job: Job,
  startProgress: number,
  endProgress: number
): Promise<string> {
  const audioPath = path.join(tempDir, 'source.wav');
  const durationMs = Math.max(1, Math.floor(durationSec * 1000));

  await runFFmpeg(
    [
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      audioPath,
    ],
    (progress) => {
      const scaled = startProgress + Math.floor((progress / 100) * (endProgress - startProgress));
      job.updateProgress(Math.min(endProgress, scaled));
    },
    durationMs
  );

  await job.updateProgress(endProgress);
  return audioPath;
}
