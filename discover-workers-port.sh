#!/bin/bash

# 🔧 Script para descobrir e corrigir a porta dos workers

echo "🔍 DESCOBRINDO PORTA DOS WORKERS"
echo "================================="
echo ""

cd /home/usuario/Documentos/cortai/clipify-studio/workers

# 1. Verificar PORT no .env
echo "1️⃣ Verificando PORT em .env..."
if grep -q "^PORT=" ../../.env; then
    PORT=$(grep "^PORT=" ../../.env | cut -d'=' -f2)
    echo "   📍 PORT encontrado: $PORT"
else
    echo "   ℹ️  PORT não definido em .env"
    PORT="8787"
    echo "   📍 Usando default: $PORT"
fi

echo ""

# 2. Verificar código
echo "2️⃣ Verificando server.ts..."
if grep -q "const PORT = Number(process.env.PORT" src/server.ts; then
    DEFAULT=$(grep "const PORT = Number(process.env.PORT" src/server.ts | grep -o "'[^']*'" | tr -d "'")
    echo "   ✅ Port default configurado: $DEFAULT"
else
    echo "   ⚠️  Não conseguiu encontrar PORT em server.ts"
fi

echo ""

# 3. Sugerir correção
echo "3️⃣ Configuração sugerida:"
echo ""
echo "   📝 Adicione ao .env:"
echo "      PORT=3435"
echo ""
echo "   Ou use variável de ambiente:"
echo "      PORT=3435 npm run dev"
echo ""
echo "   Ou em production (Render):"
echo "      PORT será automaticamente injetado"
echo ""

# 4. Verificar se está rodando
echo "4️⃣ Verificando se está rodando..."
if curl -s http://localhost:3435/health > /dev/null 2>&1; then
    echo "   ✅ Workers rodando em http://localhost:3435"
elif curl -s http://localhost:8787/health > /dev/null 2>&1; then
    echo "   ✅ Workers rodando em http://localhost:8787"
else
    echo "   ⚠️  Workers não estão rodando"
    echo "      Execute: npm run dev (em workers/)"
fi

echo ""
echo "================================="
