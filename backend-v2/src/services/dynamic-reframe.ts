/**
 * Dynamic Reframe Service - Fase 2
 *
 * Gera filtros FFmpeg dinâmicos para pan/zoom que seguem
 * a trajetória do ROI ao longo do tempo.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';
import {
  trackROIOverTime,
  generateZoompanFilter,
  exportTrajectoryToJSON,
  generateTrajectoryPreview,
  type ROITrajectory,
  type TemporalTrackingOptions,
} from './temporal-tracking.js';

const logger = createLogger('dynamic-reframe');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface DynamicReframeOptions {
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9';
  targetResolution?: { width: number; height: number };
  trackingInterval?: number; // Análise a cada N segundos (padrão: 0.5s)
  smoothingWindow?: number; // Janela de suavização (padrão: 5 frames)
  minConfidence?: number;
  adaptiveTracking?: boolean;
  enableMotion?: boolean;
  motionSampleOffset?: number;
  exportTrajectory?: boolean; // Exportar trajetória como JSON
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium' | 'slow';
}

export interface DynamicReframeResult {
  outputPath: string;
  duration: number;
  trajectory: ROITrajectory;
  trajectoryPath?: string;
  stats: {
    totalKeyframes: number;
    faceDetectionRate: number; // % de frames com faces detectadas
    averageConfidence: number;
    movementChanges: number;
  };
}

/**
 * Aplica reenquadramento dinâmico com tracking temporal
 */
export async function applyDynamicReframe(
  videoPath: string,
  options: DynamicReframeOptions
): Promise<DynamicReframeResult> {
  const {
    targetAspectRatio,
    targetResolution = getDefaultResolution(targetAspectRatio),
    trackingInterval = 0.5,
    smoothingWindow = 5,
    minConfidence = 0.5,
    adaptiveTracking = true,
    enableMotion = true,
    motionSampleOffset,
    exportTrajectory = true,
    preset = 'slow',
  } = options;

  logger.info(
    { videoPath, targetAspectRatio, trackingInterval },
    'Starting dynamic reframe with temporal tracking'
  );

  const tempDir = join('/tmp', `dynamic-reframe-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Step 1: Track ROI over time
    logger.info('Step 1/3: Tracking ROI over time');
    const trajectory = await trackROIOverTime(videoPath, {
      targetAspectRatio,
      trackingInterval,
      smoothingWindow,
      minConfidence,
      adaptiveTracking,
      enableMotion,
      motionSampleOffset,
    });

    // Log trajectory preview
    const preview = generateTrajectoryPreview(trajectory);
    logger.info(preview);

    // Step 2: Export trajectory (optional)
    let trajectoryPath: string | undefined;
    if (exportTrajectory) {
      trajectoryPath = join(tempDir, 'trajectory.json');
      await exportTrajectoryToJSON(trajectory, trajectoryPath);
    }

    // Step 3: Render with dynamic filters
    logger.info('Step 2/3: Rendering with dynamic pan/zoom');
    const outputPath = join(tempDir, 'reframed.mp4');

    const duration = await renderWithDynamicReframe(
      videoPath,
      outputPath,
      trajectory,
      targetResolution,
      preset
    );

    // Calculate stats
    const faceDetections = trajectory.keyframes.filter(
      (kf) => kf.detectionMethod === 'face'
    ).length;
    const faceDetectionRate = (faceDetections / trajectory.keyframes.length) * 100;
    const averageConfidence =
      trajectory.keyframes.reduce((sum, kf) => sum + kf.roi.confidence, 0) /
      trajectory.keyframes.length;
    const movementThresholdX = trajectory.videoMetadata.width * 0.05;
    const movementThresholdY = trajectory.videoMetadata.height * 0.05;
    let movementChanges = 0;
    for (let i = 1; i < trajectory.keyframes.length; i++) {
      const prev = trajectory.keyframes[i - 1].roi;
      const curr = trajectory.keyframes[i].roi;
      const prevCenterX = prev.x + prev.width / 2;
      const prevCenterY = prev.y + prev.height / 2;
      const currCenterX = curr.x + curr.width / 2;
      const currCenterY = curr.y + curr.height / 2;
      if (
        Math.abs(currCenterX - prevCenterX) > movementThresholdX ||
        Math.abs(currCenterY - prevCenterY) > movementThresholdY
      ) {
        movementChanges++;
      }
    }

    logger.info(
      {
        outputPath,
        duration,
        faceDetectionRate: faceDetectionRate.toFixed(1) + '%',
        averageConfidence: averageConfidence.toFixed(2),
      },
      'Dynamic reframe completed'
    );

    return {
      outputPath,
      duration,
      trajectory,
      trajectoryPath,
      stats: {
        totalKeyframes: trajectory.keyframes.length,
        faceDetectionRate,
        averageConfidence,
        movementChanges,
      },
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Dynamic reframe failed');
    throw new Error(`Dynamic reframe failed: ${error.message}`);
  }
}

/**
 * Renderiza vídeo com filtros dinâmicos
 */
async function renderWithDynamicReframe(
  inputPath: string,
  outputPath: string,
  trajectory: ROITrajectory,
  targetResolution: { width: number; height: number },
  preset: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Generate zoompan filter
    const videoFilter = generateZoompanFilter(trajectory, targetResolution);

    logger.info({ videoFilter }, 'Using video filter');

    // Audio normalization
    const audioFilter = 'loudnorm=I=-14:LRA=11:TP=-1.5';

    let videoDuration = 0;

    ffmpeg(inputPath)
      .outputOptions([
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-vf',
        videoFilter,
        '-af',
        audioFilter,
        '-c:v',
        'libx264',
        '-preset',
        preset,
        '-tune',
        'film',
        '-threads',
        '8',
        '-profile:v',
        'high',
        '-level',
        '4.2',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '16',
        '-b:v',
        '12M',
        '-maxrate',
        '15M',
        '-bufsize',
        '20M',
        '-g',
        '60',
        '-keyint_min',
        '30',
        '-refs',
        '5',
        '-bf',
        '3',
        '-x264-params',
        'aq-mode=3:aq-strength=0.8',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ac',
        '2',
        '-ar',
        '48000',
        '-movflags',
        '+faststart',
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
          logger.debug({ percent: progress.percent.toFixed(1) }, 'Rendering progress');
        }
      })
      .on('end', () => {
        logger.info({ outputPath }, 'Dynamic reframe rendered successfully');
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
 * Cleanup: remove reframe output directory
 */
export async function cleanupDynamicReframeDir(outputPath: string): Promise<void> {
  try {
    const outputDir = join(outputPath, '..');
    await fs.rm(outputDir, { recursive: true, force: true });
    logger.info({ outputDir }, 'Dynamic reframe directory cleaned up');
  } catch (error: any) {
    logger.warn({ error: error.message, outputPath }, 'Cleanup failed');
  }
}
