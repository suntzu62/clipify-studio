import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import { logger } from '../logger';
import { downloadToTemp, uploadFile } from '../lib/storage';
import { runSilenceDetect } from '../lib/audio';
import { embedTextBatch, cosine } from '../lib/semantic';
import { sentenceBoundaries } from '../lib/text';
import { enqueueUnique } from '../lib/bullmq';
import { QUEUES } from '../queues';
import { track } from '../lib/analytics';

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
  const userId = job.data.userId || 'unknown';
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  const tmpDir = `/tmp/${rootId}`;
  const startTime = Date.now();
  
  logger.info({ rootId, userId }, 'Scenes processing started');
  await track(userId, 'scenes_started', { 
    jobId: job.id, 
    rootId,
    stage: 'scenes'
  });
  
  try {
    // Ensure tmp directory exists
    await fs.mkdir(tmpDir, { recursive: true });
    
    // 0-10%: Load files
    await job.updateProgress(5);
    
    const audioPath = `${tmpDir}/audio.wav`;
    const legacyVideoPath = `${tmpDir}/source.mp4`;
    const transcriptPath = `${tmpDir}/transcript.json`;

    await downloadToTemp(bucket, `projects/${rootId}/transcribe/transcript.json`, transcriptPath);

    let silenceSource = audioPath;
    try {
      await downloadToTemp(bucket, `projects/${rootId}/media/audio.wav`, audioPath);
    } catch (error: any) {
      if (error?.code === 'VIDEO_NOT_FOUND') {
        logger.warn({ rootId }, 'AudioMissingFallbackVideo');
        await downloadToTemp(bucket, `projects/${rootId}/source.mp4`, legacyVideoPath);
        silenceSource = legacyVideoPath;
      } else {
        throw error;
      }
    }
    
    const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
    const transcript: Transcript = JSON.parse(transcriptContent);
    
    if (!transcript.segments || transcript.segments.length === 0) {
      throw { code: 'VIDEO_NOT_FOUND', message: 'No segments in transcript' };
    }
    
    const videoDuration = Math.max(...transcript.segments.map(s => s.end));
    await job.updateProgress(10);
    
    // 10-35%: Parallel silence detection and window preparation
    logger.info('Starting parallel analysis');
    
    // Prepare semantic windows while silence detection runs
    const windowSize = parseInt(process.env.SCENES_WINDOW_SIZE || '15');
    const overlap = parseFloat(process.env.SCENES_OVERLAP || '0.25');
    const step = windowSize * (1 - overlap);
    
    const windowsPrep: string[] = [];
    const windowTimesPrep: number[] = [];
    
    for (let t = 0; t < videoDuration - windowSize; t += step) {
      const windowEnd = t + windowSize;
      const windowSegments = transcript.segments.filter(
        s => s.start < windowEnd && s.end > t
      );
      const windowText = windowSegments.map(s => s.text).join(' ');
      
      windowsPrep.push(windowText);
      windowTimesPrep.push(t + windowSize / 2);
    }
    
    // Run silence detection in parallel with window preparation
    const [silenceBoundaries] = await Promise.all([
      runSilenceDetect(silenceSource)
    ]);
    
    const silencePoints: number[] = [];
    for (const silence of silenceBoundaries) {
      silencePoints.push(silence.start);
      if (silence.end) {
        silencePoints.push(silence.end);
      }
    }
    
    logger.info(`Found ${silencePoints.length} silence boundaries, prepared ${windowsPrep.length} windows`);
    await job.updateProgress(35);
    
    // 35-55%: Semantic analysis (optimized for speed)
    logger.info('Analyzing semantic shifts');
    const semanticBoundaries: number[] = [];
    
    // Use pre-prepared windows for better performance
    const windows = windowsPrep;
    const windowTimes = windowTimesPrep;
    
    if (windows.length > 1) {
      // Process embeddings in larger batches for better performance
      const batchSize = 20; // Process 20 windows at a time
      const threshold = parseFloat(process.env.SCENES_SIM_THRESHOLD || '0.85');
      
      for (let batchStart = 0; batchStart < windows.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, windows.length);
        const batchWindows = windows.slice(batchStart, batchEnd);
        const batchEmbeddings = await embedTextBatch(batchWindows);
        
        // Calculate similarities for this batch
        for (let i = 0; i < batchEmbeddings.length - 1; i++) {
          const globalIndex = batchStart + i;
          if (globalIndex < windows.length - 1) {
            const similarity = cosine(batchEmbeddings[i], batchEmbeddings[i + 1]);
            if (similarity < threshold) {
              const boundaryTime = (windowTimes[globalIndex] + windowTimes[globalIndex + 1]) / 2;
              semanticBoundaries.push(boundaryTime);
            }
          }
        }
        
        // Update progress for semantic analysis
        const batchProgress = 35 + ((batchEnd / windows.length) * 20); // 35-55% for semantic analysis
        await job.updateProgress(Math.floor(batchProgress));
      }
    }
    
    logger.info(`Found ${semanticBoundaries.length} semantic boundaries`);
    await job.updateProgress(55);
    
    // 55-75%: Text boundaries
    logger.info('Finding sentence boundaries');
    const textBoundaries = sentenceBoundaries(transcript.segments);
    logger.info(`Found ${textBoundaries.length} text boundaries`);
    
    // Consolidate boundaries with semantic padding
    const allBoundaries = [
      ...silencePoints.map(t => ({ time: t, reason: 'silence_boundary' })),
      ...semanticBoundaries.map(t => ({ time: t, reason: 'semantic_shift' })),
      ...textBoundaries.map(t => ({ time: t, reason: 'sentence_end' }))
    ];
    
    // Sort and deduplicate with enhanced logic
    allBoundaries.sort((a, b) => a.time - b.time);
    const consolidatedBoundaries: Array<{ time: number; reasons: string[]; padding: number }> = [];
    const tolerance = 1.0; // Merge boundaries within 1 second
    const semanticPadding = parseFloat(process.env.SCENES_SEMANTIC_PADDING || '0.4'); // 400ms padding
    
    for (const boundary of allBoundaries) {
      const existing = consolidatedBoundaries.find(b => 
        Math.abs(b.time - boundary.time) < tolerance
      );
      
      if (existing) {
        if (!existing.reasons.includes(boundary.reason)) {
          existing.reasons.push(boundary.reason);
        }
        // Update time to average if this is a more important boundary
        if (boundary.reason === 'semantic_shift' && !existing.reasons.includes('semantic_shift')) {
          existing.time = (existing.time + boundary.time) / 2;
        }
      } else {
        consolidatedBoundaries.push({
          time: boundary.time,
          reasons: [boundary.reason],
          padding: semanticPadding
        });
      }
    }
    
    // Merge boundaries that are too close (less than 1 second apart)
    const mergedBoundaries: Array<{ time: number; reasons: string[]; padding: number }> = [];
    for (let i = 0; i < consolidatedBoundaries.length; i++) {
      const current = consolidatedBoundaries[i];
      const next = consolidatedBoundaries[i + 1];
      
      if (next && (next.time - current.time) < 1.0) {
        // Merge with next boundary
        mergedBoundaries.push({
          time: (current.time + next.time) / 2,
          reasons: [...new Set([...current.reasons, ...next.reasons])],
          padding: Math.max(current.padding, next.padding)
        });
        i++; // Skip the next boundary since we merged it
      } else {
        mergedBoundaries.push(current);
      }
    }
    
    logger.info(`Consolidated to ${mergedBoundaries.length} boundaries (merged ${consolidatedBoundaries.length - mergedBoundaries.length})`);
    await job.updateProgress(65);
    
    // Create segments using enhanced greedy algorithm with padding
    const minDuration = parseInt(process.env.SCENES_MIN || '30');
    const maxDuration = parseInt(process.env.SCENES_MAX || '90');
    const targetSegments = 12; // Aim for 8-12 candidates
    const maxSegments = 16; // Hard limit
    const segments: Array<{ start: number; end: number; reasons: string[]; crossfade: boolean }> = [];
    
    let t0 = 0;
    while (t0 < videoDuration && segments.length < maxSegments) {
      // Find boundaries within the valid range, applying semantic padding
      const candidates = mergedBoundaries.filter(b => {
        const adjustedTime = b.time + b.padding; // Apply semantic padding
        return adjustedTime >= t0 + minDuration && adjustedTime <= t0 + maxDuration;
      });
      
      let segmentEnd: number;
      let segmentReasons: string[] = [];
      let hasCrossfade = false;
      
      if (candidates.length > 0) {
        // Choose the best boundary based on priority
        const prioritized = candidates.sort((a, b) => {
          const aScore = a.reasons.includes('semantic_shift') ? 3 : 
                        a.reasons.includes('sentence_end') ? 2 : 1;
          const bScore = b.reasons.includes('semantic_shift') ? 3 : 
                        b.reasons.includes('sentence_end') ? 2 : 1;
          return bScore - aScore;
        });
        
        const chosen = prioritized[0];
        segmentEnd = chosen.time + chosen.padding; // Apply padding
        segmentReasons = chosen.reasons;
        
        // Mark for crossfade if there's a semantic shift or silence boundary
        hasCrossfade = chosen.reasons.includes('semantic_shift') || 
                      chosen.reasons.includes('silence_boundary');
      } else {
        // Force cut at max duration or end of video
        segmentEnd = Math.min(t0 + maxDuration, videoDuration);
        segmentReasons = ['forced_cut'];
        hasCrossfade = true; // Force cuts need crossfade
      }
      
      const duration = segmentEnd - t0;
      if (duration >= minDuration) {
        segments.push({ 
          start: t0, 
          end: segmentEnd, 
          reasons: segmentReasons,
          crossfade: hasCrossfade
        });
      }
      
      t0 = segmentEnd;
    }
    
    // Ensure we have at least 8 segments if possible
    if (segments.length < 8 && videoDuration > 8 * minDuration) {
      logger.info('Insufficient segments, applying fallback strategy');
      
      // Fallback: create more segments by reducing padding and being more aggressive
      const fallbackSegments: Array<{ start: number; end: number; reasons: string[]; crossfade: boolean }> = [];
      const reducedMinDuration = Math.max(25, minDuration * 0.8); // Reduce minimum by 20%
      const step = (videoDuration - reducedMinDuration) / 10; // Aim for 10 segments
      
      for (let i = 0; i < 10 && fallbackSegments.length < 12; i++) {
        const start = i * step;
        const end = Math.min(start + reducedMinDuration + Math.random() * 30, videoDuration); // Random length 25-55s
        
        if (end - start >= reducedMinDuration && start < videoDuration) {
          fallbackSegments.push({
            start,
            end,
            reasons: ['fallback_segment'],
            crossfade: true
          });
        }
      }
      
      // Merge with existing segments and sort
      segments.push(...fallbackSegments);
      segments.sort((a, b) => a.start - b.start);
      
      // Remove overlaps and take best candidates
      const nonOverlapping = [];
      let lastEnd = 0;
      for (const segment of segments) {
        if (segment.start >= lastEnd) {
          nonOverlapping.push(segment);
          lastEnd = segment.end;
        }
      }
      
      segments.length = 0;
      segments.push(...nonOverlapping.slice(0, maxSegments));
    }
    
    logger.info(`Created ${segments.length} candidate segments (target: ${targetSegments}, max: ${maxSegments})`);
    await job.updateProgress(75);
    
    // 75-90%: Enhanced score calculation
    const candidates: Candidate[] = segments.map((segment, index) => {
      const segmentText = transcript.segments
        .filter(s => s.start < segment.end && s.end > segment.start)
        .map(s => s.text)
        .join(' ');
      
      const words = segmentText.split(/\s+/).filter(w => w.length > 0).length;
      const duration = segment.end - segment.start;
      const wps = words / duration; // Words per second
      
      // Enhanced content analysis
      const qCount = (segmentText.match(/\?/g) || []).length;
      const exclamationCount = (segmentText.match(/!/g) || []).length;
      const numCount = (segmentText.match(/\d/g) || []).length;
      
      // Enhanced keyword detection
      const hookKeywords = ['como', 'por que', 'porque', 'segredo', 'dica', 'truque'];
      const listKeywords = ['passo', 'lista', 'primeiro', 'segundo', 'terceiro', 'top'];
      const actionKeywords = ['agora', 'vamos', 'vou mostrar', 'olha', 'atenção'];
      
      const hookCount = hookKeywords.reduce((count, keyword) => {
        const regex = new RegExp(keyword, 'gi');
        return count + (segmentText.match(regex) || []).length;
      }, 0);
      
      const listCount = listKeywords.reduce((count, keyword) => {
        const regex = new RegExp(keyword, 'gi');
        return count + (segmentText.match(regex) || []).length;
      }, 0);
      
      const actionCount = actionKeywords.reduce((count, keyword) => {
        const regex = new RegExp(keyword, 'gi');
        return count + (segmentText.match(regex) || []).length;
      }, 0);
      
      // Calculate density score (content richness)
      const densityScore = Math.min(wps / 3.5, 1); // Optimal around 3.5 words/second
      
      // Calculate engagement score
      let engagementScore = 0;
      engagementScore += Math.min(qCount * 0.15, 0.3); // Questions boost
      engagementScore += Math.min(exclamationCount * 0.1, 0.2); // Excitement boost
      engagementScore += Math.min(numCount / 10, 0.15); // Numbers/data boost
      
      // Calculate hook score (beginning appeal)
      const firstWords = segmentText.substring(0, 100).toLowerCase();
      let hookScore = 0;
      hookScore += hookCount * 0.1;
      hookScore += (firstWords.includes('vou') || firstWords.includes('como')) ? 0.15 : 0;
      hookScore += /^\s*(olha|atenção|agora|escuta)/.test(firstWords) ? 0.1 : 0;
      
      // Calculate content structure score
      let structureScore = 0;
      structureScore += Math.min(listCount * 0.1, 0.2); // Lists/steps
      structureScore += Math.min(actionCount * 0.05, 0.15); // Action words
      
      // Base scoring
      let score = 0;
      score += densityScore * 0.25; // Word density contribution
      score += engagementScore * 0.25; // Engagement elements
      score += hookScore * 0.2; // Hook/beginning appeal
      score += structureScore * 0.15; // Content structure
      
      // Duration optimization (target 30-90s, ideal ~60s)
      const durationScore = 1 - Math.abs(duration - 60) / 60;
      score += Math.max(0, durationScore) * 0.15;
      
      // Penalties for poor cuts
      if (segment.reasons.includes('forced_cut')) score -= 0.1;
      if (duration < 30) score -= 0.2; // Too short penalty
      if (duration > 90) score -= 0.15; // Too long penalty
      
      // Bonus for natural boundaries
      if (segment.reasons.includes('semantic_shift')) score += 0.05;
      if (segment.reasons.includes('sentence_end')) score += 0.03;
      if (segment.crossfade) score += 0.02; // Crossfade readiness bonus
      
      score = Math.max(0, Math.min(1, score));
      
      // Create excerpt (prioritize beginning for hook assessment)
      const maxExcerptLength = 200;
      let excerpt = segmentText;
      if (excerpt.length > maxExcerptLength) {
        // Take from beginning for hook, not middle
        excerpt = excerpt.substring(0, maxExcerptLength) + '...';
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
    
    // Sort by score and ensure we return 8-12 candidates
    candidates.sort((a, b) => b.score - a.score);
    const minCandidates = Math.max(8, Math.min(candidates.length, 8));
    const maxCandidates = Math.min(12, candidates.length);
    const finalCandidates = candidates.slice(0, maxCandidates);
    
    // Ensure minimum count by adding lower-scored candidates if needed
    if (finalCandidates.length < minCandidates) {
      const additional = candidates.slice(finalCandidates.length, minCandidates);
      finalCandidates.push(...additional);
    }
    
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
      topScore: finalCandidates[0]?.score,
      avgScore: finalCandidates.reduce((sum, c) => sum + c.score, 0) / finalCandidates.length,
      totalDuration: Date.now() - startTime
    }, 'Scenes processing completed');

    const totalDuration = Date.now() - startTime;
    await track(userId, 'stage_completed', { 
      stage: 'scenes', 
      duration: totalDuration,
      candidateCount: finalCandidates.length,
      topScore: finalCandidates[0]?.score || 0,
      jobId: job.id
    });

    await enqueueUnique(
      QUEUES.RANK,
      'rank',
      `${rootId}:rank`,
      { rootId, meta: job.data.meta || {} }
    );
    
    return {
      count: finalCandidates.length,
      top3: finalCandidates.slice(0, 3).map(c => c.id)
    };
    
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    logger.error({ rootId, error: error.message, totalDuration }, 'Scenes processing failed');
    
    await track(userId, 'scenes_failed', { 
      jobId: job.id,
      error: error.message,
      duration: totalDuration,
      rootId
    });
    
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
