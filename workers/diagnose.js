#!/usr/bin/env node
// Diagnóstico completo do sistema
require('dotenv').config();

const Redis = require('ioredis');
const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');

console.log('🔍 DIAGNÓSTICO COMPLETO DO SISTEMA CORTAI\n');

async function testRedis() {
  console.log('1️⃣ Testando Redis...');
  try {
    const redis = new Redis(process.env.REDIS_URL);
    const result = await redis.ping();
    console.log('✅ Redis: FUNCIONANDO -', result);
    redis.disconnect();
  } catch (err) {
    console.error('❌ Redis: FALHOU -', err.message);
  }
}

async function testOpenAI() {
  console.log('\n2️⃣ Testando OpenAI API...');
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await openai.models.list();
    console.log('✅ OpenAI: FUNCIONANDO - Encontrados', result.data.length, 'modelos');
  } catch (err) {
    console.error('❌ OpenAI: FALHOU -', err.message);
    console.log('💡 Solução: Atualize a OPENAI_API_KEY no arquivo .env');
  }
}

async function testSupabase() {
  console.log('\n3️⃣ Testando Supabase...');
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const result = await supabase.from('user_jobs').select('count', { count: 'exact' });
    if (result.error) {
      console.error('❌ Supabase: FALHOU -', result.error.message);
    } else {
      console.log('✅ Supabase: FUNCIONANDO - Tabela user_jobs acessível');
    }
  } catch (err) {
    console.error('❌ Supabase: FALHOU -', err.message);
  }
}

async function testYtDlp() {
  console.log('\n4️⃣ Testando yt-dlp...');
  try {
    const { execSync } = require('child_process');
    const version = execSync('node_modules/youtube-dl-exec/bin/yt-dlp --version', { encoding: 'utf8' }).trim();
    console.log('✅ yt-dlp: FUNCIONANDO - Versão', version);
  } catch (err) {
    console.error('❌ yt-dlp: FALHOU -', err.message);
  }
}

async function main() {
  await testRedis();
  await testOpenAI();
  await testSupabase();
  await testYtDlp();
  
  console.log('\n📋 RESUMO DOS PROBLEMAS ENCONTRADOS:');
  console.log('- Se OpenAI falhou: Você precisa atualizar a OPENAI_API_KEY');
  console.log('- Se outros falharam: Verifique as configurações de rede/credenciais');
  console.log('\n🚀 PRÓXIMOS PASSOS:');
  console.log('1. Vá para https://platform.openai.com/account/api-keys');
  console.log('2. Crie uma nova API key');
  console.log('3. Atualize OPENAI_API_KEY no arquivo workers/.env');
  console.log('4. Reinicie a aplicação com npm run dev');
}

main().catch(console.error);
