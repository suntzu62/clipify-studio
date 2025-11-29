#!/usr/bin/env tsx
/**
 * Script para popular Redis com dados de reprocessamento dos vídeos existentes
 * Execução: npx tsx src/scripts/populate-reprocess-data.ts
 */

import { Queue } from 'bullmq';
import { createLogger } from '../config/logger.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';

const logger = createLogger('populate-reprocess');

const videoQueue = new Queue('video-processing', {
  connection: {
    host: env.redis.host,
    port: env.redis.port,
  },
});

async function populateReprocessData() {
  logger.info('Starting to populate reprocess data from existing jobs...');

  try {
    // Buscar todos os jobs completados
    const completedJobs = await videoQueue.getCompleted(0, 1000);

    logger.info(`Found ${completedJobs.length} completed jobs`);

    let populatedJobs = 0;
    let populatedClips = 0;

    for (const job of completedJobs) {
      const jobId = job.id!;
      const result = job.returnvalue;

      if (!result || !result.clips) {
        logger.warn({ jobId }, 'Job has no result, skipping');
        continue;
      }

      // Verificar se já existe dados de reprocessamento
      const existingData = await redis.get(`reprocess:${jobId}`);
      if (existingData) {
        logger.info({ jobId }, 'Reprocess data already exists, skipping');
        continue;
      }

      // Extrair dados necessários do job
      const jobData = job.data;

      // PROBLEMA: videoPath não está salvo no job.data nem no result
      // Precisamos buscar do Supabase ou usar um caminho padrão

      logger.info({ jobId, clipCount: result.clips.length }, 'Processing job');

      // Salvar dados de cada clip
      for (const clip of result.clips) {
        const clipReprocessKey = `reprocess:${jobId}:${clip.id}`;

        await redis.set(
          clipReprocessKey,
          JSON.stringify({
            id: clip.id,
            start: clip.start,
            end: clip.end,
            title: clip.title,
          }),
          'EX',
          60 * 60 * 24 * 30 // 30 days
        );

        populatedClips++;
      }

      logger.info({ jobId, clips: result.clips.length }, 'Job clips saved to Redis');
      populatedJobs++;
    }

    logger.info(
      { populatedJobs, populatedClips },
      'Reprocess data population completed'
    );
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to populate reprocess data');
    throw error;
  } finally {
    await videoQueue.close();
    await redis.quit();
  }
}

populateReprocessData();
