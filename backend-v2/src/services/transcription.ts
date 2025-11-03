import { promises as fs } from 'fs';
import { join } from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { OpenAI } from 'openai';
import { toFile } from 'openai/uploads';
import { createLogger } from '../config/logger.js';
import type { Transcript, TranscriptSegment, TranscriptionError } from '../types/index.js';

const logger = createLogger('transcription');

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TranscriptionResult {
  transcript: Transcript;
  audioPath: string; // Path to extracted audio for cleanup
}

/**
 * Extrai áudio do vídeo e transcreve usando OpenAI Whisper
 */
export async function transcribeVideo(
  videoPath: string,
  options: {
    language?: string;
    model?: 'whisper-1';
    chunkDuration?: number; // seconds per chunk
  } = {}
): Promise<TranscriptionResult> {
  const { language = 'pt', model = 'whisper-1', chunkDuration = 300 } = options;

  logger.info({ videoPath, language, model }, 'Starting video transcription');

  const tmpDir = join('/tmp', `transcribe-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const audioPath = join(tmpDir, 'audio.wav');
  const chunksDir = join(tmpDir, 'chunks');

  try {
    // Step 1: Extract audio from video
    logger.info({ videoPath }, 'Extracting audio from video');
    await extractAudio(videoPath, audioPath);

    // Step 2: Split audio into chunks
    logger.info({ chunkDuration }, 'Splitting audio into chunks');
    await fs.mkdir(chunksDir, { recursive: true });
    await splitAudioIntoChunks(audioPath, chunksDir, chunkDuration);

    // Step 3: Transcribe chunks in parallel
    const chunkFiles = (await fs.readdir(chunksDir))
      .filter((f) => f.startsWith('chunk_') && f.endsWith('.wav'))
      .sort();

    logger.info({ totalChunks: chunkFiles.length }, 'Transcribing audio chunks');

    const allSegments: TranscriptSegment[] = [];
    const batchSize = 4; // Process 4 chunks at a time

    for (let i = 0; i < chunkFiles.length; i += batchSize) {
      const batch = chunkFiles.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(chunkFiles.length / batchSize);

      logger.info({ batch: batchNumber, totalBatches, chunksInBatch: batch.length }, 'Processing batch');

      const batchResults = await Promise.all(
        batch.map(async (chunkFile, batchIndex) => {
          const chunkPath = join(chunksDir, chunkFile);
          const chunkIndex = i + batchIndex;

          logger.info({ chunk: chunkIndex + 1, total: chunkFiles.length }, 'Transcribing chunk');

          const fileBuf = await fs.readFile(chunkPath);
          const fileStream = await toFile(fileBuf, chunkFile);

          const transcription = await openai.audio.transcriptions.create({
            file: fileStream,
            model,
            response_format: 'verbose_json',
            language,
          });

          logger.info({ chunk: chunkIndex + 1, total: chunkFiles.length, segmentsCount: transcription.segments?.length || 0 }, 'Chunk transcription completed');

          return {
            chunkIndex,
            segments: transcription.segments || [],
            text: transcription.text,
          };
        })
      );

      // Merge segments with time offsets
      for (const result of batchResults) {
        const timeOffset = result.chunkIndex * chunkDuration;

        if (result.segments.length > 0) {
          const segments = result.segments.map((seg: any) => ({
            text: seg.text,
            start: seg.start + timeOffset,
            end: seg.end + timeOffset,
            confidence: seg.confidence,
          }));
          allSegments.push(...segments);
        } else {
          // Fallback: create single segment for chunk
          allSegments.push({
            text: result.text,
            start: timeOffset,
            end: timeOffset + chunkDuration,
          });
        }
      }
    }

    // Calculate total duration
    const duration = allSegments.length > 0 ? Math.max(...allSegments.map((s) => s.end)) : 0;

    const transcript: Transcript = {
      segments: allSegments,
      language,
      duration,
    };

    logger.info(
      { segments: allSegments.length, duration, language },
      'Transcription completed successfully'
    );

    return { transcript, audioPath };
  } catch (error: any) {
    logger.error({ error: error.message, videoPath }, 'Transcription failed');
    throw new Error(`Transcription failed: ${error.message}`);
  } finally {
    // Cleanup chunks directory
    try {
      await fs.rm(chunksDir, { recursive: true, force: true });
    } catch (cleanupError) {
      logger.warn({ error: cleanupError }, 'Failed to cleanup chunks directory');
    }
  }
}

/**
 * Extrai áudio de um vídeo usando FFmpeg
 */
function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('pcm_s16le')
      .format('wav')
      .output(audioPath)
      .on('end', () => {
        logger.info({ audioPath }, 'Audio extraction completed');
        resolve();
      })
      .on('error', (err) => {
        logger.error({ error: err.message }, 'Audio extraction failed');
        reject(err);
      })
      .run();
  });
}

/**
 * Divide áudio em chunks usando FFmpeg
 */
function splitAudioIntoChunks(
  audioPath: string,
  chunksDir: string,
  chunkDuration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(audioPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .outputOptions([
        '-f segment',
        `-segment_time ${chunkDuration}`,
        '-reset_timestamps 1',
        `-threads ${Math.min(4, os.cpus().length)}`,
      ])
      .output(join(chunksDir, 'chunk_%03d.wav'))
      .on('end', () => {
        logger.info({ chunksDir }, 'Audio splitting completed');
        resolve();
      })
      .on('error', (err) => {
        logger.error({ error: err.message }, 'Audio splitting failed');
        reject(err);
      })
      .run();
  });
}

/**
 * Cleanup: remove arquivo de áudio temporário
 */
export async function cleanupAudio(audioPath: string): Promise<void> {
  try {
    const dir = join(audioPath, '..');
    await fs.rm(dir, { recursive: true, force: true });
    logger.info({ audioPath }, 'Audio cleanup completed');
  } catch (error: any) {
    logger.warn({ error: error.message, audioPath }, 'Audio cleanup failed');
  }
}
