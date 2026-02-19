/**
 * Advanced Tracking Service - Fase 3
 *
 * Recursos avançados:
 * - Detecção de múltiplas pessoas
 * - Priorização inteligente (quem está falando)
 * - Zoom automático em momentos-chave
 * - Heat map de importância visual
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';
import { detectROI, type ROI, type ROIDetectionResult } from './roi-detector.js';
import { trackROIOverTime, type ROITrajectory, type TemporalROI } from './temporal-tracking.js';

const logger = createLogger('advanced-tracking');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Representa uma pessoa detectada no frame
 */
export interface DetectedPerson {
  id: number; // ID único da pessoa
  roi: ROI;
  confidence: number;
  isPrimary: boolean; // Pessoa principal (falando ou em foco)
  features: {
    size: number; // Tamanho relativo (0-1)
    position: 'left' | 'center' | 'right';
    isSpeaking?: boolean; // Se está falando (baseado em áudio)
  };
}

/**
 * Frame com múltiplas pessoas detectadas
 */
export interface MultiPersonFrame {
  timestamp: number;
  frameNumber: number;
  people: DetectedPerson[];
  primaryPerson: DetectedPerson | null; // Pessoa em foco
  audioLevel: number; // Nível de áudio (0-1)
}

/**
 * Heat map de importância visual
 */
export interface ImportanceHeatMap {
  timestamp: number;
  heatmap: number[][]; // Grid 10x10 com valores 0-1
  hotspots: Array<{
    x: number;
    y: number;
    intensity: number;
  }>;
}

/**
 * Opções de tracking avançado
 */
export interface AdvancedTrackingOptions {
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9';
  trackingInterval: number;
  minConfidence: number;
  // Recursos avançados
  detectMultiplePeople: boolean;
  prioritizeSpeaker: boolean; // Priorizar quem está falando
  autoZoom: boolean; // Zoom automático em momentos-chave
  zoomIntensity: number; // 0.0 - 1.0 (quanto zoom aplicar)
  smoothTransitions: boolean;
}

/**
 * Resultado de tracking avançado
 */
export interface AdvancedTrackingResult {
  trajectory: ROITrajectory;
  multiPersonFrames: MultiPersonFrame[];
  heatMaps: ImportanceHeatMap[];
  keyMoments: Array<{
    timestamp: number;
    type: 'speech' | 'action' | 'zoom';
    intensity: number;
    description: string;
  }>;
  stats: {
    totalPeopleDetected: number;
    averagePeoplePerFrame: number;
    speechActivity: number; // % de tempo com fala
    primaryPersonChanges: number;
  };
}

/**
 * Extrai níveis de áudio do vídeo
 */
async function extractAudioLevels(
  videoPath: string,
  interval: number = 0.5
): Promise<Array<{ timestamp: number; level: number }>> {
  const tempDir = join('/tmp', `audio-analysis-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const audioFile = join(tempDir, 'audio.wav');

    // Extract audio
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions(['-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1'])
        .output(audioFile)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // Analyze audio levels (simplified - real implementation would use proper audio analysis)
    // For now, return mock data
    const duration = await getVideoDuration(videoPath);
    const levels: Array<{ timestamp: number; level: number }> = [];

    for (let t = 0; t < duration; t += interval) {
      // Mock audio level - in production, use real audio analysis
      levels.push({
        timestamp: t,
        level: Math.random(), // 0-1, higher = more audio activity
      });
    }

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    return levels;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Audio analysis failed');
    return [];
  }
}

/**
 * Detecta múltiplas pessoas em um frame
 */
async function detectMultiplePeople(
  videoPath: string,
  timestamp: number,
  targetAspectRatio: '9:16' | '1:1' | '4:5' | '16:9'
): Promise<DetectedPerson[]> {
  // Simplified implementation - in production, use proper multi-person detection
  // For now, use single person detection from roi-detector
  const roiResult = await detectROI(videoPath, {
    targetAspectRatio,
    sampleInterval: 1,
    minConfidence: 0.5,
  });

  if (!roiResult.roi) {
    return [];
  }

  // Mock: return single person as array
  return [
    {
      id: 1,
      roi: roiResult.roi,
      confidence: roiResult.roi.confidence,
      isPrimary: true,
      features: {
        size: 0.5, // Medium size
        position: 'center',
        isSpeaking: undefined,
      },
    },
  ];
}

/**
 * Determina qual pessoa deve ser priorizada
 */
function determinePrimaryPerson(
  people: DetectedPerson[],
  audioLevel: number,
  options: AdvancedTrackingOptions
): DetectedPerson | null {
  if (people.length === 0) return null;
  if (people.length === 1) return people[0];

  // Multiple people - prioritize based on criteria
  let scores = people.map((person) => {
    let score = person.confidence;

    // Prioritize larger faces
    score += person.features.size * 0.3;

    // Prioritize center position
    if (person.features.position === 'center') {
      score += 0.2;
    }

    // Prioritize speaker (if audio analysis is enabled)
    if (options.prioritizeSpeaker && audioLevel > 0.5) {
      // In production, correlate audio with face position
      score += 0.4;
    }

    return { person, score };
  });

  // Return person with highest score
  scores.sort((a, b) => b.score - a.score);
  return scores[0].person;
}

/**
 * Calcula heat map de importância visual
 */
function calculateImportanceHeatMap(
  people: DetectedPerson[],
  frameWidth: number,
  frameHeight: number
): ImportanceHeatMap['heatmap'] {
  // Create 10x10 grid
  const gridSize = 10;
  const heatmap: number[][] = Array(gridSize)
    .fill(0)
    .map(() => Array(gridSize).fill(0));

  // Add heat for each person
  for (const person of people) {
    const gridX = Math.floor((person.roi.x / frameWidth) * gridSize);
    const gridY = Math.floor((person.roi.y / frameHeight) * gridSize);

    // Add heat to surrounding cells (Gaussian-like distribution)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.max(0, Math.min(gridSize - 1, gridX + dx));
        const y = Math.max(0, Math.min(gridSize - 1, gridY + dy));
        const distance = Math.sqrt(dx * dx + dy * dy);
        const heat = person.confidence * Math.exp(-distance);
        heatmap[y][x] += heat;
      }
    }
  }

  // Normalize
  const maxHeat = Math.max(...heatmap.flat());
  if (maxHeat > 0) {
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        heatmap[y][x] /= maxHeat;
      }
    }
  }

  return heatmap;
}

/**
 * Detecta momentos-chave para zoom automático
 */
function detectKeyMoments(
  multiPersonFrames: MultiPersonFrame[],
  audioLevels: Array<{ timestamp: number; level: number }>
): Array<{ timestamp: number; type: 'speech' | 'action' | 'zoom'; intensity: number; description: string }> {
  const keyMoments: Array<any> = [];

  // Detect speech moments (high audio activity)
  for (const audio of audioLevels) {
    if (audio.level > 0.7) {
      keyMoments.push({
        timestamp: audio.timestamp,
        type: 'speech',
        intensity: audio.level,
        description: 'Alta atividade de fala detectada',
      });
    }
  }

  // Detect action moments (multiple people or movement)
  for (let i = 1; i < multiPersonFrames.length; i++) {
    const prev = multiPersonFrames[i - 1];
    const curr = multiPersonFrames[i];

    // Multiple people detected
    if (curr.people.length > 1 && prev.people.length <= 1) {
      keyMoments.push({
        timestamp: curr.timestamp,
        type: 'action',
        intensity: 0.8,
        description: `${curr.people.length} pessoas detectadas`,
      });
    }

    // Primary person changed
    if (
      prev.primaryPerson &&
      curr.primaryPerson &&
      prev.primaryPerson.id !== curr.primaryPerson.id
    ) {
      keyMoments.push({
        timestamp: curr.timestamp,
        type: 'action',
        intensity: 0.7,
        description: 'Mudança de pessoa em foco',
      });
    }
  }

  // Sort by timestamp
  keyMoments.sort((a, b) => a.timestamp - b.timestamp);

  return keyMoments;
}

/**
 * Aplica zoom automático em momentos-chave
 */
function applyAutoZoom(
  trajectory: ROITrajectory,
  keyMoments: Array<{ timestamp: number; intensity: number }>,
  zoomIntensity: number
): ROITrajectory {
  if (keyMoments.length === 0 || zoomIntensity === 0) {
    return trajectory;
  }

  logger.info({ keyMoments: keyMoments.length, zoomIntensity }, 'Applying auto zoom');

  // Clone trajectory
  const zoomedKeyframes = trajectory.keyframes.map((kf) => {
    // Check if this keyframe is near a key moment
    const nearbyMoment = keyMoments.find(
      (moment) => Math.abs(moment.timestamp - kf.timestamp) < 1.0
    );

    if (nearbyMoment) {
      // Apply zoom by reducing ROI size
      const zoomFactor = 1 - nearbyMoment.intensity * zoomIntensity * 0.3; // Max 30% zoom
      const newWidth = Math.floor(kf.roi.width * zoomFactor);
      const newHeight = Math.floor(kf.roi.height * zoomFactor);

      // Recenter
      const newX = kf.roi.x + Math.floor((kf.roi.width - newWidth) / 2);
      const newY = kf.roi.y + Math.floor((kf.roi.height - newHeight) / 2);

      return {
        ...kf,
        roi: {
          ...kf.roi,
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        },
      };
    }

    return kf;
  });

  return {
    ...trajectory,
    keyframes: zoomedKeyframes,
  };
}

/**
 * Get video duration
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Tracking avançado com múltiplas pessoas e priorização inteligente
 */
export async function advancedTracking(
  videoPath: string,
  options: AdvancedTrackingOptions
): Promise<AdvancedTrackingResult> {
  const {
    targetAspectRatio,
    trackingInterval,
    minConfidence,
    detectMultiplePeople: detectMultiple,
    prioritizeSpeaker,
    autoZoom,
    zoomIntensity,
  } = options;

  logger.info({ videoPath, options }, 'Starting advanced tracking');

  try {
    // Step 1: Basic temporal tracking
    logger.info('Step 1/4: Temporal tracking');
    const trajectory = await trackROIOverTime(videoPath, {
      targetAspectRatio,
      trackingInterval,
      smoothingWindow: 5,
      minConfidence,
      adaptiveTracking: true,
    });

    // Step 2: Audio analysis (if prioritizing speaker)
    logger.info('Step 2/4: Audio analysis');
    const audioLevels = prioritizeSpeaker
      ? await extractAudioLevels(videoPath, trackingInterval)
      : [];

    // Step 3: Multi-person detection (if enabled)
    logger.info('Step 3/4: Multi-person detection');
    const multiPersonFrames: MultiPersonFrame[] = [];

    if (detectMultiple) {
      for (const kf of trajectory.keyframes.slice(0, 10)) {
        // Sample first 10 frames
        const people = await detectMultiplePeople(videoPath, kf.timestamp, targetAspectRatio);
        const audioLevel =
          audioLevels.find((a) => Math.abs(a.timestamp - kf.timestamp) < 0.5)?.level || 0;

        const primaryPerson = determinePrimaryPerson(people, audioLevel, options);

        multiPersonFrames.push({
          timestamp: kf.timestamp,
          frameNumber: kf.frameNumber,
          people,
          primaryPerson,
          audioLevel,
        });
      }
    }

    // Step 4: Generate heat maps and detect key moments
    logger.info('Step 4/4: Heat maps and key moments');
    const heatMaps: ImportanceHeatMap[] = [];

    for (const frame of multiPersonFrames) {
      const heatmap = calculateImportanceHeatMap(
        frame.people,
        trajectory.videoMetadata.width,
        trajectory.videoMetadata.height
      );

      // Extract hotspots (cells with high heat)
      const hotspots: Array<{ x: number; y: number; intensity: number }> = [];
      for (let y = 0; y < heatmap.length; y++) {
        for (let x = 0; x < heatmap[y].length; x++) {
          if (heatmap[y][x] > 0.5) {
            hotspots.push({ x, y, intensity: heatmap[y][x] });
          }
        }
      }

      heatMaps.push({
        timestamp: frame.timestamp,
        heatmap,
        hotspots,
      });
    }

    // Detect key moments
    const keyMoments = detectKeyMoments(multiPersonFrames, audioLevels);

    // Apply auto zoom if enabled
    const finalTrajectory = autoZoom
      ? applyAutoZoom(trajectory, keyMoments, zoomIntensity)
      : trajectory;

    // Calculate stats
    const totalPeople = multiPersonFrames.reduce(
      (sum, frame) => sum + frame.people.length,
      0
    );
    const averagePeoplePerFrame =
      multiPersonFrames.length > 0 ? totalPeople / multiPersonFrames.length : 0;
    const speechFrames = audioLevels.filter((a) => a.level > 0.5).length;
    const speechActivity = audioLevels.length > 0 ? speechFrames / audioLevels.length : 0;

    let primaryPersonChanges = 0;
    for (let i = 1; i < multiPersonFrames.length; i++) {
      if (
        multiPersonFrames[i].primaryPerson?.id !==
        multiPersonFrames[i - 1].primaryPerson?.id
      ) {
        primaryPersonChanges++;
      }
    }

    logger.info(
      {
        totalPeople,
        averagePeoplePerFrame: averagePeoplePerFrame.toFixed(2),
        speechActivity: (speechActivity * 100).toFixed(1) + '%',
        keyMoments: keyMoments.length,
      },
      'Advanced tracking completed'
    );

    return {
      trajectory: finalTrajectory,
      multiPersonFrames,
      heatMaps,
      keyMoments,
      stats: {
        totalPeopleDetected: totalPeople,
        averagePeoplePerFrame,
        speechActivity,
        primaryPersonChanges,
      },
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Advanced tracking failed');
    throw new Error(`Advanced tracking failed: ${error.message}`);
  }
}
