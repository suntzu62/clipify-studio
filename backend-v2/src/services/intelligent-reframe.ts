import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';
import { detectROI, generateCropFilter, loadDetectionModels, type ROIDetectionResult } from './roi-detector.js';

const logger = createLogger('intelligent-reframe');

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface IntelligentReframeOptions {
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9';
  targetResolution?: { width: number; height: number };
  sampleInterval?: number; // Frame sampling interval (default: 2s)
  minConfidence?: number; // Minimum detection confidence (default: 0.5)
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium' | 'slow';
}

export interface IntelligentReframeResult {
  outputPath: string;
  roi: ROIDetectionResult;
  duration: number;
}

/**
 * Initialize intelligent reframe service (load models)
 */
export async function initializeIntelligentReframe(): Promise<void> {
  logger.info('Initializing intelligent reframe service');
  await loadDetectionModels();
  logger.info('Intelligent reframe service initialized');
}

/**
 * Apply intelligent reframing to a video
 *
 * This function:
 * 1. Detects the optimal crop region (ROI) using face detection
 * 2. Applies the crop and scale to the target aspect ratio
 * 3. Renders the reframed video with high quality settings
 */
export async function applyIntelligentReframe(
  videoPath: string,
  options: IntelligentReframeOptions
): Promise<IntelligentReframeResult> {
  const {
    targetAspectRatio,
    targetResolution = getDefaultResolution(targetAspectRatio),
    sampleInterval = 2,
    minConfidence = 0.5,
    preset = 'slow',
  } = options;

  logger.info(
    {
      videoPath,
      targetAspectRatio,
      targetResolution,
      sampleInterval,
    },
    'Starting intelligent reframe'
  );

  try {
    // Step 1: Detect optimal ROI
    logger.info('Step 1/2: Detecting optimal ROI');
    const roiResult = await detectROI(videoPath, {
      targetAspectRatio,
      sampleInterval,
      minConfidence,
    });

    if (!roiResult.roi) {
      throw new Error('Failed to calculate ROI for reframing');
    }

    logger.info(
      {
        roi: roiResult.roi,
        method: roiResult.detectionMethod,
        confidence: roiResult.roi.confidence,
      },
      'ROI detected successfully'
    );

    // Step 2: Apply reframe with FFmpeg
    logger.info('Step 2/2: Rendering reframed video');

    const outputDir = join('/tmp', `reframe-${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = join(outputDir, 'reframed.mp4');

    const duration = await renderReframedVideo(
      videoPath,
      outputPath,
      roiResult.roi,
      targetResolution,
      preset
    );

    logger.info(
      { outputPath, duration },
      'Intelligent reframe completed successfully'
    );

    return {
      outputPath,
      roi: roiResult,
      duration,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Intelligent reframe failed');
    throw new Error(`Intelligent reframe failed: ${error.message}`);
  }
}

/**
 * Render reframed video with FFmpeg
 */
async function renderReframedVideo(
  inputPath: string,
  outputPath: string,
  roi: { x: number; y: number; width: number; height: number; confidence: number },
  targetResolution: { width: number; height: number },
  preset: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Build video filters
    const vfFilters: string[] = [];

    // 1. Crop to ROI
    const cropFilter = generateCropFilter(roi);
    vfFilters.push(cropFilter);

    // 2. Scale to target resolution with high quality
    const scaleParams = 'flags=lanczos+accurate_rnd+full_chroma_int+full_chroma_inp';
    vfFilters.push(`scale=${targetResolution.width}:${targetResolution.height}:${scaleParams}`);

    const vf = vfFilters.join(',');

    // Audio normalization
    const af = 'loudnorm=I=-14:LRA=11:TP=-1.5';

    let videoDuration = 0;

    ffmpeg(inputPath)
      .outputOptions([
        '-map', '0:v:0',
        '-map', '0:a:0?', // Audio optional (? makes it optional)
        '-vf', vf,
        '-af', af,
        '-c:v', 'libx264',
        '-preset', preset,
        '-tune', 'film',
        '-threads', '8',
        '-profile:v', 'high',
        '-level', '4.2',
        '-pix_fmt', 'yuv420p',
        '-crf', '16', // High quality
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
        // Extract duration from codec data
        const durationMatch = data.duration?.match(/(\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1], 10);
          const minutes = parseInt(durationMatch[2], 10);
          const seconds = parseFloat(durationMatch[3]);
          videoDuration = hours * 3600 + minutes * 60 + seconds;
        }
      })
      .on('end', () => {
        logger.info({ outputPath }, 'Reframed video rendered successfully');
        resolve(videoDuration);
      })
      .on('error', (err) => {
        logger.error({ error: err.message }, 'FFmpeg rendering failed');
        reject(err);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          logger.debug({ percent: progress.percent.toFixed(1) }, 'Rendering progress');
        }
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
      return { width: 1080, height: 1920 }; // TikTok, Reels, Shorts
    case '1:1':
      return { width: 1080, height: 1080 }; // Instagram square
    case '4:5':
      return { width: 1080, height: 1350 }; // Instagram portrait
    case '16:9':
    default:
      return { width: 1920, height: 1080 }; // YouTube landscape
  }
}

/**
 * Cleanup: remove reframe output directory
 */
export async function cleanupReframeDir(outputPath: string): Promise<void> {
  try {
    const outputDir = join(outputPath, '..');
    await fs.rm(outputDir, { recursive: true, force: true });
    logger.info({ outputDir }, 'Reframe directory cleaned up');
  } catch (error: any) {
    logger.warn({ error: error.message, outputPath }, 'Reframe directory cleanup failed');
  }
}
