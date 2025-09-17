import { Job } from 'bullmq';
import ffmpegPath from 'ffmpeg-static';
import * as fs from 'fs/promises';
import * as path from 'path';
import pino from 'pino';
import { downloadToTemp, uploadFile } from '../lib/storage';
import { buildASS, type Segment } from '../lib/ass';
import { runFFmpeg } from '../lib/ffmpeg';

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

  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  const tmpRoot = `/tmp/${rootId}/render`;

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
      throw { code: 'RENDER_NO_ITEMS', message: 'No clips to render' };
    }

    const fps = Number(process.env.RENDER_FPS || 30);
    const font = process.env.RENDER_FONT || 'Inter';
    const marginV = Number(process.env.RENDER_MARGIN_V || 60);
    const fontsDir = path.resolve(process.cwd(), 'assets', 'fonts');
    const style = `fontsdir=${fontsDir}:force_style='Alignment=2,FontName=${font},FontSize=48,Outline=2,Shadow=0,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,MarginV=${marginV}'`;

    const vfCrop = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1';
    const vfFitBlur =
      '[0:v]scale=1080:1920,boxblur=luma_radius=min(h\\,w)/20:luma_power=1:chroma_radius=min(h\\,w)/20:chroma_power=1[bg];' +
      '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];' +
      '[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1';
    const vfBase = process.env.RENDER_MODE === 'fit_blur' ? vfFitBlur : vfCrop;

    const af = 'loudnorm=I=-14:LRA=11:TP=-1.5';

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
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

      // 2) Generate ASS for interval
      const ass = buildASS({ segments: transcript.segments, start, end, font, marginV });
      await fs.writeFile(tmpAss, ass);

      // 3) Build filtergraph (9:16 + subtitles)
      const vf = `${vfBase},subtitles=${tmpAss}:${style},fps=${fps}`;

      // 4-5) Render - OPTIMIZED FOR SPEED
      const args = [
        '-ss', String(start), '-t', String(dur),
        '-i', tmpSource,
        '-map', '0:v:0', '-map', '0:a:0',
        '-vf', vf,
        '-af', af,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'high', '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-b:v', process.env.RENDER_VIDEO_BITRATE || '6M',
        '-maxrate', process.env.RENDER_VIDEO_MAXRATE || '8M', 
        '-bufsize', process.env.RENDER_VIDEO_BUFSIZE || '12M',
        '-g', '30', '-keyint_min', '30',
        '-tune', 'fastdecode',
        '-threads', '0', // Use all available threads
        '-c:a', 'aac', '-b:a', process.env.RENDER_AUDIO_BITRATE || '128k', '-ac', '2', '-ar', '48000',
        '-movflags', '+faststart',
        outFile,
      ];

      // Scale progress for this item into [i/len, (i+1)/len]
      const base = Math.floor((i / items.length) * 100);
      const span = Math.ceil(100 / items.length);

      await runFFmpeg(args, (p) => {
        const scaled = Math.min(99, base + Math.floor((p / 100) * span));
        job.updateProgress(scaled);
      }, durationMs);

      // 6) Upload MP4 and thumbnail
      const mp4Key = `projects/${rootId}/clips/${clipId}.mp4`;
      const jpgKey = `projects/${rootId}/clips/${clipId}.jpg`;

      // Thumbnail
      await runFFmpeg(['-ss', '1', '-i', outFile, '-frames:v', '1', '-q:v', '2', thumbFile]);

      await uploadFile(bucket, mp4Key, outFile, 'video/mp4');
      await uploadFile(bucket, jpgKey, thumbFile, 'image/jpeg');
    }

    await job.updateProgress(100);

    // Return summary
    return {
      rootId,
      bucket,
      items: items.map((it) => ({
        clipId: it.id,
        key: `projects/${rootId}/clips/${it.id}.mp4`,
      })),
    };
  } catch (error: any) {
    log.error({ rootId, error: error?.message || error }, 'RenderFailed');
    throw error;
  } finally {
    try { await fs.rm(tmpRoot, { recursive: true, force: true }); } catch {}
  }
}

export default runRender;
