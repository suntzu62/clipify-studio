/**
 * Viral Clip Generator Service
 *
 * Gera automaticamente clips virais a partir de highlights detectados:
 * - Extrai segmentos do vídeo
 * - Aplica reenquadramento inteligente (opcional)
 * - Adiciona margem antes/depois para contexto
 * - Exporta clips prontos para publicação
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';
import type { Highlight } from './highlight-detector.js';
import { applyIntelligentReframe } from './intelligent-reframe.js';
import { applyDualFocusReframe, type DualFocusReframeOptions, type DualFocusRegions } from './dual-focus-reframe.js';
import { applyStackedLayoutReframe, type StackedLayoutOptions } from './stacked-layout-reframe.js';

const logger = createLogger('viral-clip-generator');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Opções de geração de clips
 */
export interface ClipGenerationOptions {
  targetAspectRatio?: '9:16' | '1:1' | '4:5' | '16:9';
  applyReframe?: boolean; // Aplicar reenquadramento inteligente

  // Modo de reenquadramento
  reframeMode?: 'auto' | 'single-focus' | 'dual-focus' | 'stacked'; // auto = decide por contagem de pessoas; stacked = split vertical top/bottom

  // Opções para dual-focus (vídeos de quiz, entrevistas, etc.)
  dualFocusOptions?: {
    detectionMode?: 'auto' | 'manual' | 'split-screen'; // Padrão: split-screen
    customRegions?: DualFocusRegions; // Para modo manual
    splitRatio?: number; // Para split-screen: 0.5 = 50/50
    addBackgroundFill?: boolean; // Blur background para evitar barras pretas
    blurIntensity?: number; // 0-100
    padding?: number; // Padding adicional em pixels
    zoomLevel?: number; // 1.0 = sem zoom
  };

  // Opções para stacked layout
  stackedLayoutOptions?: StackedLayoutOptions;

  addMargins?: boolean; // Adicionar margem antes/depois
  marginBefore?: number; // Segundos antes do highlight (padrão: 1s)
  marginAfter?: number; // Segundos depois do highlight (padrão: 1s)
  minClipDuration?: number; // Duração mínima de clip (padrão: 3s)
  maxClipDuration?: number; // Duração máxima de clip (padrão: 60s)
  outputFormat?: 'mp4' | 'webm';
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  addSubtitles?: boolean; // Adicionar legendas (futuro)
  addWatermark?: boolean; // Adicionar marca d'água (futuro)
}

/**
 * Clip viral gerado
 */
export interface ViralClip {
  clipId: string;
  outputPath: string;
  highlight: Highlight;
  startTime: number; // Tempo de início no vídeo original
  endTime: number; // Tempo de fim no vídeo original
  duration: number;
  viralScore: number;
  metadata: {
    tags: string[];
    reasons: string[];
    confidence: number;
    reframed: boolean;
  };
}

/**
 * Resultado da geração de clips
 */
export interface ClipGenerationResult {
  clips: ViralClip[];
  outputDir: string;
  stats: {
    totalClips: number;
    totalDuration: number;
    averageViralScore: number;
    reframedClips: number;
  };
}

/**
 * Extrai clip de vídeo sem reenquadramento
 */
async function extractClip(
  videoPath: string,
  outputPath: string,
  startTime: number,
  duration: number,
  quality: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const qualitySettings = {
      low: { crf: 28, preset: 'ultrafast' },
      medium: { crf: 23, preset: 'fast' },
      high: { crf: 18, preset: 'medium' },
      ultra: { crf: 16, preset: 'slow' },
    };

    const settings = qualitySettings[quality as keyof typeof qualitySettings];

    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .outputOptions([
        '-c:v',
        'libx264',
        '-preset',
        settings.preset,
        '-crf',
        String(settings.crf),
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Calcula tempos de início/fim com margens
 */
function calculateClipBounds(
  highlight: Highlight,
  videoDuration: number,
  options: ClipGenerationOptions
): { startTime: number; endTime: number; duration: number } {
  const {
    addMargins = true,
    marginBefore = 1,
    marginAfter = 1,
    minClipDuration = 3,
    maxClipDuration = 60,
  } = options;

  let startTime = highlight.timestamp;
  let endTime = highlight.timestamp + highlight.duration;

  // Add margins
  if (addMargins) {
    startTime = Math.max(0, startTime - marginBefore);
    endTime = Math.min(videoDuration, endTime + marginAfter);
  }

  // Ensure min/max duration
  let duration = endTime - startTime;

  if (duration < minClipDuration) {
    const needed = minClipDuration - duration;
    startTime = Math.max(0, startTime - needed / 2);
    endTime = Math.min(videoDuration, endTime + needed / 2);
    duration = endTime - startTime;
  }

  if (duration > maxClipDuration) {
    duration = maxClipDuration;
    endTime = startTime + duration;
  }

  return { startTime, endTime, duration };
}

/**
 * Gera um único clip viral
 */
async function generateSingleClip(
  videoPath: string,
  highlight: Highlight,
  outputDir: string,
  clipIndex: number,
  videoDuration: number,
  options: ClipGenerationOptions
): Promise<ViralClip> {
  const {
    applyReframe = false,
    reframeMode = 'single-focus',
    targetAspectRatio = '9:16',
    quality = 'high',
    dualFocusOptions = {},
    stackedLayoutOptions = {},
  } = options;

  const clipId = `clip-${clipIndex + 1}-score-${Math.round(highlight.viralScore)}`;
  const bounds = calculateClipBounds(highlight, videoDuration, options);

  logger.info(
    {
      clipId,
      startTime: bounds.startTime.toFixed(1),
      duration: bounds.duration.toFixed(1),
      viralScore: highlight.viralScore.toFixed(0),
      reframeMode,
    },
    'Generating clip'
  );

  // Extract clip first
  const tempClipPath = join(outputDir, `temp-${clipId}.mp4`);
  await extractClip(
    videoPath,
    tempClipPath,
    bounds.startTime,
    bounds.duration,
    quality
  );

  let finalPath = tempClipPath;
  let reframed = false;

  // Apply reframing if requested
  if (applyReframe) {
    try {
      if (reframeMode === 'dual-focus') {
        // Dual-focus reframe (quiz + apresentadores)
        logger.info({ clipId }, 'Applying dual-focus reframe');

        const dualFocusReframeOptions: DualFocusReframeOptions = {
          targetAspectRatio: targetAspectRatio as '9:16' | '1:1' | '4:5',
          targetResolution: getDefaultResolution(targetAspectRatio),
          detectionMode: dualFocusOptions.detectionMode || 'split-screen',
          customRegions: dualFocusOptions.customRegions,
          splitRatio: dualFocusOptions.splitRatio || 0.5,
          addBackgroundFill: dualFocusOptions.addBackgroundFill !== false, // Default: true
          blurIntensity: dualFocusOptions.blurIntensity || 20,
          padding: dualFocusOptions.padding || 0,
          zoomLevel: dualFocusOptions.zoomLevel || 1.0,
          preset: 'fast',
        };

        const reframeResult = await applyDualFocusReframe(tempClipPath, dualFocusReframeOptions);

        finalPath = reframeResult.outputPath;
        reframed = true;

        logger.info(
          {
            clipId,
            method: reframeResult.method,
            regions: reframeResult.detectedRegions
          },
          'Dual-focus reframe applied'
        );
      } else if (reframeMode === 'stacked') {
        // Stacked layout: divide em dois blocos (topo + base) para manter tela e rosto visíveis
        logger.info({ clipId }, 'Applying stacked layout reframe');

        const stackedOptions: StackedLayoutOptions = {
          targetResolution: getDefaultResolution(targetAspectRatio),
          topRatio: stackedLayoutOptions?.topRatio ?? 0.6,
          facePadding: stackedLayoutOptions?.facePadding ?? 80,
          slideWidthRatio: stackedLayoutOptions?.slideWidthRatio ?? 0.58,
          preset: stackedLayoutOptions?.preset ?? 'fast',
        };

        const reframeResult = await applyStackedLayoutReframe(tempClipPath, stackedOptions);

        finalPath = reframeResult.outputPath;
        reframed = true;

        logger.info(
          {
            clipId,
            layout: reframeResult.layout,
          },
          'Stacked layout applied'
        );
      } else {
        // Single-focus reframe (faces apenas)
        logger.info({ clipId }, 'Applying single-focus reframe');

        const reframeResult = await applyIntelligentReframe(tempClipPath, {
          targetAspectRatio,
          targetResolution: getDefaultResolution(targetAspectRatio),
          sampleInterval: 2,
          minConfidence: 0.5,
          preset: 'fast',
        });

        finalPath = reframeResult.outputPath;
        reframed = true;
      }

      // Clean up temp file
      await fs.unlink(tempClipPath);
    } catch (error: any) {
      logger.warn(
        { clipId, error: error.message },
        'Reframing failed, using original'
      );
      finalPath = tempClipPath;
    }
  }

  // Rename to final name
  const outputPath = join(outputDir, `${clipId}.mp4`);
  await fs.rename(finalPath, outputPath);

  return {
    clipId,
    outputPath,
    highlight,
    startTime: bounds.startTime,
    endTime: bounds.endTime,
    duration: bounds.duration,
    viralScore: highlight.viralScore,
    metadata: {
      tags: highlight.tags,
      reasons: highlight.reasons,
      confidence: highlight.confidence,
      reframed,
    },
  };
}

/**
 * Get default resolution for aspect ratio
 */
function getDefaultResolution(aspectRatio: '9:16' | '1:1' | '4:5' | '16:9'): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '16:9':
    default:
      return { width: 1920, height: 1080 };
  }
}

/**
 * Get video duration
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Gera clips virais a partir de highlights
 */
export async function generateViralClips(
  videoPath: string,
  highlights: Highlight[],
  options: ClipGenerationOptions = {}
): Promise<ClipGenerationResult> {
  logger.info(
    { videoPath, highlights: highlights.length },
    'Starting viral clip generation'
  );

  const outputDir = join('/tmp', `viral-clips-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  try {
    const videoDuration = await getVideoDuration(videoPath);
    const clips: ViralClip[] = [];

    // Generate each clip
    for (let i = 0; i < highlights.length; i++) {
      const highlight = highlights[i];

      try {
        const clip = await generateSingleClip(
          videoPath,
          highlight,
          outputDir,
          i,
          videoDuration,
          options
        );

        clips.push(clip);

        logger.info(
          { clipId: clip.clipId, progress: `${i + 1}/${highlights.length}` },
          'Clip generated'
        );
      } catch (error: any) {
        logger.error(
          { error: error.message, highlight: i },
          'Failed to generate clip'
        );
      }
    }

    // Calculate stats
    const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
    const averageViralScore =
      clips.length > 0
        ? clips.reduce((sum, c) => sum + c.viralScore, 0) / clips.length
        : 0;
    const reframedClips = clips.filter((c) => c.metadata.reframed).length;

    logger.info(
      {
        totalClips: clips.length,
        totalDuration: totalDuration.toFixed(1) + 's',
        avgScore: averageViralScore.toFixed(0),
        reframedClips,
      },
      'Viral clip generation completed'
    );

    return {
      clips,
      outputDir,
      stats: {
        totalClips: clips.length,
        totalDuration,
        averageViralScore,
        reframedClips,
      },
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Viral clip generation failed');
    throw new Error(`Viral clip generation failed: ${error.message}`);
  }
}

/**
 * Exporta metadados dos clips (JSON)
 */
export async function exportClipMetadata(
  clips: ViralClip[],
  outputPath: string
): Promise<void> {
  const metadata = clips.map((clip) => ({
    clipId: clip.clipId,
    outputPath: clip.outputPath,
    startTime: clip.startTime,
    endTime: clip.endTime,
    duration: clip.duration,
    viralScore: clip.viralScore,
    tags: clip.metadata.tags,
    reasons: clip.metadata.reasons,
    confidence: clip.metadata.confidence,
    reframed: clip.metadata.reframed,
  }));

  await fs.writeFile(outputPath, JSON.stringify(metadata, null, 2), 'utf8');

  logger.info({ outputPath, clips: clips.length }, 'Metadata exported');
}
