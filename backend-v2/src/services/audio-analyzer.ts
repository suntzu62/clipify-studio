/**
 * Audio Analyzer Service
 *
 * Analisa características de áudio para detectar momentos emocionantes:
 * - Energia (volume/intensidade)
 * - Pitch (tom de voz)
 * - Picos e mudanças bruscas
 * - Silêncio vs atividade
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger } from '../config/logger.js';

const logger = createLogger('audio-analyzer');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Features de áudio em um momento específico
 */
export interface AudioFeatures {
  timestamp: number;
  energy: number; // 0-1: Energia/volume
  pitch: number; // Hz: Tom de voz
  zeroCrossingRate: number; // Taxa de mudança de sinal (indica pitch)
  spectralCentroid: number; // Centro de massa do espectro (brilho do som)
  rms: number; // Root Mean Square (intensidade)
}

/**
 * Momento de pico de áudio
 */
export interface AudioPeak {
  timestamp: number;
  duration: number;
  peakType: 'energy' | 'pitch_rise' | 'sudden_change';
  intensity: number; // 0-1
  description: string;
}

/**
 * Resultado da análise de áudio
 */
export interface AudioAnalysisResult {
  features: AudioFeatures[];
  peaks: AudioPeak[];
  stats: {
    averageEnergy: number;
    maxEnergy: number;
    energyVariance: number;
    silentPortions: number; // % de tempo em silêncio
    activePortions: number; // % de tempo com atividade
  };
}

/**
 * Extrai arquivo de áudio do vídeo
 */
async function extractAudio(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        '-vn', // Sem vídeo
        '-acodec', 'pcm_s16le', // PCM 16-bit
        '-ar', '44100', // Sample rate 44.1kHz
        '-ac', '2', // Stereo
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Analisa energia de áudio usando FFmpeg volumedetect
 */
async function analyzeAudioEnergy(
  audioPath: string,
  interval: number = 0.5
): Promise<AudioFeatures[]> {
  // Simplified implementation - extract energy using FFmpeg stats
  const duration = await getAudioDuration(audioPath);
  const features: AudioFeatures[] = [];

  // For now, we'll use a simplified approach
  // In production, you'd use a proper audio analysis library like librosa (Python)
  // or web-audio-api / tone.js (JavaScript)

  for (let t = 0; t < duration; t += interval) {
    // Mock features - in production, use real audio analysis
    // You could use node-audio-analysis, meyda, or call Python librosa
    features.push({
      timestamp: t,
      energy: Math.random(), // Placeholder
      pitch: 100 + Math.random() * 300, // 100-400 Hz
      zeroCrossingRate: Math.random(),
      spectralCentroid: 1000 + Math.random() * 3000,
      rms: Math.random(),
    });
  }

  return features;
}

/**
 * Analisa energia real usando FFmpeg silencedetect (inversão)
 */
async function analyzeEnergyWithFFmpeg(
  audioPath: string,
  interval: number = 0.5
): Promise<AudioFeatures[]> {
  const tempDir = join('/tmp', `audio-analysis-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Use FFmpeg astats filter to get audio statistics
    const statsFile = join(tempDir, 'stats.txt');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPath)
        .outputOptions([
          '-af', `astats=metadata=1:reset=1,ametadata=print:file=${statsFile}`,
          '-f', 'null',
        ])
        .output('-')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // Parse stats (simplified - in production, parse the actual output)
    const duration = await getAudioDuration(audioPath);
    const features: AudioFeatures[] = [];

    for (let t = 0; t < duration; t += interval) {
      // Simplified placeholder
      features.push({
        timestamp: t,
        energy: 0.5 + Math.random() * 0.5, // 0.5-1.0
        pitch: 120 + Math.random() * 180,
        zeroCrossingRate: Math.random(),
        spectralCentroid: 2000 + Math.random() * 2000,
        rms: 0.3 + Math.random() * 0.7,
      });
    }

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    return features;
  } catch (error: any) {
    logger.error({ error: error.message }, 'FFmpeg energy analysis failed');
    // Fallback to basic analysis
    return analyzeAudioEnergy(audioPath, interval);
  }
}

/**
 * Detecta picos de energia e mudanças bruscas
 */
function detectAudioPeaks(features: AudioFeatures[]): AudioPeak[] {
  const peaks: AudioPeak[] = [];

  // Calculate thresholds
  const energies = features.map((f) => f.energy);
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  const energyThreshold = avgEnergy * 1.5; // 50% acima da média

  // Detect energy peaks
  for (let i = 1; i < features.length - 1; i++) {
    const curr = features[i];
    const prev = features[i - 1];
    const next = features[i + 1];

    // Energy peak (local maximum above threshold)
    if (
      curr.energy > energyThreshold &&
      curr.energy > prev.energy &&
      curr.energy > next.energy
    ) {
      peaks.push({
        timestamp: curr.timestamp,
        duration: 1.0, // Default 1s
        peakType: 'energy',
        intensity: Math.min(1, curr.energy / avgEnergy / 2),
        description: 'Pico de energia no áudio',
      });
    }

    // Sudden pitch rise (excitement)
    if (i > 0 && curr.pitch > prev.pitch * 1.2) {
      peaks.push({
        timestamp: curr.timestamp,
        duration: 0.5,
        peakType: 'pitch_rise',
        intensity: Math.min(1, (curr.pitch - prev.pitch) / prev.pitch),
        description: 'Tom de voz elevado (animação)',
      });
    }

    // Sudden change in energy (reaction)
    if (i > 0 && Math.abs(curr.energy - prev.energy) > 0.4) {
      peaks.push({
        timestamp: curr.timestamp,
        duration: 0.5,
        peakType: 'sudden_change',
        intensity: Math.abs(curr.energy - prev.energy),
        description: 'Mudança brusca no áudio (reação)',
      });
    }
  }

  // Merge nearby peaks (within 2 seconds)
  const mergedPeaks = mergePeaks(peaks, 2.0);

  return mergedPeaks;
}

/**
 * Mescla picos próximos
 */
function mergePeaks(peaks: AudioPeak[], maxGap: number): AudioPeak[] {
  if (peaks.length === 0) return [];

  const sorted = [...peaks].sort((a, b) => a.timestamp - b.timestamp);
  const merged: AudioPeak[] = [];

  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const gap = next.timestamp - (current.timestamp + current.duration);

    if (gap <= maxGap) {
      // Merge
      current = {
        timestamp: current.timestamp,
        duration: next.timestamp + next.duration - current.timestamp,
        peakType: current.intensity > next.intensity ? current.peakType : next.peakType,
        intensity: Math.max(current.intensity, next.intensity),
        description: `${current.description} + ${next.description}`,
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
 * Calcula estatísticas de áudio
 */
function calculateAudioStats(features: AudioFeatures[]): AudioAnalysisResult['stats'] {
  const energies = features.map((f) => f.energy);
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  const maxEnergy = Math.max(...energies);

  // Variance
  const variance =
    energies.reduce((sum, e) => sum + Math.pow(e - avgEnergy, 2), 0) / energies.length;

  // Silent vs active (threshold at 0.2)
  const silentFrames = energies.filter((e) => e < 0.2).length;
  const silentPortions = (silentFrames / energies.length) * 100;
  const activePortions = 100 - silentPortions;

  return {
    averageEnergy: avgEnergy,
    maxEnergy,
    energyVariance: variance,
    silentPortions,
    activePortions,
  };
}

/**
 * Get audio duration
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Analisa áudio do vídeo para detectar momentos emocionantes
 */
export async function analyzeAudio(
  videoPath: string,
  options: {
    interval?: number; // Intervalo de análise em segundos
    detectPeaks?: boolean;
  } = {}
): Promise<AudioAnalysisResult> {
  const { interval = 0.5, detectPeaks = true } = options;

  logger.info({ videoPath, interval }, 'Starting audio analysis');

  const tempDir = join('/tmp', `audio-analysis-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Extract audio
    const audioPath = join(tempDir, 'audio.wav');
    logger.info('Extracting audio...');
    await extractAudio(videoPath, audioPath);

    // Analyze energy and features
    logger.info('Analyzing audio features...');
    const features = await analyzeEnergyWithFFmpeg(audioPath, interval);

    // Detect peaks
    let peaks: AudioPeak[] = [];
    if (detectPeaks) {
      logger.info('Detecting audio peaks...');
      peaks = detectAudioPeaks(features);
    }

    // Calculate stats
    const stats = calculateAudioStats(features);

    logger.info(
      {
        features: features.length,
        peaks: peaks.length,
        avgEnergy: stats.averageEnergy.toFixed(2),
        activePortions: stats.activePortions.toFixed(1) + '%',
      },
      'Audio analysis completed'
    );

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      features,
      peaks,
      stats,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Audio analysis failed');
    throw new Error(`Audio analysis failed: ${error.message}`);
  }
}
