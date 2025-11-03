import OpenAI from 'openai';
import { createLogger } from '../config/logger.js';
import type { Transcript, HighlightAnalysis, HighlightSegment } from '../types/index.js';

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
 */
export async function analyzeHighlights(
  transcript: Transcript,
  options: AnalysisOptions = {}
): Promise<HighlightAnalysis> {
  const {
    targetDuration = 60,
    clipCount = 5,
    minDuration = 30,
    maxDuration = 120,
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
    // Prepare transcript text with timestamps
    const transcriptText = formatTranscriptForAnalysis(transcript);

    // Call Claude to analyze
    const prompt = buildAnalysisPrompt(
      transcriptText,
      transcript.duration,
      targetDuration,
      clipCount,
      minDuration,
      maxDuration
    );

    logger.debug('Sending request to OpenAI API');

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

    const analysis = parseAIResponse(responseText);

    // Validate and adjust segments
    const validatedSegments = validateSegments(
      analysis.segments,
      transcript.duration,
      minDuration,
      maxDuration
    );

    logger.info(
      {
        originalCount: analysis.segments.length,
        validatedCount: validatedSegments.length
      },
      'Highlight analysis completed'
    );

    return {
      segments: validatedSegments,
      reasoning: analysis.reasoning,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Highlight analysis failed');
    throw new Error(`Analysis failed: ${error.message}`);
  }
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
 * Constrói o prompt para análise
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
  * Ganchos fortes no início
  * Histórias completas e autocontidas
  * Picos emocionais ou revelações
  * Frases de impacto ou polêmicas
  * Informações valiosas e práticas
  * Momentos engraçados ou surpreendentes
- Evite cortes no meio de frases ou ideias
- Os clipes devem fazer sentido sozinhos (sem contexto do vídeo completo)

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
 * Parse da resposta da IA (OpenAI GPT-4)
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
      // Truncate to max duration (centered)
      const midpoint = (seg.start + seg.end) / 2;
      const adjustedSeg = {
        ...seg,
        start: Math.max(0, midpoint - maxDuration / 2),
        end: Math.min(videoDuration, midpoint + maxDuration / 2),
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
