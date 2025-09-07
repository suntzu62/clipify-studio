import removeMd from 'remove-markdown';
import slugify from 'slugify';

export function enforceLimits(input: {
  title: string;
  description: string;
  hashtags: string[];
  durationSec?: number;
  hashtagMax?: number;
}): { title: string; description: string; hashtags: string[] } {
  const hashtagMax = Math.max(3, Math.min(Number(input.hashtagMax ?? process.env.TEXTS_HASHTAG_MAX ?? 12), 60));

  // Title: cut to <= 100 chars at word boundary
  const maxTitle = 100;
  let title = input.title?.trim() || '';
  if (title.length > maxTitle) {
    const cut = title.slice(0, maxTitle);
    const lastSpace = cut.lastIndexOf(' ');
    title = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
  }

  // Description: <= 5000 chars
  const maxDesc = 5000;
  let description = input.description?.trim() || '';
  if (description.length > maxDesc) description = description.slice(0, maxDesc).trimEnd();

  // Hashtags: normalize, dedup, 3–12 (<=60 absolute)
  const norm = (tag: string) => normalizeHashtag(tag);
  const set = new Set<string>();
  let tags = (input.hashtags || [])
    .map(norm)
    .filter(Boolean);

  // If Shorts (<=60s), ensure #Shorts among first 3 (optional but try)
  if ((input.durationSec ?? 0) <= 60) {
    const shorts = '#Shorts';
    if (!tags.some(t => t.toLowerCase() === '#shorts')) {
      tags.unshift(shorts);
    }
  }

  const out: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (!set.has(key)) {
      set.add(key);
      out.push(tag);
      if (out.length >= hashtagMax) break;
    }
  }
  while (out.length < 3) out.push('#video');

  return { title, description, hashtags: out };
}

export function pickExcerpt(
  segments: Array<{ start: number; end: number; text: string }>,
  start: number,
  end: number,
  maxChars = 220
): string {
  const text = segments
    .filter(s => Math.max(s.start, start) < Math.min(s.end, end))
    .map(s => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

export function normalizeHashtag(tag: string): string {
  if (!tag) return '';
  let t = String(tag).trim().replace(/^#+/, '');
  // keep underscores, strip accents, spaces and dashes
  t = slugify(t, { lower: false, strict: true, remove: /[*+~.()'"!:@]/g });
  t = t.replace(/-/g, '').replace(/\s+/g, '');
  // remove non-alnum and underscore
  t = t.replace(/[^A-Za-z0-9_]/g, '');
  if (!t) return '';
  // Avoid overly generic placeholders
  if (['video', 'cool', 'follow'].includes(t.toLowerCase())) return '';
  return `#${t}`;
}

export function makeSlug(s: string): string {
  return slugify(removeMd(s || '').slice(0, 80), { lower: true, strict: true });
}

