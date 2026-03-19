import ytdl from '@distube/ytdl-core';
import { createWriteStream, promises as fs } from 'fs';
import { Readable } from 'stream';
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

interface YtDlpAttempt {
  label: string;
  format: string;
  extractorArgs?: string;
}

const YTDLP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

function createYtdlDownloadAgent() {
  if (!env.ytdlp.proxyUrl) {
    return undefined;
  }

  try {
    return ytdl.createProxyAgent({ uri: env.ytdlp.proxyUrl });
  } catch (error: any) {
    logger.warn(
      { error: error?.message, proxyUrl: env.ytdlp.proxyUrl },
      'Failed to create ytdl proxy agent, continuing without proxy'
    );
    return undefined;
  }
}

async function prepareYtDlpCookiesFile(): Promise<string | null> {
  const encoded = env.ytdlp.cookiesBase64?.trim();
  if (!encoded) return null;

  try {
    let content = '';
    try {
      content = Buffer.from(encoded, 'base64').toString('utf-8');
    } catch {
      content = encoded;
    }

    // Accept raw cookies text if user pasted it directly.
    if (!content.includes('youtube.com') && !content.includes('# Netscape HTTP Cookie File')) {
      content = encoded;
    }

    if (!content || !content.trim()) {
      return null;
    }

    const cookiesPath = path.join(
      os.tmpdir(),
      `clipify-ytdlp-cookies-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
    );

    await fs.writeFile(cookiesPath, content, { mode: 0o600 });
    return cookiesPath;
  } catch (error: any) {
    logger.warn({ error: error?.message }, 'Failed to prepare yt-dlp cookies file');
    return null;
  }
}

function buildYtDlpExtractorArgs(
  playerClients: string[] = ['android', 'web'],
  options: { skipWebpage?: boolean; skipConfigs?: boolean } = {}
): string {
  const args = [`youtube:player_client=${playerClients.join(',')}`];
  const skips: string[] = [];

  if (options.skipWebpage !== false) {
    skips.push('webpage');
  }
  if (options.skipConfigs !== false) {
    skips.push('configs');
  }
  if (skips.length > 0) {
    args.push(`youtube:player_skip=${skips.join(',')}`);
  }

  if (env.ytdlp.visitorData) {
    args.push(`youtube:visitor_data=${env.ytdlp.visitorData}`);
  }
  if (env.ytdlp.poToken) {
    args.push(`youtube:po_token=${env.ytdlp.poToken}`);
  }
  return args.join(';');
}

function getYtDlpAttempts(): YtDlpAttempt[] {
  const attempts: YtDlpAttempt[] = [
    {
      label: 'android-web-adaptive',
      format: 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/best',
      extractorArgs: buildYtDlpExtractorArgs(['android', 'web']),
    },
    {
      label: 'android-ios-tv',
      format: 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/best',
      extractorArgs: buildYtDlpExtractorArgs(['android', 'ios', 'tv_embedded']),
    },
    {
      label: 'single-file-mp4',
      format: 'best[ext=mp4]/best',
      extractorArgs: buildYtDlpExtractorArgs(['android', 'ios'], { skipConfigs: false }),
    },
    {
      label: 'default-extractor',
      format: 'bestvideo+bestaudio/best',
      extractorArgs: env.ytdlp.visitorData || env.ytdlp.poToken
        ? buildYtDlpExtractorArgs(['android', 'web'], { skipWebpage: false, skipConfigs: false })
        : undefined,
    },
  ];

  const seen = new Set<string>();
  return attempts.filter((attempt) => {
    const key = `${attempt.format}::${attempt.extractorArgs || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function cleanupYtDlpArtifacts(outputDir: string, outputBase: string): Promise<void> {
  try {
    const files = await fs.readdir(outputDir);
    const candidates = files.filter((file) =>
      file === outputBase ||
      file.startsWith(`${outputBase}.`) ||
      file.startsWith(`${outputBase}-`)
    );

    await Promise.all(
      candidates.map((file) => fs.unlink(path.join(outputDir, file)).catch(() => undefined))
    );
  } catch {
    // ignore cleanup failures
  }
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
    if (env.ingestService.url && env.ingestService.apiKey) {
      try {
        logger.info({ url, ingestServiceUrl: env.ingestService.url }, 'Attempting remote ingest service download');
        const metadata = await downloadWithIngestService(url, tempPath);

        const isValid = await validateVideo(tempPath);
        if (!isValid) {
          throw new Error('Video returned by ingest service is invalid');
        }

        return { videoPath: tempPath, metadata };
      } catch (error: any) {
        logger.warn(
          { url, ingestServiceUrl: env.ingestService.url, error: error.message },
          'Remote ingest service failed, falling back to local download'
        );
      }
    }

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

async function downloadWithIngestService(url: string, outputPath: string): Promise<VideoMetadata> {
  const endpoint = `${env.ingestService.url!.replace(/\/$/, '')}/internal/ingest/youtube`;
  const timeoutSignal = AbortSignal.timeout(env.ingestService.timeoutMs);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ingestService.apiKey!,
    },
    body: JSON.stringify({ url }),
    signal: timeoutSignal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Ingest service responded ${response.status}: ${errorText || response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Ingest service returned empty body');
  }

  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(outputPath));

  const metadataHeader = response.headers.get('x-clipify-metadata');
  if (metadataHeader) {
    try {
      const parsed = JSON.parse(Buffer.from(metadataHeader, 'base64').toString('utf8')) as VideoMetadata;
      parsed.url = url;
      return parsed;
    } catch (error: any) {
      logger.warn({ error: error?.message }, 'Failed to parse ingest service metadata header');
    }
  }

  const metadata = await extractMetadata(outputPath);
  metadata.url = url;
  return metadata;
}

/**
 * Download usando ytdl-core
 * Baixa video e audio separadamente (DASH) para máxima qualidade,
 * depois merge com FFmpeg. Streams muxados do YouTube limitam a 720p.
 */
async function downloadWithYtdl(url: string, outputPath: string): Promise<VideoMetadata> {
  logger.info({ url, outputPath }, 'Downloading with ytdl-core (separate streams)');

  const agent = createYtdlDownloadAgent();
  const info = await ytdl.getInfo(url, agent ? { agent } : undefined);

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
    pipeline(ytdl(url, { format: videoFormat, ...(agent ? { agent } : {}) }), createWriteStream(videoTmp)),
    pipeline(ytdl(url, { format: audioFormat, ...(agent ? { agent } : {}) }), createWriteStream(audioTmp)),
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

  let cookiesPath: string | null = null;

  try {
    // Deletar arquivo se já existir (pode estar vazio de tentativa anterior)
    try {
      await fs.unlink(outputPath);
      logger.info({ outputPath }, 'Deleted existing file before download');
    } catch (err) {
      // Arquivo não existe, ok
    }

    const outputDir = path.dirname(outputPath);
    const outputBase = path.basename(outputPath, path.extname(outputPath));
    const outputTemplate = path.join(outputDir, `${outputBase}.%(ext)s`);
    cookiesPath = await prepareYtDlpCookiesFile();
    const attempts = getYtDlpAttempts();
    let lastError: any;

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

    for (const attempt of attempts) {
      let fileSize = 0;
      let resolvedOutputPath = outputPath;

      try {
        await cleanupYtDlpArtifacts(outputDir, outputBase);

        const ytDlpStdout = await youtubedl(url, {
          format: attempt.format,
          noPlaylist: true,
          noCheckCertificates: true,
          jsRuntimes: 'node',
          mergeOutputFormat: 'mp4',
          userAgent: YTDLP_USER_AGENT,
          referer: 'https://www.youtube.com/',
          forceIpv4: true,
          geoBypass: true,
          extractorRetries: 3,
          retries: 3,
          fragmentRetries: 3,
          concurrentFragments: 1,
          output: outputTemplate,
          print: 'after_move:filepath',
          ...(attempt.extractorArgs ? { extractorArgs: attempt.extractorArgs } : {}),
          ...(env.ytdlp.proxyUrl ? { proxy: env.ytdlp.proxyUrl } : {}),
          ...(cookiesPath ? { cookies: cookiesPath } : {}),
        } as any, {
          timeout: 600000,
        });

        logger.info({ url, outputPath, outputTemplate, attempt: attempt.label }, 'Checking generated files after yt-dlp');

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
              logger.info(
                { printedPath, size: fileSize, attempt: attempt.label },
                'Resolved final file path from yt-dlp output'
              );
            }
          } catch (error: any) {
            logger.warn({ printedPath, error: error?.message, attempt: attempt.label }, 'Printed yt-dlp path not found on disk');
          }
        }

        if (fileSize === 0) {
          try {
            const generated = await findGeneratedFile();
            if (!generated) throw new Error('No generated file found');
            resolvedOutputPath = generated;
            const statsImmediate = await fs.stat(resolvedOutputPath);
            fileSize = statsImmediate.size;
            logger.info(
              { outputPath: resolvedOutputPath, size: fileSize, attempt: attempt.label },
              'Generated file exists immediately after download'
            );
          } catch (error: any) {
            logger.warn({ outputPath, error: error.message, attempt: attempt.label }, 'File not found immediately - will retry with polling');

            const maxRetries = 30;
            let stableSize = 0;
            let stableCount = 0;

            for (let retry = 0; retry < maxRetries; retry++) {
              await new Promise((resolve) => setTimeout(resolve, 1000));

              try {
                const generated = await findGeneratedFile();
                if (!generated) throw new Error('No generated file found');
                resolvedOutputPath = generated;
                const stats = await fs.stat(resolvedOutputPath);
                fileSize = stats.size;

                logger.info(
                  { outputPath: resolvedOutputPath, size: fileSize, retry, stableCount, attempt: attempt.label },
                  'File size check (polling)'
                );

                if (fileSize > 0) {
                  if (fileSize === stableSize) {
                    stableCount++;
                    if (stableCount >= 2) {
                      logger.info({ outputPath, finalSize: fileSize, attempt: attempt.label }, 'File size stable');
                      break;
                    }
                  } else {
                    stableSize = fileSize;
                    stableCount = 0;
                  }
                }
              } catch (err: any) {
                logger.warn({ outputPath, retry, error: err.message, attempt: attempt.label }, 'File still not found');
              }
            }
          }
        }

        if (fileSize === 0) {
          throw new Error(`Downloaded file is empty after attempt ${attempt.label}`);
        }

        if (resolvedOutputPath !== outputPath) {
          await fs.rename(resolvedOutputPath, outputPath);
          logger.info({ from: resolvedOutputPath, to: outputPath, attempt: attempt.label }, 'Renamed yt-dlp output to expected path');
        }

        logger.info({ outputPath, size: fileSize, attempt: attempt.label }, 'File downloaded successfully');

        const metadata = await extractMetadata(outputPath);

        try {
          const info = await youtubedl(url, {
            dumpSingleJson: true,
            noPlaylist: true,
            userAgent: YTDLP_USER_AGENT,
            referer: 'https://www.youtube.com/',
            forceIpv4: true,
            geoBypass: true,
            ...(attempt.extractorArgs ? { extractorArgs: attempt.extractorArgs } : {}),
            ...(env.ytdlp.proxyUrl ? { proxy: env.ytdlp.proxyUrl } : {}),
            ...(cookiesPath ? { cookies: cookiesPath } : {}),
          } as any) as any;

          metadata.id = info.id;
          metadata.title = info.title || metadata.title;
          metadata.thumbnail = info.thumbnail;
        } catch (infoError) {
          logger.warn({ error: infoError, attempt: attempt.label }, 'Could not fetch video info from yt-dlp');
        }

        logger.info({ metadata, outputPath, attempt: attempt.label }, 'Download with yt-dlp completed');
        return metadata;
      } catch (attemptError: any) {
        lastError = attemptError;
        logger.warn(
          { url, outputPath, attempt: attempt.label, error: attemptError.message },
          'yt-dlp attempt failed, trying next strategy'
        );

        try {
          await cleanupYtDlpArtifacts(outputDir, outputBase);
        } catch {
          // ignore cleanup failures between attempts
        }
      }
    }

    throw lastError || new Error('yt-dlp exhausted all download strategies');
  } catch (error: any) {
    const message = String(error?.message || error || '');
    const requiresAuth =
      /sign in to confirm you're not a bot|cookies-from-browser|use --cookies|no title found in player responses|visitor_data|po_token|bot/i.test(
        message
      );

    if (requiresAuth && !env.ytdlp.cookiesBase64 && !(env.ytdlp.visitorData && env.ytdlp.poToken)) {
      throw new VideoDownloadError(
        'yt-dlp bloqueado pelo YouTube. Configure YTDLP_PROXY_URL, YTDLP_COOKIES_B64 ou o par YTDLP_VISITOR_DATA + YTDLP_PO_TOKEN.',
        error
      );
    }

    throw new VideoDownloadError(`yt-dlp download failed: ${error.message}`, error);
  } finally {
    if (cookiesPath) {
      await fs.unlink(cookiesPath).catch(() => {});
    }
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
