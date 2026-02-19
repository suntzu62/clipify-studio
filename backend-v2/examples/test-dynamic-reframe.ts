/**
 * Exemplo de uso do Reenquadramento Dinâmico com Tracking Temporal (Fase 2)
 *
 * Este script demonstra como usar o serviço de reenquadramento dinâmico
 * que rastreia o assunto ao longo do tempo e aplica pan/zoom suave.
 *
 * Execute com:
 * tsx examples/test-dynamic-reframe.ts /path/to/video.mp4
 */

import { applyDynamicReframe } from '../src/services/dynamic-reframe.js';
import { initializeIntelligentReframe } from '../src/services/intelligent-reframe.js';
import { createLogger } from '../src/config/logger.js';

const logger = createLogger('test-dynamic-reframe');

async function main() {
  logger.info('🎬 Teste de Reenquadramento Dinâmico - Fase 2\n');

  // Caminho do vídeo de entrada
  const inputVideo = process.argv[2] || '/path/to/your/video.mp4';

  if (inputVideo === '/path/to/your/video.mp4') {
    logger.error('❌ Por favor, forneça o caminho do vídeo como argumento:');
    logger.error('   tsx examples/test-dynamic-reframe.ts /caminho/para/video.mp4');
    process.exit(1);
  }

  try {
    // 1. Inicializar serviço (carregar modelos)
    logger.info('1️⃣  Inicializando serviço...');
    await initializeIntelligentReframe();

    // 2. Aplicar reenquadramento dinâmico com tracking temporal
    logger.info('2️⃣  Aplicando reenquadramento dinâmico...');
    logger.info('    ⏱️  Isto pode levar alguns minutos dependendo da duração do vídeo...\n');

    const result = await applyDynamicReframe(inputVideo, {
      targetAspectRatio: '9:16', // Formato vertical
      trackingInterval: 0.5, // Analisar a cada 0.5 segundos
      smoothingWindow: 7, // Suavizar com 7 frames
      minConfidence: 0.5,
      adaptiveTracking: true, // Ajustar intervalo baseado em movimento
      exportTrajectory: true, // Exportar trajetória como JSON
      preset: 'fast', // Preset mais rápido para teste
    });

    // 3. Exibir resultado
    logger.info('\n✅ Reenquadramento dinâmico concluído!\n');
    logger.info('📊 Estatísticas:');
    logger.info(`   - Vídeo de saída: ${result.outputPath}`);
    logger.info(`   - Duração: ${result.duration.toFixed(2)}s`);
    logger.info(`   - Total de keyframes: ${result.stats.totalKeyframes}`);
    logger.info(
      `   - Taxa de detecção de faces: ${result.stats.faceDetectionRate.toFixed(1)}%`
    );
    logger.info(
      `   - Confiança média: ${(result.stats.averageConfidence * 100).toFixed(1)}%`
    );

    if (result.trajectoryPath) {
      logger.info(`   - Trajetória exportada: ${result.trajectoryPath}`);
    }

    logger.info('\n📈 Informações da Trajetória:');
    logger.info(`   - FPS: ${result.trajectory.fps.toFixed(2)}`);
    logger.info(`   - Suavização aplicada: ${result.trajectory.smoothingLevel} frames`);
    logger.info(
      `   - Resolução original: ${result.trajectory.videoMetadata.width}x${result.trajectory.videoMetadata.height}`
    );

    if (result.stats.faceDetectionRate > 50) {
      logger.info('\n🎯 Boa taxa de detecção! O vídeo foi reenquadrado seguindo as faces.');
    } else {
      logger.warn(
        '\n⚠️  Baixa taxa de detecção de faces. O vídeo foi reenquadrado com crop central.'
      );
      logger.warn('   Dica: Tente reduzir minConfidence para 0.3');
    }

    logger.info(`\n🎥 Assista o vídeo reenquadrado: ${result.outputPath}`);

    if (result.trajectoryPath) {
      logger.info(
        `📊 Visualize a trajetória: cat ${result.trajectoryPath} | jq`
      );
    }
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
 * 1. Tracking padrão (0.5s interval):
 *    tsx examples/test-dynamic-reframe.ts video.mp4
 *
 * 2. Tracking mais preciso (0.2s interval):
 *    Modifique trackingInterval para 0.2
 *
 * 3. Suavização mais agressiva:
 *    Modifique smoothingWindow para 10
 *
 * 4. Formato quadrado para Instagram:
 *    Modifique targetAspectRatio para '1:1'
 *
 * 5. Qualidade máxima (mais lento):
 *    Modifique preset para 'slow'
 */
