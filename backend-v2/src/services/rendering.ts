import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import type { HighlightSegment, Transcript, Clip, SubtitlePreferences } from '../types/index.js';
import { DEFAULT_SUBTITLE_PREFERENCES } from '../types/index.js';
import { generateASS, adjustFontSize } from '../utils/subtitle-optimizer.js';
import { detectFacesInClip, calculateSmartCropX, getVideoDimensions } from './face-detection.js';

const logger = createLogger('rendering');

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

interface RenderOptions {
  format?: '9:16' | '16:9' | '1:1'; // Aspect ratio
  resolution?: { width: number; height: number };
  addSubtitles?: boolean;
  font?: string;
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium';
  subtitlePreferences?: SubtitlePreferences;
  onProgress?: (progress: number, message: string) => Promise<void>; // Progress callback
}

interface RenderResult {
  clips: RenderedClip[];
  outputDir: string;
}

interface RenderedClip {
  id: string;
  videoPath: string;
  thumbnailPath: string;
  duration: number;
  segment: HighlightSegment;
}

type RenderClipOptions = {
  clipIndex: number;
  totalClips: number;
  format: NonNullable<RenderOptions['format']>;
  resolution: NonNullable<RenderOptions['resolution']>;
  addSubtitles: NonNullable<RenderOptions['addSubtitles']>;
  font: NonNullable<RenderOptions['font']>;
  preset: NonNullable<RenderOptions['preset']>;
  subtitlePreferences: SubtitlePreferences;
  onProgress?: RenderOptions['onProgress'];
};

const PRESET_PROFILE = {
  ultrafast: { crf: '22', videoBitrate: '5M', maxrate: '6M', bufsize: '10M' },
  superfast: { crf: '21', videoBitrate: '6M', maxrate: '8M', bufsize: '12M' },
  veryfast: { crf: '20', videoBitrate: '7M', maxrate: '9M', bufsize: '14M' },
  fast: { crf: '19', videoBitrate: '8M', maxrate: '10M', bufsize: '16M' },
  medium: { crf: '18', videoBitrate: '10M', maxrate: '12M', bufsize: '20M' },
} as const;

/**
 * Renderiza múltiplos clipes a partir dos highlights
 */
export async function renderClips(
  videoPath: string,
  segments: HighlightSegment[],
  transcript: Transcript,
  options: RenderOptions = {}
): Promise<RenderResult> {
  const {
    format = '9:16',
    resolution = getResolutionForFormat(format),
    addSubtitles = true,
    font = 'Inter',
    preset = 'ultrafast',
    subtitlePreferences = DEFAULT_SUBTITLE_PREFERENCES,
    onProgress,
  } = options;

  logger.info(
    {
      videoPath,
      segmentCount: segments.length,
      format,
      resolution,
      addSubtitles
    },
    'Starting clip rendering'
  );

  const outputDir = join('/tmp', `render-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  const renderedClips: RenderedClip[] = [];

  try {
    // Keep concurrency conservative; shared instances can stall BullMQ lock renewal.
    const concurrency = Math.max(1, env.render.batchConcurrency);
    logger.info({ totalClips: segments.length, concurrency }, 'Rendering clips with controlled concurrency');

    for (let i = 0; i < segments.length; i += concurrency) {
      const batch = segments.slice(i, Math.min(i + concurrency, segments.length));

      // Report progress: 65% to 75% range for rendering step
      const renderProgress = 65 + Math.floor((10 * i) / segments.length);
      const clipsRendered = i;
      const totalClips = segments.length;

      if (onProgress) {
        await onProgress(
          renderProgress,
          `Renderizando clipe ${clipsRendered + 1} de ${totalClips}...`
        );
      }

      // Render batch in parallel
      const batchResults = await Promise.all(
        batch.map((segment, batchIdx) =>
          renderSingleClip(
            videoPath,
            segment,
            transcript,
            outputDir,
            `clip-${i + batchIdx}`,
            {
              clipIndex: i + batchIdx,
              totalClips: segments.length,
              resolution,
              format,
              addSubtitles,
              font,
              preset,
              subtitlePreferences,
              onProgress,
            }
          )
        )
      );

      renderedClips.push(...batchResults);
    }

    logger.info(
      { renderedCount: renderedClips.length, outputDir },
      'Clip rendering completed'
    );

    return { clips: renderedClips, outputDir };
  } catch (error: any) {
    logger.error({ error: error.message, outputDir }, 'Clip rendering failed');
    throw new Error(`Rendering failed: ${error.message}`);
  }
}

/**
 * Renderiza um único clipe
 */
async function renderSingleClip(
  videoPath: string,
  segment: HighlightSegment,
  transcript: Transcript,
  outputDir: string,
  clipId: string,
  options: RenderClipOptions
): Promise<RenderedClip> {
  const { start, end } = segment;
  const duration = end - start;

  const videoOutputPath = join(outputDir, `${clipId}.mp4`);
  const thumbnailOutputPath = join(outputDir, `${clipId}.jpg`);
  const encodeProfile = PRESET_PROFILE[options.preset] || PRESET_PROFILE.ultrafast;

  logger.info({ clipId, start, end, duration }, 'Rendering clip');

  try {
    // Build FFmpeg filters
    const { width, height } = options.resolution;
    const vfFilters: string[] = [];

    // Crop and scale to target aspect ratio
    // QUALIDADE MÁXIMA: Usa Lanczos com parâmetros otimizados (preserva nitidez)
    const scaleParams = 'flags=lanczos+accurate_rnd+full_chroma_int+full_chroma_inp';

    if (options.format === '9:16') {
      // Vertical format (1080x1920) - Smart face-based cropping
      // 1. Detect faces to find optimal crop X position
      // 2. CROP at that position (or center if no face)
      // 3. SCALE to target resolution
      let cropX = '(iw-ih*9/16)/2'; // default: center crop

      if (env.render.smartCrop) {
        try {
          const dims = await getVideoDimensions(videoPath);
          const faces = await detectFacesInClip(videoPath, start, end, 3);
          const cropOffset = calculateSmartCropX(faces, dims.width, dims.height, 9 / 16);

          if (!cropOffset.fallback) {
            cropX = cropOffset.x.toString();
            logger.info({ clipId, cropX, faceCount: faces.length }, 'Using face-based smart crop');
          } else {
            logger.info({ clipId }, 'No faces detected, using center crop');
          }
        } catch (error: any) {
          logger.warn({ clipId, error: error.message }, 'Face detection failed, using center crop fallback');
        }
      } else {
        logger.info({ clipId }, 'Smart crop disabled, using center crop');
      }

      vfFilters.push(
        `crop=ih*9/16:ih:${cropX}:0`,
        `scale=${width}:${height}:${scaleParams}`
      );
    } else if (options.format === '1:1') {
      // Square format - crop menor dimensão, depois scale
      vfFilters.push(
        `crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2`,
        `scale=${width}:${height}:${scaleParams}`
      );
    } else {
      // Keep original 16:9 - apenas scale se necessário
      vfFilters.push(`scale=${width}:${height}:${scaleParams}`);
    }

    // Add subtitles if requested
    if (options.addSubtitles) {
      const subtitlePrefs = options.subtitlePreferences || DEFAULT_SUBTITLE_PREFERENCES;
      const subtitlesFilter = await buildSubtitlesFilter(
        transcript,
        start,
        end,
        outputDir,
        clipId,
        subtitlePrefs
      );
      if (subtitlesFilter) {
        vfFilters.push(subtitlesFilter);
      }
    }

    // NÃO forçar FPS - preservar o framerate original do vídeo
    // Se precisar limitar, use: vfFilters.push('fps=fps=source_fps');

    const vf = vfFilters.join(',');

    // Audio normalization
    const af = 'loudnorm=I=-14:LRA=11:TP=-1.5';

    // Render video
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(start)
        .setDuration(duration)
        .outputOptions([
          '-map', '0:v:0',
          '-map', '0:a:0',
          '-vf', vf,
          '-af', af,
          '-c:v', 'libx264',
          '-preset', options.preset,
          '-threads', String(Math.max(1, env.render.ffmpegThreads)),
          '-profile:v', 'high',
          '-level', '4.2',
          '-pix_fmt', 'yuv420p',
          '-crf', encodeProfile.crf,
          '-b:v', encodeProfile.videoBitrate,
          '-maxrate', encodeProfile.maxrate,
          '-bufsize', encodeProfile.bufsize,
          '-g', '60',
          '-keyint_min', '30',
          '-c:a', 'aac',
          '-b:a', '160k',
          '-ac', '2',
          '-ar', '48000',
          '-movflags', '+faststart',
        ])
        .output(videoOutputPath)
        .on('progress', async (progress) => {
          if (!options.onProgress) {
            return;
          }

          const elapsedSeconds = parseTimemarkToSeconds(progress.timemark);
          const clipFraction = duration > 0 ? Math.min(1, elapsedSeconds / duration) : 0;
          const overallProgress = 65 + Math.floor(
            (10 * (options.clipIndex + clipFraction)) / Math.max(1, options.totalClips)
          );

          await options.onProgress(
            Math.min(74, overallProgress),
            `Renderizando clipe ${options.clipIndex + 1} de ${options.totalClips}...`
          );
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // Generate thumbnail
    await generateThumbnail(videoOutputPath, thumbnailOutputPath, duration);

    logger.info({ clipId, videoOutputPath }, 'Clip rendered successfully');

    return {
      id: clipId,
      videoPath: videoOutputPath,
      thumbnailPath: thumbnailOutputPath,
      duration,
      segment,
    };
  } catch (error: any) {
    logger.error({ clipId, error: error.message }, 'Clip rendering failed');
    throw error;
  }
}

/**
 * Constrói filtro de legendas para FFmpeg
 */
export async function buildSubtitlesFilter(
  transcript: Transcript,
  start: number,
  end: number,
  outputDir: string,
  clipId: string,
  subtitlePreferences: SubtitlePreferences
): Promise<string | null> {
  // Get relevant segments for this clip
  const clipSegments = transcript.segments.filter(
    (seg) => seg.start < end && seg.end > start
  );

  if (clipSegments.length === 0) {
    return null;
  }

  // Adjust font size based on content and duration
  const totalText = clipSegments.map((s) => s.text).join(' ');
  const duration = end - start;
  const adjustedFontSize = adjustFontSize(totalText, duration, subtitlePreferences.fontSize);

  const adjustedPreferences = {
    ...subtitlePreferences,
    fontSize: adjustedFontSize,
  };

  // Generate ASS file with custom styling
  const assPath = join(outputDir, `${clipId}.ass`);
  const assContent = generateASS(clipSegments, start, adjustedPreferences);

  await fs.writeFile(assPath, assContent);

  // Escape path for FFmpeg
  const escapedPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  // Use ASS filter (no force_style needed, all styling is in the ASS file)
  return `ass=${escapedPath}`;
}

/**
 * Gera conteúdo SRT a partir dos segmentos
 */
function generateSRT(segments: any[], startOffset: number): string {
  return segments
    .map((seg, idx) => {
      const start = Math.max(0, seg.start - startOffset);
      const end = Math.max(0, seg.end - startOffset);

      return [
        idx + 1,
        `${formatSRTTime(start)} --> ${formatSRTTime(end)}`,
        seg.text.trim(),
        '',
      ].join('\n');
    })
    .join('\n');
}

/**
 * Formata tempo para SRT (HH:MM:SS,mmm)
 */
function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function parseTimemarkToSeconds(timemark?: string): number {
  if (!timemark) {
    return 0;
  }

  const [hh = '0', mm = '0', ss = '0'] = timemark.split(':');
  return (Number(hh) * 3600) + (Number(mm) * 60) + Number(ss.replace(',', '.'));
}

/**
 * Gera thumbnail do clipe
 */
function generateThumbnail(
  videoPath: string,
  thumbnailPath: string,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timestamp = Math.min(2, duration / 2);

    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .outputOptions(['-q:v', '3'])
      .output(thumbnailPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Obtém resolução baseada no formato
 * Usa resoluções MENORES para evitar upscale excessivo e preservar qualidade
 */
export function getResolutionForFormat(format: '9:16' | '16:9' | '1:1'): { width: number; height: number } {
  switch (format) {
    case '9:16':
      // 1080x1920 para MÁXIMA QUALIDADE
      // Vídeo 1920x1080 -> crop 608x1080 -> scale para 1080x1920 (1.78x upscale)
      // Qualidade superior, arquivo maior mas vale a pena
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
    default:
      return { width: 1920, height: 1080 };
  }
}

/**
 * Cleanup: remove diretório de renderização
 */
export async function cleanupRenderDir(outputDir: string): Promise<void> {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
    logger.info({ outputDir }, 'Render directory cleaned up');
  } catch (error: any) {
    logger.warn({ error: error.message, outputDir }, 'Render directory cleanup failed');
  }
}
