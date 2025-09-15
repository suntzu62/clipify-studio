import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import { logger } from '../logger';
import { downloadToTemp, uploadFile } from '../lib/storage';
import { runSilenceDetect } from '../lib/audio';
import { embedTextBatch, cosine } from '../lib/semantic';
import { sentenceBoundaries } from '../lib/text';

interface Segment {
  start: number;
  end: number;
  text: string;
}

interface Transcript {
  language: string;
  segments: Segment[];
  text: string;
}

interface Candidate {
  id: string;
  start: number;
  end: number;
  duration: number;
  score: number;
  reasons: string[];
  excerpt: string;
}

interface ScenesOutput {
  rootId: string;
  createdAt: string;
  candidates: Candidate[];
}

export async function runScenes(job: Job): Promise<{ count: number; top3: string[] }> {
  const rootId = job.data.rootId || job.id;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  const tmpDir = `/tmp/${rootId}`;
  
  logger.info({ rootId }, 'Scenes processing started');
  
  try {
    // Ensure tmp directory exists
    await fs.mkdir(tmpDir, { recursive: true });
    
    // 0-10%: Load files
    await job.updateProgress(5);
    
    const sourcePath = `${tmpDir}/source.mp4`;
    const transcriptPath = `${tmpDir}/transcript.json`;
    
    await Promise.all([
      downloadToTemp(bucket, `projects/${rootId}/source.mp4`, sourcePath),
      downloadToTemp(bucket, `projects/${rootId}/transcribe/transcript.json`, transcriptPath)
    ]);
    
    const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
    const transcript: Transcript = JSON.parse(transcriptContent);
    
    if (!transcript.segments || transcript.segments.length === 0) {
      throw { code: 'VIDEO_NOT_FOUND', message: 'No segments in transcript' };
    }
    
    const totalDuration = Math.max(...transcript.segments.map(s => s.end));
    await job.updateProgress(10);
    
    // 10-35%: Silence detection
    logger.info('Detecting silences');
    const silenceBoundaries = await runSilenceDetect(sourcePath);
    const silencePoints: number[] = [];
    
    for (const silence of silenceBoundaries) {
      silencePoints.push(silence.start);
      if (silence.end) {
        silencePoints.push(silence.end);
      }
    }
    
    logger.info(`Found ${silencePoints.length} silence boundaries`);
    await job.updateProgress(35);
    
    // 35-55%: Semantic analysis
    logger.info('Analyzing semantic shifts');
    const windowSize = 25; // 25 seconds
    const overlap = 0.5; // 50% overlap
    const step = windowSize * (1 - overlap);
    const semanticBoundaries: number[] = [];
    
    const windows: string[] = [];
    const windowTimes: number[] = [];
    
    for (let t = 0; t < totalDuration - windowSize; t += step) {
      const windowEnd = t + windowSize;
      const windowSegments = transcript.segments.filter(
        s => s.start < windowEnd && s.end > t
      );
      const windowText = windowSegments.map(s => s.text).join(' ');
      
      windows.push(windowText);
      windowTimes.push(t + windowSize / 2);
    }
    
    if (windows.length > 1) {
      const embeddings = await embedTextBatch(windows);
      const threshold = parseFloat(process.env.SCENES_SIM_THRESHOLD || '0.85');
      
      for (let i = 0; i < embeddings.length - 1; i++) {
        const similarity = cosine(embeddings[i], embeddings[i + 1]);
        if (similarity < threshold) {
          const boundaryTime = (windowTimes[i] + windowTimes[i + 1]) / 2;
          semanticBoundaries.push(boundaryTime);
        }
      }
    }
    
    logger.info(`Found ${semanticBoundaries.length} semantic boundaries`);
    await job.updateProgress(55);
    
    // 55-75%: Text boundaries
    logger.info('Finding sentence boundaries');
    const textBoundaries = sentenceBoundaries(transcript.segments);
    logger.info(`Found ${textBoundaries.length} text boundaries`);
    
    // Consolidate boundaries
    const allBoundaries = [
      ...silencePoints.map(t => ({ time: t, reason: 'silence_boundary' })),
      ...semanticBoundaries.map(t => ({ time: t, reason: 'semantic_shift' })),
      ...textBoundaries.map(t => ({ time: t, reason: 'sentence_end' }))
    ];
    
    // Sort and deduplicate
    allBoundaries.sort((a, b) => a.time - b.time);
    const consolidatedBoundaries: Array<{ time: number; reasons: string[] }> = [];
    const tolerance = 1.0;
    
    for (const boundary of allBoundaries) {
      const existing = consolidatedBoundaries.find(b => 
        Math.abs(b.time - boundary.time) < tolerance
      );
      
      if (existing) {
        if (!existing.reasons.includes(boundary.reason)) {
          existing.reasons.push(boundary.reason);
        }
      } else {
        consolidatedBoundaries.push({
          time: boundary.time,
          reasons: [boundary.reason]
        });
      }
    }
    
    logger.info(`Consolidated to ${consolidatedBoundaries.length} boundaries`);
    await job.updateProgress(65);
    
    // Create segments using greedy algorithm
    const minDuration = parseInt(process.env.SCENES_MIN || '30');
    const maxDuration = parseInt(process.env.SCENES_MAX || '90');
    const segments: Array<{ start: number; end: number; reasons: string[] }> = [];
    
    let t0 = 0;
    while (t0 < totalDuration && segments.length < 16) {
      const candidates = consolidatedBoundaries.filter(b => 
        b.time >= t0 + minDuration && b.time <= t0 + maxDuration
      );
      
      let segmentEnd: number;
      let segmentReasons: string[] = [];
      
      if (candidates.length > 0) {
        const chosen = candidates[candidates.length - 1]; // Take the latest valid boundary
        segmentEnd = chosen.time;
        segmentReasons = chosen.reasons;
      } else {
        // Force cut at max duration or end of video
        segmentEnd = Math.min(t0 + maxDuration, totalDuration);
        segmentReasons = ['forced_cut'];
      }
      
      if (segmentEnd - t0 >= minDuration) {
        segments.push({ start: t0, end: segmentEnd, reasons: segmentReasons });
      }
      
      t0 = segmentEnd;
    }
    
    logger.info(`Created ${segments.length} candidate segments`);
    await job.updateProgress(75);
    
    // 75-90%: Score calculation
    const candidates: Candidate[] = segments.map((segment, index) => {
      const segmentText = transcript.segments
        .filter(s => s.start < segment.end && s.end > segment.start)
        .map(s => s.text)
        .join(' ');
      
      const words = segmentText.split(/\s+/).filter(w => w.length > 0).length;
      const duration = segment.end - segment.start;
      const wps = words / duration;
      
      const qCount = (segmentText.match(/\?/g) || []).length;
      const numCount = (segmentText.match(/\d/g) || []).length;
      
      const keywords = ['como', 'por que', 'porque', 'dica', 'passo', 'lista', 'primeiro', 'segundo', 'terceiro'];
      const keywordCount = keywords.reduce((count, keyword) => {
        const regex = new RegExp(keyword, 'gi');
        return count + (segmentText.match(regex) || []).length;
      }, 0);
      
      // Normalize score components
      let score = 0;
      score += Math.min(wps / 4, 1) * 0.4; // WPS contribution (0-0.4)
      score += (qCount > 0 ? 0.1 : 0); // Question bonus
      score += Math.min(numCount / 5, 1) * 0.2; // Number content (0-0.2)
      score += Math.min(keywordCount * 0.05, 0.2); // Keywords (0-0.2)
      
      // Duration penalties
      if (duration > 85) score -= 0.1;
      if (duration < 35) score -= 0.1;
      
      score = Math.max(0, Math.min(1, score));
      
      // Create excerpt (middle section of text)
      const maxExcerptLength = 200;
      let excerpt = segmentText;
      if (excerpt.length > maxExcerptLength) {
        const start = Math.floor((excerpt.length - maxExcerptLength) / 2);
        excerpt = '...' + excerpt.substring(start, start + maxExcerptLength) + '...';
      }
      
      return {
        id: `sc_${String(index + 1).padStart(4, '0')}`,
        start: segment.start,
        end: segment.end,
        duration: duration,
        score: score,
        reasons: segment.reasons,
        excerpt: excerpt
      };
    });
    
    // Sort by score and take top candidates
    candidates.sort((a, b) => b.score - a.score);
    const finalCandidates = candidates.slice(0, 12);
    
    await job.updateProgress(90);
    
    // 90-100%: Upload results
    const scenesData: ScenesOutput = {
      rootId,
      createdAt: new Date().toISOString(),
      candidates: finalCandidates
    };
    
    const scenesPath = `${tmpDir}/scenes.json`;
    await fs.writeFile(scenesPath, JSON.stringify(scenesData, null, 2));
    
    await uploadFile(
      bucket,
      `projects/${rootId}/scenes/scenes.json`,
      scenesPath,
      'application/json'
    );
    
    await job.updateProgress(100);
    
    logger.info({ 
      rootId, 
      candidateCount: finalCandidates.length,
      topScore: finalCandidates[0]?.score 
    }, 'Scenes processing completed');
    
    return {
      count: finalCandidates.length,
      top3: finalCandidates.slice(0, 3).map(c => c.id)
    };
    
  } catch (error: any) {
    logger.error({ rootId, error: error.message }, 'Scenes processing failed');
    throw error;
  } finally {
    // Cleanup
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (cleanupError) {
      logger.warn({ tmpDir }, 'Failed to cleanup temp directory');
    }
  }
}