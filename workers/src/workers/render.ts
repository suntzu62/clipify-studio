import { Job } from 'bullmq';
import ffmpegPath from 'ffmpeg-static';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as path from 'path';
import pino from 'pino';
import { downloadToTemp, uploadFile } from '../lib/storage';
import { buildASS, type Segment } from '../lib/ass';
import { runFFmpeg } from '../lib/ffmpeg';
import { enqueueUnique } from '../lib/bullmq';
import { QUEUES } from '../queues';
import { track } from '../lib/analytics';

const log = pino({ name: 'render' });

interface Transcript {
  language: string;
  segments: Segment[];
  text: string;
}

interface RankItem {
  id: string;
  start: number;
  end: number;
  duration?: number;
  score?: number;
}

interface ClipValidation {
  valid: boolean;
  error?: string;
  duration?: number;
  reason?: string;
}

interface RenderOptions {
  fps: number;
  font: string;
  marginV: number;
  preset: 'superfast' | 'veryfast' | 'fast';
  maxRetries: number;
  retryDelayMs: number;
}

// ============================================
// VALIDAÇÃO DE CLIPES
// ============================================

function validateClip(
  start: number,
  end: number,
  videoDuration: number,
  minDuration: number = 30,
  maxDuration: number = 120
): ClipValidation {
  // Verificar bounds
  if (start < 0 || end > videoDuration || start >= end) {
    return {
      valid: false,
      error: 'INVALID_BOUNDS',
      reason: `Start/End fora do range: [${start}, ${end}] vs duração ${videoDuration}`
    };
  }

  const duration = end - start;

  // Verificar duração mínima e máxima
  if (duration < minDuration) {
    return {
      valid: false,
      error: 'TOO_SHORT',
      reason: `Clipe muito curto: ${duration}s < ${minDuration}s`
    };
  }

  if (duration > maxDuration) {
    return {
      valid: false,
      error: 'TOO_LONG',
      reason: `Clipe muito longo: ${duration}s > ${maxDuration}s`
    };
  }

  return {
    valid: true,
    duration
  };
}

// ============================================
// FILTRAGEM E AJUSTE DE CLIPES
// ============================================

function filterAndAdjustClips(
  items: RankItem[],
  videoDuration: number,
  minDuration: number = 30,
  maxDuration: number = 120
): RankItem[] {
  const adjusted: RankItem[] = [];
  const padding = 2; // Padding em segundos para suavidade

  for (const item of items) {
    let start = item.start;
    let end = item.end;

    // Validar clip
    const validation = validateClip(start, end, videoDuration, minDuration, maxDuration);
    if (!validation.valid) {
      log.warn({ item, reason: validation.reason }, 'Skipping invalid clip');
      continue;
    }

    // Se muito longo, truncar mantendo score mais alto
    if (end - start > maxDuration) {
      const midpoint = (start + end) / 2;
      start = Math.max(0, midpoint - maxDuration / 2);
      end = Math.min(videoDuration, start + maxDuration);
      log.info({ item, adjusted: { start, end } }, 'Truncated oversized clip');
    }

    // Se muito curto, expandir um pouco
    if (end - start < minDuration + 5) {
      start = Math.max(0, start - padding);
      end = Math.min(videoDuration, end + padding);
    }

    adjusted.push({
      ...item,
      start,
      end,
      duration: end - start
    });
  }

  return adjusted;
}

// ============================================
// RENDERIZAÇÃO COM RETRY
// ============================================

async function renderClipWithRetry(
  tmpSource: string,
  transcript: Transcript,
  item: RankItem,
  outFile: string,
  thumbFile: string,
  clipDir: string,
  options: RenderOptions,
  job: Job,
  itemIndex: number,
  totalItems: number
): Promise<{ success: boolean; error?: string; duration?: number }> {
  const { fps, font, marginV, preset, maxRetries, retryDelayMs } = options;
  const { start, end, id: clipId } = item;
  const dur = Math.max(0, end - start);

  // Validar duração antes de renderizar
  const validation = validateClip(start, end, 999999, 30, 120);
  if (!validation.valid) {
    return { success: false, error: validation.error, duration: dur };
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(
        { clipId, itemIndex, totalItems, attempt, maxRetries, start, end, duration: dur },
        'RenderAttempt'
      );

      // Gerar ASS para legendas
      const tmpAss = path.join(clipDir, `${clipId}_attempt${attempt}.ass`);
      const ass = buildASS({ segments: transcript.segments, start, end, font, marginV });
      await fs.writeFile(tmpAss, ass);

      // Configurar filtros
      const vfCrop = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black`;
      const vfFitBlur =
        '[0:v]scale=1080:1920,boxblur=luma_radius=min(h\\,w)/20:luma_power=1:chroma_radius=min(h\\,w)/20:chroma_power=1[bg];' +
        '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];' +
        '[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1';
      const vfBase = process.env.RENDER_MODE === 'fit_blur' ? vfFitBlur : vfCrop;
      const fontsDir = path.resolve(process.cwd(), 'assets', 'fonts');
      const style = `fontsdir=${fontsDir}:force_style='Alignment=2,FontName=${font},FontSize=48,Outline=2,Shadow=0,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,MarginV=${marginV}'`;
      const vf = `${vfBase},subtitles=${tmpAss}:${style},fps=${fps}`;
      const af = 'loudnorm=I=-14:LRA=11:TP=-1.5';

      // FFmpeg args
      const durationMs = Math.round(dur * 1000);
      const cpuCount = require('os').cpus().length;
      const threadsPerClip = Math.max(1, Math.floor(cpuCount / Math.min(3, totalItems)));

      const args = [
        '-ss', String(start),
        '-t', String(dur),
        '-i', tmpSource,
        '-map', '0:v:0',
        '-map', '0:a:0',
        '-vf', vf,
        '-af', af,
        '-c:v', 'libx264',
        '-preset', preset,
        '-tune', 'zerolatency',
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-b:v', process.env.RENDER_VIDEO_BITRATE || '4M',
        '-maxrate', process.env.RENDER_VIDEO_MAXRATE || '6M',
        '-bufsize', process.env.RENDER_VIDEO_BUFSIZE || '8M',
        '-g', '30',
        '-keyint_min', '30',
        '-threads', String(threadsPerClip),
        '-c:a', 'aac',
        '-b:a', process.env.RENDER_AUDIO_BITRATE || '96k',
        '-ac', '2',
        '-ar', '48000',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        outFile
      ];

      // Executar FFmpeg com progresso
      const base = Math.floor((itemIndex / totalItems) * 90);
      const span = Math.ceil(90 / totalItems);

      await runFFmpeg(args, (p) => {
        const scaled = Math.min(89, base + Math.floor((p / 100) * span));
        job.updateProgress(scaled).catch(() => {});
      }, durationMs);

      // Verificar se arquivo foi criado
      const stats = await fs.stat(outFile);
      if (stats.size < 1_000_000) {
        throw new Error(`Arquivo muito pequeno: ${stats.size} bytes`);
      }

      // Gerar thumbnail
      const thumbArgs = [
        '-ss', String(Math.min(1, dur / 2)),
        '-i', outFile,
        '-frames:v', '1',
        '-q:v', '3',
        '-vf', 'scale=540:960',
        thumbFile
      ];

      await runFFmpeg(thumbArgs, undefined, 5000);

      // Verificar thumbnail
      try {
        await fs.stat(thumbFile);
      } catch {
        log.warn({ clipId }, 'Thumbnail generation failed, proceeding without');
      }

      log.info({ clipId, itemIndex, totalItems, duration: dur }, 'ClipRenderedSuccessfully');
      return { success: true, duration: dur };
    } catch (err) {
      lastError = err as Error;
      log.warn(
        { clipId, attempt, maxRetries, error: lastError.message },
        'RenderAttemptFailed'
      );

      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        log.info({ clipId, delay }, `Retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    duration: dur
  };
}


export async function runRender(job: Job): Promise<any> {
  // Prefer ffmpeg-static if available
  if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;

  const { rootId } = job.data as { rootId: string };
  const inputClip = job.data as { clipId?: string; start?: number; end?: number };
  const userId = job.data.userId || 'unknown';

  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  const tmpRoot = `/tmp/${rootId}/render`;
  const startTime = Date.now();

  log.info({ rootId, jobId: job.id }, 'RenderStarted');

  // Prevent render loops by checking if clips already exist
  let hasExistingClips = false;
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const { data: existingFiles } = await supabase.storage
        .from(bucket)
        .list(`projects/${rootId}/clips`, { limit: 1 });

      if (existingFiles && existingFiles.length > 0) {
        hasExistingClips = true;
        log.info({ rootId, jobId: job.id, existingCount: existingFiles.length }, 'ExistingClipsFound');
      }
    }
  } catch (error) {
    log.warn({ rootId, error: (error as Error).message }, 'Failed to check existing clips');
  }

  await fs.mkdir(tmpRoot, { recursive: true });

  try {
    // 1) Download inputs
    const tmpSource = path.join(tmpRoot, 'source.mp4');
    const tmpTranscript = path.join(tmpRoot, 'transcript.json');

    await downloadToTemp(bucket, `projects/${rootId}/source.mp4`, tmpSource);
    await downloadToTemp(bucket, `projects/${rootId}/transcribe/transcript.json`, tmpTranscript);

    const transcript: Transcript = JSON.parse(await fs.readFile(tmpTranscript, 'utf-8'));

    // 2) Determine which clips to render
    let items: RankItem[] = [];
    if (inputClip.clipId && typeof inputClip.start === 'number' && typeof inputClip.end === 'number') {
      items = [{ id: inputClip.clipId, start: inputClip.start, end: inputClip.end }];
    } else {
      // Try to load rank selection
      const rankPath = path.join(tmpRoot, 'rank.json');
      try {
        await downloadToTemp(bucket, `projects/${rootId}/rank/rank.json`, rankPath);
        const rankData = JSON.parse(await fs.readFile(rankPath, 'utf-8'));
        items = rankData.items || [];
      } catch (e) {
        log.warn({ rootId }, 'No rank.json found, skipping render');
        return { success: false, message: 'No rank data available' };
      }
    }

    if (!items || items.length === 0) {
      // If no clips to render and we have existing clips, just return success
      if (hasExistingClips) {
        log.info({ rootId, jobId: job.id }, 'No new clips to render, existing clips found');
        return {
          success: true,
          message: 'Render skipped - clips already exist',
          clipsGenerated: 0,
          hasExistingClips: true
        };
      }
      log.error({ rootId, items }, 'No clips to render');
      return { success: false, message: 'No clips to render' };
    }

    // If we already have clips and this isn't a specific clip render, skip
    if (hasExistingClips && !inputClip.clipId) {
      log.info({ rootId, jobId: job.id, itemsCount: items.length }, 'Skipping render - clips already exist');
      return {
        success: true,
        message: 'Render skipped - clips already exist',
        clipsGenerated: 0,
        hasExistingClips: true,
        items: items.length
      };
    }

    // 3) Filtrar e ajustar clipes
    const videoDuration = Math.max(...transcript.segments.map((s) => s.end));
    const adjustedItems = filterAndAdjustClips(items, videoDuration);

    log.info(
      { rootId, original: items.length, adjusted: adjustedItems.length, videoDuration },
      'ClipsFiltered'
    );

    if (adjustedItems.length === 0) {
      log.error({ rootId, items }, 'No valid clips after filtering');
      return { success: false, message: 'No valid clips after filtering' };
    }

    // 4) Configurar opções de render
    const fps = Number(process.env.RENDER_FPS || 30);
    const font = process.env.RENDER_FONT || 'Inter';
    const marginV = Number(process.env.RENDER_MARGIN_V || 60);
    const preset = (process.env.RENDER_PRESET || 'superfast') as 'superfast' | 'veryfast' | 'fast';
    const maxParallel = Math.min(3, adjustedItems.length);
    const maxRetries = Number(process.env.RENDER_MAX_RETRIES || 2);
    const retryDelayMs = Number(process.env.RENDER_RETRY_DELAY_MS || 1000);

    const renderOptions: RenderOptions = {
      fps,
      font,
      marginV,
      preset,
      maxRetries,
      retryDelayMs
    };

    log.info(
      { rootId, totalClips: adjustedItems.length, maxParallel, renderOptions },
      'RenderConfig'
    );

    // 5) Renderizar em paralelo com rastreamento
    const results: Array<{ clipId: string; success: boolean; error?: string; duration?: number }> = [];

    for (let i = 0; i < adjustedItems.length; i += maxParallel) {
      const batch = adjustedItems.slice(i, i + maxParallel);

      const batchPromises = batch.map(async (it, batchIndex) => {
        const itemIndex = i + batchIndex;
        const clipId = it.id;
        const clipDir = path.join(tmpRoot, clipId);

        await fs.mkdir(clipDir, { recursive: true });

        const outFile = path.join(clipDir, `${clipId}.mp4`);
        const thumbFile = path.join(clipDir, `${clipId}.jpg`);

        const result = await renderClipWithRetry(
          tmpSource,
          transcript,
          it,
          outFile,
          thumbFile,
          clipDir,
          renderOptions,
          job,
          itemIndex,
          adjustedItems.length
        );

        if (result.success) {
          try {
            // Upload files
            const mp4Key = `projects/${rootId}/clips/${clipId}.mp4`;
            const jpgKey = `projects/${rootId}/clips/${clipId}.jpg`;

            await Promise.all([
              uploadFile(bucket, mp4Key, outFile, 'video/mp4'),
              fs.stat(thumbFile)
                .then(() => uploadFile(bucket, jpgKey, thumbFile, 'image/jpeg'))
                .catch(() => log.warn({ clipId }, 'Thumbnail upload skipped'))
            ]);

            results.push({ clipId, success: true, duration: result.duration });
            log.info({ rootId, clipId, itemIndex, totalClips: adjustedItems.length }, 'ClipUploadComplete');
          } catch (uploadErr) {
            results.push({
              clipId,
              success: false,
              error: `Upload failed: ${(uploadErr as Error).message}`
            });
            log.error({ clipId, error: uploadErr }, 'ClipUploadFailed');
          }
        } else {
          results.push({ clipId, success: false, error: result.error });
          log.error({ clipId, error: result.error }, 'ClipRenderFailed');
        }
      });

      await Promise.all(batchPromises);
    }

    // 6) Relatório final
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const elapsedMs = Date.now() - startTime;

    log.info(
      {
        rootId,
        totalAttempted: adjustedItems.length,
        successful: successful.length,
        failed: failed.length,
        elapsedMs,
        avgTimePerClip: Math.round(elapsedMs / adjustedItems.length)
      },
      'RenderComplete'
    );

    // Track success
    await track(userId, 'stage_completed', {
      stage: 'render',
      duration: elapsedMs,
      clipsGenerated: successful.length,
      jobId: job.id,
      rootId
    });

    // 7) Enfileirar próximo estágio se sucesso
    if (successful.length > 0) {
      await enqueueUnique(
        QUEUES.TEXTS,
        'texts',
        `${rootId}:texts`,
        { rootId, userId }
      );
      await job.updateProgress(95);
    }

    await job.updateProgress(100);

    return {
      success: successful.length > 0,
      clipsGenerated: successful.length,
      clipsFailed: failed.length,
      results,
      elapsedMs
    };
  } catch (err) {
    const error = err as Error;
    const totalDuration = Date.now() - startTime;
    log.error(
      { rootId, jobId: job.id, error: error.message, stack: error.stack },
      'RenderFailed'
    );

    // Track failure
    await track(userId, 'render_failed', {
      jobId: job.id,
      error: error.message,
      duration: totalDuration,
      rootId
    });

    throw error;
  } finally {
    // Cleanup
    try {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      log.info({ tmpRoot }, 'TempDirCleaned');
    } catch {
      log.warn({ tmpRoot }, 'Cleanup failed');
    }
  }
}

export default runRender;
