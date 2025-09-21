import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptTrackProps {
  segments: TranscriptSegment[];
  duration: number;
  currentTime: number;
  zoom: number;
  onSeek: (time: number) => void;
}

export const TranscriptTrack = ({
  segments,
  duration,
  currentTime,
  zoom,
  onSeek
}: TranscriptTrackProps) => {
  
  const words = useMemo(() => {
    const wordList: Array<{
      text: string;
      start: number;
      end: number;
      x: number;
      width: number;
      isActive: boolean;
    }> = [];

    segments.forEach((segment) => {
      const segmentWords = segment.text.split(/\s+/);
      const segmentDuration = segment.end - segment.start;
      const averageWordDuration = segmentDuration / segmentWords.length;

      segmentWords.forEach((word, index) => {
        const wordStart = segment.start + (index * averageWordDuration);
        const wordEnd = wordStart + averageWordDuration;
        
        const x = (wordStart / duration) * 100; // percentage
        const width = (averageWordDuration / duration) * 100; // percentage
        const isActive = currentTime >= wordStart && currentTime < wordEnd;

        wordList.push({
          text: word,
          start: wordStart,
          end: wordEnd,
          x,
          width,
          isActive
        });
      });
    });

    return wordList;
  }, [segments, duration, currentTime]);

  const handleWordClick = (wordStart: number) => {
    onSeek(wordStart);
  };

  // Find silence gaps for snapping
  const silenceGaps = useMemo(() => {
    const gaps: Array<{ start: number; end: number; x: number; width: number }> = [];
    
    for (let i = 0; i < segments.length - 1; i++) {
      const currentEnd = segments[i].end;
      const nextStart = segments[i + 1].start;
      
      if (nextStart - currentEnd > 0.5) { // Gap longer than 500ms
        const x = (currentEnd / duration) * 100;
        const width = ((nextStart - currentEnd) / duration) * 100;
        
        gaps.push({
          start: currentEnd,
          end: nextStart,
          x,
          width
        });
      }
    }
    
    return gaps;
  }, [segments, duration]);

  if (!segments.length) {
    return (
      <div className="h-16 bg-muted/30 border border-border rounded-lg flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Nenhuma transcrição disponível</span>
      </div>
    );
  }

  return (
    <div className="relative h-16 bg-background border border-border rounded-lg overflow-hidden">
      {/* Silence gaps - visual indicators for good cut points */}
      {silenceGaps.map((gap, index) => (
        <div
          key={index}
          className="absolute top-0 bottom-0 bg-yellow-200/50 border-l-2 border-r-2 border-yellow-400 opacity-60"
          style={{
            left: `${gap.x}%`,
            width: `${gap.width}%`
          }}
          title={`Silêncio: ${gap.start.toFixed(1)}s - ${gap.end.toFixed(1)}s`}
        />
      ))}

      {/* Words */}
      <div className="absolute inset-0 flex items-center overflow-hidden px-2">
        <div className="relative w-full h-8 flex items-center">
          {words.map((word, index) => (
            <div
              key={index}
              className={cn(
                "absolute flex items-center justify-center text-xs font-medium cursor-pointer transition-all duration-100 px-1 rounded",
                word.isActive 
                  ? "bg-primary text-primary-foreground scale-110 z-10 shadow-lg" 
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:scale-105"
              )}
              style={{
                left: `${word.x}%`,
                width: `${Math.max(word.width, 2)}%`, // Minimum width for readability
                minWidth: `${word.text.length * 6}px` // Dynamic minimum based on text length
              }}
              onClick={() => handleWordClick(word.start)}
              title={`${word.text} (${word.start.toFixed(1)}s)`}
            >
              <span className="truncate leading-none">
                {word.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Current time indicator */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
        style={{ left: `${(currentTime / duration) * 100}%` }}
      />

      {/* Time markers */}
      <div className="absolute bottom-0 left-0 right-0 h-2 border-t border-border bg-muted/30">
        {Array.from({ length: Math.ceil(duration / 10) }, (_, i) => {
          const time = i * 10;
          const x = (time / duration) * 100;
          
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-border"
              style={{ left: `${x}%` }}
            />
          );
        })}
      </div>

      {/* Snapping indicators */}
      <div className="absolute top-0 left-2 flex items-center gap-1">
        <div className="w-2 h-2 bg-yellow-400 rounded-full" title="Pontos de corte sugeridos" />
        <span className="text-xs text-muted-foreground">Snap em silêncios</span>
      </div>
    </div>
  );
};