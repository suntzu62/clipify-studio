/**
 * Highlight Detector Service
 *
 * Combina análises de áudio, emoções e fala para detectar
 * momentos emocionantes com potencial viral:
 * - Calcula score de viralidade para cada momento
 * - Identifica highlights (picos de emoção + áudio + palavras-chave)
 * - Ranqueia momentos por potencial viral
 */

import { createLogger } from '../config/logger.js';
import type { AudioAnalysisResult, AudioPeak } from './audio-analyzer.js';
import type { EmotionAnalysisResult, EmotionalMoment } from './emotion-detector.js';
import type { SpeechAnalysisResult, Keyword } from './speech-analyzer.js';
import { generateHookDescription, type HookContext } from './description-gpt.js';

const logger = createLogger('highlight-detector');

/**
 * Momento destacado (highlight) com score de viralidade
 */
export interface Highlight {
  timestamp: number;
  duration: number;
  viralScore: number; // 0-100: Potencial viral
  components: {
    audioScore: number; // 0-1: Contribuição do áudio
    emotionScore: number; // 0-1: Contribuição das emoções
    speechScore: number; // 0-1: Contribuição da fala
  };
  reasons: string[]; // Lista de razões para o destaque
  tags: string[]; // Tags para categorização
  confidence: number; // 0-1: Confiança geral
}

/**
 * Opções de detecção de highlights
 */
export interface HighlightDetectionOptions {
  minViralScore?: number; // Score mínimo para considerar highlight (padrão: 60)
  maxHighlights?: number; // Número máximo de highlights (padrão: 10)
  minDuration?: number; // Duração mínima de um highlight (padrão: 2s)
  maxDuration?: number; // Duração máxima de um highlight (padrão: 30s)
  weights?: {
    audio?: number; // Peso da análise de áudio (padrão: 0.3)
    emotion?: number; // Peso das emoções (padrão: 0.4)
    speech?: number; // Peso da fala (padrão: 0.3)
  };
}

/**
 * Resultado da detecção de highlights
 */
export interface HighlightDetectionResult {
  highlights: Highlight[];
  coverage: number; // % do vídeo coberto por highlights
  stats: {
    totalHighlights: number;
    averageViralScore: number;
    topScore: number;
    totalDuration: number;
  };
}

/**
 * Momento temporal genérico para scoring
 */
interface ScoredMoment {
  timestamp: number;
  duration: number;
  audioScore: number;
  emotionScore: number;
  speechScore: number;
  reasons: string[];
  tags: string[];
}

/**
 * Calcula score de áudio para momentos específicos
 */
function scoreAudioMoments(
  audioAnalysis: AudioAnalysisResult,
  timestamp: number,
  duration: number
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Check for audio peaks in this time range
  const relevantPeaks = audioAnalysis.peaks.filter(
    (peak) =>
      peak.timestamp >= timestamp && peak.timestamp <= timestamp + duration
  );

  if (relevantPeaks.length > 0) {
    const maxIntensity = Math.max(...relevantPeaks.map((p) => p.intensity));
    score += maxIntensity * 0.6;

    for (const peak of relevantPeaks) {
      if (peak.intensity > 0.7) {
        reasons.push(peak.description);
      }
    }
  }

  // Check average energy in this range
  const relevantFeatures = audioAnalysis.features.filter(
    (f) => f.timestamp >= timestamp && f.timestamp <= timestamp + duration
  );

  if (relevantFeatures.length > 0) {
    const avgEnergy =
      relevantFeatures.reduce((sum, f) => sum + f.energy, 0) /
      relevantFeatures.length;

    if (avgEnergy > audioAnalysis.stats.averageEnergy * 1.3) {
      score += 0.4;
      // Hook will be generated later with full context
    }
  }

  return { score: Math.min(1, score), reasons };
}

/**
 * Calcula score de emoção para momentos específicos
 */
function scoreEmotionMoments(
  emotionAnalysis: EmotionAnalysisResult,
  timestamp: number,
  duration: number
): { score: number; reasons: string[]; tags: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const tags: string[] = [];

  // Check for emotional moments in this time range
  const relevantMoments = emotionAnalysis.moments.filter(
    (moment) =>
      moment.timestamp >= timestamp &&
      moment.timestamp <= timestamp + duration
  );

  if (relevantMoments.length > 0) {
    const maxIntensity = Math.max(...relevantMoments.map((m) => m.intensity));
    score += maxIntensity;

    for (const moment of relevantMoments) {
      if (moment.intensity > 0.6) {
        reasons.push(moment.description);
        tags.push(moment.emotion);
      }
    }
  }

  // Bonus for "viral" emotions (happy, surprised, angry)
  const viralEmotions = relevantMoments.filter((m) =>
    ['happy', 'surprised', 'angry'].includes(m.emotion)
  );

  if (viralEmotions.length > 0) {
    score += 0.2;
  }

  return { score: Math.min(1, score), reasons, tags };
}

/**
 * Calcula score de fala para momentos específicos
 */
function scoreSpeechMoments(
  speechAnalysis: SpeechAnalysisResult,
  timestamp: number,
  duration: number
): { score: number; reasons: string[]; tags: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const tags: string[] = [];

  // Check for keywords in this time range
  const relevantKeywords = speechAnalysis.keywords.filter(
    (kw) => kw.timestamp >= timestamp && kw.timestamp <= timestamp + duration
  );

  if (relevantKeywords.length > 0) {
    // More keywords = higher score
    score += Math.min(0.6, relevantKeywords.length * 0.15);

    // Categorize keywords
    const categories = new Set(relevantKeywords.map((kw) => kw.category));

    for (const category of categories) {
      tags.push(category);
    }

    if (categories.has('viral') || categories.has('excitement')) {
      score += 0.3;
      // Hook will be generated later with full context
    }

    if (categories.has('emotion')) {
      score += 0.2;
      // Hook will be generated later with full context
    }
  }

  // Check for positive sentiment
  const relevantSentiments = speechAnalysis.sentiments.filter(
    (s) => s.timestamp >= timestamp && s.timestamp <= timestamp + duration
  );

  if (relevantSentiments.length > 0) {
    const avgIntensity =
      relevantSentiments.reduce((sum, s) => sum + s.intensity, 0) /
      relevantSentiments.length;

    if (avgIntensity > 0.6) {
      score += 0.2;
      // Hook will be generated later with full context
    }
  }

  return { score: Math.min(1, score), reasons, tags };
}

/**
 * Gera momentos candidatos a partir das análises
 */
async function generateCandidateMoments(
  audioAnalysis: AudioAnalysisResult,
  emotionAnalysis: EmotionAnalysisResult,
  speechAnalysis: SpeechAnalysisResult,
  videoDuration: number
): Promise<ScoredMoment[]> {
  const candidates: ScoredMoment[] = [];
  const seenTimestamps = new Set<number>();

  // From audio peaks
  for (const peak of audioAnalysis.peaks) {
    const timestamp = Math.floor(peak.timestamp);
    if (!seenTimestamps.has(timestamp)) {
      seenTimestamps.add(timestamp);

      const duration = Math.max(2, Math.min(10, peak.duration));

      const audioScoreData = scoreAudioMoments(audioAnalysis, timestamp, duration);
      const emotionScoreData = scoreEmotionMoments(
        emotionAnalysis,
        timestamp,
        duration
      );
      const speechScoreData = scoreSpeechMoments(speechAnalysis, timestamp, duration);

      candidates.push({
        timestamp,
        duration,
        audioScore: audioScoreData.score,
        emotionScore: emotionScoreData.score,
        speechScore: speechScoreData.score,
        reasons: [
          ...audioScoreData.reasons,
          ...emotionScoreData.reasons,
          ...speechScoreData.reasons,
        ],
        tags: [...emotionScoreData.tags, ...speechScoreData.tags],
      });
    }
  }

  // From emotional moments
  for (const moment of emotionAnalysis.moments) {
    const timestamp = Math.floor(moment.timestamp);
    if (!seenTimestamps.has(timestamp)) {
      seenTimestamps.add(timestamp);

      const duration = Math.max(2, Math.min(10, moment.duration));

      const audioScoreData = scoreAudioMoments(audioAnalysis, timestamp, duration);
      const emotionScoreData = scoreEmotionMoments(
        emotionAnalysis,
        timestamp,
        duration
      );
      const speechScoreData = scoreSpeechMoments(speechAnalysis, timestamp, duration);

      candidates.push({
        timestamp,
        duration,
        audioScore: audioScoreData.score,
        emotionScore: emotionScoreData.score,
        speechScore: speechScoreData.score,
        reasons: [
          ...audioScoreData.reasons,
          ...emotionScoreData.reasons,
          ...speechScoreData.reasons,
        ],
        tags: [...emotionScoreData.tags, ...speechScoreData.tags],
      });
    }
  }

  // From keywords
  for (const keyword of speechAnalysis.keywords) {
    const timestamp = Math.floor(keyword.timestamp);
    if (!seenTimestamps.has(timestamp)) {
      seenTimestamps.add(timestamp);

      const duration = 5; // Default 5s for keyword moments

      const audioScoreData = scoreAudioMoments(audioAnalysis, timestamp, duration);
      const emotionScoreData = scoreEmotionMoments(
        emotionAnalysis,
        timestamp,
        duration
      );
      const speechScoreData = scoreSpeechMoments(speechAnalysis, timestamp, duration);

      candidates.push({
        timestamp,
        duration,
        audioScore: audioScoreData.score,
        emotionScore: emotionScoreData.score,
        speechScore: speechScoreData.score,
        reasons: [
          ...audioScoreData.reasons,
          ...emotionScoreData.reasons,
          ...speechScoreData.reasons,
        ],
        tags: [...emotionScoreData.tags, ...speechScoreData.tags],
      });
    }
  }

  // Generate AI hooks for candidates with significant scores
  logger.debug({ candidatesCount: candidates.length }, 'Generating AI hooks for candidates');

  await Promise.all(
    candidates.map(async (candidate) => {
      // Only generate hooks for moments with meaningful scores
      const hasSignificantScore =
        candidate.audioScore > 0.3 ||
        candidate.emotionScore > 0.3 ||
        candidate.speechScore > 0.3;

      if (!hasSignificantScore) {
        return;
      }

      try {
        // Extract data for hook context
        const relevantKeywords = speechAnalysis.keywords.filter(
          (kw) =>
            kw.timestamp >= candidate.timestamp &&
            kw.timestamp <= candidate.timestamp + candidate.duration
        );

        const relevantEmotions = emotionAnalysis.moments.filter(
          (m) =>
            m.timestamp >= candidate.timestamp &&
            m.timestamp <= candidate.timestamp + candidate.duration
        );

        const relevantSentiments = speechAnalysis.sentiments.filter(
          (s) =>
            s.timestamp >= candidate.timestamp &&
            s.timestamp <= candidate.timestamp + candidate.duration
        );

        const relevantSpeechSegments = speechAnalysis.segments.filter(
          (s) =>
            s.timestamp <= candidate.timestamp + candidate.duration &&
            s.timestamp + s.duration >= candidate.timestamp
        );
        const transcript = relevantSpeechSegments
          .map((s) => s.text)
          .join(' ')
          .trim();

        const relevantFeatures = audioAnalysis.features.filter(
          (f) =>
            f.timestamp >= candidate.timestamp &&
            f.timestamp <= candidate.timestamp + candidate.duration
        );

        // Calculate average energy
        const avgEnergy =
          relevantFeatures.length > 0
            ? relevantFeatures.reduce((sum, f) => sum + f.energy, 0) /
              relevantFeatures.length
            : 0;

        const audioEnergyRatio =
          audioAnalysis.stats.averageEnergy > 0
            ? avgEnergy / audioAnalysis.stats.averageEnergy
            : 1;

        // Build hook context
        const hookContext: HookContext = {
          audioEnergy: audioEnergyRatio,
          emotions: relevantEmotions.map((m) => m.emotion),
          emotionIntensity:
            relevantEmotions.length > 0
              ? Math.max(...relevantEmotions.map((m) => m.intensity))
              : 0,
          keywords: relevantKeywords.map((kw) => kw.word),
          keywordCategories: Array.from(
            new Set(relevantKeywords.map((kw) => kw.category))
          ),
          sentiment:
            relevantSentiments.length > 0
              ? relevantSentiments.reduce((sum, s) => sum + s.intensity, 0) /
                relevantSentiments.length
              : 0,
          clipDuration: candidate.duration,
          transcript: transcript || undefined,
        };

        // Generate hook using GPT-4o
        const hook = await generateHookDescription(hookContext);

        // Add hook to reasons (only if not already present)
        if (hook && !candidate.reasons.includes(hook)) {
          candidate.reasons.unshift(hook); // Add at the beginning for prominence
        }
      } catch (error: any) {
        logger.warn(
          {
            error: error.message,
            timestamp: candidate.timestamp,
          },
          'Failed to generate hook for candidate, keeping existing reasons'
        );
        // Continue with existing reasons if hook generation fails
      }
    })
  );

  logger.debug(
    {
      candidatesWithHooks: candidates.filter((c) => c.reasons.length > 0).length,
    },
    'AI hooks generation completed'
  );

  return candidates;
}

/**
 * Calcula score viral combinando componentes
 */
function calculateViralScore(
  moment: ScoredMoment,
  weights: { audio: number; emotion: number; speech: number }
): number {
  const weightedScore =
    moment.audioScore * weights.audio +
    moment.emotionScore * weights.emotion +
    moment.speechScore * weights.speech;

  // Bonus for having multiple strong signals
  const strongSignals = [
    moment.audioScore > 0.6,
    moment.emotionScore > 0.6,
    moment.speechScore > 0.6,
  ].filter(Boolean).length;

  const bonus = strongSignals >= 2 ? 0.2 : 0;

  return Math.min(100, (weightedScore + bonus) * 100);
}

/**
 * Mescla momentos sobrepostos
 */
function mergeOverlappingMoments(moments: Highlight[]): Highlight[] {
  if (moments.length === 0) return [];

  const sorted = [...moments].sort((a, b) => a.timestamp - b.timestamp);
  const merged: Highlight[] = [];

  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Check for overlap
    if (next.timestamp <= current.timestamp + current.duration) {
      // Merge - keep higher score
      const combinedDuration =
        Math.max(
          current.timestamp + current.duration,
          next.timestamp + next.duration
        ) - current.timestamp;

      current = {
        timestamp: current.timestamp,
        duration: combinedDuration,
        viralScore: Math.max(current.viralScore, next.viralScore),
        components:
          current.viralScore > next.viralScore
            ? current.components
            : next.components,
        reasons: [...new Set([...current.reasons, ...next.reasons])],
        tags: [...new Set([...current.tags, ...next.tags])],
        confidence: Math.max(current.confidence, next.confidence),
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
 * Detecta highlights combinando todas as análises
 */
export async function detectHighlights(
  audioAnalysis: AudioAnalysisResult,
  emotionAnalysis: EmotionAnalysisResult,
  speechAnalysis: SpeechAnalysisResult,
  videoDuration: number,
  options: HighlightDetectionOptions = {}
): Promise<HighlightDetectionResult> {
  const {
    minViralScore = 60,
    maxHighlights = 10,
    minDuration = 2,
    maxDuration = 30,
    weights: weightsInput = {},
  } = options;

  // Ensure weights always have all required properties
  const weights = {
    audio: weightsInput.audio ?? 0.3,
    emotion: weightsInput.emotion ?? 0.4,
    speech: weightsInput.speech ?? 0.3,
  };

  logger.info({ minViralScore, maxHighlights }, 'Detecting highlights');

  // Generate candidate moments (with AI-generated hooks)
  const candidates = await generateCandidateMoments(
    audioAnalysis,
    emotionAnalysis,
    speechAnalysis,
    videoDuration
  );

  logger.info({ candidates: candidates.length }, 'Generated candidate moments');

  // Calculate viral scores
  const highlights: Highlight[] = candidates
    .map((moment) => {
      const viralScore = calculateViralScore(moment, weights);
      const confidence = Math.min(
        1,
        (moment.audioScore + moment.emotionScore + moment.speechScore) / 3
      );

      return {
        timestamp: moment.timestamp,
        duration: Math.max(minDuration, Math.min(maxDuration, moment.duration)),
        viralScore,
        components: {
          audioScore: moment.audioScore,
          emotionScore: moment.emotionScore,
          speechScore: moment.speechScore,
        },
        reasons: moment.reasons.filter((r, i, arr) => arr.indexOf(r) === i), // Unique
        tags: moment.tags.filter((t, i, arr) => arr.indexOf(t) === i), // Unique
        confidence,
      };
    })
    .filter((h) => h.viralScore >= minViralScore);

  logger.info({ beforeMerge: highlights.length }, 'Highlights before merging');

  // Merge overlapping moments
  const merged = mergeOverlappingMoments(highlights);

  // Sort by viral score (descending)
  merged.sort((a, b) => b.viralScore - a.viralScore);

  // Take top N
  const topHighlights = merged.slice(0, maxHighlights);

  // Calculate stats
  const totalDuration = topHighlights.reduce((sum, h) => sum + h.duration, 0);
  const coverage = (totalDuration / videoDuration) * 100;
  const averageViralScore =
    topHighlights.length > 0
      ? topHighlights.reduce((sum, h) => sum + h.viralScore, 0) /
        topHighlights.length
      : 0;
  const topScore = topHighlights.length > 0 ? topHighlights[0].viralScore : 0;

  logger.info(
    {
      highlights: topHighlights.length,
      coverage: coverage.toFixed(1) + '%',
      avgScore: averageViralScore.toFixed(0),
      topScore: topScore.toFixed(0),
    },
    'Highlight detection completed'
  );

  return {
    highlights: topHighlights,
    coverage,
    stats: {
      totalHighlights: topHighlights.length,
      averageViralScore,
      topScore,
      totalDuration,
    },
  };
}
