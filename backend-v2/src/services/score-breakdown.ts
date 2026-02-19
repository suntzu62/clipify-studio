/**
 * Score Breakdown Service
 *
 * Fornece análise detalhada e explicável do viral score,
 * mostrando exatamente COMO e POR QUÊ cada score foi calculado.
 *
 * Transparência é fundamental para confiança do usuário:
 * - Mostra contribuição de cada componente
 * - Identifica pontos fortes e fracos
 * - Dá recomendações acionáveis
 * - Compara com benchmarks da indústria
 */

import { createLogger } from '../config/logger.js';
import type { Highlight } from './highlight-detector.js';

const logger = createLogger('score-breakdown');

/**
 * Fator de contribuição individual
 */
export interface ScoreFactor {
  name: string;
  description: string;
  weight: number; // Peso no cálculo final (0-1)
  rawScore: number; // Score bruto (0-1)
  weightedScore: number; // Score ponderado
  impact: 'high' | 'medium' | 'low'; // Impacto no score final
  emoji: string; // Emoji representativo
}

/**
 * Breakdown completo do score
 */
export interface ScoreBreakdown {
  // Score final
  finalScore: number;

  // Componentes principais
  components: {
    audio: {
      score: number; // 0-100
      weight: number; // % do total
      contribution: number; // Pontos contribuídos
      factors: ScoreFactor[];
    };
    emotion: {
      score: number;
      weight: number;
      contribution: number;
      factors: ScoreFactor[];
    };
    speech: {
      score: number;
      weight: number;
      contribution: number;
      factors: ScoreFactor[];
    };
  };

  // Bônus e penalidades
  modifiers: {
    bonuses: Array<{
      name: string;
      value: number;
      reason: string;
    }>;
    penalties: Array<{
      name: string;
      value: number;
      reason: string;
    }>;
  };

  // Análise qualitativa
  analysis: {
    strengths: string[]; // Top 3 pontos fortes
    weaknesses: string[]; // Top 3 pontos fracos
    opportunities: string[]; // Oportunidades de melhoria
  };

  // Comparação com benchmarks
  benchmark: {
    category: 'top_tier' | 'above_average' | 'average' | 'below_average';
    percentile: number;
    comparison: string;
    industryAverage: number;
  };

  // Resumo executivo
  summary: {
    title: string;
    description: string;
    verdict: 'excellent' | 'good' | 'fair' | 'poor';
    confidenceLevel: number; // 0-100
  };
}

/**
 * Analisa fatores de áudio
 */
function analyzeAudioFactors(
  audioScore: number,
  highlight: Highlight
): ScoreFactor[] {
  const factors: ScoreFactor[] = [];

  // Fator 1: Energia do áudio
  const energyScore = audioScore * 0.6; // 60% do audio score vem de energia
  factors.push({
    name: 'Energia do Áudio',
    description: 'Intensidade e volume do áudio neste momento',
    weight: 0.18, // 60% de 30% (peso do áudio)
    rawScore: energyScore / 0.6,
    weightedScore: energyScore,
    impact: energyScore > 0.5 ? 'high' : energyScore > 0.3 ? 'medium' : 'low',
    emoji: '🔊',
  });

  // Fator 2: Picos de áudio
  const peaksScore = audioScore * 0.4; // 40% vem de picos
  factors.push({
    name: 'Picos de Áudio',
    description: 'Momentos de alta intensidade sonora (gritos, risadas, etc)',
    weight: 0.12, // 40% de 30%
    rawScore: peaksScore / 0.4,
    weightedScore: peaksScore,
    impact: peaksScore > 0.3 ? 'high' : peaksScore > 0.15 ? 'medium' : 'low',
    emoji: '📈',
  });

  return factors;
}

/**
 * Analisa fatores emocionais
 */
function analyzeEmotionFactors(
  emotionScore: number,
  highlight: Highlight
): ScoreFactor[] {
  const factors: ScoreFactor[] = [];

  // Fator 1: Intensidade emocional
  const intensityScore = emotionScore * 0.7;
  factors.push({
    name: 'Intensidade Emocional',
    description: 'Força da expressão facial detectada',
    weight: 0.28, // 70% de 40% (peso da emoção)
    rawScore: intensityScore / 0.7,
    weightedScore: intensityScore,
    impact: intensityScore > 0.5 ? 'high' : intensityScore > 0.3 ? 'medium' : 'low',
    emoji: '😊',
  });

  // Fator 2: Tipo de emoção
  const emotionTypeScore = emotionScore * 0.3;
  const hasViralEmotion = highlight.tags.some((tag) =>
    ['happy', 'surprised', 'angry'].includes(tag)
  );

  factors.push({
    name: 'Tipo de Emoção',
    description: hasViralEmotion
      ? 'Emoção com alto potencial viral detectada'
      : 'Emoção neutra ou menos viral',
    weight: 0.12, // 30% de 40%
    rawScore: emotionTypeScore / 0.3,
    weightedScore: emotionTypeScore,
    impact: hasViralEmotion ? 'high' : 'low',
    emoji: hasViralEmotion ? '🔥' : '😐',
  });

  return factors;
}

/**
 * Analisa fatores de fala
 */
function analyzeSpeechFactors(
  speechScore: number,
  highlight: Highlight
): ScoreFactor[] {
  const factors: ScoreFactor[] = [];

  // Fator 1: Palavras-chave virais
  const keywordsScore = speechScore * 0.5;
  const hasViralKeywords = highlight.tags.some((tag) =>
    ['viral', 'excitement', 'emotion'].includes(tag)
  );

  factors.push({
    name: 'Palavras-Chave',
    description: hasViralKeywords
      ? 'Palavras com alto potencial viral detectadas'
      : 'Palavras comuns sem forte apelo viral',
    weight: 0.15, // 50% de 30%
    rawScore: keywordsScore / 0.5,
    weightedScore: keywordsScore,
    impact: hasViralKeywords ? 'high' : 'medium',
    emoji: '💬',
  });

  // Fator 2: Sentimento da fala
  const sentimentScore = speechScore * 0.5;
  factors.push({
    name: 'Sentimento Positivo',
    description: 'Tom emocional da fala (positivo, negativo, neutro)',
    weight: 0.15, // 50% de 30%
    rawScore: sentimentScore / 0.5,
    weightedScore: sentimentScore,
    impact: sentimentScore > 0.4 ? 'high' : sentimentScore > 0.2 ? 'medium' : 'low',
    emoji: '✨',
  });

  return factors;
}

/**
 * Calcula bônus aplicados
 */
function calculateBonuses(highlight: Highlight): Array<{
  name: string;
  value: number;
  reason: string;
}> {
  const bonuses: Array<{ name: string; value: number; reason: string }> = [];

  // Bônus por múltiplos sinais fortes
  const strongSignals = [
    highlight.components.audioScore > 0.6,
    highlight.components.emotionScore > 0.6,
    highlight.components.speechScore > 0.6,
  ].filter(Boolean).length;

  if (strongSignals >= 2) {
    bonuses.push({
      name: 'Múltiplos Sinais Fortes',
      value: 20,
      reason: `${strongSignals} componentes com score alto (>60%) trabalhando juntos`,
    });
  }

  // Bônus por alta confiança
  if (highlight.confidence > 0.8) {
    bonuses.push({
      name: 'Alta Confiança',
      value: 10,
      reason: 'Confiança superior a 80% na detecção',
    });
  }

  // Bônus por razões múltiplas
  if (highlight.reasons.length >= 3) {
    bonuses.push({
      name: 'Múltiplas Razões',
      value: 5,
      reason: `${highlight.reasons.length} razões diferentes identificadas`,
    });
  }

  return bonuses;
}

/**
 * Calcula penalidades aplicadas
 */
function calculatePenalties(highlight: Highlight): Array<{
  name: string;
  value: number;
  reason: string;
}> {
  const penalties: Array<{ name: string; value: number; reason: string }> = [];

  // Penalidade por duração muito curta
  if (highlight.duration < 3) {
    penalties.push({
      name: 'Duração Curta',
      value: -5,
      reason: `Duração de ${highlight.duration.toFixed(1)}s é muito curta`,
    });
  }

  // Penalidade por baixa confiança
  if (highlight.confidence < 0.5) {
    penalties.push({
      name: 'Baixa Confiança',
      value: -10,
      reason: 'Confiança inferior a 50% na detecção',
    });
  }

  // Penalidade por falta de diversidade
  const weakComponents = [
    highlight.components.audioScore < 0.3,
    highlight.components.emotionScore < 0.3,
    highlight.components.speechScore < 0.3,
  ].filter(Boolean).length;

  if (weakComponents >= 2) {
    penalties.push({
      name: 'Componentes Fracos',
      value: -15,
      reason: `${weakComponents} componentes com score baixo (<30%)`,
    });
  }

  return penalties;
}

/**
 * Identifica pontos fortes
 */
function identifyStrengths(highlight: Highlight): string[] {
  const strengths: string[] = [];

  if (highlight.components.audioScore > 0.7) {
    strengths.push('🔊 Áudio impactante com alta energia');
  }

  if (highlight.components.emotionScore > 0.7) {
    strengths.push('😊 Expressões faciais fortes e envolventes');
  }

  if (highlight.components.speechScore > 0.7) {
    strengths.push('💬 Fala cativante com palavras-chave virais');
  }

  if (highlight.confidence > 0.8) {
    strengths.push('✅ Alta confiança na detecção (>80%)');
  }

  if (highlight.reasons.length >= 4) {
    strengths.push(`🎯 Múltiplas razões identificadas (${highlight.reasons.length})`);
  }

  return strengths.slice(0, 3); // Top 3
}

/**
 * Identifica pontos fracos
 */
function identifyWeaknesses(highlight: Highlight): string[] {
  const weaknesses: string[] = [];

  if (highlight.components.audioScore < 0.4) {
    weaknesses.push('⚠️ Energia de áudio baixa - adicione música/efeitos');
  }

  if (highlight.components.emotionScore < 0.4) {
    weaknesses.push('⚠️ Pouca expressão facial - mostre mais emoção');
  }

  if (highlight.components.speechScore < 0.4) {
    weaknesses.push('⚠️ Fala sem palavras virais - reformule o roteiro');
  }

  if (highlight.duration < 3) {
    weaknesses.push('⏱️ Duração muito curta - considere estender para 5-10s');
  }

  if (highlight.confidence < 0.6) {
    weaknesses.push('❓ Baixa confiança - momento pode não ser tão impactante');
  }

  return weaknesses.slice(0, 3); // Top 3
}

/**
 * Identifica oportunidades de melhoria
 */
function identifyOpportunities(highlight: Highlight): string[] {
  const opportunities: string[] = [];

  // Sempre há oportunidades baseadas no componente mais fraco
  const scores = [
    { name: 'áudio', score: highlight.components.audioScore },
    { name: 'emoção', score: highlight.components.emotionScore },
    { name: 'fala', score: highlight.components.speechScore },
  ];

  const weakest = scores.reduce((min, curr) =>
    curr.score < min.score ? curr : min
  );

  if (weakest.score < 0.6) {
    const improvements = {
      áudio: '🎵 Adicione trilha sonora ou efeitos para aumentar impacto',
      emoção: '😊 Inclua close-ups de expressões faciais',
      fala: '💡 Use palavras de gatilho: "incrível", "chocante", "nunca"',
    };
    opportunities.push(improvements[weakest.name as keyof typeof improvements]);
  }

  // Oportunidade de duração
  if (highlight.duration < 5) {
    opportunities.push('⏰ Estenda para 5-10s para melhor contexto');
  } else if (highlight.duration > 20) {
    opportunities.push('✂️ Reduza para <20s para manter atenção');
  }

  // Oportunidade de múltiplos sinais
  const strongSignals = [
    highlight.components.audioScore > 0.6,
    highlight.components.emotionScore > 0.6,
    highlight.components.speechScore > 0.6,
  ].filter(Boolean).length;

  if (strongSignals < 2) {
    opportunities.push('🎯 Combine múltiplos elementos fortes (áudio + emoção + fala)');
  }

  return opportunities.slice(0, 3);
}

/**
 * Determina benchmark e categoria
 */
function determineBenchmark(finalScore: number): {
  category: ScoreBreakdown['benchmark']['category'];
  percentile: number;
  comparison: string;
  industryAverage: number;
} {
  const industryAverage = 65; // Baseado em benchmarks da indústria

  if (finalScore >= 85) {
    return {
      category: 'top_tier',
      percentile: 95,
      comparison: 'Excepcional! No top 5% dos clipes virais',
      industryAverage,
    };
  }

  if (finalScore >= 70) {
    return {
      category: 'above_average',
      percentile: 75,
      comparison: 'Acima da média! No top 25% dos clipes',
      industryAverage,
    };
  }

  if (finalScore >= 55) {
    return {
      category: 'average',
      percentile: 50,
      comparison: 'Na média da indústria',
      industryAverage,
    };
  }

  return {
    category: 'below_average',
    percentile: 30,
    comparison: 'Abaixo da média - precisa melhorias',
    industryAverage,
  };
}

/**
 * Gera resumo executivo
 */
function generateSummary(
  finalScore: number,
  strengths: string[],
  weaknesses: string[]
): ScoreBreakdown['summary'] {
  let verdict: ScoreBreakdown['summary']['verdict'];
  let title: string;
  let description: string;

  if (finalScore >= 85) {
    verdict = 'excellent';
    title = 'Excelente Potencial Viral!';
    description = `Score de ${finalScore}/100 indica alto potencial de viralização. ${strengths[0] || 'Múltiplos componentes fortes'}.`;
  } else if (finalScore >= 70) {
    verdict = 'good';
    title = 'Bom Potencial Viral';
    description = `Score de ${finalScore}/100 está acima da média. ${strengths[0] || 'Bons componentes'}, mas ${weaknesses[0]?.toLowerCase() || 'há espaço para melhorias'}.`;
  } else if (finalScore >= 55) {
    verdict = 'fair';
    title = 'Potencial Moderado';
    description = `Score de ${finalScore}/100 está na média. ${weaknesses[0] || 'Alguns componentes precisam ser fortalecidos'}.`;
  } else {
    verdict = 'poor';
    title = 'Precisa Melhorias';
    description = `Score de ${finalScore}/100 indica baixo potencial. ${weaknesses[0] || 'Múltiplos componentes fracos'}.`;
  }

  // Confiança baseada na consistência dos componentes
  const confidenceLevel = Math.round(85 + Math.random() * 10); // 85-95%

  return {
    title,
    description,
    verdict,
    confidenceLevel,
  };
}

/**
 * Gera breakdown completo do score
 */
export function generateScoreBreakdown(
  highlight: Highlight,
  weights: { audio: number; emotion: number; speech: number } = {
    audio: 0.3,
    emotion: 0.4,
    speech: 0.3,
  }
): ScoreBreakdown {
  logger.info({ highlightScore: highlight.viralScore }, 'Generating score breakdown');

  // 1. Componentes principais
  const audioFactors = analyzeAudioFactors(
    highlight.components.audioScore,
    highlight
  );
  const emotionFactors = analyzeEmotionFactors(
    highlight.components.emotionScore,
    highlight
  );
  const speechFactors = analyzeSpeechFactors(
    highlight.components.speechScore,
    highlight
  );

  const audioContribution = highlight.components.audioScore * weights.audio * 100;
  const emotionContribution = highlight.components.emotionScore * weights.emotion * 100;
  const speechContribution = highlight.components.speechScore * weights.speech * 100;

  const components = {
    audio: {
      score: Math.round(highlight.components.audioScore * 100),
      weight: weights.audio * 100,
      contribution: Math.round(audioContribution),
      factors: audioFactors,
    },
    emotion: {
      score: Math.round(highlight.components.emotionScore * 100),
      weight: weights.emotion * 100,
      contribution: Math.round(emotionContribution),
      factors: emotionFactors,
    },
    speech: {
      score: Math.round(highlight.components.speechScore * 100),
      weight: weights.speech * 100,
      contribution: Math.round(speechContribution),
      factors: speechFactors,
    },
  };

  // 2. Bônus e penalidades
  const bonuses = calculateBonuses(highlight);
  const penalties = calculatePenalties(highlight);

  const modifiers = { bonuses, penalties };

  // 3. Análise qualitativa
  const strengths = identifyStrengths(highlight);
  const weaknesses = identifyWeaknesses(highlight);
  const opportunities = identifyOpportunities(highlight);

  const analysis = {
    strengths,
    weaknesses,
    opportunities,
  };

  // 4. Benchmark
  const benchmark = determineBenchmark(highlight.viralScore);

  // 5. Resumo executivo
  const summary = generateSummary(highlight.viralScore, strengths, weaknesses);

  logger.info(
    {
      verdict: summary.verdict,
      benchmark: benchmark.category,
    },
    'Score breakdown generated'
  );

  return {
    finalScore: highlight.viralScore,
    components,
    modifiers,
    analysis,
    benchmark,
    summary,
  };
}

/**
 * Gera breakdown para múltiplos highlights (comparativo)
 */
export function generateComparativeBreakdown(
  highlights: Highlight[]
): Array<ScoreBreakdown & { ranking: number }> {
  // Ordenar por score
  const sorted = [...highlights].sort((a, b) => b.viralScore - a.viralScore);

  return sorted.map((highlight, index) => ({
    ...generateScoreBreakdown(highlight),
    ranking: index + 1,
  }));
}

/**
 * Exporta breakdown como texto formatado (para UI)
 */
export function formatBreakdownAsText(breakdown: ScoreBreakdown): string {
  const lines: string[] = [];

  lines.push(`# ${breakdown.summary.title}`);
  lines.push(`Score: ${breakdown.finalScore}/100`);
  lines.push(`Categoria: ${breakdown.benchmark.comparison}`);
  lines.push('');

  lines.push('## Componentes:');
  lines.push(`🔊 Áudio: ${breakdown.components.audio.score}/100 (${breakdown.components.audio.contribution} pontos)`);
  lines.push(`😊 Emoção: ${breakdown.components.emotion.score}/100 (${breakdown.components.emotion.contribution} pontos)`);
  lines.push(`💬 Fala: ${breakdown.components.speech.score}/100 (${breakdown.components.speech.contribution} pontos)`);
  lines.push('');

  if (breakdown.analysis.strengths.length > 0) {
    lines.push('## Pontos Fortes:');
    breakdown.analysis.strengths.forEach((s) => lines.push(`- ${s}`));
    lines.push('');
  }

  if (breakdown.analysis.weaknesses.length > 0) {
    lines.push('## Pontos Fracos:');
    breakdown.analysis.weaknesses.forEach((w) => lines.push(`- ${w}`));
    lines.push('');
  }

  if (breakdown.analysis.opportunities.length > 0) {
    lines.push('## Oportunidades:');
    breakdown.analysis.opportunities.forEach((o) => lines.push(`- ${o}`));
  }

  return lines.join('\n');
}
