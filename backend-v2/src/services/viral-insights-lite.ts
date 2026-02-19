import type { HookAnalysis } from './hook-detector.js';
import type { ScoreBreakdown } from './score-breakdown.js';
import type { HookVariation } from './variation-generator.js';
import { generateHookVariations } from './variation-generator.js';

type ClipMeta = {
  id: string;
  title: string;
  description?: string;
  hashtags?: string[];
  duration?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createSeededGenerator(seedInput: string) {
  let seed = seedInput
    .split('')
    .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 1_000_000, 1);

  return (min = 0, max = 1) => {
    seed = (seed * 9301 + 49297) % 233280;
    const rnd = seed / 233280;
    return min + rnd * (max - min);
  };
}

function detectPatternFromText(text: string): HookAnalysis['pattern'] {
  const lower = text.toLowerCase();
  if (lower.includes('?')) return 'question';
  if (lower.includes('!') || lower.includes('chocante') || lower.includes('nunca')) return 'shocking';
  if (lower.includes('como ') || lower.includes('segredo') || lower.includes('vou te mostrar')) return 'promise';
  if (lower.includes('era uma vez') || lower.includes('história')) return 'storytelling';
  if (lower.includes('olha isso') || lower.includes('veja')) return 'visual_impact';
  if (lower.includes('amo') || lower.includes('incrível') || lower.includes('emocion')) return 'emotional_peak';
  return 'unknown';
}

export function buildHookAnalysisFromMetadata(clip: ClipMeta): HookAnalysis {
  const seed = createSeededGenerator(clip.id || clip.title || 'hook');
  const audioImpact = clamp(0.55 + seed(-0.1, 0.25), 0.2, 0.95);
  const emotionalHook = clamp(0.5 + seed(-0.05, 0.3), 0.15, 0.95);
  const verbalHook = clamp(0.48 + seed(-0.08, 0.28), 0.1, 0.95);
  const visualEnergy = clamp(0.42 + seed(-0.05, 0.35), 0.1, 0.9);

  const hookScore = clamp(
    (audioImpact * 0.25 + emotionalHook * 0.3 + verbalHook * 0.3 + visualEnergy * 0.15) * 100 + seed(-4, 6),
    45,
    100
  );

  const text = `${clip.title} ${clip.description || ''} ${(clip.hashtags || []).join(' ')}`;
  const pattern = detectPatternFromText(text);
  const patternConfidence = clamp(0.55 + seed(0, 0.35), 0.5, 0.95);

  const retention3s = clamp(Math.round(hookScore + seed(-5, 8)), 40, 99);
  const retention5s = clamp(Math.round(retention3s - seed(-2, 10)), 35, 97);

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  if (audioImpact > 0.65) strengths.push('🔊 Energia de áudio prende atenção logo no início');
  else recommendations.push('🎧 Adicione efeitos sonoros ou música mais forte nos primeiros segundos');

  if (emotionalHook > 0.6) strengths.push('😊 Expressão/emoção clara nos 3s iniciais');
  else weaknesses.push('😐 Emoção baixa — traga reação ou expressão mais forte na abertura');

  if (verbalHook > 0.6) strengths.push('💬 Frase inicial tem palavras de impacto');
  else recommendations.push('🗣️ Comece com pergunta ou afirmação direta para gerar curiosidade');

  if (visualEnergy > 0.55) strengths.push('🎬 Movimento/visual dinâmico no frame inicial');
  else recommendations.push('🎥 Use cortes rápidos, zoom ou sobreposições para dinamizar o início');

  if (retention5s < 70) weaknesses.push('⏱️ Perda de retenção prevista em 5s — acelere a entrega do valor');

  const benchmarkCategory =
    hookScore >= 85 ? 'excellent' : hookScore >= 70 ? 'good' : hookScore >= 55 ? 'average' : 'poor';

  return {
    hookScore,
    duration: Math.min(clip.duration || 5, 12),
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
    benchmark: {
      category: benchmarkCategory,
      percentile: Math.round(benchmarkCategory === 'excellent' ? 95 : benchmarkCategory === 'good' ? 80 : 60),
      message:
        benchmarkCategory === 'excellent'
          ? 'Top 10% em retenção inicial'
          : benchmarkCategory === 'good'
          ? 'Acima da média — bom gancho'
          : 'Gancho médio, pode melhorar com ajustes rápidos',
    },
  };
}

export function buildScoreBreakdownFromMetadata(clip: ClipMeta): ScoreBreakdown {
  const seed = createSeededGenerator(`breakdown-${clip.id || clip.title}`);
  const finalScore = clamp(75 + seed(-8, 15), 50, 98);

  const audioScore = clamp(Math.round(60 + seed(-10, 25)), 30, 95);
  const emotionScore = clamp(Math.round(65 + seed(-8, 25)), 35, 98);
  const speechScore = clamp(Math.round(62 + seed(-12, 22)), 30, 95);

  const componentContribution = (score: number, weight: number) =>
    Math.round((score / 100) * weight * 100) / 1;

  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const strengths: string[] = ['🎯 Momento equilibrado entre áudio, emoção e fala'];

  if (speechScore < 60) {
    weaknesses.push('🗣️ Falta de palavras virais no início');
    opportunities.push('💡 Use verbos de ação e gatilhos de curiosidade nos 3s iniciais');
  }
  if (audioScore < 60) opportunities.push('🎶 Música/efeitos mais fortes para reforçar o impacto');
  if (emotionScore < 60) opportunities.push('😊 Mostre reação/expressão forte ao iniciar o clipe');

  return {
    finalScore,
    components: {
      audio: {
        score: audioScore,
        weight: 30,
        contribution: componentContribution(audioScore, 0.3),
        factors: [],
      },
      emotion: {
        score: emotionScore,
        weight: 40,
        contribution: componentContribution(emotionScore, 0.4),
        factors: [],
      },
      speech: {
        score: speechScore,
        weight: 30,
        contribution: componentContribution(speechScore, 0.3),
        factors: [],
      },
    },
    modifiers: {
      bonuses: [],
      penalties: [],
    },
    analysis: {
      strengths,
      weaknesses,
      opportunities,
    },
    benchmark: {
      category: finalScore >= 90 ? 'top_tier' : finalScore >= 80 ? 'above_average' : finalScore >= 65 ? 'average' : 'below_average',
      percentile: finalScore >= 90 ? 95 : finalScore >= 80 ? 80 : finalScore >= 65 ? 60 : 40,
      comparison:
        finalScore >= 90
          ? 'Top 5% dos clipes analisados'
          : finalScore >= 80
          ? 'Top 25% dos clipes — acima da média'
          : 'Performance média, há espaço para otimizar',
      industryAverage: 65,
    },
    summary: {
      title: finalScore >= 85 ? 'Hook Pronto para Viralizar' : finalScore >= 70 ? 'Bom Potencial' : 'Gancho Mediano',
      description:
        finalScore >= 85
          ? 'Hook forte com sinais consistentes — pronto para testes A/B'
          : finalScore >= 70
          ? 'Base sólida, mas vale otimizar áudio ou fala para mais impacto'
          : 'Precisa de ajustes rápidos para reter atenção inicial',
      verdict: finalScore >= 85 ? 'excellent' : finalScore >= 70 ? 'good' : finalScore >= 55 ? 'fair' : 'poor',
      confidenceLevel: Math.round(78 + seed(0, 15)),
    },
  };
}

export function buildVariationsFromMetadata(clip: ClipMeta): {
  hookAnalysis: HookAnalysis;
  scoreBreakdown: ScoreBreakdown;
  hookVariations: HookVariation[];
} {
  const hookAnalysis = buildHookAnalysisFromMetadata(clip);
  const scoreBreakdown = buildScoreBreakdownFromMetadata(clip);
  const hookVariations = generateHookVariations(hookAnalysis);
  return { hookAnalysis, scoreBreakdown, hookVariations };
}
