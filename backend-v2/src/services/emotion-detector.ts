/**
 * Emotion Detector Service
 *
 * Detecta emoções faciais em vídeos usando face-api.js:
 * - Feliz (happy)
 * - Surpreso (surprised)
 * - Com raiva (angry)
 * - Triste (sad)
 * - Neutro (neutral)
 * - Medo (fearful)
 * - Enojado (disgusted)
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';

const logger = createLogger('emotion-detector');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// Lazy load face-api to avoid startup errors
let faceapi: any = null;
let canvas: any = null;

async function loadFaceAPI() {
  if (faceapi) return faceapi;

  try {
    faceapi = await import('@vladmandic/face-api');
    canvas = await import('canvas');

    const { Canvas, Image, ImageData } = canvas;
    faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

    // Load models
    const modelPath = join(process.cwd(), 'models');
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath);
    await faceapi.nets.faceExpressionNet.loadFromDisk(modelPath);

    logger.info('face-api loaded with expression recognition');
    return faceapi;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to load face-api for emotions');
    throw new Error('face-api not available for emotion detection');
  }
}

/**
 * Emoções detectadas
 */
export type Emotion =
  | 'happy'
  | 'surprised'
  | 'angry'
  | 'sad'
  | 'neutral'
  | 'fearful'
  | 'disgusted';

/**
 * Emoção em um momento específico
 */
export interface EmotionDetection {
  timestamp: number;
  emotions: {
    [key in Emotion]: number; // 0-1 confidence
  };
  dominantEmotion: Emotion;
  confidence: number; // Confiança da emoção dominante
  faceDetected: boolean;
}

/**
 * Momento emocional destacado
 */
export interface EmotionalMoment {
  timestamp: number;
  duration: number;
  emotion: Emotion;
  intensity: number; // 0-1
  description: string;
}

/**
 * Resultado da análise emocional
 */
export interface EmotionAnalysisResult {
  detections: EmotionDetection[];
  moments: EmotionalMoment[];
  stats: {
    totalFaces: number;
    faceDetectionRate: number; // %
    emotionDistribution: { [key in Emotion]: number }; // % de tempo em cada emoção
    mostCommonEmotion: Emotion;
    emotionalVariety: number; // Número de emoções diferentes detectadas
  };
}

/**
 * Extrai frames do vídeo
 */
async function extractFrames(
  videoPath: string,
  outputDir: string,
  interval: number
): Promise<string[]> {
  await fs.mkdir(outputDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions(['-vf', `fps=1/${interval}`, '-q:v', '2'])
      .output(join(outputDir, 'frame-%04d.jpg'))
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  const files = await fs.readdir(outputDir);
  return files
    .filter((f) => f.startsWith('frame-') && f.endsWith('.jpg'))
    .sort()
    .map((f) => join(outputDir, f));
}

/**
 * Detecta emoções em uma imagem
 */
async function detectEmotionsInImage(imagePath: string): Promise<EmotionDetection | null> {
  const api = await loadFaceAPI();
  const { Image } = canvas;

  try {
    // Load image
    const img = await canvas.loadImage(imagePath);
    const imgCanvas = canvas.createCanvas(img.width, img.height);
    const ctx = imgCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Detect faces with expressions
    const detections = await api
      .detectAllFaces(imgCanvas, new api.TinyFaceDetectorOptions({ inputSize: 224 }))
      .withFaceExpressions();

    if (detections.length === 0) {
      return {
        timestamp: 0, // Will be set later
        emotions: {
          happy: 0,
          surprised: 0,
          angry: 0,
          sad: 0,
          neutral: 0,
          fearful: 0,
          disgusted: 0,
        },
        dominantEmotion: 'neutral',
        confidence: 0,
        faceDetected: false,
      };
    }

    // Use first face (or average if multiple)
    const expressions = detections[0].expressions;

    // Map face-api expressions to our Emotion type
    const emotions: EmotionDetection['emotions'] = {
      happy: expressions.happy || 0,
      surprised: expressions.surprised || 0,
      angry: expressions.angry || 0,
      sad: expressions.sad || 0,
      neutral: expressions.neutral || 0,
      fearful: expressions.fearful || 0,
      disgusted: expressions.disgusted || 0,
    };

    // Find dominant emotion
    let dominantEmotion: Emotion = 'neutral';
    let maxConfidence = 0;

    for (const [emotion, confidence] of Object.entries(emotions)) {
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        dominantEmotion = emotion as Emotion;
      }
    }

    return {
      timestamp: 0, // Will be set later
      emotions,
      dominantEmotion,
      confidence: maxConfidence,
      faceDetected: true,
    };
  } catch (error: any) {
    logger.error({ error: error.message, imagePath }, 'Emotion detection failed for image');
    return null;
  }
}

/**
 * Detecta momentos emocionais destacados
 */
function detectEmotionalMoments(detections: EmotionDetection[]): EmotionalMoment[] {
  const moments: EmotionalMoment[] = [];

  // Emoções "virais" que queremos detectar
  const viralEmotions: Emotion[] = ['happy', 'surprised', 'angry'];

  for (let i = 0; i < detections.length; i++) {
    const detection = detections[i];

    // Skip if no face detected
    if (!detection.faceDetected) continue;

    // Check for viral emotions with high confidence
    if (
      viralEmotions.includes(detection.dominantEmotion) &&
      detection.confidence > 0.6
    ) {
      // Calculate duration (until emotion changes)
      let duration = 1.0;
      for (let j = i + 1; j < detections.length; j++) {
        if (detections[j].dominantEmotion !== detection.dominantEmotion) {
          break;
        }
        duration += detections[j].timestamp - detections[j - 1].timestamp;
      }

      moments.push({
        timestamp: detection.timestamp,
        duration,
        emotion: detection.dominantEmotion,
        intensity: detection.confidence,
        description: getEmotionDescription(detection.dominantEmotion),
      });
    }
  }

  // Merge nearby moments of same emotion (within 3 seconds)
  const merged = mergeEmotionalMoments(moments, 3.0);

  return merged;
}

/**
 * Mescla momentos emocionais próximos
 */
function mergeEmotionalMoments(
  moments: EmotionalMoment[],
  maxGap: number
): EmotionalMoment[] {
  if (moments.length === 0) return [];

  const sorted = [...moments].sort((a, b) => a.timestamp - b.timestamp);
  const merged: EmotionalMoment[] = [];

  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const gap = next.timestamp - (current.timestamp + current.duration);

    if (gap <= maxGap && current.emotion === next.emotion) {
      // Merge
      current = {
        timestamp: current.timestamp,
        duration: next.timestamp + next.duration - current.timestamp,
        emotion: current.emotion,
        intensity: Math.max(current.intensity, next.intensity),
        description: current.description,
      };
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Descrição da emoção em português
 */
function getEmotionDescription(emotion: Emotion): string {
  const descriptions: { [key in Emotion]: string } = {
    happy: 'Alegria/Risada detectada',
    surprised: 'Surpresa/Reação forte',
    angry: 'Raiva/Intensidade',
    sad: 'Tristeza',
    neutral: 'Neutro',
    fearful: 'Medo',
    disgusted: 'Nojo',
  };

  return descriptions[emotion];
}

/**
 * Calcula estatísticas emocionais
 */
function calculateEmotionStats(
  detections: EmotionDetection[]
): EmotionAnalysisResult['stats'] {
  const facesDetected = detections.filter((d) => d.faceDetected).length;
  const faceDetectionRate = (facesDetected / detections.length) * 100;

  // Emotion distribution
  const emotionCounts: { [key in Emotion]: number } = {
    happy: 0,
    surprised: 0,
    angry: 0,
    sad: 0,
    neutral: 0,
    fearful: 0,
    disgusted: 0,
  };

  for (const detection of detections) {
    if (detection.faceDetected) {
      emotionCounts[detection.dominantEmotion]++;
    }
  }

  const emotionDistribution: { [key in Emotion]: number } = {} as any;
  let mostCommonEmotion: Emotion = 'neutral';
  let maxCount = 0;

  for (const emotion of Object.keys(emotionCounts) as Emotion[]) {
    const count = emotionCounts[emotion];
    emotionDistribution[emotion] = (count / facesDetected) * 100;

    if (count > maxCount) {
      maxCount = count;
      mostCommonEmotion = emotion;
    }
  }

  // Emotional variety (how many different emotions were detected)
  const emotionalVariety = Object.values(emotionCounts).filter((c) => c > 0).length;

  return {
    totalFaces: facesDetected,
    faceDetectionRate,
    emotionDistribution,
    mostCommonEmotion,
    emotionalVariety,
  };
}

/**
 * Analisa emoções faciais em um vídeo
 */
export async function analyzeEmotions(
  videoPath: string,
  options: {
    interval?: number; // Intervalo entre frames em segundos
    detectMoments?: boolean;
  } = {}
): Promise<EmotionAnalysisResult> {
  const { interval = 2.0, detectMoments = true } = options;

  logger.info({ videoPath, interval }, 'Starting emotion analysis');

  const tempDir = join('/tmp', `emotion-analysis-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Extract frames
    logger.info('Extracting frames...');
    const framesDir = join(tempDir, 'frames');
    const framePaths = await extractFrames(videoPath, framesDir, interval);

    logger.info({ frames: framePaths.length }, 'Frames extracted');

    // Detect emotions in each frame
    logger.info('Detecting emotions...');
    const detections: EmotionDetection[] = [];

    for (let i = 0; i < framePaths.length; i++) {
      const framePath = framePaths[i];
      const timestamp = i * interval;

      const detection = await detectEmotionsInImage(framePath);
      if (detection) {
        detection.timestamp = timestamp;
        detections.push(detection);
      }

      if ((i + 1) % 10 === 0) {
        logger.debug({ processed: i + 1, total: framePaths.length }, 'Progress');
      }
    }

    // Detect emotional moments
    let moments: EmotionalMoment[] = [];
    if (detectMoments) {
      logger.info('Detecting emotional moments...');
      moments = detectEmotionalMoments(detections);
    }

    // Calculate stats
    const stats = calculateEmotionStats(detections);

    logger.info(
      {
        detections: detections.length,
        moments: moments.length,
        faceDetectionRate: stats.faceDetectionRate.toFixed(1) + '%',
        mostCommonEmotion: stats.mostCommonEmotion,
      },
      'Emotion analysis completed'
    );

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      detections,
      moments,
      stats,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Emotion analysis failed');
    throw new Error(`Emotion analysis failed: ${error.message}`);
  }
}
