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
  mergeThreshold?: number;
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
    mergeThreshold = 2.5,
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
    padding,
    mergeThreshold
  );

  const fallbackScenes = createFallbackScenes(
    transcript,
    minSceneDuration,
    maxSceneDuration,
    padding,
    targetSceneCount
  );

  const candidateScenes = dedupeScenes([...scenes, ...fallbackScenes]);

  // Step 3: Rank scenes by confidence
  const rankedScenes = candidateScenes.sort((a, b) => b.confidence - a.confidence);

  // Step 4: Select top scenes
  const selectedScenes = rankedScenes.slice(0, Math.min(targetSceneCount, rankedScenes.length));

  logger.info(
    {
      totalScenes: scenes.length,
      candidateScenes: candidateScenes.length,
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
  padding: number,
  mergeThreshold: number
): DetectedScene[] {
  // Sort boundaries by timestamp
  const sortedBoundaries = [...boundaries].sort((a, b) => a.timestamp - b.timestamp);

  // Merge nearby boundaries (within 5 seconds)
  const mergedBoundaries = mergeBoundaries(sortedBoundaries, mergeThreshold);

  // Create scenes between boundaries
  const scenes: DetectedScene[] = [];
  let sceneStart = 0;

  for (const boundary of mergedBoundaries) {
    const sceneEnd = boundary.timestamp;
    const duration = sceneEnd - sceneStart;

    // Only create scene if duration is reasonable (use relaxed minimum to capture more candidates)
    if (duration >= minDuration * 0.5 && duration <= maxDuration * 1.5) {
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
    if (duration >= minDuration * 0.5) {
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

  // Filter out scenes that are too long (keep relaxed minimum for more candidates)
  return scenes.filter((scene) => scene.duration <= maxDuration * 1.2);
}

function createFallbackScenes(
  transcript: Transcript,
  minDuration: number,
  maxDuration: number,
  padding: number,
  targetSceneCount: number
): DetectedScene[] {
  if (transcript.segments.length === 0) {
    return [];
  }

  const idealDuration = Math.max(minDuration, Math.min(maxDuration, (minDuration + maxDuration) / 2));
  const step = Math.max(6, Math.floor(Math.max(minDuration * 0.55, idealDuration * 0.45)));
  const candidateStarts = new Set<number>();
  const maxCandidates = Math.max(targetSceneCount * 3, 30);

  for (let cursor = 0; cursor < transcript.duration; cursor += step) {
    candidateStarts.add(Number(cursor.toFixed(2)));
  }

  for (const segment of transcript.segments) {
    if (candidateStarts.size >= maxCandidates) {
      break;
    }

    const snappedStart = Math.max(0, Math.floor(segment.start / Math.max(4, Math.floor(step / 2))) * Math.max(4, Math.floor(step / 2)));
    candidateStarts.add(Number(snappedStart.toFixed(2)));
  }

  const starts = Array.from(candidateStarts)
    .filter((start) => start < transcript.duration - Math.max(8, minDuration * 0.5))
    .sort((a, b) => a - b)
    .slice(0, maxCandidates);

  return starts.flatMap((start) => {
    const rawEnd = Math.min(transcript.duration, start + idealDuration);
    const rawStart = Math.max(0, rawEnd - idealDuration);
    const paddedStart = Math.max(0, rawStart - padding);
    const paddedEnd = Math.min(transcript.duration, rawEnd + padding);
    const sceneSegments = transcript.segments.filter(
      (seg) => seg.end > paddedStart && seg.start < paddedEnd
    );

    if (sceneSegments.length === 0) {
      return [];
    }

    const sceneStart = Math.max(0, Math.min(...sceneSegments.map((seg) => seg.start), paddedStart));
    const sceneEnd = Math.min(
      transcript.duration,
      Math.max(...sceneSegments.map((seg) => seg.end), paddedEnd)
    );
    const duration = sceneEnd - sceneStart;

    if (duration < Math.max(8, minDuration * 0.6) || duration > maxDuration * 1.15) {
      return [];
    }

    const text = sceneSegments.map((seg) => seg.text).join(' ').trim();
    const words = text.split(/\s+/).filter(Boolean);
    const wordDensity = duration > 0 ? words.length / duration : 0;
    const triggerBonus = /[!?]|\b\d+\b|\b(como|porque|segredo|erro|atencao|olha)\b/i.test(text) ? 0.08 : 0;
    const densityBonus = Math.min(0.25, wordDensity / 10);
    const confidence = Math.min(0.78, 0.38 + densityBonus + triggerBonus);

    return [{
      start: sceneStart,
      end: sceneEnd,
      duration,
      segments: sceneSegments,
      text,
      confidence,
      boundaryTypes: ['fallback_window'],
    }];
  });
}

function dedupeScenes(scenes: DetectedScene[]): DetectedScene[] {
  const unique = new Map<string, DetectedScene>();

  for (const scene of scenes) {
    const key = `${Math.round(scene.start)}-${Math.round(scene.end)}`;
    const existing = unique.get(key);

    if (!existing || scene.confidence > existing.confidence) {
      unique.set(key, scene);
    }
  }

  return Array.from(unique.values());
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
