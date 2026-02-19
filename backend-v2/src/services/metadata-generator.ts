import OpenAI from 'openai';
import { createLogger } from '../config/logger.js';

const logger = createLogger('metadata-generator');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

let openaiSeoDisabledUntil = 0;
let openaiSeoDisabledReason = '';

export interface SeoMetadataInput {
  title: string;
  description?: string;
  transcript?: string;
  keywords?: string[];
  platform?: 'tiktok' | 'instagram' | 'youtube';
  /**
   * Optional seed/nonce to vary fallback generations across retries/regenerations.
   * When omitted, results are deterministic for a given clip input.
   */
  seed?: string;
}

export interface SeoMetadataVariant {
  angle?: string;
  title: string;
  description: string;
  hashtags: string[];
}

export interface SeoMetadataResult {
  seoTitle: string;
  seoDescription: string;
  seoHashtags: string[];
  seoVariants: SeoMetadataVariant[];
  seoSelectedIndex: number;
}

const FALLBACK_HASHTAGS = [
  'viral',
  'shorts',
  'trend',
  'fyp',
  'reels',
  'engajamento',
  'conteudocriativo',
  'dica',
  'brasil',
  'paravoce',
];

const CTA_OPTIONS_BY_PLATFORM: Record<NonNullable<SeoMetadataInput['platform']>, string[]> = {
  tiktok: [
    'Você faria o mesmo? Comenta.',
    'Qual lado você escolhe? Comenta.',
    'Isso já aconteceu com você? Comenta.',
    'O que você faria no lugar dele? Comenta.',
  ],
  instagram: [
    'Você faria isso no lugar dele? Comente.',
    'Qual lado você escolhe? Comente.',
    'Isso já aconteceu com você? Comente.',
    'O que você faria no lugar dele? Comente.',
  ],
  youtube: [
    'O que você faria no lugar dele? Comente.',
    'Qual decisão você tomaria? Comente.',
    'Isso já aconteceu com você? Comente.',
  ],
};

const VARIANT_COUNT = 3;

const STOPWORDS = new Set([
  'a', 'o', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'para',
  'pra', 'por', 'com', 'que', 'se', 'nao', 'mais', 'menos', 'muito', 'muita', 'muitos', 'muitas', 'sobre', 'ja',
  'isso', 'essa', 'esse', 'essas', 'esses', 'ele', 'ela', 'eles', 'elas', 'aqui', 'ali', 'la', 'vai', 'foi', 'sao',
  'estao', 'ser', 'estar', 'tem', 'tinha', 'mas', 'porque', 'pois', 'como', 'quando', 'onde', 'quem', 'que', 'uma',
  'seu', 'sua', 'seus', 'suas', 'meu', 'minha', 'meus', 'minhas', 'nosso', 'nossa', 'nossos', 'nossas', 'ate',
  'tambem', 'todo', 'toda', 'todos', 'todas', 'muito', 'muita', 'ainda', 'mesmo', 'mesma', 'mesmos', 'mesmas',
  'video', 'vídeo', 'momento', 'destaque', 'clipe', 'clip',
  // Determiners / weak modifiers (bad hashtags)
  'algum', 'alguma', 'alguns', 'algumas',
  // Common connective words that often leak from transcripts
  'apesar', 'seria',
  // Conversational filler / low-signal tokens (avoid turning these into hashtags)
  'ai', 'ah', 'oh', 'oi', 'opa', 'tipo', 'mano', 'galera', 'gente', 'cara', 'ne', 'né', 'ta', 'tá', 'to', 'tô',
  'voce', 'você', 'vocês', 'cê', 'pra', 'pro', 'pra', 'pelo', 'pela', 'pelos', 'pelas', 'bem', 'bom',
  // Common verbs that rarely make good hashtags in this context
  'vou', 'vai', 'ir', 'voltei', 'voltar', 'ganhei', 'ganhar', 'aprendi', 'aprender', 'fazer', 'faz', 'fez', 'feito',
  'botei', 'botar', 'coloquei', 'abandonei', 'abandonar',
  // Family words often appear as dialogue but are rarely good SEO tags
  'pai', 'mae', 'mãe', 'filho', 'filha',
]);

const BAD_HASHTAGS = new Set([
  // Prevent ultra-generic or conversational tags even if they slip past STOPWORDS.
  'pai',
  'mae',
  'mãe',
  'voltei',
  'ganhei',
  'aprendi',
  'vou',
  'tipo',
  'mano',
  'galera',
  'gente',
  'ne',
  'né',
  'algum',
  'alguma',
  'alguns',
  'algumas',
  'apesar',
  'seria',
  'botei',
  'botar',
  'coloquei',
  'abandonei',
  'abandonar',
]);

const MAX_TITLE_LENGTH = 70;
const MAX_DESCRIPTION_LENGTH = 180;
const MAX_HASHTAGS = 10;

const MIN_TITLE_LENGTH = 28;
const MIN_DESCRIPTION_LENGTH = 60;

const GENERIC_TITLE_PATTERNS = [
  /^momento destaque/i,
  /^o momento/i,
  /^veja o momento/i,
  /^assista/i,
  /^confira/i,
  /^descubra/i,
  /^aprenda/i,
  /^entenda/i,
  /^nesse v[íi]deo/i,
  /^neste v[íi]deo/i,
];

const GENERIC_DESCRIPTION_PATTERNS = [
  /^enfatiza\b/i,
  /^destaca\b/i,
  /^mostra\b/i,
  /^revela\b/i,
  /^explica\b/i,
  /^aborda\b/i,
  /^discute\b/i,
  /^nesse v[íi]deo\b/i,
  /^neste v[íi]deo\b/i,
  /^confira\b/i,
  /^descubra\b/i,
  /^aprenda\b/i,
  /^entenda\b/i,
  /^n[aã]o perca\b/i,
  /momento destaque/i,
  /assista at[eé] o fim/i,
  /imperd[ií]vel/i,
];

function hashFNV1a(text: string): number {
  // 32-bit FNV-1a hash (deterministic seed for creative fallback selection).
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(items: T[], rnd: () => number): T {
  if (!items.length) throw new Error('pickOne: empty array');
  return items[Math.floor(rnd() * items.length)];
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripSurroundingQuotes(text: string): string {
  let out = cleanText(text);
  if (!out) return out;

  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
  ];

  for (let i = 0; i < 2; i += 1) {
    const trimmed = out.trim();
    const pair = pairs.find(([open, close]) => trimmed.startsWith(open) && trimmed.endsWith(close));
    if (!pair) break;
    out = trimmed.slice(pair[0].length, trimmed.length - pair[1].length).trim();
  }

  return out;
}

function removePlaceholderNoise(text: string): string {
  if (!text) return '';
  return text
    // Common placeholder patterns from LLMs/transcripts
    .replace(/\[\s*_{1,}\s*\]/g, '')
    .replace(/\[\s*\.{3}\s*\]/g, '')
    .replace(/\[\s*…\s*\]/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/_{2,}/g, '')
    // Also remove dangling "para [__]" artifacts
    .replace(/\bpara\s*\[\s*_{1,}\s*\]/gi, 'para')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePunctuation(text: string): string {
  if (!text) return '';
  return cleanText(text)
    .replace(/…/g, '...')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])([^\s])/g, '$1 $2')
    // Undo spacing side-effects around ellipses.
    .replace(/\.\s*\.\s*\./g, '...')
    .replace(/,{2,}/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s+\./g, '.')
    .trim();
}

function dedupeSentences(text: string): string {
  const cleaned = cleanText(text);
  if (!cleaned) return '';

  const parts = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((p) => cleanText(p))
    .filter(Boolean);

  if (parts.length <= 1) return cleaned;

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join(' ');
}

function clampText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim();
}

function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function uniqueList(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function extractTokens(text: string): string[] {
  if (!text) return [];
  return cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => normalizeTag(token))
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function buildNgrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i += 1) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

const CONNECTOR_WORDS = new Set([
  'de',
  'do',
  'da',
  'dos',
  'das',
  'pra',
  'para',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'com',
  'por',
  'e',
  'ou',
]);

function tokenizeWords(text: string): Array<{ raw: string; norm: string }> {
  if (!text) return [];
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  return words
    .map((raw) => ({
      raw,
      norm: normalizeTag(raw),
    }))
    .filter((t) => t.norm);
}

function extractKeyPhrases(text: string, maxPhrases: number = 12): string[] {
  const tokens = tokenizeWords(text);
  if (!tokens.length) return [];

  type Entry = { raw: string; count: number; contentWords: number };
  const freq = new Map<string, Entry>();

  const isContent = (norm: string): boolean => {
    if (!norm || norm.length < 3) return false;
    if (STOPWORDS.has(norm)) return false;
    return true;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const t0 = tokens[i];
    if (!isContent(t0.norm)) continue;

    // Build phrases like: content (connector content)*, up to 4 content words.
    let j = i;
    let contentWords = 1;
    const contentNorms = [t0.norm];
    let endIdx = i;

    while (j + 2 < tokens.length && contentWords < 4) {
      const conn = tokens[j + 1];
      const next = tokens[j + 2];
      if (!CONNECTOR_WORDS.has(conn.norm)) break;
      if (!isContent(next.norm)) break;
      contentNorms.push(next.norm);
      contentWords += 1;
      j += 2;
      endIdx = j;
    }

    if (contentWords < 2) continue;

    const key = contentNorms.join(' ');
    const raw = tokens
      .slice(i, endIdx + 1)
      .map((t) => t.raw)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!raw || raw.length < 6) continue;
    if (raw.length > 56) continue;

    const prev = freq.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      freq.set(key, { raw, count: 1, contentWords });
    }
  }

  const scored = Array.from(freq.entries())
    .map(([key, entry]) => {
      const score = entry.count * (entry.contentWords ** 2);
      return { key, raw: entry.raw, score };
    })
    .sort((a, b) => b.score - a.score);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    const cleaned = cleanText(item.raw);
    const normKey = normalizeTag(cleaned);
    if (!cleaned) continue;
    if (seen.has(normKey)) continue;
    // Avoid phrases that are basically just the word "video"/"clipe" etc.
    if (/^(video|vídeo|clipe|clip)$/i.test(cleaned)) continue;
    seen.add(normKey);
    out.push(cleaned);
    if (out.length >= maxPhrases) break;
  }

  return out;
}

function isTooSimilarToTranscript(candidate: string, transcript?: string): boolean {
  const source = transcript || '';
  const candTokens = extractTokens(candidate);
  const sourceTokens = extractTokens(source).slice(0, 260);

  if (candTokens.length < 8 || sourceTokens.length < 12) return false;

  // Copying is usually detectable by shared long n-grams (verbatim or near-verbatim).
  const n = candTokens.length >= 18 ? 6 : 5;
  const sourceNgrams = new Set(buildNgrams(sourceTokens, n));
  for (const ng of buildNgrams(candTokens, n)) {
    if (sourceNgrams.has(ng)) return true;
  }

  return false;
}

function hasUnbalancedQuotes(text: string): boolean {
  const cleaned = cleanText(text);
  if (!cleaned) return false;

  const doubleQuotes = (cleaned.match(/"/g) || []).length;
  if (doubleQuotes % 2 !== 0) return true;

  const openFancy = (cleaned.match(/“/g) || []).length;
  const closeFancy = (cleaned.match(/”/g) || []).length;
  if (openFancy !== closeFancy) return true;

  const openSingleFancy = (cleaned.match(/‘/g) || []).length;
  const closeSingleFancy = (cleaned.match(/’/g) || []).length;
  if (openSingleFancy !== closeSingleFancy) return true;

  return false;
}

function hasPlaceholder(text: string): boolean {
  return /\[\s*_{1,}\s*\]|\[\s*\.{3}\s*\]|\[\s*…\s*\]|_{2,}/.test(text);
}

function repetitionStats(text: string): { uniqueRatio: number; maxTokenRatio: number; repeatedBigrams: number } {
  const tokens = cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => normalizeTag(t))
    .filter(Boolean);

  if (tokens.length === 0) {
    return { uniqueRatio: 1, maxTokenRatio: 0, repeatedBigrams: 0 };
  }

  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);

  const uniqueRatio = freq.size / tokens.length;
  const maxCount = Math.max(...Array.from(freq.values()));
  const maxTokenRatio = maxCount / tokens.length;

  let repeatedBigrams = 0;
  const bigramFreq = new Map<string, number>();
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const bg = `${tokens[i]} ${tokens[i + 1]}`;
    bigramFreq.set(bg, (bigramFreq.get(bg) || 0) + 1);
  }
  for (const count of bigramFreq.values()) {
    if (count >= 2) repeatedBigrams += 1;
  }

  return { uniqueRatio, maxTokenRatio, repeatedBigrams };
}

function isRepetitive(text: string): boolean {
  const stats = repetitionStats(text);
  return stats.uniqueRatio < 0.62 || stats.maxTokenRatio > 0.18 || stats.repeatedBigrams >= 2;
}

function looksGeneric(text: string, patterns: RegExp[]): boolean {
  const cleaned = cleanText(text);
  if (!cleaned) return true;
  if (cleaned.length < 35) return true;
  return patterns.some((pattern) => pattern.test(cleaned));
}

function sanitizeTitle(text: string): string {
  const cleaned = normalizePunctuation(removePlaceholderNoise(stripSurroundingQuotes(text)));
  // Remove trailing comma/colon artifacts that look unprofessional in titles.
  return cleaned.replace(/[,:;.\s]+$/g, '').trim();
}

function sanitizeDescription(text: string): string {
  const cleaned = normalizePunctuation(dedupeSentences(removePlaceholderNoise(stripSurroundingQuotes(text))));
  return cleaned.trim();
}

function shouldAppendCTA(description: string): boolean {
  const d = cleanText(description).toLowerCase();
  if (!d) return true;
  // If there's already a question, it's usually a good enough CTA for short-form.
  if (d.includes('?')) return false;
  if (/(comente|comenta|compartilhe|compartilha|salve|segue|siga|deixe o like|curta|curtiu\?)/i.test(d)) {
    return false;
  }
  return true;
}

function isLowQualityTitle(title: string): boolean {
  const cleaned = sanitizeTitle(title);
  if (!cleaned) return true;
  if (cleaned.length < MIN_TITLE_LENGTH) return true;
  if (hasPlaceholder(cleaned)) return true;
  if (hasUnbalancedQuotes(cleaned)) return true;
  if (isRepetitive(cleaned)) return true;
  return looksGeneric(cleaned, GENERIC_TITLE_PATTERNS);
}

function isLowQualityDescription(description: string): boolean {
  const cleaned = sanitizeDescription(description);
  if (!cleaned) return true;
  if (cleaned.length < MIN_DESCRIPTION_LENGTH) return true;
  if (hasPlaceholder(cleaned)) return true;
  if (hasUnbalancedQuotes(cleaned)) return true;
  if (isRepetitive(cleaned)) return true;
  return looksGeneric(cleaned, GENERIC_DESCRIPTION_PATTERNS);
}

function buildFallbackTitle(input: SeoMetadataInput): string {
  const baseTitle = sanitizeTitle(input.title || '');
  if (!baseTitle) return 'O momento que mudou tudo';
  if (baseTitle.length >= 40) return clampText(baseTitle, MAX_TITLE_LENGTH);
  const keyword = (input.keywords || []).find((k) => k && !baseTitle.toLowerCase().includes(k.toLowerCase()));
  if (keyword) {
    return clampText(`${baseTitle}: ${keyword}`, MAX_TITLE_LENGTH);
  }
  return clampText(baseTitle, MAX_TITLE_LENGTH);
}

function buildFallbackDescription(input: SeoMetadataInput): string {
  const cta = CTA_OPTIONS_BY_PLATFORM[input.platform || 'tiktok'][0];
  const keyword = (input.keywords || []).find((k) => typeof k === 'string' && k.trim().length >= 3)?.trim();
  const baseTitle = sanitizeTitle(input.title || '');
  const topic = keyword || baseTitle;

  const lead = topic
    ? `O detalhe que quase ninguém percebe em ${topic} e por que isso muda tudo.`
    : 'O detalhe que quase ninguém percebe aqui e por que isso muda tudo.';

  const out = shouldAppendCTA(lead) ? `${lead} ${cta}`.trim() : lead.trim();
  return clampText(out, MAX_DESCRIPTION_LENGTH);
}

function buildFallbackHashtags(input: SeoMetadataInput): string[] {
  const keywordTags = (input.keywords || []).flatMap((keyword) => extractTokens(keyword));
  const titleTags = extractTokens(input.title || '');
  const descriptionTags = extractTokens(input.description || '');
  const transcriptTags = extractTokens(input.transcript || '');
  return uniqueList([
    ...keywordTags,
    ...titleTags,
    ...descriptionTags,
    ...transcriptTags,
    ...FALLBACK_HASHTAGS,
  ])
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !BAD_HASHTAGS.has(t))
    .slice(0, MAX_HASHTAGS);
}

function buildTranscriptBrief(transcript: string): string {
  const cleaned = dedupeSentences(normalizePunctuation(cleanText(transcript || '')));
  if (!cleaned) return '';

  // Pick up to 3 informative sentences (avoid long repetitive transcripts becoming the prompt).
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => cleanText(s))
    .filter(Boolean);

  if (sentences.length <= 3) return clampText(cleaned, 520);

  const scored = sentences.map((s) => ({
    s,
    score: uniqueList(extractTokens(s)).length,
  }));

  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, 3).map((x) => x.s);
  return clampText(picked.join(' '), 520);
}

function buildPrompt(input: SeoMetadataInput): string {
  const platformLabel = input.platform || 'TikTok/Instagram';
  const transcript = buildTranscriptBrief(input.transcript || '');
  return `Você é especialista em SEO/CTR para vídeos curtos no estilo Opus Clip.
Gere 3 opções de copy (título + descrição + hashtags) com GANCHO forte (curiosidade) sem inventar fatos.
Responda sempre em português. Escreva como um criador humano (tom natural, direto). Evite tom de relatório/IA.

Contexto do clipe:
- Plataforma: ${platformLabel}
- Título atual: ${input.title}
- Descrição: ${input.description || 'sem descrição'}
- Palavras-chave: ${(input.keywords || []).join(', ') || 'nenhuma'}
- Transcript (trecho): ${transcript || 'não disponível'}

Regras (para CADA opção):
1) Título (45-70 chars): gancho + contexto. Não copie o título atual; reescreva com outras palavras. NÃO use aspas.
2) Descrição (1-2 frases, 120-180 chars): não repita frases do transcript; crie tensão/curiosidade e termine com uma pergunta específica (CTA).
3) Hashtags (7-10): misture 2-3 amplas/trending + 3-5 específicas do tema. Sem "#", sem espaços, sem duplicadas.
4) As 3 opções devem ser realmente diferentes (abertura/ângulo diferentes). Sem repetir o mesmo começo.
5) Proibido:
   - aspas no título/descrição
   - placeholders tipo [__], [...], ___
   - repetir a mesma frase/palavras em sequência
   - frases genéricas: "Enfatiza a necessidade", "Descubra por que", "Confira", "Assista até o fim", "Neste vídeo", "Momento destaque do vídeo".

Responda APENAS em JSON válido:
{
  "variants": [
    { "angle": "curiosidade", "title": "...", "description": "...", "hashtags": ["..."] },
    { "angle": "beneficio", "title": "...", "description": "...", "hashtags": ["..."] },
    { "angle": "contraste", "title": "...", "description": "...", "hashtags": ["..."] }
  ]
}`;
}

function safeParseList(text: string): string[] {
  return text
    .split(/[,#\n]/)
    .map((t) => t.replace(/[#\s]+/g, '').trim())
    .filter(Boolean)
    .slice(0, MAX_HASHTAGS);
}

function normalizeHashtags(raw: unknown, fallback: string[]): string[] {
  const rawHashtags = Array.isArray(raw)
    ? raw
    : safeParseList(String(raw || ''));

  const normalized = uniqueList(
    rawHashtags
      .map((tag: any) => normalizeTag(String(tag)))
      .filter(Boolean)
  )
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !BAD_HASHTAGS.has(t));

  const merged = normalized.length >= 6
    ? normalized
    : uniqueList([...normalized, ...fallback]);

  return merged.slice(0, MAX_HASHTAGS);
}

async function runSeoCompletion(prompt: string, temperature: number, maxTokens: number = 750): Promise<string> {
  if (!openai) return '';
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content:
          'Você é um copywriter/SEO especialista em vídeos curtos. Responda sempre em JSON válido.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
  });
  return completion.choices[0]?.message?.content || '';
}

export async function generateSeoMetadata(input: SeoMetadataInput): Promise<SeoMetadataResult> {
  const fallbackTitle = buildFallbackTitle(input);
  const fallbackDescription = buildFallbackDescription(input);
  const fallbackHashtags = buildFallbackHashtags(input);

  const baseFallbackVariant: SeoMetadataVariant = {
    angle: 'fallback',
    title: fallbackTitle,
    description: fallbackDescription,
    hashtags: fallbackHashtags,
  };

  const sourceTextOriginal = cleanText(`${input.title || ''} ${input.description || ''} ${input.transcript || ''}`);
  const sourceText = sourceTextOriginal.toLowerCase();
  const seedSource = cleanText(
    `${input.platform || 'tiktok'}|${input.seed || ''}|${input.title || ''}|${input.description || ''}|${(input.keywords || []).join(',')}|${(input.transcript || '').slice(0, 1200)}`
  );
  const rnd = mulberry32(hashFNV1a(seedSource));

  const hasStability = /(seguran|estabil|carreir|empreg|clt|concurso|sal[áa]rio|trabalho|chefe)/i.test(sourceTextOriginal);
  const hasContent = /(conte[úu]d|youtube|reels|tiktok|v[íi]deo|viral|shorts|criador|postar|postando)/i.test(sourceTextOriginal);
  const hasMoney = /(dinheiro|renda|grana|fatur|lucro|vender|vendas)/i.test(sourceTextOriginal);
  const hasPerfection = /(perfeit|procrastin|paralis|trav|medo|vergonh|inseguran)/i.test(sourceTextOriginal);
  const hasAudience = /(seguidores|views|visualiz|inscrito|alcance|engaj)/i.test(sourceTextOriginal);
  const usesFirstPerson = /\beu\b|\bmeu\b|\bminha\b|\bmim\b|\bcomigo\b/i.test(sourceTextOriginal);

  const keyword = (input.keywords || [])
    .filter((k) => typeof k === 'string')
    .map((k) => cleanText(String(k)))
    .find((k) => k && k.length >= 3);

  const phrases = extractKeyPhrases(sourceTextOriginal, 10);
  const topic =
    phrases[0] ||
    keyword ||
    sanitizeTitle(input.title || '') ||
    'isso';

  const contrastA = hasStability ? 'segurança' : hasPerfection ? 'perfeição' : hasAudience ? 'aprovação' : 'conforto';
  const contrastB = hasStability ? 'liberdade' : hasPerfection ? 'constância' : hasAudience ? 'progresso' : 'crescimento';

  const contextualQuestions: string[] = uniqueList([
    hasStability ? `Você escolheria ${contrastA} ou ${contrastB}?` : '',
    hasContent ? 'Você postaria mesmo sem validação?' : '',
    hasMoney ? 'Você prefere ganhar agora ou construir no longo prazo?' : '',
    hasPerfection ? 'Você trava por medo ou por perfeccionismo?' : '',
    'Qual parte mais pegou pra você?',
    'Você faria diferente hoje?',
  ].filter(Boolean));

  const ctaBase = pickOne(CTA_OPTIONS_BY_PLATFORM[input.platform || 'tiktok'], rnd);
  const ctaQuestion = pickOne(
    contextualQuestions.length ? contextualQuestions : [`${ctaBase.split('?')[0]?.trim() || 'E você'}?`],
    rnd
  );
  const cta = `${ctaQuestion} ${/comente|comenta/i.test(ctaBase) ? ctaBase.replace(/^.*\?\s*/, '') : 'Comente.'}`.trim();

  const ctx = {
    topic,
    hasStability,
    hasContent,
    hasMoney,
    hasPerfection,
    hasAudience,
    usesFirstPerson,
    contrastA,
    contrastB,
    cta,
  };

  const titleTemplates: Record<string, Array<(c: typeof ctx) => string>> = {
    curiosidade: [
      (c) => `A parte que ninguém te conta sobre ${c.topic}`,
      (c) => `O preço escondido de ${c.topic}`,
      (c) => `Isso parece simples em ${c.topic}... até cobrar o preço`,
      (c) => `O detalhe que vira a chave em ${c.topic} (sério)`,
      (c) => `Não é sobre ${c.topic}. É sobre o que vem depois.`,
      (c) => `Se ${c.topic} te trava, você vai entender por quê`,
      (c) => `O tipo de decisão que muda ${c.topic} sem fazer barulho`,
      (c) => `A virada que ninguém vê em ${c.topic} (mas sente depois)`,
      ...(usesFirstPerson ? [
        (c: typeof ctx) => `Eu quase desisti de ${c.topic} por causa disso`,
        (c: typeof ctx) => `Eu queria ter ouvido isso antes de levar ${c.topic} a sério`,
      ] : []),
    ],
    beneficio: [
      (c) => `O jeito mais simples de melhorar em ${c.topic}`,
      (c) => `Um ajuste pequeno em ${c.topic} que muda o resultado`,
      (c) => `Pare de buscar perfeição: faça ${c.contrastB}`,
      (c) => `O checklist mental pra não travar em ${c.topic}`,
      (c) => `Como destravar ${c.topic} sem depender de motivação`,
      (c) => `A regra chata que funciona em ${c.topic}`,
      (c) => `O básico que todo mundo ignora em ${c.topic}`,
    ],
    contraste: [
      (c) => `Você quer ${c.contrastA} ou quer ${c.contrastB}?`,
      (c) => `O caminho seguro pode ser o mais caro`,
      (c) => `Todo mundo chama isso de ${c.contrastA}... mas não é`,
      (c) => `A verdade incomoda: ${c.contrastA} pode te atrasar`,
      (c) => `O conselho popular sobre ${c.topic} que te prende`,
      (c) => `O que parece certo em ${c.topic} pode te travar`,
      (c) => `Quando ${c.contrastA} vira desculpa, ${c.contrastB} some`,
    ],
  };

  const descriptionTemplates: Record<string, Array<(c: typeof ctx) => string>> = {
    curiosidade: [
      (c) => `Todo mundo vê ${c.topic} por fora. O que quase ninguém nota é o custo escondido por trás.`,
      (c) => `O que parece detalhe em ${c.topic} é exatamente o que separa quem vai de quem para.`,
      (c) => `Isso muda sua leitura sobre ${c.topic}. Repara no ponto que quase passa batido.`,
      (c) => `Tem uma virada silenciosa em ${c.topic} que quase ninguém faz. E por isso quase ninguém colhe.`,
      (c) => `Quando ${c.topic} vira escolha de verdade, o jogo muda. O que você está adiando hoje?`,
      (c) => `Sabe aquele incômodo que aparece em ${c.topic}? Ele não é "à toa". Ele é o sinal.`,
    ],
    beneficio: [
      (c) => `Se você quer evoluir em ${c.topic}, troque ${c.contrastA} por ${c.contrastB}. Simples não é fácil.`,
      (c) => `O jogo de ${c.topic} não é talento: é constância. Um passo por dia bate motivação.`,
      (c) => `Esse trecho te lembra uma coisa: progresso vem de repetir o básico quando ninguém está olhando.`,
      (c) => `A diferença entre travar e avançar em ${c.topic} é uma decisão pequena, feita todo dia.`,
      (c) => `Se você está esperando "o momento certo", você já está perdendo tempo. Faz o básico bem feito.`,
    ],
    contraste: [
      (c) => `Muita gente chama isso de ${c.contrastA}, mas o efeito é o oposto: te deixa no mesmo lugar.`,
      (c) => `O que parece seguro em ${c.topic} pode virar a maior trava. O preço aparece depois.`,
      (c) => `Entre ${c.contrastA} e ${c.contrastB}, quase todo mundo escolhe errado por medo de julgamento.`,
      (c) => `Se ${c.topic} está travado, talvez você esteja escolhendo conforto disfarçado de estratégia.`,
      (c) => `O mais perigoso não é falhar. É passar anos fazendo o "certo" que te mantém pequeno.`,
    ],
  };

  const buildVariant = (angle: 'curiosidade' | 'beneficio' | 'contraste'): SeoMetadataVariant | null => {
    const title = sanitizeTitle(pickOne(titleTemplates[angle], rnd)(ctx));
    let description = sanitizeDescription(pickOne(descriptionTemplates[angle], rnd)(ctx));

    // Ensure we end with a question (short-form captions perform better with a direct engagement ask).
    if (!description.includes('?')) {
      description = `${description}${description.endsWith('.') ? '' : '.'} ${ctx.cta}`.trim();
    }

    const out: SeoMetadataVariant = {
      angle,
      title: clampText(title, MAX_TITLE_LENGTH),
      description: clampText(description, MAX_DESCRIPTION_LENGTH),
      hashtags: fallbackHashtags,
    };

    if (isLowQualityTitle(out.title) || isLowQualityDescription(out.description)) return null;
    if (isTooSimilarToTranscript(`${out.title} ${out.description}`, sourceTextOriginal)) return null;
    return out;
  };

  const fallbackVariants: SeoMetadataVariant[] = [];
  const angles: Array<'curiosidade' | 'beneficio' | 'contraste'> = ['curiosidade', 'beneficio', 'contraste'];
  for (const angle of angles) {
    let picked: SeoMetadataVariant | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      picked = buildVariant(angle);
      if (picked) break;
    }
    if (picked) fallbackVariants.push(picked);
  }

  // Fill missing with the generic fallback as the last resort.
  while (fallbackVariants.length < VARIANT_COUNT) fallbackVariants.push(baseFallbackVariant);

  const fallbackSeoVariants = fallbackVariants.slice(0, VARIANT_COUNT);
  const fallbackSelectedIndex = 0;
  const fallbackSelected = fallbackSeoVariants[fallbackSelectedIndex] || baseFallbackVariant;

  const fallbackResult: SeoMetadataResult = {
    seoTitle: fallbackSelected.title || fallbackTitle,
    seoDescription: fallbackSelected.description || fallbackDescription,
    seoHashtags: fallbackSelected.hashtags?.length ? fallbackSelected.hashtags : fallbackHashtags,
    seoVariants: fallbackSeoVariants,
    seoSelectedIndex: fallbackSelectedIndex,
  };

  if (!openai) return fallbackResult;
  if (Date.now() < openaiSeoDisabledUntil) return fallbackResult;

  const normalizeVariant = (raw: any): SeoMetadataVariant | null => {
    const title = typeof raw?.title === 'string' ? sanitizeTitle(raw.title) : '';
    let description = typeof raw?.description === 'string' ? sanitizeDescription(raw.description) : '';

    // Ensure CTA presence when the model forgets it (but don't duplicate).
    if (description && shouldAppendCTA(description) && description.length <= (MAX_DESCRIPTION_LENGTH - cta.length - 2)) {
      description = `${description}${description.endsWith('.') ? '' : '.'} ${cta}`.trim();
    }

    const hashtags = normalizeHashtags(raw?.hashtags, fallbackHashtags);
    const angle = typeof raw?.angle === 'string' ? cleanText(raw.angle).slice(0, 24) : undefined;

    const out: SeoMetadataVariant = {
      angle,
      title: clampText(title, MAX_TITLE_LENGTH),
      description: clampText(description, MAX_DESCRIPTION_LENGTH),
      hashtags,
    };

    if (!out.title && !out.description) return null;
    return out;
  };

  const variantKey = (v: SeoMetadataVariant): string => {
    return `${normalizeTag(v.title)}|${normalizeTag(v.description.slice(0, 64))}`;
  };

  const pickBestVariantIndex = (variants: SeoMetadataVariant[]): number => {
    const source = input.transcript || input.description || '';
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < variants.length; i += 1) {
      const v = variants[i];
      let score = 0;
      const text = `${v.title} ${v.description}`;

      if (!isLowQualityTitle(v.title)) score += 2;
      else score -= 2;

      if (!isLowQualityDescription(v.description)) score += 2;
      else score -= 2;

      if (v.description.includes('?')) score += 0.5;
      if (isTooSimilarToTranscript(text, source)) score -= 3;
      if (/\d/.test(text)) score += 0.25;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    return bestIdx;
  };

  const prompt = buildPrompt(input);

  try {
    const raw = await runSeoCompletion(prompt, 0.85, 900);
    const parsed = JSON.parse(raw || '{}');

    const rawVariants = Array.isArray(parsed?.variants) ? parsed.variants : [];
    let variants = rawVariants
      .map((v: any) => normalizeVariant(v))
      .filter(Boolean) as SeoMetadataVariant[];

    // Drop low-quality or copy-pasted variants, but keep at least one candidate.
    const source = input.transcript || input.description || '';
    const filtered = variants.filter((v) => {
      if (!v.title || !v.description) return false;
      if (isLowQualityTitle(v.title) || isLowQualityDescription(v.description)) return false;
      return !isTooSimilarToTranscript(`${v.title} ${v.description}`, source);
    });
    variants = filtered.length ? filtered : variants;

    // Dedupe while preserving order.
    const seen = new Set<string>();
    variants = variants.filter((v) => {
      const key = variantKey(v);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Retry once if we don't have enough good options.
    if (variants.length < VARIANT_COUNT) {
      const retryPrompt = `${prompt}

O JSON anterior ficou com baixa qualidade (ex.: repetição, muito parecido com o transcript, ou pouco específico).
Gere 3 opções novas do zero, com aberturas diferentes e sem repetir palavras/frases do transcript.`;

      try {
        const retryRaw = await runSeoCompletion(retryPrompt, 0.35, 900);
        const retryParsed = JSON.parse(retryRaw || '{}');
        const retryVariants = (Array.isArray(retryParsed?.variants) ? retryParsed.variants : [])
          .map((v: any) => normalizeVariant(v))
          .filter(Boolean) as SeoMetadataVariant[];

        for (const v of retryVariants) {
          const key = variantKey(v);
          if (seen.has(key)) continue;
          if (isLowQualityTitle(v.title) || isLowQualityDescription(v.description)) continue;
          if (isTooSimilarToTranscript(`${v.title} ${v.description}`, source)) continue;
          seen.add(key);
          variants.push(v);
          if (variants.length >= VARIANT_COUNT) break;
        }
      } catch (retryErr: any) {
        logger.warn({ error: retryErr.message }, 'SEO metadata variants retry failed, keeping first attempt');
      }
    }

    // Fill missing with fallbacks.
    for (const v of fallbackVariants) {
      const key = variantKey(v);
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push(v);
      if (variants.length >= VARIANT_COUNT) break;
    }

    if (!variants.length) return fallbackResult;

    variants = variants.slice(0, VARIANT_COUNT);
    const seoSelectedIndex = Math.max(0, Math.min(pickBestVariantIndex(variants), variants.length - 1));
    const selected = variants[seoSelectedIndex] || variants[0];

    return {
      seoTitle: selected.title || fallbackTitle,
      seoDescription: selected.description || fallbackDescription,
      seoHashtags: selected.hashtags?.length ? selected.hashtags : fallbackHashtags,
      seoVariants: variants,
      seoSelectedIndex,
    };
  } catch (error: any) {
    const message = String(error?.message || '');
    // Fail-fast for quota issues: avoid spamming requests for every clip/job.
    const prevDisabledUntil = openaiSeoDisabledUntil;
    if (/exceeded your current quota|insufficient[_ ]quota/i.test(message)) {
      openaiSeoDisabledUntil = Date.now() + 60 * 60 * 1000; // 1h
      openaiSeoDisabledReason = message;
    } else if (/429/.test(message)) {
      openaiSeoDisabledUntil = Date.now() + 5 * 60 * 1000; // 5m
      openaiSeoDisabledReason = message;
    }

    logger.warn({ error: error.message }, 'SEO metadata generation failed, using fallback');
    if (openaiSeoDisabledUntil > prevDisabledUntil && Date.now() < openaiSeoDisabledUntil) {
      logger.warn(
        { reason: openaiSeoDisabledReason, until: new Date(openaiSeoDisabledUntil).toISOString() },
        'OpenAI SEO temporarily disabled'
      );
    }
    return fallbackResult;
  }
}
