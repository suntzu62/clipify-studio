import { Job } from 'bullmq';
import ffmpegPath from 'ffmpeg-static';
import * as fs from 'fs/promises';
import * as path from 'path';
import pino from 'pino';
import { downloadToTemp, uploadFile } from '../lib/storage';
import { buildASS, type Segment } from '../lib/ass';
import { runFFmpeg } from '../lib/ffmpeg';
import { enqueueUnique } from '../lib/bullmq';
import { QUEUES } from '../queues';
import { track } from '../lib/analytics';

const log = pino({ name: 'render' });

interface Transcript {
  language: string;
  segments: Segment[];
  text: string;
}

interface RankItem {
  id: string;
  start: number;
  end: number;
  duration: number;
}

export async function runRender(job: Job): Promise<any> {
  // Prefer ffmpeg-static if available
  if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;

  const { rootId } = job.data as { rootId: string };
  const inputClip = job.data as { clipId?: string; start?: number; end?: number };
  const userId = job.data.userId || 'unknown';

  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  const tmpRoot = `/tmp/${rootId}/render`;
  const startTime = Date.now();

  log.info({ rootId, jobId: job.id }, 'RenderStarted');

  // Prevent render loops by checking if clips already exist
  const existingClipsPath = `projects/${rootId}/clips/`;
  let hasExistingClips = false;
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseUrl && serviceRoleKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      
      const { data: existingFiles } = await supabase.storage
        .from(bucket)
        .list(`projects/${rootId}/clips`, { limit: 1 });
      
      if (existingFiles && existingFiles.length > 0) {
        hasExistingClips = true;
        log.info({ rootId, jobId: job.id, existingCount: existingFiles.length }, 'ExistingClipsFound');
      }
    }
  } catch (error) {
    log.warn({ rootId, error: (error as Error).message }, 'Failed to check existing clips');
  }

  await fs.mkdir(tmpRoot, { recursive: true });

  try {
    // 1) Download inputs
    const tmpSource = path.join(tmpRoot, 'source.mp4');
    const tmpTranscript = path.join(tmpRoot, 'transcript.json');
    await downloadToTemp(bucket, `projects/${rootId}/source.mp4`, tmpSource);
    await downloadToTemp(bucket, `projects/${rootId}/transcribe/transcript.json`, tmpTranscript);

    const transcript: Transcript = JSON.parse(await fs.readFile(tmpTranscript, 'utf-8'));

    // Determine which clips to render
    let items: RankItem[] = [];
    if (inputClip.clipId && typeof inputClip.start === 'number' && typeof inputClip.end === 'number') {
      items = [{ id: inputClip.clipId, start: inputClip.start, end: inputClip.end, duration: inputClip.end - inputClip.start }];
    } else {
      // Try to load rank selection
      const rankPath = path.join(tmpRoot, 'rank.json');
      try {
        await downloadToTemp(bucket, `projects/${rootId}/rank/rank.json`, rankPath);
        const rank = JSON.parse(await fs.readFile(rankPath, 'utf-8')) as { items: RankItem[] };
        items = Array.isArray(rank.items) ? rank.items : [];
      } catch (e) {
        // No rank.json, render a single default clip (0-60s)
        items = [{ id: 'clip-default', start: 0, end: 60, duration: 60 }];
      }
    }

    if (items.length === 0) {
      // If no clips to render and we have existing clips, just return success
      if (hasExistingClips) {
        log.info({ rootId, jobId: job.id }, 'No new clips to render, existing clips found');
        return { 
          success: true, 
          message: 'Render skipped - clips already exist',
          clipsGenerated: 0,
          hasExistingClips: true
        };
      }
      throw { code: 'RENDER_NO_ITEMS', message: 'No clips to render' };
    }

    // If we already have clips and this isn't a specific clip render, skip
    if (hasExistingClips && !inputClip.clipId) {
      log.info({ rootId, jobId: job.id, itemsCount: items.length }, 'Skipping render - clips already exist');
      return { 
        success: true, 
        message: 'Render skipped - clips already exist',
        clipsGenerated: 0,
        hasExistingClips: true,
        items: items.length
      };
    }

    const fps = Number(process.env.RENDER_FPS || 30);
    const font = process.env.RENDER_FONT || 'Inter';
    const marginV = Number(process.env.RENDER_MARGIN_V || 60);
    const preset = process.env.RENDER_PRESET || 'superfast'; // Optimized preset
    const tune = process.env.RENDER_TUNE || 'zerolatency'; // Optimized tune
    const fontsDir = path.resolve(process.cwd(), 'assets', 'fonts');
    const style = `fontsdir=${fontsDir}:force_style='Alignment=2,FontName=${font},FontSize=48,Outline=2,Shadow=0,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,MarginV=${marginV}'`;

    const vfCrop = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1';
    const vfFitBlur =
      '[0:v]scale=1080:1920,boxblur=luma_radius=min(h\\,w)/20:luma_power=1:chroma_radius=min(h\\,w)/20:chroma_power=1[bg];' +
      '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];' +
      '[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1';
    const vfBase = process.env.RENDER_MODE === 'fit_blur' ? vfFitBlur : vfCrop;

    const af = 'loudnorm=I=-14:LRA=11:TP=-1.5';

    // Process clips in parallel for maximum speed
    const maxParallel = Math.min(3, items.length); // Process up to 3 clips simultaneously
    const processingPromises: Promise<void>[] = [];
    
    log.info({ rootId, totalClips: items.length, maxParallel }, 'ParallelRenderStarted');
    
    for (let i = 0; i < items.length; i += maxParallel) {
      const batch = items.slice(i, i + maxParallel);
      
      const batchPromises = batch.map(async (it, batchIndex) => {
        const itemIndex = i + batchIndex;
        const clipId = it.id;
        const start = it.start;
        const end = it.end;
        const dur = Math.max(0, end - start);
        const durationMs = Math.round(dur * 1000);

        const clipDir = path.join(tmpRoot, clipId);
        await fs.mkdir(clipDir, { recursive: true });
        const tmpAss = path.join(clipDir, 'clip.ass');
        const outFile = path.join(clipDir, `${clipId}.mp4`);
        const thumbFile = path.join(clipDir, `${clipId}.jpg`);

        // Generate ASS for interval
        const ass = buildASS({ segments: transcript.segments, start, end, font, marginV });
        await fs.writeFile(tmpAss, ass);

        // Build optimized filtergraph (9:16 + subtitles)
        const vf = `${vfBase},subtitles=${tmpAss}:${style},fps=${fps}`;

        // Render with maximum speed optimizations
        const args = [
          '-ss', String(start), '-t', String(dur),
          '-i', tmpSource,
          '-map', '0:v:0', '-map', '0:a:0',
          '-vf', vf,
          '-af', af,
          '-c:v', 'libx264', 
          '-preset', preset, // Use optimized preset (superfast)
          '-tune', tune, // Use optimized tune (zerolatency)
          '-profile:v', 'high', '-level', '4.1',
          '-pix_fmt', 'yuv420p',
          '-b:v', process.env.RENDER_VIDEO_BITRATE || '4M', // Reduced bitrate for speed
          '-maxrate', process.env.RENDER_VIDEO_MAXRATE || '6M', // Reduced maxrate for speed
          '-bufsize', process.env.RENDER_VIDEO_BUFSIZE || '8M', // Reduced bufsize for speed
          '-g', '30', '-keyint_min', '30',
          '-threads', String(Math.max(1, Math.floor(require('os').cpus().length / maxParallel))), // Distribute threads
          '-c:a', 'aac', '-b:a', process.env.RENDER_AUDIO_BITRATE || '96k', '-ac', '2', '-ar', '48000', // Reduced audio bitrate
          '-movflags', '+faststart',
          '-avoid_negative_ts', 'make_zero', // Optimization for faster processing
          outFile,
        ];

        // Scale progress for this item
        const base = Math.floor((itemIndex / items.length) * 90); // Reserve 90-100% for upload
        const span = Math.ceil(90 / items.length);

        await runFFmpeg(args, (p) => {
          const scaled = Math.min(89, base + Math.floor((p / 100) * span));
          job.updateProgress(scaled);
        }, durationMs);

        // Generate thumbnail in parallel
        await runFFmpeg([
          '-ss', String(Math.min(1, dur/2)), // Use middle of clip for thumbnail
          '-i', outFile, 
          '-frames:v', '1', 
          '-q:v', '3', // Slightly lower quality for speed
          '-vf', 'scale=540:960', // Smaller thumbnail for speed
          thumbFile
        ]);

        // Upload files
        const mp4Key = `projects/${rootId}/clips/${clipId}.mp4`;
        const jpgKey = `projects/${rootId}/clips/${clipId}.jpg`;

        await Promise.all([
          uploadFile(bucket, mp4Key, outFile, 'video/mp4'),
          uploadFile(bucket, jpgKey, thumbFile, 'image/jpeg')
        ]);

        log.info({ rootId, clipId, itemIndex: itemIndex + 1, total: items.length }, 'ClipRenderComplete');
      });
      
      // Wait for batch completion
      await Promise.all(batchPromises);
      
      // Update progress after batch completion
      const batchEndProgress = Math.min(90, Math.floor(((i + batch.length) / items.length) * 90));
      await job.updateProgress(batchEndProgress);
    }

    await job.updateProgress(100);

    const totalDuration = Date.now() - startTime;
    log.info({ 
      rootId, 
      jobId: job.id, 
      clipsGenerated: items.length,
      totalDuration 
    }, 'RenderCompleted');

    // Track success
    await track(userId, 'stage_completed', {
      stage: 'render',
      duration: totalDuration,
      clipsGenerated: items.length,
      jobId: job.id,
      rootId
    });

    // Only enqueue texts if we actually rendered clips
    if (!hasExistingClips || inputClip.clipId) {
      await enqueueUnique(
        QUEUES.TEXTS,
        'texts',
        `${rootId}:texts`,
        { rootId, meta: job.data.meta || {} }
      );
    }

    // Return summary
    return {
      rootId,
      bucket,
      success: true,
      clipsGenerated: items.length,
      totalDuration,
      items: items.map((it) => ({
        clipId: it.id,
        key: `projects/${rootId}/clips/${it.id}.mp4`,
        thumbnail: `projects/${rootId}/clips/${it.id}.jpg`,
      })),
    };
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    log.error({ 
      rootId, 
      jobId: job.id, 
      error: error?.message || error,
      totalDuration 
    }, 'RenderFailed');
    
    // Track failure
    await track(userId, 'render_failed', {
      jobId: job.id,
      error: error?.message,
      duration: totalDuration,
      rootId
    });
    
    throw error;
  } finally {
    try { await fs.rm(tmpRoot, { recursive: true, force: true }); } catch {}
  }
}

export default runRender;
