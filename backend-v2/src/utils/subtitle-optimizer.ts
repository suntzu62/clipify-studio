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

/**
 * Converte cor hex para formato ASS (&HAABBGGRR)
 */
function hexToAssColor(hex: string): string {
  const r = hex.substring(1, 3);
  const g = hex.substring(3, 5);
  const b = hex.substring(5, 7);
  return `&H00${b}${g}${r}`;
}

/**
 * Converte opacidade (0-1) para alpha ASS (00-FF)
 */
function opacityToAssAlpha(opacity: number): string {
  const alpha = Math.round((1 - opacity) * 255);
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
 */
export function generateASS(
  segments: TranscriptSegment[],
  startOffset: number,
  preferences: SubtitlePreferences
): string {
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
    maxCharsPerLine,
  } = preferences;

  // ASS Header
  const header = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${fontSize},${hexToAssColor(fontColor)},${hexToAssColor(fontColor)},${hexToAssColor(outlineColor)},${hexToAssColor(backgroundColor)}${opacityToAssAlpha(backgroundOpacity)},${bold ? '-1' : '0'},${italic ? '-1' : '0'},0,0,100,100,0,0,${outline ? '1' : '0'},${outline ? outlineWidth : '0'},${shadow ? '1' : '0'},${getAssAlignment(position)},10,10,${preferences.marginVertical},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Generate dialogue lines
  const dialogues = segments
    .map((seg, idx) => {
      const start = Math.max(0, seg.start - startOffset);
      const end = Math.max(0, seg.end - startOffset);

      // Apply smart line break
      const lines = smartLineBreak(seg.text.trim(), maxCharsPerLine);
      const text = lines.join('\\N'); // \N is ASS line break

      // Format karaoke effect if needed
      let formattedText = text;
      if (preferences.format === 'karaoke') {
        // Add karaoke timing tags
        const words = seg.text.trim().split(' ');
        const duration = end - start;
        const timePerWord = (duration / words.length) * 100; // centiseconds

        formattedText = words
          .map((word) => `{\\k${Math.round(timePerWord)}}${word}`)
          .join(' ');
      } else if (preferences.format === 'progressive') {
        // Add fade-in effect
        formattedText = `{\\fad(200,200)}${text}`;
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
 */
export function adjustFontSize(
  text: string,
  duration: number,
  baseFontSize: number
): number {
  const charCount = text.length;
  const charsPerSecond = charCount / duration;

  // Se muito texto em pouco tempo, reduzir fonte
  if (charsPerSecond > 15) {
    return Math.max(16, baseFontSize - 4);
  }

  // Se pouco texto, pode aumentar um pouco
  if (charsPerSecond < 5) {
    return Math.min(48, baseFontSize + 2);
  }

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
