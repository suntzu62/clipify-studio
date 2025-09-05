export interface Segment {
  start: number;
  end: number;
  text: string;
}

function formatTimestampSRT(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

function formatTimestampVTT(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

export function fromSegmentsToSRT(segments: Segment[]): string {
  let srt = '';
  
  segments.forEach((segment, index) => {
    const startTime = formatTimestampSRT(segment.start);
    const endTime = formatTimestampSRT(segment.end);
    
    srt += `${index + 1}\n`;
    srt += `${startTime} --> ${endTime}\n`;
    srt += `${segment.text.trim()}\n\n`;
  });
  
  return srt.trim();
}

export function fromSegmentsToVTT(segments: Segment[]): string {
  let vtt = 'WEBVTT\n\n';
  
  segments.forEach((segment) => {
    const startTime = formatTimestampVTT(segment.start);
    const endTime = formatTimestampVTT(segment.end);
    
    vtt += `${startTime} --> ${endTime}\n`;
    vtt += `${segment.text.trim()}\n\n`;
  });
  
  return vtt.trim();
}