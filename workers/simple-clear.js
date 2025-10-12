#!/usr/bin/env node
require('dotenv/config');
const Redis = require('ioredis');

const url = process.env.REDIS_URL || 'redis://localhost:6379';

async function clearRedisQueues() {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
    connectTimeout: 5000
  });
  
  try {
    console.log('🔄 Conectando ao Redis...');
    await redis.ping();
    console.log('✅ Conectado ao Redis');
    
    // Clear all cortai queue keys
    const keys = await redis.keys('bull:cortai_*');
    console.log(`📋 Encontradas ${keys.length} chaves de filas`);
    
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log('🧹 Filas limpas!');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    redis.disconnect();
    console.log('🎉 Limpeza concluída!');
  }
}

clearRedisQueues();
