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
import type { JobData, IngestResult, VideoInfo } from '../types/pipeline';

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
  const videoPath = join(tmpDir, 'video.mp4');
  const infoPath = join(tmpDir, 'info.json');
  
  log.info({ youtubeUrl }, 'DownloadingFromYouTube');
  
  // Use youtube-dl-exec which automatically manages yt-dlp binary
  try {
    await youtubedl(youtubeUrl, {
      output: videoPath,
      format: 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      noPlaylist: true,
      mergeOutputFormat: 'mp4',
      writeInfoJson: true,
      noPart: true,
      noWarnings: true,
      preferFreeFormats: true,
      referer: 'youtube.com',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    });

    await job.updateProgress(40);
    log.info({ videoPath }, 'YouTubeDownloadComplete');
    
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
      stack: error.stack 
    }, 'YouTubeDownloadFailed');
    
    if (error.message?.includes('Video unavailable')) {
      throw new UnrecoverableError('VIDEO_UNAVAILABLE: This video is not available');
    }
    if (error.message?.includes('Private video')) {
      throw new UnrecoverableError('VIDEO_PRIVATE: This video is private');
    }
    
    throw error;
  }
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
