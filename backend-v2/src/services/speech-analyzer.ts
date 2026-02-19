/**
 * Speech Analyzer Service
 *
 * Analisa fala no vídeo:
 * - Speech-to-text (preparado para integração com Whisper/APIs)
 * - Detecção de palavras-chave virais
 * - Análise de sentimento do texto
 * - Ritmo da fala (palavras por minuto)
 */

import { promises as fs } from 'fs';
import { basename, join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { OpenAI } from 'openai';
import { toFile } from 'openai/uploads';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('speech-analyzer');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Segmento de fala transcrito
 */
export interface SpeechSegment {
  timestamp: number;
  duration: number;
  text: string;
  confidence: number; // 0-1
  words: Array<{
    word: string;
    timestamp: number;
    confidence: number;
  }>;
}

/**
 * Palavra-chave detectada
 */
export interface Keyword {
  word: string;
  category: 'excitement' | 'emotion' | 'action' | 'viral' | 'emphasis';
  timestamp: number;
  context: string; // Texto ao redor
}

/**
 * Sentimento de um segmento
 */
export interface Sentiment {
  timestamp: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number; // -1 a 1 (negativo a positivo)
  intensity: number; // 0-1 (quão forte é o sentimento)
}

/**
 * Resultado da análise de fala
 */
export interface SpeechAnalysisResult {
  segments: SpeechSegment[];
  keywords: Keyword[];
  sentiments: Sentiment[];
  stats: {
    totalWords: number;
    wordsPerMinute: number;
    speechDuration: number; // Duração total da fala
    silenceDuration: number; // Duração total de silêncio
    keywordDensity: number; // Palavras-chave por minuto
  };
}

/**
 * Palavras-chave virais em português
 */
const VIRAL_KEYWORDS: { [category: string]: string[] } = {
  excitement: [
    'incrível',
    'uau',
    'nossa',
    'meu deus',
    'caramba',
    'impressionante',
    'surpreendente',
    'maravilhoso',
    'fantástico',
    'sensacional',
  ],
  emotion: [
    'amo',
    'adoro',
    'odeio',
    'emociona',
    'chorando',
    'rindo',
    'feliz',
    'triste',
    'raiva',
    'medo',
  ],
  action: [
    'vamos',
    'bora',
    'agora',
    'já',
    'rápido',
    'corre',
    'atenção',
    'olha',
    'veja',
    'assista',
  ],
  viral: [
    'viral',
    'bomba',
    'explosão',
    'trends',
    'polêmico',
    'chocante',
    'revelação',
    'segredo',
    'verdade',
    'fake',
  ],
  emphasis: [
    'muito',
    'super',
    'mega',
    'ultra',
    'demais',
    'extremamente',
    'totalmente',
    'completamente',
    'absolutamente',
  ],
};

/**
 * Palavras de sentimento positivo/negativo
 */
const SENTIMENT_WORDS = {
  positive: [
    'bom',
    'ótimo',
    'legal',
    'bacana',
    'top',
    'massa',
    'show',
    'perfeito',
    'excelente',
    'maravilhoso',
    'feliz',
    'alegre',
    'amor',
    'sucesso',
    'vitória',
  ],
  negative: [
    'ruim',
    'péssimo',
    'horrível',
    'terrível',
    'problema',
    'erro',
    'falha',
    'triste',
    'chato',
    'boring',
    'ódio',
    'fracasso',
    'derrota',
  ],
};

/**
 * Extrai áudio para speech-to-text
 */
async function extractAudioForSpeech(
  videoPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        '-vn',
        '-acodec',
        'pcm_s16le',
        '-ar',
        '16000', // 16kHz (ideal for speech)
        '-ac',
        '1', // Mono
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Speech-to-text usando OpenAI Whisper API.
 * Em caso de erro (ou API key ausente), faz fallback para mock.
 */
async function transcribeAudio(
  audioPath: string,
  useWhisperAPI: boolean
): Promise<SpeechSegment[]> {
  if (useWhisperAPI) {
    try {
      return await transcribeWithWhisper(audioPath);
    } catch (error: any) {
      logger.warn(
        { error: error.message },
        'Whisper transcription failed, falling back to mock transcription'
      );
    }
  }

  logger.warn('Using mock transcription. Configure OPENAI_API_KEY to enable Whisper.');

  return [
    {
      timestamp: 0,
      duration: 5.0,
      text: 'Olá pessoal, tudo bem? Hoje vou falar sobre um assunto incrível!',
      confidence: 0.95,
      words: [
        { word: 'olá', timestamp: 0.0, confidence: 0.98 },
        { word: 'pessoal', timestamp: 0.5, confidence: 0.97 },
        { word: 'incrível', timestamp: 4.5, confidence: 0.95 },
      ],
    },
    {
      timestamp: 5.0,
      duration: 4.0,
      text: 'Nossa, vocês não vão acreditar no que aconteceu!',
      confidence: 0.92,
      words: [
        { word: 'nossa', timestamp: 5.0, confidence: 0.96 },
        { word: 'acreditar', timestamp: 7.0, confidence: 0.90 },
      ],
    },
  ];
}

/**
 * Detecta palavras-chave em segmentos transcritos
 */
function detectKeywords(segments: SpeechSegment[]): Keyword[] {
  const keywords: Keyword[] = [];

  for (const segment of segments) {
    const text = segment.text.toLowerCase();
    const words = text.split(/\s+/);

    // Check each category
    for (const [category, keywordList] of Object.entries(VIRAL_KEYWORDS)) {
      for (const keyword of keywordList) {
        if (text.includes(keyword)) {
          keywords.push({
            word: keyword,
            category: category as any,
            timestamp: segment.timestamp,
            context: segment.text,
          });
        }
      }
    }
  }

  return keywords;
}

/**
 * Analisa sentimento de segmentos
 */
function analyzeSentiment(segments: SpeechSegment[]): Sentiment[] {
  const sentiments: Sentiment[] = [];

  for (const segment of segments) {
    const text = segment.text.toLowerCase();
    const words = text.split(/\s+/);

    let positiveCount = 0;
    let negativeCount = 0;

    // Count positive/negative words
    for (const word of words) {
      if (SENTIMENT_WORDS.positive.includes(word)) {
        positiveCount++;
      }
      if (SENTIMENT_WORDS.negative.includes(word)) {
        negativeCount++;
      }
    }

    // Calculate sentiment
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    let score = 0;
    let intensity = 0;

    if (positiveCount > negativeCount) {
      sentiment = 'positive';
      score = 0.5 + (positiveCount / words.length) * 0.5;
      intensity = Math.min(1, positiveCount / 3);
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative';
      score = -0.5 - (negativeCount / words.length) * 0.5;
      intensity = Math.min(1, negativeCount / 3);
    } else {
      sentiment = 'neutral';
      score = 0;
      intensity = 0;
    }

    sentiments.push({
      timestamp: segment.timestamp,
      sentiment,
      score,
      intensity,
    });
  }

  return sentiments;
}

/**
 * Calcula estatísticas de fala
 */
function calculateSpeechStats(
  segments: SpeechSegment[],
  keywords: Keyword[],
  videoDuration: number
): SpeechAnalysisResult['stats'] {
  const totalWords = segments.reduce((sum, seg) => sum + seg.words.length, 0);
  const speechDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
  const silenceDuration = videoDuration - speechDuration;
  const wordsPerMinute = (totalWords / speechDuration) * 60;
  const keywordDensity = (keywords.length / videoDuration) * 60;

  return {
    totalWords,
    wordsPerMinute,
    speechDuration,
    silenceDuration,
    keywordDensity,
  };
}

/**
 * Get video duration
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Analisa fala em um vídeo
 */
export async function analyzeSpeech(
  videoPath: string,
  options: {
    useWhisperAPI?: boolean; // Se true, usa Whisper e faz fallback para mock em caso de erro
    detectKeywords?: boolean;
    analyzeSentiment?: boolean;
  } = {}
): Promise<SpeechAnalysisResult> {
  const {
    useWhisperAPI = true,
    detectKeywords: shouldDetectKeywords = true,
    analyzeSentiment: shouldAnalyzeSentiment = true,
  } = options;

  logger.info({ videoPath, useWhisperAPI }, 'Starting speech analysis');

  const tempDir = join('/tmp', `speech-analysis-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Extract audio
    const audioPath = join(tempDir, 'audio.wav');
    logger.info('Extracting audio for speech...');
    await extractAudioForSpeech(videoPath, audioPath);

    // Transcribe
    logger.info('Transcribing audio...');
    const segments = await transcribeAudio(audioPath, useWhisperAPI);

    if (!useWhisperAPI) {
      logger.warn('Speech analysis running with mock transcription (useWhisperAPI=false)');
    }

    // Detect keywords
    let keywords: Keyword[] = [];
    if (shouldDetectKeywords) {
      logger.info('Detecting keywords...');
      keywords = detectKeywords(segments);
    }

    // Analyze sentiment
    let sentiments: Sentiment[] = [];
    if (shouldAnalyzeSentiment) {
      logger.info('Analyzing sentiment...');
      sentiments = analyzeSentiment(segments);
    }

    // Calculate stats
    const duration = await getVideoDuration(videoPath);
    const stats = calculateSpeechStats(segments, keywords, duration);

    logger.info(
      {
        segments: segments.length,
        keywords: keywords.length,
        totalWords: stats.totalWords,
        wordsPerMinute: stats.wordsPerMinute.toFixed(0),
      },
      'Speech analysis completed'
    );

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      segments,
      keywords,
      sentiments,
      stats,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Speech analysis failed');
    throw new Error(`Speech analysis failed: ${error.message}`);
  }
}

/**
 * Transcrição real via OpenAI Whisper API.
 */
export async function transcribeWithWhisper(audioPath: string): Promise<SpeechSegment[]> {
  if (!env.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const fileBuffer = await fs.readFile(audioPath);
  const file = await toFile(fileBuffer, basename(audioPath));

  const client = new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: 120000,
    maxRetries: 1,
  });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'pt',
    response_format: 'verbose_json',
  });

  const typed = transcription as any;
  const rawSegments = Array.isArray(typed?.segments) ? typed.segments : [];

  if (!rawSegments.length) {
    const text = String(typed?.text || '').trim();
    if (!text) return [];
    const words = text.split(/\s+/).filter(Boolean);
    return [
      {
        timestamp: 0,
        duration: Math.max(1, words.length / 2.5),
        text,
        confidence: 0.9,
        words: words.map((word, index) => ({
          word,
          timestamp: index * 0.4,
          confidence: 0.9,
        })),
      },
    ];
  }

  return rawSegments
    .map((segment: any) => {
      const start = Number(segment?.start ?? 0);
      const end = Number(segment?.end ?? start);
      const text = String(segment?.text || '').trim();

      const wordsRaw = Array.isArray(segment?.words) ? segment.words : [];
      const words = wordsRaw
        .map((wordObj: any) => {
          const word = String(wordObj?.word || '').trim();
          if (!word) return null;
          return {
            word,
            timestamp: Number(wordObj?.start ?? start),
            confidence: typeof wordObj?.probability === 'number'
              ? Math.max(0, Math.min(1, wordObj.probability))
              : 0.9,
          };
        })
        .filter(Boolean) as SpeechSegment['words'];

      if (!text) return null;

      return {
        timestamp: start,
        duration: Math.max(0.1, end - start),
        text,
        confidence: typeof segment?.avg_logprob === 'number'
          ? Math.max(0, Math.min(1, Math.exp(segment.avg_logprob)))
          : 0.9,
        words,
      } as SpeechSegment;
    })
    .filter(Boolean) as SpeechSegment[];
}
