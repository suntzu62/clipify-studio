#!/usr/bin/env tsx
/**
 * Script para diagnosticar estrutura de jobs existentes
 * Execução: npx tsx src/scripts/diagnose-existing-jobs.ts
 */

import { Queue } from 'bullmq';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';

const logger = createLogger('diagnose-jobs');

const videoQueue = new Queue('video-processing', {
  connection: {
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
  },
});

async function diagnoseExistingJobs() {
  logger.info('Fetching completed jobs...');

  try {
    // Buscar alguns jobs completados
    const completedJobs = await videoQueue.getCompleted(0, 5);

    logger.info(`Found ${completedJobs.length} completed jobs`);

    if (completedJobs.length === 0) {
      logger.warn('No completed jobs found');
      return;
    }

    // Analisar o primeiro job em detalhes
    const job = completedJobs[0];
    const jobId = job.id!;

    console.log('\n========================================');
    console.log('JOB ID:', jobId);
    console.log('========================================\n');

    console.log('--- JOB DATA ---');
    console.log(JSON.stringify(job.data, null, 2));

    console.log('\n--- JOB RETURN VALUE ---');
    const result = job.returnvalue;
    console.log('Status:', result?.status);
    console.log('Processing Time:', result?.processingTime);
    console.log('Clips Count:', result?.clips?.length || 0);

    if (result?.clips && result.clips.length > 0) {
      console.log('\n--- FIRST CLIP STRUCTURE ---');
      const firstClip = result.clips[0];
      console.log(JSON.stringify(firstClip, null, 2));
    }

    console.log('\n--- CHECKING FOR REPROCESS DATA IN REDIS ---');
    const { redis } = await import('../config/redis.js');

    const reprocessKey = `reprocess:${jobId}`;
    const reprocessData = await redis.get(reprocessKey);

    if (reprocessData) {
      console.log('✅ Found reprocess data in Redis');
      const parsed = JSON.parse(reprocessData);
      console.log('Video Path:', parsed.videoPath);
      console.log('Has Transcript:', !!parsed.transcript);
      console.log('Transcript Segments:', parsed.transcript?.segments?.length || 0);
    } else {
      console.log('❌ No reprocess data in Redis');
    }

    // Verificar se clip tem transcript completo
    if (result?.clips && result.clips.length > 0) {
      const firstClip = result.clips[0];
      console.log('\n--- CLIP TRANSCRIPT ANALYSIS ---');
      console.log('Has start:', firstClip.start !== undefined);
      console.log('Has end:', firstClip.end !== undefined);
      console.log('Has transcript field:', !!firstClip.transcript);

      if (firstClip.transcript) {
        console.log('Transcript type:', typeof firstClip.transcript);
        if (typeof firstClip.transcript === 'string') {
          console.log('Transcript (string):', firstClip.transcript.substring(0, 200));
        } else {
          console.log('Transcript structure:', JSON.stringify(firstClip.transcript, null, 2).substring(0, 500));
        }
      }

      // Check ALL fields in the clip object
      console.log('\n--- ALL CLIP FIELDS ---');
      console.log('Fields:', Object.keys(firstClip).join(', '));
    }

    // Check if there's a global transcript somewhere in the job
    console.log('\n--- SEARCHING FOR FULL TRANSCRIPT ---');
    const jobDataStr = JSON.stringify(job);
    const hasSegments = jobDataStr.includes('segments');
    const hasWordTimestamps = jobDataStr.includes('"start":') && jobDataStr.includes('"text":');

    console.log('Job data contains "segments":', hasSegments);
    console.log('Job data contains word timestamps:', hasWordTimestamps);

    if (hasSegments) {
      // Try to find and extract segments
      try {
        const jobObj = JSON.parse(jobDataStr);
        const findSegments = (obj: any, path = ''): any => {
          if (!obj || typeof obj !== 'object') return null;

          if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
              const result = findSegments(obj[i], `${path}[${i}]`);
              if (result) return result;
            }
          } else {
            if (obj.segments && Array.isArray(obj.segments)) {
              console.log(`\n✅ Found segments array at path: ${path}`);
              console.log('Segments count:', obj.segments.length);
              if (obj.segments.length > 0) {
                console.log('\nFirst segment:');
                console.log(JSON.stringify(obj.segments[0], null, 2));
              }
              return obj.segments;
            }

            for (const key in obj) {
              const result = findSegments(obj[key], path ? `${path}.${key}` : key);
              if (result) return result;
            }
          }
          return null;
        };

        findSegments(jobObj);
      } catch (e) {
        console.log('Error parsing job:', e);
      }
    }

    console.log('\n========================================');
    console.log('ANALYSIS COMPLETE');
    console.log('========================================\n');

    await redis.quit();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to diagnose jobs');
    throw error;
  } finally {
    await videoQueue.close();
  }
}

diagnoseExistingJobs();
