import { promises as fs } from 'fs';
import { join } from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';
import type { HighlightSegment, Transcript, Clip, SubtitlePreferences, ReframeOptions, ReframeResult } from '../types/index.js';
import { DEFAULT_SUBTITLE_PREFERENCES } from '../types/index.js';
import { generateASS, adjustFontSize } from '../utils/subtitle-optimizer.js';
import { detectFacesAtTimestamp, detectROIAtTimestamp, generateCropFilter, type FaceDetectionBox, type ROIDetectionResult } from './roi-detector.js';
import { applyDynamicReframe, cleanupDynamicReframeDir } from './dynamic-reframe.js';
import { selectAutoSplitFacePair } from './auto-split-face-selection.js';

const logger = createLogger('rendering');

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function getVideoMetadata(videoPath: string): Promise<{ width: number; height: number }> {
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
      });
    });
  });
}

async function extractSegment(
  videoPath: string,
  outputPath: string,
  startTime: number,
  duration: number,
  preset: RenderOptions['preset']
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', preset || 'veryfast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

interface RenderOptions {
  format?: '9:16' | '16:9' | '1:1' | '4:5'; // Aspect ratio
  resolution?: { width: number; height: number };
  addSubtitles?: boolean;
  font?: string;
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium';
  ffmpegThreads?: number;
  subtitlePreferences?: SubtitlePreferences;
  reframeOptions?: ReframeOptions; // Intelligent reframing
  reframeMode?: 'auto' | 'single-focus' | 'dual-focus' | 'stacked';
  stackedLayoutOptions?: {
    topRatio?: number;
    facePadding?: number;
    slideWidthRatio?: number;
    preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium' | 'slow';
  };
  onProgress?: (progress: number, message: string) => Promise<void>; // Progress callback
}

type ResolvedRenderOptions = Omit<
  RenderOptions,
  'format' | 'resolution' | 'addSubtitles' | 'font' | 'preset' | 'subtitlePreferences'
> & {
  format: NonNullable<RenderOptions['format']>;
  resolution: { width: number; height: number };
  addSubtitles: boolean;
  font: string;
  preset: NonNullable<RenderOptions['preset']>;
  ffmpegThreads: number;
  subtitlePreferences: SubtitlePreferences;
};

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
  reframeResult?: ReframeResult;
}

function adjustToAspect(
  region: { x: number; y: number; width: number; height: number; confidence: number },
  targetRatio: number,
  frameWidth: number,
  frameHeight: number
) {
  let { x, y, width, height } = region;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const currentRatio = width / height;

  if (currentRatio > targetRatio) {
    const newWidth = height * targetRatio;
    width = newWidth;
  } else {
    const newHeight = width / targetRatio;
    height = newHeight;
  }

  x = centerX - width / 2;
  y = centerY - height / 2;

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

function addPadding(
  roi: { x: number; y: number; width: number; height: number; confidence: number },
  padding: number,
  frameWidth: number,
  frameHeight: number
) {
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
  faceRegion: { x: number; y: number; width: number; height: number },
  slideWidthRatio: number
) {
  const faceCenterX = faceRegion.x + faceRegion.width / 2;
  const faceSide: 'left' | 'right' = faceCenterX > frameWidth / 2 ? 'right' : 'left';

  const slideWidth = clamp(Math.round(frameWidth * slideWidthRatio), Math.round(frameWidth * 0.45), frameWidth);
  const slideX = faceSide === 'right' ? 0 : Math.max(0, frameWidth - slideWidth);

  const slideRegion = {
    x: slideX,
    y: 0,
    width: Math.min(slideWidth, frameWidth - slideX),
    height: frameHeight,
    confidence: 1,
  };

  return { slideRegion, faceSide };
}

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
    preset = 'veryfast',  // veryfast = bom equilíbrio velocidade/estabilidade
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
    const cpuCount = Math.max(1, os.cpus().length || 1);

    // Render clips with controlled concurrency - balanceado para velocidade e estabilidade
    const parsedConcurrency = Number.parseInt(process.env.RENDER_CONCURRENCY || '', 10);
    const maxRecommendedConcurrency = Math.max(1, Math.min(6, cpuCount));
    const defaultConcurrency = Math.max(1, Math.min(4, Math.floor(cpuCount / 2) || 1));
    const concurrency = Number.isFinite(parsedConcurrency)
      ? clamp(parsedConcurrency, 1, maxRecommendedConcurrency)
      : defaultConcurrency;

    const parsedThreads =
      Number.parseInt(process.env.RENDER_FFMPEG_THREADS || '', 10)
      || Number.parseInt(String(options.ffmpegThreads || ''), 10);
    const derivedThreads = Math.max(1, Math.floor(cpuCount / Math.max(1, concurrency)));
    const ffmpegThreads = Number.isFinite(parsedThreads)
      ? clamp(parsedThreads, 1, cpuCount)
      : clamp(derivedThreads, 1, Math.max(1, Math.min(4, cpuCount)));

    const presetFromEnv = (process.env.RENDER_PRESET || '').toLowerCase();
    const validPresets: NonNullable<RenderOptions['preset']>[] = ['ultrafast', 'superfast', 'veryfast', 'fast', 'medium'];
    const effectivePreset = validPresets.includes(presetFromEnv as NonNullable<RenderOptions['preset']>)
      ? (presetFromEnv as NonNullable<RenderOptions['preset']>)
      : preset;

    logger.info(
      { totalClips: segments.length, concurrency, ffmpegThreads, cpuCount, preset: effectivePreset },
      'Rendering clips with optimized concurrency'
    );

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
              resolution,
              format,
              addSubtitles,
              font,
              preset: effectivePreset,
              ffmpegThreads,
              subtitlePreferences,
              reframeOptions: options.reframeOptions,
              reframeMode: options.reframeMode,
              stackedLayoutOptions: options.stackedLayoutOptions,
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
  options: ResolvedRenderOptions
): Promise<RenderedClip> {
  const { start, end } = segment;
  const duration = end - start;

  const videoOutputPath = join(outputDir, `${clipId}.mp4`);
  const thumbnailOutputPath = join(outputDir, `${clipId}.jpg`);

  logger.info({ clipId, start, end, duration }, 'Rendering clip');

  // Track dynamic reframe resources for cleanup
  const tempFiles: string[] = [];
  let dynamicOutputPath: string | null = null;

  try {
    const fastDetectionMode = process.env.RENDER_FAST_DETECTION === 'true';
    const skipAutoSplit = process.env.RENDER_SKIP_AUTO_SPLIT === 'true';
    const isAutoMode = options.reframeMode === 'auto';
    const stackedModeEnabled = options.reframeMode === 'stacked' && options.format === '9:16';
    const { width, height } = options.resolution;
    let baseFilterGraph: string | null = null;
    let reframeResult: ReframeResult | undefined;

    const detectBestROIForSegment = async (params: {
      targetAspectRatio: ReframeOptions['targetAspectRatio'];
      minConfidence: number;
      enableMotion: boolean;
      motionSampleOffset?: number;
    }): Promise<ROIDetectionResult> => {
      const { targetAspectRatio, minConfidence, enableMotion, motionSampleOffset } = params;

      const sampleFractions =
        fastDetectionMode
          ? [0.5]
          : duration >= 8
          ? [0.25, 0.5, 0.75]
          : duration >= 4
            ? [0.35, 0.65]
            : [0.5];

      const timestamps = sampleFractions.map((f) => start + duration * f);
      const results: ROIDetectionResult[] = [];

      for (const ts of timestamps) {
        try {
          results.push(
            await detectROIAtTimestamp(videoPath, ts, {
              targetAspectRatio,
              minConfidence,
              enableMotion,
              motionSampleOffset,
            })
          );
        } catch {
          // Ignore sample failures; we'll fall back to whatever we have.
        }
      }

      const rankMethod = (method: ROIDetectionResult['detectionMethod']) => {
        if (method === 'face') return 3;
        if (method === 'motion') return 2;
        if (method === 'center') return 1;
        return 0;
      };

      const usable = results.filter((r) => r.roi && r.frameWidth && r.frameHeight);
      if (usable.length === 0) {
        // Last resort: single midpoint sample (may throw; let caller handle).
        return await detectROIAtTimestamp(videoPath, start + duration / 2, {
          targetAspectRatio,
          minConfidence,
          enableMotion,
          motionSampleOffset,
        });
      }

      const bestRank = Math.max(...usable.map((r) => rankMethod(r.detectionMethod)));
      const best = usable.filter((r) => rankMethod(r.detectionMethod) === bestRank && r.roi);

      const base = best[0]!;
      if (!base.roi) return base;

      // For 'center' fallback (confidence ~0), averaging is pointless.
      if (bestRank <= 1) return base;

      // Weighted average ROI across samples (same detection tier).
      const frameWidth = base.frameWidth;
      const frameHeight = base.frameHeight;
      const weights = best.map((r) => Math.max(0.001, r.roi?.confidence ?? 0.001));
      const total = weights.reduce((s, w) => s + w, 0) || 1;

      const avg = best.reduce(
        (acc, r, i) => {
          const w = weights[i] / total;
          const roi = r.roi!;
          acc.x += roi.x * w;
          acc.y += roi.y * w;
          acc.width += roi.width * w;
          acc.height += roi.height * w;
          acc.confidence += roi.confidence * w;
          return acc;
        },
        { x: 0, y: 0, width: 0, height: 0, confidence: 0 }
      );

      const clamped = {
        x: Math.round(clamp(avg.x, 0, Math.max(0, frameWidth - avg.width))),
        y: Math.round(clamp(avg.y, 0, Math.max(0, frameHeight - avg.height))),
        width: Math.round(clamp(avg.width, 1, frameWidth)),
        height: Math.round(clamp(avg.height, 1, frameHeight)),
        confidence: clamp(avg.confidence, 0, 1),
      };

      // Ensure ROI stays inside bounds after rounding.
      if (clamped.x + clamped.width > frameWidth) clamped.x = Math.max(0, frameWidth - clamped.width);
      if (clamped.y + clamped.height > frameHeight) clamped.y = Math.max(0, frameHeight - clamped.height);

      return {
        roi: clamped,
        frameWidth,
        frameHeight,
        detectionMethod: base.detectionMethod,
      };
    };

    const buildAutoPeopleSplitFilter = async (): Promise<string | null> => {
      // Detect faces across multiple timestamps for better stability with conversations and cut-heavy edits.
      const sampleFractions =
        fastDetectionMode
          ? [0.25, 0.5, 0.75]
          : duration >= 12
          ? [0.10, 0.22, 0.35, 0.50, 0.65, 0.78, 0.90]
          : duration >= 6
            ? [0.15, 0.35, 0.50, 0.65, 0.85]
            : [0.2, 0.5, 0.8];
      const sampleTimestamps = Array.from(
        new Set(
          sampleFractions.map((fraction) => start + duration * fraction)
        )
      );

      const facePadding = options.stackedLayoutOptions?.facePadding ?? 80;
      const minScore = 0.30;
      const minAreaRatio = 0.004; // ignore tiny/background faces

      const topHeight = Math.round(height * 0.5);
      const bottomHeight = Math.max(1, height - topHeight);

      const faceBoxToROI = (
        face: FaceDetectionBox,
        frameWidth: number,
        frameHeight: number,
        targetRatio: number
      ) => {
        const paddedW = Math.max(1, face.width + facePadding * 2);
        const paddedH = Math.max(1, face.height + facePadding * 2);

        let cropH = Math.max(paddedH, paddedW / targetRatio);
        let cropW = cropH * targetRatio;

        if (cropW > frameWidth) {
          cropW = frameWidth;
          cropH = cropW / targetRatio;
        }
        if (cropH > frameHeight) {
          cropH = frameHeight;
          cropW = cropH * targetRatio;
        }

        cropW = Math.max(1, Math.min(frameWidth, cropW));
        cropH = Math.max(1, Math.min(frameHeight, cropH));

        const centerX = face.x + face.width / 2;
        const centerY = face.y + face.height / 2;

        const x = clamp(centerX - cropW / 2, 0, frameWidth - cropW);
        const y = clamp(centerY - cropH / 2, 0, frameHeight - cropH);

        return {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(cropW),
          height: Math.round(cropH),
        };
      };

      const sampleResults: Array<{
        timestamp: number;
        frameWidth: number;
        frameHeight: number;
        faces: FaceDetectionBox[];
      }> = [];

      for (const ts of sampleTimestamps) {
        try {
          const { faces, frameWidth, frameHeight, timestamp } = await detectFacesAtTimestamp(videoPath, ts);
          if (!frameWidth || !frameHeight || faces.length === 0) continue;
          sampleResults.push({
            timestamp,
            frameWidth,
            frameHeight,
            faces,
          });
        } catch {
          // Ignore frame-level failures and continue with other samples.
        }
      }

      if (sampleResults.length === 0) {
        return null;
      }

      const selectedPair = selectAutoSplitFacePair(sampleResults, {
        minScore,
        minAreaRatio,
        minHorizontalSeparationRatio: 0.22,
      });

      if (!selectedPair) {
        return null;
      }

      const frameWidth = sampleResults[0].frameWidth;
      const frameHeight = sampleResults[0].frameHeight;
      const roiTop = faceBoxToROI(selectedPair.left, frameWidth, frameHeight, width / topHeight);
      const roiBottom = faceBoxToROI(selectedPair.right, frameWidth, frameHeight, width / bottomHeight);

      logger.info(
        { clipId, strategy: selectedPair.strategy },
        'Auto split-screen face pair selected'
      );

      return [
        '[0:v]split=2[top_src][bot_src]',
        `[top_src]crop=${roiTop.width}:${roiTop.height}:${roiTop.x}:${roiTop.y},scale=${width}:${topHeight}:force_original_aspect_ratio=decrease,pad=${width}:${topHeight}:(ow-iw)/2:(oh-ih)/2:color=black[top_v]`,
        `[bot_src]crop=${roiBottom.width}:${roiBottom.height}:${roiBottom.x}:${roiBottom.y},scale=${width}:${bottomHeight}:force_original_aspect_ratio=decrease,pad=${width}:${bottomHeight}:(ow-iw)/2:(oh-ih)/2:color=black[bot_v]`,
        '[top_v][bot_v]vstack=inputs=2',
      ].join(';');
    };

    // Auto mode: only split when we reliably see 2+ people in the clip.
    if (isAutoMode && options.format === '9:16') {
      try {
        const autoSplit = skipAutoSplit ? null : await buildAutoPeopleSplitFilter();
        if (autoSplit) {
          baseFilterGraph = autoSplit;
          logger.info({ clipId }, 'Auto split-screen enabled (2+ faces detected)');
        } else {
          logger.info({ clipId, skipAutoSplit }, 'Auto split-screen not applied');
        }
      } catch (error: any) {
        logger.warn({ clipId, error: error.message }, 'Auto split-screen detection failed; continuing without split');
      }
    }

    // Dynamic reframe (single-focus tracking)
    let inputPath = videoPath;
    let renderStart = start;
    let renderDuration = duration;
    let dynamicApplied = false;

    const reframeOptions = options.reframeOptions;
    const trackingMode = reframeOptions?.trackingMode ?? 'auto';
    const wantsSingleFocus = options.reframeMode === 'single-focus' || options.reframeMode === 'auto';
    const dynamicTrackingEnabled =
      !baseFilterGraph &&
      !stackedModeEnabled &&
      wantsSingleFocus &&
      reframeOptions?.enabled &&
      reframeOptions?.autoDetect &&
      // Dynamic tracking é MUITO mais caro; só roda quando explicitamente solicitado.
      // `auto` deve priorizar velocidade (ROI estático com amostragem).
      (trackingMode === 'dynamic' ||
        (trackingMode === 'auto' && process.env.RENDER_ENABLE_DYNAMIC_REFRAME_AUTO === 'true'));

    if (dynamicTrackingEnabled && reframeOptions) {
      try {
        const tempClipPath = join(outputDir, `${clipId}-segment.mp4`);
        await extractSegment(videoPath, tempClipPath, start, duration, options.preset);
        tempFiles.push(tempClipPath);

        const dynamicResult = await applyDynamicReframe(tempClipPath, {
          targetAspectRatio: reframeOptions.targetAspectRatio,
          targetResolution: options.resolution,
          trackingInterval: reframeOptions.sampleInterval ?? 1,
          smoothingWindow: 5,
          minConfidence: reframeOptions.minConfidence || 0.5,
          adaptiveTracking: true,
          enableMotion: reframeOptions.enableMotion ?? true,
          motionSampleOffset: reframeOptions.motionSampleOffset,
          preset: options.preset,
          exportTrajectory: false,
        });

        inputPath = dynamicResult.outputPath;
        dynamicOutputPath = dynamicResult.outputPath;
        renderStart = 0;
        renderDuration = dynamicResult.duration || duration;
        dynamicApplied = true;

        const firstKeyframe = dynamicResult.trajectory.keyframes[0];
        if (firstKeyframe) {
          reframeResult = {
            enabled: true,
            roi: firstKeyframe.roi,
            detectionMethod: firstKeyframe.detectionMethod,
            targetAspectRatio: reframeOptions.targetAspectRatio,
            trackingMode: trackingMode === 'auto' ? 'dynamic' : trackingMode,
          };
        } else {
          reframeResult = {
            enabled: true,
            roi: { x: 0, y: 0, width, height, confidence: 0 },
            detectionMethod: 'motion',
            targetAspectRatio: reframeOptions.targetAspectRatio,
            trackingMode: trackingMode === 'auto' ? 'dynamic' : trackingMode,
          };
        }

        logger.info({ clipId }, 'Dynamic reframe applied');
      } catch (error: any) {
        logger.warn({ clipId, error: error.message }, 'Dynamic reframe failed, falling back to static');
      }
    }

    if (stackedModeEnabled && !baseFilterGraph) {
      const metadata = await getVideoMetadata(videoPath);
      const topRatio = clamp(options.stackedLayoutOptions?.topRatio ?? 0.6, 0.45, 0.7);
      const bottomHeight = Math.round(height * (1 - topRatio));
      const topHeight = Math.round(height * topRatio);
      const facePadding = options.stackedLayoutOptions?.facePadding ?? 80;
      const slideWidthRatio = options.stackedLayoutOptions?.slideWidthRatio ?? 0.58;
      const midTimestamp = start + duration / 2;

      let faceROI = {
        x: Math.max(0, metadata.width * 0.55),
        y: Math.max(0, metadata.height * 0.25),
        width: Math.max(220, metadata.width * 0.32),
        height: Math.max(320, metadata.height * 0.55),
        confidence: 0,
      };

      const fallbackFaceRight = {
        x: Math.max(0, metadata.width * 0.62),
        y: Math.max(0, metadata.height * 0.45),
        width: Math.max(260, metadata.width * 0.32),
        height: Math.max(320, metadata.height * 0.5),
        confidence: 0,
      };

      const fallbackFaceLeft = {
        x: Math.max(0, metadata.width * 0.06),
        y: Math.max(0, metadata.height * 0.45),
        width: Math.max(260, metadata.width * 0.32),
        height: Math.max(320, metadata.height * 0.5),
        confidence: 0,
      };

      try {
        // Prefer explicit face box at the midpoint for stacked layout (more stable than whole-video averaging).
        const facesResult = await detectFacesAtTimestamp(videoPath, midTimestamp);
        if (facesResult.frameWidth && facesResult.frameHeight && facesResult.faces.length > 0) {
          const frameArea = facesResult.frameWidth * facesResult.frameHeight;
          const significant = facesResult.faces
            .filter((f) => f.score >= 0.35 && (f.width * f.height) / frameArea >= 0.005)
            .sort((a, b) => (b.width * b.height) - (a.width * a.height));

          if (significant.length > 0) {
            const f = significant[0];
            faceROI = { x: f.x, y: f.y, width: f.width, height: f.height, confidence: f.score };
          }
        }

        // If face detection didn't yield anything usable, try ROI at timestamp as a fallback (motion/center).
        if (!faceROI.confidence) {
          const roiDetection = await detectROIAtTimestamp(videoPath, midTimestamp, {
            targetAspectRatio: '16:9',
            minConfidence: 0.3,
            enableMotion: true,
            motionSampleOffset: options.reframeOptions?.motionSampleOffset,
          });
          if (roiDetection.roi) {
            faceROI = roiDetection.roi;
          }
        }
      } catch (error: any) {
        logger.warn({ clipId, error: error.message }, 'Stacked layout detection failed, using fallback regions');
      }

      const faceCoverageW = faceROI.width / metadata.width;
      const faceCoverageH = faceROI.height / metadata.height;

      // Se a detecção for muito ampla ou inexistente, força fallback para garantir o rosto
      if (!faceROI || faceCoverageW > 0.6 || faceCoverageH > 0.7) {
        // Prioriza rosto no canto direito; se a tela for vazia à direita, tente esquerda
        faceROI = faceCoverageW > 0.8 ? fallbackFaceLeft : fallbackFaceRight;
      }

      const paddedFace = addPadding(faceROI, facePadding, metadata.width, metadata.height);
      const faceTargetRatio = width / bottomHeight;
      const faceRegion = adjustToAspect(paddedFace, faceTargetRatio, metadata.width, metadata.height);

      const { slideRegion } = chooseSlideRegion(metadata.width, metadata.height, faceRegion, slideWidthRatio);
      const slideTargetRatio = width / topHeight;
      const slideAdjusted = adjustToAspect(slideRegion, slideTargetRatio, metadata.width, metadata.height);

      baseFilterGraph = [
        '[0:v]split=2[slide_src][face_src]',
        `[slide_src]crop=${slideAdjusted.width}:${slideAdjusted.height}:${slideAdjusted.x}:${slideAdjusted.y},scale=${width}:${topHeight}:force_original_aspect_ratio=decrease,pad=${width}:${topHeight}:(ow-iw)/2:(oh-ih)/2:color=black[slide_v]`,
        `[face_src]crop=${faceRegion.width}:${faceRegion.height}:${faceRegion.x}:${faceRegion.y},scale=${width}:${bottomHeight}:force_original_aspect_ratio=decrease,pad=${width}:${bottomHeight}:(ow-iw)/2:(oh-ih)/2:color=black[face_v]`,
        '[slide_v][face_v]vstack=inputs=2'
      ].join(';');
    }

    // Build FFmpeg filters
    const vfFilters: string[] = [];

    // Intelligent reframing (if enabled)
    if (!baseFilterGraph && !reframeResult && !dynamicApplied && options.reframeOptions?.enabled && options.reframeOptions.autoDetect) {
      try {
        logger.info({ clipId, trackingMode }, 'Applying intelligent reframe');

        const minConfidence = options.reframeOptions.minConfidence || 0.5;
        const enableMotion = options.reframeOptions.enableMotion ?? true;

        // IMPORTANT: ROI must be detected inside the clip range, not over the full video.
        // Otherwise we risk averaging unrelated scenes and cropping the subject out.
        let roiDetection: ROIDetectionResult;
        if (trackingMode === 'static') {
          roiDetection = await detectROIAtTimestamp(videoPath, start + duration / 2, {
            targetAspectRatio: options.reframeOptions.targetAspectRatio,
            minConfidence,
            enableMotion,
            motionSampleOffset: options.reframeOptions.motionSampleOffset,
          });
        } else {
          roiDetection = await detectBestROIForSegment({
            targetAspectRatio: options.reframeOptions.targetAspectRatio,
            minConfidence,
            enableMotion,
            motionSampleOffset: options.reframeOptions.motionSampleOffset,
          });
        }

        if (roiDetection.roi) {
          // Apply intelligent crop
          const cropFilter = generateCropFilter(roiDetection.roi);
          vfFilters.push(cropFilter);

          reframeResult = {
            enabled: true,
            roi: roiDetection.roi,
            detectionMethod: roiDetection.detectionMethod,
            targetAspectRatio: options.reframeOptions.targetAspectRatio,
            trackingMode: trackingMode === 'dynamic' ? 'dynamic' : 'static',
          };

          logger.info(
            { clipId, roi: roiDetection.roi, method: roiDetection.detectionMethod },
            'Intelligent reframe applied'
          );
        }
      } catch (error: any) {
        logger.warn({ clipId, error: error.message }, 'Intelligent reframe failed, using fallback');
      }
    } else if (!baseFilterGraph && options.reframeOptions?.enabled && options.reframeOptions.manualROI) {
      // Manual ROI specified
      const manualROI = {
        ...options.reframeOptions.manualROI,
        confidence: 1.0,
      };
      const cropFilter = generateCropFilter(manualROI);
      vfFilters.push(cropFilter);

      reframeResult = {
        enabled: true,
        roi: manualROI,
        detectionMethod: 'manual',
        targetAspectRatio: options.reframeOptions.targetAspectRatio,
        trackingMode: trackingMode === 'auto' ? 'static' : trackingMode,
      };

      logger.info({ clipId, roi: manualROI }, 'Manual reframe applied');
    }

    // Crop and scale to target aspect ratio (fallback if no reframe)
    // Scaling otimizado: Lanczos preserva nitidez sem flags extras pesadas
    const scaleParams = 'flags=lanczos';

    if (!baseFilterGraph && !reframeResult) {
      // Use traditional center crop
      if (options.format === '9:16') {
        // Vertical format (1080x1920) - Estratégia OTIMIZADA para máxima qualidade
        // 1. CROP PRIMEIRO no tamanho original (minimiza upscale)
        // 2. SCALE depois apenas o necessário
        // Para vídeo 16:9 (1920x1080) -> crop mantendo altura: width = ih*9/16
        vfFilters.push(
          // Crop PRIMEIRO para 9:16 no tamanho original (menos zoom)
          `crop=ih*9/16:ih:(iw-ih*9/16)/2:0`,
          // SCALE depois com Lanczos (upscale mínimo necessário)
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
    } else if (!baseFilterGraph) {
      // Scale after intelligent crop
      vfFilters.push(`scale=${width}:${height}:${scaleParams}`);
    }

    // Add subtitles if requested
    if (options.addSubtitles) {
      const subtitlePrefs = options.subtitlePreferences || DEFAULT_SUBTITLE_PREFERENCES;

      // FORÇAR marginVertical proporcional ao formato e maxCharsPerLine para quebra inteligente
      const marginVerticalByHeight: Record<number, number> = {
        1920: 520,  // 9:16
        1080: 200,  // 1:1 ou 16:9
        1350: 300,  // 4:5
      };
      const proportionalMargin = marginVerticalByHeight[height]
        ?? Math.round(height * 0.29);

      const baseFontSizeByHeight: Record<number, number> = {
        1920: 70,  // 9:16
        1350: 66,  // 4:5
        1080: 60,  // 1:1 ou 16:9
      };

      // Limitar caracteres por linha para legendas profissionais (estilo Opus Clip)
      // Menos caracteres = legendas mais curtas e sem corte nas laterais
      const maxCharsByWidth: Record<number, number> = {
        1080: 26,   // 9:16 vertical - reduzido de 34 para evitar corte
        1920: 40,   // Horizontal - reduzido de 52
      };

      const baseFontSize = baseFontSizeByHeight[height] ?? Math.round(height * 0.036);
      const targetMaxChars = maxCharsByWidth[width] ?? Math.round(width / 32);

      const forcedPrefs = {
        ...subtitlePrefs,
        fontSize: baseFontSize,
        marginVertical: proportionalMargin,  // Proporcional ao formato
        maxCharsPerLine: targetMaxChars,
      };

      logger.info({
        baseFontSize: forcedPrefs.fontSize,
        marginVertical: forcedPrefs.marginVertical,
        maxCharsPerLine: forcedPrefs.maxCharsPerLine
      }, 'Configuração de legendas: 2-3 linhas, largura ampliada, fontSize dinâmico');

      const subtitlesFilter = await buildSubtitlesFilter(
        transcript,
        start,
        end,
        outputDir,
        clipId,
        forcedPrefs,
        options.resolution
      );
      if (subtitlesFilter) {
        if (baseFilterGraph) {
          vfFilters.push(`${baseFilterGraph},${subtitlesFilter}`);
          baseFilterGraph = null; // já convertido em cadeia final
        } else {
          vfFilters.push(subtitlesFilter);
        }
      } else if (baseFilterGraph) {
        vfFilters.push(baseFilterGraph);
        baseFilterGraph = null;
      }
    } else if (baseFilterGraph) {
      vfFilters.push(baseFilterGraph);
      baseFilterGraph = null;
    }

    // NÃO forçar FPS - preservar o framerate original do vídeo
    // Se precisar limitar, use: vfFilters.push('fps=fps=source_fps');

    const vf = vfFilters.join(',');

    // Audio normalization
    const disableAudioNormalization = process.env.RENDER_DISABLE_AUDIO_NORMALIZATION === 'true';
    const af = disableAudioNormalization ? 'anull' : 'loudnorm=I=-14:LRA=11:TP=-1.5';

    // Render video
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(renderStart)
        .setDuration(renderDuration)
        .outputOptions([
          '-map', '0:v:0',
          '-map', '0:a:0',
          '-vf', vf,
          '-af', af,
          '-c:v', 'libx264',
          '-preset', options.preset,
          '-threads', String(options.ffmpegThreads),
          '-profile:v', 'high',
          '-level', '4.2',
          '-pix_fmt', 'yuv420p',
          '-crf', '23', // CRF 23 = qualidade padrão
          '-maxrate', '8M',
          '-bufsize', '12M',
          '-g', '48',
          '-bf', '2',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ac', '2',
          '-ar', '48000',
          '-movflags', '+faststart',
        ])
        .output(videoOutputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // Generate thumbnail
    await generateThumbnail(videoOutputPath, thumbnailOutputPath, renderDuration);

    logger.info({ clipId, videoOutputPath }, 'Clip rendered successfully');

    return {
      id: clipId,
      videoPath: videoOutputPath,
      thumbnailPath: thumbnailOutputPath,
      duration: renderDuration,
      segment,
      reframeResult,
    };
  } catch (error: any) {
    logger.error({ clipId, error: error.message }, 'Clip rendering failed');
    throw error;
  } finally {
    // Cleanup temporary files
    await Promise.all(tempFiles.map((path) => fs.unlink(path).catch(() => {})));
    if (dynamicOutputPath) {
      await cleanupDynamicReframeDir(dynamicOutputPath);
    }
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
  subtitlePreferences: SubtitlePreferences,
  resolution?: { width: number; height: number }
): Promise<string | null> {
  // Get relevant segments for this clip
  const clipSegments = transcript.segments.filter(
    (seg) => seg.start < end && seg.end > start
  );

  if (clipSegments.length === 0) {
    return null;
  }

  // DESATIVADO: Ajuste automático de fonte - SEMPRE usar o fontSize configurado (120px)
  // Para garantir legendas GRANDES como nos concorrentes (Opus Clip/Submagic)
  // const totalText = clipSegments.map((s) => s.text).join(' ');
  // const duration = end - start;
  // const adjustedFontSize = adjustFontSize(totalText, duration, subtitlePreferences.fontSize);
  // const adjustedPreferences = {
  //   ...subtitlePreferences,
  //   fontSize: adjustedFontSize,
  // };

  // SEMPRE usar fontSize das preferências SEM ajuste (120px fixo)
  const adjustedPreferences = subtitlePreferences;

  // Generate ASS file with custom styling
  const assPath = join(outputDir, `${clipId}.ass`);
  const assContent = generateASS(clipSegments, start, adjustedPreferences, resolution);

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

/**
 * Gera thumbnail do clipe
 */
function generateThumbnail(
  videoPath: string,
  thumbnailPath: string,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timestamp = Math.min(3, duration / 3);  // Captura aos 3s para pegar frame com legenda

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
export function getResolutionForFormat(format: '9:16' | '16:9' | '1:1' | '4:5'): { width: number; height: number } {
  switch (format) {
    case '9:16':
      // 1080x1920 para MÁXIMA QUALIDADE
      // Vídeo 1920x1080 -> crop 608x1080 -> scale para 1080x1920 (1.78x upscale)
      // Qualidade superior, arquivo maior mas vale a pena
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
