/**
 * Exemplo de uso do Reenquadramento Avançado - Fase 3
 *
 * Este script demonstra os recursos mais avançados:
 * - Detecção de múltiplas pessoas
 * - Priorização inteligente (quem está falando)
 * - Zoom automático em momentos-chave
 * - Heat map de importância
 *
 * Execute com:
 * tsx examples/test-advanced-reframe.ts /path/to/video.mp4
 */

import { applyAdvancedReframe } from '../src/services/advanced-reframe.js';
import { initializeIntelligentReframe } from '../src/services/intelligent-reframe.js';
import { createLogger } from '../src/config/logger.js';

const logger = createLogger('test-advanced-reframe');

async function main() {
  logger.info('🎬 Teste de Reenquadramento Avançado - Fase 3\n');
  logger.info('🚀 Recursos: Múltiplas pessoas + Priorização + Auto Zoom + Heat Maps\n');

  // Caminho do vídeo de entrada
  const inputVideo = process.argv[2] || '/path/to/your/video.mp4';

  if (inputVideo === '/path/to/your/video.mp4') {
    logger.error('❌ Por favor, forneça o caminho do vídeo como argumento:');
    logger.error('   tsx examples/test-advanced-reframe.ts /caminho/para/video.mp4');
    process.exit(1);
  }

  try {
    // 1. Inicializar serviço
    logger.info('1️⃣  Inicializando serviço de IA...');
    await initializeIntelligentReframe();

    // 2. Aplicar reenquadramento avançado
    logger.info('2️⃣  Aplicando reenquadramento avançado (Fase 3)...');
    logger.info('    ⏱️  Isto pode levar vários minutos...\n');

    const result = await applyAdvancedReframe(inputVideo, {
      targetAspectRatio: '9:16',
      trackingInterval: 0.5,
      minConfidence: 0.5,

      // 🎭 Recursos Avançados da Fase 3
      detectMultiplePeople: true,       // Detectar várias pessoas
      prioritizeSpeaker: true,          // Priorizar quem está falando
      autoZoom: true,                   // Zoom automático
      zoomIntensity: 0.7,               // Intensidade do zoom (0.0-1.0)
      smoothTransitions: true,          // Transições suaves
      exportAnalytics: true,            // Exportar analytics JSON

      preset: 'fast', // Preset rápido para teste
    });

    // 3. Exibir resultados
    logger.info('\n✅ Reenquadramento avançado concluído!\n');

    logger.info('📊 Estatísticas Gerais:');
    logger.info(`   - Vídeo de saída: ${result.outputPath}`);
    logger.info(`   - Duração: ${result.duration.toFixed(2)}s`);
    logger.info(`   - Total de keyframes: ${result.stats.totalKeyframes}`);

    logger.info('\n👥 Detecção de Pessoas:');
    logger.info(`   - Total de pessoas detectadas: ${result.stats.peopleDetected}`);
    logger.info(`   - Média de pessoas por frame: ${result.stats.avgPeoplePerFrame.toFixed(2)}`);

    logger.info('\n🎤 Análise de Áudio:');
    logger.info(`   - Atividade de fala: ${(result.stats.speechActivity * 100).toFixed(1)}%`);

    logger.info('\n🔍 Momentos-Chave:');
    logger.info(`   - Momentos detectados: ${result.stats.keyMomentsDetected}`);
    logger.info(`   - Zooms aplicados: ${result.stats.zoomEventsApplied}`);

    if (result.analyticsPath) {
      logger.info('\n📈 Analytics Exportados:');
      logger.info(`   - Arquivo JSON: ${result.analyticsPath}`);
      logger.info(`   - Visualizar: cat ${result.analyticsPath} | jq`);
    }

    // Exibir alguns momentos-chave
    if (result.trackingResult.keyMoments.length > 0) {
      logger.info('\n⭐ Primeiros Momentos-Chave:');
      result.trackingResult.keyMoments.slice(0, 5).forEach((moment, i) => {
        logger.info(`   ${i + 1}. [${moment.timestamp.toFixed(1)}s] ${moment.type.toUpperCase()}: ${moment.description} (${(moment.intensity * 100).toFixed(0)}%)`);
      });
    }

    // Exibir heat map summary
    if (result.trackingResult.heatMaps.length > 0) {
      logger.info('\n🗺️  Heat Maps Gerados:');
      logger.info(`   - Total de heat maps: ${result.trackingResult.heatMaps.length}`);
      const totalHotspots = result.trackingResult.heatMaps.reduce(
        (sum, hm) => sum + hm.hotspots.length,
        0
      );
      logger.info(`   - Total de hotspots: ${totalHotspots}`);
    }

    // Dicas baseadas nos resultados
    logger.info('\n💡 Análise:');

    if (result.stats.avgPeoplePerFrame > 1.5) {
      logger.info('   ✓ Vídeo com múltiplas pessoas detectado');
      logger.info('   ✓ Priorização inteligente foi aplicada');
    } else {
      logger.info('   ℹ️  Vídeo principalmente com uma pessoa');
    }

    if (result.stats.speechActivity > 0.5) {
      logger.info('   ✓ Alta atividade de fala detectada');
      logger.info('   ✓ Priorização por fala foi útil');
    } else {
      logger.info('   ℹ️  Pouca atividade de fala');
    }

    if (result.stats.zoomEventsApplied > 0) {
      logger.info(`   ✓ ${result.stats.zoomEventsApplied} zoom(s) automático(s) aplicado(s)`);
    }

    logger.info(`\n🎥 Assista o vídeo reenquadrado: ${result.outputPath}`);

  } catch (error: any) {
    logger.error('\n❌ Erro ao processar vídeo:', error.message);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Executar teste
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});

/**
 * EXEMPLOS DE USO:
 *
 * 1. Máxima inteligência (padrão):
 *    tsx examples/test-advanced-reframe.ts video.mp4
 *
 * 2. Apenas zoom automático (sem multi-pessoa):
 *    Modifique: detectMultiplePeople: false, autoZoom: true
 *
 * 3. Apenas priorização de fala:
 *    Modifique: detectMultiplePeople: false, prioritizeSpeaker: true
 *
 * 4. Zoom mais agressivo:
 *    Modifique: zoomIntensity: 1.0
 *
 * 5. Qualidade máxima (mais lento):
 *    Modifique: preset: 'slow'
 *
 * CASOS DE USO:
 *
 * - Podcast com 2+ pessoas: detectMultiplePeople + prioritizeSpeaker
 * - Palestra: autoZoom + prioritizeSpeaker
 * - Entrevista: detectMultiplePeople + prioritizeSpeaker + autoZoom
 * - Vlog: autoZoom (detectMultiplePeople: false)
 */
