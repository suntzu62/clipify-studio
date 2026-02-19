import { promises as fs } from 'fs';
import { join } from 'path';
import { execa } from 'execa';
import { createLogger } from '../config/logger.js';
import type { Transcript, TranscriptSegment } from '../types/index.js';

const logger = createLogger('youtube-captions');

export interface YouTubeCaptionsOptions {
  language?: string; // e.g. "pt"
  fallbackDuration?: number; // seconds
  timeoutMs?: number;
}

function buildSubLangs(language: string): string {
  const normalized = language.toLowerCase();

  if (normalized.startsWith('pt')) {
    return 'pt.*,pt-BR,pt-PT,en.*,en';
  }
  if (normalized.startsWith('en')) {
    return 'en.*,en,pt.*,pt-BR,pt-PT';
  }

  return `${normalized}.*,${normalized},en.*,en`;
}

function parseVttTime(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':');

  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const secondsPart = parts[parts.length - 1];
  const [secStr, msStr = '0'] = secondsPart.split('.');

  const seconds = Number(secStr);
  const ms = Number(msStr.padEnd(3, '0').slice(0, 3));

  const minutes = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;

  if (![seconds, minutes, hours, ms].every((n) => Number.isFinite(n))) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanCaptionText(text: string): string {
  return decodeEntities(
    text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function parseVttToSegments(vtt: string): TranscriptSegment[] {
  const lines = vtt.split(/\r?\n/);
  const segments: TranscriptSegment[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i += 1;
      continue;
    }

    if (line.startsWith('WEBVTT') || line.startsWith('NOTE') || line.startsWith('STYLE')) {
      i += 1;
      continue;
    }

    // Cue identifiers may appear on their own line before the time range.
    const timeLine = line.includes('-->') ? line : lines[i + 1]?.trim();
    const isTimeLine = typeof timeLine === 'string' && timeLine.includes('-->');

    if (!isTimeLine) {
      i += 1;
      continue;
    }

    if (timeLine !== line) {
      // Skip cue identifier line
      i += 1;
    }

    const [startRaw, endRawWithSettings] = timeLine.split('-->');
    const endRaw = endRawWithSettings?.trim().split(/[ \t]/)[0] || '';

    const start = parseVttTime(startRaw);
    const end = parseVttTime(endRaw);

    i += 1;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i += 1;
    }

    if (start === null || end === null || end <= start) {
      continue;
    }

    const text = cleanCaptionText(textLines.join(' '));
    if (!text) {
      continue;
    }

    segments.push({ start, end, text });
  }

  // Merge adjacent duplicates (YouTube captions often repeat text across cues)
  segments.sort((a, b) => a.start - b.start);

  const merged: TranscriptSegment[] = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.text === seg.text && seg.start <= prev.end + 0.05) {
      prev.end = Math.max(prev.end, seg.end);
      continue;
    }
    merged.push(seg);
  }

  return merged;
}

function getSubtitleFileInfo(filename: string): { lang: string | null; isAuto: boolean } {
  const lower = filename.toLowerCase();
  const isAuto = lower.includes('.auto.');

  // Common patterns:
  //   <id>.<lang>.vtt
  //   <id>.<lang>.auto.vtt
  const match = filename.match(/\.([a-zA-Z-]+)(?:\.auto)?\.vtt$/);
  if (!match?.[1]) {
    return { lang: null, isAuto };
  }

  return { lang: match[1], isAuto };
}

function chooseBestSubtitleFile(files: string[], preferredLanguage: string): string {
  const preferred = preferredLanguage.toLowerCase();

  const scored = files.map((file) => {
    const { lang, isAuto } = getSubtitleFileInfo(file);
    const normalizedLang = (lang || '').toLowerCase();

    let langScore = 0;
    if (normalizedLang === preferred) {
      langScore = 100;
    } else if (normalizedLang.startsWith(preferred)) {
      langScore = 80;
    } else if (preferred.startsWith('pt') && normalizedLang.startsWith('pt')) {
      langScore = 70;
    } else if (preferred.startsWith('en') && normalizedLang.startsWith('en')) {
      langScore = 70;
    } else if (normalizedLang) {
      langScore = 10;
    }

    const autoPenalty = isAuto ? -5 : 0; // prefer human captions when available
    return { file, score: langScore + autoPenalty };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.file || files[0];
}

export async function fetchTranscriptFromYouTubeCaptions(
  youtubeUrl: string,
  options: YouTubeCaptionsOptions = {}
): Promise<Transcript> {
  const {
    language = 'pt',
    fallbackDuration = 0,
    timeoutMs = 60_000,
  } = options;

  const tempDir = join('/tmp', `yt-captions-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await fs.mkdir(tempDir, { recursive: true });

  const subLangs = buildSubLangs(language);
  const outputTemplate = join(tempDir, '%(id)s.%(ext)s');

  try {
    const args = [
      '--ignore-errors',
      '--skip-download',
      '--no-playlist',
      '--js-runtimes', 'node',
      '--write-subs',
      '--write-auto-subs',
      '--sub-format', 'vtt',
      '--sub-langs', subLangs,
      '--extractor-args', 'youtube:player_client=android',
      '-o', outputTemplate,
      youtubeUrl,
    ];

    const result = await execa('yt-dlp', args, {
      timeout: timeoutMs,
      all: true,
      reject: false,
      maxBuffer: 20 * 1024 * 1024,
    });

    if (result.exitCode !== 0) {
      logger.warn(
        { exitCode: result.exitCode, stderr: result.stderr, stdout: result.stdout },
        'yt-dlp returned non-zero exit code while fetching captions'
      );
    }

    const files = await fs.readdir(tempDir);
    const vttFiles = files.filter((f) => f.toLowerCase().endsWith('.vtt'));

    if (vttFiles.length === 0) {
      logger.warn({ youtubeUrl, subLangs }, 'No caption files downloaded from YouTube');
      return { segments: [], language, duration: fallbackDuration, isFallback: true };
    }

    const chosen = chooseBestSubtitleFile(vttFiles, language);
    const chosenPath = join(tempDir, chosen);

    const vtt = await fs.readFile(chosenPath, 'utf8');
    const segments = parseVttToSegments(vtt);
    const duration = segments.length ? Math.max(...segments.map((s) => s.end)) : fallbackDuration;

    logger.info({ youtubeUrl, file: chosen, segmentCount: segments.length }, 'YouTube captions parsed');

    return { segments, language, duration, isFallback: true };
  } catch (error: any) {
    logger.warn({ youtubeUrl, error: error.message }, 'Failed to fetch YouTube captions');
    return { segments: [], language, duration: fallbackDuration, isFallback: true };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
