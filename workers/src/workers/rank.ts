import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import { downloadToTemp, uploadFile } from '../lib/storage';
import { computeCPS } from '../lib/cps';
import { embedBatch, cosine } from '../lib/emb';
import { hookScore } from '../lib/hook';
import { createLogger } from '../lib/logger';

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
  
  // Numbers/lists
  if (/\b\d+\b/.test(text)) {
    boost += 0.1;
  }
  
  // Keywords
  if (/\b(dica|passo|lista|top|truque|segredo)\b/i.test(text)) {
    boost += 0.1;
  }
  
  return Math.min(0.2, boost);
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
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'raw';
  const tmpDir = `/tmp/${rootId}/rank`;
  
  logger.info('RankStarted', { rootId });
  
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
    
    // Filter by duration and calculate features
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
      
      // Calculate features
      const cps = computeCPS(transcript.segments, candidate.start, candidate.end);
      const hook = hookScore(textFirst10s);
      const lenScore = clamp(1 - Math.abs(candidate.duration - RANK_TARGET) / RANK_TARGET, 0, 1);
      const silencePenalty = calculateSilencePenalty(transcript.segments, candidate.start, candidate.end);
      const keywordBoost = calculateKeywordBoost(textFull);
      
      // Calculate base score (without novelty)
      const baseScore = 0.30 * hook 
                       + 0.15 * clamp(1 - (cps.cpsAvg - 17) / 5, 0, 1)
                       + 0.15 * keywordBoost 
                       + 0.10 * lenScore 
                       - 0.10 * silencePenalty;
      
      validCandidates.push({
        ...candidate,
        textFull: textFull.slice(0, 1000), // Limit for embeddings
        textFirst10s,
        hook,
        cps,
        baseScore,
        finalScore: baseScore, // Will be updated with novelty
        novelty: 1, // Will be calculated
      });
    }
    
    logger.info('FeaturesComputed', { validCandidates: validCandidates.length });
    
    await job.updateProgress(40);
    
    // Calculate embeddings and novelty
    if (validCandidates.length > 0) {
      const embeddings = await embedBatch(validCandidates.map(c => c.textFull));
      logger.info('EmbeddingsOk', { count: embeddings.length });
      
      // Sort by base score for greedy selection
      validCandidates.sort((a, b) => b.baseScore - a.baseScore);
      
      const selected: number[] = []; // indices
      
      for (let i = 0; i < validCandidates.length; i++) {
        const candidate = validCandidates[i];
        
        // Calculate novelty (diversity)
        let maxSimilarity = 0;
        for (const selectedIdx of selected) {
          const similarity = cosine(embeddings[i], embeddings[selectedIdx]);
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }
        
        const novelty = 1 - maxSimilarity;
        candidate.novelty = novelty;
        
        // Apply penalty for near-duplicates
        let scorePenalty = 0;
        if (maxSimilarity > 0.94) {
          scorePenalty = 0.15;
        }
        
        // Calculate final score
        candidate.finalScore = candidate.baseScore + 0.20 * novelty - scorePenalty;
        
        // Add to selected if we haven't reached the limit and it's not too similar
        if (selected.length < 16 && (maxSimilarity <= 0.94 || selected.length < 8)) {
          selected.push(i);
        }
      }
      
      logger.info('DiversityApplied', { processed: validCandidates.length });
    }
    
    await job.updateProgress(70);
    
    // Sort by final score and select top K
    const TOP_K = Number(process.env.RANK_TOP_K || 12);
    validCandidates.sort((a, b) => b.finalScore - a.finalScore);
    
    const finalCandidates = validCandidates.slice(0, Math.min(TOP_K, validCandidates.length));
    
    // Generate reasons and prepare output
    const items = finalCandidates.map(candidate => {
      const silencePenalty = calculateSilencePenalty(transcript.segments, candidate.start, candidate.end);
      const keywordBoost = calculateKeywordBoost(candidate.textFull);
      const reasons = generateReasons(candidate, silencePenalty, keywordBoost);
      
      return {
        id: candidate.id,
        start: candidate.start,
        end: candidate.end,
        duration: candidate.duration,
        score: Math.round(candidate.finalScore * 100) / 100,
        novelty: Math.round(candidate.novelty * 100) / 100,
        hook: Math.round(candidate.hook * 100) / 100,
        cps: {
          avg: Math.round(candidate.cps.cpsAvg * 10) / 10,
          p95: Math.round(candidate.cps.cpsP95 * 10) / 10,
        },
        reasons,
        excerpt: candidate.excerpt,
      };
    });
    
    logger.info('Selected', { count: items.length });
    
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
    
    return {
      count: items.length,
      top3: items.slice(0, 3).map(item => item.id),
    };
    
  } catch (error: any) {
    logger.error('RankError', { rootId, error: error.message });
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