import { randomUUID } from 'crypto';
import { createLogger } from '../config/logger.js';
import type { HookAnalysis, HookPattern } from './hook-detector.js';

const logger = createLogger('variation-generator');

export interface HookVariation {
  id: string;
  pattern: HookPattern;
  headline: string;
  angle: string;
  expectedLift: number; // % esperado de melhora na retenção
  risks: string[];
  ingredients: string[];
  cta: string;
}

function baseLiftFromWeakness(hook: HookAnalysis) {
  const weaknessPenalty = hook.insights.weaknesses.length > 0 ? 8 : 0;
  const recommendationBoost = hook.insights.recommendations.length > 0 ? 5 : 0;
  return Math.max(5, weaknessPenalty + recommendationBoost);
}

function createVariation(
  pattern: HookPattern,
  headline: string,
  angle: string,
  lift: number,
  extras: Partial<HookVariation> = {}
): HookVariation {
  return {
    id: extras.id || randomUUID(),
    pattern,
    headline,
    angle,
    expectedLift: Math.round(lift),
    risks: extras.risks || [],
    ingredients: extras.ingredients || [],
    cta: extras.cta || 'Teste em 2 versões e acompanhe retenção de 3s e 5s',
  };
}

export function generateHookVariations(hook?: HookAnalysis, count = 3): HookVariation[] {
  if (!hook) return [];

  const liftBase = baseLiftFromWeakness(hook);
  const variations: HookVariation[] = [];

  // Variação 1: Pergunta direta
  variations.push(
    createVariation(
      'question',
      'E se eu te mostrasse isso em 5 segundos?',
      'Curiosidade imediata com pergunta + promessa de rapidez',
      liftBase + (hook.components.verbalHook < 0.6 ? 10 : 6),
      {
        risks: ['Evitar perguntas vagas; precisa de contexto visual claro'],
        ingredients: ['Pergunta direta', 'Tempo limitado', 'Visual alinhado à pergunta'],
      }
    )
  );

  // Variação 2: Impacto visual + áudio
  variations.push(
    createVariation(
      'visual_impact',
      'Olha isso antes que eu tire do ar! 🔥',
      'Combina efeito sonoro inicial + movimento rápido de câmera',
      liftBase + (hook.components.audioImpact < 0.65 ? 12 : 7),
      {
        risks: ['Não exagerar no volume do efeito', 'Evitar cortes bruscos que quebrem continuidade'],
        ingredients: ['Efeito sonoro logo no frame 0', 'Zoom/corte rápido', 'Texto grande em tela'],
      }
    )
  );

  // Variação 3: Promessa/benefício
  variations.push(
    createVariation(
      'promise',
      'Vou te provar isso agora mesmo',
      'Promessa explícita + entrega rápida do benefício',
      liftBase + (hook.components.verbalHook > 0.6 ? 6 : 9),
      {
        risks: ['Evitar promessas genéricas', 'Entregar prova até o segundo 3-4'],
        ingredients: ['Promessa clara', 'Preview visual do resultado', 'CTA de retenção (ex: “segura 5s”)'],
      }
    )
  );

  // Variação 4 opcional: Emoção máxima
  if (variations.length < count) {
    variations.push(
      createVariation(
        'emotional_peak',
        'Minha reação diz tudo 😱',
        'Foca em emoção/expressão forte no frame 0-1',
        liftBase + (hook.components.emotionalHook < 0.6 ? 11 : 5),
        {
          risks: ['Precisa de expressão real, não atuada', 'Evitar emoji overload'],
          ingredients: ['Close no rosto', 'Legendas grandes destacando emoção', 'Efeito sonoro curto para ênfase'],
        }
      )
    );
  }

  logger.info(
    {
      generated: Math.min(count, variations.length),
      hookScore: hook.hookScore,
      weaknesses: hook.insights.weaknesses.length,
    },
    'Hook variations generated'
  );

  return variations.slice(0, count);
}
