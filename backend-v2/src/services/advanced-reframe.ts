/**
 * Advanced Reframe Service - Fase 3
 *
 * Integra todos os recursos avançados:
 * - Múltiplas pessoas
 * - Priorização inteligente
 * - Zoom automático
 * - Heat map de importância
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';
import {
  advancedTracking,
  type AdvancedTrackingOptions,
  type AdvancedTrackingResult,
} from './advanced-tracking.js';
import { generateZoompanFilter } from './temporal-tracking.js';

const logger = createLogger('advanced-reframe');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface AdvancedReframeOptions {
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9';
  targetResolution?: { width: number; height: number };
  trackingInterval?: number;
  minConfidence?: number;
  // Advanced features
  detectMultiplePeople?: boolean;
  prioritizeSpeaker?: boolean;
  autoZoom?: boolean;
  zoomIntensity?: number; // 0.0 - 1.0
  smoothTransitions?: boolean;
  exportAnalytics?: boolean; // Export JSON with all analytics
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium' | 'slow';
}

export interface AdvancedReframeResult {
  outputPath: string;
  duration: number;
  trackingResult: AdvancedTrackingResult;
  analyticsPath?: string;
  stats: {
    totalKeyframes: number;
    peopleDetected: number;
    avgPeoplePerFrame: number;
    speechActivity: number;
    keyMomentsDetected: number;
    zoomEventsApplied: number;
  };
}

/**
 * Aplica reenquadramento avançado com todos os recursos da Fase 3
 */
export async function applyAdvancedReframe(
  videoPath: string,
  options: AdvancedReframeOptions
): Promise<AdvancedReframeResult> {
  const {
    targetAspectRatio,
    targetResolution = getDefaultResolution(targetAspectRatio),
    trackingInterval = 0.5,
    minConfidence = 0.5,
    detectMultiplePeople = false,
    prioritizeSpeaker = false,
    autoZoom = false,
    zoomIntensity = 0.5,
    smoothTransitions = true,
    exportAnalytics = true,
    preset = 'slow',
  } = options;

  logger.info(
    {
      videoPath,
      targetAspectRatio,
      detectMultiplePeople,
      prioritizeSpeaker,
      autoZoom,
    },
    'Starting advanced reframe (Fase 3)'
  );

  const tempDir = join('/tmp', `advanced-reframe-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Step 1: Advanced tracking
    logger.info('Step 1/3: Advanced tracking with AI');
    const trackingResult = await advancedTracking(videoPath, {
      targetAspectRatio,
      trackingInterval,
      minConfidence,
      detectMultiplePeople,
      prioritizeSpeaker,
      autoZoom,
      zoomIntensity,
      smoothTransitions,
    });

    logger.info(
      {
        keyframes: trackingResult.trajectory.keyframes.length,
        people: trackingResult.stats.totalPeopleDetected,
        keyMoments: trackingResult.keyMoments.length,
      },
      'Tracking completed'
    );

    // Step 2: Export analytics (optional)
    let analyticsPath: string | undefined;
    if (exportAnalytics) {
      analyticsPath = join(tempDir, 'analytics.json');
      await exportAnalyticsToJSON(trackingResult, analyticsPath);
      logger.info({ analyticsPath }, 'Analytics exported');
    }

    // Step 3: Render with advanced filters
    logger.info('Step 2/3: Rendering with advanced filters');
    const outputPath = join(tempDir, 'reframed.mp4');

    const duration = await renderAdvancedReframe(
      videoPath,
      outputPath,
      trackingResult,
      targetResolution,
      preset
    );

    // Count zoom events
    const zoomEvents = trackingResult.keyMoments.filter(
      (m) => m.type === 'zoom' || (m.type === 'speech' && autoZoom)
    ).length;

    logger.info(
      {
        outputPath,
        duration,
        stats: trackingResult.stats,
      },
      'Advanced reframe completed'
    );

    return {
      outputPath,
      duration,
      trackingResult,
      analyticsPath,
      stats: {
        totalKeyframes: trackingResult.trajectory.keyframes.length,
        peopleDetected: trackingResult.stats.totalPeopleDetected,
        avgPeoplePerFrame: trackingResult.stats.averagePeoplePerFrame,
        speechActivity: trackingResult.stats.speechActivity,
        keyMomentsDetected: trackingResult.keyMoments.length,
        zoomEventsApplied: zoomEvents,
      },
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Advanced reframe failed');
    throw new Error(`Advanced reframe failed: ${error.message}`);
  }
}

/**
 * Renderiza vídeo com filtros avançados
 */
async function renderAdvancedReframe(
  inputPath: string,
  outputPath: string,
  trackingResult: AdvancedTrackingResult,
  targetResolution: { width: number; height: number },
  preset: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Generate video filter from trajectory
    const videoFilter = generateZoompanFilter(trackingResult.trajectory, targetResolution);

    logger.info({ videoFilter }, 'Using advanced video filter');

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
        logger.info({ outputPath }, 'Advanced reframe rendered successfully');
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
 * Exporta analytics completo para JSON
 */
async function exportAnalyticsToJSON(
  trackingResult: AdvancedTrackingResult,
  outputPath: string
): Promise<void> {
  const analytics = {
    version: '3.0',
    phase: 'Fase 3 - Advanced Reframe',
    createdAt: new Date().toISOString(),
    trajectory: {
      keyframes: trackingResult.trajectory.keyframes.map((kf) => ({
        time: kf.timestamp,
        frame: kf.frameNumber,
        roi: kf.roi,
        method: kf.detectionMethod,
      })),
      metadata: {
        duration: trackingResult.trajectory.duration,
        fps: trackingResult.trajectory.fps,
        smoothing: trackingResult.trajectory.smoothingLevel,
        videoSize: trackingResult.trajectory.videoMetadata,
      },
    },
    multiPersonDetection: {
      frames: trackingResult.multiPersonFrames.map((frame) => ({
        timestamp: frame.timestamp,
        peopleCount: frame.people.length,
        primaryPerson: frame.primaryPerson
          ? {
              id: frame.primaryPerson.id,
              confidence: frame.primaryPerson.confidence,
              isPrimary: frame.primaryPerson.isPrimary,
              features: frame.primaryPerson.features,
            }
          : null,
        audioLevel: frame.audioLevel,
      })),
    },
    heatMaps: trackingResult.heatMaps.map((hm) => ({
      timestamp: hm.timestamp,
      hotspots: hm.hotspots,
    })),
    keyMoments: trackingResult.keyMoments,
    statistics: trackingResult.stats,
  };

  await fs.writeFile(outputPath, JSON.stringify(analytics, null, 2));
  logger.info({ outputPath }, 'Analytics exported to JSON');
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
export async function cleanupAdvancedReframeDir(outputPath: string): Promise<void> {
  try {
    const outputDir = join(outputPath, '..');
    await fs.rm(outputDir, { recursive: true, force: true });
    logger.info({ outputDir }, 'Advanced reframe directory cleaned up');
  } catch (error: any) {
    logger.warn({ error: error.message, outputPath }, 'Cleanup failed');
  }
}
