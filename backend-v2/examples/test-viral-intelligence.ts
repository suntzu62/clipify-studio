/**
 * Teste do Sistema de Viral Intelligence
 *
 * Demonstra como usar a análise completa de momentos emocionantes
 * para detectar highlights e gerar clips virais automaticamente.
 *
 * Uso:
 * tsx examples/test-viral-intelligence.ts /caminho/para/video.mp4 [opções]
 *
 * Opções:
 * --report-only: Apenas gera relatório, sem criar clips
 * --generate-clips: Gera clips virais automaticamente
 * --reframe: Aplica reenquadramento inteligente nos clips
 */

import { analyzeVideoForVirality, analyzeVideoForReport, generateViralClipsFromVideo } from '../src/services/viral-intelligence.js';
import type { ViralIntelligenceOptions } from '../src/types/index.js';
import { createLogger } from '../src/config/logger.js';
import { promises as fs } from 'fs';
import { join } from 'path';

const logger = createLogger('test-viral-intelligence');

// Parse command line arguments
const videoPath = process.argv[2];
const reportOnly = process.argv.includes('--report-only');
const generateClips = process.argv.includes('--generate-clips');
const applyReframe = process.argv.includes('--reframe');

if (!videoPath) {
  console.error('❌ Erro: Caminho do vídeo é obrigatório');
  console.log('\n📖 Uso:');
  console.log('  tsx examples/test-viral-intelligence.ts VIDEO.mp4 [opções]\n');
  console.log('🔧 Opções:');
  console.log('  --report-only     Apenas gera relatório (sem clips)');
  console.log('  --generate-clips  Gera clips virais automaticamente');
  console.log('  --reframe         Aplica reenquadramento inteligente\n');
  console.log('📝 Exemplos:');
  console.log('  # Apenas relatório (análise completa)');
  console.log('  tsx examples/test-viral-intelligence.ts video.mp4 --report-only\n');
  console.log('  # Gera clips sem reenquadramento');
  console.log('  tsx examples/test-viral-intelligence.ts video.mp4 --generate-clips\n');
  console.log('  # Gera clips COM reenquadramento para 9:16');
  console.log('  tsx examples/test-viral-intelligence.ts video.mp4 --generate-clips --reframe\n');
  process.exit(1);
}

async function main() {
  console.log('\n🚀 VIRAL INTELLIGENCE - Detecção de Momentos Emocionantes\n');
  console.log(`📹 Vídeo: ${videoPath}`);
  console.log(`📊 Modo: ${reportOnly ? 'Relatório' : generateClips ? 'Geração de Clips' : 'Análise'}`);
  console.log(`🎬 Reenquadramento: ${applyReframe ? 'Sim (9:16)' : 'Não'}\n`);
  console.log('━'.repeat(60));

  try {
    // Verifica se o arquivo existe
    await fs.access(videoPath);
  } catch (error: any) {
    console.error(`\n❌ Erro: Arquivo não encontrado: ${videoPath}\n`);
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    if (reportOnly) {
      // Modo: Apenas relatório
      console.log('\n📋 Gerando relatório completo...\n');

      const result = await analyzeVideoForReport(videoPath, {
        audioInterval: 0.5,
        emotionInterval: 2.0,
        analyzeSpeech: true,
        detectKeywords: true,
        analyzeSentiment: true,
        highlightOptions: {
          minViralScore: 60,
          maxHighlights: 10,
        },
      });

      // Print report
      printAnalysisReport(result);

      // Export report as JSON
      const reportPath = videoPath.replace(/\.[^.]+$/, '-viral-report.json');
      await fs.writeFile(reportPath, JSON.stringify(result, null, 2), 'utf8');
      console.log(`\n💾 Relatório exportado: ${reportPath}\n`);

    } else if (generateClips) {
      // Modo: Gera clips automaticamente
      console.log('\n🎬 Gerando clips virais...\n');

      const options: ViralIntelligenceOptions = {
        audioInterval: 0.5,
        emotionInterval: 2.0,
        analyzeSpeech: true,
        detectKeywords: true,
        analyzeSentiment: true,
        highlightOptions: {
          minViralScore: 60,
          maxHighlights: 10,
        },
        generateClips: true,
        clipOptions: {
          targetAspectRatio: '9:16',
          applyReframe,
          addMargins: true,
          marginBefore: 1,
          marginAfter: 1,
          quality: 'high',
        },
      };

      const result = await analyzeVideoForVirality(videoPath, options);

      // Print analysis report
      printAnalysisReport(result);

      // Print clips info
      if (result.clips) {
        printClipsInfo(result.clips);
      }

    } else {
      // Modo padrão: Análise completa sem gerar clips
      console.log('\n🔍 Análise completa (sem geração de clips)...\n');

      const result = await analyzeVideoForVirality(videoPath, {
        audioInterval: 0.5,
        emotionInterval: 2.0,
        analyzeSpeech: true,
        detectKeywords: true,
        analyzeSentiment: true,
        highlightOptions: {
          minViralScore: 60,
          maxHighlights: 10,
        },
        generateClips: false,
      });

      printAnalysisReport(result);

      console.log('\n💡 Dica: Use --generate-clips para criar clips automaticamente\n');
    }

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Concluído em ${processingTime}s\n`);

  } catch (error: any) {
    console.error(`\n❌ Erro durante análise: ${error.message}\n`);
    logger.error({ error: error.stack }, 'Test failed');
    process.exit(1);
  }
}

/**
 * Imprime relatório de análise
 */
function printAnalysisReport(result: any) {
  console.log('\n📊 RELATÓRIO DE ANÁLISE\n');
  console.log('━'.repeat(60));

  // Audio Analysis
  console.log('\n🎵 ANÁLISE DE ÁUDIO:');
  console.log(`   • Picos de energia: ${result.audio.peaks.length}`);
  console.log(`   • Energia média: ${(result.audio.stats.averageEnergy * 100).toFixed(0)}%`);
  console.log(`   • Porção ativa: ${result.audio.stats.activePortions.toFixed(1)}%`);
  console.log(`   • Porção silenciosa: ${result.audio.stats.silentPortions.toFixed(1)}%`);

  // Emotion Analysis
  console.log('\n😊 ANÁLISE DE EMOÇÕES:');
  console.log(`   • Faces detectadas: ${result.emotions.stats.totalFaces}`);
  console.log(`   • Taxa de detecção: ${result.emotions.stats.faceDetectionRate.toFixed(1)}%`);
  console.log(`   • Emoção predominante: ${result.emotions.stats.mostCommonEmotion}`);
  console.log(`   • Momentos emocionais: ${result.emotions.moments.length}`);
  console.log(`   • Variedade emocional: ${result.emotions.stats.emotionalVariety} emoções`);

  // Speech Analysis
  console.log('\n🗣️  ANÁLISE DE FALA:');
  console.log(`   • Segmentos: ${result.speech.segments.length}`);
  console.log(`   • Palavras-chave: ${result.speech.keywords.length}`);
  console.log(`   • Palavras totais: ${result.speech.stats.totalWords}`);
  console.log(`   • Palavras/minuto: ${result.speech.stats.wordsPerMinute.toFixed(0)}`);
  console.log(`   • Densidade de keywords: ${result.speech.stats.keywordDensity.toFixed(1)}/min`);

  // Highlights
  console.log('\n⭐ HIGHLIGHTS DETECTADOS:');
  console.log(`   • Total: ${result.highlights.highlights.length}`);
  console.log(`   • Score médio: ${result.highlights.stats.averageViralScore.toFixed(0)}`);
  console.log(`   • Top score: ${result.highlights.stats.topScore.toFixed(0)}`);
  console.log(`   • Cobertura: ${result.highlights.coverage.toFixed(1)}%`);
  console.log(`   • Duração total: ${result.highlights.stats.totalDuration.toFixed(1)}s`);

  // Top 3 Highlights
  if (result.highlights.highlights.length > 0) {
    console.log('\n🏆 TOP 3 HIGHLIGHTS:');
    const top3 = result.highlights.highlights.slice(0, 3);

    top3.forEach((highlight: any, index: number) => {
      console.log(`\n   ${index + 1}. [${formatTime(highlight.timestamp)} - ${formatTime(highlight.timestamp + highlight.duration)}]`);
      console.log(`      • Viral Score: ${highlight.viralScore.toFixed(0)}/100`);
      console.log(`      • Confiança: ${(highlight.confidence * 100).toFixed(0)}%`);
      console.log(`      • Componentes:`);
      console.log(`        - Áudio: ${(highlight.components.audioScore * 100).toFixed(0)}%`);
      console.log(`        - Emoção: ${(highlight.components.emotionScore * 100).toFixed(0)}%`);
      console.log(`        - Fala: ${(highlight.components.speechScore * 100).toFixed(0)}%`);
      if (highlight.tags.length > 0) {
        console.log(`      • Tags: ${highlight.tags.join(', ')}`);
      }
      if (highlight.reasons.length > 0) {
        console.log(`      • Razões:`);
        highlight.reasons.forEach((reason: string) => {
          console.log(`        - ${reason}`);
        });
      }
    });
  }

  console.log('\n━'.repeat(60));
}

/**
 * Imprime informações dos clips gerados
 */
function printClipsInfo(clipsResult: any) {
  console.log('\n🎬 CLIPS GERADOS\n');
  console.log('━'.repeat(60));
  console.log(`\n📁 Diretório: ${clipsResult.outputDir}`);
  console.log(`📊 Total de clips: ${clipsResult.stats.totalClips}`);
  console.log(`⏱️  Duração total: ${clipsResult.stats.totalDuration.toFixed(1)}s`);
  console.log(`⭐ Score médio: ${clipsResult.stats.averageViralScore.toFixed(0)}`);
  console.log(`🎯 Clips reenquadrados: ${clipsResult.stats.reframedClips}/${clipsResult.stats.totalClips}`);

  console.log('\n📋 LISTA DE CLIPS:\n');

  clipsResult.clips.forEach((clip: any, index: number) => {
    console.log(`${index + 1}. ${clip.clipId}`);
    console.log(`   • Arquivo: ${clip.outputPath}`);
    console.log(`   • Tempo: ${formatTime(clip.startTime)} → ${formatTime(clip.endTime)} (${clip.duration.toFixed(1)}s)`);
    console.log(`   • Viral Score: ${clip.viralScore.toFixed(0)}/100`);
    console.log(`   • Confiança: ${(clip.metadata.confidence * 100).toFixed(0)}%`);
    console.log(`   • Reenquadrado: ${clip.metadata.reframed ? 'Sim' : 'Não'}`);
    if (clip.metadata.tags.length > 0) {
      console.log(`   • Tags: ${clip.metadata.tags.join(', ')}`);
    }
    console.log('');
  });

  console.log('━'.repeat(60));
}

/**
 * Formata segundos em MM:SS
 */
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

main();
