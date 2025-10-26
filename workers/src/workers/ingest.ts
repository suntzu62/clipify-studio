import { Job, UnrecoverableError } from 'bullmq';
import { promises as fs } from 'fs';
import { join } from 'path';
import youtubedl from 'youtube-dl-exec';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import pino from 'pino';
import { uploadFile, downloadToTemp } from '../lib/storage';
import { enqueueUnique } from '../lib/bullmq';
import { QUEUES } from '../queues';
import { validateYouTubeVideo } from '../lib/youtube-api';
import type { JobData, IngestResult, VideoInfo } from '../types/pipeline';
import { createClient } from '@supabase/supabase-js';
import { decryptToken, encryptToken } from '../lib/crypto';
import { createYtDlpOAuthCache, cleanupYtDlpOAuthCache } from '../lib/ytdlp-oauth-cache';
import { ensureYtDlpOAuth2Plugin } from '../lib/ytdlp-plugin-installer';

const log = pino({ name: 'ingest' });

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// ============================================
// MAIN INGEST WORKER
// ============================================

export async function runIngest(job: Job): Promise<IngestResult> {
  const jobData = job.data as JobData;
  
  // Validação de entrada
  if (!jobData || !jobData.rootId || !jobData.source || !jobData.meta) {
    throw new UnrecoverableError('INVALID_INPUT: JobData is malformed - missing required fields');
  }
  
  const { rootId, source, meta } = jobData;
  
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  const tmpDir = `/tmp/${rootId}`;
  
  log.info({ 
    rootId, 
    sourceType: source.type, 
    userId: meta.userId,
    targetDuration: meta.targetDuration 
  }, 'IngestStarted');
  
  try {
    // Criar diretório temporário
    await fs.mkdir(tmpDir, { recursive: true });
    await job.updateProgress(5);
    
    let videoPath: string;
    let videoInfo: VideoInfo;
    
    // ============================================
    // ROTA 1: YOUTUBE
    // ============================================
    if (source.type === 'youtube') {
      if (!source.youtubeUrl) {
        throw new UnrecoverableError('INVALID_INPUT: youtubeUrl required for youtube source');
      }
      
      log.info({ rootId, youtubeUrl: source.youtubeUrl }, 'ProcessingYouTube');
      const result = await processYouTube(tmpDir, source.youtubeUrl, job);
      videoPath = result.videoPath;
      videoInfo = result.info;
    } 
    // ============================================
    // ROTA 2: UPLOAD
    // ============================================
    else if (source.type === 'upload') {
      if (!source.storagePath) {
        throw new UnrecoverableError('INVALID_INPUT: storagePath required for upload source');
      }
      
      log.info({ 
        rootId, 
        storagePath: source.storagePath, 
        bucket: source.bucket 
      }, 'ProcessingUpload');
      
      const result = await processUpload(tmpDir, source, job);
      videoPath = result.videoPath;
      videoInfo = result.info;
    } 
    else {
      throw new UnrecoverableError(`INVALID_INPUT: unknown source type ${(source as any).type}`);
    }
    
    await job.updateProgress(50);
    
    // ============================================
    // VALIDAÇÃO DE DURAÇÃO
    // ============================================
    const duration = videoInfo.duration;
    const MIN_DURATION = meta.neededMinutes ? meta.neededMinutes * 60 : 180; // 3 minutos por padrão
    
    if (duration < MIN_DURATION) {
      throw new UnrecoverableError(
        `VIDEO_TOO_SHORT: Video must be at least ${Math.round(MIN_DURATION/60)} minutes long (got ${Math.round(duration/60)} minutes)`
      );
    }
    
    log.info({ 
      rootId, 
      duration, 
      width: videoInfo.width, 
      height: videoInfo.height,
      title: videoInfo.title 
    }, 'VideoValidated');
    
    await job.updateProgress(60);
    
    // ============================================
    // EXTRAIR ÁUDIO
    // ============================================
    log.info({ rootId }, 'ExtractingAudio');
    const audioPath = join(tmpDir, 'audio.wav');
    await extractAudio(videoPath, audioPath, job);
    await job.updateProgress(80);
    
    // ============================================
    // UPLOAD PARA STORAGE
    // ============================================
    log.info({ rootId, bucket }, 'UploadingToStorage');
    
    const sourcePath = `projects/${rootId}/source.mp4`;
    const audioStoragePath = `projects/${rootId}/media/audio.wav`;
    const infoPath = `projects/${rootId}/info.json`;
    
    // Salvar info.json
    await fs.writeFile(
      join(tmpDir, 'info.json'), 
      JSON.stringify(videoInfo, null, 2)
    );
    
    // Upload paralelo de todos os arquivos
    await Promise.all([
      uploadFile(bucket, sourcePath, videoPath, 'video/mp4'),
      uploadFile(bucket, audioStoragePath, audioPath, 'audio/wav'),
      uploadFile(bucket, infoPath, join(tmpDir, 'info.json'), 'application/json')
    ]);
    
    log.info({ 
      rootId, 
      sourcePath, 
      audioStoragePath,
      infoPath 
    }, 'FilesUploaded');
    
    await job.updateProgress(95);
    
    // ============================================
    // ENFILEIRAR PRÓXIMO WORKER (TRANSCRIBE)
    // ============================================
    log.info({ rootId }, 'EnqueueingTranscribe');
    
    await enqueueUnique(
      QUEUES.TRANSCRIBE,
      'transcribe',
      `${rootId}:transcribe`,
      { rootId, meta }
    );
    
    await job.updateProgress(100);
    
    log.info({ rootId }, 'IngestCompleted');
    
    return {
      rootId,
      bucket,
      sourcePath,
      audioPath: audioStoragePath,
      infoPath,
      duration,
      width: videoInfo.width || 1920,
      height: videoInfo.height || 1080
    };
    
  } catch (error: any) {
    log.error({ 
      rootId, 
      error: error.message, 
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 3) 
    }, 'IngestFailed');
    throw error;
  } finally {
    // Cleanup temporário
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
      log.debug({ rootId }, 'TempDirCleaned');
    } catch (cleanupError) {
      log.warn({ rootId, error: cleanupError }, 'CleanupFailed');
    }
  }
}

// ============================================
// PROCESSAMENTO YOUTUBE
// ============================================

async function processYouTube(
  tmpDir: string,
  youtubeUrl: string,
  job: Job
): Promise<{ videoPath: string; info: VideoInfo }> {
  // STEP 1: Setup OAuth2 cache for yt-dlp plugin (se usuário tiver conta YouTube)
  let oauthCacheFile: string | null = null;
  let pluginDir: string | null = null;
  
  try {
    const jobData = job.data as JobData;
    const userId = jobData.meta?.userId;
    
    if (userId) {
      // 1.1. Instalar plugin OAuth2 do yt-dlp
      pluginDir = await ensureYtDlpOAuth2Plugin('/tmp/yt-dlp-plugins');
      log.info({ pluginDir }, 'yt-dlp OAuth2 plugin ready');
      
      // 1.2. Criar cache de tokens para o plugin
      oauthCacheFile = await createYtDlpOAuthCache(userId, '/tmp/yt-dlp-cache');
      
      if (oauthCacheFile) {
        log.info({ userId, oauthCacheFile }, 'OAuth2 cache created for yt-dlp plugin');
      } else {
        log.warn({ userId }, 'No YouTube account found, proceeding without OAuth');
      }
    }
  } catch (err: any) {
    log.warn({ error: err.message }, 'Failed to setup OAuth for yt-dlp, proceeding without auth');
  }
  
  // STEP 2: Validate video via YouTube Data API v3 (if configured)
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    try {
      log.info({ youtubeUrl }, 'Validating YouTube video via API');
      await job.updateProgress(10);
      
      const validation = await validateYouTubeVideo(youtubeUrl, apiKey);
      
      if (!validation.available && validation.errorCode && 
          ['INVALID_URL', 'NOT_EMBEDDABLE', 'REGION_BLOCKED', 'REGION_RESTRICTED'].includes(validation.errorCode)) {
        log.error({ 
          youtubeUrl, 
          errorCode: validation.errorCode, 
          reason: validation.reason 
        }, 'YouTube video unavailable');
        
        throw new Error(`YOUTUBE_UNAVAILABLE: ${validation.reason}`);
      }
      
      if (validation.metadata) {
        log.info({ 
          title: validation.metadata.title,
          duration: validation.metadata.durationSeconds,
          channel: validation.metadata.channelTitle
        }, 'YouTube video validated successfully');
      }
      
      await job.updateProgress(15);
    } catch (apiError: any) {
      if (apiError.message?.startsWith('YOUTUBE_UNAVAILABLE')) {
        throw apiError;
      }
      log.warn({ error: apiError.message }, 'YouTube API validation failed, proceeding with yt-dlp');
    }
  }
  
  // STEP 3: Download video with yt-dlp
  const videoPath = join(tmpDir, 'video.mp4');
  const infoPath = `${videoPath}.info.json`;
  
  log.info({ youtubeUrl, hasOAuth: !!oauthCacheFile }, 'DownloadingFromYouTube');
  
  // Ensure yt-dlp binary is available
  const { ensureYtDlpBinary } = await import('../lib/yt-dlp');
  const ytDlpPath = await ensureYtDlpBinary();
  log.info({ binaryPath: ytDlpPath }, 'Using yt-dlp binary at path');
  
  // Create youtube-dl-exec instance with explicit binary path
  const youtubedlWithBinary = youtubedl.create(ytDlpPath);
  
  const ytDlpOptions: any = {
    output: videoPath,
    format: 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    noPlaylist: true,
    mergeOutputFormat: 'mp4',
    writeInfoJson: true,
    noPart: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: [
      'User-Agent:com.google.android.youtube/19.16.39 (Linux; U; Android 14) gzip',
      'X-YouTube-Client-Name:3',
      'X-YouTube-Client-Version:19.16.39'
    ],
    extractorArgs: 'youtube:player_client=android,web',
    sleepRequests: 1,
    retries: 3,
    fragmentRetries: 10,
    noCheckCertificates: true,
    referer: 'https://www.youtube.com/'
  };
  
  // NOVO: Configurar plugin OAuth2
  if (pluginDir && oauthCacheFile) {
    // Adicionar diretório de plugins ao yt-dlp
    process.env.YT_DLP_PLUGINS_PATH = pluginDir;
    
    // Direcionar plugin para usar nosso cache de tokens
    process.env.YT_OAUTH2_CACHE_DIR = '/tmp/yt-dlp-cache';
    
    // Habilitar OAuth2 via extractor args
    ytDlpOptions.extractorArgs = 'youtube:player_client=android,web;oauth2=true';
    
    log.info({ 
      pluginDir, 
      cacheFile: oauthCacheFile 
    }, 'Using yt-dlp OAuth2 plugin for authentication');
  }
  
  try {
    log.info({ youtubeUrl, ytDlpPath, hasOAuth: !!oauthCacheFile }, 'Starting yt-dlp download');
    
    await youtubedlWithBinary(youtubeUrl, ytDlpOptions);
    
    log.info({ videoPath }, 'yt-dlp download completed successfully');

    await job.updateProgress(40);
    
    // Ler metadata
    const rawInfo = JSON.parse(await fs.readFile(infoPath, 'utf-8'));
    
    const info: VideoInfo = {
      id: rawInfo.id,
      title: rawInfo.title || 'YouTube Video',
      duration: rawInfo.duration || 0,
      width: rawInfo.width || 1920,
      height: rawInfo.height || 1080,
      webpage_url: rawInfo.webpage_url || youtubeUrl,
      uploader: rawInfo.uploader || rawInfo.channel,
      ext: rawInfo.ext || 'mp4'
    };
    
    log.info({ 
      title: info.title, 
      duration: info.duration,
      dimensions: `${info.width}x${info.height}` 
    }, 'YouTubeDownloadComplete');
    
    return { videoPath, info };
    
  } catch (error: any) {
    log.error({ 
      youtubeUrl, 
      error: error.message,
      stderr: error.stderr,
      hadOAuth: !!oauthCacheFile
    }, 'YouTubeDownloadFailed');
    
    // Plugin OAuth2 já faz fallback automaticamente, então não tentamos novamente
    const errorMsg = error.message || '';
    const stderr = error.stderr || '';
    
    if (errorMsg.includes('Sign in to confirm') || stderr.includes('Sign in to confirm')) {
      throw new UnrecoverableError(
        'YOUTUBE_BLOCKED: Este vídeo requer autenticação. Conecte sua conta do YouTube nas integrações para melhorar a taxa de sucesso (85% vs 30%).'
      );
    }
    
    if (errorMsg.includes('Video unavailable') || stderr.includes('Video unavailable')) {
      throw new UnrecoverableError('VIDEO_UNAVAILABLE: Vídeo não está disponível');
    }
    
    if (errorMsg.includes('Private video') || stderr.includes('Private video')) {
      throw new UnrecoverableError('VIDEO_PRIVATE: Vídeo é privado');
    }
    
    if (errorMsg.includes('This video has been removed')) {
      throw new UnrecoverableError('VIDEO_REMOVED: Vídeo foi removido');
    }
    
    throw new UnrecoverableError(
      `YOUTUBE_ERROR: Não foi possível baixar o vídeo. Tente fazer upload do arquivo MP4 diretamente. Erro: ${errorMsg}`
    );
  } finally {
    // Garantir cleanup sempre, mesmo se houver erro
    if (oauthCacheFile) {
      await cleanupYtDlpOAuthCache(oauthCacheFile);
      log.info({ oauthCacheFile }, 'Cleaned up OAuth cache in finally block');
    }
  }
}

// ============================================
// HELPER: REFRESH GOOGLE OAUTH TOKEN
// ============================================

async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  });
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    log.error({ status: response.status, error: errorText }, 'Token refresh failed');
    throw new Error(`Token refresh failed: ${response.status}`);
  }
  
  return await response.json();
}

// ============================================
// PROCESSAMENTO UPLOAD
// ============================================

async function processUpload(
  tmpDir: string, 
  source: { storagePath?: string; fileName?: string; bucket?: string }, 
  job: Job
): Promise<{ videoPath: string; info: VideoInfo }> {
  const videoPath = join(tmpDir, 'video.mp4');
  const bucket = source.bucket || 'raw';
  
  log.info({ 
    bucket, 
    storagePath: source.storagePath 
  }, 'DownloadingFromStorage');
  
  try {
    // Download do Supabase Storage
    await downloadToTemp(bucket, source.storagePath!, videoPath);
    
    await job.updateProgress(40);
    
    // Extrair metadados com ffprobe
    const info = await new Promise<VideoInfo>((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          log.error({ error: err.message }, 'FFprobeError');
          return reject(err);
        }
        
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        
        resolve({
          title: source.fileName?.replace(/\.[^/.]+$/, '') || 'Uploaded Video',
          duration: metadata.format.duration || 0,
          width: videoStream?.width || 1920,
          height: videoStream?.height || 1080,
          webpage_url: `upload://${source.fileName}`,
          ext: 'mp4'
        });
      });
    });
    
    log.info({ 
      title: info.title, 
      duration: info.duration,
      dimensions: `${info.width}x${info.height}` 
    }, 'UploadProcessed');
    
    return { videoPath, info };
    
  } catch (error: any) {
    log.error({ 
      bucket, 
      storagePath: source.storagePath, 
      error: error.message 
    }, 'UploadProcessingFailed');
    
    if (error.code === 'VIDEO_NOT_FOUND') {
      throw new UnrecoverableError('VIDEO_NOT_FOUND: Uploaded file not found in storage');
    }
    
    throw error;
  }
}

// ============================================
// EXTRAÇÃO DE ÁUDIO
// ============================================

async function extractAudio(
  videoPath: string, 
  audioPath: string, 
  job: Job
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('pcm_s16le')
      .format('wav')
      .output(audioPath)
      .on('progress', (progress) => {
        // Progresso entre 60-79%
        const percent = Math.min(79, 60 + (progress.percent || 0) * 0.19);
        job.updateProgress(Math.floor(percent)).catch(() => {});
      })
      .on('end', () => {
        log.info({ audioPath }, 'AudioExtractionComplete');
        resolve();
      })
      .on('error', (err) => {
        log.error({ error: err.message }, 'AudioExtractionFailed');
        reject(err);
      })
      .run();
  });
}

export default runIngest;
