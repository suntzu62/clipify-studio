export interface Segment {
  start: number;
  end: number;
  text: string;
}

function toAssTime(t: number): string {
  const hours = Math.floor(t / 3600);
  const minutes = Math.floor((t % 3600) / 60);
  const seconds = Math.floor(t % 60);
  const centiseconds = Math.floor(((t % 1) * 100));
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

export function buildASS({
  segments,
  start,
  end,
  font = 'Inter',
  marginV = 60,
}: {
  segments: Segment[];
  start: number;
  end: number;
  font?: string;
  marginV?: number;
}): string {
  const header = `[Script Info]\n` +
    `ScriptType: v4.00+\n` +
    `PlayResX: 1080\n` +
    `PlayResY: 1920\n` +
    `ScaledBorderAndShadow: yes\n` +
    `WrapStyle: 2\n` +
    `YCbCr Matrix: TV.601\n` +
    `\n` +
    `[V4+ Styles]\n` +
    `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
    // PrimaryColour &H00FFFFFF& = white; OutlineColour &H00000000& = black; Alignment=2 bottom-center
    `Style: Default,${font},48,&H00FFFFFF&,&H00FFFFFF&,&H00000000&,&H00000000&,0,0,0,0,100,100,0,0,1,2,0,2,60,60,${marginV},0\n` +
    `\n` +
    `[Events]\n` +
    `Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

  const overlapStart = Math.max(0, start);
  const overlapEnd = end;

  const lines = segments
    .filter((s) => Math.max(s.start, overlapStart) < Math.min(s.end, overlapEnd))
    .map((s) => ({
      start: Math.max(0, s.start - start),
      end: Math.max(0.01, Math.min(s.end, end) - start),
      text: s.text.trim().replace(/\r?\n/g, '\\N'),
    }))
    .sort((a, b) => a.start - b.start)
    .map((s) => `Dialogue: 0,${toAssTime(s.start)},${toAssTime(s.end)},Default,,0,0,${marginV},,${s.text}`)
    .join('\n');

  return `${header}${lines}\n`;
}

