import { createLogger } from '../config/logger.js';
import type { Transcript, TranscriptSegment } from '../types/index.js';

const logger = createLogger('scene-detection');

export interface SceneBoundary {
  timestamp: number;
  type: 'silence' | 'semantic' | 'punctuation' | 'topic_change';
  confidence: number; // 0-1
}

export interface DetectedScene {
  start: number;
  end: number;
  confidence: number;
  segments: TranscriptSegment[];
  text: string;
  duration: number;
  boundaryTypes: string[];
}

interface SceneDetectionOptions {
  minSilenceDuration?: number; // seconds
  minSceneDuration?: number; // seconds
  maxSceneDuration?: number; // seconds
  padding?: number; // seconds to add at start/end for smooth transitions
  targetSceneCount?: number;
}

/**
 * Detecta cenas inteligentemente usando múltiplos critérios:
 * - Pausas de áudio (silêncios > 1s)
 * - Mudanças semânticas no texto
 * - Limites de frase/pontuação
 */
export async function detectScenes(
  transcript: Transcript,
  options: SceneDetectionOptions = {}
): Promise<DetectedScene[]> {
  const {
    minSilenceDuration = 1.0,
    minSceneDuration = 30,
    maxSceneDuration = 90,
    padding = 0.4, // 400ms padding
    targetSceneCount = 10,
  } = options;

  logger.info(
    {
      segmentCount: transcript.segments.length,
      duration: transcript.duration,
      targetSceneCount,
    },
    'Starting scene detection'
  );

  // Step 1: Detect all potential boundaries
  const boundaries = detectBoundaries(transcript, minSilenceDuration);

  logger.debug(
    {
      silenceBoundaries: boundaries.filter((b) => b.type === 'silence').length,
      punctuationBoundaries: boundaries.filter((b) => b.type === 'punctuation').length,
      semanticBoundaries: boundaries.filter((b) => b.type === 'semantic').length,
    },
    'Boundaries detected'
  );

  // Step 2: Merge boundaries and create scenes
  const scenes = createScenesFromBoundaries(
    transcript,
    boundaries,
    minSceneDuration,
    maxSceneDuration,
    padding
  );

  // Step 3: Rank scenes by confidence
  const rankedScenes = scenes.sort((a, b) => b.confidence - a.confidence);

  // Step 4: Select top scenes
  const selectedScenes = rankedScenes.slice(0, Math.min(targetSceneCount, rankedScenes.length));

  logger.info(
    {
      totalScenes: scenes.length,
      selectedScenes: selectedScenes.length,
      avgDuration: selectedScenes.reduce((sum, s) => sum + s.duration, 0) / selectedScenes.length,
    },
    'Scene detection completed'
  );

  return selectedScenes.sort((a, b) => a.start - b.start); // Sort by start time
}

/**
 * Detecta todos os tipos de boundaries na transcrição
 */
function detectBoundaries(transcript: Transcript, minSilenceDuration: number): SceneBoundary[] {
  const boundaries: SceneBoundary[] = [];

  // 1. Detectar silêncios (gaps entre segmentos)
  for (let i = 0; i < transcript.segments.length - 1; i++) {
    const current = transcript.segments[i];
    const next = transcript.segments[i + 1];
    const gap = next.start - current.end;

    if (gap >= minSilenceDuration) {
      boundaries.push({
        timestamp: current.end + gap / 2, // Middle of the silence
        type: 'silence',
        confidence: Math.min(1.0, gap / 3.0), // Longer silences = higher confidence
      });
    }
  }

  // 2. Detectar pontuação forte (final de sentenças)
  for (let i = 0; i < transcript.segments.length; i++) {
    const segment = transcript.segments[i];
    const text = segment.text.trim();

    // Pontuação final: . ! ? ...
    if (/[.!?…]$/.test(text)) {
      boundaries.push({
        timestamp: segment.end,
        type: 'punctuation',
        confidence: 0.7,
      });
    }

    // Pontuação forte no meio do texto (múltiplas sentenças)
    const strongPunctuation = text.match(/[.!?]\s+/g);
    if (strongPunctuation && strongPunctuation.length > 0) {
      // Estimate timestamp for each punctuation mark
      const words = text.split(/\s+/);
      const wordsBeforePunct = text.split(/[.!?]\s+/)[0].split(/\s+/).length;
      const relativePosition = wordsBeforePunct / words.length;
      const punctTimestamp = segment.start + (segment.end - segment.start) * relativePosition;

      boundaries.push({
        timestamp: punctTimestamp,
        type: 'punctuation',
        confidence: 0.6,
      });
    }
  }

  // 3. Detectar mudanças semânticas (topic changes)
  const semanticBoundaries = detectSemanticChanges(transcript.segments);
  boundaries.push(...semanticBoundaries);

  return boundaries;
}

/**
 * Detecta mudanças semânticas no texto usando heurísticas
 */
function detectSemanticChanges(segments: TranscriptSegment[]): SceneBoundary[] {
  const boundaries: SceneBoundary[] = [];

  // Topic transition indicators
  const transitionPhrases = [
    'agora',
    'então',
    'mas',
    'porém',
    'entretanto',
    'voltando',
    'mudando de assunto',
    'falando sobre',
    'próximo',
    'próxima',
    'outro ponto',
    'outra coisa',
    'além disso',
    'por outro lado',
  ];

  for (let i = 1; i < segments.length; i++) {
    const current = segments[i];
    const text = current.text.toLowerCase().trim();

    // Check for transition phrases at the beginning
    const hasTransition = transitionPhrases.some((phrase) => text.startsWith(phrase));

    if (hasTransition) {
      boundaries.push({
        timestamp: current.start,
        type: 'semantic',
        confidence: 0.75,
      });
    }

    // Check for topic change based on keyword diversity
    // If the current segment has very different words from previous segments, it might be a topic change
    if (i >= 3) {
      const prevWords = new Set(
        segments
          .slice(i - 3, i)
          .flatMap((s) => s.text.toLowerCase().split(/\s+/))
          .filter((w) => w.length > 4) // Only consider words > 4 chars
      );

      const currentWords = current.text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);

      const overlapCount = currentWords.filter((w) => prevWords.has(w)).length;
      const overlapRatio = currentWords.length > 0 ? overlapCount / currentWords.length : 1;

      // Low overlap = potential topic change
      if (overlapRatio < 0.3 && currentWords.length >= 5) {
        boundaries.push({
          timestamp: current.start,
          type: 'topic_change',
          confidence: 0.65,
        });
      }
    }
  }

  return boundaries;
}

/**
 * Cria cenas a partir dos boundaries detectados
 */
function createScenesFromBoundaries(
  transcript: Transcript,
  boundaries: SceneBoundary[],
  minDuration: number,
  maxDuration: number,
  padding: number
): DetectedScene[] {
  // Sort boundaries by timestamp
  const sortedBoundaries = [...boundaries].sort((a, b) => a.timestamp - b.timestamp);

  // Merge nearby boundaries (within 5 seconds)
  const mergedBoundaries = mergeBoundaries(sortedBoundaries, 5.0);

  // Create scenes between boundaries
  const scenes: DetectedScene[] = [];
  let sceneStart = 0;

  for (const boundary of mergedBoundaries) {
    const sceneEnd = boundary.timestamp;
    const duration = sceneEnd - sceneStart;

    // Only create scene if duration is reasonable
    if (duration >= minDuration && duration <= maxDuration * 1.5) {
      // Apply padding (but don't go negative or beyond video duration)
      const paddedStart = Math.max(0, sceneStart - padding);
      const paddedEnd = Math.min(transcript.duration, sceneEnd + padding);

      // Get segments in this scene
      const sceneSegments = transcript.segments.filter(
        (seg) => seg.start >= paddedStart && seg.end <= paddedEnd
      );

      if (sceneSegments.length > 0) {
        scenes.push({
          start: paddedStart,
          end: paddedEnd,
          duration: paddedEnd - paddedStart,
          segments: sceneSegments,
          text: sceneSegments.map((s) => s.text).join(' '),
          confidence: boundary.confidence,
          boundaryTypes: [boundary.type],
        });
      }
    }

    sceneStart = boundary.timestamp;
  }

  // Add final scene
  if (sceneStart < transcript.duration) {
    const duration = transcript.duration - sceneStart;
    if (duration >= minDuration) {
      const paddedStart = Math.max(0, sceneStart - padding);
      const sceneSegments = transcript.segments.filter(
        (seg) => seg.start >= paddedStart && seg.end <= transcript.duration
      );

      scenes.push({
        start: paddedStart,
        end: transcript.duration,
        duration: transcript.duration - paddedStart,
        segments: sceneSegments,
        text: sceneSegments.map((s) => s.text).join(' '),
        confidence: 0.5,
        boundaryTypes: ['end'],
      });
    }
  }

  // Filter out scenes that are too long
  return scenes.filter((scene) => scene.duration <= maxDuration);
}

/**
 * Merge boundaries that are too close together
 */
function mergeBoundaries(boundaries: SceneBoundary[], threshold: number): SceneBoundary[] {
  if (boundaries.length === 0) return [];

  const merged: SceneBoundary[] = [boundaries[0]];

  for (let i = 1; i < boundaries.length; i++) {
    const current = boundaries[i];
    const last = merged[merged.length - 1];

    if (current.timestamp - last.timestamp < threshold) {
      // Merge: keep the one with higher confidence
      if (current.confidence > last.confidence) {
        merged[merged.length - 1] = current;
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}
