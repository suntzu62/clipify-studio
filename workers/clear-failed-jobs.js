#!/usr/bin/env node
require('dotenv/config');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const url = process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.REDIS_TLS_URL || 'redis://localhost:6379';

// Parse Redis URL to get host, port, and password
const parseRedisUrl = (url) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  };
};

const connection = parseRedisUrl(url);

const QUEUES = {
  INGEST: 'cortai_ingest',
  TRANSCRIBE: 'cortai_transcribe',
  SCENES: 'cortai_scenes',
  RANK: 'cortai_rank',
  RENDER: 'cortai_render',
  TEXTS: 'cortai_texts',
  EXPORT: 'cortai_export',
};

async function clearFailedJobs() {
  console.log('🧹 Limpando jobs falhados...');
  
  for (const [name, queueName] of Object.entries(QUEUES)) {
    try {
      const queue = new Queue(queueName, { connection });
      
      // Get failed jobs count before cleanup
      const failed = await queue.getFailed();
      console.log(`📋 ${name}: ${failed.length} jobs falhados`);
      
      if (failed.length > 0) {
        // Clean failed jobs
        await queue.clean(0, 1000, 'failed');
        console.log(`✅ ${name}: Jobs falhados removidos`);
      }
      
      await queue.close();
    } catch (error) {
      console.error(`❌ Erro ao limpar ${name}:`, error.message);
    }
  }
  
  console.log('🎉 Limpeza concluída!');
  process.exit(0);
}

clearFailedJobs().catch(console.error);
