#!/usr/bin/env node

/**
 * Script to download face-api.js models for intelligent reframing
 *
 * This script downloads the TinyFaceDetector model from the face-api.js repository
 * and places it in the models/ directory for use by the roi-detector service.
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MODEL_BASE_URL = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model';
const MODELS_DIR = join(__dirname, '..', 'models');

const MODELS_TO_DOWNLOAD = [
  { file: 'tiny_face_detector_model-weights_manifest.json', url: 'tiny_face_detector_model-weights_manifest.json' },
  // The manifest references this file via the "paths" field.
  { file: 'tiny_face_detector_model.bin', url: 'tiny_face_detector_model.bin', binary: true },
];

async function downloadFile(url, outputPath) {
  console.log(`📥 Downloading: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(buffer));

    console.log(`✅ Saved to: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Failed to download ${url}:`, error.message);
    throw error;
  }
}

async function downloadModels() {
  console.log('🚀 Face-API Models Downloader\n');

  // Create models directory if it doesn't exist
  try {
    await fs.mkdir(MODELS_DIR, { recursive: true });
    console.log(`📁 Models directory: ${MODELS_DIR}\n`);
  } catch (error) {
    console.error('❌ Failed to create models directory:', error.message);
    process.exit(1);
  }

  // Download each model file
  let successCount = 0;
  let failureCount = 0;

  for (const model of MODELS_TO_DOWNLOAD) {
    const url = `${MODEL_BASE_URL}/${model.url}`;
    const outputPath = join(MODELS_DIR, model.file);

    try {
      await downloadFile(url, outputPath);
      successCount++;
    } catch (error) {
      failureCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Successfully downloaded: ${successCount} file(s)`);

  if (failureCount > 0) {
    console.log(`❌ Failed to download: ${failureCount} file(s)`);
    console.log('\n⚠️  Some models failed to download. Intelligent reframing may not work properly.');
    process.exit(1);
  } else {
    console.log('\n🎉 All models downloaded successfully!');
    console.log('✨ Intelligent reframing is now ready to use.');
  }
}

// Run the downloader
downloadModels().catch((error) => {
  console.error('\n💥 Fatal error:', error.message);
  process.exit(1);
});
