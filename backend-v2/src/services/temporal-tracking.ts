/**
 * Temporal Tracking Service - Fase 2
 *
 * Rastreia a posição do ROI ao longo do tempo e gera trajetória suavizada
 * para pan/zoom dinâmico que segue o assunto principal.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';
import { detectROIAtTimestamp, type ROI, type ROIDetectionResult } from './roi-detector.js';

const logger = createLogger('temporal-tracking');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Representa uma posição do ROI em um momento específico
 */
export interface TemporalROI {
  timestamp: number; // Tempo em segundos
  roi: ROI;
  detectionMethod: 'face' | 'motion' | 'center' | 'fallback';
  frameNumber: number;
}

/**
 * Trajetória completa do ROI ao longo do tempo
 */
export interface ROITrajectory {
  keyframes: TemporalROI[];
  duration: number;
  fps: number;
  smoothingLevel: number;
  videoMetadata: {
    width: number;
    height: number;
  };
}

/**
 * Opções para tracking temporal
 */
export interface TemporalTrackingOptions {
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9';
  trackingInterval: number; // Intervalo em segundos entre análises (padrão: 0.5s)
  smoothingWindow: number; // Janela de suavização em frames (padrão: 5)
  minConfidence: number;
  adaptiveTracking: boolean; // Ajustar intervalo baseado em movimento
  enableMotion?: boolean;
  motionSampleOffset?: number;
}

/**
 * Extrai metadados do vídeo
 */
async function getVideoMetadata(videoPath: string): Promise<{
  width: number;
  height: number;
  duration: number;
  fps: number;
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

      // Extract FPS
      let fps = 30; // Default
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        fps = num / den;
      }

      resolve({
        width: videoStream.width,
        height: videoStream.height,
        duration: metadata.format.duration || 0,
        fps,
      });
    });
  });
}

/**
 * Rastreia ROI ao longo do tempo
 */
export async function trackROIOverTime(
  videoPath: string,
  options: TemporalTrackingOptions
): Promise<ROITrajectory> {
    const {
      targetAspectRatio,
      trackingInterval = 0.5,
      smoothingWindow = 5,
      minConfidence = 0.5,
      adaptiveTracking = true,
      enableMotion = true,
      motionSampleOffset,
    } = options;

  logger.info({ videoPath, trackingInterval }, 'Starting temporal ROI tracking');

  try {
    // Get video metadata
    const metadata = await getVideoMetadata(videoPath);
    logger.info({ metadata }, 'Video metadata loaded');

    // Calculate timestamps to analyze
    const timestamps: number[] = [];
    for (let t = 0; t < metadata.duration; t += trackingInterval) {
      timestamps.push(Math.min(t, metadata.duration - 0.1));
    }

    logger.info({ timestampCount: timestamps.length }, 'Analyzing frames');

    // Track ROI at each timestamp
    const keyframes: TemporalROI[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const frameNumber = Math.floor(timestamp * metadata.fps);

      try {
        // Detect ROI at this timestamp
        const roiResult: ROIDetectionResult = await detectROIAtTimestamp(videoPath, timestamp, {
          targetAspectRatio,
          minConfidence,
          enableMotion,
          motionSampleOffset: motionSampleOffset ?? Math.min(0.25, trackingInterval / 2),
        });

        if (roiResult.roi) {
          keyframes.push({
            timestamp,
            roi: roiResult.roi,
            detectionMethod: roiResult.detectionMethod,
            frameNumber,
          });

          logger.debug(
            { timestamp, frameNumber, method: roiResult.detectionMethod },
            'ROI tracked'
          );
        }
      } catch (error: any) {
        logger.warn({ timestamp, error: error.message }, 'Failed to track ROI at timestamp');
      }

      // Progress feedback
      if (i % 10 === 0) {
        const progress = ((i / timestamps.length) * 100).toFixed(1);
        logger.info(`Tracking progress: ${progress}%`);
      }
    }

    // Smooth trajectory
    const smoothedKeyframes = smoothTrajectory(keyframes, smoothingWindow);

    logger.info({ keyframeCount: smoothedKeyframes.length }, 'Temporal tracking completed');

    return {
      keyframes: smoothedKeyframes,
      duration: metadata.duration,
      fps: metadata.fps,
      smoothingLevel: smoothingWindow,
      videoMetadata: {
        width: metadata.width,
        height: metadata.height,
      },
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Temporal tracking failed');
    throw new Error(`Temporal tracking failed: ${error.message}`);
  }
}

/**
 * Suaviza trajetória usando média móvel ponderada
 */
function smoothTrajectory(
  keyframes: TemporalROI[],
  windowSize: number
): TemporalROI[] {
  if (keyframes.length === 0 || windowSize <= 1) {
    return keyframes;
  }

  logger.info({ windowSize, keyframeCount: keyframes.length }, 'Smoothing trajectory');

  const smoothed: TemporalROI[] = [];

  for (let i = 0; i < keyframes.length; i++) {
    // Calculate window bounds
    const windowStart = Math.max(0, i - Math.floor(windowSize / 2));
    const windowEnd = Math.min(keyframes.length, i + Math.ceil(windowSize / 2));
    const window = keyframes.slice(windowStart, windowEnd);

    // Weighted average (more weight to center)
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    let weightedWidth = 0;
    let weightedHeight = 0;
    let totalConfidence = 0;

    for (let j = 0; j < window.length; j++) {
      const distance = Math.abs(j - (i - windowStart));
      const weight = Math.max(1, windowSize - distance); // Linear decay
      const kf = window[j];

      weightedX += kf.roi.x * weight;
      weightedY += kf.roi.y * weight;
      weightedWidth += kf.roi.width * weight;
      weightedHeight += kf.roi.height * weight;
      totalConfidence += kf.roi.confidence * weight;
      totalWeight += weight;
    }

    // Create smoothed keyframe
    smoothed.push({
      ...keyframes[i],
      roi: {
        x: Math.round(weightedX / totalWeight),
        y: Math.round(weightedY / totalWeight),
        width: Math.round(weightedWidth / totalWeight),
        height: Math.round(weightedHeight / totalWeight),
        confidence: totalConfidence / totalWeight,
      },
    });
  }

  return smoothed;
}

/**
 * Gera expressões FFmpeg para zoompan dinâmico
 */
export function generateZoompanFilter(
  trajectory: ROITrajectory,
  targetResolution: { width: number; height: number }
): string {
  const { keyframes, fps, videoMetadata } = trajectory;

  if (keyframes.length === 0) {
    throw new Error('No keyframes in trajectory');
  }

  logger.info({ keyframeCount: keyframes.length }, 'Generating zoompan filter');

  // FFmpeg zoompan filter with expressions
  // Formula: interpolate between keyframes

  // For now, we'll use a simpler approach with crop + scale
  // Advanced zoompan will be implemented next

  // Calculate average ROI (simplified for initial implementation)
  const avgX =
    keyframes.reduce((sum, kf) => sum + kf.roi.x, 0) / keyframes.length;
  const avgY =
    keyframes.reduce((sum, kf) => sum + kf.roi.y, 0) / keyframes.length;
  const avgWidth =
    keyframes.reduce((sum, kf) => sum + kf.roi.width, 0) / keyframes.length;
  const avgHeight =
    keyframes.reduce((sum, kf) => sum + kf.roi.height, 0) / keyframes.length;

  const cropFilter = `crop=${Math.round(avgWidth)}:${Math.round(avgHeight)}:${Math.round(avgX)}:${Math.round(avgY)}`;
  const scaleFilter = `scale=${targetResolution.width}:${targetResolution.height}:flags=lanczos`;

  return `${cropFilter},${scaleFilter}`;
}

/**
 * Gera arquivo de keyframes para edição não-linear
 */
export async function exportTrajectoryToJSON(
  trajectory: ROITrajectory,
  outputPath: string
): Promise<void> {
  const data = {
    version: '2.0',
    createdAt: new Date().toISOString(),
    trajectory: {
      keyframes: trajectory.keyframes.map((kf) => ({
        time: kf.timestamp,
        frame: kf.frameNumber,
        roi: kf.roi,
        method: kf.detectionMethod,
      })),
      metadata: {
        duration: trajectory.duration,
        fps: trajectory.fps,
        smoothing: trajectory.smoothingLevel,
        videoSize: trajectory.videoMetadata,
      },
    },
  };

  await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
  logger.info({ outputPath }, 'Trajectory exported to JSON');
}

/**
 * Gera preview visual da trajetória (para debug)
 */
export function generateTrajectoryPreview(trajectory: ROITrajectory): string {
  const { keyframes, videoMetadata } = trajectory;

  let preview = '📊 ROI Trajectory Preview\n';
  preview += '='.repeat(50) + '\n';
  preview += `Video: ${videoMetadata.width}x${videoMetadata.height}\n`;
  preview += `Keyframes: ${keyframes.length}\n`;
  preview += `Duration: ${trajectory.duration.toFixed(2)}s\n`;
  preview += '='.repeat(50) + '\n\n';

  // Sample every 10th keyframe for preview
  const sampleInterval = Math.max(1, Math.floor(keyframes.length / 20));

  for (let i = 0; i < keyframes.length; i += sampleInterval) {
    const kf = keyframes[i];
    const method = kf.detectionMethod === 'face' ? '🎯' : '📍';
    const confidence = (kf.roi.confidence * 100).toFixed(0);

    preview += `${method} t=${kf.timestamp.toFixed(2)}s | `;
    preview += `ROI: [${kf.roi.x},${kf.roi.y}] ${kf.roi.width}x${kf.roi.height} | `;
    preview += `Confidence: ${confidence}%\n`;
  }

  return preview;
}

/**
 * Detecta mudanças significativas de movimento
 */
export function detectMovementChanges(trajectory: ROITrajectory): number[] {
  const { keyframes } = trajectory;
  const changePoints: number[] = [];

  const threshold = 50; // pixels de movimento

  for (let i = 1; i < keyframes.length; i++) {
    const prev = keyframes[i - 1].roi;
    const curr = keyframes[i].roi;

    const dx = Math.abs(curr.x - prev.x);
    const dy = Math.abs(curr.y - prev.y);
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > threshold) {
      changePoints.push(keyframes[i].timestamp);
      logger.debug(
        { timestamp: keyframes[i].timestamp, distance },
        'Movement change detected'
      );
    }
  }

  return changePoints;
}
