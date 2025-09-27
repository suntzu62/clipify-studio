import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import { join } from 'path';
import { getOpenAI } from '../lib/openai';
import { toFile } from 'openai/uploads';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import pino from 'pino';
import { downloadToTemp, uploadFile } from '../lib/storage';
import { fromSegmentsToSRT, fromSegmentsToVTT, type Segment } from '../lib/subtitles';
import { enqueueUnique } from '../lib/bullmq';
import { QUEUES } from '../queues';

const log = pino({ name: 'transcribe' });

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// defer OpenAI client creation until runtime to ensure dotenv has loaded

interface TranscribeResult {
  rootId: string;
  bucket: string;
  transcriptKey: string;
  srtKey: string;
  vttKey: string;
  language: string;
  chunks: number;
}

export async function runTranscribe(job: Job): Promise<TranscribeResult> {
  const rootId = job.data.rootId || job.id;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  const tmpDir = `/tmp/${rootId}`;
  const model = process.env.TRANSCRIBE_MODEL || 'whisper-1';
  const openai = getOpenAI();
  
  log.info({ rootId, bucket, model }, 'TranscribeStarted');
  
  try {
    // Ensure temp directory exists
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(join(tmpDir, 'chunks'), { recursive: true });
    
    const audioPath = join(tmpDir, 'audio.wav');
    const chunksDir = join(tmpDir, 'chunks');

    // 0-10%: Download pre-extracted audio
    await job.updateProgress(0);
    log.info({ rootId }, 'AudioDownloadStarted');

    let segmentationSource = audioPath;

    try {
      await downloadToTemp(bucket, `projects/${rootId}/media/audio.wav`, audioPath);
    } catch (error: any) {
      if (error?.code === 'VIDEO_NOT_FOUND') {
        const legacySource = join(tmpDir, 'source.mp4');
        log.warn({ rootId }, 'AudioMissingFallbackVideo');
        await downloadToTemp(bucket, `projects/${rootId}/source.mp4`, legacySource);
        segmentationSource = legacySource;
      } else {
        throw error;
      }
    }
    await job.updateProgress(10);
    log.info({ rootId }, 'AudioDownloadOk');

    // 10-35%: Direct segmentation of cached audio
    await job.updateProgress(10);
    log.info({ rootId }, 'AudioSegmentationStarted');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(segmentationSource)
        .audioChannels(1)
        .audioFrequency(16000)
        .outputOptions([
          '-f segment',
          '-segment_time 300',  // Direct segmentation during extraction for speed
          '-reset_timestamps 1',
          `-threads ${Math.min(4, require('os').cpus().length)}` // Optimize thread usage
        ])
        .output(join(chunksDir, 'chunk_%03d.wav'))
        .on('progress', (progress) => {
          const percent = Math.min(35, 10 + (progress.percent || 0) * 0.25);
          job.updateProgress(Math.floor(percent));
        })
        .on('end', () => resolve())
        .on('error', (err) => {
          if (err.message.includes('too long') || err.message.includes('size')) {
            reject({ code: 'AUDIO_TOO_LONG', message: 'Audio file exceeds processing limits' });
          } else {
            reject(err);
          }
        })
        .run();
    });
    
    await job.updateProgress(50);
    log.info({ rootId }, 'Segmented');
    
    // 50-95%: Transcribe chunks in parallel batches
    const chunkFiles = (await fs.readdir(chunksDir))
      .filter(f => f.startsWith('chunk_') && f.endsWith('.wav'))
      .sort();
    
    const allSegments: Segment[] = [];
    const progressPerChunk = 45 / chunkFiles.length; // 50-95% = 45% total
    const batchSize = Math.min(4, chunkFiles.length); // Process up to 4 chunks in parallel
    
    log.info({ rootId, totalChunks: chunkFiles.length, batchSize }, 'ParallelTranscriptionStarted');
    
    for (let i = 0; i < chunkFiles.length; i += batchSize) {
      const batch = chunkFiles.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (chunkFile, batchIndex) => {
        const chunkPath = join(chunksDir, chunkFile);
        const chunkIndex = i + batchIndex;
        
        log.info({ rootId, chunk: chunkIndex + 1, total: chunkFiles.length }, `ChunkTranscribing${chunkIndex}`);
        
        try {
          const fileBuf = await fs.readFile(chunkPath);
          const fileStream = await toFile(fileBuf, chunkFile);
          
          let transcription;
          if (model === 'whisper-1') {
            transcription = await openai.audio.transcriptions.create({
              file: fileStream,
              model: 'whisper-1',
              response_format: 'verbose_json',
              language: 'pt'
            });
            
            return {
              chunkIndex,
              segments: transcription.segments || [],
              text: transcription.text
            };
          } else {
            // GPT-4o transcribe models don't return detailed segments
            transcription = await openai.audio.transcriptions.create({
              file: fileStream,
              model: model as any,
              language: 'pt'
            });
            
            return {
              chunkIndex,
              segments: [],
              text: transcription.text
            };
          }
          
        } catch (error: any) {
          if (error.status === 429) {
            throw { code: 'API_RATE_LIMIT', message: 'OpenAI API rate limit exceeded' };
          }
          throw { code: 'OPENAI_ERROR', message: error.message || 'OpenAI transcription failed' };
        }
      });
      
      // Wait for batch completion
      const batchResults = await Promise.all(batchPromises);
      
      // Process results in order and calculate time offsets
      batchResults.sort((a, b) => a.chunkIndex - b.chunkIndex);
      
      for (const result of batchResults) {
        const chunkDuration = 300; // Updated chunk duration
        const timeOffset = result.chunkIndex * chunkDuration;
        
        if (result.segments.length > 0) {
          // Process segments with time offset
          const segments = result.segments.map(segment => ({
            start: segment.start + timeOffset,
            end: segment.end + timeOffset,
            text: segment.text
          }));
          allSegments.push(...segments);
        } else {
          // Create fallback segment for the chunk
          allSegments.push({
            start: timeOffset,
            end: timeOffset + chunkDuration,
            text: result.text
          });
        }
        
        const currentProgress = 50 + ((result.chunkIndex + 1) * progressPerChunk);
        await job.updateProgress(Math.floor(currentProgress));
      }
    }
    
    // 95-100%: Generate files and upload
    await job.updateProgress(95);
    log.info({ rootId, segments: allSegments.length }, 'MergeAndUpload');
    
    // Generate transcript JSON
    const transcript = {
      language: 'pt',
      segments: allSegments,
      text: allSegments.map(s => s.text).join(' ').trim()
    };
    
    // Generate SRT and VTT
    const srtContent = fromSegmentsToSRT(allSegments);
    const vttContent = fromSegmentsToVTT(allSegments);
    
    // Write temporary files
    const transcriptPath = join(tmpDir, 'transcript.json');
    const srtPath = join(tmpDir, 'segments.srt');
    const vttPath = join(tmpDir, 'segments.vtt');
    
    await fs.writeFile(transcriptPath, JSON.stringify(transcript, null, 2));
    await fs.writeFile(srtPath, srtContent);
    await fs.writeFile(vttPath, vttContent);
    
    // Upload to storage
    const transcriptKey = `projects/${rootId}/transcribe/transcript.json`;
    const srtKey = `projects/${rootId}/transcribe/segments.srt`;
    const vttKey = `projects/${rootId}/transcribe/segments.vtt`;
    
    await uploadFile(bucket, transcriptKey, transcriptPath, 'application/json');
    await uploadFile(bucket, srtKey, srtPath, 'text/plain');
    await uploadFile(bucket, vttKey, vttPath, 'text/vtt');
    
    await job.updateProgress(100);
    log.info({ rootId, transcriptKey, srtKey, vttKey }, 'Uploaded');
    
    await enqueueUnique(
      QUEUES.SCENES,
      'scenes',
      `${rootId}:scenes`,
      { rootId, meta: job.data.meta || {} }
    );

    return {
      rootId,
      bucket,
      transcriptKey,
      srtKey,
      vttKey,
      language: 'pt',
      chunks: chunkFiles.length
    };
    
  } catch (error: any) {
    log.error({ rootId, error: error.message || error }, 'TranscribeFailed');
    throw error;
  } finally {
    // Cleanup temp directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (cleanupError) {
      log.warn({ rootId, cleanupError }, 'CleanupFailed');
    }
  }
}
