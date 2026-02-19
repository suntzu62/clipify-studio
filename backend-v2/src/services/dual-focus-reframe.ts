/**
 * Dual-Focus Reframe Service
 *
 * Reenquadramento inteligente para vídeos com DUAS áreas importantes:
 * - Quiz/texto à esquerda
 * - Apresentadores/pessoas à direita
 * - Mantém AMBAS as regiões visíveis no formato 9:16
 * - Adiciona background blur para evitar barras pretas
 *
 * Casos de uso:
 * - Vídeos de quiz (perguntas + apresentadores)
 * - Entrevistas (texto + pessoas)
 * - Apresentações (slides + palestrante)
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';
import { detectROI, type ROI } from './roi-detector.js';

const logger = createLogger('dual-focus-reframe');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Configuração de regiões dual-focus
 */
export interface DualFocusRegions {
  // Região 1: Quiz/Texto (geralmente à esquerda)
  region1: {
    x: number; // Posição X (pixels)
    y: number; // Posição Y (pixels)
    width: number; // Largura (pixels)
    height: number; // Altura (pixels)
  };
  // Região 2: Apresentadores/Pessoas (geralmente à direita)
  region2: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DualFocusReframeOptions {
  targetAspectRatio: '9:16' | '1:1' | '4:5';
  targetResolution?: { width: number; height: number };

  // Modo de detecção
  detectionMode: 'auto' | 'manual' | 'split-screen';

  // Para modo manual: especificar regiões exatas
  customRegions?: DualFocusRegions;

  // Para modo split-screen: dividir tela horizontalmente
  splitRatio?: number; // 0.5 = 50/50, 0.4 = 40/60, etc.

  // Background blur/fill
  addBackgroundFill?: boolean;
  blurIntensity?: number; // 0-100, padrão: 20

  // Ajustes finos
  padding?: number; // Padding adicional em pixels (padrão: 0)
  zoomLevel?: number; // 1.0 = sem zoom, 1.1 = 10% zoom in, 0.9 = 10% zoom out

  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium' | 'slow';
}

export interface DualFocusReframeResult {
  outputPath: string;
  duration: number;
  detectedRegions: DualFocusRegions;
  method: 'auto' | 'manual' | 'split-screen';
}

/**
 * Detecta regiões dual-focus automaticamente
 */
async function detectDualFocusRegions(
  videoPath: string,
  videoWidth: number,
  videoHeight: number,
  targetAspectRatio: '9:16' | '1:1' | '4:5'
): Promise<DualFocusRegions> {
  logger.info('Auto-detecting dual-focus regions');

  try {
    // Detecta faces (região 2 - apresentadores)
    const faceROI = await detectROI(videoPath, {
      targetAspectRatio: '16:9', // Detect in original aspect ratio
      sampleInterval: 2,
      minConfidence: 0.3,
    });

    // Se detectou faces, assume que estão na metade direita
    // e que o quiz está na metade esquerda
    if (faceROI.roi && faceROI.detectionMethod === 'face') {
      logger.info({ faceROI: faceROI.roi }, 'Faces detected, using split-screen strategy');

      // Região 1: Metade esquerda (quiz)
      const leftWidth = Math.floor(videoWidth * 0.5);
      const region1 = {
        x: 0,
        y: 0,
        width: leftWidth,
        height: videoHeight,
      };

      // Região 2: Metade direita (apresentadores)
      const region2 = {
        x: leftWidth,
        y: 0,
        width: videoWidth - leftWidth,
        height: videoHeight,
      };

      return { region1, region2 };
    }
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Face detection failed, using fallback');
  }

  // Fallback: dividir tela 50/50
  logger.info('Using 50/50 split-screen fallback');
  const leftWidth = Math.floor(videoWidth * 0.5);

  return {
    region1: {
      x: 0,
      y: 0,
      width: leftWidth,
      height: videoHeight,
    },
    region2: {
      x: leftWidth,
      y: 0,
      width: videoWidth - leftWidth,
      height: videoHeight,
    },
  };
}

/**
 * Calcula região combinada que engloba ambas as áreas
 */
function calculateCombinedROI(
  regions: DualFocusRegions,
  videoWidth: number,
  videoHeight: number,
  targetAspectRatio: '9:16' | '1:1' | '4:5',
  zoomLevel: number = 1.0,
  padding: number = 0
): ROI {
  // Encontra os limites que englobam ambas as regiões
  const minX = Math.min(regions.region1.x, regions.region2.x);
  const minY = Math.min(regions.region1.y, regions.region2.y);
  const maxX = Math.max(
    regions.region1.x + regions.region1.width,
    regions.region2.x + regions.region2.width
  );
  const maxY = Math.max(
    regions.region1.y + regions.region1.height,
    regions.region2.y + regions.region2.height
  );

  // Região combinada
  let combinedX = minX;
  let combinedY = minY;
  let combinedWidth = maxX - minX;
  let combinedHeight = maxY - minY;

  // Adicionar padding
  if (padding > 0) {
    combinedX = Math.max(0, combinedX - padding);
    combinedY = Math.max(0, combinedY - padding);
    combinedWidth = Math.min(videoWidth - combinedX, combinedWidth + padding * 2);
    combinedHeight = Math.min(videoHeight - combinedY, combinedHeight + padding * 2);
  }

  // Ajustar para aspect ratio alvo
  const targetRatio = getAspectRatioValue(targetAspectRatio);
  const currentRatio = combinedWidth / combinedHeight;

  if (currentRatio > targetRatio) {
    // Muito largo, ajustar altura
    const targetHeight = combinedWidth / targetRatio;
    const heightDiff = targetHeight - combinedHeight;
    combinedY = Math.max(0, combinedY - heightDiff / 2);
    combinedHeight = Math.min(videoHeight - combinedY, targetHeight);
  } else {
    // Muito alto, ajustar largura
    const targetWidth = combinedHeight * targetRatio;
    const widthDiff = targetWidth - combinedWidth;
    combinedX = Math.max(0, combinedX - widthDiff / 2);
    combinedWidth = Math.min(videoWidth - combinedX, targetWidth);
  }

  // Aplicar zoom
  if (zoomLevel !== 1.0) {
    const centerX = combinedX + combinedWidth / 2;
    const centerY = combinedY + combinedHeight / 2;

    const newWidth = combinedWidth / zoomLevel;
    const newHeight = combinedHeight / zoomLevel;

    combinedX = Math.max(0, centerX - newWidth / 2);
    combinedY = Math.max(0, centerY - newHeight / 2);
    combinedWidth = Math.min(videoWidth - combinedX, newWidth);
    combinedHeight = Math.min(videoHeight - combinedY, newHeight);
  }

  return {
    x: Math.round(combinedX),
    y: Math.round(combinedY),
    width: Math.round(combinedWidth),
    height: Math.round(combinedHeight),
    confidence: 1.0,
  };
}

/**
 * Converte aspect ratio string para valor numérico
 */
function getAspectRatioValue(aspectRatio: '9:16' | '1:1' | '4:5'): number {
  switch (aspectRatio) {
    case '9:16':
      return 9 / 16;
    case '1:1':
      return 1;
    case '4:5':
      return 4 / 5;
    default:
      return 9 / 16;
  }
}

/**
 * Get default resolution for aspect ratio
 */
function getDefaultResolution(aspectRatio: '9:16' | '1:1' | '4:5'): {
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
    default:
      return { width: 1080, height: 1920 };
  }
}

/**
 * Get video metadata
 */
async function getVideoMetadata(videoPath: string): Promise<{
  width: number;
  height: number;
  duration: number;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      if (!videoStream || !videoStream.width || !videoStream.height) {
        reject(new Error('Could not find video stream metadata'));
        return;
      }

      resolve({
        width: videoStream.width,
        height: videoStream.height,
        duration: metadata.format.duration || 0,
      });
    });
  });
}

/**
 * Aplica reenquadramento dual-focus
 */
export async function applyDualFocusReframe(
  videoPath: string,
  options: DualFocusReframeOptions
): Promise<DualFocusReframeResult> {
  const {
    targetAspectRatio,
    targetResolution = getDefaultResolution(targetAspectRatio),
    detectionMode = 'split-screen',
    customRegions,
    splitRatio = 0.5,
    addBackgroundFill = true,
    blurIntensity = 20,
    padding = 0,
    zoomLevel = 1.0,
    preset = 'slow',
  } = options;

  logger.info(
    {
      videoPath,
      targetAspectRatio,
      detectionMode,
      addBackgroundFill,
    },
    'Starting dual-focus reframe'
  );

  const tempDir = join('/tmp', `dual-focus-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Get video metadata
    const metadata = await getVideoMetadata(videoPath);
    logger.info({ metadata }, 'Video metadata loaded');

    // Determinar regiões
    let regions: DualFocusRegions;
    let method: 'auto' | 'manual' | 'split-screen';

    if (detectionMode === 'manual' && customRegions) {
      regions = customRegions;
      method = 'manual';
      logger.info({ regions }, 'Using manual regions');
    } else if (detectionMode === 'split-screen') {
      const leftWidth = Math.floor(metadata.width * splitRatio);
      regions = {
        region1: {
          x: 0,
          y: 0,
          width: leftWidth,
          height: metadata.height,
        },
        region2: {
          x: leftWidth,
          y: 0,
          width: metadata.width - leftWidth,
          height: metadata.height,
        },
      };
      method = 'split-screen';
      logger.info({ regions, splitRatio }, 'Using split-screen mode');
    } else {
      // Auto detection
      regions = await detectDualFocusRegions(
        videoPath,
        metadata.width,
        metadata.height,
        targetAspectRatio
      );
      method = 'auto';
      logger.info({ regions }, 'Auto-detected regions');
    }

    // Calcular ROI combinado
    const combinedROI = calculateCombinedROI(
      regions,
      metadata.width,
      metadata.height,
      targetAspectRatio,
      zoomLevel,
      padding
    );

    logger.info({ combinedROI }, 'Combined ROI calculated');

    // Render video
    const outputPath = join(tempDir, 'reframed.mp4');
    const duration = await renderDualFocusVideo(
      videoPath,
      outputPath,
      combinedROI,
      targetResolution,
      addBackgroundFill,
      blurIntensity,
      preset
    );

    logger.info(
      { outputPath, duration },
      'Dual-focus reframe completed'
    );

    return {
      outputPath,
      duration,
      detectedRegions: regions,
      method,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Dual-focus reframe failed');
    throw new Error(`Dual-focus reframe failed: ${error.message}`);
  }
}

/**
 * Renderiza vídeo com dual-focus reframe
 */
async function renderDualFocusVideo(
  inputPath: string,
  outputPath: string,
  roi: ROI,
  targetResolution: { width: number; height: number },
  addBackgroundFill: boolean,
  blurIntensity: number,
  preset: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    const vfFilters: string[] = [];

    if (addBackgroundFill) {
      // Estratégia: Background blur/fill para evitar barras pretas
      // 1. Split input em 2 streams: [main] e [bg]
      // 2. [bg]: escala e blur
      // 3. [main]: crop e escala
      // 4. Overlay [main] sobre [bg]

      const bgBlur = Math.min(100, Math.max(5, blurIntensity));

      // Complex filter com background blur
      const complexFilter = [
        // Split input
        '[0:v]split=2[main][bg]',

        // Background: scale + blur
        `[bg]scale=${targetResolution.width}:${targetResolution.height}:force_original_aspect_ratio=increase,crop=${targetResolution.width}:${targetResolution.height},boxblur=${bgBlur}:${bgBlur}[bg_blur]`,

        // Main content: crop + scale
        `[main]crop=${roi.width}:${roi.height}:${roi.x}:${roi.y},scale=${targetResolution.width}:${targetResolution.height}:flags=lanczos[main_scaled]`,

        // Overlay main sobre background
        '[bg_blur][main_scaled]overlay=(W-w)/2:(H-h)/2',
      ].join(';');

      vfFilters.push(complexFilter);
    } else {
      // Sem background fill: crop direto + scale
      vfFilters.push(`crop=${roi.width}:${roi.height}:${roi.x}:${roi.y}`);
      vfFilters.push(
        `scale=${targetResolution.width}:${targetResolution.height}:flags=lanczos+accurate_rnd+full_chroma_int`
      );
    }

    const vf = addBackgroundFill ? vfFilters[0] : vfFilters.join(',');
    const af = 'loudnorm=I=-14:LRA=11:TP=-1.5';

    let videoDuration = 0;

    const command = ffmpeg(inputPath);

    if (addBackgroundFill) {
      command.complexFilter(vf);
    } else {
      command.outputOptions(['-vf', vf]);
    }

    command
      .outputOptions([
        '-map', addBackgroundFill ? '[v]' : '0:v:0',
        '-map', '0:a:0?',
        '-af', af,
        '-c:v', 'libx264',
        '-preset', preset,
        '-tune', 'film',
        '-threads', '8',
        '-profile:v', 'high',
        '-level', '4.2',
        '-pix_fmt', 'yuv420p',
        '-crf', '16',
        '-b:v', '12M',
        '-maxrate', '15M',
        '-bufsize', '20M',
        '-g', '60',
        '-keyint_min', '30',
        '-refs', '5',
        '-bf', '3',
        '-x264-params', 'aq-mode=3:aq-strength=0.8',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-ar', '48000',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('codecData', (data) => {
        const durationMatch = data.duration?.match(/(\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1], 10);
          const minutes = parseInt(durationMatch[2], 10);
          const seconds = parseFloat(durationMatch[3]);
          videoDuration = hours * 3600 + minutes * 60 + seconds;
        }
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          logger.debug(
            { percent: progress.percent.toFixed(1) },
            'Rendering progress'
          );
        }
      })
      .on('end', () => {
        logger.info({ outputPath }, 'Dual-focus video rendered successfully');
        resolve(videoDuration);
      })
      .on('error', (err) => {
        logger.error({ error: err.message }, 'FFmpeg rendering failed');
        reject(err);
      })
      .run();
  });
}

/**
 * Cleanup: remove output directory
 */
export async function cleanupDualFocusDir(outputPath: string): Promise<void> {
  try {
    const outputDir = join(outputPath, '..');
    await fs.rm(outputDir, { recursive: true, force: true });
    logger.info({ outputDir }, 'Dual-focus directory cleaned up');
  } catch (error: any) {
    logger.warn({ error: error.message, outputPath }, 'Cleanup failed');
  }
}
