import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';

const logger = createLogger('roi-detector');
const disableMotionDetection = process.env.ROI_DISABLE_MOTION === 'true';
const disableFaceDetection = process.env.ROI_DISABLE_FACE === 'true';

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// Lazy load face-api and canvas to avoid startup errors
let faceapi: any = null;
let canvas: any = null;

async function loadCanvas() {
  if (disableMotionDetection) {
    return null;
  }
  if (canvas) return canvas;

  try {
    canvas = await import('canvas');
    return canvas;
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Canvas not available, motion detection disabled');
    return null;
  }
}

async function loadFaceAPI() {
  if (disableFaceDetection) {
    throw new Error('Face detection disabled by ROI_DISABLE_FACE');
  }
  if (faceapi) return faceapi;

  try {
    faceapi = await import('@vladmandic/face-api');
    canvas = await import('canvas');

    // Monkey-patch face-api to use node-canvas
    const { Canvas, Image, ImageData } = canvas;
    faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

    return faceapi;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to load face-api, face detection will be disabled');
    throw new Error('face-api not available. Install with: npm install @vladmandic/face-api @tensorflow/tfjs-node canvas');
  }
}

export interface ROI {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface ROIDetectionResult {
  roi: ROI | null;
  frameWidth: number;
  frameHeight: number;
  detectionMethod: 'face' | 'motion' | 'center' | 'fallback';
}

interface DetectionOptions {
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9';
  sampleInterval?: number; // Extract frame every N seconds (default: 2)
  minConfidence?: number; // Minimum detection confidence (default: 0.5)
  enableMotion?: boolean; // Use motion detection fallback (default: true)
  motionThreshold?: number; // Pixel diff threshold (default: 35)
  minMotionConfidence?: number; // Minimum motion confidence (default: 0.02)
}

let modelsLoaded = false;
let modelsLoadAttempted = false;

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download model file: ${url} (${res.status})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(destPath, buffer);
}

/**
 * Load face-api models (run once at startup)
 */
export async function loadDetectionModels(): Promise<void> {
  if (disableFaceDetection) {
    logger.info('Face detection disabled via ROI_DISABLE_FACE; skipping model load');
    modelsLoadAttempted = true;
    return;
  }
  if (modelsLoaded) {
    logger.info('Models already loaded');
    return;
  }

  try {
    modelsLoadAttempted = true;

    // Load face-api library first
    const api = await loadFaceAPI();

    const modelPath = join(process.cwd(), 'models');

    // Create models directory if it doesn't exist
    await fs.mkdir(modelPath, { recursive: true });

    // Ensure required model files are present (download automatically if missing)
    const requiredFiles = [
      {
        name: 'tiny_face_detector_model-weights_manifest.json',
        url: 'https://raw.githubusercontent.com/vladmandic/face-api/master/model/tiny_face_detector_model-weights_manifest.json',
      },
      {
        name: 'tiny_face_detector_model.bin',
        url: 'https://raw.githubusercontent.com/vladmandic/face-api/master/model/tiny_face_detector_model.bin',
      },
    ];

    for (const file of requiredFiles) {
      const filePath = join(modelPath, file.name);
      const exists = await fileExists(filePath);
      if (exists) continue;

      try {
        logger.warn({ file: file.name }, 'ROI model file missing; downloading');
        await downloadFile(file.url, filePath);
        logger.info({ file: file.name }, 'ROI model file downloaded');
      } catch (error: any) {
        logger.warn({ error: error.message, file: file.name }, 'Failed to download ROI model file');
      }
    }

    const modelsExist = await Promise.all(
      requiredFiles.map((file) => fileExists(join(modelPath, file.name)))
    );

    if (!modelsExist.every(Boolean)) {
      logger.warn('Face models not available. Face detection will fall back to motion/center ROI.');
      logger.warn({ modelPath }, 'Expected model files in');
      return;
    }

    // Load TinyFaceDetector (lightweight, fast)
    await api.nets.tinyFaceDetector.loadFromDisk(modelPath);

    modelsLoaded = true;
    logger.info('Face detection models loaded successfully');
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Failed to load detection models, will use fallback');
  }
}

/**
 * Extract a frame from video at specified timestamp
 */
async function extractFrame(
  videoPath: string,
  timestamp: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .outputOptions(['-q:v', '2']) // High quality
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Detect faces in an image using face-api.js
 */
async function detectFacesInImage(imagePath: string): Promise<any[]> {
  try {
    if (disableFaceDetection) {
      return [];
    }

    if (!modelsLoaded && !modelsLoadAttempted) {
      await loadDetectionModels();
    }
    if (!modelsLoaded) {
      return [];
    }

    // Ensure face-api is loaded
    const api = await loadFaceAPI();
    const canvasLib = canvas;

    if (!canvasLib) {
      logger.warn('Canvas library not loaded');
      return [];
    }

    // Load image using canvas
    const img = await canvasLib.loadImage(imagePath);

    // Detect faces with TinyFaceDetector (fast and lightweight)
    const detections = await api.detectAllFaces(
      img as any,
      new api.TinyFaceDetectorOptions({
        inputSize: 416, // Larger input size for better accuracy
        scoreThreshold: 0.3, // Lower threshold to catch more faces
      })
    );

    return detections;
  } catch (error: any) {
    logger.error({ error: error.message, imagePath }, 'Face detection failed');
    return [];
  }
}

export interface FaceDetectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

/**
 * Detect faces at a specific timestamp (single frame)
 */
export async function detectFacesAtTimestamp(
  videoPath: string,
  timestamp: number
): Promise<{ faces: FaceDetectionBox[]; frameWidth: number; frameHeight: number; timestamp: number }> {
  const tempDir = join('/tmp', `faces-ts-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const { width: frameWidth, height: frameHeight, duration } = await getVideoMetadata(videoPath);
    const safeTimestamp = Math.min(Math.max(0, timestamp), Math.max(0, duration - 0.1));

    const framePath = join(tempDir, 'frame.jpg');
    await extractFrame(videoPath, safeTimestamp, framePath);

    const detections = await detectFacesInImage(framePath);
    const faces: FaceDetectionBox[] = detections.map((d: any) => ({
      x: d.box?.x ?? 0,
      y: d.box?.y ?? 0,
      width: d.box?.width ?? 0,
      height: d.box?.height ?? 0,
      score: d.score ?? 0,
    }));

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return { faces, frameWidth, frameHeight, timestamp: safeTimestamp };
  } catch (error: any) {
    logger.warn({ error: error.message, timestamp }, 'Face detection at timestamp failed');
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return { faces: [], frameWidth: 0, frameHeight: 0, timestamp };
  }
}

/**
 * Detect motion between two frames using simple frame differencing
 */
async function detectMotionBetweenFrames(
  frameAPath: string,
  frameBPath: string,
  frameWidth: number,
  frameHeight: number,
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9',
  options?: { threshold?: number; minAreaRatio?: number }
): Promise<ROI | null> {
  const canvasLib = await loadCanvas();
  if (!canvasLib) return null;

  const { createCanvas, loadImage } = canvasLib;

  // Downscale for speed
  const downscaleWidth = 180;
  const downscaleHeight = Math.max(1, Math.round((downscaleWidth * frameHeight) / frameWidth));

  const [imgA, imgB] = await Promise.all([
    loadImage(frameAPath),
    loadImage(frameBPath),
  ]);

  const canvasA = createCanvas(downscaleWidth, downscaleHeight);
  const ctxA = canvasA.getContext('2d');
  ctxA.drawImage(imgA, 0, 0, downscaleWidth, downscaleHeight);
  const dataA = ctxA.getImageData(0, 0, downscaleWidth, downscaleHeight).data;

  const canvasB = createCanvas(downscaleWidth, downscaleHeight);
  const ctxB = canvasB.getContext('2d');
  ctxB.drawImage(imgB, 0, 0, downscaleWidth, downscaleHeight);
  const dataB = ctxB.getImageData(0, 0, downscaleWidth, downscaleHeight).data;

  const threshold = options?.threshold ?? 35; // 0-255*3
  const minAreaRatio = options?.minAreaRatio ?? 0.01; // 1% of pixels

  let minX = downscaleWidth;
  let minY = downscaleHeight;
  let maxX = 0;
  let maxY = 0;
  let motionPixels = 0;

  for (let i = 0; i < dataA.length; i += 4) {
    const dr = Math.abs(dataA[i] - dataB[i]);
    const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
    const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
    const diff = dr + dg + db;

    if (diff >= threshold) {
      const idx = i / 4;
      const x = idx % downscaleWidth;
      const y = Math.floor(idx / downscaleWidth);

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      motionPixels++;
    }
  }

  const totalPixels = downscaleWidth * downscaleHeight;
  const motionRatio = motionPixels / totalPixels;

  if (motionPixels === 0 || motionRatio < minAreaRatio) {
    return null;
  }

  // Scale ROI back to original size
  const scaleX = frameWidth / downscaleWidth;
  const scaleY = frameHeight / downscaleHeight;

  const box = {
    x: Math.max(0, Math.floor(minX * scaleX)),
    y: Math.max(0, Math.floor(minY * scaleY)),
    width: Math.max(1, Math.ceil((maxX - minX + 1) * scaleX)),
    height: Math.max(1, Math.ceil((maxY - minY + 1) * scaleY)),
  };

  const roi = calculateROIFromMotion(box, frameWidth, frameHeight, targetAspectRatio, motionRatio);
  return roi;
}

function calculateROIFromMotion(
  motionBox: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9',
  motionRatio: number
): ROI {
  const centerX = motionBox.x + motionBox.width / 2;
  const centerY = motionBox.y + motionBox.height / 2;

  let cropWidth: number;
  let cropHeight: number;

  switch (targetAspectRatio) {
    case '9:16':
      cropHeight = frameHeight;
      cropWidth = (cropHeight * 9) / 16;
      break;
    case '1:1':
      cropWidth = cropHeight = Math.min(frameWidth, frameHeight);
      break;
    case '4:5':
      cropHeight = frameHeight;
      cropWidth = (cropHeight * 4) / 5;
      break;
    case '16:9':
    default:
      cropWidth = frameWidth;
      cropHeight = (cropWidth * 9) / 16;
      break;
  }

  let x = Math.max(0, centerX - cropWidth / 2);
  let y = Math.max(0, centerY - cropHeight / 2);

  if (x + cropWidth > frameWidth) {
    x = frameWidth - cropWidth;
  }
  if (y + cropHeight > frameHeight) {
    y = frameHeight - cropHeight;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
    confidence: Math.min(1, Math.max(0.01, motionRatio)),
  };
}

/**
 * Calculate optimal ROI from face detections
 */
function calculateROIFromFaces(
  faces: any[],
  frameWidth: number,
  frameHeight: number,
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9'
): ROI | null {
  if (!faces || faces.length === 0) {
    return null;
  }

  const frameArea = Math.max(1, frameWidth * frameHeight);

  // Normalize face detections and filter noise (tiny/background faces skew the ROI badly)
  const normalized = faces
    .map((face) => ({
      box: face?.box,
      score: Number(face?.score) || 0,
    }))
    .filter((f) => f.box && Number.isFinite(f.box.x) && Number.isFinite(f.box.y) && Number.isFinite(f.box.width) && Number.isFinite(f.box.height))
    .filter((f) => f.score >= 0.3)
    .map((f) => ({
      ...f,
      area: Math.max(0, f.box.width * f.box.height),
      areaRatio: Math.max(0, (f.box.width * f.box.height) / frameArea),
    }))
    // Ignore extremely small detections (posters/TV screens/background faces).
    .filter((f) => f.areaRatio >= 0.002);

  const candidates = (normalized.length > 0 ? normalized : faces
    .map((face) => ({
      box: face?.box,
      score: Number(face?.score) || 0,
      area: Math.max(0, (face?.box?.width || 0) * (face?.box?.height || 0)),
      areaRatio: Math.max(0, ((face?.box?.width || 0) * (face?.box?.height || 0)) / frameArea),
    }))
    .filter((f) => f.box && Number.isFinite(f.box.x) && Number.isFinite(f.box.y) && Number.isFinite(f.box.width) && Number.isFinite(f.box.height)))
    .sort((a, b) => b.area - a.area);

  if (candidates.length === 0) return null;

  const largestArea = Math.max(1, candidates[0].area);
  const significant = candidates.filter((f) => f.area >= largestArea * 0.35);

  // Use a small cluster (faces with similar size) to avoid shifting ROI towards tiny detections.
  const kept = significant.length > 0 ? significant : [candidates[0]];

  const boxes = kept.map((f) => f.box);

  // Calculate combined bounding box (includes all faces)
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));

  // Combined box center
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Calculate target crop dimensions based on aspect ratio
  let cropWidth: number;
  let cropHeight: number;
  const targetRatio =
    targetAspectRatio === '9:16'
      ? 9 / 16
      : targetAspectRatio === '4:5'
        ? 4 / 5
        : targetAspectRatio === '1:1'
          ? 1
          : 16 / 9;

  switch (targetAspectRatio) {
    case '9:16':
      cropHeight = frameHeight;
      cropWidth = (cropHeight * 9) / 16;
      break;
    case '1:1':
      cropWidth = cropHeight = Math.min(frameWidth, frameHeight);
      break;
    case '4:5':
      cropHeight = frameHeight;
      cropWidth = (cropHeight * 4) / 5;
      break;
    case '16:9':
    default:
      cropWidth = frameWidth;
      cropHeight = (cropWidth * 9) / 16;
      break;
  }

  // Ensure crop stays within frame (can happen on uncommon input aspect ratios).
  if (cropWidth > frameWidth) {
    cropWidth = frameWidth;
    cropHeight = cropWidth / targetRatio;
  }
  if (cropHeight > frameHeight) {
    cropHeight = frameHeight;
    cropWidth = cropHeight * targetRatio;
  }

  const combinedWidth = Math.max(1, maxX - minX);

  // For narrow crops (9:16, 4:5), trying to include multiple far-apart faces often
  // results in cropping the primary subject. Prefer the largest face in that case.
  if (kept.length > 1 && (targetAspectRatio === '9:16' || targetAspectRatio === '4:5')) {
    const cropWidthRatio = cropWidth / Math.max(1, frameWidth);
    const combinedWidthRatio = combinedWidth / Math.max(1, frameWidth);
    if (combinedWidthRatio > cropWidthRatio * 0.95) {
      const primary = candidates[0];
      const p = primary.box;
      const pCenterX = p.x + p.width / 2;
      const pCenterY = p.y + p.height / 2;
      const avgConfidence = primary.score;

      let x = Math.max(0, pCenterX - cropWidth / 2);
      let y = Math.max(0, pCenterY - cropHeight / 2);
      if (x + cropWidth > frameWidth) x = frameWidth - cropWidth;
      if (y + cropHeight > frameHeight) y = frameHeight - cropHeight;

      return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(cropWidth),
        height: Math.round(cropHeight),
        confidence: avgConfidence,
      };
    }
  }

  // Center the crop around detected faces
  let x = Math.max(0, centerX - cropWidth / 2);
  // Small headroom bias when we are cropping vertically (prevents chopping foreheads).
  const headroomBias = cropHeight < frameHeight ? Math.round(cropHeight * 0.06) : 0;
  let y = Math.max(0, centerY - cropHeight / 2 - headroomBias);

  // Ensure crop doesn't exceed frame boundaries
  if (x + cropWidth > frameWidth) {
    x = frameWidth - cropWidth;
  }
  if (y + cropHeight > frameHeight) {
    y = frameHeight - cropHeight;
  }

  // Average confidence from all faces
  const avgConfidence = kept.reduce((sum, f) => sum + (Number(f.score) || 0), 0) / kept.length;

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
    confidence: avgConfidence,
  };
}

/**
 * Fallback: Calculate center crop when no faces detected
 */
function calculateCenterCrop(
  frameWidth: number,
  frameHeight: number,
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9'
): ROI {
  let cropWidth: number;
  let cropHeight: number;

  switch (targetAspectRatio) {
    case '9:16':
      cropHeight = frameHeight;
      cropWidth = (cropHeight * 9) / 16;
      break;
    case '1:1':
      cropWidth = cropHeight = Math.min(frameWidth, frameHeight);
      break;
    case '4:5':
      cropHeight = frameHeight;
      cropWidth = (cropHeight * 4) / 5;
      break;
    case '16:9':
    default:
      cropWidth = frameWidth;
      cropHeight = (cropWidth * 9) / 16;
      break;
  }

  const x = Math.max(0, (frameWidth - cropWidth) / 2);
  const y = Math.max(0, (frameHeight - cropHeight) / 2);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
    confidence: 0.0, // No detection confidence for center crop
  };
}

/**
 * Get video metadata (width, height, duration)
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
 * Detect ROI at a specific timestamp (single frame + optional motion fallback)
 */
export async function detectROIAtTimestamp(
  videoPath: string,
  timestamp: number,
  options: DetectionOptions & { motionSampleOffset?: number }
): Promise<ROIDetectionResult> {
  const {
    targetAspectRatio,
    minConfidence = 0.5,
    enableMotion = true,
    motionThreshold = 35,
    minMotionConfidence = 0.02,
    motionSampleOffset = 0.25,
  } = options;
  const allowMotion = enableMotion && !disableMotionDetection;

  const tempDir = join('/tmp', `roi-ts-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const { width: frameWidth, height: frameHeight, duration } = await getVideoMetadata(videoPath);
    const safeTimestamp = Math.min(Math.max(0, timestamp), Math.max(0, duration - 0.1));

    const frameAPath = join(tempDir, 'frame-a.jpg');
    await extractFrame(videoPath, safeTimestamp, frameAPath);

    const faces = await detectFacesInImage(frameAPath);
    if (faces.length > 0) {
      const roi = calculateROIFromFaces(faces, frameWidth, frameHeight, targetAspectRatio);
      if (roi && roi.confidence >= minConfidence) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        return {
          roi,
          frameWidth,
          frameHeight,
          detectionMethod: 'face',
        };
      }
    }

    // Motion fallback (optional)
    if (allowMotion) {
      const frameBPath = join(tempDir, 'frame-b.jpg');
      const motionTimestamp = Math.min(safeTimestamp + motionSampleOffset, Math.max(0, duration - 0.1));
      await extractFrame(videoPath, motionTimestamp, frameBPath);

      const motionROI = await detectMotionBetweenFrames(
        frameAPath,
        frameBPath,
        frameWidth,
        frameHeight,
        targetAspectRatio,
        { threshold: motionThreshold }
      );

      if (motionROI && motionROI.confidence >= minMotionConfidence) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        return {
          roi: motionROI,
          frameWidth,
          frameHeight,
          detectionMethod: 'motion',
        };
      }
    }

    const centerROI = calculateCenterCrop(frameWidth, frameHeight, targetAspectRatio);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return {
      roi: centerROI,
      frameWidth,
      frameHeight,
      detectionMethod: 'center',
    };
  } catch (error: any) {
    logger.error({ error: error.message, timestamp }, 'ROI detection at timestamp failed');
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`ROI detection at timestamp failed: ${error.message}`);
  }
}

/**
 * Detect optimal Region of Interest (ROI) for intelligent reframing
 *
 * This function analyzes a video to find the best crop region for a target aspect ratio.
 * It samples frames, detects faces, and calculates an optimal crop that keeps subjects in focus.
 */
export async function detectROI(
  videoPath: string,
  options: DetectionOptions
): Promise<ROIDetectionResult> {
  const {
    targetAspectRatio,
    sampleInterval = 2,
    minConfidence = 0.5,
    enableMotion = true,
    motionThreshold = 35,
    minMotionConfidence = 0.02,
  } = options;
  const allowMotion = enableMotion && !disableMotionDetection;

  logger.info(
    { videoPath, targetAspectRatio, sampleInterval },
    'Starting ROI detection'
  );

  const tempDir = join('/tmp', `roi-detection-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Get video metadata
    const { width: frameWidth, height: frameHeight, duration } = await getVideoMetadata(videoPath);

    logger.info({ frameWidth, frameHeight, duration }, 'Video metadata loaded');

    // Sample frames throughout the video
    const sampleTimestamps: number[] = [];
    for (let t = 1; t < duration; t += sampleInterval) {
      sampleTimestamps.push(Math.min(t, duration - 1));
    }

    // Limit to 10 samples max to avoid excessive processing
    const samples = sampleTimestamps.slice(0, 10);

    logger.info({ sampleCount: samples.length }, 'Extracting sample frames');

    // Extract frames and detect faces
    const detections: ROI[] = [];
    const framePaths: string[] = [];

    for (let i = 0; i < samples.length; i++) {
      const timestamp = samples[i];
      const framePath = join(tempDir, `frame-${i}.jpg`);

      // Extract frame
      await extractFrame(videoPath, timestamp, framePath);
      framePaths.push(framePath);

      // Detect faces
      const faces = await detectFacesInImage(framePath);

      if (faces.length > 0) {
        const roi = calculateROIFromFaces(faces, frameWidth, frameHeight, targetAspectRatio);
        if (roi && roi.confidence >= minConfidence) {
          detections.push(roi);
          logger.info({ timestamp, faceCount: faces.length, confidence: roi.confidence }, 'Faces detected');
        }
      }

    }

    // Determine best ROI
    let finalROI: ROI;
    let detectionMethod: 'face' | 'motion' | 'center' | 'fallback';

    if (detections.length > 0) {
      // Use average ROI from all detections (weighted by confidence)
      const totalConfidence = detections.reduce((sum, d) => sum + d.confidence, 0);

      const avgX = detections.reduce((sum, d) => sum + d.x * d.confidence, 0) / totalConfidence;
      const avgY = detections.reduce((sum, d) => sum + d.y * d.confidence, 0) / totalConfidence;
      const avgWidth = detections.reduce((sum, d) => sum + d.width * d.confidence, 0) / totalConfidence;
      const avgHeight = detections.reduce((sum, d) => sum + d.height * d.confidence, 0) / totalConfidence;
      const avgConfidence = totalConfidence / detections.length;

      finalROI = {
        x: Math.round(avgX),
        y: Math.round(avgY),
        width: Math.round(avgWidth),
        height: Math.round(avgHeight),
        confidence: avgConfidence,
      };
      detectionMethod = 'face';

      logger.info({ roi: finalROI, detectionCount: detections.length }, 'ROI calculated from face detections');
    } else if (allowMotion && framePaths.length >= 2) {
      const motionDetections: ROI[] = [];

      for (let i = 0; i < framePaths.length - 1; i++) {
        const motionROI = await detectMotionBetweenFrames(
          framePaths[i],
          framePaths[i + 1],
          frameWidth,
          frameHeight,
          targetAspectRatio,
          { threshold: motionThreshold }
        );

        if (motionROI && motionROI.confidence >= minMotionConfidence) {
          motionDetections.push(motionROI);
        }
      }

      if (motionDetections.length > 0) {
        const totalConfidence = motionDetections.reduce((sum, d) => sum + d.confidence, 0);
        const avgX = motionDetections.reduce((sum, d) => sum + d.x * d.confidence, 0) / totalConfidence;
        const avgY = motionDetections.reduce((sum, d) => sum + d.y * d.confidence, 0) / totalConfidence;
        const avgWidth = motionDetections.reduce((sum, d) => sum + d.width * d.confidence, 0) / totalConfidence;
        const avgHeight = motionDetections.reduce((sum, d) => sum + d.height * d.confidence, 0) / totalConfidence;
        const avgConfidence = totalConfidence / motionDetections.length;

        finalROI = {
          x: Math.round(avgX),
          y: Math.round(avgY),
          width: Math.round(avgWidth),
          height: Math.round(avgHeight),
          confidence: avgConfidence,
        };
        detectionMethod = 'motion';

        logger.info(
          { roi: finalROI, detectionCount: motionDetections.length },
          'ROI calculated from motion detection'
        );
      } else {
        // Fallback to center crop
        finalROI = calculateCenterCrop(frameWidth, frameHeight, targetAspectRatio);
        detectionMethod = 'center';

        logger.warn('No faces/motion detected, using center crop as fallback');
      }
    } else {
      // Fallback to center crop
      finalROI = calculateCenterCrop(frameWidth, frameHeight, targetAspectRatio);
      detectionMethod = 'center';

      logger.warn('No faces detected, using center crop as fallback');
    }

    // Clean up frames
    await Promise.all(framePaths.map((path) => fs.unlink(path).catch(() => {})));

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return {
      roi: finalROI,
      frameWidth,
      frameHeight,
      detectionMethod,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'ROI detection failed');

    // Clean up on error
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    throw new Error(`ROI detection failed: ${error.message}`);
  }
}

/**
 * Generate FFmpeg crop filter string from ROI
 */
export function generateCropFilter(roi: ROI): string {
  return `crop=${roi.width}:${roi.height}:${roi.x}:${roi.y}`;
}
