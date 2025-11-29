import { Card } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import type { SubtitlePreferences } from './SubtitleCustomizer';

interface SubtitlePreviewProps {
  preferences: SubtitlePreferences;
  sampleText?: string;
  thumbnailUrl?: string;
}

export const SubtitlePreview = ({
  preferences,
  sampleText = 'Esta é uma prévia das suas legendas personalizadas',
  thumbnailUrl,
}: SubtitlePreviewProps) => {
  console.log('[SubtitlePreview] Renderizando com preferências:', preferences);
  const getVerticalPosition = () => {
    switch (preferences.position) {
      case 'top':
        return `${preferences.marginVertical}px`;
      case 'center':
        return '50%';
      case 'bottom':
        return `calc(100% - ${preferences.marginVertical}px)`;
    }
  };

  const getTransform = () => {
    if (preferences.position === 'center') {
      return 'translateY(-50%)';
    }
    if (preferences.position === 'bottom') {
      return 'translateY(-100%)';
    }
    return 'translateY(0)';
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  };

  const getBackgroundColor = () => {
    const rgb = hexToRgb(preferences.backgroundColor);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${preferences.backgroundOpacity})`;
  };

  const splitTextIntoLines = (text: string): string[] => {
    if (preferences.format === 'single-line') {
      return [text];
    }

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length <= preferences.maxCharsPerLine) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  };

  const lines = splitTextIntoLines(sampleText);

  const subtitleStyle: React.CSSProperties = {
    fontFamily: preferences.font,
    fontSize: `${preferences.fontSize}px`,
    color: preferences.fontColor,
    fontWeight: preferences.bold ? 'bold' : 'normal',
    fontStyle: preferences.italic ? 'italic' : 'normal',
    textAlign: 'center',
    padding: '8px 16px',
    backgroundColor: getBackgroundColor(),
    borderRadius: '4px',
    position: 'absolute',
    left: '50%',
    top: getVerticalPosition(),
    transform: `translateX(-50%) ${getTransform()}`,
    maxWidth: '90%',
    zIndex: 10,
    whiteSpace: 'pre-line',
    lineHeight: 1.4,
  };

  if (preferences.outline) {
    subtitleStyle.textShadow = `
      -${preferences.outlineWidth}px -${preferences.outlineWidth}px 0 ${preferences.outlineColor},
      ${preferences.outlineWidth}px -${preferences.outlineWidth}px 0 ${preferences.outlineColor},
      -${preferences.outlineWidth}px ${preferences.outlineWidth}px 0 ${preferences.outlineColor},
      ${preferences.outlineWidth}px ${preferences.outlineWidth}px 0 ${preferences.outlineColor}
    `;
  }

  if (preferences.shadow) {
    const existingShadow = subtitleStyle.textShadow || '';
    subtitleStyle.textShadow = `${existingShadow}, 2px 2px 4px ${preferences.shadowColor}`;
  }

  return (
    <Card className="overflow-hidden">
      <AspectRatio ratio={9 / 16}>
        <div className="relative w-full h-full bg-gradient-to-br from-purple-500/20 to-pink-500/20">
          {/* Thumbnail or gradient background */}
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <p className="text-sm">Pré-visualização</p>
                <p className="text-xs">Sem thumbnail disponível</p>
              </div>
            </div>
          )}

          {/* Subtitle overlay */}
          <div style={subtitleStyle}>
            {preferences.format === 'karaoke' ? (
              <div className="animate-pulse">{lines.join('\n')}</div>
            ) : preferences.format === 'progressive' ? (
              <div className="animate-fade-in">{lines.join('\n')}</div>
            ) : (
              lines.join('\n')
            )}
          </div>

          {/* Format indicator */}
          <div className="absolute bottom-2 right-2 bg-black/50 px-2 py-1 rounded text-xs text-white">
            {preferences.format === 'karaoke' && '🎤 Karaokê'}
            {preferences.format === 'progressive' && '✨ Progressivo'}
            {preferences.format === 'single-line' && '➖ Linha Única'}
            {preferences.format === 'multi-line' && '📝 Múltiplas Linhas'}
          </div>
        </div>
      </AspectRatio>
    </Card>
  );
};
