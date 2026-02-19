/**
 * Stacked Layout Reframe (top/bottom)
 *
 * Divide o quadro em dois blocos verticais para manter simultaneamente
 * a tela/slide (topo) e o rosto/apresentador (base), evitando cropping cego.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';
import { detectROI, type ROI } from './roi-detector.js';

const logger = createLogger('stacked-layout-reframe');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface StackedLayoutOptions {
  targetResolution?: { width: number; height: number };
  topRatio?: number; // Porção do quadro para o bloco superior (0-1)
  facePadding?: number; // Padding extra em torno do rosto
  slideWidthRatio?: number; // Largura relativa usada para “slide/tela”
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium' | 'slow';
  detectionInterval?: number; // Intervalo de amostragem para detecção
  minConfidence?: number;
}

export interface StackedLayoutResult {
  outputPath: string;
  duration: number;
  layout: {
    topHeight: number;
    bottomHeight: number;
    faceRegion: ROI;
    slideRegion: ROI;
    faceSide: 'left' | 'right';
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function adjustToAspect(
  region: ROI,
  targetRatio: number,
  frameWidth: number,
  frameHeight: number
): ROI {
  let { x, y, width, height } = region;

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const currentRatio = width / height;

  if (currentRatio > targetRatio) {
    // Muito largo → reduzir largura
    const newWidth = height * targetRatio;
    width = newWidth;
  } else {
    // Muito alto → reduzir altura
    const newHeight = width / targetRatio;
    height = newHeight;
  }

  // Recentrar
  x = centerX - width / 2;
  y = centerY - height / 2;

  // Clamp dentro do frame
  x = clamp(x, 0, frameWidth - width);
  y = clamp(y, 0, frameHeight - height);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    confidence: region.confidence,
  };
}

function addPadding(roi: ROI, padding: number, frameWidth: number, frameHeight: number): ROI {
  const x = clamp(roi.x - padding, 0, frameWidth);
  const y = clamp(roi.y - padding, 0, frameHeight);
  const width = clamp(roi.width + padding * 2, 1, frameWidth - x);
  const height = clamp(roi.height + padding * 2, 1, frameHeight - y);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    confidence: roi.confidence,
  };
}

function chooseSlideRegion(
  frameWidth: number,
  frameHeight: number,
  faceRegion: ROI,
  slideWidthRatio: number
): { slideRegion: ROI; faceSide: 'left' | 'right' } {
  const faceCenterX = faceRegion.x + faceRegion.width / 2;
  const faceSide: 'left' | 'right' = faceCenterX > frameWidth / 2 ? 'right' : 'left';

  const slideWidth = clamp(Math.round(frameWidth * slideWidthRatio), Math.round(frameWidth * 0.45), frameWidth);
  const slideX = faceSide === 'right' ? 0 : Math.max(0, frameWidth - slideWidth);

  const slideRegion: ROI = {
    x: slideX,
    y: 0,
    width: Math.min(slideWidth, frameWidth - slideX),
    height: frameHeight,
    confidence: 1,
  };

  return { slideRegion, faceSide };
}

async function getVideoMetadata(videoPath: string): Promise<{ width: number; height: number; duration: number }> {
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

export async function applyStackedLayoutReframe(
  videoPath: string,
  options: StackedLayoutOptions
): Promise<StackedLayoutResult> {
  const {
    targetResolution = { width: 1080, height: 1920 },
    topRatio = 0.6,
    facePadding = 80,
    slideWidthRatio = 0.58,
    preset = 'fast',
    detectionInterval = 1,
    minConfidence = 0.3,
  } = options;

  const safeTopRatio = clamp(topRatio, 0.45, 0.7);

  logger.info(
    { videoPath, targetResolution, topRatio: safeTopRatio, facePadding, slideWidthRatio },
    'Starting stacked layout reframe'
  );

  const tempDir = join('/tmp', `stacked-layout-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const metadata = await getVideoMetadata(videoPath);

    // Detect face ROI (or fallback center)
    const roiResult = await detectROI(videoPath, {
      targetAspectRatio: '16:9',
      sampleInterval: detectionInterval,
      minConfidence,
    });

    const faceROI: ROI = roiResult.roi || {
      x: Math.max(0, (metadata.width * 0.5) - 200),
      y: Math.max(0, (metadata.height * 0.5) - 350),
      width: 400,
      height: 700,
      confidence: 0.0,
    };

    // Ajustar rosto com padding e aspect ratio da parte inferior
    const bottomHeight = Math.round(targetResolution.height * (1 - safeTopRatio));
    const faceTargetRatio = targetResolution.width / bottomHeight;
    const paddedFace = addPadding(faceROI, facePadding, metadata.width, metadata.height);
    const faceRegion = adjustToAspect(paddedFace, faceTargetRatio, metadata.width, metadata.height);

    // Região de slide/tela baseada no lado oposto do rosto
    const { slideRegion, faceSide } = chooseSlideRegion(metadata.width, metadata.height, faceRegion, slideWidthRatio);
    const topHeight = Math.round(targetResolution.height * safeTopRatio);
    const slideTargetRatio = targetResolution.width / topHeight;
    const slideAdjusted = adjustToAspect(slideRegion, slideTargetRatio, metadata.width, metadata.height);

    // FFmpeg composition: crop -> scale/pad -> vstack
    const complexFilter = [
      '[0:v]split=2[slide_src][face_src]',
      `[slide_src]crop=${slideAdjusted.width}:${slideAdjusted.height}:${slideAdjusted.x}:${slideAdjusted.y},scale=${targetResolution.width}:${topHeight}:force_original_aspect_ratio=decrease,pad=${targetResolution.width}:${topHeight}:(ow-iw)/2:(oh-ih)/2:color=black[slide_v]`,
      `[face_src]crop=${faceRegion.width}:${faceRegion.height}:${faceRegion.x}:${faceRegion.y},scale=${targetResolution.width}:${bottomHeight}:force_original_aspect_ratio=decrease,pad=${targetResolution.width}:${bottomHeight}:(ow-iw)/2:(oh-ih)/2:color=black[face_v]`,
      '[slide_v][face_v]vstack=inputs=2[v]',
    ].join(';');

    const af = 'loudnorm=I=-14:LRA=11:TP=-1.5';
    const outputPath = join(tempDir, 'stacked.mp4');
    let duration = 0;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .complexFilter(complexFilter, ['v'])
        .outputOptions([
          '-map', '[v]',
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
          const match = data.duration?.match(/(\d+):(\d+):(\d+\.\d+)/);
          if (match) {
            const hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            const seconds = parseFloat(match[3]);
            duration = hours * 3600 + minutes * 60 + seconds;
          }
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    logger.info(
      { outputPath, duration, faceSide, faceRegion, slideRegion: slideAdjusted },
      'Stacked layout rendered'
    );

    return {
      outputPath,
      duration,
      layout: {
        topHeight,
        bottomHeight,
        faceRegion,
        slideRegion: slideAdjusted,
        faceSide,
      },
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Stacked layout reframe failed');
    throw new Error(`Stacked layout reframe failed: ${error.message}`);
  }
}
