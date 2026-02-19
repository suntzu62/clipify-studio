import { createLogger } from '../config/logger.js';

const logger = createLogger('virality-score');

// ============================================
// TYPES
// ============================================

export interface ViralityComponents {
  hookStrength: number;    // 0-100
  contentDensity: number;  // 0-100
  emotionalImpact: number; // 0-100
  narrativeArc: number;    // 0-100
}

export type ViralityLabel = 'viral' | 'high' | 'medium' | 'low';

export interface ViralityResult {
  viralityScore: number;           // 0-100
  viralityComponents: ViralityComponents;
  viralityLabel: ViralityLabel;
}

export interface ViralityInput {
  /** GPT-4o-mini ranking score (0-1) */
  gptScore: number;
  /** Generated title */
  title: string;
  /** Reason / hook description */
  reason: string;
  /** Keywords extracted by analysis */
  keywords: string[];
  /** Clip duration in seconds */
  duration: number;
  /** Full transcript text for the clip segment */
  transcript: string;
}

// ============================================
// IMPACT / HOOK KEYWORDS
// ============================================

const HOOK_QUESTION_PATTERNS = [
  /^(você sabia|por que|como |o que |será que|qual |quando |quem )/i,
  /\?/,
];

const IMPACT_WORDS = [
  'nunca', 'segredo', 'incrível', 'chocante', 'surpreendente',
  'impressionante', 'absurdo', 'revelado', 'exclusivo', 'urgente',
  'bomba', 'polêmico', 'proibido', 'verdade', 'mentira',
  'pior', 'melhor', 'primeiro', 'último', 'único',
];

const STRONG_ASSERTION_PATTERNS = [
  /^(isso|este|esta|esse|essa) (é|foi|será|vai)/i,
  /^(a verdade|o segredo|o problema|a solução)/i,
  /^(pare de|nunca mais|sempre |jamais )/i,
];

const EMOTION_WORDS = [
  'amor', 'ódio', 'medo', 'alegria', 'tristeza', 'raiva',
  'chorar', 'rir', 'emocionante', 'arrepiante', 'lindo',
  'horrível', 'maravilhoso', 'terrível', 'fantástico',
  'assustador', 'inspirador', 'motivador', 'revoltante',
];

const CTA_PATTERNS = [
  /siga|segue|inscreva|compartilh|coment|curta|like|salve/i,
  /link na bio|link nos comentários|deixa.*comentário/i,
  /parte (2|dois|3|três)|próximo vídeo|continua/i,
];

// ============================================
// SCORING FUNCTIONS
// ============================================

/**
 * Analyze hook strength from the first ~5 seconds of transcript.
 * Checks for questions, numbers, impact words, and strong assertions.
 */
function calculateHookStrength(transcript: string, title: string, reason: string): number {
  // Approximate first 5 seconds: ~15 words at normal speech rate
  const words = transcript.split(/\s+/);
  const hookText = words.slice(0, 15).join(' ');
  const combinedText = `${title} ${reason} ${hookText}`.toLowerCase();

  let score = 40; // Base score

  // Question in hook (+15)
  const hasQuestion = HOOK_QUESTION_PATTERNS.some(p => p.test(hookText));
  if (hasQuestion) score += 15;

  // Number/statistic in hook (+12)
  const hasNumber = /\d+/.test(hookText);
  if (hasNumber) score += 12;

  // Impact words (+8 each, max 24)
  const impactCount = IMPACT_WORDS.filter(w => combinedText.includes(w)).length;
  score += Math.min(impactCount * 8, 24);

  // Strong assertion (+10)
  const hasStrongAssertion = STRONG_ASSERTION_PATTERNS.some(p => p.test(hookText));
  if (hasStrongAssertion) score += 10;

  // Title is compelling (length between 20-80 chars, not generic) (+5)
  if (title.length >= 20 && title.length <= 80) score += 5;

  // Short hook text (concise = better) (+5)
  if (hookText.split(/\s+/).length <= 12 && hookText.length > 10) score += 5;

  return clamp(score, 0, 100);
}

/**
 * Analyze content density from the full transcript.
 * Measures words-per-second, keyword diversity, and presence of data.
 */
function calculateContentDensity(transcript: string, keywords: string[], duration: number): number {
  const words = transcript.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  let score = 35; // Base score

  // Words per second (optimal: 2.5-4 wps for Portuguese)
  const wps = duration > 0 ? wordCount / duration : 0;
  if (wps >= 2.5 && wps <= 4.0) {
    score += 25; // Optimal pacing
  } else if (wps >= 1.5 && wps < 2.5) {
    score += 15; // Slightly slow
  } else if (wps > 4.0 && wps <= 5.5) {
    score += 18; // Slightly fast
  } else {
    score += 5; // Too slow or too fast
  }

  // Keyword diversity (+3 per unique keyword, max 18)
  const uniqueKeywords = new Set(keywords.map(k => k.toLowerCase()));
  score += Math.min(uniqueKeywords.size * 3, 18);

  // Numbers/data present (+8)
  const numberMatches = transcript.match(/\d+/g);
  if (numberMatches && numberMatches.length >= 2) {
    score += 8;
  } else if (numberMatches && numberMatches.length >= 1) {
    score += 4;
  }

  // Vocabulary richness (unique words / total words)
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const richness = wordCount > 0 ? uniqueWords.size / wordCount : 0;
  if (richness >= 0.6) score += 10;
  else if (richness >= 0.4) score += 5;

  return clamp(score, 0, 100);
}

/**
 * Analyze emotional impact using GPT score + keyword sentiment.
 */
function calculateEmotionalImpact(gptScore: number, transcript: string, title: string): number {
  const combinedText = `${title} ${transcript}`.toLowerCase();

  // GPT score already captures emotional peaks (0-1 → 0-50 contribution)
  let score = Math.round(gptScore * 50);

  // Emotion words (+6 each, max 30)
  const emotionCount = EMOTION_WORDS.filter(w => combinedText.includes(w)).length;
  score += Math.min(emotionCount * 6, 30);

  // Exclamation marks indicate emphasis (+3 each, max 12)
  const exclamations = (transcript.match(/!/g) || []).length;
  score += Math.min(exclamations * 3, 12);

  // Uppercase words (emphasis) (+2 each, max 8)
  const uppercaseWords = (transcript.match(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}\b/g) || []).length;
  score += Math.min(uppercaseWords * 2, 8);

  return clamp(score, 0, 100);
}

/**
 * Analyze narrative arc completeness.
 * Checks for clear beginning (hook), development, and conclusion/CTA.
 */
function calculateNarrativeArc(transcript: string, duration: number): number {
  const words = transcript.split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;

  if (totalWords < 5) return 20; // Too short to analyze

  const thirds = Math.ceil(totalWords / 3);
  const firstThird = words.slice(0, thirds).join(' ').toLowerCase();
  const lastThird = words.slice(-thirds).join(' ').toLowerCase();

  let score = 30; // Base score

  // Has clear hook / opening (+20)
  const hasHook =
    HOOK_QUESTION_PATTERNS.some(p => p.test(firstThird)) ||
    STRONG_ASSERTION_PATTERNS.some(p => p.test(firstThird)) ||
    IMPACT_WORDS.some(w => firstThird.includes(w));
  if (hasHook) score += 20;

  // Has conclusion / CTA (+20)
  const hasCTA = CTA_PATTERNS.some(p => p.test(lastThird));
  const hasConclusion =
    /então|portanto|conclu|resumindo|por isso|resultado|final/i.test(lastThird);
  if (hasCTA) score += 20;
  else if (hasConclusion) score += 15;

  // Duration in sweet spot for narrative (20-60s) (+15)
  if (duration >= 20 && duration <= 60) {
    score += 15;
  } else if (duration >= 10 && duration < 20) {
    score += 8;
  } else if (duration > 60 && duration <= 90) {
    score += 10;
  }

  // Content length sufficient for development (+10)
  if (totalWords >= 30) score += 10;
  else if (totalWords >= 15) score += 5;

  return clamp(score, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getViralityLabel(score: number): ViralityLabel {
  if (score >= 85) return 'viral';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Calculate a unified virality score from available pipeline data.
 * No extra processing required — uses transcript, GPT score, and keywords.
 */
export function calculateViralityScore(input: ViralityInput): ViralityResult {
  try {
    const hookStrength = calculateHookStrength(input.transcript, input.title, input.reason);
    const contentDensity = calculateContentDensity(input.transcript, input.keywords, input.duration);
    const emotionalImpact = calculateEmotionalImpact(input.gptScore, input.transcript, input.title);
    const narrativeArc = calculateNarrativeArc(input.transcript, input.duration);

    const viralityScore = Math.round(
      hookStrength * 0.25 +
      contentDensity * 0.25 +
      emotionalImpact * 0.25 +
      narrativeArc * 0.25
    );

    const result: ViralityResult = {
      viralityScore: clamp(viralityScore, 0, 100),
      viralityComponents: {
        hookStrength,
        contentDensity,
        emotionalImpact,
        narrativeArc,
      },
      viralityLabel: getViralityLabel(viralityScore),
    };

    logger.debug(
      { score: result.viralityScore, label: result.viralityLabel, components: result.viralityComponents },
      'Virality score calculated'
    );

    return result;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to calculate virality score, returning defaults');
    return {
      viralityScore: 50,
      viralityComponents: {
        hookStrength: 50,
        contentDensity: 50,
        emotionalImpact: 50,
        narrativeArc: 50,
      },
      viralityLabel: 'medium',
    };
  }
}
