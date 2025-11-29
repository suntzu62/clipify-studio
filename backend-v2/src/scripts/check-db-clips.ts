#!/usr/bin/env tsx
/**
 * Script para verificar se clips no banco têm transcript completo
 * Execução: npx tsx src/scripts/check-db-clips.ts
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';

const logger = createLogger('check-db-clips');
const supabase = createClient(env.supabase.url, env.supabase.serviceKey);

async function checkDatabaseClips() {
  logger.info('Checking clips in Supabase database...');

  try {
    // Buscar alguns clips do banco
    const { data: clips, error } = await supabase
      .from('clips')
      .select('*')
      .limit(1);

    if (error) {
      throw error;
    }

    if (!clips || clips.length === 0) {
      console.log('\n❌ No clips found in database');
      return;
    }

    const clip = clips[0];

    console.log('\n========================================');
    console.log('CLIP FROM DATABASE');
    console.log('========================================\n');
    console.log('ID:', clip.id);
    console.log('Job ID:', clip.job_id);
    console.log('Title:', clip.title);
    console.log('Start Time:', clip.start_time);
    console.log('End Time:', clip.end_time);
    console.log('Duration:', clip.duration);

    console.log('\n--- TRANSCRIPT FIELD ---');
    if (clip.transcript) {
      console.log('Has transcript: YES');
      console.log('Type:', typeof clip.transcript);

      if (typeof clip.transcript === 'object') {
        console.log('Is Array:', Array.isArray(clip.transcript));

        if (Array.isArray(clip.transcript)) {
          console.log('Segments Count:', clip.transcript.length);
          if (clip.transcript.length > 0) {
            console.log('\nFirst segment structure:');
            console.log(JSON.stringify(clip.transcript[0], null, 2));
          }
        } else {
          console.log('Structure:');
          console.log(JSON.stringify(clip.transcript, null, 2).substring(0, 500));
        }
      } else {
        console.log('Content (first 200 chars):', clip.transcript.substring(0, 200));
      }
    } else {
      console.log('Has transcript: NO ❌');
    }

    console.log('\n========================================\n');

  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to check database clips');
    throw error;
  }
}

checkDatabaseClips();
