import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { createLogger } from '../config/logger.js';

const logger = createLogger('face-detection');

// Lazy-loaded face-api and canvas modules (heavy native deps)
let faceapi: any = null;
let canvas: any = null;
let modelsLoaded = false;

interface FaceRegion {
  x: number;       // center X of face (pixels)
  y: number;       // center Y of face (pixels)
  width: number;   // face bounding box width
  height: number;  // face bounding box height
  confidence: number;
}

export interface CropOffset {
  x: number;       // X offset for FFmpeg crop filter
  fallback: boolean; // true if no face found (using center crop)
}

/**
 * Lazily load face-api and models (heavy deps, only load when needed)
 */
async function ensureModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;

  try {
    // Dynamic imports for heavy native dependencies
    faceapi = await import('@vladmandic/face-api');
    canvas = await import('canvas');

    // Monkey-patch canvas for Node.js environment
    const { Canvas, Image, ImageData } = canvas;
    faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

    // Load TinyFaceDetector model (smallest, fastest — ~190KB)
    const modelDir = join(
      process.cwd(),
      'node_modules',
      '@vladmandic/face-api',
      'model'
    );
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelDir);

    modelsLoaded = true;
    logger.info('Face detection models loaded successfully');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to load face detection models');
    throw error;
  }
}

/**
 * Extract N keyframes from a video clip using FFmpeg
 */
async function extractKeyframes(
  videoPath: string,
  startTime: number,
  endTime: number,
  outputDir: string,
  count: number = 5
): Promise<string[]> {
  const duration = endTime - startTime;
  const interval = Math.max(1, Math.floor(duration / count));

  const framePaths: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .outputOptions([
        '-vf', `fps=1/${interval}`,
        '-frames:v', `${count}`,
        '-q:v', '5', // Lower quality is fine for face detection
      ])
      .output(join(outputDir, 'frame-%02d.jpg'))
      .on('end', () => resolve())
      .on('error', (err) => reject(err));

    cmd.run();
  });

  // Collect output frame paths
  for (let i = 1; i <= count; i++) {
    const framePath = join(outputDir, `frame-${String(i).padStart(2, '0')}.jpg`);
    try {
      await fs.access(framePath);
      framePaths.push(framePath);
    } catch {
      // Frame might not exist if video is shorter than expected
      break;
    }
  }

  return framePaths;
}

/**
 * Detect faces in a single image file
 */
async function detectFacesInImage(imagePath: string): Promise<FaceRegion[]> {
  await ensureModelsLoaded();

  const img = await canvas.loadImage(imagePath);
  const detections = await faceapi.detectAllFaces(
    img,
    new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,     // Smaller = faster (320 is fast enough for crop decisions)
      scoreThreshold: 0.4,
    })
  );

  return detections.map((d: any) => ({
    x: d.box.x + d.box.width / 2,   // center X
    y: d.box.y + d.box.height / 2,  // center Y
    width: d.box.width,
    height: d.box.height,
    confidence: d.score,
  }));
}

/**
 * Detect faces across multiple keyframes of a clip
 */
export async function detectFacesInClip(
  videoPath: string,
  startTime: number,
  endTime: number,
  sampleCount: number = 5
): Promise<FaceRegion[]> {
  const tmpDir = join('/tmp', `faces-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    logger.info(
      { videoPath, startTime, endTime, sampleCount },
      'Extracting keyframes for face detection'
    );

    const framePaths = await extractKeyframes(
      videoPath,
      startTime,
      endTime,
      tmpDir,
      sampleCount
    );

    if (framePaths.length === 0) {
      logger.warn('No keyframes extracted, skipping face detection');
      return [];
    }

    logger.info({ frameCount: framePaths.length }, 'Keyframes extracted, running face detection');

    // Detect faces in all frames
    const allFaces: FaceRegion[] = [];
    for (const framePath of framePaths) {
      try {
        const faces = await detectFacesInImage(framePath);
        allFaces.push(...faces);
        // Yield between frames so the worker can renew BullMQ locks on busy hosts.
        await new Promise<void>((resolve) => setImmediate(resolve));
      } catch (error: any) {
        logger.warn({ framePath, error: error.message }, 'Face detection failed for frame');
      }
    }

    logger.info({ totalFaces: allFaces.length }, 'Face detection completed');
    return allFaces;
  } finally {
    // Cleanup temp frames
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Detect faces across the full used portion of a video (all clips combined).
 * Samples one frame every ~3 seconds to cover the content efficiently.
 * Much faster than calling detectFacesInClip per clip (N FFmpeg calls → 1).
 */
export async function detectFacesInVideo(
  videoPath: string,
  startTime: number,
  endTime: number,
  _sourceWidth: number,
  _sourceHeight: number,
): Promise<FaceRegion[]> {
  const duration = endTime - startTime;
  // Sample ~1 frame every 3 seconds, min 3, max 20
  const sampleCount = Math.min(20, Math.max(3, Math.floor(duration / 3)));

  logger.info({ videoPath, startTime, endTime, sampleCount }, 'Running video-level face detection');
  return detectFacesInClip(videoPath, startTime, endTime, sampleCount);
}

/**
 * Get video dimensions using ffprobe
 */
export function getVideoDimensions(
  videoPath: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      if (!videoStream || !videoStream.width || !videoStream.height) {
        return reject(new Error('Could not determine video dimensions'));
      }

      resolve({
        width: videoStream.width,
        height: videoStream.height,
      });
    });
  });
}

/**
 * Calculate the optimal crop X offset based on detected faces.
 * Centers the 9:16 crop on the dominant face position.
 * Falls back to center crop if no faces are detected.
 */
export function calculateSmartCropX(
  faces: FaceRegion[],
  sourceWidth: number,
  sourceHeight: number,
  targetAspectRatio: number = 9 / 16
): CropOffset {
  // Width of the crop region in source pixels
  const cropWidth = sourceHeight * targetAspectRatio;
  const centerX = sourceWidth / 2;

  // Filter faces with sufficient confidence
  const validFaces = faces.filter((f) => f.confidence > 0.5);

  if (validFaces.length === 0) {
    // No faces: use center crop (current behavior)
    const x = Math.round((sourceWidth - cropWidth) / 2);
    logger.info({ x, reason: 'no faces detected' }, 'Using center crop fallback');
    return { x, fallback: true };
  }

  // Weighted average of face X positions (weighted by confidence)
  const totalWeight = validFaces.reduce((sum, f) => sum + f.confidence, 0);
  const weightedX = validFaces.reduce(
    (sum, f) => sum + f.x * f.confidence,
    0
  ) / totalWeight;

  // Center the crop on the face position
  let cropX = Math.round(weightedX - cropWidth / 2);

  // Clamp to valid range (don't go out of bounds)
  cropX = Math.max(0, Math.min(cropX, Math.round(sourceWidth - cropWidth)));

  logger.info(
    {
      faceCount: validFaces.length,
      avgFaceX: Math.round(weightedX),
      cropX,
      cropWidth: Math.round(cropWidth),
      sourceWidth,
    },
    'Smart crop calculated based on face position'
  );

  return { x: cropX, fallback: false };
}
