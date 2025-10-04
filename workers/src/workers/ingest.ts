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
import { track } from '../lib/analytics';
import type { VideoInfo } from '../types/pipeline';

interface Upload {
  bucket: string;
  objectKey: string;
  originalName?: string;
}

async function prepareUploadedVideo(
  upload: Upload,
  tempDir: string,
  supabase: SupabaseClient,
  logger: pino.Logger
): Promise<{ videoPath: string; infoPath: string; info: VideoInfo }> {
  // Validate inputs
  if (!upload.bucket || !upload.objectKey) {
    throw new UnrecoverableError('Invalid upload: missing bucket or objectKey');
  }

  logger.info({ upload }, 'Downloading uploaded file from storage');

  // Download the file from Supabase storage
  const { data, error } = await supabase
    .storage
    .from(upload.bucket)
    .download(upload.objectKey);

  if (error || !data) {
    throw new UnrecoverableError(`Failed to download file: ${error?.message || 'Unknown error'}`);
  }

  // Get file extension from objectKey or assume mp4
  const ext = path.extname(upload.objectKey) || '.mp4';
  const videoPath = path.join(tempDir, `source${ext}`);

  // Save the file locally
  const buffer = await data.arrayBuffer();
  await fs.writeFile(videoPath, Buffer.from(buffer));

  // Get video metadata using ffprobe
  const metadata = await new Promise<any>((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata);
    });
  });

  const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
  const info: VideoInfo = {
    title: upload.originalName || path.basename(upload.objectKey),
    duration: parseFloat(metadata.format.duration || '0'),
    width: videoStream?.width,
    height: videoStream?.height,
    webpage_url: `upload://${upload.bucket}/${upload.objectKey}`,
    ext,
    _filename: videoPath
  };

  // Save info to JSON file
  const infoPath = path.join(tempDir, 'source.info.json');
  await fs.writeFile(infoPath, JSON.stringify(info, null, 2));

  return { videoPath, infoPath, info };
}

// Configure youtube-dl-exec defaults and fallbacks
const ytdlBinaryPath = process.env.YTDL_BINARY_PATH || '/usr/bin/yt-dlp';
const DEFAULT_FORMAT = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

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

interface ProcessedFile {
  path: string;
  duration: number;
  title: string;
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

// Use same interface for both storage and ingest results
type IngestResult = StorageResult;

interface SourceFiles {
  videoPath: string;
  infoPath: string;
  info: VideoInfo;
  audioPath: string;
  duration: number;
  title: string;
}

interface StorageUploadResult {
  error: Error | null;
  data: {
    path: string;
  } | null;
}

interface StoragePublicUrlResult {
  data: {
    publicUrl: string;
  } | null;
}

// Legacy function - deprecated, use downloadVideo instead
async function downloadYoutubeVideo(url: string, tempDir: string): Promise<string> {
  const videoPath = path.join(tempDir, 'video.mp4');
  
  try {
    // Primeiro obter informações do vídeo
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true
    });

    // Depois baixar o vídeo
    await youtubedl(url, {
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

async function processVideoFile(videoPath: string, jobId: string, rootId: string): Promise<IngestResult> {
  if (!rootId) {
    throw new Error('rootId is required');
  }
  // Extrai informações do vídeo
  const info: VideoInfo = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) return reject(new Error('No video stream found'));
      
      const videoFileName = path.basename(videoPath);
      const info: VideoInfo = {
        duration: typeof metadata.format.duration === 'string' ? parseFloat(metadata.format.duration) : (metadata.format.duration || 0),
        title: path.basename(videoFileName, path.extname(videoFileName)) || 'Untitled',
        width: videoStream.width || 1920,
        height: videoStream.height || 1080,
        fps: typeof videoStream.r_frame_rate === 'string' ? eval(videoStream.r_frame_rate) : 30,
        dimensions: {
          width: videoStream.width || 1920,
          height: videoStream.height || 1080
        },
        webpage_url: `file://${videoPath}`,
        ext: path.extname(videoFileName).substring(1) || 'mp4'
      };
      resolve(info);
    });
  });

  return {
    rootId,
    storagePaths: {
      video: videoPath,
      audio: videoPath.replace('.mp4', '.wav'),
      info: videoPath.replace('.mp4', '.info.json')
    },
    duration: info.duration,
    title: info.title,
    url: `file://${videoPath}`
  };
}

async function ensureRootId(rootId: string | undefined): Promise<string> {
  if (!rootId) {
    return `ingest-${Date.now()}`;
  }
  return rootId;
}

// Helper to determine job source
function determineSource(job: Job): 'youtube' | 'upload' {
  if (job.data.source) return job.data.source;
  if (job.data.youtubeUrl) return 'youtube';
  if (job.data.storagePath) return 'upload';
  
  // Legacy support
  if (job.data.url && job.data.url.includes('youtube')) return 'youtube';
  if (job.data.filePath) return 'upload';
  
  throw new UnrecoverableError('INVALID_INPUT: Cannot determine job source');
}

// Process YouTube video with comprehensive tracking
async function processYoutubeVideo(job: Job, youtubeUrl: string): Promise<IngestResult> {
  const rootId = job.data.rootId || job.id!;
  const jobId = job.id!;
  const userId = job.data.userId || 'unknown';
  const tempDir = path.join(os.tmpdir(), `cortai-yt-${jobId}`);
  const startTime = Date.now();
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    log.info({ jobId, youtubeUrl, userId }, 'Processing YouTube video');
    await track(userId, 'ingest_youtube_started', { 
      jobId, 
      youtubeUrl, 
      stage: 'ingest',
      source: 'youtube'
    });
    
    // Step 1: Download video with robust options (0-85%)
    log.info({ jobId, youtubeUrl }, 'StartDownload');
    const downloadStartTime = Date.now();
    
    const { videoPath, infoPath, info } = await downloadVideo(youtubeUrl, tempDir, jobId, job);
    
    const downloadDuration = Date.now() - downloadStartTime;
    log.info({ jobId, videoPath, downloadDuration }, 'DownloadComplete');
    await track(userId, 'stage_completed', { 
      stage: 'download', 
      duration: downloadDuration,
      jobId,
      source: 'youtube'
    });
    
    // Step 2: Probe video and validate duration (85-90%)
    log.info({ jobId }, 'Starting video probe');
    const probeStartTime = Date.now();
    
    const probeResult = await new Promise<any>((resolve, reject) => {
      const ffprobe = require('fluent-ffmpeg');
      ffprobe.ffprobe(videoPath, (err: any, metadata: any) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
    
    const durationSec = probeResult.format?.duration || info.duration || 0;
    const MIN_DURATION = job.data.meta?.minDuration || 180; // 3 minutes default
    
    if (durationSec < MIN_DURATION) {
      await track(userId, 'ingest_failed', { 
        reason: 'VIDEO_TOO_SHORT',
        duration: durationSec,
        minRequired: MIN_DURATION,
        jobId
      });
      throw new UnrecoverableError(`VIDEO_TOO_SHORT: Video must be at least ${MIN_DURATION / 60} minutes long`);
    }
    
    const probeDuration = Date.now() - probeStartTime;
    await job.updateProgress(90);
    log.info({ jobId, duration: durationSec, title: info.title, probeDuration }, 'ProbeComplete');
    await track(userId, 'stage_completed', { 
      stage: 'probe', 
      duration: probeDuration,
      videoDuration: durationSec,
      jobId
    });
    
    // Step 3: Extract audio (90-95%)
    log.info({ jobId }, 'AudioExtractStarted');
    const audioStartTime = Date.now();
    const audioPath = await extractAudioForUpload(videoPath, tempDir, durationSec, job, 90, 95);
    const audioDuration = Date.now() - audioStartTime;
    log.info({ jobId, audioPath, audioDuration }, 'AudioExtracted');
    await track(userId, 'stage_completed', { 
      stage: 'audio_extract', 
      duration: audioDuration,
      jobId
    });
    
    // Step 4: Update info.json with validated data (95-98%)
    const enhancedInfo: VideoInfo = {
      ...info,
      duration: durationSec,
      title: info.title || path.basename(videoPath).replace(/\.[^/.]+$/, ''),
      webpage_url: youtubeUrl,
      width: probeResult.streams?.[0]?.width || info.width || 1920,
      height: probeResult.streams?.[0]?.height || info.height || 1080,
      dimensions: {
        width: probeResult.streams?.[0]?.width || info.width || 1920,
        height: probeResult.streams?.[0]?.height || info.height || 1080
      },
      fps: probeResult.streams?.[0]?.r_frame_rate ? eval(probeResult.streams[0].r_frame_rate) : (info.fps || 30)
    };
    
    await fs.writeFile(infoPath, JSON.stringify(enhancedInfo, null, 2));
    await job.updateProgress(98);
    
    // Step 5: Upload to storage (98-100%)
    log.info({ jobId }, 'UploadStarted');
    const uploadStartTime = Date.now();
    const result = await uploadToStorage(videoPath, audioPath, infoPath, rootId, job, enhancedInfo);
    const uploadDuration = Date.now() - uploadStartTime;
    log.info({ jobId, storagePaths: result.storagePaths, uploadDuration }, 'UploadComplete');
    await track(userId, 'stage_completed', { 
      stage: 'upload', 
      duration: uploadDuration,
      jobId
    });
    
    await job.updateProgress(100);
    
    // Enqueue next jobs
    await Promise.all([
      enqueueUnique(QUEUES.TRANSCRIBE, 'transcribe', `${rootId}:transcribe`, { rootId, meta: job.data.meta || {} }),
      enqueueUnique(QUEUES.SCENES, 'scenes', `${rootId}:scenes`, { rootId, meta: job.data.meta || {} }),
      enqueueUnique(QUEUES.RANK, 'rank', `${rootId}:rank`, { rootId, meta: job.data.meta || {} })
    ]);
    
    const totalDuration = Date.now() - startTime;
    await track(userId, 'ingest_youtube_completed', { 
      jobId,
      totalDuration,
      videoDuration: durationSec,
      videoTitle: enhancedInfo.title,
      videoResolution: `${enhancedInfo.width}x${enhancedInfo.height}`,
      success: true
    });
    
    return {
      rootId: result.rootId,
      storagePaths: result.storagePaths,
      duration: result.duration,
      title: result.title || enhancedInfo.title,
      url: result.url || youtubeUrl
    };
    
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    log.error({ jobId, youtubeUrl, error: error.message, stack: error.stack, totalDuration }, 'YouTube processing failed');
    
    await track(userId, 'ingest_failed', { 
      jobId,
      source: 'youtube',
      error: error.message,
      errorCode: error.code,
      totalDuration,
      youtubeUrl
    });
    
    if (error.code === 'VIDEO_TOO_SHORT' || String(error?.message || '').startsWith('VIDEO_TOO_SHORT')) {
      throw new UnrecoverableError('VIDEO_TOO_SHORT');
    }
    
    // For download failures, the job data already contains failedVideoUrl
    throw { code: 'YOUTUBE_PROCESSING_FAILED', message: error.message };
    
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      log.info({ jobId }, 'Cleanup completed');
    } catch (cleanupError) {
      log.warn({ jobId, error: cleanupError }, 'Cleanup failed');
    }
  }
}

export async function runIngest(job: Job): Promise<IngestResult> {
  const jobId = job.id || 'unknown';
  const { youtubeUrl, storagePath, source, fileName, meta } = job.data;
  
  // Determine source (new or legacy parameters)
  const detectedSource = determineSource(job);
  
  // Enhanced logging
  log.info({ 
    jobId, 
    source: detectedSource,
    youtubeUrl, 
    storagePath, 
    fileName,
    jobDataKeys: Object.keys(job.data)
  }, 'Processing ingest job with enhanced parameters');
  
  // Route to appropriate processor
  if (detectedSource === 'upload') {
    const uploadPath = storagePath || job.data.filePath;
    const uploadFileName = fileName || job.data.fileName || 'video.mp4';
    
    if (!uploadPath) {
      throw new UnrecoverableError('INVALID_INPUT: storagePath is required for upload source');
    }
    
    return await processUploadedVideo(job, uploadPath, uploadFileName);
    
  } else if (detectedSource === 'youtube') {
    const ytUrl = youtubeUrl || job.data.url;
    
    if (!ytUrl) {
      throw new UnrecoverableError('INVALID_INPUT: youtubeUrl is required for youtube source');
    }
    
    return await processYoutubeVideo(job, ytUrl);
    
  } else {
    throw new UnrecoverableError('INVALID_INPUT: source must be "youtube" or "upload"');
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
): Promise<{ videoPath: string; infoPath: string; info: VideoInfo }> {
  const outputTemplate = path.join(tempDir, 'source.%(ext)s');

  // First get video info
  const info = await probeVideo(url);
  
  const baseOptions: any = {
    output: outputTemplate,
    format: process.env.YTDLP_FORMAT || 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best',
    mergeOutputFormat: 'mp4',
    remuxVideo: 'mp4',
    writeInfoJson: true,
    noPlaylist: true,
    noCheckCertificates: true,
    preferFreeFormats: true,
    addHeader: [
      'referer:youtube.com',
      'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ],
    // Enhanced robustness settings
    continue: true,
    noOverwrites: true,
    retries: 'infinite',
    fragmentRetries: 'infinite',
    retrySleep: 'fragment:exp=1:10',
    forceIpv4: process.env.YTDLP_FORCE_IP_V4 === 'true',
    limitRate: '5M',
    newline: true,
    progressTemplate: 'download:%(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s',
  };
  
  // Set custom ffmpeg path if available
  if (ffmpegPath) {
    baseOptions.ffmpegLocation = ffmpegPath;
  }
  
  // First attempt - standard download
  try {
    log.info({ jobId, url }, 'StartDownload - Standard attempt');
    return await attemptDownload(url, baseOptions, job);
  } catch (primaryError: any) {
    log.warn({ jobId, url, error: primaryError.message }, 'Standard download failed, trying fallback');
    
    // Fallback attempt with cookies and enhanced headers
    try {
      const fallbackOptions = {
        ...baseOptions,
        addHeader: [
          ...baseOptions.addHeader,
          'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language: en-US,en;q=0.5',
          'Accept-Encoding: gzip, deflate',
          'Connection: keep-alive',
          'Upgrade-Insecure-Requests: 1'
        ],
        // Try to use cookies if available from Supabase
        ...(await getCookiesOptions()),
        // Additional fallback options
        extractor: 'youtube',
        ignoreErrors: false,
        skipUnavailableFragments: true,
        keepFragments: false,
        bufferSize: '16K',
        httpChunkSize: '10M'
      };
      
      log.info({ jobId, url }, 'StartDownload - Fallback attempt with cookies');
      return await attemptDownload(url, fallbackOptions, job);
      
    } catch (fallbackError: any) {
      log.error({ jobId, url, primaryError: primaryError.message, fallbackError: fallbackError.message }, 'All download attempts failed');
      
      // Mark as failed and store URL for inspection
      await markJobAsFailed(job, url, fallbackError.message);
      throw new UnrecoverableError(`Download failed after fallback: ${fallbackError.message}`);
    }
  }
}

async function attemptDownload(
  url: string,
  options: any,
  job: Job
): Promise<{ videoPath: string; infoPath: string; info: VideoInfo }> {
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
              
              log.info({ 
                jobId: job.id, 
                progress: `${percent.toFixed(1)}%`,
                bytes: parts[1],
                total: parts[2] 
              }, 'DownloadProgress');
            }
          }
        }
      }
    });
    
    process.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (output.includes('ERROR') || output.includes('WARNING')) {
        log.warn({ jobId: job.id, stderr: output.trim() }, 'Download warning/error');
      }
    });
    
    process.on('close', async (code) => {
      if (code === 0) {
        try {
          // Find the downloaded files
          const outputDir = path.dirname(options.output);
          const files = await fs.readdir(outputDir);
          const videoFile = files.find(f => f.endsWith('.mp4'));
          const infoFile = files.find(f => f.endsWith('.info.json'));
          
          if (!videoFile || !infoFile) {
            reject(new Error('Downloaded files not found'));
            return;
          }
          
          const videoPath = path.join(outputDir, videoFile);
          const infoPath = path.join(outputDir, infoFile);
          
          // Verify video file exists and has content
          const stats = await fs.stat(videoPath);
          if (stats.size === 0) {
            reject(new Error('Downloaded video file is empty'));
            return;
          }
          
          log.info({ jobId: job.id, fileSize: stats.size }, 'DownloadComplete');
          
          // Read info from the downloaded file
          const infoContent = await fs.readFile(infoPath, 'utf-8');
          const info = JSON.parse(infoContent);
          
          resolve({ videoPath, infoPath, info });
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

async function getCookiesOptions(): Promise<any> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !serviceRoleKey) {
      return {};
    }
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    // Try to download cookies file from storage
    const { data: cookiesData, error } = await supabase.storage
      .from('config')
      .download('cookies/youtube.txt');
    
    if (error || !cookiesData) {
      return {};
    }
    
    // Save cookies to temp file
    const cookiesPath = path.join(os.tmpdir(), `cookies-${Date.now()}.txt`);
    await fs.writeFile(cookiesPath, Buffer.from(await cookiesData.arrayBuffer()));
    
    return { cookies: cookiesPath };
  } catch (error) {
    log.warn({ error: (error as Error).message }, 'Failed to load cookies, continuing without');
    return {};
  }
}

async function markJobAsFailed(job: Job, failedVideoUrl: string, errorMessage: string): Promise<void> {
  try {
    // Update job data with failed URL for inspection
    await job.updateData({
      ...job.data,
      failedVideoUrl,
      failureReason: errorMessage,
      failedAt: new Date().toISOString()
    });
    
    log.error({ 
      jobId: job.id, 
      failedVideoUrl, 
      errorMessage 
    }, 'Job marked as failed due to download failure');
  } catch (error) {
    log.error({ jobId: job.id, error: (error as Error).message }, 'Failed to mark job as failed');
  }
}

async function uploadToStorage(
  videoPath: string,
  audioPath: string,
  infoPath: string,
  rootId: string,
  job: Job,
  info: VideoInfo
): Promise<StorageResult> {
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

  const [videoBuffer, audioBuffer, infoBuffer] = await Promise.all([
    fs.readFile(videoPath),
    fs.readFile(audioPath),
    fs.readFile(infoPath),
  ]);

    // Upload files to storage
    try {
      // Upload video first
      const videoUpload = await supabase.storage
        .from(bucket)
        .upload(sourceKey, videoBuffer, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (videoUpload.error) {
        throw new Error(`Failed to upload video: ${videoUpload.error.message}`);
      }

      // Upload audio and info in parallel
      const [audioUpload, infoUpload] = await Promise.all([
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

      if (audioUpload.error) {
        throw new Error(`Failed to upload audio: ${audioUpload.error.message}`);
      }
      if (infoUpload.error) {
        throw new Error(`Failed to upload info: ${infoUpload.error.message}`);
      }

      // Get URLs for uploaded files
      const { data: videoUrl } = await supabase.storage.from(bucket).getPublicUrl(sourceKey);
      const { data: audioUrl } = await supabase.storage.from(bucket).getPublicUrl(audioKey);
      const { data: infoUrl } = await supabase.storage.from(bucket).getPublicUrl(infoKey);

      await job.updateProgress(98);

      return {
        rootId,
        storagePaths: {
          video: sourceKey,
          audio: audioKey,
          info: infoKey
        },
        duration: Math.floor(info.duration),
        title: info.title || 'Untitled',
        url: info.webpage_url || videoUrl?.publicUrl || `${bucket}/${sourceKey}`
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
    const MIN_DURATION = job.data.meta?.minDuration || 180; // 3 minutes default
    
    if (durationSec < MIN_DURATION) {
      throw new UnrecoverableError(`VIDEO_TOO_SHORT: Video must be at least ${MIN_DURATION / 60} minutes long`);
    }
    
    await job.updateProgress(40);
    log.info({ jobId, duration: durationSec, title }, 'Video probed');
    
    // Step 3: Extract audio (40-70%)
    log.info({ jobId }, 'AudioExtractStarted');
    const audioPath = await extractAudioForUpload(videoPath, tempDir, durationSec, job, 40, 70);
    log.info({ jobId }, 'AudioExtractOk');
    
    // Step 4: Create synthetic info.json (70-75%)
    const infoPath = path.join(tempDir, 'info.json');
    const info: VideoInfo = {
      duration: durationSec,
      title: title || 'Untitled',
      webpage_url: `upload://${fileName}`,
      ext: path.extname(fileName).substring(1) || 'mp4',
      width: probeResult.streams?.[0]?.width || 1920,
      height: probeResult.streams?.[0]?.height || 1080,
      dimensions: {
        width: probeResult.streams?.[0]?.width || 1920,
        height: probeResult.streams?.[0]?.height || 1080
      },
      fps: probeResult.streams?.[0]?.r_frame_rate ? eval(probeResult.streams[0].r_frame_rate) : 30
    };
    await fs.writeFile(infoPath, JSON.stringify(info, null, 2));
    await job.updateProgress(75);
    
    // Step 5: Upload to storage (75-100%)
    log.info({ jobId }, 'UploadStarted');
    const result = await uploadToStorage(videoPath, audioPath, infoPath, rootId, job, info as VideoInfo);
    log.info({ jobId }, 'UploadOk');
    
    await job.updateProgress(100);
    
    // Enqueue next jobs in pipeline
    await Promise.all([
      enqueueUnique(
        QUEUES.TRANSCRIBE,
        'transcribe', 
        `${rootId}:transcribe`,
        { rootId, meta: job.data.meta || {} }
      ),
      enqueueUnique(
        QUEUES.SCENES,
        'scenes',
        `${rootId}:scenes`,
        { rootId, meta: job.data.meta || {} }
      ),
      enqueueUnique(
        QUEUES.RANK,
        'rank',
        `${rootId}:rank`,
        { rootId, meta: job.data.meta || {} }
      )
    ]);
    
    return {
      rootId: result.rootId,
      storagePaths: result.storagePaths,
      duration: result.duration,
      title: result.title || 'Untitled',
      url: result.url || `upload://${fileName}`
    };
    
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
