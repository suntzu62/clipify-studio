import ytdl from '@distube/ytdl-core';
import { createWriteStream, promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import youtubedl from 'youtube-dl-exec';
import { createLogger } from '../config/logger.js';
import { downloadFile } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { VideoDownloadError, VideoMetadata } from '../types/index.js';

const logger = createLogger('download');

// Set ffmpeg/ffprobe paths from ffmpeg-static or system
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
  // ffprobe-static não existe como pacote, usar o do sistema ou derivar do ffmpeg-static
  const ffprobePath = ffmpegStatic.replace(/ffmpeg$/, 'ffprobe');
  try {
    require('fs').accessSync(ffprobePath);
    ffmpeg.setFfprobePath(ffprobePath);
  } catch {
    // ffprobe-static não disponível, usar do sistema (instalado via apt)
    logger.info('ffprobe-static not found, using system ffprobe');
  }
}

// ============================================
// TIPOS INTERNOS
// ============================================

interface DownloadResult {
  videoPath: string;
  metadata: VideoMetadata;
}

// Removido - usamos os tipos nativos do fluent-ffmpeg

// ============================================
// FUNÇÕES PÚBLICAS
// ============================================

/**
 * Download principal - decide entre YouTube ou Upload
 */
export async function downloadVideo(
  sourceType: 'youtube' | 'upload',
  youtubeUrl?: string,
  uploadPath?: string
): Promise<DownloadResult> {
  logger.info({ sourceType, youtubeUrl, uploadPath }, 'Starting video download');

  try {
    if (sourceType === 'youtube' && youtubeUrl) {
      return await downloadFromYouTube(youtubeUrl);
    } else if (sourceType === 'upload' && uploadPath) {
      return await downloadFromSupabase(uploadPath);
    } else {
      throw new VideoDownloadError('Invalid source type or missing parameters');
    }
  } catch (error: any) {
    logger.error({ error: error.message, sourceType }, 'Download failed');
    throw error;
  }
}

/**
 * Extrai metadata de um vídeo usando FFprobe
 */
export async function extractMetadata(videoPath: string): Promise<VideoMetadata> {
  logger.info({ videoPath }, 'Extracting video metadata');

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        logger.error({ error: err.message, videoPath }, 'FFprobe failed');
        reject(new VideoDownloadError(`FFprobe failed: ${err.message}`, err));
        return;
      }

      try {
        // Encontrar stream de vídeo
        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');

        if (!videoStream) {
          throw new VideoDownloadError('No video stream found in file');
        }

        // Converter duration para número
        let duration = 0;
        if (metadata.format.duration) {
          duration = typeof metadata.format.duration === 'number'
            ? metadata.format.duration
            : parseFloat(String(metadata.format.duration));
        }

        const result: VideoMetadata = {
          title: path.basename(videoPath),
          duration,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          url: videoPath,
        };

        logger.info({ metadata: result }, 'Metadata extracted successfully');
        resolve(result);
      } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to parse metadata');
        reject(new VideoDownloadError(`Failed to parse metadata: ${error.message}`, error));
      }
    });
  });
}

/**
 * Valida se o arquivo de vídeo é válido
 */
export async function validateVideo(videoPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(videoPath);

    // Verifica se o arquivo existe e tem tamanho > 0
    if (!stats.isFile() || stats.size === 0) {
      logger.warn({ videoPath, size: stats.size }, 'Invalid video file');
      return false;
    }

    // Tenta extrair metadata para validar formato
    await extractMetadata(videoPath);

    logger.info({ videoPath, size: stats.size }, 'Video validated successfully');
    return true;
  } catch (error: any) {
    logger.error({ error: error.message, videoPath }, 'Video validation failed');
    return false;
  }
}

// ============================================
// FUNÇÕES PRIVADAS - YouTube
// ============================================

/**
 * Download de vídeo do YouTube
 * Tenta ytdl-core primeiro, fallback para yt-dlp
 */
async function downloadFromYouTube(url: string): Promise<DownloadResult> {
  logger.info({ url }, 'Downloading from YouTube');

  // Gerar caminho temporário único
  const videoId = extractYouTubeId(url);
  const tempPath = path.join(os.tmpdir(), `clipify-${videoId}-${Date.now()}.mp4`);

  try {
    // Tentar com ytdl-core primeiro (mais rápido)
    logger.info({ url, method: 'ytdl-core' }, 'Attempting download with ytdl-core');
    const metadata = await downloadWithYtdl(url, tempPath);

    // Validar download
    const isValid = await validateVideo(tempPath);
    if (!isValid) {
      throw new Error('Downloaded video is invalid');
    }

    return { videoPath: tempPath, metadata };
  } catch (error: any) {
    logger.warn({ error: error.message, url }, 'ytdl-core failed, trying yt-dlp fallback');

    // Tentar com yt-dlp como fallback
    try {
      const metadata = await downloadWithYtDlp(url, tempPath);

      // Validar download
      const isValid = await validateVideo(tempPath);
      if (!isValid) {
        throw new Error('Downloaded video is invalid');
      }

      return { videoPath: tempPath, metadata };
    } catch (fallbackError: any) {
      logger.error(
        { error: fallbackError.message, url },
        'Both download methods failed'
      );

      // Limpar arquivo temporário se existir
      try {
        await fs.unlink(tempPath);
      } catch {}

      throw new VideoDownloadError(
        `Failed to download YouTube video: ${fallbackError.message}`,
        fallbackError
      );
    }
  }
}

/**
 * Download usando ytdl-core
 * Baixa video e audio separadamente (DASH) para máxima qualidade,
 * depois merge com FFmpeg. Streams muxados do YouTube limitam a 720p.
 */
async function downloadWithYtdl(url: string, outputPath: string): Promise<VideoMetadata> {
  logger.info({ url, outputPath }, 'Downloading with ytdl-core (separate streams)');

  const info = await ytdl.getInfo(url);

  // Selecionar melhor video-only e audio-only (DASH = máxima qualidade)
  const videoFormat = ytdl.chooseFormat(info.formats, {
    quality: 'highestvideo',
    filter: 'videoonly',
  });
  const audioFormat = ytdl.chooseFormat(info.formats, {
    quality: 'highestaudio',
    filter: 'audioonly',
  });

  if (!videoFormat || !audioFormat) {
    throw new Error('No suitable video/audio formats found');
  }

  logger.info(
    { videoItag: videoFormat.itag, videoRes: `${videoFormat.width}x${videoFormat.height}`, audioItag: audioFormat.itag },
    'Selected DASH formats'
  );

  // Download video e audio em paralelo para arquivos temporários
  const videoTmp = outputPath.replace('.mp4', '-video.mp4');
  const audioTmp = outputPath.replace('.mp4', '-audio.mp4');

  await Promise.all([
    pipeline(ytdl(url, { format: videoFormat }), createWriteStream(videoTmp)),
    pipeline(ytdl(url, { format: audioFormat }), createWriteStream(audioTmp)),
  ]);

  logger.info('Video and audio streams downloaded, merging with FFmpeg');

  // Merge video + audio com FFmpeg (copy, sem re-encode)
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(videoTmp)
      .input(audioTmp)
      .outputOptions(['-c', 'copy', '-movflags', '+faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new Error(`FFmpeg merge failed: ${err.message}`)))
      .run();
  });

  // Limpar arquivos temporários
  await Promise.all([
    fs.unlink(videoTmp).catch(() => {}),
    fs.unlink(audioTmp).catch(() => {}),
  ]);

  const videoDetails = info.videoDetails;
  const metadata: VideoMetadata = {
    id: videoDetails.videoId,
    title: videoDetails.title,
    duration: parseInt(videoDetails.lengthSeconds),
    width: videoFormat.width || 1920,
    height: videoFormat.height || 1080,
    url: videoDetails.video_url,
    thumbnail: videoDetails.thumbnails[0]?.url,
  };

  logger.info({ metadata, outputPath, resolution: `${metadata.width}x${metadata.height}` }, 'Download with ytdl-core completed (full quality)');
  return metadata;
}

/**
 * Download usando yt-dlp (fallback) - chamando diretamente via CLI
 */
async function downloadWithYtDlp(url: string, outputPath: string): Promise<VideoMetadata> {
  logger.info({ url, outputPath }, 'Downloading with yt-dlp');

  try {
    // Deletar arquivo se já existir (pode estar vazio de tentativa anterior)
    try {
      await fs.unlink(outputPath);
      logger.info({ outputPath }, 'Deleted existing file before download');
    } catch (err) {
      // Arquivo não existe, ok
    }

    // Chamar yt-dlp diretamente (sem script intermediário)
    // Isso garante que o processo aguarde o download completo (incluindo HLS streaming)
    const outputDir = path.dirname(outputPath);
    const outputBase = path.basename(outputPath, path.extname(outputPath));
    const outputTemplate = path.join(outputDir, `${outputBase}.%(ext)s`);

    // Ask yt-dlp to print final output path so we can resolve it reliably.
    const ytDlpStdout = await youtubedl(url, {
      format: 'bestvideo+bestaudio/best',
      noPlaylist: true,
      noCheckCertificates: true,
      output: outputTemplate,
      print: 'after_move:filepath',
    } as any, {
      timeout: 600000, // 10 minutos para downloads maiores
    });

    // Tentar localizar qualquer arquivo final gerado pelo yt-dlp
    logger.info({ outputPath, outputTemplate }, 'Checking generated files after yt-dlp');

    let fileSize = 0;
    let resolvedOutputPath = outputPath;
    const printedPath = String(ytDlpStdout || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .pop();

    if (printedPath) {
      try {
        const printedStats = await fs.stat(printedPath);
        if (printedStats.isFile() && printedStats.size > 0) {
          resolvedOutputPath = printedPath;
          fileSize = printedStats.size;
          logger.info({ printedPath, size: fileSize }, 'Resolved final file path from yt-dlp output');
        }
      } catch (error: any) {
        logger.warn({ printedPath, error: error?.message }, 'Printed yt-dlp path not found on disk');
      }
    }
    const findGeneratedFile = async (): Promise<string | null> => {
      const files = await fs.readdir(outputDir);
      const candidates = files
        .filter((f) => f.startsWith(`${outputBase}.`) && !f.endsWith('.part'))
        .map((f) => path.join(outputDir, f));

      if (candidates.length === 0) return null;

      let best: { file: string; mtimeMs: number } | null = null;
      for (const file of candidates) {
        try {
          const stats = await fs.stat(file);
          if (!stats.isFile() || stats.size <= 0) continue;
          if (!best || stats.mtimeMs > best.mtimeMs) {
            best = { file, mtimeMs: stats.mtimeMs };
          }
        } catch {
          // ignore missing transient files
        }
      }
      return best?.file || null;
    };

    if (fileSize === 0) {
      try {
        const generated = await findGeneratedFile();
        if (!generated) throw new Error('No generated file found');
        resolvedOutputPath = generated;
        const statsImmediate = await fs.stat(resolvedOutputPath);
        fileSize = statsImmediate.size;
        logger.info({ outputPath: resolvedOutputPath, size: fileSize }, 'Generated file exists immediately after download');
      } catch (error: any) {
        logger.warn({ outputPath, error: error.message }, 'File not found immediately - will retry with polling');

        // Listar arquivos no /tmp para debug
        try {
          const tmpFiles = await fs.readdir('/tmp');
          const clipifyFiles = tmpFiles.filter(f => f.startsWith('clipify-'));
          logger.info({ clipifyFiles }, 'Files in /tmp starting with clipify-');
        } catch {}

        // Se não existe, fazer polling
        const maxRetries = 30;
        let stableSize = 0;
        let stableCount = 0;

        for (let retry = 0; retry < maxRetries; retry++) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          try {
            const generated = await findGeneratedFile();
            if (!generated) throw new Error('No generated file found');
            resolvedOutputPath = generated;
            const stats = await fs.stat(resolvedOutputPath);
            fileSize = stats.size;

            logger.info({ outputPath: resolvedOutputPath, size: fileSize, retry, stableCount }, 'File size check (polling)');

            if (fileSize > 0) {
              if (fileSize === stableSize) {
                stableCount++;
                if (stableCount >= 2) {
                  logger.info({ outputPath, finalSize: fileSize }, 'File size stable');
                  break;
                }
              } else {
                stableSize = fileSize;
                stableCount = 0;
              }
            }
          } catch (err: any) {
            logger.warn({ outputPath, retry, error: err.message }, 'File still not found');
          }
        }
      }
    }

    if (fileSize === 0) {
      logger.error({ outputPath }, 'Downloaded file is empty or not found');
      throw new Error('Downloaded file is empty');
    }

    // Normalize final path for the rest of the pipeline
    if (resolvedOutputPath !== outputPath) {
      await fs.rename(resolvedOutputPath, outputPath);
      logger.info({ from: resolvedOutputPath, to: outputPath }, 'Renamed yt-dlp output to expected path');
    }

    logger.info({ outputPath, size: fileSize }, 'File downloaded successfully');

    // Extrair metadata do arquivo baixado
    const metadata = await extractMetadata(outputPath);

    // Tentar obter informações adicionais do YouTube via yt-dlp --dump-json
    try {
      const info = await youtubedl(url, {
        dumpSingleJson: true,
        noPlaylist: true,
      }) as any;

      metadata.id = info.id;
      metadata.title = info.title || metadata.title;
      metadata.thumbnail = info.thumbnail;
    } catch (infoError) {
      logger.warn({ error: infoError }, 'Could not fetch video info from yt-dlp');
    }

    logger.info({ metadata, outputPath }, 'Download with yt-dlp completed');
    return metadata;
  } catch (error: any) {
    throw new VideoDownloadError(`yt-dlp download failed: ${error.message}`, error);
  }
}

/**
 * Extrai ID do vídeo da URL do YouTube
 */
function extractYouTubeId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  throw new VideoDownloadError('Invalid YouTube URL');
}

// ============================================
// FUNÇÕES PRIVADAS - Supabase
// ============================================

/**
 * Download de vídeo do Supabase Storage
 */
async function downloadFromSupabase(uploadPath: string): Promise<DownloadResult> {
  logger.info({ uploadPath }, 'Downloading from Supabase Storage');

  const bucket = env.supabase.bucket;
  const tempPath = path.join(
    os.tmpdir(),
    `clipify-upload-${Date.now()}-${path.basename(uploadPath)}`
  );

  try {
    // Download do Supabase
    const blob = await downloadFile(bucket, uploadPath);
    const buffer = Buffer.from(await blob.arrayBuffer());

    // Salvar no sistema de arquivos
    await fs.writeFile(tempPath, buffer);

    // Validar arquivo
    const isValid = await validateVideo(tempPath);
    if (!isValid) {
      throw new Error('Downloaded video from Supabase is invalid');
    }

    // Extrair metadata
    const metadata = await extractMetadata(tempPath);
    metadata.url = uploadPath;

    logger.info({ uploadPath, tempPath, metadata }, 'Download from Supabase completed');
    return { videoPath: tempPath, metadata };
  } catch (error: any) {
    // Limpar arquivo temporário se existir
    try {
      await fs.unlink(tempPath);
    } catch {}

    logger.error({ error: error.message, uploadPath }, 'Supabase download failed');
    throw new VideoDownloadError(
      `Failed to download from Supabase: ${error.message}`,
      error
    );
  }
}

// ============================================
// CLEANUP HELPER
// ============================================

/**
 * Remove arquivo temporário de vídeo
 */
export async function cleanupVideo(videoPath: string): Promise<void> {
  try {
    await fs.unlink(videoPath);
    logger.info({ videoPath }, 'Temporary video file cleaned up');
  } catch (error: any) {
    logger.warn({ error: error.message, videoPath }, 'Failed to cleanup video file');
  }
}
