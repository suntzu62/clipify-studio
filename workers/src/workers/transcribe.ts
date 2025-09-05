import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import { join } from 'path';
import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import pino from 'pino';
import { downloadToTemp, uploadFile } from '../lib/storage';
import { fromSegmentsToSRT, fromSegmentsToVTT, type Segment } from '../lib/subtitles';

const log = pino({ name: 'transcribe' });

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  
  log.info({ rootId, bucket, model }, 'TranscribeStarted');
  
  try {
    // Ensure temp directory exists
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(join(tmpDir, 'chunks'), { recursive: true });
    
    const sourcePath = join(tmpDir, 'source.mp4');
    const audioPath = join(tmpDir, 'audio.wav');
    const chunksDir = join(tmpDir, 'chunks');
    
    // 0-10%: Download source video
    await job.updateProgress(0);
    log.info({ rootId }, 'DownloadStarted');
    
    await downloadToTemp(bucket, `projects/${rootId}/source.mp4`, sourcePath);
    await job.updateProgress(10);
    log.info({ rootId }, 'DownloadOk');
    
    // 10-35%: Extract WAV mono 16k
    await job.updateProgress(10);
    log.info({ rootId }, 'WavExtractionStarted');
    
    await new Promise<void>((resolve, reject) => {
      ffmpeg(sourcePath)
        .audioChannels(1)
        .audioFrequency(16000)
        .output(audioPath)
        .on('progress', (progress) => {
          const percent = Math.min(35, 10 + (progress.percent || 0) * 0.25);
          job.updateProgress(Math.floor(percent));
        })
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    
    await job.updateProgress(35);
    log.info({ rootId }, 'WavExtracted');
    
    // 35-50%: Segment audio into ~900s chunks
    await job.updateProgress(35);
    log.info({ rootId }, 'SegmentationStarted');
    
    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPath)
        .outputOptions([
          '-f segment',
          '-segment_time 900',
          '-reset_timestamps 1',
          '-c copy'
        ])
        .output(join(chunksDir, 'chunk_%03d.wav'))
        .on('end', resolve)
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
    
    // 50-95%: Transcribe each chunk
    const chunkFiles = (await fs.readdir(chunksDir))
      .filter(f => f.startsWith('chunk_') && f.endsWith('.wav'))
      .sort();
    
    const allSegments: Segment[] = [];
    let timeOffset = 0;
    const progressPerChunk = 45 / chunkFiles.length; // 50-95% = 45% total
    
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunkFile = chunkFiles[i];
      const chunkPath = join(chunksDir, chunkFile);
      
      log.info({ rootId, chunk: i + 1, total: chunkFiles.length }, `ChunkTranscribing${i}`);
      
      try {
        const file = await fs.readFile(chunkPath);
        const fileStream = new File([file], chunkFile, { type: 'audio/wav' });
        
        let transcription;
        if (model === 'whisper-1') {
          transcription = await openai.audio.transcriptions.create({
            file: fileStream,
            model: 'whisper-1',
            response_format: 'verbose_json',
            language: 'pt'
          });
          
          // Process segments with time offset
          if (transcription.segments) {
            const segments = transcription.segments.map(segment => ({
              start: segment.start + timeOffset,
              end: segment.end + timeOffset,
              text: segment.text
            }));
            allSegments.push(...segments);
            timeOffset = Math.max(timeOffset, ...segments.map(s => s.end));
          }
        } else {
          // GPT-4o transcribe models don't return detailed segments
          transcription = await openai.audio.transcriptions.create({
            file: fileStream,
            model: model as any,
            language: 'pt'
          });
          
          // Create fallback segment for the chunk (assume 900s duration)
          const chunkDuration = 900;
          allSegments.push({
            start: timeOffset,
            end: timeOffset + chunkDuration,
            text: transcription.text
          });
          timeOffset += chunkDuration;
        }
        
        const currentProgress = 50 + ((i + 1) * progressPerChunk);
        await job.updateProgress(Math.floor(currentProgress));
        
      } catch (error: any) {
        if (error.status === 429) {
          throw { code: 'API_RATE_LIMIT', message: 'OpenAI API rate limit exceeded' };
        }
        throw { code: 'OPENAI_ERROR', message: error.message || 'OpenAI transcription failed' };
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