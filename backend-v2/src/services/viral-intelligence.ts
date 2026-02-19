/**
 * Viral Intelligence Service
 *
 * Serviço principal que orquestra todas as análises para detectar
 * momentos emocionantes e gerar clips virais automaticamente:
 *
 * Pipeline completo:
 * 1. Análise de áudio (energia, pitch, picos)
 * 2. Análise de emoções faciais (feliz, surpreso, etc)
 * 3. Análise de fala (palavras-chave, sentimento)
 * 4. Detecção de highlights (scoring de viralidade)
 * 5. Geração de clips virais
 */

import { createLogger } from '../config/logger.js';
import { analyzeAudio, type AudioAnalysisResult } from './audio-analyzer.js';
import { analyzeEmotions, type EmotionAnalysisResult } from './emotion-detector.js';
import { analyzeSpeech, type SpeechAnalysisResult } from './speech-analyzer.js';
import {
  detectHighlights,
  type HighlightDetectionResult,
  type HighlightDetectionOptions,
} from './highlight-detector.js';
import {
  generateViralClips,
  exportClipMetadata,
  type ClipGenerationOptions,
  type ClipGenerationResult,
} from './viral-clip-generator.js';
import { analyzeHook, type HookAnalysis } from './hook-detector.js';
import { generateScoreBreakdown, type ScoreBreakdown } from './score-breakdown.js';
import { generateHookVariations, type HookVariation } from './variation-generator.js';

const logger = createLogger('viral-intelligence');

/**
 * Opções de análise viral
 */
export interface ViralIntelligenceOptions {
  // Análise de áudio
  audioInterval?: number; // Intervalo de análise de áudio (padrão: 0.5s)
  detectAudioPeaks?: boolean;

  // Análise de emoções
  emotionInterval?: number; // Intervalo entre frames (padrão: 2s)
  detectEmotionalMoments?: boolean;

  // Análise de fala
  analyzeSpeech?: boolean; // Se true, analisa fala (padrão: true)
  detectKeywords?: boolean;
  analyzeSentiment?: boolean;

  // Detecção de highlights
  highlightOptions?: HighlightDetectionOptions;

  // 🆕 Hook Analysis (primeiros 3-5s)
  analyzeHook?: boolean; // Se true, analisa hook inicial (padrão: true)
  hookDuration?: number; // Duração do hook (padrão: 5s)

  // 🆕 Score Breakdown (explicável)
  generateBreakdowns?: boolean; // Se true, gera breakdown para cada highlight (padrão: true)

  // Geração de clips
  generateClips?: boolean; // Se true, gera clips automaticamente
  clipOptions?: ClipGenerationOptions;
}

/**
 * Resultado completo da análise viral
 */
export interface ViralIntelligenceResult {
  // Análises individuais
  audio: AudioAnalysisResult;
  emotions: EmotionAnalysisResult;
  speech: SpeechAnalysisResult;

  // Highlights detectados
  highlights: HighlightDetectionResult;

  // 🆕 Análise de Hook (primeiros 3-5s)
  hookAnalysis?: HookAnalysis;
  hookVariations?: HookVariation[];

  // 🆕 Breakdown de Score (explicável) para cada highlight
  scoreBreakdowns?: ScoreBreakdown[];

  // Clips gerados (opcional)
  clips?: ClipGenerationResult;

  // Resumo executivo
  summary: {
    totalHighlights: number;
    topViralScore: number;
    averageViralScore: number;
    recommendedClips: number;
    processingTime: number; // Tempo total em segundos
    hookScore?: number; // 🆕 Score do hook inicial
    hookVariations?: number;
  };
}

/**
 * Analisa vídeo e detecta momentos emocionantes com potencial viral
 */
export async function analyzeVideoForVirality(
  videoPath: string,
  options: ViralIntelligenceOptions = {}
): Promise<ViralIntelligenceResult> {
  const startTime = Date.now();

  const {
    audioInterval = 0.5,
    detectAudioPeaks = true,
    emotionInterval = 2.0,
    detectEmotionalMoments = true,
    analyzeSpeech: shouldAnalyzeSpeech = true,
    detectKeywords = true,
    analyzeSentiment = true,
    highlightOptions = {},
    generateClips: shouldGenerateClips = false,
    clipOptions = {},
  } = options;

  logger.info({ videoPath }, '🚀 Starting Viral Intelligence analysis');

  try {
    // Step 1: Audio Analysis
    logger.info('📊 Step 1/5: Analyzing audio');
    const audio = await analyzeAudio(videoPath, {
      interval: audioInterval,
      detectPeaks: detectAudioPeaks,
    });

    logger.info(
      {
        features: audio.features.length,
        peaks: audio.peaks.length,
        avgEnergy: audio.stats.averageEnergy.toFixed(2),
      },
      '✅ Audio analysis completed'
    );

    // Step 2: Emotion Analysis
    logger.info('😊 Step 2/5: Analyzing emotions');
    const emotions = await analyzeEmotions(videoPath, {
      interval: emotionInterval,
      detectMoments: detectEmotionalMoments,
    });

    logger.info(
      {
        detections: emotions.detections.length,
        moments: emotions.moments.length,
        mostCommon: emotions.stats.mostCommonEmotion,
      },
      '✅ Emotion analysis completed'
    );

    // Step 3: Speech Analysis
    logger.info('🗣️  Step 3/5: Analyzing speech');
    const speech = shouldAnalyzeSpeech
      ? await analyzeSpeech(videoPath, {
          detectKeywords,
          analyzeSentiment,
        })
      : {
          segments: [],
          keywords: [],
          sentiments: [],
          stats: {
            totalWords: 0,
            wordsPerMinute: 0,
            speechDuration: 0,
            silenceDuration: 0,
            keywordDensity: 0,
          },
        };

    logger.info(
      {
        segments: speech.segments.length,
        keywords: speech.keywords.length,
        totalWords: speech.stats.totalWords,
      },
      '✅ Speech analysis completed'
    );

    // Step 4: Highlight Detection
    logger.info('⭐ Step 4/5: Detecting highlights');

    // Calculate video duration from audio features
    const videoDuration =
      audio.features.length > 0
        ? audio.features[audio.features.length - 1].timestamp + audioInterval
        : 0;

    const highlights = await detectHighlights(
      audio,
      emotions,
      speech,
      videoDuration,
      highlightOptions
    );

    logger.info(
      {
        highlights: highlights.highlights.length,
        coverage: highlights.coverage.toFixed(1) + '%',
        topScore: highlights.stats.topScore.toFixed(0),
      },
      '✅ Highlight detection completed'
    );

    // 🆕 Step 4.5: Hook Analysis (primeiros 3-5s)
    let hookAnalysis: HookAnalysis | undefined;
    let hookVariations: HookVariation[] | undefined;
    const shouldAnalyzeHook = options.analyzeHook !== false; // Default: true

    if (shouldAnalyzeHook) {
      logger.info('🎯 Step 4.5/6: Analyzing hook (first 3-5s)');

      hookAnalysis = await analyzeHook(audio, emotions, speech, {
        duration: options.hookDuration || 5,
      });

      logger.info(
        {
          hookScore: hookAnalysis.hookScore,
          pattern: hookAnalysis.pattern,
          retention3s: hookAnalysis.retentionPrediction.first3s + '%',
        },
        '✅ Hook analysis completed'
      );
    }

    if (hookAnalysis) {
      hookVariations = generateHookVariations(hookAnalysis);
    }

    // 🆕 Step 4.6: Score Breakdowns (explicável)
    let scoreBreakdowns: ScoreBreakdown[] | undefined;
    const shouldGenerateBreakdowns = options.generateBreakdowns !== false; // Default: true

    if (shouldGenerateBreakdowns && highlights.highlights.length > 0) {
      logger.info('📊 Step 4.6/6: Generating score breakdowns');

      scoreBreakdowns = highlights.highlights.map((highlight) =>
        generateScoreBreakdown(highlight)
      );

      logger.info(
        {
          breakdowns: scoreBreakdowns.length,
          excellent: scoreBreakdowns.filter((b) => b.summary.verdict === 'excellent').length,
          good: scoreBreakdowns.filter((b) => b.summary.verdict === 'good').length,
        },
        '✅ Score breakdowns generated'
      );
    }

    // Step 5: Generate Clips (optional)
    let clips: ClipGenerationResult | undefined;

    if (shouldGenerateClips && highlights.highlights.length > 0) {
      logger.info('🎬 Step 5/5: Generating viral clips');

      clips = await generateViralClips(
        videoPath,
        highlights.highlights,
        clipOptions
      );

      // Export metadata
      if (clips.clips.length > 0) {
        const metadataPath = `${clips.outputDir}/metadata.json`;
        await exportClipMetadata(clips.clips, metadataPath);
      }

      logger.info(
        {
          clips: clips.clips.length,
          avgScore: clips.stats.averageViralScore.toFixed(0),
        },
        '✅ Clip generation completed'
      );
    } else {
      logger.info('⏭️  Step 5/5: Skipping clip generation');
    }

    // Calculate processing time
    const processingTime = (Date.now() - startTime) / 1000;

    // Create summary
    const summary = {
      totalHighlights: highlights.highlights.length,
      topViralScore: highlights.stats.topScore,
      averageViralScore: highlights.stats.averageViralScore,
      recommendedClips: Math.min(5, highlights.highlights.length),
      processingTime,
      hookScore: hookAnalysis?.hookScore, // 🆕 Hook score
      hookVariations: hookVariations?.length || 0,
    };

    logger.info(
      {
        highlights: summary.totalHighlights,
        topScore: summary.topViralScore.toFixed(0),
        hookScore: hookAnalysis?.hookScore,
        processingTime: processingTime.toFixed(1) + 's',
      },
      '🎉 Viral Intelligence analysis completed'
    );

    return {
      audio,
      emotions,
      speech,
      highlights,
      hookAnalysis, // 🆕 Análise de hook
      hookVariations,
      scoreBreakdowns, // 🆕 Breakdowns de score
      clips,
      summary,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Viral Intelligence analysis failed');
    throw new Error(`Viral Intelligence analysis failed: ${error.message}`);
  }
}

/**
 * Analisa vídeo e gera apenas relatório (sem clips)
 */
export async function analyzeVideoForReport(
  videoPath: string,
  options: Omit<ViralIntelligenceOptions, 'generateClips' | 'clipOptions'> = {}
): Promise<ViralIntelligenceResult> {
  return analyzeVideoForVirality(videoPath, {
    ...options,
    generateClips: false,
  });
}

/**
 * Pipeline completo: analisa e gera clips virais
 */
export async function generateViralClipsFromVideo(
  videoPath: string,
  options: ViralIntelligenceOptions = {}
): Promise<ClipGenerationResult> {
  const result = await analyzeVideoForVirality(videoPath, {
    ...options,
    generateClips: true,
  });

  if (!result.clips) {
    throw new Error('No clips were generated');
  }

  return result.clips;
}
