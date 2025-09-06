import { split } from 'sentence-splitter';

interface Segment {
  start: number;
  end: number;
  text: string;
}

export function sentenceBoundaries(segments: Segment[]): number[] {
  const boundaries: number[] = [];
  
  for (const segment of segments) {
    const sentences = split(segment.text);
    const totalLength = segment.text.length;
    const duration = segment.end - segment.start;
    
    let charOffset = 0;
    
    for (const sentence of sentences) {
      if (sentence.type === 'Sentence') {
        const sentenceEnd = charOffset + sentence.raw.length;
        const timeRatio = sentenceEnd / totalLength;
        const sentenceEndTime = segment.start + (duration * timeRatio);
        
        boundaries.push(sentenceEndTime);
        charOffset = sentenceEnd;
      } else {
        charOffset += sentence.raw.length;
      }
    }
  }
  
  // Deduplicate and sort with tolerance
  const tolerance = 0.75;
  const deduped: number[] = [];
  
  boundaries.sort((a, b) => a - b);
  
  for (const boundary of boundaries) {
    const existing = deduped.find(b => Math.abs(b - boundary) < tolerance);
    if (!existing) {
      deduped.push(boundary);
    }
  }
  
  return deduped;
}