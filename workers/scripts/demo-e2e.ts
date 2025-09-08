import 'dotenv/config';
import { stopwatch } from '../src/lib/timing';
import { track, shutdown } from '../src/lib/analytics';
import { createClient } from '@supabase/supabase-js';

type StageKey = 'INGEST' | 'TRANSCRIBE' | 'SCENES' | 'RANK' | 'RENDER' | 'TEXTS';

const youtubeUrl = process.env.DEMO_YT_URL!;
const neededMinutes = Number(process.env.DEMO_NEEDED_MINUTES || 10);
const distinctId = 'demo-e2e';
const WORKERS_API_KEY = process.env.WORKERS_API_KEY || '';
const WORKERS_API_PORT = Number(process.env.WORKERS_API_PORT || 8787);
const API_URL = process.env.WORKERS_API_URL || `http://localhost:${WORKERS_API_PORT}`;
const UPLOAD_QUOTA_HINT = 1600;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'raw';

if (!youtubeUrl) throw new Error('DEMO_YT_URL is required');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase admin envs are required');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function fmt(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

async function exists(prefix: string, file: string) {
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(prefix, { search: file });
  if (error) return false;
  return (data || []).some((o) => o.name === file);
}

async function firstClip(rootId: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(`projects/${rootId}/clips`, { limit: 100 });
  if (error) return null;
  const mp4 = (data || []).find((o) => o.name.endsWith('.mp4'));
  return mp4 ? mp4.name.replace(/\.mp4$/, '') : null;
}

async function countClips(rootId: string): Promise<number> {
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(`projects/${rootId}/clips`, { limit: 1000 });
  if (error) return 0;
  return (data || []).filter((o) => o.name.endsWith('.mp4')).length;
}

async function postJson<T>(url: string, body: any, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function main() {
  const sw = stopwatch();

  // Enqueue pipeline via Workers API
  const enqueueStarted = sw.elapsedMs();
  const { jobId } = await postJson<{ jobId: string }>(
    `${API_URL}/api/jobs/pipeline`,
    { youtubeUrl, meta: { source: 'e2e', neededMinutes, upload_quota_hint: UPLOAD_QUOTA_HINT } },
    { 'x-api-key': WORKERS_API_KEY }
  );

  const rootId = jobId;
  console.log(`[E2E] started root=${rootId} url=${youtubeUrl}`);
  await track(distinctId, 'pipeline started', { rootId, youtubeUrl, upload_quota_hint: UPLOAD_QUOTA_HINT });

  const marks: Partial<Record<StageKey, number>> = {};
  let tFirstClip: number | null = null;

  // Polling loop
  const pollT0 = Date.now();
  const maxMs = 45 * 60_000; // 45 minutes timeout
  let lastState = '' as string;
  let lastProgress = -1 as number;

  while (Date.now() - pollT0 < maxMs) {
    try {
      // Job status (root INGEST)
      const st = await getJson<{ id: string; state: string; progress: number }>(
        `${API_URL}/api/jobs/${rootId}/status`,
        { 'x-api-key': WORKERS_API_KEY }
      );
      if (st.state !== lastState || st.progress !== lastProgress) {
        lastState = st.state;
        lastProgress = st.progress;
        process.stdout.write(`[E2E] status=${st.state} progress=${st.progress}%        \r`);
      }
    } catch {}

    // Stage checks via storage
    const elapsed = sw.elapsedMs();

    if (!marks.INGEST) {
      const ok = (await exists(`projects/${rootId}`, 'source.mp4')) || (await exists(`projects/${rootId}`, 'info.json'));
      if (ok) {
        marks.INGEST = elapsed;
        console.log(`\n[E2E] INGEST done at ${fmt(elapsed)}`);
        await track(distinctId, 'stage completed', { stage: 'INGEST', t_ms: elapsed, rootId });
      }
    }

    if (!marks.TRANSCRIBE) {
      const ok = await exists(`projects/${rootId}/transcribe`, 'transcript.json');
      if (ok) {
        marks.TRANSCRIBE = elapsed;
        console.log(`[E2E] TRANSCRIBE done at ${fmt(elapsed)}`);
        await track(distinctId, 'stage completed', { stage: 'TRANSCRIBE', t_ms: elapsed, rootId });
      }
    }

    if (!marks.SCENES) {
      const ok = await exists(`projects/${rootId}/scenes`, 'scenes.json');
      if (ok) {
        marks.SCENES = elapsed;
        console.log(`[E2E] SCENES done at ${fmt(elapsed)}`);
        await track(distinctId, 'stage completed', { stage: 'SCENES', t_ms: elapsed, rootId });
      }
    }

    if (!marks.RANK) {
      const ok = await exists(`projects/${rootId}/rank`, 'rank.json');
      if (ok) {
        marks.RANK = elapsed;
        console.log(`[E2E] RANK done at ${fmt(elapsed)}`);
        await track(distinctId, 'stage completed', { stage: 'RANK', t_ms: elapsed, rootId });
      }
    }

    if (!tFirstClip) {
      const c = await firstClip(rootId);
      if (c) {
        tFirstClip = elapsed;
        console.log(`[E2E] RENDER first clip (${c}) at ${fmt(elapsed)}`);
        await track(distinctId, 'clip rendered', { rootId, clipId: c });
        await track(distinctId, 'stage completed', { stage: 'RENDER', t_ms: elapsed, rootId });
      }
    }

    if (!marks.TEXTS) {
      const ok = (await exists(`projects/${rootId}/texts`, 'blog.md')) || (tFirstClip && (await exists(`projects/${rootId}/texts/${'clip-default'}`, 'title.txt')));
      if (ok) {
        marks.TEXTS = elapsed;
        console.log(`[E2E] TEXTS done at ${fmt(elapsed)}`);
        await track(distinctId, 'stage completed', { stage: 'TEXTS', t_ms: elapsed, rootId });
      }
    }

    // Completion condition: have at least RENDER + TEXTS + RANK
    const done = Boolean(marks.RANK && marks.TEXTS && tFirstClip);
    if (done) {
      const total = elapsed;
      const clips = await countClips(rootId);
      await track(distinctId, 'pipeline completed', {
        rootId,
        t_first_clip_ms: tFirstClip || null,
        t_total_ms: total,
        clips,
        exports: 0,
        upload_quota_hint: UPLOAD_QUOTA_HINT,
      });
      console.log(`[E2E] completed in ${fmt(total)} (first clip ${fmt(tFirstClip || 0)}), clips=${clips}`);
      await shutdown();
      return;
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  // Timeout fail
  await track(distinctId, 'pipeline failed', { rootId: 'unknown', stage: 'timeout', error: 'Exceeded 45min' });
  console.error(`\n[E2E] FAILED: timeout after ${fmt(sw.elapsedMs())}`);
  await shutdown();
  process.exit(1);
}

main().catch(async (err) => {
  console.error(`\n[E2E] ERROR`, err);
  try { await track(distinctId, 'pipeline failed', { stage: 'exception', error: String(err?.message || err) }); } catch {}
  try { await shutdown(); } catch {}
  process.exit(1);
});

