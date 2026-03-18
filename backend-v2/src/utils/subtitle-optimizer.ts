import type { SubtitlePreferences, TranscriptSegment } from '../types/index.js';

/**
 * Quebra de linha inteligente para legendas
 */
export function smartLineBreak(text: string, maxCharsPerLine: number): string[] {
  // Se o texto cabe em uma linha, retorna direto
  if (text.length <= maxCharsPerLine) {
    return [text];
  }

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      // Tenta quebrar em pontuação
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  // Limitar a 2 linhas
  if (lines.length > 2) {
    const half = Math.ceil(lines.length / 2);
    return [
      lines.slice(0, half).join(' '),
      lines.slice(half).join(' '),
    ];
  }

  return lines;
}

function normalizeHex(hex: string, fallback: string = '#FFFFFF'): string {
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .trim();
}

/**
 * Converte cor hex para formato ASS (&HAABBGGRR)
 */
function hexToAssColor(hex: string, opacity: number = 1): string {
  const safeHex = normalizeHex(hex);
  const r = safeHex.substring(1, 3);
  const g = safeHex.substring(3, 5);
  const b = safeHex.substring(5, 7);
  const alpha = opacityToAssAlpha(opacity);
  return `&H${alpha}${b}${g}${r}`;
}

/**
 * Converte opacidade (0-1) para alpha ASS (00-FF)
 */
function opacityToAssAlpha(opacity: number): string {
  const alpha = Math.round((1 - opacity) * 255);
  return alpha.toString(16).padStart(2, '0').toUpperCase();
}

function getSecondaryColor(preferences: SubtitlePreferences): string {
  return normalizeHex(
    preferences.highlightColor || preferences.outlineColor || preferences.shadowColor || preferences.fontColor,
    preferences.fontColor
  );
}

function getBorderStyle(preferences: SubtitlePreferences): 1 | 3 {
  return preferences.backgroundOpacity > 0.02 ? 3 : 1;
}

function buildDialogueText(
  segment: TranscriptSegment,
  start: number,
  end: number,
  preferences: SubtitlePreferences
): string {
  const safeText = escapeAssText(segment.text);
  const baseLines =
    preferences.format === 'single-line'
      ? [safeText.replace(/\s+/g, ' ').trim()]
      : smartLineBreak(safeText, preferences.maxCharsPerLine);
  const baseText = baseLines.join('\\N');

  if (preferences.format === 'karaoke') {
    const words = safeText.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return baseText;
    }

    const totalCentiseconds = Math.max(20, Math.round((end - start) * 100));
    const baseUnit = Math.max(8, Math.floor(totalCentiseconds / words.length));
    let remaining = totalCentiseconds - baseUnit * words.length;

    return words
      .map((word) => {
        const extra = remaining > 0 ? 1 : 0;
        remaining -= extra;
        return `{\\kf${baseUnit + extra}}${word}`;
      })
      .join(' ');
  }

  if (preferences.format === 'progressive') {
    return `{\\fad(120,140)\\blur0.6}${baseText}`;
  }

  return baseText;
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
 * Resolução de referência ASS por formato de vídeo
 */
function getAssPlayRes(format: string): { x: number; y: number } {
  switch (format) {
    case '9:16':
      return { x: 720, y: 1280 };
    case '1:1':
      return { x: 1080, y: 1080 };
    case '4:5':
      return { x: 1080, y: 1350 };
    case '16:9':
      return { x: 1920, y: 1080 };
    default:
      return { x: 720, y: 1280 };
  }
}

/**
 * Multiplier de font size por formato — legendas maiores em telas mais largas
 */
function getFontScaleForFormat(format: string): number {
  switch (format) {
    case '9:16':
      return 1.0;     // base — otimizado para mobile vertical
    case '1:1':
      return 1.35;    // quadrado precisa de fonte maior
    case '4:5':
      return 1.2;     // levemente maior que 9:16
    case '16:9':
      return 1.6;     // horizontal precisa de fonte bem maior
    default:
      return 1.0;
  }
}

/**
 * Gera arquivo ASS (Advanced SubStation Alpha) com estilos personalizados
 */
export function generateASS(
  segments: TranscriptSegment[],
  startOffset: number,
  preferences: SubtitlePreferences,
  format: string = '9:16'
): string {
  const {
    font,
    fontSize,
    fontColor,
    highlightColor,
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
    maxCharsPerLine,
  } = preferences;

  const playRes = getAssPlayRes(format);
  const fontScale = getFontScaleForFormat(format);
  const scaledFontSize = Math.round(fontSize * fontScale);

  // Margin e outline escalados proporcionalmente
  const scaledMarginV = Math.round(preferences.marginVertical * (playRes.y / 1280));
  const scaledMarginH = Math.round(30 * (playRes.x / 720));
  const scaledOutlineWidth = Math.round(outlineWidth * fontScale);
  const borderStyle = getBorderStyle(preferences);
  const primaryColor = hexToAssColor(fontColor, 1);
  const secondaryColor = hexToAssColor(getSecondaryColor(preferences), 1);
  const outlineColorAss = hexToAssColor(outlineColor, 1);
  const backColorAss = borderStyle === 3
    ? hexToAssColor(backgroundColor, backgroundOpacity)
    : hexToAssColor(shadow ? shadowColor : backgroundColor, shadow ? 0.55 : 0);
  const shadowDepth = shadow ? Math.max(1, Math.round(fontScale * 2)) : 0;
  const outlineDepth = outline ? Math.max(1, scaledOutlineWidth) : 0;

  const header = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: ${playRes.x}
PlayResY: ${playRes.y}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${scaledFontSize},${primaryColor},${secondaryColor},${outlineColorAss},${backColorAss},${bold ? '-1' : '0'},${italic ? '-1' : '0'},0,0,100,100,0,0,${borderStyle},${outlineDepth},${shadowDepth},${getAssAlignment(position)},${scaledMarginH},${scaledMarginH},${scaledMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Generate dialogue lines
  const dialogues = segments
    .map((seg, idx) => {
      const start = Math.max(0, seg.start - startOffset);
      const end = Math.max(0, seg.end - startOffset);

      const formattedText = buildDialogueText(seg, start, end, {
        ...preferences,
        maxCharsPerLine,
        fontColor,
        highlightColor,
      });

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
 */
export function adjustFontSize(
  text: string,
  duration: number,
  baseFontSize: number
): number {
  const charCount = text.length;
  const charsPerSecond = charCount / duration;

  // Se muito texto em pouco tempo, reduzir fonte LEVEMENTE
  if (charsPerSecond > 20) {
    return Math.max(26, baseFontSize - 2);  // Mínimo 26px, reduz apenas 2px
  }

  // Se pouco texto, pode aumentar um pouco
  if (charsPerSecond < 5) {
    return Math.min(40, baseFontSize + 4);  // Máximo 40px
  }

  // Na maioria dos casos, manter o tamanho base
  return baseFontSize;
}

/**
 * Valida se as preferências de legenda estão corretas
 */
export function validateSubtitlePreferences(
  preferences: Partial<SubtitlePreferences>
): boolean {
  // Validações básicas
  if (preferences.fontSize && (preferences.fontSize < 16 || preferences.fontSize > 48)) {
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
