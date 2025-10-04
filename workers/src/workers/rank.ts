import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import { downloadToTemp, uploadFile } from '../lib/storage';
import { computeCPS } from '../lib/cps';
import { embedBatch, cosine } from '../lib/emb';
import { hookScore } from '../lib/hook';
import { createLogger } from '../lib/logger';
import { enqueueUnique } from '../lib/bullmq';
import { QUEUES } from '../queues';
import { track } from '../lib/analytics';

const logger = createLogger('rank');

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

interface ScenesData {
  rootId: string;
  createdAt: string;
  candidates: Candidate[];
}

interface RankedCandidate extends Candidate {
  novelty: number;
  hook: number;
  cps: { avg: number; p95: number };
  textFull: string;
  textFirst10s: string;
  baseScore: number;
  finalScore: number;
}

interface RankOutput {
  rootId: string;
  generatedAt: string;
  criteria: {
    target: number;
    cpsMax: number;
  };
  items: Array<{
    id: string;
    start: number;
    end: number;
    duration: number;
    score: number;
    novelty: number;
    hook: number;
    cps: { avg: number; p95: number };
    reasons: string[];
    excerpt: string;
  }>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function calculateSilencePenalty(segments: Segment[], start: number, end: number): number {
  const overlappingSegments = segments.filter(s => 
    Math.max(s.start, start) < Math.min(s.end, end)
  ).sort((a, b) => a.start - b.start);
  
  if (overlappingSegments.length <= 1) return 0;
  
  let gaps = 0;
  let maxGap = 0;
  
  for (let i = 1; i < overlappingSegments.length; i++) {
    const gap = overlappingSegments[i].start - overlappingSegments[i - 1].end;
    if (gap > 1) {
      gaps++;
      maxGap = Math.max(maxGap, gap);
    }
  }
  
  return Math.min(0.2, 0.05 * gaps + (maxGap > 2 ? 0.05 : 0));
}

function calculateKeywordBoost(text: string): number {
  let boost = 0;
  
  // Numbers/lists (enhanced detection)
  const numberMatches = text.match(/\b\d+\b/g) || [];
  if (numberMatches.length > 0) {
    boost += Math.min(0.15, numberMatches.length * 0.03);
  }
  
  // High-impact keywords
  const highImpactKeywords = ['segredo', 'truque', 'hack', 'erro', 'problema', 'solução'];
  const mediumImpactKeywords = ['dica', 'passo', 'lista', 'top', 'método', 'técnica'];
  const lowImpactKeywords = ['como', 'por que', 'porque', 'forma', 'maneira'];
  
  // Weight keywords by impact
  highImpactKeywords.forEach(keyword => {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(text)) {
      boost += 0.08;
    }
  });
  
  mediumImpactKeywords.forEach(keyword => {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(text)) {
      boost += 0.05;
    }
  });
  
  lowImpactKeywords.forEach(keyword => {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(text)) {
      boost += 0.02;
    }
  });
  
  // Engagement indicators
  const questionMarks = (text.match(/\?/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  boost += Math.min(0.1, questionMarks * 0.03 + exclamations * 0.02);
  
  return Math.min(0.3, boost);
}

function calculateImpactScore(
  candidate: RankedCandidate, 
  segments: Segment[], 
  cps: { cpsAvg: number; cpsP95: number },
  target: number
): number {
  const { textFull, textFirst10s, duration } = candidate;
  
  // 1. Hook strength (first 10 seconds)
  const hookStrength = hookScore(textFirst10s);
  
  // 2. Content density and flow
  const words = textFull.split(/\s+/).filter(w => w.length > 0).length;
  const wordsPerSecond = words / duration;
  const densityScore = Math.min(wordsPerSecond / 3.2, 1); // Optimal ~3.2 wps
  
  // 3. CPS optimization (characters per second - readability)
  const cpsScore = cps.cpsAvg <= 20 ? 1 : Math.max(0, 1 - (cps.cpsAvg - 20) / 10);
  
  // 4. Duration optimization with exponential penalty
  const durationRatio = Math.abs(duration - target) / target;
  let durationScore = 1;
  if (duration < 30) {
    durationScore = Math.pow(duration / 30, 2); // Exponential penalty for too short
  } else if (duration > 90) {
    durationScore = Math.pow(90 / duration, 1.5); // Strong penalty for too long
  } else {
    durationScore = 1 - Math.pow(durationRatio, 1.5); // Exponential penalty from target
  }
  
  // 5. Keyword and content boost
  const keywordBoost = calculateKeywordBoost(textFull);
  
  // 6. Silence and gap analysis
  const silencePenalty = calculateSilencePenalty(segments, candidate.start, candidate.end);
  
  // 7. Structural analysis
  let structuralBonus = 0;
  if (textFull.includes('primeiro') || textFull.includes('segundo')) structuralBonus += 0.05;
  if (/\b(lista|top\s+\d+|passo\s+\d+)\b/i.test(textFull)) structuralBonus += 0.08;
  if (/\b(antes|depois|agora|então)\b/i.test(textFull)) structuralBonus += 0.03;
  
  // Combine all factors with optimized weights
  const impactScore = 
    hookStrength * 0.25 +           // Hook is crucial
    densityScore * 0.20 +           // Content density
    cpsScore * 0.15 +               // Readability
    durationScore * 0.15 +          // Duration optimization
    keywordBoost * 0.15 +           // Content quality
    structuralBonus * 0.10 -        // Structure bonus
    silencePenalty * 0.20;          // Penalty for gaps
  
  return Math.max(0, Math.min(1, impactScore));
}

function getTextForTimeRange(segments: Segment[], start: number, end: number): string {
  return segments
    .filter(s => Math.max(s.start, start) < Math.min(s.end, end))
    .map(s => s.text)
    .join(' ');
}

function generateReasons(candidate: RankedCandidate, silencePenalty: number, keywordBoost: number): string[] {
  const reasons: string[] = [];
  
  if (candidate.hook > 0.5) reasons.push('hook:pergunta');
  if (candidate.hook > 0 && /\b\d+\b/.test(candidate.textFirst10s)) reasons.push('hook:numeros');
  if (candidate.cps.avg <= 20) reasons.push('cps:ok');
  
  const target = Number(process.env.RANK_TARGET || 55);
  if (Math.abs(candidate.duration - target) <= 10) reasons.push('len:ideal');
  
  if (candidate.novelty > 0.8) reasons.push('diversidade:alta');
  else if (candidate.novelty < 0.3) reasons.push('diversidade:baixa');
  
  if (silencePenalty === 0) reasons.push('gaps:nenhum');
  else if (silencePenalty < 0.1) reasons.push('gaps:alguns');
  else reasons.push('gaps:muitos');
  
  return reasons;
}

export async function runRank(job: Job): Promise<{ count: number; top3: string[] }> {
  const rootId = job.data.rootId || job.id;
  const userId = job.data.userId || 'unknown';
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  const tmpDir = `/tmp/${rootId}/rank`;
  const startTime = Date.now();
  
  logger.info('RankStarted', { rootId, userId });
  await track(userId, 'rank_started', { 
    jobId: job.id, 
    rootId,
    stage: 'rank'
  });
  
  try {
    await job.updateProgress(0);
    
    // Setup temp directory
    await fs.mkdir(tmpDir, { recursive: true });
    
    // Download input files
    await downloadToTemp(bucket, `projects/${rootId}/scenes/scenes.json`, `${tmpDir}/scenes.json`);
    await downloadToTemp(bucket, `projects/${rootId}/transcribe/transcript.json`, `${tmpDir}/transcript.json`);
    
    // Load data
    const scenesData: ScenesData = JSON.parse(await fs.readFile(`${tmpDir}/scenes.json`, 'utf-8'));
    const transcript: Transcript = JSON.parse(await fs.readFile(`${tmpDir}/transcript.json`, 'utf-8'));
    
    if (!scenesData.candidates || !transcript.segments) {
      throw { code: 'RANK_INPUT_NOT_FOUND', message: 'Invalid scenes or transcript data' };
    }
    
    logger.info('LoadOk', { candidates: scenesData.candidates.length, segments: transcript.segments.length });
    
    await job.updateProgress(10);
    
    // Filter by duration and calculate enhanced features
    const RANK_MIN = Number(process.env.RANK_MIN || 30);
    const RANK_MAX = Number(process.env.RANK_MAX || 90);
    const RANK_TARGET = Number(process.env.RANK_TARGET || 55);
    
    const validCandidates: RankedCandidate[] = [];
    
    for (const candidate of scenesData.candidates) {
      if (candidate.duration < RANK_MIN || candidate.duration > RANK_MAX) {
        continue;
      }
      
      // Get text for the full range and first 10s
      const textFull = getTextForTimeRange(transcript.segments, candidate.start, candidate.end);
      const textFirst10s = getTextForTimeRange(transcript.segments, candidate.start, Math.min(candidate.start + 10, candidate.end));
      
      // Calculate comprehensive features
      const cps = computeCPS(transcript.segments, candidate.start, candidate.end);
      const hook = hookScore(textFirst10s);
      
      // Calculate enhanced impact score
      const tempCandidate: RankedCandidate = {
        ...candidate,
        textFull: textFull.slice(0, 1500), // Increased limit for better analysis
        textFirst10s,
        hook,
        cps: { avg: cps.cpsAvg, p95: cps.cpsP95 },
        baseScore: 0,
        finalScore: 0,
        novelty: 1,
      };
      
      const impactScore = calculateImpactScore(tempCandidate, transcript.segments, cps, RANK_TARGET);
      
      validCandidates.push({
        ...tempCandidate,
        baseScore: impactScore,
        finalScore: impactScore, // Will be updated with novelty
      });
    }
    
    logger.info('FeaturesComputed', { 
      validCandidates: validCandidates.length, 
      avgImpactScore: validCandidates.reduce((sum, c) => sum + c.baseScore, 0) / validCandidates.length 
    });
    
    await job.updateProgress(40);
    
    // Calculate embeddings and apply enhanced diversity algorithm
    if (validCandidates.length > 0) {
      const embeddings = await embedBatch(validCandidates.map(c => c.textFull));
      logger.info('EmbeddingsOk', { count: embeddings.length });
      
      // Sort by base score for greedy selection
      validCandidates.sort((a, b) => b.baseScore - a.baseScore);
      
      const selected: number[] = []; // indices of selected candidates
      const SIMILARITY_THRESHOLD = parseFloat(process.env.RANK_SIMILARITY_THRESHOLD || '0.94');
      const MIN_SELECTED = 8;
      const MAX_SELECTED = 12;
      
      for (let i = 0; i < validCandidates.length; i++) {
        const candidate = validCandidates[i];
        
        // Calculate novelty (diversity) - enhanced algorithm
        let maxSimilarity = 0;
        let avgSimilarity = 0;
        let similarityCount = 0;
        
        for (const selectedIdx of selected) {
          const similarity = cosine(embeddings[i], embeddings[selectedIdx]);
          maxSimilarity = Math.max(maxSimilarity, similarity);
          avgSimilarity += similarity;
          similarityCount++;
        }
        
        avgSimilarity = similarityCount > 0 ? avgSimilarity / similarityCount : 0;
        
        // Enhanced novelty calculation considering both max and average similarity
        const novelty = 1 - (0.7 * maxSimilarity + 0.3 * avgSimilarity);
        candidate.novelty = novelty;
        
        // Calculate diversity penalty with graduated thresholds
        let diversityPenalty = 0;
        if (maxSimilarity > 0.96) {
          diversityPenalty = 0.25; // Very similar content
        } else if (maxSimilarity > 0.94) {
          diversityPenalty = 0.15; // Quite similar
        } else if (maxSimilarity > 0.90) {
          diversityPenalty = 0.08; // Somewhat similar
        }
        
        // Enhanced final score calculation
        const noveltyBonus = novelty * 0.25; // Increased novelty weight
        candidate.finalScore = candidate.baseScore + noveltyBonus - diversityPenalty;
        
        // Selection criteria - ensure diversity while maintaining quality
        const shouldSelect = 
          selected.length < MIN_SELECTED || // Always select first 8
          (selected.length < MAX_SELECTED && maxSimilarity <= SIMILARITY_THRESHOLD); // Quality gate for 9-12
        
        if (shouldSelect) {
          selected.push(i);
        }
      }
      
      // If we don't have enough diverse candidates, relax similarity threshold
      if (selected.length < MIN_SELECTED) {
        logger.info('Relaxing similarity threshold to ensure minimum candidates');
        
        const relaxedThreshold = 0.96; // More permissive
        for (let i = 0; i < validCandidates.length && selected.length < MIN_SELECTED; i++) {
          if (!selected.includes(i)) {
            const candidate = validCandidates[i];
            let maxSimilarity = 0;
            
            for (const selectedIdx of selected) {
              const similarity = cosine(embeddings[i], embeddings[selectedIdx]);
              maxSimilarity = Math.max(maxSimilarity, similarity);
            }
            
            if (maxSimilarity <= relaxedThreshold) {
              selected.push(i);
            }
          }
        }
      }
      
      logger.info('DiversityApplied', { 
        processed: validCandidates.length, 
        selected: selected.length,
        avgNovelty: selected.reduce((sum, idx) => sum + validCandidates[idx].novelty, 0) / selected.length
      });
    }
    
    await job.updateProgress(70);
    
    // Sort by final score and select top 8-12 with normalized scores
    const TARGET_COUNT = Number(process.env.RANK_TOP_K || 10);
    const MIN_COUNT = 8;
    const MAX_COUNT = 12;
    
    validCandidates.sort((a, b) => b.finalScore - a.finalScore);
    
    // Determine final count based on quality distribution
    let finalCount = TARGET_COUNT;
    if (validCandidates.length >= MAX_COUNT) {
      // If we have enough candidates, ensure quality threshold
      const topScores = validCandidates.slice(0, MAX_COUNT).map(c => c.finalScore);
      const avgTopScore = topScores.reduce((sum, score) => sum + score, 0) / topScores.length;
      const qualityThreshold = avgTopScore * 0.7; // 70% of average top score
      
      const qualityCandidates = validCandidates.filter(c => c.finalScore >= qualityThreshold);
      finalCount = Math.max(MIN_COUNT, Math.min(MAX_COUNT, qualityCandidates.length));
    } else {
      finalCount = Math.max(MIN_COUNT, Math.min(validCandidates.length, MAX_COUNT));
    }
    
    const finalCandidates = validCandidates.slice(0, finalCount);
    
    // Normalize scores to 0-1 range based on the selected candidates
    if (finalCandidates.length > 0) {
      const maxScore = Math.max(...finalCandidates.map(c => c.finalScore));
      const minScore = Math.min(...finalCandidates.map(c => c.finalScore));
      const scoreRange = maxScore - minScore;
      
      if (scoreRange > 0) {
        finalCandidates.forEach(candidate => {
          candidate.finalScore = (candidate.finalScore - minScore) / scoreRange;
        });
      }
    }
    
    // Generate enhanced reasons and prepare output
    const items = finalCandidates.map((candidate, index) => {
      const silencePenalty = calculateSilencePenalty(transcript.segments, candidate.start, candidate.end);
      const keywordBoost = calculateKeywordBoost(candidate.textFull);
      const reasons = generateReasons(candidate, silencePenalty, keywordBoost);
      
      // Add ranking-specific reasons
      if (index < 3) reasons.push('top_tier');
      if (candidate.novelty > 0.8) reasons.push('alta_diversidade');
      if (candidate.finalScore > 0.8) reasons.push('alto_impacto');
      if (candidate.cps.avg <= 18) reasons.push('legibilidade_otima');
      
      return {
        id: candidate.id,
        start: candidate.start,
        end: candidate.end,
        duration: candidate.duration,
        score: Math.round(candidate.finalScore * 1000) / 1000, // 3 decimal places
        novelty: Math.round(candidate.novelty * 1000) / 1000,
        hook: Math.round(candidate.hook * 1000) / 1000,
        cps: {
          avg: Math.round(candidate.cps.avg * 10) / 10,
          p95: Math.round(candidate.cps.p95 * 10) / 10,
        },
        reasons,
        excerpt: candidate.excerpt,
      };
    });
    
    logger.info('Selected', { 
      count: items.length, 
      avgScore: items.reduce((sum, item) => sum + item.score, 0) / items.length,
      avgNovelty: items.reduce((sum, item) => sum + item.novelty, 0) / items.length 
    });
    
    await job.updateProgress(90);
    
    // Create output
    const output: RankOutput = {
      rootId,
      generatedAt: new Date().toISOString(),
      criteria: {
        target: RANK_TARGET,
        cpsMax: 20,
      },
      items,
    };
    
    // Save result
    const outputPath = `${tmpDir}/rank.json`;
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    
    // Upload to storage
    await uploadFile(bucket, `projects/${rootId}/rank/rank.json`, outputPath, 'application/json');
    
    logger.info('Uploaded', { rootId, items: items.length });
    
    await job.updateProgress(100);

    const totalDuration = Date.now() - startTime;
    await track(userId, 'stage_completed', { 
      stage: 'rank', 
      duration: totalDuration,
      candidateCount: items.length,
      avgScore: items.reduce((sum, item) => sum + item.score, 0) / items.length,
      avgNovelty: items.reduce((sum, item) => sum + item.novelty, 0) / items.length,
      jobId: job.id
    });

    await enqueueUnique(
      QUEUES.RENDER,
      'render',
      `${rootId}:render`,
      { rootId, meta: job.data.meta || {} }
    );
    
    return {
      count: items.length,
      top3: items.slice(0, 3).map(item => item.id),
    };
    
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    logger.error('RankError', { rootId, error: error.message, totalDuration });
    
    await track(userId, 'rank_failed', { 
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
      logger.warn('CleanupFailed', { tmpDir, error: cleanupError });
    }
  }
}
