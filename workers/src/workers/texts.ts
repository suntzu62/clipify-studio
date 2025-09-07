import { Job } from 'bullmq';
import pino from 'pino';
import { promises as fs } from 'fs';
import * as path from 'path';
import { downloadToTemp, uploadFile, sbAdmin } from '../lib/storage';
import { generateJSON } from '../lib/openai';
import { enforceLimits, pickExcerpt, makeSlug, normalizeHashtag } from '../lib/texts-yt';
import removeMd from 'remove-markdown';

const log = pino({ name: 'texts' });

interface Segment { start: number; end: number; text: string }
interface Transcript { language: string; segments: Segment[]; text: string }
interface RankItem { id: string; start: number; end: number; duration: number; score?: number; reasons?: string[]; excerpt?: string }

export async function runTexts(job: Job): Promise<any> {
  const { rootId, idempotencyKey } = job.data as { rootId: string; idempotencyKey?: string };
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';

  const tmpDir = `/tmp/${rootId}/texts`;
  await fs.mkdir(tmpDir, { recursive: true });

  log.info({ rootId }, 'TextsStarted');
  await job.updateProgress(2);

  try {
    // Idempotency: if key provided and marker exists, skip generation
    if (idempotencyKey) {
      const idemMarker = `projects/${rootId}/texts/_idem/${idempotencyKey}.txt`;
      try {
        const { error } = await sbAdmin().storage.from(bucket).download(idemMarker);
        if (!error) {
          log.info({ rootId, idempotencyKey }, 'TextsIdempotentHit');
          return {
            rootId,
            items: [],
            blogKey: `projects/${rootId}/texts/blog.md`,
            seoKey: `projects/${rootId}/texts/seo.json`,
          };
        }
      } catch {}
    }
    // 0–10: carregar entradas
    const rankPath = path.join(tmpDir, 'rank.json');
    const transcriptPath = path.join(tmpDir, 'transcript.json');
    await downloadToTemp(bucket, `projects/${rootId}/rank/rank.json`, rankPath);
    await downloadToTemp(bucket, `projects/${rootId}/transcribe/transcript.json`, transcriptPath);
    const rank = JSON.parse(await fs.readFile(rankPath, 'utf-8')) as { items: RankItem[] };
    const transcript = JSON.parse(await fs.readFile(transcriptPath, 'utf-8')) as Transcript;

    const items = Array.isArray(rank.items) ? rank.items.slice(0, 12) : [];
    if (items.length === 0) throw { code: 'TEXTS_NO_ITEMS', message: 'rank.json sem items' };

    const model = process.env.TEXTS_MODEL || 'gpt-4o-mini';
    const tone = process.env.TEXTS_TONE || 'informal-claro';
    const hashtagMax = Number(process.env.TEXTS_HASHTAG_MAX || 12);
    const blogMin = Number(process.env.TEXTS_BLOG_WORDS_MIN || 800);
    const blogMax = Number(process.env.TEXTS_BLOG_WORDS_MAX || 1200);

    await job.updateProgress(10);

    const perItemSpan = Math.max(1, Math.floor(60 / items.length)); // spread 10–70
    const outputs: Array<{ clipId: string; titleKey: string; descriptionKey: string; hashtagsKey: string }> = [];

    // 10–70: geração por clipe
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const { id: clipId, start, end } = it;
      const durationSec = Math.max(0, (end ?? 0) - (start ?? 0));

      const baseText = transcript.segments
        .filter(s => Math.max(s.start, start) < Math.min(s.end, end))
        .map(s => s.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      const excerpt = it.excerpt || pickExcerpt(transcript.segments, start, end, 240);

      const system = [
        'Você escreve títulos curtos com gancho; descrições objetivas; hashtags relevantes; siga estritamente limites do YouTube.',
        `TOM/VOZ: ${tone}. Idioma: PT-BR.`,
      ].join('\n');

      const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          hashtags: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'description', 'hashtags'],
      };

      const user = [
        `INSTRUÇÕES DO CLIPE (${clipId}):`,
        '- Gere TÍTULO (<=100 chars) com gancho nos 3–10s; sem clickbait vazio; use números quando fizer sentido; PT-BR.',
        '- Gere DESCRIÇÃO: 1–2 frases fortes na primeira linha; depois 3 bullets de valor; CTA curto; links placeholders.',
        `- Gere HASHTAGS 3–12, únicas, sem espaços/acentos; priorize 3–5 principais. durationSec=${durationSec}.`,
        'VALIDAÇÃO: Título <=100; Descrição <=5000; Se duration<=60, incluir opcionalmente #Shorts entre as primeiras 3; até 3 aparecem acima do título.',
        '',
        'Contexto do clipe:',
        `- Trecho transcrito: ${JSON.stringify(excerpt)}`,
        `- Texto base (para referência): ${JSON.stringify(baseText.slice(0, 1200))}`,
        '',
        'Responda estritamente em JSON: { "title": string, "description": string, "hashtags": string[] }',
      ].join('\n');

      const prompt = `${system}\n\n${user}`;
      const raw = await generateJSON<{ title: string; description: string; hashtags: string[] }>(model, schema, prompt);

      const sanitized = enforceLimits({
        title: raw.title || '',
        description: raw.description || '',
        hashtags: Array.isArray(raw.hashtags) ? raw.hashtags : [],
        durationSec,
        hashtagMax,
      });

      // Write temp files
      const clipDir = path.join(tmpDir, clipId);
      await fs.mkdir(clipDir, { recursive: true });
      const titlePath = path.join(clipDir, 'title.txt');
      const descPath = path.join(clipDir, 'description.md');
      const tagsPath = path.join(clipDir, 'hashtags.txt');
      await fs.writeFile(titlePath, sanitized.title + '\n');
      await fs.writeFile(descPath, sanitized.description.trim() + '\n');
      await fs.writeFile(tagsPath, sanitized.hashtags.join(' ') + '\n');

      // Upload
      const titleKey = `projects/${rootId}/texts/${clipId}/title.txt`;
      const descriptionKey = `projects/${rootId}/texts/${clipId}/description.md`;
      const hashtagsKey = `projects/${rootId}/texts/${clipId}/hashtags.txt`;
      await uploadFile(bucket, titleKey, titlePath, 'text/plain');
      await uploadFile(bucket, descriptionKey, descPath, 'text/markdown');
      await uploadFile(bucket, hashtagsKey, tagsPath, 'text/plain');

      log.info({ rootId, clipId }, 'ClipTextDone');

      outputs.push({ clipId, titleKey, descriptionKey, hashtagsKey });

      const progress = Math.min(70, 10 + (idx + 1) * perItemSpan);
      await job.updateProgress(progress);
    }

    // 70–95: blog + SEO (usar top 5–8 por score)
    const topCount = Math.max(5, Math.min(8, items.length));
    const top = items.slice(0, topCount);
    const insights = top.map((it, i) => ({
      rank: i + 1,
      clipId: it.id,
      start: it.start,
      end: it.end,
      duration: it.end - it.start,
      excerpt: it.excerpt || pickExcerpt(transcript.segments, it.start, it.end, 260),
      reasons: it.reasons || [],
    }));

    const blogSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        blogMarkdown: { type: 'string' },
        slug: { type: 'string' },
        seoTitle: { type: 'string' },
        metaDescription: { type: 'string' },
      },
      required: ['blogMarkdown', 'slug', 'seoTitle', 'metaDescription'],
    };

    const blogPrompt = [
      'Você é redator PT-BR. Gere UM rascunho de blog (Markdown) com 800–1200 palavras baseado nos melhores clipes abaixo.',
      'Estrutura: \n# Título H1\n\nIntrodução curta\n\n## Seções H2 por tema/clip (use H3 p/ passos/listas)\n\nConclusão com CTA. Evite repetição. Estilo: ' + tone + '.',
      'Também gere SEO: slug curto; seoTitle (<=70 chars); metaDescription (~150–160 chars).',
      '',
      'Clipes selecionados:',
      JSON.stringify(insights, null, 2),
      '',
      'Responda em JSON com chaves: { blogMarkdown, slug, seoTitle, metaDescription }',
    ].join('\n');

    const blogRes = await generateJSON<{
      blogMarkdown: string;
      slug: string;
      seoTitle: string;
      metaDescription: string;
    }>(model, blogSchema, blogPrompt);

    let blogMd = blogRes.blogMarkdown?.trim() || '';
    // Enforce word count roughly by truncating if way over max
    const words = blogMd.split(/\s+/g);
    if (words.length > blogMax + 80) blogMd = words.slice(0, blogMax + 80).join(' ') + '\n';

    // SEO sanitize
    let slug = blogRes.slug?.trim() || makeSlug(blogMd.split('\n')[0] || 'post');
    slug = makeSlug(slug);
    let seoTitle = (blogRes.seoTitle || '').trim();
    if (!seoTitle) seoTitle = removeMd(blogMd.split('\n')[0] || '').slice(0, 70);
    if (seoTitle.length > 70) seoTitle = seoTitle.slice(0, 70).replace(/\s+\S*$/, '').trim();
    let metaDescription = (blogRes.metaDescription || '').trim();
    if (!metaDescription) metaDescription = removeMd(blogMd).slice(0, 160);
    if (metaDescription.length > 160) metaDescription = metaDescription.slice(0, 160).replace(/\s+\S*$/, '').trim();

    // Write and upload
    const blogPath = path.join(tmpDir, 'blog.md');
    const seoPath = path.join(tmpDir, 'seo.json');
    await fs.writeFile(blogPath, blogMd + '\n');
    await fs.writeFile(seoPath, JSON.stringify({ slug, seoTitle, metaDescription }, null, 2));

    const blogKey = `projects/${rootId}/texts/blog.md`;
    const seoKey = `projects/${rootId}/texts/seo.json`;
    await uploadFile(bucket, blogKey, blogPath, 'text/markdown');
    await uploadFile(bucket, seoKey, seoPath, 'application/json');
    log.info({ rootId }, 'BlogDone');

    await job.updateProgress(95);

    // 95–100: uploads finais já feitos acima
    log.info({ rootId }, 'UploadDone');

    // Write idempotency marker last
    if (idempotencyKey) {
      const markerLocal = path.join(tmpDir, 'idem.txt');
      await fs.writeFile(markerLocal, new Date().toISOString());
      const markerKey = `projects/${rootId}/texts/_idem/${idempotencyKey}.txt`;
      await uploadFile(bucket, markerKey, markerLocal, 'text/plain');
    }
    await job.updateProgress(100);

    return { rootId, items: outputs, blogKey, seoKey };
  } catch (error: any) {
    log.error({ rootId, error: error?.message || error }, 'TextsFailed');
    throw error;
  } finally {
    try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

export default runTexts;
