/**
 * Exemplo de uso do Reenquadramento Inteligente
 *
 * Este script demonstra como usar o serviço de reenquadramento inteligente
 * para converter um vídeo horizontal em formato vertical (9:16) mantendo
 * o assunto principal em foco.
 *
 * Execute com:
 * tsx examples/test-reframe.ts
 */

import { applyIntelligentReframe, initializeIntelligentReframe } from '../src/services/intelligent-reframe.js';
import { createLogger } from '../src/config/logger.js';
import { join } from 'path';

const logger = createLogger('test-reframe');

async function main() {
  logger.info('🎬 Teste de Reenquadramento Inteligente\n');

  // Caminho do vídeo de entrada (ALTERE ESTE CAMINHO!)
  const inputVideo = process.argv[2] || '/path/to/your/video.mp4';

  if (inputVideo === '/path/to/your/video.mp4') {
    logger.error('❌ Por favor, forneça o caminho do vídeo como argumento:');
    logger.error('   tsx examples/test-reframe.ts /caminho/para/video.mp4');
    process.exit(1);
  }

  try {
    // 1. Inicializar serviço (carregar modelos de face detection)
    logger.info('1️⃣  Inicializando serviço...');
    await initializeIntelligentReframe();

    // 2. Aplicar reenquadramento inteligente
    logger.info('2️⃣  Aplicando reenquadramento inteligente...');

    const result = await applyIntelligentReframe(inputVideo, {
      targetAspectRatio: '9:16', // Formato vertical (TikTok/Reels/Shorts)
      sampleInterval: 2,         // Analisar a cada 2 segundos
      minConfidence: 0.5,        // Confiança mínima de 50%
      preset: 'fast',            // Preset mais rápido para teste
    });

    // 3. Exibir resultado
    logger.info('\n✅ Reenquadramento concluído com sucesso!\n');
    logger.info('📊 Resultado:');
    logger.info(`   - Vídeo de saída: ${result.outputPath}`);
    logger.info(`   - Duração: ${result.duration.toFixed(2)}s`);
    logger.info(`   - Método de detecção: ${result.roi.detectionMethod}`);
    logger.info(`   - ROI: x=${result.roi.roi?.x}, y=${result.roi.roi?.y}, w=${result.roi.roi?.width}, h=${result.roi.roi?.height}`);
    logger.info(`   - Confiança: ${((result.roi.roi?.confidence || 0) * 100).toFixed(1)}%`);

    if (result.roi.detectionMethod === 'face') {
      logger.info('\n🎯 Faces detectadas com sucesso!');
    } else if (result.roi.detectionMethod === 'center') {
      logger.warn('\n⚠️  Nenhuma face detectada, usando crop central');
      logger.warn('   Dica: Tente reduzir minConfidence para 0.3');
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
 * 1. Formato Vertical (TikTok/Reels/Shorts):
 *    tsx examples/test-reframe.ts video.mp4
 *
 * 2. Formato Quadrado (Instagram):
 *    Modifique targetAspectRatio para '1:1'
 *
 * 3. Formato Retrato (Instagram Portrait):
 *    Modifique targetAspectRatio para '4:5'
 *
 * 4. Análise mais detalhada (mais lento):
 *    Modifique sampleInterval para 1
 *
 * 5. Detecção mais sensível:
 *    Modifique minConfidence para 0.3
 */
