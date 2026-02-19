import { createLogger } from '../config/logger.js';
import type { AudioAnalysisResult } from './audio-analyzer.js';
import type { EmotionAnalysisResult } from './emotion-detector.js';
import type { SpeechAnalysisResult } from './speech-analyzer.js';

const logger = createLogger('hook-detector');

export type HookPattern =
  | 'question'
  | 'shocking'
  | 'promise'
  | 'storytelling'
  | 'visual_impact'
  | 'emotional_peak'
  | 'unknown';

export interface HookAnalysis {
  hookScore: number;
  duration: number;
  components: {
    audioImpact: number;
    emotionalHook: number;
    verbalHook: number;
    visualEnergy: number;
  };
  pattern: HookPattern;
  patternConfidence: number;
  insights: {
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };
  retentionPrediction: {
    first3s: number;
    first5s: number;
    confidence: 'high' | 'medium' | 'low';
  };
  benchmark: {
    category: 'excellent' | 'good' | 'average' | 'poor';
    percentile: number;
    message: string;
  };
}

export interface HookAnalysisOptions {
  duration?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function detectPattern(
  speech: SpeechAnalysisResult,
  emotions: EmotionAnalysisResult,
  audioEnergyBoost: number
): HookPattern {
  const keywords = speech.keywords.map((kw) => kw.word.toLowerCase());
  const text = keywords.join(' ');

  if (text.includes('?') || keywords.some((kw) => ['por', 'que', 'como', 'sabia'].some((w) => kw.includes(w)))) {
    return 'question';
  }
  if (keywords.some((kw) => ['chocante', 'nunca', 'ninguém', 'impossível', 'segredo'].includes(kw))) {
    return 'shocking';
  }
  if (keywords.some((kw) => ['vou', 'mostrar', 'como', 'tutorial', 'guia'].includes(kw))) {
    return 'promise';
  }
  if (keywords.some((kw) => ['era', 'história', 'vez', 'quando'].includes(kw))) {
    return 'storytelling';
  }
  if (audioEnergyBoost > 0.25) {
    return 'visual_impact';
  }
  if (emotions.moments.some((m) => ['happy', 'surprised', 'angry'].includes(m.emotion) && m.intensity > 0.6)) {
    return 'emotional_peak';
  }
  return 'unknown';
}

/**
 * Analisa os primeiros segundos do vídeo e gera um HookAnalysis.
 * Usa sinais de áudio, emoção e fala para estimar retenção inicial.
 */
export async function analyzeHook(
  audio: AudioAnalysisResult,
  emotions: EmotionAnalysisResult,
  speech: SpeechAnalysisResult,
  options: HookAnalysisOptions = {}
): Promise<HookAnalysis> {
  const duration = options.duration ?? 5;

  // Audio window
  const audioWindow = audio.features.filter((f) => f.timestamp <= duration);
  const peaksInWindow = audio.peaks.filter((p) => p.timestamp <= duration);
  const avgEnergy =
    audioWindow.length > 0
      ? audioWindow.reduce((sum, feat) => sum + feat.energy, 0) / audioWindow.length
      : audio.stats.averageEnergy;

  const energyRatio =
    audio.stats.averageEnergy > 0 ? avgEnergy / audio.stats.averageEnergy : 1;
  const peakBoost =
    peaksInWindow.length > 0
      ? Math.min(1, Math.max(...peaksInWindow.map((p) => p.intensity)) * 0.6)
      : 0.1;
  const audioImpact = clamp(0.4 + (energyRatio - 1) * 0.4 + peakBoost, 0.1, 1);

  // Emotion window
  const emotionWindow = emotions.moments.filter((m) => m.timestamp <= duration);
  const emotionalHook =
    emotionWindow.length > 0
      ? clamp(Math.max(...emotionWindow.map((m) => m.intensity)) + 0.2, 0.1, 1)
      : 0.35;

  // Speech window
  const keywordWindow = speech.keywords.filter((kw) => kw.timestamp <= duration);
  const verbalHook = clamp(keywordWindow.length * 0.12 + (speech.stats.keywordDensity || 0) * 0.1, 0.05, 1);

  // Visual energy proxy = emoções + picos de áudio
  const visualEnergy = clamp((emotionalHook * 0.6 + peakBoost * 0.4), 0.1, 1);

  const hookScore = clamp(
    (audioImpact * 0.25 + emotionalHook * 0.3 + verbalHook * 0.3 + visualEnergy * 0.15) * 100,
    40,
    100
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  if (audioImpact > 0.65) {
    strengths.push('🔊 Áudio forte nos 3s iniciais — prende atenção');
  } else {
    recommendations.push('🎶 Adicione efeito sonoro ou trilha que comece antes do 1s');
  }

  if (emotionalHook > 0.6) {
    strengths.push('😊 Expressão/emoção detectada logo no início');
  } else {
    weaknesses.push('😐 Emoção baixa — traga reação mais visível nos primeiros quadros');
  }

  if (verbalHook > 0.6) {
    strengths.push('💬 Palavras de impacto logo no começo');
  } else {
    recommendations.push('🗣️ Use pergunta ou afirmação direta para gerar curiosidade imediata');
  }

  if (visualEnergy > 0.55) {
    strengths.push('🎬 Visual com energia (movimento/cortes rápidos)');
  } else {
    recommendations.push('⚡ Adicione corte rápido/zoom nos 2s iniciais para dinamizar');
  }

  const retention3s = clamp(Math.round(hookScore + (audioImpact > 0.7 ? 8 : 0) + (emotionalHook > 0.6 ? 5 : -5)), 40, 99);
  const retention5s = clamp(retention3s - (visualEnergy > 0.6 ? 2 : 8), 35, 97);

  const benchmark =
    hookScore >= 85
      ? { category: 'excellent' as const, percentile: 95, message: 'Top 10% em retenção inicial' }
      : hookScore >= 70
      ? { category: 'good' as const, percentile: 80, message: 'Gancho acima da média' }
      : hookScore >= 55
      ? { category: 'average' as const, percentile: 55, message: 'Gancho mediano — pode melhorar' }
      : { category: 'poor' as const, percentile: 35, message: 'Gancho fraco — precisa de ajustes rápidos' };

  const pattern = detectPattern(speech, emotions, peakBoost);
  const patternConfidence = clamp(0.55 + peakBoost * 0.6, 0.5, 0.95);

  logger.info(
    {
      hookScore: Math.round(hookScore),
      audioImpact: Number(audioImpact.toFixed(2)),
      emotionalHook: Number(emotionalHook.toFixed(2)),
      verbalHook: Number(verbalHook.toFixed(2)),
      visualEnergy: Number(visualEnergy.toFixed(2)),
      pattern,
    },
    'Hook analysis generated'
  );

  return {
    hookScore: Math.round(hookScore),
    duration,
    components: {
      audioImpact,
      emotionalHook,
      verbalHook,
      visualEnergy,
    },
    pattern,
    patternConfidence,
    insights: {
      strengths,
      weaknesses,
      recommendations,
    },
    retentionPrediction: {
      first3s: retention3s,
      first5s: retention5s,
      confidence: hookScore >= 85 ? 'high' : hookScore >= 70 ? 'medium' : 'low',
    },
    benchmark,
  };
}
