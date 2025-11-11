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
    minDuration = 30,
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
      return await fallbackAIAnalysis(transcript, options);
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
      model: 'gpt-4o',
      max_tokens: 4096,
      temperature: 0.7,
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

    logger.info(
      {
        detectedScenes: detectedScenes.length,
        rankedScenes: analysis.rankings.length,
        finalClips: validatedSegments.length,
      },
      'Highlight analysis completed with scene detection'
    );

    return {
      segments: validatedSegments,
      reasoning: analysis.reasoning,
    };
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Highlight analysis failed');

    // Fallback to traditional analysis on error
    logger.warn('Falling back to traditional AI analysis due to error');
    return await fallbackAIAnalysis(transcript, options);
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
    minDuration = 30,
    maxDuration = 90,
  } = options;

  logger.info('Using fallback AI-based analysis');

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
    model: 'gpt-4o',
    max_tokens: 4096,
    temperature: 0.7,
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

  return {
    segments: validateSegments(analysis.segments, transcript.duration, minDuration, maxDuration),
    reasoning: analysis.reasoning,
  };
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
      "reason": "Por que este clipe vai viralizar (gancho + conteúdo + emoção)",
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
      logger.warn({ segment: seg, duration }, 'Segment too short, skipping');
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
