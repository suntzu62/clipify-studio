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

    // Validate input data
    if (!rank.items || !Array.isArray(rank.items)) {
      throw { code: 'INVALID_RANK_DATA', message: 'rank.json does not contain valid items array' };
    }
    if (!transcript.segments || !Array.isArray(transcript.segments)) {
      throw { code: 'INVALID_TRANSCRIPT_DATA', message: 'transcript.json does not contain valid segments array' };
    }
    
    log.info({ rootId, rankItems: rank.items.length, transcriptSegments: transcript.segments.length }, 'InputDataValidated');

    const items = Array.isArray(rank.items) ? rank.items.slice(0, 12) : [];
    if (items.length === 0) throw { code: 'TEXTS_NO_ITEMS', message: 'rank.json sem items' };

    const model = process.env.TEXTS_MODEL || 'gpt-4';
    const tone = process.env.TEXTS_TONE || 'informal-claro';
    const hashtagMax = Number(process.env.TEXTS_HASHTAG_MAX || 12);
    const blogMin = Number(process.env.TEXTS_BLOG_WORDS_MIN || 800);
    const blogMax = Number(process.env.TEXTS_BLOG_WORDS_MAX || 1200);

    await job.updateProgress(10);

    const perItemSpan = Math.max(1, Math.floor(60 / items.length)); // spread 10–70
    const outputs: Array<{ clipId: string; titleKey: string; descriptionKey: string; hashtagsKey: string }> = [];

    // Log environment and setup
    log.info({ 
      rootId,
      model,
      apiKeyPrefix: process.env.OPENAI_API_KEY?.slice(0, 7),
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
      itemCount: items.length,
      tone,
      hashtagMax,
      blogMin,
      blogMax
    }, 'StartingClipGeneration');

    // Log starting clip processing
    log.info({ 
      rootId,
      itemCount: items.length,
      model,
      tone,
      hashtagMax,
      blogMin,
      blogMax
    }, 'StartingClipProcessing');

    // 10–70: geração por clipe
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const { id: clipId, start, end } = it;
      const durationSec = Math.max(0, (end ?? 0) - (start ?? 0));

      // Log clip attempt
      log.debug({ 
        rootId,
        clipId,
        clipIndex: idx,
        clipDuration: durationSec,
        clipStart: start,
        clipEnd: end,
        score: it.score,
        totalClips: items.length
      }, 'ProcessingClip');

      try {
        const baseText = transcript.segments
          .filter(s => Math.max(s.start, start) < Math.min(s.end, end))
          .map(s => s.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        const excerpt = it.excerpt || pickExcerpt(transcript.segments, start, end, 240);

        // Skip if no text content found
        if (!baseText.trim() && !excerpt.trim()) {
          log.warn({ rootId, clipId }, 'No text content found for clip, using fallback');
          
          // Create fallback content
          const clipDir = path.join(tmpDir, clipId);
          await fs.mkdir(clipDir, { recursive: true });
          const titlePath = path.join(clipDir, 'title.txt');
          const descPath = path.join(clipDir, 'description.md');
          const tagsPath = path.join(clipDir, 'hashtags.txt');

          // Usar título e descrição padrão se não houver conteúdo
          await fs.writeFile(titlePath, `Momento Interessante ${idx + 1}`);
          await fs.writeFile(descPath, `Trecho de vídeo extraído automaticamente. Duração: ${Math.round(durationSec)}s`);
          await fs.writeFile(tagsPath, '#viral #clipe #melhormomento');

          // Upload fallback content
          const titleKey = `projects/${rootId}/texts/${clipId}/title.txt`;
          const descriptionKey = `projects/${rootId}/texts/${clipId}/description.md`;
          const hashtagsKey = `projects/${rootId}/texts/${clipId}/hashtags.txt`;
          
          await Promise.all([
            uploadFile(bucket, titleKey, titlePath, 'text/plain'),
            uploadFile(bucket, descriptionKey, descPath, 'text/markdown'),
            uploadFile(bucket, hashtagsKey, tagsPath, 'text/plain')
          ]);

          outputs.push({ clipId, titleKey, descriptionKey, hashtagsKey });
          continue;
        }

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
        
        // Log before OpenAI call
        log.debug({ 
          rootId,
          clipId,
          model,
          promptLength: prompt.length,
          excerptLength: excerpt?.length || 0,
          baseTextLength: baseText.length
        }, 'CallingOpenAI');

        const raw = await generateJSON<{ title: string; description: string; hashtags: string[] }>(model, schema, prompt);

        // Log OpenAI response
        log.debug({ 
          rootId,
          clipId,
          titleLength: raw.title?.length || 0,
          descriptionLength: raw.description?.length || 0,
          hashtagCount: raw.hashtags?.length || 0,
          hasTitle: Boolean(raw.title),
          hasDescription: Boolean(raw.description),
          hasHashtags: Boolean(raw.hashtags)
        }, 'OpenAIResponse');

        const sanitized = enforceLimits({
          title: raw.title || '',
          description: raw.description || '',
          hashtags: Array.isArray(raw.hashtags) ? raw.hashtags : [],
          durationSec,
          hashtagMax,
        });
        
        // Log after sanitization
        log.debug({ 
          rootId,
          clipId,
          sanitizedTitleLength: sanitized.title.length,
          sanitizedDescriptionLength: sanitized.description.length,
          sanitizedHashtagCount: sanitized.hashtags.length,
          originalHashtagCount: raw.hashtags?.length || 0,
          durationSec,
          hashtagMax
        }, 'ContentSanitized');

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

      } catch (clipError: any) {
        // Log error details
        const errorDetails = {
          rootId,
          clipId,
          error: {
            message: clipError?.message || 'Unknown clip error',
            code: clipError?.code || 'CLIP_GENERATION_ERROR',
            stack: clipError?.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines only
          }
        };
        log.warn(errorDetails, 'ClipGenerationFailed, using fallback');
        
        // Create fallback content with error context
        const clipDir = path.join(tmpDir, clipId);
        await fs.mkdir(clipDir, { recursive: true });
        const titlePath = path.join(clipDir, 'title.txt');
        const descPath = path.join(clipDir, 'description.md');
        const tagsPath = path.join(clipDir, 'hashtags.txt');
        
        const fallbackTitle = `Momento #${idx + 1} - Duração: ${Math.round(durationSec)}s`;
        const fallbackDesc = [
          '🎬 Trecho de vídeo interessante',
          '',
          '✨ Destaques:',
          '- Conteúdo extraído automaticamente',
          `- Duração: ${Math.round(durationSec)} segundos`,
          '- Parte de uma série de momentos selecionados',
          '',
          '👉 Assista ao vídeo completo para mais contexto!'
        ].join('\n');
        const fallbackTags = '#shorts #trending #viral #clipe #melhormomento';

        await fs.writeFile(titlePath, fallbackTitle + '\n');
        await fs.writeFile(descPath, fallbackDesc + '\n'); 
        await fs.writeFile(tagsPath, fallbackTags + '\n');

        // Upload fallback content
        const titleKey = `projects/${rootId}/texts/${clipId}/title.txt`;
        const descriptionKey = `projects/${rootId}/texts/${clipId}/description.md`;
        const hashtagsKey = `projects/${rootId}/texts/${clipId}/hashtags.txt`;
        
        await Promise.all([
          uploadFile(bucket, titleKey, titlePath, 'text/plain'),
          uploadFile(bucket, descriptionKey, descPath, 'text/markdown'),
          uploadFile(bucket, hashtagsKey, tagsPath, 'text/plain')
        ]);

        outputs.push({ clipId, titleKey, descriptionKey, hashtagsKey });
      }

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

    // Log start of blog generation
    log.info({ 
      rootId,
      topCount,
      insightsCount: insights.length,
      totalClips: items.length,
      targetWords: {
        min: blogMin,
        max: blogMax
      }
    }, 'StartingBlogGeneration');

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

    // Log before blog OpenAI call
    log.debug({ 
      rootId,
      promptLength: blogPrompt.length,
      insightsJson: JSON.stringify(insights).length,
      model,
      tone
    }, 'CallingBlogOpenAI');

    const blogRes = await generateJSON<{
      blogMarkdown: string;
      slug: string;
      seoTitle: string;
      metaDescription: string;
    }>(model, blogSchema, blogPrompt);

    // Log blog OpenAI response
    log.debug({ 
      rootId,
      blogLength: blogRes.blogMarkdown?.length || 0,
      slugLength: blogRes.slug?.length || 0,
      seoTitleLength: blogRes.seoTitle?.length || 0,
      metaDescriptionLength: blogRes.metaDescription?.length || 0,
      hasBlog: Boolean(blogRes.blogMarkdown),
      hasSlug: Boolean(blogRes.slug),
      hasSeoTitle: Boolean(blogRes.seoTitle),
      hasMetaDescription: Boolean(blogRes.metaDescription)
    }, 'BlogOpenAIResponse');

    // Start blog sanitization
    log.debug({ 
      rootId,
      rawBlogLength: blogRes.blogMarkdown?.length || 0,
      rawSlugLength: blogRes.slug?.length || 0
    }, 'StartingBlogSanitization');

    let blogMd = blogRes.blogMarkdown?.trim() || '';
    // Enforce word count roughly by truncating if way over max
    const words = blogMd.split(/\s+/g);
    const initialWordCount = words.length;
    
    if (words.length > blogMax + 80) {
      blogMd = words.slice(0, blogMax + 80).join(' ') + '\n';
      log.info({ 
        rootId,
        initialWordCount,
        finalWordCount: blogMax + 80,
        truncated: true
      }, 'BlogTruncated');
    }

    // SEO sanitize with detailed logging
    let slug = blogRes.slug?.trim() || makeSlug(blogMd.split('\n')[0] || 'post');
    const originalSlug = slug;
    slug = makeSlug(slug);
    
    let seoTitle = (blogRes.seoTitle || '').trim();
    const originalSeoTitle = seoTitle;
    if (!seoTitle) {
      seoTitle = removeMd(blogMd.split('\n')[0] || '').slice(0, 70);
      log.debug({ rootId, source: 'h1' }, 'UsedFallbackSeoTitle');
    }
    if (seoTitle.length > 70) {
      seoTitle = seoTitle.slice(0, 70).replace(/\s+\S*$/, '').trim();
      log.debug({ rootId, originalLength: originalSeoTitle.length }, 'TruncatedSeoTitle');
    }

    let metaDescription = (blogRes.metaDescription || '').trim();
    const originalMetaDescription = metaDescription;
    if (!metaDescription) {
      metaDescription = removeMd(blogMd).slice(0, 160);
      log.debug({ rootId, source: 'content' }, 'UsedFallbackMetaDescription');
    }
    if (metaDescription.length > 160) {
      metaDescription = metaDescription.slice(0, 160).replace(/\s+\S*$/, '').trim();
      log.debug({ rootId, originalLength: originalMetaDescription.length }, 'TruncatedMetaDescription');
    }

    // Log sanitization results
    log.info({ 
      rootId,
      wordCount: words.length,
      slugChanged: slug !== originalSlug,
      seoTitleChanged: seoTitle !== originalSeoTitle,
      metaDescriptionChanged: metaDescription !== originalMetaDescription,
      finalLengths: {
        blog: blogMd.length,
        slug: slug.length,
        seoTitle: seoTitle.length,
        metaDescription: metaDescription.length
      }
    }, 'BlogSanitizationComplete');

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
    // Format error details with better structure and limits
    const errorDetails = {
      job: {
        rootId,
        progress: await job.progress || 0,
      },
      error: {
        message: error?.message || 'Unknown error in text generation',
        code: error?.code || 'TEXTS_WORKER_ERROR',
        name: error?.name || 'Error',
        stack: error?.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines only
        context: JSON.stringify(error).slice(0, 200), // Limited context
      },
      meta: {
        timestamp: new Date().toISOString(),
        worker: 'texts',
        severity: 'error'
      }
    };

    // Log error with full context
    log.error(errorDetails, 'TextsWorkerFailed');

    // Try to create a minimal emergency fallback for any partial content
    try {
      // Ensure blog files exist even if empty/minimal
      const blogPath = path.join(tmpDir, 'blog.md');
      const seoPath = path.join(tmpDir, 'seo.json');
      
      await fs.writeFile(blogPath, '# Conteúdo em Processamento\n\nEste post está sendo gerado. Por favor, tente novamente em alguns minutos.\n');
      await fs.writeFile(seoPath, JSON.stringify({
        slug: 'post-em-processamento',
        seoTitle: 'Conteúdo em Processamento',
        metaDescription: 'Este conteúdo está sendo gerado. Por favor, tente novamente em alguns minutos.'
      }, null, 2));

      const blogKey = `projects/${rootId}/texts/blog.md`;
      const seoKey = `projects/${rootId}/texts/seo.json`;
      
      await Promise.all([
        uploadFile(bucket, blogKey, blogPath, 'text/markdown'),
        uploadFile(bucket, seoKey, seoPath, 'application/json')
      ]);

      log.info({ rootId }, 'EmergencyFallbackCreated');
    } catch (fallbackError: any) {
      log.error({ 
        rootId, 
        error: fallbackError?.message || 'Unknown fallback error'
      }, 'EmergencyFallbackFailed');
    }

    // Rethrow with better context
    const enrichedError = Object.assign(
      new Error(error?.message || 'Text generation failed'),
      { 
        name: 'TextsWorkerError',
        originalError: error,
        details: errorDetails 
      }
    );
    throw enrichedError;
  } finally {
    // Cleanup with better error handling
    try { 
      await fs.rm(tmpDir, { recursive: true, force: true }); 
      log.debug({ rootId, tmpDir }, 'CleanupComplete');
    } catch (cleanupError: any) {
      log.warn({ 
        rootId, 
        tmpDir,
        error: cleanupError?.message || 'Unknown cleanup error'
      }, 'CleanupFailed');
    }
  }
}

export default runTexts;
