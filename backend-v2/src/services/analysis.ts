import OpenAI from 'openai';
import { createLogger } from '../config/logger.js';
import type { Transcript, HighlightAnalysis, HighlightSegment } from '../types/index.js';
import { detectScenes } from './scene-detection.js';

const logger = createLogger('analysis');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AnalysisOptions {
  targetDuration?: number; // Target duration for each clip in seconds
  clipCount?: number; // Desired number of clips
  minDuration?: number; // Minimum clip duration
  maxDuration?: number; // Maximum clip duration
}

/**
 * Analisa a transcrição e identifica os melhores highlights para clips
 * Agora usa detecção inteligente de cenas combinando silêncios, pontuação e mudanças semânticas
 */
export async function analyzeHighlights(
  transcript: Transcript,
  options: AnalysisOptions = {}
): Promise<HighlightAnalysis> {
  const {
    targetDuration = 60,
    clipCount = 8,
    minDuration = 15, // Reduzido de 30 para 15 para suportar vídeos curtos
    maxDuration = 90,
  } = options;

  logger.info(
    {
      segments: transcript.segments.length,
      duration: transcript.duration,
      targetDuration,
      clipCount
    },
    'Starting highlight analysis'
  );

  try {
    // STEP 1: Detect scenes using multiple criteria (silences, semantic changes, punctuation)
    logger.info('Detecting scenes using multi-criteria analysis');

    const detectedScenes = await detectScenes(transcript, {
      minSilenceDuration: 1.0,
      minSceneDuration: minDuration,
      maxSceneDuration: maxDuration,
      padding: 0.4, // 400ms padding for smooth transitions
      targetSceneCount: Math.max(clipCount * 2, 12), // Detect more scenes than needed for ranking
    });

    logger.info(
      {
        detectedScenes: detectedScenes.length,
        avgDuration: detectedScenes.reduce((sum, s) => sum + s.duration, 0) / detectedScenes.length,
      },
      'Scene detection completed'
    );

    // STEP 2: If we don't have enough scenes, fall back to AI-based analysis
    if (detectedScenes.length < clipCount) {
      logger.warn(
        { detectedScenes: detectedScenes.length, required: clipCount },
        'Not enough scenes detected, using fallback AI analysis'
      );
      const fallbackResult = await fallbackAIAnalysis(transcript, options);

      // Se o fallback retornou segmentos, usar eles
      if (fallbackResult.segments && fallbackResult.segments.length > 0) {
        return fallbackResult;
      }

      // Se ainda não tiver segmentos, usar geração automática
      logger.warn('Fallback also returned no segments, using automatic clip generation');
      return generateAutoClips(transcript, options);
    }

    // STEP 3: Prepare scenes for AI ranking
    const scenesText = detectedScenes
      .map((scene, idx) => {
        const startTime = formatTimestamp(scene.start);
        const endTime = formatTimestamp(scene.end);
        const duration = Math.round(scene.duration);
        const boundaryInfo = scene.boundaryTypes.join(', ');
        return `Scene ${idx + 1} [${startTime} - ${endTime}] (${duration}s, boundaries: ${boundaryInfo}):\n${scene.text}\n`;
      })
      .join('\n---\n');

    // STEP 4: Call AI to rank and generate metadata for scenes
    const prompt = buildRankingPrompt(
      scenesText,
      transcript.duration,
      targetDuration,
      clipCount,
      detectedScenes.length
    );

    logger.debug('Sending scenes to OpenAI for ranking and metadata generation');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // OTIMIZAÇÃO: GPT-4o-mini é 60x mais rápido e 15x mais barato que GPT-4o!
      max_tokens: 2048, // OTIMIZAÇÃO: Reduzir tokens para resposta mais rápida (era 4096)
      temperature: 0.5, // OTIMIZAÇÃO: Temperatura menor para respostas mais diretas
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Você é um especialista em análise de conteúdo de vídeo para redes sociais. Sempre responda em formato JSON válido.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse response
    const responseText = completion.choices[0]?.message?.content || '';
    logger.debug({ responseLength: responseText.length }, 'Received response from OpenAI');

    const analysis = parseRankingResponse(responseText);

    // STEP 5: Map AI response back to detected scenes
    const enrichedSegments: HighlightSegment[] = analysis.rankings.map((ranking) => {
      const sceneIndex = ranking.sceneIndex - 1; // Convert 1-based to 0-based
      const scene = detectedScenes[sceneIndex];

      if (!scene) {
        logger.warn({ sceneIndex, ranking }, 'Scene index out of bounds, skipping');
        return null;
      }

      return {
        start: scene.start,
        end: scene.end,
        score: ranking.score,
        title: ranking.title,
        reason: ranking.reason,
        keywords: ranking.keywords,
      };
    }).filter((seg): seg is HighlightSegment => seg !== null);

    // Validate and adjust segments
    const validatedSegments = validateSegments(
      enrichedSegments,
      transcript.duration,
      minDuration,
      maxDuration
    );
    const completedSegments = ensureMinimumClipCount(
      validatedSegments,
      transcript,
      {
        ...options,
        targetDuration,
        clipCount,
        minDuration,
        maxDuration,
      }
    );

    logger.info(
      {
        detectedScenes: detectedScenes.length,
        rankedScenes: analysis.rankings.length,
        finalClips: completedSegments.length,
      },
      'Highlight analysis completed with scene detection'
    );

    return {
      segments: completedSegments,
      reasoning: analysis.reasoning,
    };
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Highlight analysis failed');

    // Fallback to traditional analysis on error
    logger.warn('Falling back to traditional AI analysis due to error');
    try {
      return await fallbackAIAnalysis(transcript, options);
    } catch (fallbackError: any) {
      logger.error({ error: fallbackError.message }, 'Fallback AI analysis also failed, using automatic clip generation');
      return generateAutoClips(transcript, options);
    }
  }
}

/**
 * Fallback AI analysis when scene detection doesn't produce enough results
 */
async function fallbackAIAnalysis(
  transcript: Transcript,
  options: AnalysisOptions
): Promise<HighlightAnalysis> {
  const {
    targetDuration = 60,
    clipCount = 8,
    minDuration = 15, // Reduzido de 30 para 15 para vídeos curtos
    maxDuration = 90,
  } = options;

  logger.info('Using fallback AI-based analysis');

  try {
    const transcriptText = formatTranscriptForAnalysis(transcript);
    const prompt = buildAnalysisPrompt(
      transcriptText,
      transcript.duration,
      targetDuration,
      clipCount,
      minDuration,
      maxDuration
    );

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Você é um especialista em análise de conteúdo de vídeo para redes sociais. Sempre responda em formato JSON válido.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || '';
    const analysis = parseAIResponse(responseText);
    const validatedSegments = validateSegments(analysis.segments, transcript.duration, minDuration, maxDuration);
    const completedSegments = ensureMinimumClipCount(
      validatedSegments,
      transcript,
      {
        ...options,
        targetDuration,
        clipCount,
        minDuration,
        maxDuration,
      }
    );

    // Se ainda não tiver segmentos, usar fallback automático
    if (completedSegments.length === 0) {
      logger.warn('AI analysis returned no valid segments, using automatic clip generation');
      return generateAutoClips(transcript, options);
    }

    return {
      segments: completedSegments,
      reasoning: analysis.reasoning,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'AI fallback analysis failed, using automatic clip generation');
    return generateAutoClips(transcript, options);
  }
}

/**
 * Gera clipes automaticamente dividindo o vídeo em partes iguais
 * Este é o fallback final que SEMPRE funciona
 */
export function generateAutoClips(
  transcript: Transcript,
  options: AnalysisOptions
): HighlightAnalysis {
  const {
    targetDuration = 60,
    clipCount = 8,
    minDuration = 15,
    maxDuration = 90,
  } = options;

  logger.info(
    { duration: transcript.duration, targetDuration, clipCount },
    'Generating automatic clips from video'
  );

  const segments: HighlightSegment[] = [];
  const videoDuration = transcript.duration;

  // Calcular número real de clipes baseado na duração do vídeo
  // Cada clipe deve ter pelo menos minDuration segundos
  const maxPossibleClips = Math.floor(videoDuration / minDuration);
  const parsedMinAutoClips = Number.parseInt(process.env.MIN_AUTO_CLIPS || '', 10);
  const minAutoClips = Number.isFinite(parsedMinAutoClips)
    ? Math.max(1, Math.min(20, parsedMinAutoClips))
    : 8;
  const parsedMaxAutoClips = Number.parseInt(process.env.MAX_AUTO_CLIPS || '', 10);
  const maxAutoClips = Number.isFinite(parsedMaxAutoClips)
    ? Math.max(minAutoClips, Math.min(50, parsedMaxAutoClips))
    : 30;

  const estimatedAutoClips = Math.ceil(videoDuration / Math.max(150, targetDuration * 4));
  const desiredClipCount = clipCount > 0
    ? clipCount
    : Math.max(minAutoClips, Math.min(maxAutoClips, estimatedAutoClips));

  const actualClipCount = Math.min(desiredClipCount, maxPossibleClips, maxAutoClips);

  if (actualClipCount === 0) {
    // Vídeo muito curto - criar apenas 1 clipe com o vídeo todo
    logger.info({ videoDuration }, 'Video too short, creating single clip');

    const clipText = transcript.segments.map(s => s.text).join(' ');
    const keywords = extractKeywords(clipText);
    segments.push({
      start: 0,
      end: videoDuration,
      score: 0.7,
      title: generateTitleFromText(clipText) || 'Clipe completo',
      reason: generateReasonFromText(clipText, keywords) || 'Trecho selecionado automaticamente',
      keywords,
    });

    return {
      segments,
      reasoning: 'Vídeo curto - foi gerado um único clipe com o conteúdo completo.',
    };
  }

  // Calcular duração ideal de cada clipe
  const idealClipDuration = Math.min(
    Math.max(videoDuration / actualClipCount, minDuration),
    maxDuration
  );

  logger.info(
    { actualClipCount, idealClipDuration },
    'Calculated clip parameters'
  );

  // Gerar clipes
  for (let i = 0; i < actualClipCount; i++) {
    const start = i * idealClipDuration;
    const end = Math.min((i + 1) * idealClipDuration, videoDuration);

    // Pegar segmentos de transcrição nesse intervalo
    const clipSegments = transcript.segments.filter(
      seg => seg.start >= start && seg.end <= end
    );

    const clipText = clipSegments.map(s => s.text).join(' ') || `Parte ${i + 1} do vídeo`;
    const keywords = extractKeywords(clipText);

    segments.push({
      start,
      end,
      score: 0.6 + (Math.random() * 0.2), // Score entre 0.6-0.8
      title: generateTitleFromText(clipText) || `Destaque #${i + 1}`,
      reason: generateReasonFromText(clipText, keywords) || 'Trecho selecionado automaticamente',
      keywords,
    });
  }

  logger.info(
    { generatedClips: segments.length },
    'Automatic clips generated successfully'
  );

  return {
    segments,
    reasoning: `Foram gerados ${segments.length} clipes automaticamente dividindo o vídeo em partes iguais de ~${Math.round(idealClipDuration)}s cada.`,
  };
}

/**
 * Gera um título a partir do texto do clipe
 */
function generateTitleFromText(text: string): string {
  if (!text || text.length < 10) return '';

  const cleaned = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const stopWords = new Set([
    'a', 'e', 'o', 'de', 'da', 'do', 'que', 'para', 'com', 'um', 'uma', 'os', 'as', 'em', 'no', 'na', 'por', 'se',
    'não', 'mais', 'mas', 'como', 'isso', 'esse', 'essa', 'ele', 'ela', 'você', 'eu', 'nós', 'pra', 'pro',
    // filler
    'ai', 'ah', 'oh', 'oi', 'opa', 'tipo', 'mano', 'galera', 'gente', 'cara', 'né', 'ne', 'tá', 'ta', 'tô', 'to',
    // context words that often repeat in transcript but add little in a title
    'video', 'vídeo', 'clipe', 'clip',
  ]);

  const words = cleaned.split(/\s+/);
  const picked: string[] = [];
  const seen = new Set<string>();

  for (const w of words) {
    const token = w.toLowerCase();
    if (token.length < 4) continue;
    if (stopWords.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    picked.push(w);
    if (picked.length >= 7) break;
  }

  const titleWords = picked.length > 0 ? picked.join(' ') : words.slice(0, 6).join(' ');

  // Truncar e adicionar reticências se necessário
  if (titleWords.length > 50) {
    return titleWords.substring(0, 47) + '...';
  }

  return titleWords.charAt(0).toUpperCase() + titleWords.slice(1);
}

/**
 * Gera um motivo/descrição curta a partir do texto do clipe (fallback sem IA)
 * Objetivo: evitar "Momento destaque do vídeo" e entregar algo utilizável no UI.
 */
function generateReasonFromText(text: string, keywords: string[]): string {
  const cleaned = (text || '')
    .replace(/[^\p{L}\p{N}\s.!?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const firstSentence = cleaned.split(/[.!?]/)[0]?.trim() || '';
  const snippet = firstSentence.length >= 28 ? firstSentence : '';

  if (snippet) {
    return snippet.length > 90 ? `${snippet.slice(0, 87).trim()}...` : snippet;
  }

  if (keywords && keywords.length > 0) {
    const topics = keywords.slice(0, 3).join(', ');
    return `Trecho sobre ${topics}.`;
  }

  return 'Trecho com contexto completo e boa densidade de fala.';
}

/**
 * Extrai palavras-chave do texto
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];

  const stopWords = new Set([
    'a', 'e', 'o', 'de', 'da', 'do', 'que', 'para', 'com', 'um', 'uma',
    'os', 'as', 'em', 'no', 'na', 'por', 'se', 'não', 'mais', 'mas',
    'como', 'isso', 'esse', 'essa', 'ele', 'ela', 'você', 'eu', 'nós',
    'pra', 'pro', 'ai', 'ah', 'tipo', 'mano', 'galera', 'gente', 'cara', 'né', 'ne', 'tá', 'ta', 'tô', 'to',
    'video', 'vídeo', 'clipe', 'clip', 'momento', 'destaque',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const keywords = words
    .filter(w => w.length > 4 && !stopWords.has(w) && !/^\d+$/.test(w))
    .slice(0, 5);

  return [...new Set(keywords)]; // Remove duplicatas
}

/**
 * Formata a transcrição para análise
 */
function formatTranscriptForAnalysis(transcript: Transcript): string {
  return transcript.segments
    .map((seg) => {
      const startTime = formatTimestamp(seg.start);
      const endTime = formatTimestamp(seg.end);
      return `[${startTime} - ${endTime}] ${seg.text}`;
    })
    .join('\n');
}

/**
 * Formata timestamp em formato legível (MM:SS)
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Constrói o prompt para ranking de cenas já detectadas
 */
function buildRankingPrompt(
  scenesText: string,
  totalDuration: number,
  targetDuration: number,
  clipCount: number,
  totalScenes: number
): string {
  return `Você é um especialista em análise de conteúdo de vídeo para redes sociais (TikTok, Instagram Reels, YouTube Shorts).

Analise as ${totalScenes} cenas detectadas abaixo e RANQUEIE as ${clipCount} MELHORES para criar clipes virais.

CENAS DETECTADAS (já otimizadas com padding para transições suaves):
${scenesText}

CRITÉRIOS DE RANKING (ordem de importância):
1. **Gancho Forte no Início** (0-5s): Frase de impacto, pergunta, número, afirmação polêmica
2. **Densidade de Conteúdo**: Palavras por segundo, informação valiosa, sem pausas longas
3. **História Completa**: Começo, meio e fim autocontidos (não precisa de contexto)
4. **Pico Emocional**: Momentos engraçados, surpreendentes, inspiradores ou polêmicos
5. **Diversidade Temática**: Evite selecionar múltiplas cenas sobre o mesmo assunto
6. **Clareza**: Sem cortes no meio de frases, ideias completas
7. **Presença de Gatilhos**: Números, perguntas, listas, "você sabia?", "atenção"

IMPORTANTE:
- Score deve ser 0.0-1.0 (1.0 = viral garantido)
- Penalize cenas com pausas longas (>3s) ou clareza ruim
- Prefira cenas de 30-60s (ideal para Shorts/Reels)
- Diversifique os temas selecionados
- Retorne EXATAMENTE ${clipCount} cenas

Responda APENAS com um JSON válido neste formato:
{
  "rankings": [
    {
      "sceneIndex": 1,
      "score": 0.95,
      "title": "Título viral e chamativo (máx 60 chars)",
      "reason": "Hook viral CURTO (máx 60 chars) que PRENDE atenção - use emoção, curiosidade e urgência. Exemplos: '🔥 Virou tudo de cabeça pra baixo!', 'Ninguém esperava essa reviravolta!', 'O momento que parou tudo 😱'",
      "keywords": ["palavra1", "palavra2", "palavra3"]
    }
  ],
  "reasoning": "Análise geral: critérios usados, diversidade dos clipes, estratégia de seleção"
}

Duração total do vídeo: ${Math.floor(totalDuration / 60)}min ${Math.floor(totalDuration % 60)}s

Retorne APENAS o JSON, sem texto adicional.`;
}

/**
 * Constrói o prompt para análise tradicional (fallback)
 */
function buildAnalysisPrompt(
  transcriptText: string,
  totalDuration: number,
  targetDuration: number,
  clipCount: number,
  minDuration: number,
  maxDuration: number
): string {
  return `Você é um especialista em análise de conteúdo de vídeo para redes sociais (TikTok, Instagram Reels, YouTube Shorts).

Analise esta transcrição de vídeo e identifique os ${clipCount} MELHORES momentos para criar clipes virais.

TRANSCRIÇÃO:
${transcriptText}

CRITÉRIOS IMPORTANTES:
- Cada clipe deve ter entre ${minDuration}-${maxDuration} segundos (idealmente ~${targetDuration}s)
- Procure momentos com:
  * Ganchos fortes no início (perguntas, números, afirmações polêmicas)
  * Histórias completas e autocontidas
  * Alta densidade de informação (evite pausas longas)
  * Picos emocionais ou revelações
  * Frases de impacto ou polêmicas
  * Informações valiosas e práticas
  * Momentos engraçados ou surpreendentes
- Evite cortes no meio de frases ou ideias
- Os clipes devem fazer sentido sozinhos (sem contexto do vídeo completo)
- Diversifique os temas selecionados

IMPORTANTE: Você DEVE retornar EXATAMENTE ${clipCount} clipes no formato JSON abaixo.

Responda APENAS com um JSON válido neste formato:
{
  "segments": [
    {
      "start": 0,
      "end": 60,
      "score": 0.95,
      "title": "Título chamativo do clipe",
      "reason": "Por que este momento é viral",
      "keywords": ["palavra1", "palavra2", "palavra3"]
    }
  ],
  "reasoning": "Explicação geral da sua análise e critérios usados"
}

Duração total do vídeo: ${Math.floor(totalDuration / 60)}min ${Math.floor(totalDuration % 60)}s

Retorne APENAS o JSON, sem nenhum texto adicional antes ou depois.`;
}

/**
 * Parse da resposta de ranking da IA
 */
function parseRankingResponse(responseText: string): {
  rankings: Array<{
    sceneIndex: number;
    score: number;
    title: string;
    reason: string;
    keywords: string[];
  }>;
  reasoning: string;
} {
  try {
    // Remove markdown code blocks if present
    let jsonText = responseText.trim();

    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonText);

    // Validate structure
    if (!parsed.rankings || !Array.isArray(parsed.rankings)) {
      throw new Error('Invalid response structure: missing rankings array');
    }

    return {
      rankings: parsed.rankings.map((rank: any) => ({
        sceneIndex: Number(rank.sceneIndex),
        score: Number(rank.score) || 0.5,
        title: String(rank.title || 'Clip sem título'),
        reason: String(rank.reason || ''),
        keywords: Array.isArray(rank.keywords) ? rank.keywords : [],
      })),
      reasoning: String(parsed.reasoning || ''),
    };
  } catch (error: any) {
    logger.error({ error: error.message, responseText }, 'Failed to parse ranking response');
    throw new Error(`Failed to parse ranking response: ${error.message}`);
  }
}

/**
 * Parse da resposta da IA (OpenAI GPT-4) - fallback tradicional
 */
function parseAIResponse(responseText: string): HighlightAnalysis {
  try {
    // Remove markdown code blocks if present
    let jsonText = responseText.trim();

    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonText);

    // Validate structure
    if (!parsed.segments || !Array.isArray(parsed.segments)) {
      throw new Error('Invalid response structure: missing segments array');
    }

    return {
      segments: parsed.segments.map((seg: any) => ({
        start: Number(seg.start),
        end: Number(seg.end),
        score: Number(seg.score) || 0.5,
        title: String(seg.title || 'Clip sem título'),
        reason: String(seg.reason || ''),
        keywords: Array.isArray(seg.keywords) ? seg.keywords : [],
      })),
      reasoning: String(parsed.reasoning || ''),
    };
  } catch (error: any) {
    logger.error({ error: error.message, responseText }, 'Failed to parse AI response');
    throw new Error(`Failed to parse AI response: ${error.message}`);
  }
}

/**
 * Valida e ajusta segmentos
 */
function validateSegments(
  segments: HighlightSegment[],
  videoDuration: number,
  minDuration: number,
  maxDuration: number
): HighlightSegment[] {
  const validated: HighlightSegment[] = [];

  for (const seg of segments) {
    // Check bounds
    if (seg.start < 0 || seg.end > videoDuration || seg.start >= seg.end) {
      logger.warn({ segment: seg }, 'Segment out of bounds, skipping');
      continue;
    }

    const duration = seg.end - seg.start;

    // Check duration
    if (duration < minDuration) {
      const extendedSegment = extendSegmentToMinDuration(seg, minDuration, videoDuration);
      const extendedDuration = extendedSegment.end - extendedSegment.start;

      if (extendedDuration < Math.min(minDuration, videoDuration)) {
        logger.warn(
          { segment: seg, duration, minDuration, extendedDuration },
          'Segment too short and could not be extended, skipping'
        );
        continue;
      }

      logger.info(
        { original: seg, adjusted: extendedSegment, originalDuration: duration, adjustedDuration: extendedDuration },
        'Segment too short, extended to min duration'
      );
      validated.push(extendedSegment);
      continue;
    }

    if (duration > maxDuration) {
      // Truncate to max duration (keep the beginning - where the hook is)
      const adjustedSeg = {
        ...seg,
        start: seg.start,
        end: Math.min(seg.start + maxDuration, videoDuration),
      };
      logger.info({ original: seg, adjusted: adjustedSeg }, 'Segment truncated to max duration');
      validated.push(adjustedSeg);
      continue;
    }

    validated.push(seg);
  }

  // Sort by score (highest first)
  validated.sort((a, b) => b.score - a.score);

  return validated;
}

function extendSegmentToMinDuration(
  segment: HighlightSegment,
  minDuration: number,
  videoDuration: number
): HighlightSegment {
  if (videoDuration <= minDuration) {
    return {
      ...segment,
      start: 0,
      end: videoDuration,
    };
  }

  const currentDuration = segment.end - segment.start;
  if (currentDuration >= minDuration) {
    return segment;
  }

  const extra = minDuration - currentDuration;
  let start = Math.max(0, segment.start - extra / 2);
  let end = Math.min(videoDuration, segment.end + extra / 2);

  if (end - start < minDuration) {
    if (start <= 0) {
      end = Math.min(videoDuration, minDuration);
    } else if (end >= videoDuration) {
      start = Math.max(0, videoDuration - minDuration);
    }
  }

  return {
    ...segment,
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
  };
}

function ensureMinimumClipCount(
  segments: HighlightSegment[],
  transcript: Transcript,
  options: AnalysisOptions
): HighlightSegment[] {
  const targetCount = Math.max(1, options.clipCount || 8);
  if (segments.length >= targetCount) {
    return segments;
  }

  const autoSegments = generateAutoClips(transcript, options).segments;
  const merged = [...segments];

  for (const candidate of autoSegments) {
    if (merged.length >= targetCount) break;

    const overlapsExisting = merged.some((existing) => {
      const overlap = Math.max(
        0,
        Math.min(existing.end, candidate.end) - Math.max(existing.start, candidate.start)
      );
      if (overlap <= 0) return false;

      const smallerDuration = Math.min(existing.end - existing.start, candidate.end - candidate.start);
      return smallerDuration > 0 && (overlap / smallerDuration) >= 0.7;
    });

    if (overlapsExisting) continue;

    merged.push({
      ...candidate,
      score: Math.min(candidate.score || 0.6, 0.59),
    });
  }

  if (merged.length < targetCount) {
    for (const candidate of autoSegments) {
      if (merged.length >= targetCount) break;
      merged.push({
        ...candidate,
        score: Math.min(candidate.score || 0.6, 0.58),
      });
    }
  }

  merged.sort((a, b) => b.score - a.score);

  logger.info(
    { aiSegments: segments.length, autoSegments: autoSegments.length, finalSegments: merged.length, targetCount },
    'Topped up segments with automatic clips'
  );

  return merged.slice(0, targetCount);
}
