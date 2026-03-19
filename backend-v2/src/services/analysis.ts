import OpenAI from 'openai';
import { createLogger } from '../config/logger.js';
import type {
  Transcript,
  HighlightAnalysis,
  HighlightSegment,
  PlatformRemix,
  ClipRemixPackage,
  PlatformRemixVariant,
  RemixPlatform,
  AspectRatio,
} from '../types/index.js';
import { detectScenes, type DetectedScene } from './scene-detection.js';

const logger = createLogger('analysis');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AnalysisOptions {
  targetDuration?: number; // Target duration for each clip in seconds
  clipCount?: number; // Desired number of clips
  minDuration?: number; // Minimum clip duration
  maxDuration?: number; // Maximum clip duration
  model?: 'ClipAnything' | 'Smart' | 'Fast';
  genre?: string;
  specificMoments?: string;
  platformRemix?: PlatformRemix;
}

/**
 * Analisa a transcrição e identifica os melhores highlights para clips
 * Agora usa detecção inteligente de cenas combinando silêncios, pontuação e mudanças semânticas
 */
export async function analyzeHighlights(
  transcript: Transcript,
  options: AnalysisOptions = {}
): Promise<HighlightAnalysis> {
  const {
    targetDuration = 60,
    clipCount = 8,
    minDuration = 30,
    maxDuration = 90,
    model = 'ClipAnything',
    genre,
    specificMoments,
    platformRemix,
  } = options;

  logger.info(
    {
      segments: transcript.segments.length,
      duration: transcript.duration,
      targetDuration,
      clipCount,
      model,
      genre,
      hasSpecificMoments: Boolean(specificMoments),
      platformRemix,
    },
    'Starting highlight analysis'
  );

  try {
    // STEP 1: Detect scenes using multiple criteria (silences, semantic changes, punctuation)
    logger.info('Detecting scenes using multi-criteria analysis');

    const detectedScenes = await detectScenes(transcript, {
      minSilenceDuration: 0.45,
      minSceneDuration: minDuration,
      maxSceneDuration: maxDuration,
      padding: 0.4, // 400ms padding for smooth transitions
      targetSceneCount: Math.max(clipCount * 3, 20), // Detect significantly more scenes than needed for better ranking
    });

    logger.info(
      {
        detectedScenes: detectedScenes.length,
        avgDuration: detectedScenes.reduce((sum, s) => sum + s.duration, 0) / detectedScenes.length,
      },
      'Scene detection completed'
    );

    // STEP 2: If we don't have enough scenes, fall back to AI-based analysis
    if (detectedScenes.length === 0) {
      logger.warn(
        { detectedScenes: detectedScenes.length, required: clipCount },
        'Not enough scenes detected, using fallback AI analysis'
      );
      return await fallbackAIAnalysis(transcript, options);
    }

    // STEP 3: Prepare scenes for AI ranking
    const scenesText = detectedScenes
      .map((scene, idx) => {
        const startTime = formatTimestamp(scene.start);
        const endTime = formatTimestamp(scene.end);
        const duration = Math.round(scene.duration);
        const boundaryInfo = scene.boundaryTypes.join(', ');
        return `Scene ${idx + 1} [${startTime} - ${endTime}] (${duration}s, boundaries: ${boundaryInfo}):\n${scene.text}\n`;
      })
      .join('\n---\n');

    const rankingTarget = Math.min(clipCount, detectedScenes.length);

    // STEP 4: Call AI to rank and generate metadata for scenes
    const prompt = buildRankingPrompt(
      scenesText,
      transcript.duration,
      targetDuration,
      rankingTarget,
      detectedScenes.length,
      buildUserFocusContext({ model, genre, specificMoments, platformRemix })
    );

    logger.debug('Sending scenes to OpenAI for ranking and metadata generation');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Você é um especialista em análise de conteúdo de vídeo para redes sociais. Sempre responda em formato JSON válido.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse response
    const responseText = completion.choices[0]?.message?.content || '';
    logger.debug({ responseLength: responseText.length }, 'Received response from OpenAI');

    const analysis = parseRankingResponse(responseText);

    // STEP 5: Map AI response back to detected scenes
    const enrichedSegments: HighlightSegment[] = [];
    const usedSceneIndexes = new Set<number>();

    for (const ranking of analysis.rankings) {
      const sceneIndex = ranking.sceneIndex - 1; // Convert 1-based to 0-based
      const scene = detectedScenes[sceneIndex];

      if (!scene || usedSceneIndexes.has(sceneIndex)) {
        logger.warn({ sceneIndex, ranking }, 'Invalid or duplicate scene index, skipping');
        continue;
      }

      usedSceneIndexes.add(sceneIndex);

      enrichedSegments.push({
        start: scene.start,
        end: scene.end,
        score: ranking.score,
        title: ranking.title,
        description: ranking.description,
        reason: ranking.reason,
        keywords: ranking.keywords,
      });
    }

    const completedSegments = ensureClipCoverage(
      enrichedSegments,
      detectedScenes,
      transcript,
      clipCount,
      targetDuration,
      minDuration,
      maxDuration
    );

    const remixedSegments = applyPlatformRemix(completedSegments, platformRemix);

    logger.info(
      {
        detectedScenes: detectedScenes.length,
        rankedScenes: analysis.rankings.length,
        finalClips: remixedSegments.length,
      },
      'Highlight analysis completed with scene detection'
    );

    return {
      segments: remixedSegments,
      reasoning: analysis.reasoning,
    };
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Highlight analysis failed');

    // Fallback to traditional analysis on error
    logger.warn('Falling back to traditional AI analysis due to error');
    return await fallbackAIAnalysis(transcript, options);
  }
}

/**
 * Fallback AI analysis when scene detection doesn't produce enough results
 */
async function fallbackAIAnalysis(
  transcript: Transcript,
  options: AnalysisOptions
): Promise<HighlightAnalysis> {
  const {
    targetDuration = 60,
    clipCount = 8,
    minDuration = 30,
    maxDuration = 90,
    model = 'ClipAnything',
    genre,
    specificMoments,
    platformRemix,
  } = options;

  logger.info('Using fallback AI-based analysis');

  const transcriptText = formatTranscriptForAnalysis(transcript);
  const prompt = buildAnalysisPrompt(
    transcriptText,
    transcript.duration,
    targetDuration,
    clipCount,
    minDuration,
    maxDuration,
    buildUserFocusContext({ model, genre, specificMoments, platformRemix })
  );

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Você é um especialista em análise de conteúdo de vídeo para redes sociais. Sempre responda em formato JSON válido.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const responseText = completion.choices[0]?.message?.content || '';
  const analysis = parseAIResponse(responseText);
  const fallbackScenes = await detectScenes(transcript, {
    minSilenceDuration: 0.45,
    minSceneDuration: minDuration,
    maxSceneDuration: maxDuration,
    padding: 0.4,
    targetSceneCount: Math.max(clipCount * 3, 20),
  });

  const completedSegments = ensureClipCoverage(
    analysis.segments,
    fallbackScenes,
    transcript,
    clipCount,
    targetDuration,
    minDuration,
    maxDuration
  );

  return {
    segments: applyPlatformRemix(completedSegments, platformRemix),
    reasoning: analysis.reasoning,
  };
}

/**
 * Formata a transcrição para análise
 */
function formatTranscriptForAnalysis(transcript: Transcript): string {
  return transcript.segments
    .map((seg) => {
      const startTime = formatTimestamp(seg.start);
      const endTime = formatTimestamp(seg.end);
      return `[${startTime} - ${endTime}] ${seg.text}`;
    })
    .join('\n');
}

/**
 * Formata timestamp em formato legível (MM:SS)
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Constrói o prompt para ranking de cenas já detectadas
 */
function buildRankingPrompt(
  scenesText: string,
  totalDuration: number,
  targetDuration: number,
  clipCount: number,
  totalScenes: number,
  userFocusContext: string
): string {
  return `Você é um especialista em análise de conteúdo de vídeo para redes sociais (TikTok, Instagram Reels, YouTube Shorts).

Analise as ${totalScenes} cenas detectadas abaixo e RANQUEIE as ${clipCount} MELHORES para criar clipes virais.

CENAS DETECTADAS (já otimizadas com padding para transições suaves):
${scenesText}

${userFocusContext}

CRITÉRIOS DE RANKING (ordem de importância):
1. **Gancho Forte no Início** (0-5s): Frase de impacto, pergunta, número, afirmação polêmica
2. **Densidade de Conteúdo**: Palavras por segundo, informação valiosa, sem pausas longas
3. **História Completa**: Começo, meio e fim autocontidos (não precisa de contexto)
4. **Pico Emocional**: Momentos engraçados, surpreendentes, inspiradores ou polêmicos
5. **Diversidade Temática**: Evite selecionar múltiplas cenas sobre o mesmo assunto
6. **Clareza**: Sem cortes no meio de frases, ideias completas
7. **Presença de Gatilhos**: Números, perguntas, listas, "você sabia?", "atenção"

IMPORTANTE:
- Score deve ser 0.0-1.0 (1.0 = viral garantido)
- Penalize cenas com pausas longas (>3s) ou clareza ruim
- Prefira cenas de 30-60s (ideal para Shorts/Reels)
- Diversifique os temas selecionados
- Retorne EXATAMENTE ${clipCount} cenas

Responda APENAS com um JSON válido neste formato:
{
  "rankings": [
    {
      "sceneIndex": 1,
      "score": 0.95,
      "title": "Título viral e chamativo (máx 60 chars)",
      "description": "Descrição natural e envolvente do clipe (1-2 frases). Escreva como um storyteller: capture a essência do momento, a emoção e o contexto de forma humana e cativante. NÃO use linguagem técnica ou robótica. Exemplo bom: 'O momento exato em que ele descobre o que realmente aconteceu e a reação é impagável.' Exemplo ruim: 'Discussão divertida sobre tema X com provocações e humor.'",
      "reason": "Por que este clipe vai viralizar (gancho + conteúdo + emoção)",
      "keywords": ["palavra1", "palavra2", "palavra3"]
    }
  ],
  "reasoning": "Análise geral: critérios usados, diversidade dos clipes, estratégia de seleção"
}

Duração total do vídeo: ${Math.floor(totalDuration / 60)}min ${Math.floor(totalDuration % 60)}s

Retorne APENAS o JSON, sem texto adicional.`;
}

/**
 * Constrói o prompt para análise tradicional (fallback)
 */
function buildAnalysisPrompt(
  transcriptText: string,
  totalDuration: number,
  targetDuration: number,
  clipCount: number,
  minDuration: number,
  maxDuration: number,
  userFocusContext: string
): string {
  return `Você é um especialista em análise de conteúdo de vídeo para redes sociais (TikTok, Instagram Reels, YouTube Shorts).

Analise esta transcrição de vídeo e identifique os ${clipCount} MELHORES momentos para criar clipes virais.

TRANSCRIÇÃO:
${transcriptText}

${userFocusContext}

CRITÉRIOS IMPORTANTES:
- Cada clipe deve ter entre ${minDuration}-${maxDuration} segundos (idealmente ~${targetDuration}s)
- Procure momentos com:
  * Ganchos fortes no início (perguntas, números, afirmações polêmicas)
  * Histórias completas e autocontidas
  * Alta densidade de informação (evite pausas longas)
  * Picos emocionais ou revelações
  * Frases de impacto ou polêmicas
  * Informações valiosas e práticas
  * Momentos engraçados ou surpreendentes
- Evite cortes no meio de frases ou ideias
- Os clipes devem fazer sentido sozinhos (sem contexto do vídeo completo)
- Diversifique os temas selecionados

IMPORTANTE: Você DEVE retornar EXATAMENTE ${clipCount} clipes no formato JSON abaixo.

Responda APENAS com um JSON válido neste formato:
{
  "segments": [
    {
      "start": 0,
      "end": 60,
      "score": 0.95,
      "title": "Título chamativo do clipe",
      "description": "Descrição natural e envolvente (1-2 frases). Escreva como storyteller: capture a essência do momento, emoção e contexto de forma humana e cativante. Sem linguagem robótica.",
      "reason": "Por que este momento é viral",
      "keywords": ["palavra1", "palavra2", "palavra3"]
    }
  ],
  "reasoning": "Explicação geral da sua análise e critérios usados"
}

Duração total do vídeo: ${Math.floor(totalDuration / 60)}min ${Math.floor(totalDuration % 60)}s

Retorne APENAS o JSON, sem nenhum texto adicional antes ou depois.`;
}

function buildUserFocusContext(input: {
  model?: 'ClipAnything' | 'Smart' | 'Fast';
  genre?: string;
  specificMoments?: string;
  platformRemix?: PlatformRemix;
}): string {
  const hints: string[] = [];

  if (input.model) {
    if (input.model === 'Fast') {
      hints.push('- Modo de clipping: Fast (priorize ganchos óbvios e cenas com alta clareza).');
    } else if (input.model === 'Smart') {
      hints.push('- Modo de clipping: Smart (equilibre qualidade, diversidade e velocidade).');
    } else {
      hints.push('- Modo de clipping: ClipAnything (priorize momentos com maior potencial viral).');
    }
  }

  if (input.genre) {
    hints.push(`- Gênero/contexto informado pelo usuário: ${input.genre}.`);
  }

  if (input.specificMoments) {
    hints.push(`- Objetivo do usuário: ${input.specificMoments}.`);
  }

  if (input.platformRemix?.enabled) {
    const targetPlatforms = input.platformRemix.targetPlatforms.map(formatPlatformLabel).join(', ');
    hints.push(`- Plataforma principal do remix: ${formatPlatformLabel(input.platformRemix.primaryPlatform)}.`);
    hints.push(`- Plataformas alvo secundárias: ${targetPlatforms}.`);
    hints.push(`- Meta principal do remix: ${formatGoalLabel(input.platformRemix.goal)}.`);
    hints.push(`- Estilo de hook desejado: ${formatHookStyleLabel(input.platformRemix.hookStyle)}.`);
    hints.push(`- Estilo de legenda/copy: ${formatCaptionStyleLabel(input.platformRemix.captionStyle)}.`);
    hints.push(`- Gerar variações com hooks alternativos: ${input.platformRemix.generateAltHooks ? 'sim' : 'não'}.`);
    hints.push(buildPlatformPlaybook(input.platformRemix));
  }

  if (hints.length === 0) {
    return '';
  }

  return `FOCO E RESTRIÇÕES ADICIONAIS DO USUÁRIO:
${hints.join('\n')}`;
}

function formatPlatformLabel(platform: PlatformRemix['primaryPlatform']): string {
  switch (platform) {
    case 'tiktok':
      return 'TikTok';
    case 'instagram_reels':
      return 'Instagram Reels';
    case 'youtube_shorts':
      return 'YouTube Shorts';
    case 'linkedin':
      return 'LinkedIn';
  }
}

function formatGoalLabel(goal: PlatformRemix['goal']): string {
  switch (goal) {
    case 'viral':
      return 'alcance viral e retenção forte';
    case 'conversion':
      return 'conversão, clique ou ação comercial';
    case 'authority':
      return 'autoridade e percepção de expertise';
    case 'engagement':
      return 'comentários, compartilhamentos e salvamentos';
  }
}

function formatHookStyleLabel(hookStyle: PlatformRemix['hookStyle']): string {
  switch (hookStyle) {
    case 'bold':
      return 'afirmações fortes e pattern interrupt';
    case 'curiosity':
      return 'curiosidade, mistério e payoff';
    case 'teaching':
      return 'ensino prático com promessa clara';
    case 'story':
      return 'narrativa e construção emocional';
  }
}

function formatCaptionStyleLabel(captionStyle: PlatformRemix['captionStyle']): string {
  switch (captionStyle) {
    case 'punchy':
      return 'curta, forte e altamente escaneável';
    case 'conversational':
      return 'natural, humana e próxima';
    case 'expert':
      return 'didática, precisa e mais premium';
  }
}

function getPlatformAspectRatio(platform: RemixPlatform): AspectRatio {
  if (platform === 'linkedin') {
    return '4:5';
  }

  return '9:16';
}

function sanitizeHashtag(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function buildHashtags(segment: HighlightSegment, platform: RemixPlatform): string[] {
  const base = [
    ...segment.keywords,
    formatPlatformLabel(platform),
    'clip',
  ]
    .map(sanitizeHashtag)
    .filter((value) => value.length >= 3);

  return Array.from(new Set(base))
    .slice(0, 5)
    .map((value) => `#${value}`);
}

function buildVariantHook(
  segment: HighlightSegment,
  platformRemix: PlatformRemix,
  platform: RemixPlatform
): string {
  const focusByGoal: Record<PlatformRemix['goal'], string> = {
    viral: 'isso muda o jogo',
    conversion: 'isso pode virar resultado rapido',
    authority: 'a maioria erra justamente aqui',
    engagement: 'quero ver se voce concorda com isso',
  };

  const baseHook = segment.title.replace(/[.!?]+$/g, '').trim();
  const platformLead = platform === 'linkedin'
    ? 'Insight rapido:'
    : platform === 'tiktok'
      ? 'Para tudo:'
      : platform === 'instagram_reels'
        ? 'Vale salvar isso:'
        : 'Olha isso:';

  switch (platformRemix.hookStyle) {
    case 'curiosity':
      return `${platformLead} por que ${baseHook.toLowerCase()}?`;
    case 'teaching':
      return `${platformLead} ${baseHook}. ${focusByGoal[platformRemix.goal]}.`;
    case 'story':
      return `${platformLead} o momento em que ${baseHook.toLowerCase()}.`;
    case 'bold':
    default:
      return `${platformLead} ${baseHook}.`;
  }
}

function buildAltHooks(
  segment: HighlightSegment,
  platformRemix: PlatformRemix,
  primaryHook: string
): string[] {
  if (!platformRemix.generateAltHooks) {
    return [];
  }

  const title = segment.title.replace(/[.!?]+$/g, '').trim();
  const options = [
    primaryHook,
    `O erro que quase todo mundo comete sobre ${title.toLowerCase()}.`,
    `Se voce quer ${formatGoalLabel(platformRemix.goal)}, presta atencao nisso.`,
    `Em poucos segundos voce entende por que ${title.toLowerCase()}.`,
  ];

  return Array.from(new Set(options))
    .filter(Boolean)
    .slice(0, 3);
}

function buildVariantDescription(
  segment: HighlightSegment,
  platformRemix: PlatformRemix,
  platform: RemixPlatform
): string {
  const baseDescription = (segment.description || segment.reason || '').trim();
  const platformTail: Record<RemixPlatform, string> = {
    youtube_shorts: 'Entrega contexto rapido, payoff cedo e fecha a ideia sem depender do video longo.',
    instagram_reels: 'Mantem ritmo clean, linguagem premium e alta compartilhabilidade.',
    tiktok: 'Entra direto na tensao, com leitura simples e alto potencial de scroll stop.',
    linkedin: 'Transforma o trecho em insight claro, acionavel e com tom mais profissional.',
  };

  return [baseDescription, platformTail[platform]]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function buildVariantCta(platformRemix: PlatformRemix, platform: RemixPlatform): string {
  const byGoal: Record<PlatformRemix['goal'], string> = {
    viral: 'Se isso fez sentido, salva e compartilha com quem precisa ver.',
    conversion: 'Se quiser aplicar isso no seu negocio, clica no link da bio ou chama no direct.',
    authority: 'Se voce trabalha com isso, comenta sua leitura e eu aprofundo no proximo video.',
    engagement: 'Comenta a sua opiniao e manda para alguem que vai discordar de voce.',
  };

  if (platform === 'linkedin' && platformRemix.goal === 'conversion') {
    return 'Se isso conversa com o seu contexto, me chama no inbox para aprofundar a estrategia.';
  }

  return byGoal[platformRemix.goal];
}

function buildEditingNotes(platform: RemixPlatform): string[] {
  const notes: Record<RemixPlatform, string[]> = {
    youtube_shorts: [
      'Abrir com o hook em texto nos primeiros 2 segundos.',
      'Manter cortes limpos e contexto visual minimo.',
    ],
    instagram_reels: [
      'Usar legenda mais limpa e enquadramento estavel.',
      'Privilegiar transicoes suaves e visual premium.',
    ],
    tiktok: [
      'Acelerar o primeiro corte e destacar palavras-chave.',
      'Usar texto maior e ritmo mais agressivo.',
    ],
    linkedin: [
      'Segurar um beat inicial mais calmo e texto mais discreto.',
      'Destacar insight e takeaway final na tela.',
    ],
  };

  return notes[platform];
}

function buildVariantTitle(
  segment: HighlightSegment,
  platformRemix: PlatformRemix,
  platform: RemixPlatform
): string {
  const baseTitle = segment.title.trim();
  const suffixByPlatform: Record<RemixPlatform, string> = {
    youtube_shorts: 'para Shorts',
    instagram_reels: 'para Reels',
    tiktok: 'para TikTok',
    linkedin: 'para LinkedIn',
  };

  if (platformRemix.goal === 'authority' && platform === 'linkedin') {
    return `${baseTitle}: o insight que muda a execucao`;
  }

  if (platformRemix.goal === 'conversion') {
    return `${baseTitle} que gera acao`;
  }

  return `${baseTitle} ${suffixByPlatform[platform]}`.trim();
}

function buildPlatformVariant(
  segment: HighlightSegment,
  platformRemix: PlatformRemix,
  platform: RemixPlatform
): PlatformRemixVariant {
  return {
    platform,
    aspectRatio: getPlatformAspectRatio(platform),
    hook: buildVariantHook(segment, platformRemix, platform),
    title: buildVariantTitle(segment, platformRemix, platform),
    description: buildVariantDescription(segment, platformRemix, platform),
    hashtags: buildHashtags(segment, platform),
    cta: buildVariantCta(platformRemix, platform),
    editingNotes: buildEditingNotes(platform),
  };
}

function buildClipRemixPackage(
  segment: HighlightSegment,
  platformRemix: PlatformRemix
): ClipRemixPackage {
  const platforms = Array.from(
    new Set([platformRemix.primaryPlatform, ...platformRemix.targetPlatforms])
  );
  const primaryVariant = buildPlatformVariant(segment, platformRemix, platformRemix.primaryPlatform);

  return {
    enabled: true,
    primaryPlatform: platformRemix.primaryPlatform,
    goal: platformRemix.goal,
    hookStyle: platformRemix.hookStyle,
    captionStyle: platformRemix.captionStyle,
    generateAltHooks: platformRemix.generateAltHooks,
    altHooks: buildAltHooks(segment, platformRemix, primaryVariant.hook),
    variants: platforms.map((platform) => {
      if (platform === platformRemix.primaryPlatform) {
        return primaryVariant;
      }

      return buildPlatformVariant(segment, platformRemix, platform);
    }),
  };
}

function applyPlatformRemix(
  segments: HighlightSegment[],
  platformRemix?: PlatformRemix
): HighlightSegment[] {
  if (!platformRemix?.enabled) {
    return segments;
  }

  return segments.map((segment) => ({
    ...segment,
    remixPackage: buildClipRemixPackage(segment, platformRemix),
  }));
}

function buildPlatformPlaybook(platformRemix: PlatformRemix): string {
  const primaryRules: Record<PlatformRemix['primaryPlatform'], string[]> = {
    tiktok: [
      'TikTok: abra o clipe o mais cedo possível com tensão, surpresa ou promessa muito clara.',
      'TikTok: prefira frases curtas, ritmo alto e linguagem mais coloquial.',
      'TikTok: priorize hooks que interrompem o scroll e despertam curiosidade instantânea.',
    ],
    instagram_reels: [
      'Instagram Reels: mantenha o hook forte, mas com acabamento mais clean e aspiracional.',
      'Instagram Reels: prefira linguagem mais refinada, visualmente elegante e fácil de compartilhar.',
      'Instagram Reels: títulos e descrições devem soar premium, diretos e social-first.',
    ],
    youtube_shorts: [
      'YouTube Shorts: garanta contexto rápido e payoff cedo; o clipe precisa funcionar sozinho.',
      'YouTube Shorts: priorize clareza, retenção e títulos altamente compreensíveis.',
      'YouTube Shorts: evite depender de contexto externo; o momento precisa fechar a ideia.',
    ],
    linkedin: [
      'LinkedIn: priorize credibilidade, clareza intelectual e aprendizado acionável.',
      'LinkedIn: reduza gírias, aumente o tom de autoridade e foque em insights profissionais.',
      'LinkedIn: descrições devem incentivar comentário, reflexão ou salvamento, não só entretenimento.',
    ],
  };

  return `PLAYBOOK DO REMIX POR PLATAFORMA:
- ${primaryRules[platformRemix.primaryPlatform].join('\n- ')}
- Escolha títulos, descrições e keywords que favoreçam a plataforma principal sem perder reaproveitamento nas demais.`;
}

function ensureClipCoverage(
  segments: HighlightSegment[],
  detectedScenes: DetectedScene[],
  transcript: Transcript,
  clipCount: number,
  targetDuration: number,
  minDuration: number,
  maxDuration: number
): HighlightSegment[] {
  const overlapThreshold = getCoverageOverlapThreshold(
    transcript.duration,
    clipCount,
    targetDuration,
    minDuration
  );
  let completed = dedupeSegments(
    validateSegments(segments, transcript.duration, minDuration, maxDuration),
    overlapThreshold
  );

  if (completed.length < clipCount) {
    completed = fillMissingSegmentsFromScenes(
      completed,
      detectedScenes,
      clipCount,
      overlapThreshold
    );
    completed = dedupeSegments(
      validateSegments(completed, transcript.duration, minDuration, maxDuration),
      overlapThreshold
    );
  }

  if (completed.length < clipCount) {
    completed = fillMissingSegmentsFromTranscript(
      completed,
      transcript,
      clipCount,
      targetDuration,
      minDuration,
      maxDuration,
      overlapThreshold
    );
    completed = dedupeSegments(
      validateSegments(completed, transcript.duration, minDuration, maxDuration),
      overlapThreshold
    );
  }

  if (completed.length < clipCount) {
    completed = fillMissingSegmentsWithCoveragePasses(
      completed,
      transcript,
      clipCount,
      targetDuration,
      minDuration,
      maxDuration,
      overlapThreshold
    );
  }

  return dedupeSegments(
    validateSegments(completed, transcript.duration, minDuration, maxDuration),
    overlapThreshold
  ).slice(0, clipCount);
}

function fillMissingSegmentsFromScenes(
  existingSegments: HighlightSegment[],
  scenes: DetectedScene[],
  clipCount: number,
  overlapThreshold: number
): HighlightSegment[] {
  const completed = [...existingSegments];

  for (const scene of scenes.sort((a, b) => b.confidence - a.confidence)) {
    if (completed.length >= clipCount) {
      break;
    }

    const candidate = createAutoSegmentFromScene(scene, completed.length + 1);
    if (hasHeavyOverlap(candidate, completed, overlapThreshold)) {
      continue;
    }

    completed.push(candidate);
  }

  return completed;
}

function fillMissingSegmentsFromTranscript(
  existingSegments: HighlightSegment[],
  transcript: Transcript,
  clipCount: number,
  targetDuration: number,
  minDuration: number,
  maxDuration: number,
  overlapThreshold: number
): HighlightSegment[] {
  const completed = [...existingSegments];
  const desiredDuration = Math.max(minDuration, Math.min(maxDuration, targetDuration));
  const step = Math.max(4, Math.floor(desiredDuration * 0.4));

  for (let cursor = 0; cursor < transcript.duration && completed.length < clipCount; cursor += step) {
    const start = Math.max(0, Math.min(cursor, Math.max(0, transcript.duration - desiredDuration)));
    const end = Math.min(transcript.duration, start + desiredDuration);
    const candidate = buildCoverageCandidateFromTranscriptWindow(
      transcript,
      start,
      end,
      completed.length + 1,
      'coverage_fill',
      0.42
    );

    if (!candidate || hasHeavyOverlap(candidate, completed, overlapThreshold)) {
      continue;
    }

    completed.push(candidate);
  }

  return completed;
}

function fillMissingSegmentsWithCoveragePasses(
  existingSegments: HighlightSegment[],
  transcript: Transcript,
  clipCount: number,
  targetDuration: number,
  minDuration: number,
  maxDuration: number,
  overlapThreshold: number
): HighlightSegment[] {
  let completed = [...existingSegments];
  const averageSlotDuration = transcript.duration / Math.max(1, clipCount);
  const candidateDurations = Array.from(
    new Set([
      Math.max(minDuration, Math.min(maxDuration, targetDuration)),
      Math.max(minDuration, Math.min(maxDuration, Math.floor(averageSlotDuration))),
      minDuration,
    ])
  ).sort((a, b) => a - b);

  for (const desiredDuration of candidateDurations) {
    completed = fillDistributedTranscriptCoverage(
      completed,
      transcript,
      clipCount,
      desiredDuration,
      minDuration,
      maxDuration,
      overlapThreshold
    );
    completed = dedupeSegments(
      validateSegments(completed, transcript.duration, minDuration, maxDuration),
      overlapThreshold
    );

    if (completed.length >= clipCount) {
      break;
    }
  }

  return completed;
}

function fillDistributedTranscriptCoverage(
  existingSegments: HighlightSegment[],
  transcript: Transcript,
  clipCount: number,
  desiredDuration: number,
  minDuration: number,
  maxDuration: number,
  overlapThreshold: number
): HighlightSegment[] {
  const completed = [...existingSegments];
  const safeDuration = Math.max(minDuration, Math.min(maxDuration, desiredDuration));
  const availableRange = Math.max(0, transcript.duration - safeDuration);
  const interval = clipCount <= 1 ? 0 : availableRange / Math.max(1, clipCount - 1);
  const offsets = [0, interval > 0 ? interval / 2 : 0];

  for (const offset of offsets) {
    for (let index = 0; index < clipCount && completed.length < clipCount; index += 1) {
      const rawStart = Math.min(availableRange, (index * interval) + offset);
      const start = Math.max(0, Number(rawStart.toFixed(2)));
      const end = Math.min(transcript.duration, start + safeDuration);
      const candidate = buildCoverageCandidateFromTranscriptWindow(
        transcript,
        start,
        end,
        completed.length + 1
      );

      if (!candidate || hasHeavyOverlap(candidate, completed, overlapThreshold)) {
        continue;
      }

      completed.push(candidate);
    }

    if (completed.length >= clipCount) {
      break;
    }
  }

  return completed;
}

function buildCoverageCandidateFromTranscriptWindow(
  transcript: Transcript,
  start: number,
  end: number,
  ordinal: number,
  boundaryType: string = 'distributed_fill',
  confidence: number = 0.51
): HighlightSegment | null {
  const exactSegments = transcript.segments.filter((seg) => seg.end > start && seg.start < end);
  const nearbySegments = exactSegments.length > 0
    ? exactSegments
    : transcript.segments.filter((seg) => seg.end > Math.max(0, start - 6) && seg.start < Math.min(transcript.duration, end + 6));

  if (nearbySegments.length === 0) {
    return null;
  }

  const sceneStart = Math.max(0, start);
  const sceneEnd = Math.min(transcript.duration, end);
  const duration = sceneEnd - sceneStart;

  if (duration <= 0) {
    return null;
  }

  return createAutoSegmentFromScene(
    {
      start: sceneStart,
      end: sceneEnd,
      duration,
      segments: nearbySegments,
      text: nearbySegments
        .map((seg) => {
          const safeStart = Math.max(sceneStart, seg.start);
          const safeEnd = Math.min(sceneEnd, seg.end);
          const overlap = Math.max(0, safeEnd - safeStart);
          if (overlap <= 0) {
            return '';
          }

          return seg.text;
        })
        .filter(Boolean)
        .join(' ')
        .trim(),
      confidence,
      boundaryTypes: [boundaryType],
    },
    ordinal
  );
}

function getCoverageOverlapThreshold(
  totalDuration: number,
  clipCount: number,
  targetDuration: number,
  minDuration: number
): number {
  const averageSlot = totalDuration / Math.max(1, clipCount);

  if (averageSlot <= minDuration + 2) {
    return 0.92;
  }

  if (averageSlot <= targetDuration * 0.75) {
    return 0.88;
  }

  if (averageSlot <= targetDuration) {
    return 0.82;
  }

  return 0.75;
}

function createAutoSegmentFromScene(scene: DetectedScene, ordinal: number): HighlightSegment {
  const summaryText = scene.text.trim();
  const title = buildAutoTitle(summaryText, ordinal);
  const description = buildAutoDescription(summaryText);

  return {
    start: scene.start,
    end: scene.end,
    score: Math.max(0.45, Math.min(0.89, scene.confidence)),
    title,
    description,
    reason: 'Trecho adicional selecionado automaticamente para ampliar a cobertura do vídeo.',
    keywords: extractKeywords(summaryText),
  };
}

function buildAutoTitle(text: string, ordinal: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const base = cleaned
    .split(/[.!?]/)[0]
    .split(/\s+/)
    .slice(0, 8)
    .join(' ')
    .trim();

  if (!base) {
    return `Clip extra ${ordinal}`;
  }

  const normalized = base.charAt(0).toUpperCase() + base.slice(1);
  return normalized.length > 60 ? `${normalized.slice(0, 57).trim()}...` : normalized;
}

function buildAutoDescription(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Trecho complementar detectado automaticamente para aumentar a cobertura do conteúdo.';
  }

  const summary = cleaned.split(/\s+/).slice(0, 22).join(' ');
  return summary.length > 150 ? `${summary.slice(0, 147).trim()}...` : summary;
}

function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'para', 'com', 'que', 'isso', 'essa', 'esse', 'você', 'voce', 'mas', 'uma', 'uns',
    'umas', 'dos', 'das', 'por', 'pra', 'porque', 'como', 'quando', 'onde', 'depois',
    'sobre', 'aqui', 'ali', 'tem', 'tudo', 'nada', 'muito', 'mais', 'menos', 'ser',
  ]);

  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]{4,}/g) || [];

  return Array.from(new Set(words.filter((word) => !stopwords.has(word)))).slice(0, 5);
}

function dedupeSegments(
  segments: HighlightSegment[],
  overlapThreshold: number = 0.75
): HighlightSegment[] {
  const unique: HighlightSegment[] = [];

  for (const segment of segments) {
    if (!hasHeavyOverlap(segment, unique, overlapThreshold)) {
      unique.push(segment);
    }
  }

  return unique;
}

function hasHeavyOverlap(
  candidate: HighlightSegment,
  existingSegments: HighlightSegment[],
  overlapThreshold: number = 0.75
): boolean {
  return existingSegments.some((segment) => {
    const overlapStart = Math.max(candidate.start, segment.start);
    const overlapEnd = Math.min(candidate.end, segment.end);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    if (overlap === 0) {
      return false;
    }

    const candidateDuration = Math.max(1, candidate.end - candidate.start);
    const existingDuration = Math.max(1, segment.end - segment.start);
    return overlap / candidateDuration > overlapThreshold || overlap / existingDuration > overlapThreshold;
  });
}

/**
 * Parse da resposta de ranking da IA
 */
function parseRankingResponse(responseText: string): {
  rankings: Array<{
    sceneIndex: number;
    score: number;
    title: string;
    description?: string;
    reason: string;
    keywords: string[];
  }>;
  reasoning: string;
} {
  try {
    // Remove markdown code blocks if present
    let jsonText = responseText.trim();

    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonText);

    // Validate structure
    if (!parsed.rankings || !Array.isArray(parsed.rankings)) {
      throw new Error('Invalid response structure: missing rankings array');
    }

    return {
      rankings: parsed.rankings.map((rank: any) => ({
        sceneIndex: Number(rank.sceneIndex),
        score: Number(rank.score) || 0.5,
        title: String(rank.title || 'Clip sem título'),
        description: typeof rank.description === 'string' ? rank.description : '',
        reason: String(rank.reason || ''),
        keywords: Array.isArray(rank.keywords) ? rank.keywords : [],
      })),
      reasoning: String(parsed.reasoning || ''),
    };
  } catch (error: any) {
    logger.error({ error: error.message, responseText }, 'Failed to parse ranking response');
    throw new Error(`Failed to parse ranking response: ${error.message}`);
  }
}

/**
 * Parse da resposta da IA (OpenAI GPT-4) - fallback tradicional
 */
function parseAIResponse(responseText: string): HighlightAnalysis {
  try {
    // Remove markdown code blocks if present
    let jsonText = responseText.trim();

    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonText);

    // Validate structure
    if (!parsed.segments || !Array.isArray(parsed.segments)) {
      throw new Error('Invalid response structure: missing segments array');
    }

    return {
      segments: parsed.segments.map((seg: any) => ({
        start: Number(seg.start),
        end: Number(seg.end),
        score: Number(seg.score) || 0.5,
        title: String(seg.title || 'Clip sem título'),
        description: typeof seg.description === 'string' ? seg.description : '',
        reason: String(seg.reason || ''),
        keywords: Array.isArray(seg.keywords) ? seg.keywords : [],
      })),
      reasoning: String(parsed.reasoning || ''),
    };
  } catch (error: any) {
    logger.error({ error: error.message, responseText }, 'Failed to parse AI response');
    throw new Error(`Failed to parse AI response: ${error.message}`);
  }
}

/**
 * Valida e ajusta segmentos
 */
function validateSegments(
  segments: HighlightSegment[],
  videoDuration: number,
  minDuration: number,
  maxDuration: number
): HighlightSegment[] {
  const validated: HighlightSegment[] = [];

  for (const seg of segments) {
    // Check bounds
    if (seg.start < 0 || seg.end > videoDuration || seg.start >= seg.end) {
      logger.warn({ segment: seg }, 'Segment out of bounds, skipping');
      continue;
    }

    const duration = seg.end - seg.start;

    // Check duration
    if (duration < minDuration) {
      const desiredEnd = Math.min(videoDuration, seg.start + minDuration);
      const desiredStart = Math.max(0, desiredEnd - minDuration);
      const adjustedSeg = {
        ...seg,
        start: desiredStart,
        end: desiredEnd,
      };

      if (adjustedSeg.end - adjustedSeg.start < Math.min(minDuration * 0.75, minDuration - 2)) {
        logger.warn({ segment: seg, duration }, 'Segment too short even after padding, skipping');
        continue;
      }

      logger.info({ original: seg, adjusted: adjustedSeg }, 'Segment padded to preserve clip count');
      validated.push(adjustedSeg);
      continue;
    }

    if (duration > maxDuration) {
      // Truncate to max duration (keep the beginning - where the hook is)
      const adjustedSeg = {
        ...seg,
        start: seg.start,
        end: Math.min(seg.start + maxDuration, videoDuration),
      };
      logger.info({ original: seg, adjusted: adjustedSeg }, 'Segment truncated to max duration');
      validated.push(adjustedSeg);
      continue;
    }

    validated.push(seg);
  }

  // Sort by score (highest first)
  validated.sort((a, b) => b.score - a.score);

  return validated;
}
