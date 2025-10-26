import { Job, UnrecoverableError } from 'bullmq';
import pino from 'pino';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as path from 'path';
import { google } from 'googleapis';
import { downloadToTemp, sbAdmin } from '../lib/storage';
import { decryptToken } from '../lib/crypto';

const log = pino({ name: 'export' });

type ExportStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'failed';

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function readTextFile(p: string): Promise<string> {
  try { return await fs.readFile(p, 'utf-8'); } catch { return ''; }
}

function parseHashtagsToTags(raw: string): string[] {
  const tags = raw.split(/[\s,]+/g)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.replace(/^#+/, ''))
    .filter(t => t.length > 0);
  return Array.from(new Set(tags)).slice(0, 50);
}

async function upsertClipExport(payload: {
  id?: string;
  root_id: string;
  clip_id: string;
  user_id: string;
  status: ExportStatus;
  youtube_video_id?: string | null;
  youtube_url?: string | null;
  error?: string | null;
}) {
  const supabase = sbAdmin();
  const { data, error } = await supabase
    .from('clip_exports')
    .insert({
      root_id: payload.root_id,
      clip_id: payload.clip_id,
      user_id: payload.user_id,
      status: payload.status,
      youtube_video_id: payload.youtube_video_id ?? null,
      youtube_url: payload.youtube_url ?? null,
      error: payload.error ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`clip_exports_insert_failed: ${error.message}`);
  return data.id as string;
}

async function updateClipExport(id: string, patch: Partial<{ status: ExportStatus; youtube_video_id: string | null; youtube_url: string | null; error: string | null }>) {
  const supabase = sbAdmin();
  const { error } = await supabase
    .from('clip_exports')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`clip_exports_update_failed: ${error.message}`);
}

export async function runExport(job: Job): Promise<any> {
  const { rootId, clipId, meta } = job.data as { rootId: string; clipId?: string; meta?: { userId?: string } };

  // If this job came from the pipeline without clip info, no-op to keep pipeline compatible
  if (!clipId || !meta?.userId) {
    await job.updateProgress(100);
    return { skipped: true, reason: 'missing_clip_or_user' };
  }

  const userId = meta.userId as string;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  const tmpRoot = `/tmp/${rootId}/export/${clipId}`;
  await ensureDir(tmpRoot);

  // Get OAuth client
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = process.env.YT_REDIRECT_URI || '';
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('google_oauth_not_configured');
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Load YouTube account (refresh_token)
  const supabase = sbAdmin();
  const { data: acct, error: acctErr } = await supabase
    .from('youtube_accounts')
    .select('refresh_token')
    .eq('user_id', userId)
    .single();
  if (acctErr || !acct?.refresh_token) {
    throw new Error('youtube_account_not_connected');
  }
  
  // Descriptografar refresh_token
  const decryptedRefreshToken = decryptToken(acct.refresh_token as string);
  
  oauth2.setCredentials({ refresh_token: decryptedRefreshToken });
  const youtube = google.youtube({ version: 'v3', auth: oauth2 });

  let exportId: string | null = null;

  try {
    // 0–10: download assets
    const tmpVideo = path.join(tmpRoot, `${clipId}.mp4`);
    const tmpThumb = path.join(tmpRoot, `${clipId}.jpg`);
    const tmpTitle = path.join(tmpRoot, 'title.txt');
    const tmpDesc = path.join(tmpRoot, 'description.md');
    const tmpTags = path.join(tmpRoot, 'hashtags.txt');

    await downloadToTemp(bucket, `projects/${rootId}/clips/${clipId}.mp4`, tmpVideo);
    // Thumbnail is optional
    try { await downloadToTemp(bucket, `projects/${rootId}/clips/${clipId}.jpg`, tmpThumb); } catch {}
    // Texts are optional but recommended
    try { await downloadToTemp(bucket, `projects/${rootId}/texts/${clipId}/title.txt`, tmpTitle); } catch {}
    try { await downloadToTemp(bucket, `projects/${rootId}/texts/${clipId}/description.md`, tmpDesc); } catch {}
    try { await downloadToTemp(bucket, `projects/${rootId}/texts/${clipId}/hashtags.txt`, tmpTags); } catch {}
    await job.updateProgress(8);

    // Create DB record
    exportId = await upsertClipExport({ root_id: rootId, clip_id: clipId, user_id: userId, status: 'queued' });
    await updateClipExport(exportId, { status: 'uploading' });

    // Prepare metadata
    const titleRaw = (await readTextFile(tmpTitle)).trim();
    const descRaw = (await readTextFile(tmpDesc)).trim();
    const tagsRaw = (await readTextFile(tmpTags)).trim();
    const { title, description, tags } = (() => {
      // Enforce limits
      let t = titleRaw.slice(0, 100);
      let d = descRaw.slice(0, 5000);
      const tags = parseHashtagsToTags(tagsRaw);
      return { title: t || `Clip ${clipId}`.slice(0, 100), description: d || '', tags };
    })();

    const privacyStatus = (process.env.YT_PRIVACY || 'unlisted') as 'private' | 'unlisted' | 'public';
    const categoryId = process.env.YT_CATEGORY_ID || '22';
    const selfDeclaredMadeForKids = String(process.env.YT_MADE_FOR_KIDS || 'false').toLowerCase() === 'true';

    // Resumable upload with progress
    const totalBytes = fssync.statSync(tmpVideo).size;
    let uploaded = 0;
    const videoStream = fssync.createReadStream(tmpVideo);
    videoStream.on('data', (chunk) => {
      uploaded += (chunk as Buffer).length;
      const p = 10 + Math.floor((uploaded / Math.max(1, totalBytes)) * 75);
      job.updateProgress(Math.min(85, p));
    });

    const requestBody = {
      snippet: { title, description, tags, categoryId },
      status: { privacyStatus, selfDeclaredMadeForKids },
    } as any;

    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody,
      media: { body: videoStream as any },
    } as any);

    const videoId = (res.data as any)?.id as string | undefined;
    if (!videoId) throw new Error('no_video_id_returned');

    await updateClipExport(exportId, { status: 'processing', youtube_video_id: videoId });

    // 85–95: thumbnail
    try {
      if (fssync.existsSync(tmpThumb)) {
        const size = fssync.statSync(tmpThumb).size;
        if (size <= 2_000_000) {
          await youtube.thumbnails.set({ videoId, media: { body: fssync.createReadStream(tmpThumb) as any } } as any);
        } else {
          log.warn({ rootId, clipId, size }, 'ThumbnailTooLarge');
        }
      }
    } catch (e) {
      log.warn({ rootId, clipId, err: (e as any)?.message }, 'ThumbnailSetFailed');
    }
    await job.updateProgress(95);

    // 95–100: poll processing
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const started = Date.now();
    const timeoutMs = 8 * 60_000; // 8 minutes
    let processed = false;
    while (Date.now() - started < timeoutMs) {
      try {
        const r = await youtube.videos.list({ part: ['status', 'processingDetails'], id: [videoId] });
        const item = r.data.items?.[0];
        const status = item?.status?.uploadStatus;
        if (status === 'processed') {
          processed = true;
          break;
        }
        if (status === 'failed' || status === 'rejected') {
          throw new Error(`processing_${status}`);
        }
      } catch (e) {
        log.warn({ rootId, clipId, err: (e as any)?.message }, 'ProcessingPollFailed');
      }
      await new Promise((r) => setTimeout(r, 4000));
      await job.updateProgress(Math.min(99, Math.floor(95 + ((Date.now() - started) / timeoutMs) * 5)));
    }

    await job.updateProgress(100);
    await updateClipExport(exportId, { status: processed ? 'done' : 'processing', youtube_url: url });
    return { ok: true, videoId, url };
  } catch (err: any) {
    log.error({ rootId, clipId, err: err?.message || err }, 'ExportFailed');
    if (exportId) {
      try { await updateClipExport(exportId, { status: 'failed', error: err?.message || String(err) }); } catch {}
    }
    const msg = String(err?.message || err || '');
    if (msg.includes('401') || msg.includes('403') || msg.includes('youtube_account_not_connected') || msg.includes('oauth_not_configured')) {
      throw new UnrecoverableError(msg);
    }
    throw err;
  } finally {
    try { await fs.rm(tmpRoot, { recursive: true, force: true }); } catch {}
  }
}

export default runExport;
