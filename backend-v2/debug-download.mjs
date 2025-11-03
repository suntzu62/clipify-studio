#!/usr/bin/env node
/**
 * Debug: Testar download direto igual ao código
 */

import { execa } from 'execa';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const TEST_URL = 'https://www.youtube.com/watch?v=fRZ5iSxeF_8';
const outputPath = path.join(os.tmpdir(), `debug-download-${Date.now()}.mp4`);

console.log('🔍 Debug: Testing yt-dlp download');
console.log('URL:', TEST_URL);
console.log('Output:', outputPath);
console.log('');

try {
  console.log('⏳ Executing yt-dlp...');
  const startTime = Date.now();

  const result = await execa('yt-dlp', [
    '-f', 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--no-check-certificates',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    '--extractor-args', 'youtube:player_client=android',
    '-o', outputPath,
    TEST_URL
  ], {
    timeout: 600000,
    all: true,
    reject: false,
    maxBuffer: 100 * 1024 * 1024,
  });

  const execTime = Date.now() - startTime;

  console.log('');
  console.log('✅ yt-dlp exited');
  console.log('Exit code:', result.exitCode);
  console.log('Failed:', result.failed);
  console.log('Execution time:', (execTime / 1000).toFixed(1), 's');
  console.log('');

  // Verificar arquivo IMEDIATAMENTE
  console.log('📊 Checking file immediately after exec...');
  try {
    const statsImmediate = await fs.stat(outputPath);
    console.log('File size (immediate):', statsImmediate.size, 'bytes');
  } catch (err) {
    console.log('File not found immediately');
  }

  // Aguardar 2 segundos
  console.log('⏳ Waiting 2 seconds...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    const stats2s = await fs.stat(outputPath);
    console.log('File size (after 2s):', stats2s.size, 'bytes');
  } catch (err) {
    console.log('File not found after 2s');
  }

  // Aguardar mais 3 segundos
  console.log('⏳ Waiting 5 more seconds...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    const stats7s = await fs.stat(outputPath);
    console.log('File size (after 7s):', stats7s.size, 'bytes');
  } catch (err) {
    console.log('File not found after 7s');
  }

  // Aguardar mais 10 segundos
  console.log('⏳ Waiting 10 more seconds...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  try {
    const stats17s = await fs.stat(outputPath);
    console.log('File size (after 17s):', stats17s.size, 'bytes');

    if (stats17s.size > 0) {
      console.log('');
      console.log('✅ SUCCESS! File was written (took ~17s after exec)');
    } else {
      console.log('');
      console.log('❌ FAIL: File is still empty after 17s');
    }
  } catch (err) {
    console.log('File not found after 17s');
  }

  console.log('');
  console.log('📝 Stdout length:', result.stdout?.length || 0);
  console.log('📝 Stderr length:', result.stderr?.length || 0);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
