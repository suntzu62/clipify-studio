import type { SubtitlePreferences, TranscriptSegment } from '../types/index.js';
import { createLogger } from '../config/logger.js';

const subtitleLogger = createLogger('subtitle-optimizer');

const DEFAULT_SCRIPT_WIDTH = 1080;
const DEFAULT_SCRIPT_HEIGHT = 1920;
const SIDE_MARGIN = 60; // Margem lateral aumentada para evitar corte nas bordas (era 24)
const ABSOLUTE_MIN_FONT = 48;
const ABSOLUTE_MAX_FONT = 120;
const MAX_LINES = 2; // Reduzido para 2 linhas (estilo Opus Clip - mais legível)
const AVG_CHAR_WIDTH_RATIO = 0.52; // Ajustado para melhor precisão na largura do texto

const DEBUG_SUBTITLES = process.env.SUBTITLE_DEBUG === 'true';

const CONNECTOR_WORDS = new Set([
  // Conjunções / preposições / artigos comuns (pt)
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'pra', 'com', 'sem', 'sobre',
  'e', 'ou', 'mas', 'que', 'se', 'ao', 'à', 'aos', 'às',
]);

// Conectores que indicam continuação (usado para "colar" segmentos quebrados).
// Evite artigos no início ("o", "a") pois isso causa merges errados em captions incrementais do YouTube.
const CONTINUATION_WORDS = new Set([
  'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'pra', 'com', 'sem', 'sobre',
  'e', 'ou', 'mas', 'que', 'se', 'ao', 'à', 'aos', 'às',
]);

function normalizeCaptionText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function extractFirstWord(text: string): string | null {
  const match = normalizeCaptionText(text).match(/^([^\s]+)/);
  return match?.[1]?.toLowerCase() ?? null;
}

function extractLastWord(text: string): string | null {
  const cleaned = normalizeCaptionText(text);
  const match = cleaned.match(/([^\s]+)$/);
  return match?.[1]?.toLowerCase() ?? null;
}

function stripPunctuationEdges(word: string): string {
  return word.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '').toLowerCase();
}

function looksLikeSentenceEnd(text: string): boolean {
  return /[.!?…]$/.test(normalizeCaptionText(text));
}

function looksLikeLowercaseStart(text: string): boolean {
  const cleaned = normalizeCaptionText(text);
  return /^[a-zà-ÿ]/.test(cleaned);
}

function shouldMergeForReadability(prev: TranscriptSegment, next: TranscriptSegment): boolean {
  const gap = next.start - prev.end;
  if (gap > 0.25) return false;

  // Avoid creating very long merged segments; we can split later, but keep it bounded.
  const mergedDuration = next.end - prev.start;
  if (mergedDuration > 8) return false;

  // Avoid concatenating incremental captions (common in YouTube VTT) — they often
  // repeat a growing prefix. Concatenation would create duplicated phrases.
  const prevLower = normalizeCaptionText(prev.text).toLowerCase();
  const nextLower = normalizeCaptionText(next.text).toLowerCase();
  if (prevLower && nextLower) {
    if (prevLower.includes(nextLower) || nextLower.includes(prevLower)) {
      return false;
    }
  }

  // Only merge when at least one of the cues is "too short" to stand on its own.
  // This prevents creating duplicated phrases from overlapping/incremental captions.
  const prevDuration = prev.end - prev.start;
  const nextDuration = next.end - next.start;
  const hasShortCue = prevDuration < 1.2 || nextDuration < 1.2 || prevLower.length < 24 || nextLower.length < 24;
  if (!hasShortCue) return false;

  const prevLast = extractLastWord(prev.text);
  const nextFirst = extractFirstWord(next.text);
  const prevLastCore = prevLast ? stripPunctuationEdges(prevLast) : null;
  const nextFirstCore = nextFirst ? stripPunctuationEdges(nextFirst) : null;

  const prevEndsConnector = !!prevLastCore && CONTINUATION_WORDS.has(prevLastCore);
  const nextStartsConnector = !!nextFirstCore && CONTINUATION_WORDS.has(nextFirstCore);

  if (prevEndsConnector || nextStartsConnector) return true;

  return false;
}

function mergeContinuationSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const sorted = [...segments]
    .map((seg) => ({ ...seg, text: normalizeCaptionText(seg.text) }))
    .filter((seg) => seg.text.length > 0)
    // Ultra-short cues (e.g. 0.01s) are usually duplicates/artifacts in VTT; remove them.
    .filter((seg) => (seg.end - seg.start) >= 0.08)
    .sort((a, b) => a.start - b.start);

  const merged: TranscriptSegment[] = [];
  for (const seg of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && shouldMergeForReadability(prev, seg)) {
      prev.text = normalizeCaptionText(`${prev.text} ${seg.text}`);
      prev.end = Math.max(prev.end, seg.end);
      continue;
    }
    merged.push({ ...seg });
  }

  return merged;
}

function commonPrefixLength(a: string[], b: string[]): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  for (; i < max; i += 1) {
    if (!a[i] || !b[i] || a[i] !== b[i]) break;
  }
  return i;
}

function commonSuffixPrefixLength(prev: string[], curr: string[]): number {
  const max = Math.min(prev.length, curr.length);
  for (let len = max; len >= 1; len -= 1) {
    let match = true;
    for (let i = 0; i < len; i += 1) {
      if (prev[prev.length - len + i] !== curr[i]) {
        match = false;
        break;
      }
    }
    if (match) return len;
  }
  return 0;
}

function dedupeIncrementalCaptions(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];

  for (const seg of segments) {
    const currentText = normalizeCaptionText(seg.text);
    if (!currentText) continue;

    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...seg, text: currentText });
      continue;
    }

    // Merge exact duplicates that touch/overlap
    const gap = seg.start - prev.end;
    if (gap <= 0.12 && normalizeCaptionText(prev.text) === currentText) {
      prev.end = Math.max(prev.end, seg.end);
      continue;
    }

    // YouTube captions often repeat a growing prefix (incremental captions).
    // If current starts with most of previous, keep only the "new tail".
    if (gap <= 0.35) {
      const prevWords = normalizeCaptionText(prev.text).split(/\s+/).filter(Boolean);
      const currWords = currentText.split(/\s+/).filter(Boolean);
      const prevNorm = prevWords.map((w) => stripPunctuationEdges(w)).filter(Boolean);
      const currNorm = currWords.map((w) => stripPunctuationEdges(w)).filter(Boolean);

      const prefixLen = commonPrefixLength(prevNorm, currNorm);
      const overlapRatio = prevNorm.length ? prefixLen / prevNorm.length : 0;

      if (prefixLen >= 3 && overlapRatio >= 0.65) {
        const tail = normalizeCaptionText(currWords.slice(prefixLen).join(' '));
        // If the tail is too short, skip it to avoid "flicker".
        const tailWordCount = tail ? tail.split(/\s+/).filter(Boolean).length : 0;
        if (tail && (tailWordCount >= 2 || tail.length >= 10)) {
          out.push({ ...seg, text: tail });
          continue;
        }
      }

      // Also handle "sliding window" captions that repeat the end of the previous cue
      // as the beginning of the next cue (common in YouTube auto-captions).
      const suffixPrefixLen = commonSuffixPrefixLength(prevNorm, currNorm);
      const suffixPrefixRatio = currNorm.length ? suffixPrefixLen / currNorm.length : 0;
      if (suffixPrefixLen >= 3 && suffixPrefixRatio >= 0.5) {
        const tail = normalizeCaptionText(currWords.slice(suffixPrefixLen).join(' '));
        const tailWordCount = tail ? tail.split(/\s+/).filter(Boolean).length : 0;
        if (tail && (tailWordCount >= 2 || tail.length >= 10)) {
          out.push({ ...seg, text: tail });
          continue;
        }
      }
    }

    out.push({ ...seg, text: currentText });
  }

  return out;
}

function splitSegmentForReadability(
  segment: TranscriptSegment,
  options: {
    maxCharsPerCue: number;
    targetWordsPerCue: number;
    minCueDuration: number;
  }
): TranscriptSegment[] {
  const text = normalizeCaptionText(segment.text);
  const words = text.split(/\s+/).filter(Boolean);
  const duration = Math.max(0, segment.end - segment.start);

  if (words.length === 0 || duration <= 0) {
    return [];
  }

  const desiredByWords = Math.ceil(words.length / options.targetWordsPerCue);
  const desiredByChars = Math.ceil(text.length / options.maxCharsPerCue);
  const desiredChunks = Math.max(desiredByWords, desiredByChars);

  const maxChunksByDuration = Math.max(1, Math.floor(duration / options.minCueDuration));
  const chunkCount = Math.min(desiredChunks, maxChunksByDuration);

  if (chunkCount <= 1) {
    return [{ ...segment, text }];
  }

  // Distribute words as evenly as possible across chunks
  const base = Math.floor(words.length / chunkCount);
  const remainder = words.length % chunkCount;
  const sizes = Array.from({ length: chunkCount }, (_, i) => base + (i < remainder ? 1 : 0));

  // Avoid ending a cue with connector words when possible (move them to next chunk)
  for (let i = 0; i < sizes.length - 1; i += 1) {
    if (sizes[i] <= 1) continue;
    const boundaryIndex = sizes.slice(0, i + 1).reduce((acc, v) => acc + v, 0);
    const endWord = stripPunctuationEdges(words[boundaryIndex - 1] ?? '');
    if (endWord && CONNECTOR_WORDS.has(endWord)) {
      sizes[i] -= 1;
      sizes[i + 1] += 1;
    }
  }

  // Build chunks
  const chunks: Array<{ words: string[]; wordCount: number }> = [];
  let cursor = 0;
  for (let i = 0; i < sizes.length; i += 1) {
    const size = sizes[i];
    const chunkWords = words.slice(cursor, cursor + size);
    cursor += size;
    if (chunkWords.length === 0) continue;
    chunks.push({ words: chunkWords, wordCount: chunkWords.length });
  }

  // Convert chunks into timed segments (duration proportional to word count)
  const totalWords = chunks.reduce((acc, c) => acc + c.wordCount, 0) || 1;
  const out: TranscriptSegment[] = [];

  let start = segment.start;
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const isLast = i === chunks.length - 1;
    const frac = chunk.wordCount / totalWords;
    const end = isLast ? segment.end : start + duration * frac;

    out.push({
      start,
      end,
      text: normalizeCaptionText(chunk.words.join(' ')),
    });

    start = end;
  }

  return out;
}

function optimizeSegmentsForSubtitles(
  segments: TranscriptSegment[],
  preferences: SubtitlePreferences
): TranscriptSegment[] {
  const merged = mergeContinuationSegments(segments);
  const deduped = dedupeIncrementalCaptions(merged);

  const maxCharsPerLine = preferences.maxCharsPerLine || 28;
  const maxCharsPerCue = Math.max(24, maxCharsPerLine * MAX_LINES);

  const targetWordsPerCue = 6;
  const minCueDuration = 0.5; // lower = more "viral" (shorter phrases) while still readable

  const optimized: TranscriptSegment[] = [];
  for (const seg of deduped) {
    optimized.push(
      ...splitSegmentForReadability(seg, {
        maxCharsPerCue,
        targetWordsPerCue,
        minCueDuration,
      })
    );
  }

  return optimized.filter((s) => s.text.trim().length > 0 && s.end > s.start);
}

/**
 * Quebra de linha inteligente para legendas
 * Garante linhas curtas que cabem na largura disponível sem dividir palavras
 */
export function smartLineBreak(text: string, maxCharsPerLine: number, maxLines: number = MAX_LINES): string[] {
  const cleanText = normalizeCaptionText(text);

  if (!cleanText) {
    return [];
  }

  const words = cleanText.split(' ');

  // Best-effort balanced split for 2 lines (most common)
  if (maxLines === 2 && words.length >= 2) {
    const BAD_END_WORDS = CONNECTOR_WORDS;
    let best: { lines: string[]; score: number } | null = null;

    for (let splitIdx = 1; splitIdx < words.length; splitIdx += 1) {
      const l1 = words.slice(0, splitIdx).join(' ');
      const l2 = words.slice(splitIdx).join(' ');

      if (l1.length > maxCharsPerLine || l2.length > maxCharsPerLine) continue;

      const end1 = stripPunctuationEdges(words[splitIdx - 1] ?? '');
      const start2 = stripPunctuationEdges(words[splitIdx] ?? '');

      // Lower score is better: minimize the longest line; penalize ugly breaks.
      const maxLen = Math.max(l1.length, l2.length);
      const imbalance = Math.abs(l1.length - l2.length) * 0.15;
      const badEndPenalty = end1 && BAD_END_WORDS.has(end1) ? 8 : 0;
      const badStartPenalty = start2 && BAD_END_WORDS.has(start2) ? 4 : 0;

      const score = maxLen + imbalance + badEndPenalty + badStartPenalty;

      if (!best || score < best.score) {
        best = { lines: [l1, l2], score };
      }
    }

    if (best) {
      return best.lines;
    }
  }

  // Greedy wrapping (can exceed maxLines when necessary; caller can shrink font to fit)
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (!currentLine || candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
      continue;
    }
    lines.push(currentLine);
    currentLine = word;
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Calcula a largura útil para o texto considerando margens e padding da caixa
 */
function getUsableWidth(boxPadding: number, scriptWidth: number = DEFAULT_SCRIPT_WIDTH): number {
  return scriptWidth - (SIDE_MARGIN * 2) - (boxPadding * 2);
}

/**
 * Define limites dinâmicos para o tamanho da fonte respeitando o valor escolhido pelo usuário
 */
function clampFontSize(fontSize: number, baseFontSize: number): number {
  const minSize = Math.max(ABSOLUTE_MIN_FONT, Math.round(baseFontSize * 0.65));
  const desiredMax = Math.min(ABSOLUTE_MAX_FONT, Math.round(baseFontSize * 1.05));
  const maxSize = Math.max(minSize, desiredMax);
  return Math.min(maxSize, Math.max(minSize, Math.round(fontSize)));
}

/**
 * Estima o número máximo de caracteres por linha com base na largura disponível
 */
function getMaxCharsForWidth(
  fontSize: number,
  usableWidth: number,
  maxCharsPreference?: number
): number {
  const estimatedCharWidth = fontSize * AVG_CHAR_WIDTH_RATIO;
  const estimatedMaxChars = Math.floor(usableWidth / estimatedCharWidth);
  const safeChars = Math.max(12, estimatedMaxChars);

  if (maxCharsPreference) {
    return Math.max(12, Math.min(safeChars, maxCharsPreference));
  }

  return safeChars;
}

/**
 * Prepara linhas e tamanho de fonte para caber na largura do vídeo sem truncar
 */
function layoutSubtitleText(
  text: string,
  baseFontSize: number,
  boxPadding: number,
  maxCharsPreference?: number,
  scriptWidth: number = DEFAULT_SCRIPT_WIDTH
) {
  const usableWidth = getUsableWidth(boxPadding, scriptWidth);
  let fontSize = clampFontSize(baseFontSize, baseFontSize);
  let lines: string[] = [];
  let maxCharsPerLine = 0;

  for (let i = 0; i < 6; i++) {
    const preferredMaxChars = getMaxCharsForWidth(fontSize, usableWidth, maxCharsPreference);
    maxCharsPerLine = preferredMaxChars;
    lines = smartLineBreak(text, maxCharsPerLine, MAX_LINES);

    // If it doesn't fit in MAX_LINES, relax maxCharsPreference (soft cap) to avoid
    // an extra wrapped line. This keeps the subtitle visually "cleaner".
    if (maxCharsPreference && lines.length > MAX_LINES) {
      const uncappedMaxChars = getMaxCharsForWidth(fontSize, usableWidth, undefined);
      if (uncappedMaxChars > preferredMaxChars) {
        const uncappedLines = smartLineBreak(text, uncappedMaxChars, MAX_LINES);
        if (uncappedLines.length <= MAX_LINES) {
          maxCharsPerLine = uncappedMaxChars;
          lines = uncappedLines;
        }
      }
    }

    const widths = lines.length
      ? lines.map((line) => line.length * fontSize * AVG_CHAR_WIDTH_RATIO)
      : [0];
    const fitsWidth = Math.max(...widths) <= usableWidth;
    const fitsLineCount = lines.length <= MAX_LINES;

    if (fitsWidth && fitsLineCount) {
      break;
    }

    const nextFontSize = clampFontSize(fontSize - 6, baseFontSize);

    if (nextFontSize === fontSize) {
      break;
    }

    fontSize = nextFontSize;
  }

  return { lines, fontSize, maxCharsPerLine };
}

/**
 * Converte cor hex para formato ASS (&HAABBGGRR)
 */
function hexToAssColor(hex: string, opacity: number = 1): string {
  const r = hex.substring(1, 3);
  const g = hex.substring(3, 5);
  const b = hex.substring(5, 7);
  const alpha = opacityToAssAlpha(opacity); // 00 = opaco, FF = transparente
  return `&H${alpha}${b}${g}${r}`;
}

/**
 * Converte opacidade (0-1) para alpha ASS (00-FF)
 */
function opacityToAssAlpha(opacity: number): string {
  const clamped = Math.min(1, Math.max(0, opacity));
  const alpha = Math.round((1 - clamped) * 255);
  return alpha.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Obtém alinhamento para ASS baseado na posição
 */
function getAssAlignment(position: SubtitlePreferences['position']): number {
  // ASS alignment numpad:
  // 7 8 9 (top)
  // 4 5 6 (middle)
  // 1 2 3 (bottom)
  switch (position) {
    case 'top':
      return 8; // Top center
    case 'center':
      return 5; // Middle center
    case 'bottom':
    default:
      return 2; // Bottom center
  }
}

/**
 * Gera arquivo ASS (Advanced SubStation Alpha) com estilos personalizados
 * Com quebra de linha curta e ajuste dinâmico de fonte para não truncar
 */
export function generateASS(
  segments: TranscriptSegment[],
  startOffset: number,
  preferences: SubtitlePreferences,
  resolution?: { width: number; height: number }
): string {
  const SCRIPT_WIDTH = resolution?.width ?? DEFAULT_SCRIPT_WIDTH;
  const SCRIPT_HEIGHT = resolution?.height ?? DEFAULT_SCRIPT_HEIGHT;

  const optimizedSegments = optimizeSegmentsForSubtitles(segments, preferences);

  if (DEBUG_SUBTITLES) {
    subtitleLogger.debug({
      segmentsInput: segments.length,
      segmentsOptimized: optimizedSegments.length,
      resolution: `${SCRIPT_WIDTH}x${SCRIPT_HEIGHT}`,
      maxCharsPerLine: preferences.maxCharsPerLine,
    }, 'generateASS layout adjusted');
  }

  const {
    font,
    fontSize,
    fontColor,
    backgroundColor,
    backgroundOpacity,
    bold,
    italic,
    outline,
    outlineColor,
    outlineWidth,
    shadow,
    shadowColor,
    position,
    letterSpacing = 0,
    shadowOffsetX = 0,
    shadowOffsetY = 0,
    marginBottom,
    marginTop,
    textAlign,
    highlightKeywords = false,
    highlightColor,
    highlightStyle,
  } = preferences;

  // ASS Header - Resolução dinâmica baseada no formato do vídeo final
  // BorderStyle: 3 = caixa opaca (melhor legibilidade)
  // BorderStyle: 1 = outline (stroke)
  const borderStyle = backgroundOpacity >= 0.9 ? '3' : (outline ? '1' : '0');
  const boxPadding = borderStyle === '3' ? 12 : (outline ? outlineWidth : 0); // Padding interno para manter a caixa compacta

  // Calcular margem vertical baseada em marginBottom/marginTop ou fallback para marginVertical
  const verticalMargin = marginBottom ?? marginTop ?? preferences.marginVertical;

  // Shadow offset (ASS usa offset combinado)
  const shadowOffset = shadow ? Math.max(Math.abs(shadowOffsetX), Math.abs(shadowOffsetY)) : 0;

  const backColour = borderStyle === '3'
    ? hexToAssColor(backgroundColor, backgroundOpacity)
    : (shadow ? hexToAssColor(shadowColor) : hexToAssColor(backgroundColor, backgroundOpacity));

  const header = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
WrapStyle: 2
PlayResX: ${SCRIPT_WIDTH}
PlayResY: ${SCRIPT_HEIGHT}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${fontSize},${hexToAssColor(fontColor)},${hexToAssColor(fontColor)},${hexToAssColor(outlineColor)},${backColour},${bold ? '-1' : '0'},${italic ? '-1' : '0'},0,0,100,100,${letterSpacing},0,${borderStyle},${boxPadding},${shadowOffset},${getAssAlignment(position)},${SIDE_MARGIN},${SIDE_MARGIN},${verticalMargin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  /**
   * Aplica destaque de palavras-chave (keyword highlighting) no texto
   * Detecta palavras importantes e aplica efeitos visuais
   */
  function applyKeywordHighlighting(text: string): string {
    if (!highlightKeywords || !highlightColor) {
      return text;
    }

    // Lista de palavras-chave comuns em legendas virais (português e inglês)
    const VIRAL_KEYWORDS = [
      // Números e quantidades
      'milhão', 'milhões', 'bilhão', 'bilhões', 'million', 'billion',
      'mil', 'thousand', '100%', 'zero',
      // Intensificadores
      'nunca', 'never', 'sempre', 'always', 'todo', 'every', 'all',
      'muito', 'super', 'mega', 'ultra', 'insane', 'crazy',
      // Tempo
      'agora', 'now', 'hoje', 'today', 'amanhã', 'tomorrow',
      'primeiro', 'first', 'último', 'last', 'novo', 'new',
      // Ação/Urgência
      'rápido', 'fast', 'quick', 'urgente', 'urgent',
      'grátis', 'free', 'exclusivo', 'exclusive',
      // Emoção
      'incrível', 'amazing', 'inacreditável', 'unbelievable',
      'chocante', 'shocking', 'surpreendente', 'surprising',
    ];

    let highlightedText = text;

    // Detectar keywords no texto
    VIRAL_KEYWORDS.forEach(keyword => {
      const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
      const matches = text.match(regex);

      if (matches) {
        matches.forEach(match => {
          let replacement = '';

          switch (highlightStyle) {
            case 'color':
              // Mudar cor da palavra
              replacement = `{\\c${hexToAssColor(highlightColor)}&}${match}{\\c${hexToAssColor(fontColor)}&}`;
              break;

            case 'background':
              // Destacar fundo da palavra (usando borda)
              replacement = `{\\3c${hexToAssColor(highlightColor)}&}${match}{\\3c${hexToAssColor(outlineColor)}&}`;
              break;

            case 'bold':
              // Deixar palavra em negrito (se ainda não estiver)
              replacement = `{\\b1}${match}{\\b0}`;
              break;

            default:
              replacement = match;
          }

          // Replace case-insensitive
          const matchRegex = new RegExp(`\\b${match}\\b`, 'g');
          highlightedText = highlightedText.replace(matchRegex, replacement);
        });
      }
    });

    return highlightedText;
  }

  // Generate dialogue lines
  const dialogues = optimizedSegments
    .map((seg) => {
      const start = Math.max(0, seg.start - startOffset);
      const end = Math.max(0, seg.end - startOffset);

      const cleanText = seg.text.trim();
      const { lines, fontSize: dynamicFontSize, maxCharsPerLine } = layoutSubtitleText(
        cleanText,
        fontSize,
        boxPadding,
        preferences.maxCharsPerLine,
        SCRIPT_WIDTH
      );

      const text = lines.join('\\N'); // \N é quebra de linha ASS

      if (DEBUG_SUBTITLES) {
        subtitleLogger.debug({
          text: cleanText.substring(0, 60),
          lines: lines.length,
          maxChars: maxCharsPerLine,
          fontSize: dynamicFontSize,
        }, 'generateASS segment');
      }

      // Apply keyword highlighting before formatting
      const highlightedText = applyKeywordHighlighting(text);

      // Format effects COM fontSize dinâmico
      let formattedText = highlightedText;

      if (preferences.format === 'karaoke') {
        // Add karaoke timing tags
        const words = seg.text.trim().split(' ');
        const duration = end - start;
        const timePerWord = (duration / words.length) * 100; // centiseconds

        formattedText = words
          .map((word) => `{\\k${Math.round(timePerWord)}}${word}`)
          .join(' ');
        formattedText = `{\\fs${dynamicFontSize}}${formattedText}`; // fontSize dinâmico
      } else if (preferences.format === 'progressive') {
        // Add fade-in effect
        formattedText = `{\\fs${dynamicFontSize}\\fad(200,200)}${highlightedText}`; // fontSize + fade
      } else {
        // Add subtle fade for clean Vizard-style (150ms fade in/out)
        formattedText = `{\\fs${dynamicFontSize}\\fad(150,150)}${highlightedText}`; // fontSize + fade
      }

      return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${formattedText}`;
    })
    .join('\n');

  return header + dialogues;
}

/**
 * Formata tempo para ASS (H:MM:SS.CC)
 */
function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);

  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Ajusta tamanho da fonte baseado na duração e quantidade de texto
 * Mantém legibilidade sem deixar a legenda estourar visualmente
 */
export function adjustFontSize(
  text: string,
  duration: number,
  baseFontSize: number
): number {
  if (!duration || duration <= 0) {
    return clampFontSize(baseFontSize, baseFontSize);
  }

  const charCount = text.length;
  const charsPerSecond = charCount / duration;
  let adjusted = baseFontSize;

  if (charsPerSecond > 24) {
    adjusted -= 10;
  } else if (charsPerSecond > 18) {
    adjusted -= 6;
  } else if (charsPerSecond < 8) {
    adjusted += 4;
  }

  return clampFontSize(adjusted, baseFontSize);
}

/**
 * Valida se as preferências de legenda estão corretas
 */
export function validateSubtitlePreferences(
  preferences: Partial<SubtitlePreferences>
): boolean {
  // Validações básicas
  if (preferences.fontSize && (preferences.fontSize < 16 || preferences.fontSize > 120)) {
    return false;
  }

  if (preferences.backgroundOpacity && (preferences.backgroundOpacity < 0 || preferences.backgroundOpacity > 1)) {
    return false;
  }

  if (preferences.outlineWidth && (preferences.outlineWidth < 1 || preferences.outlineWidth > 5)) {
    return false;
  }

  if (preferences.maxCharsPerLine && (preferences.maxCharsPerLine < 20 || preferences.maxCharsPerLine > 60)) {
    return false;
  }

  return true;
}
