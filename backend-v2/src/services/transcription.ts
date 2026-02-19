import { promises as fs } from 'fs';
import { join } from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { OpenAI } from 'openai';
import { toFile } from 'openai/uploads';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import type { Transcript, TranscriptSegment, TranscriptionError } from '../types/index.js';
import { fetchTranscriptFromYouTubeCaptions } from './youtube-captions.js';

const logger = createLogger('transcription');

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// Log OpenAI API key status (without exposing the full key)
logger.info({
  hasApiKey: !!env.openai.apiKey,
}, 'OpenAI client configuration');

const openai = new OpenAI({
  apiKey: env.openai.apiKey,
  // Keep timeout bounded per request; handle retries explicitly below.
  timeout: 120000, // 2 minutes per call
  maxRetries: 0,
});

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  initialDelay = 3000,
  context = 'transcription'
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.info({ attempt: attempt + 1, maxRetries: maxRetries + 1, context }, 'Retrying request');
      }
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Enhanced error logging
      const errorType = (error as any)?.error?.type || error.constructor?.name;
      const errorDetails = {
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        context,
        errorType,
        errorMessage: error.message,
        errorCode: error.code,
        errorStatus: error.status,
        isConnectionError: error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message?.includes('Connection'),
        isRateLimitError: error.status === 429,
        isAuthError: error.status === 401 || error.status === 403,
      };

      // Don't retry on authentication errors, invalid requests or quota exhaustion
      const isAuthError = error.status === 401 || error.status === 403;
      const isBadRequest = error.status === 400;
      const isQuotaExhausted = errorType === 'insufficient_quota';

      if (isAuthError || isBadRequest || isQuotaExhausted) {
        logger.error(errorDetails, 'Non-retryable error encountered');
        throw error;
      }

      if (attempt < maxRetries) {
        // Prefer server-provided Retry-After header when rate limited
        const retryAfterHeader = Number(error.response?.headers?.['retry-after']);
        const retryAfterMs = !Number.isNaN(retryAfterHeader) ? retryAfterHeader * 1000 : undefined;

        // Exponential backoff with jitter to avoid thundering herd
        const baseDelay = initialDelay * Math.pow(2, attempt); // 3s,6s,12s,24s,48s,...
        const jitter = Math.floor(Math.random() * 500);
        const delay = retryAfterMs ?? baseDelay + jitter;

        logger.warn(
          { ...errorDetails, delay },
          'Retrying after error'
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error(errorDetails, 'Max retries exceeded');
      }
    }
  }

  throw lastError;
}

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
    youtubeUrl?: string; // optional fallback source for captions
    onProgress?: (progress: number, message: string) => Promise<void>; // Progress callback
  } = {}
): Promise<TranscriptionResult> {
  const { language = 'pt', model = 'whisper-1', chunkDuration = 120, youtubeUrl, onProgress } = options;

  logger.info({ videoPath, language, model }, 'Starting video transcription');

  const tmpDir = join('/tmp', `transcribe-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const audioPath = join(tmpDir, 'audio.mp3');
  const chunksDir = join(tmpDir, 'chunks');

  try {
    // Step 1: Extract audio from video (MP3 = ~10x smaller than WAV, faster Whisper upload)
    logger.info({ videoPath }, 'Extracting audio from video');
    await extractAudio(videoPath, audioPath);

    // Step 2: Split audio into chunks
    logger.info({ chunkDuration }, 'Splitting audio into chunks');
    await fs.mkdir(chunksDir, { recursive: true });
    await splitAudioIntoChunks(audioPath, chunksDir, chunkDuration);

    // Step 3: Transcribe chunks in parallel
    const chunkFiles = (await fs.readdir(chunksDir))
      .filter((f) => f.startsWith('chunk_') && f.endsWith('.mp3'))
      .sort();

    logger.info({ totalChunks: chunkFiles.length }, 'Transcribing audio chunks');

    const allSegments: TranscriptSegment[] = [];
    // Process up to 3 chunks in parallel for faster transcription
    // while staying within Whisper API rate limits.
    const batchSize = 3;

    for (let i = 0; i < chunkFiles.length; i += batchSize) {
      const batch = chunkFiles.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(chunkFiles.length / batchSize);

      // Report progress: 20% to 35% range for transcription step
      const transcribeProgress = 20 + Math.floor((15 * i) / chunkFiles.length);
      const chunksProcessed = i;
      const totalChunksCount = chunkFiles.length;

      if (onProgress) {
        await onProgress(
          transcribeProgress,
          `Transcrevendo parte ${chunksProcessed + 1} de ${totalChunksCount}...`
        );
      }

      logger.info({ batch: batchNumber, totalBatches, chunksInBatch: batch.length }, 'Processing batch');

      const batchResults = await Promise.all(
        batch.map(async (chunkFile, batchIndex) => {
          const chunkPath = join(chunksDir, chunkFile);
          const chunkIndex = i + batchIndex;

          logger.info({ chunk: chunkIndex + 1, total: chunkFiles.length }, 'Transcribing chunk');

          try {
            const fileBuf = await fs.readFile(chunkPath);
            const fileStream = await toFile(fileBuf, chunkFile);

            const transcription = await retryWithBackoff(async () => {
              return await openai.audio.transcriptions.create({
                file: fileStream,
                model,
                response_format: 'verbose_json',
                language,
              });
            }, 3, 2000, `transcription-chunk-${chunkIndex + 1}`); // 3 retries com atraso inicial de 2s (exponencial)

            logger.info({ chunk: chunkIndex + 1, total: chunkFiles.length, segmentsCount: transcription.segments?.length || 0 }, 'Chunk transcription completed');

            return {
              chunkIndex,
              segments: transcription.segments || [],
              text: transcription.text,
            };
          } catch (error: any) {
            // Enhanced error logging with more context
            logger.error({
              chunk: chunkIndex + 1,
              total: chunkFiles.length,
              chunkFile,
              errorMessage: error.message,
              errorType: error.constructor?.name,
              errorCode: error.code,
              errorStatus: error.status,
              errorResponse: error.response?.data,
              // Log connection-specific errors
              isConnectionError: error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message?.includes('Connection'),
              isRateLimitError: error.status === 429,
              isAuthError: error.status === 401,
              stack: error.stack,
            }, 'Failed to transcribe chunk after retries');

            // Provide more helpful error messages
            let errorMsg = error.message || 'connection error';
            if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
              errorMsg = 'Network timeout - please check your internet connection';
            } else if (error.status === 429) {
              if ((error as any)?.error?.type === 'insufficient_quota') {
                errorMsg = 'OpenAI quota exceeded - update billing or use a different API key';
              } else {
                errorMsg = 'OpenAI rate limit exceeded - please wait and try again';
              }
            } else if (error.status === 401) {
              errorMsg = 'Invalid OpenAI API key';
            }

            const wrapped = new Error(`TRANSCRIPTION_FAILED: ${errorMsg}`);
            (wrapped as any).code = error.code || 'TRANSCRIPTION_FAILED';
            (wrapped as any).status = error.status;
            throw wrapped;
          }
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
    const fallbackDuration = await getVideoDurationSafe(videoPath);

    // Fallback: for YouTube sources, try to use YouTube captions (manual/auto) to keep subtitles working.
    if (youtubeUrl) {
      try {
        if (onProgress) {
          await onProgress(28, 'Falha na transcrição — usando legendas do YouTube (fallback)...');
        }

        const ytTranscript = await fetchTranscriptFromYouTubeCaptions(youtubeUrl, {
          language,
          fallbackDuration,
        });

        if (ytTranscript.segments.length > 0) {
          logger.warn(
            { status: error.status, segmentCount: ytTranscript.segments.length },
            'Using YouTube captions as transcription fallback'
          );
          return { transcript: ytTranscript, audioPath };
        }
      } catch (ytError: any) {
        logger.warn(
          { error: ytError.message, youtubeUrl },
          'YouTube captions fallback failed'
        );
      }
    }

    const msg = String(error.message || '').toLowerCase();
    const isQuotaOrAuth =
      msg.includes('quota') ||
      msg.includes('invalid openai api key') ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 429;

    if (isQuotaOrAuth) {
      const fallbackTranscript: Transcript = {
        segments: [],
        language,
        duration: fallbackDuration || chunkDuration,
        isFallback: true,
      };

      logger.warn(
        {
          error: error.message,
          status: error.status,
          fallbackDuration,
        },
        'OpenAI transcription failed due to quota/auth — using fallback transcript'
      );

      return { transcript: fallbackTranscript, audioPath };
    }

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
      .audioCodec('libmp3lame')
      .audioBitrate('64k')
      .format('mp3')
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
      .audioCodec('libmp3lame')
      .audioBitrate('64k')
      .outputOptions([
        '-f segment',
        `-segment_time ${chunkDuration}`,
        '-reset_timestamps 1',
        `-threads ${Math.min(4, os.cpus().length)}`,
      ])
      .output(join(chunksDir, 'chunk_%03d.mp3'))
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

async function getVideoDurationSafe(videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        logger.warn({ error: err.message }, 'Failed to read video duration for fallback transcript');
        return resolve(60); // default to 60s
      }
      const duration = metadata.format?.duration || 60;
      resolve(Math.max(5, Math.round(duration)));
    });
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
