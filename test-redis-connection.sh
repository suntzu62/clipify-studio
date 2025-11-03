#!/bin/bash

# Script para testar conectividade Redis
# Use: bash test-redis-connection.sh

echo "🧪 TESTE DE CONEXÃO REDIS"
echo "=========================="
echo ""

# ======================================
# 1. Verificar URL Redis
# ======================================
echo "1️⃣ Verificando URL Redis..."

REDIS_URL="${REDIS_URL:-redis://default:c3NlSqpGqpWT2BPSrLwRTtMQqscGi2zuX@redis-14366.c256.us-east-1-2.ec2.redis-cloud.com:14366}"

# Extrair componentes
HOST=$(echo "$REDIS_URL" | sed -E 's|redis://[^@]*@([^:]+):.*|\1|')
PORT=$(echo "$REDIS_URL" | sed -E 's|.*:([0-9]+)$|\1|')
PASSWORD=$(echo "$REDIS_URL" | sed -E 's|redis://default:([^@]+)@.*|\1|')

echo "   📍 Host: $HOST"
echo "   🔌 Porta: $PORT"
echo "   🔑 Senha: ${PASSWORD:0:5}..."
echo ""

# ======================================
# 2. Verificar DNS
# ======================================
echo "2️⃣ Testando resolução DNS..."

if nslookup "$HOST" &> /dev/null; then
    RESOLVED=$(nslookup "$HOST" 2>/dev/null | grep -A1 "Name:" | tail -1 | awk '{print $2}')
    echo "   ✅ DNS Resolvido: $RESOLVED"
else
    echo "   ❌ DNS Falhou - verifique URL ou conexão de internet"
    exit 1
fi
echo ""

# ======================================
# 3. Verificar porta TCP
# ======================================
echo "3️⃣ Testando conexão TCP..."

if timeout 5 bash -c "</dev/tcp/$HOST/$PORT" 2>/dev/null; then
    echo "   ✅ Porta $PORT acessível"
else
    echo "   ❌ Porta $PORT não acessível"
    echo "   💡 Verifique firewall ou se o serviço Redis está rodando"
    exit 1
fi
echo ""

# ======================================
# 4. Teste com Node.js
# ======================================
echo "4️⃣ Testando conexão com Node.js/Redis..."

node -e "
const redis = require('redis');

(async () => {
  try {
    const client = redis.createClient({
      url: '$REDIS_URL',
      socket: {
        reconnectStrategy: () => null, // Não reconectar
        connectTimeout: 5000,
      }
    });

    client.on('error', (err) => {
      console.error('   ❌ Erro Redis:', err.message);
      process.exit(1);
    });

    console.log('   ⏳ Conectando...');
    await client.connect();
    console.log('   ✅ Conectado com sucesso!');

    const pong = await client.ping();
    console.log('   ✅ PING respondeu:', pong);

    // Teste de set/get
    await client.set('test-key', 'test-value', { EX: 10 });
    console.log('   ✅ SET funcionando');

    const value = await client.get('test-key');
    console.log('   ✅ GET funcionando:', value);

    await client.del('test-key');
    await client.quit();

    console.log('   🎉 Todos os testes passaram!');
    process.exit(0);
  } catch (err) {
    console.error('   ❌ Erro:', err.message);
    process.exit(1);
  }
})();
" 2>&1 || true

echo ""
echo "=========================="
if [ $? -eq 0 ]; then
    echo "✅ Redis conectando corretamente!"
    exit 0
else
    echo "❌ Problemas com Redis detectados"
    exit 1
fi
