interface Segment {
  start: number;
  end: number;
  text: string;
}

export function computeCPS(segments: Segment[], start: number, end: number): { cpsAvg: number; cpsP95: number } {
  let totalChars = 0;
  const segmentCPS: Array<{ cps: number; duration: number }> = [];
  
  for (const segment of segments) {
    // Check for overlap with [start, end]
    const overlapStart = Math.max(segment.start, start);
    const overlapEnd = Math.min(segment.end, end);
    
    if (overlapStart < overlapEnd) {
      const overlapDuration = overlapEnd - overlapStart;
      const segmentDuration = segment.end - segment.start;
      const overlapRatio = overlapDuration / segmentDuration;
      const charsInOverlap = segment.text.length * overlapRatio;
      
      totalChars += charsInOverlap;
      
      // Calculate CPS for this segment overlap
      const segmentCPS_value = charsInOverlap / overlapDuration;
      segmentCPS.push({ cps: segmentCPS_value, duration: overlapDuration });
    }
  }
  
  const totalDuration = end - start;
  const cpsAvg = totalChars / totalDuration;
  
  // Calculate P95 CPS (weighted by duration)
  let cpsP95 = cpsAvg;
  if (segmentCPS.length > 0) {
    segmentCPS.sort((a, b) => a.cps - b.cps);
    
    let accumulatedDuration = 0;
    const targetDuration = totalDuration * 0.95;
    
    for (const { cps, duration } of segmentCPS) {
      accumulatedDuration += duration;
      if (accumulatedDuration >= targetDuration) {
        cpsP95 = cps;
        break;
      }
    }
  }
  
  return { cpsAvg, cpsP95 };
}