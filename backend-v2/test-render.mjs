#!/usr/bin/env node
/**
 * Teste de Download + Renderização (sem APIs pagas)
 * Testa apenas download do YouTube e corte de vídeo
 */

import { promises as fs } from 'fs';
import { execa } from 'execa';
import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';
import os from 'os';

const TEST_VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // Vídeo curto
const TEMP_DIR = join(os.tmpdir(), `test-render-${Date.now()}`);

async function main() {
  console.log('🚀 Iniciando teste de download + renderização...\n');

  try {
    // Criar diretório temporário
    await fs.mkdir(TEMP_DIR, { recursive: true });
    console.log(`✅ Diretório temporário: ${TEMP_DIR}\n`);

    // ============================================
    // STEP 1: Download do YouTube
    // ============================================
    console.log('📥 STEP 1: Baixando vídeo do YouTube...');
    const videoPath = join(TEMP_DIR, 'video.mp4');

    const downloadStart = Date.now();
    await execa('yt-dlp', [
      '-f', 'best[ext=mp4][height<=720]',
      '--no-playlist',
      '--max-filesize', '50M',
      '-o', videoPath,
      TEST_VIDEO
    ]);
    const downloadTime = Date.now() - downloadStart;

    const videoStats = await fs.stat(videoPath);
    console.log(`✅ Download completo em ${(downloadTime / 1000).toFixed(1)}s`);
    console.log(`   Tamanho: ${(videoStats.size / 1024).toFixed(0)} KB\n`);

    // ============================================
    // STEP 2: Obter duração do vídeo
    // ============================================
    console.log('📊 STEP 2: Obtendo metadata do vídeo...');

    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration);
      });
    });

    console.log(`✅ Duração: ${duration.toFixed(2)}s\n`);

    // ============================================
    // STEP 3: Renderizar 3 clipes
    // ============================================
    console.log('🎬 STEP 3: Renderizando clipes...');

    const clips = [
      { start: 0, duration: 5 },
      { start: 5, duration: 5 },
      { start: 10, duration: 5 },
    ];

    const renderStart = Date.now();

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const outputPath = join(TEMP_DIR, `clip-${i + 1}.mp4`);

      console.log(`   Renderizando clip ${i + 1}: ${clip.start}s - ${clip.start + clip.duration}s`);

      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .setStartTime(clip.start)
          .setDuration(clip.duration)
          .outputOptions([
            '-c:v', 'libx264',
            '-preset', 'superfast',
            '-c:a', 'aac',
          ])
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const clipStats = await fs.stat(outputPath);
      console.log(`   ✅ Clip ${i + 1}: ${(clipStats.size / 1024).toFixed(0)} KB`);
    }

    const renderTime = Date.now() - renderStart;
    console.log(`\n✅ Todos os clipes renderizados em ${(renderTime / 1000).toFixed(1)}s\n`);

    // ============================================
    // RESULTADOS
    // ============================================
    console.log('📊 RESUMO DO TESTE:');
    console.log('='.repeat(50));
    console.log(`✅ Download:      ${(downloadTime / 1000).toFixed(1)}s`);
    console.log(`✅ Renderização:  ${(renderTime / 1000).toFixed(1)}s`);
    console.log(`✅ Total:         ${((downloadTime + renderTime) / 1000).toFixed(1)}s`);
    console.log(`✅ Clipes gerados: ${clips.length}`);
    console.log('='.repeat(50));
    console.log(`\n✨ TESTE BEM-SUCEDIDO! Arquivos em:\n   ${TEMP_DIR}\n`);

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    process.exit(1);
  }
}

main();
