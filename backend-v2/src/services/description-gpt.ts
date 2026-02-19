import OpenAI from 'openai';
import { createLogger } from '../config/logger.js';

const logger = createLogger('description-gpt');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Contexto do clipe para gerar hook personalizado
 */
export interface HookContext {
  audioEnergy: number;        // Ex: 1.5 (50% acima da média)
  emotions: string[];         // Ex: ['happy', 'surprised']
  emotionIntensity: number;   // Ex: 0.85
  keywords: string[];         // Ex: ['incrível', 'nunca', 'chocante']
  keywordCategories: string[]; // Ex: ['viral', 'excitement']
  sentiment: number;          // Ex: 0.7 (positivo)
  clipDuration: number;       // Ex: 28 segundos
  transcript?: string;        // Texto falado (se disponível)
}

/**
 * Cache simples em memória para evitar chamadas duplicadas
 * Formato: hash(context) -> hook gerado
 * TTL: 24 horas
 */
interface CacheEntry {
  hook: string;
  timestamp: number;
}

const hookCache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas em ms

/**
 * Gera hash simples do contexto para cache
 */
function generateContextHash(context: HookContext): string {
  const key = JSON.stringify({
    audioEnergy: Math.round(context.audioEnergy * 100),
    emotions: context.emotions.sort().join(','),
    emotionIntensity: Math.round(context.emotionIntensity * 100),
    keywords: context.keywords.sort().join(','),
    keywordCategories: context.keywordCategories.sort().join(','),
    sentiment: Math.round(context.sentiment * 100),
    clipDuration: Math.round(context.clipDuration),
  });

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

/**
 * Limpa entradas expiradas do cache
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of hookCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      hookCache.delete(key);
    }
  }
}

/**
 * Monta o prompt otimizado para GPT-4o
 */
function buildHookPrompt(context: HookContext): string {
  const emotionsText = context.emotions.length > 0
    ? context.emotions.join(', ')
    : 'neutras';

  const keywordsText = context.keywords.length > 0
    ? context.keywords.join(', ')
    : 'nenhuma';

  const sentimentText = context.sentiment > 0.6
    ? 'muito positivo'
    : context.sentiment > 0.3
    ? 'neutro'
    : 'negativo';

  const energyText = context.audioEnergy > 1.5
    ? 'muito alta'
    : context.audioEnergy > 1.2
    ? 'alta'
    : 'moderada';

  return `Você é especialista em criar hooks virais para redes sociais (TikTok, Instagram, YouTube Shorts).

TAREFA: Crie UMA descrição super curta (máx 60 caracteres) que PRENDA A ATENÇÃO instantaneamente.

DADOS DO CLIPE:
- Energia de áudio: ${energyText} (${context.audioEnergy.toFixed(1)}x acima da média)
- Emoções detectadas: ${emotionsText}
- Intensidade emocional: ${(context.emotionIntensity * 100).toFixed(0)}%
- Palavras-chave virais: ${keywordsText}
- Sentimento: ${sentimentText} (${(context.sentiment * 100).toFixed(0)}%)
- Duração: ${context.clipDuration.toFixed(0)}s
${context.transcript ? `- Transcrição: "${context.transcript.substring(0, 200)}..."` : ''}

REGRAS OBRIGATÓRIAS:
1. Máximo 60 caracteres (super curto!)
2. Use hooks emocionais fortes: "🔥", "😱", "Espera...", "Ninguém esperava", "Isso mudou tudo"
3. Crie CURIOSIDADE e URGÊNCIA imediata
4. Sem explicações técnicas - só IMPACTO EMOCIONAL
5. Pode usar 1 emoji estratégico (não exagere)
6. Foco no GANCHO, não na descrição
7. Deve fazer a pessoa PARAR o scroll instantaneamente

EXEMPLOS DE HOOKS FORTES:
- "🔥 Virou do avesso em 15 segundos!"
- "Ninguém esperava essa reviravolta!"
- "Isso mudou tudo... Veja até o fim"
- "O momento que quebrou a internet"
- "Espera... ISSO É REAL?! 😱"
- "A virada que ninguém viu chegando"
- "Tudo mudou neste exato momento 💥"
- "Quando isso aconteceu... 🤯"
- "Você não vai acreditar no que acontece"

IMPORTANTE: Responda APENAS com o hook (sem aspas, sem explicações, sem formatação adicional). Máximo 60 caracteres!`;
}

/**
 * Gera um hook viral usando GPT-4o
 *
 * @param context - Contexto do clipe (áudio, emoções, keywords, etc.)
 * @param options - Opções de timeout e fallback
 * @returns Hook curto e impactante (máx 60 chars)
 */
export async function generateHookDescription(
  context: HookContext,
  options: { timeout?: number } = {}
): Promise<string> {
  const { timeout = 10000 } = options; // 10s default timeout

  try {
    // Limpar cache expirado periodicamente
    if (Math.random() < 0.1) { // 10% de chance
      cleanExpiredCache();
    }

    // Verificar cache
    const cacheKey = generateContextHash(context);
    const cached = hookCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      logger.debug({ cacheKey }, 'Using cached hook description');
      return cached.hook;
    }

    // Montar prompt
    const prompt = buildHookPrompt(context);

    logger.debug(
      {
        audioEnergy: context.audioEnergy,
        emotions: context.emotions,
        emotionIntensity: context.emotionIntensity,
        keywordsCount: context.keywords.length,
      },
      'Generating hook description with GPT-4o'
    );

    // Chamar GPT-4o com timeout
    const completionPromise = openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 50, // Hooks são curtos
      temperature: 0.9, // Alta criatividade
      top_p: 0.95, // Diversidade
      messages: [
        {
          role: 'system',
          content: 'Você é um especialista em criar hooks virais curtos e impactantes para redes sociais. Responda apenas com o hook, sem aspas ou formatação.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Aplicar timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('GPT-4o timeout')), timeout);
    });

    const completion = await Promise.race([completionPromise, timeoutPromise]);

    // Extrair hook
    const hook = completion.choices[0]?.message?.content?.trim() || '';

    if (!hook) {
      throw new Error('Empty response from GPT-4o');
    }

    // Limitar a 60 caracteres se passar (garantia)
    const finalHook = hook.length > 60 ? hook.substring(0, 57) + '...' : hook;

    logger.info(
      {
        hook: finalHook,
        hookLength: finalHook.length,
        cacheKey,
      },
      'Hook description generated successfully'
    );

    // Salvar no cache
    hookCache.set(cacheKey, {
      hook: finalHook,
      timestamp: Date.now(),
    });

    return finalHook;
  } catch (error: any) {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
        context: {
          audioEnergy: context.audioEnergy,
          emotions: context.emotions,
          keywordsCount: context.keywords.length,
        },
      },
      'Failed to generate hook description, using fallback'
    );

    // Fallback: hook genérico baseado no contexto
    return generateFallbackHook(context);
  }
}

/**
 * Gera hook de fallback quando GPT-4o falha
 * Usa lógica simples baseada no contexto
 */
function generateFallbackHook(context: HookContext): string {
  // Selecionar fallback baseado no tipo de conteúdo detectado
  const hasHighEnergy = context.audioEnergy > 1.3;
  const hasPositiveEmotion = context.emotions.includes('happy') || context.emotions.includes('surprised');
  const hasViralKeywords = context.keywordCategories.includes('viral') || context.keywordCategories.includes('excitement');
  const hasStrongSentiment = context.sentiment > 0.6;

  if (hasHighEnergy && hasPositiveEmotion) {
    return '🔥 Momento viral detectado - energia intensa!';
  }

  if (hasViralKeywords && hasStrongSentiment) {
    return 'Isso vai viralizar... Assista até o fim!';
  }

  if (hasHighEnergy) {
    return 'Energia do início ao fim! 💥';
  }

  if (hasPositiveEmotion) {
    return 'O momento que você não pode perder!';
  }

  if (hasViralKeywords) {
    return 'Conteúdo viral em potencial 🚀';
  }

  // Fallback genérico
  return '🔥 Momento viral detectado';
}

/**
 * Limpa todo o cache (útil para testes)
 */
export function clearHookCache(): void {
  hookCache.clear();
  logger.info('Hook cache cleared');
}

/**
 * Retorna estatísticas do cache
 */
export function getCacheStats(): { size: number; entries: number } {
  cleanExpiredCache();
  return {
    size: hookCache.size,
    entries: hookCache.size,
  };
}
