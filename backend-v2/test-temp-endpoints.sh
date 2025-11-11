#!/bin/bash

# Script para testar os endpoints de configuração temporária
# Uso: ./test-temp-endpoints.sh

API_KEY="93560857g"
BASE_URL="http://localhost:3001"

echo "======================================"
echo "Testando Endpoints de Config Temporária"
echo "======================================"
echo ""

# 1. Criar configuração temporária
echo "1. POST /jobs/temp - Criar configuração temporária"
echo "--------------------------------------"

TEMP_RESPONSE=$(curl -s -X POST "$BASE_URL/jobs/temp" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "userId": "test-user-123",
    "sourceType": "youtube"
  }')

echo "Response:"
echo "$TEMP_RESPONSE" | jq '.'
echo ""

# Extrair tempId
TEMP_ID=$(echo "$TEMP_RESPONSE" | jq -r '.tempId')

if [ "$TEMP_ID" == "null" ] || [ -z "$TEMP_ID" ]; then
  echo "❌ ERRO: Não foi possível criar configuração temporária"
  exit 1
fi

echo "✅ Configuração criada com tempId: $TEMP_ID"
echo ""

# 2. Buscar configuração temporária
echo "2. GET /jobs/temp/:tempId - Buscar configuração"
echo "--------------------------------------"

GET_RESPONSE=$(curl -s "$BASE_URL/jobs/temp/$TEMP_ID" \
  -H "x-api-key: $API_KEY")

echo "Response:"
echo "$GET_RESPONSE" | jq '.'
echo ""

# Verificar se retornou dados
RETURNED_TEMP_ID=$(echo "$GET_RESPONSE" | jq -r '.tempId')

if [ "$RETURNED_TEMP_ID" == "$TEMP_ID" ]; then
  echo "✅ Configuração recuperada com sucesso"
else
  echo "❌ ERRO: Configuração não encontrada"
  exit 1
fi
echo ""

# 3. Iniciar processamento
echo "3. POST /jobs/temp/:tempId/start - Iniciar processamento"
echo "--------------------------------------"

START_RESPONSE=$(curl -s -X POST "$BASE_URL/jobs/temp/$TEMP_ID/start" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "clipSettings": {
      "aiClipping": true,
      "model": "ClipAnything",
      "targetDuration": 60,
      "minDuration": 30,
      "maxDuration": 90,
      "clipCount": 8
    },
    "subtitlePreferences": {
      "position": "bottom",
      "format": "multi-line",
      "font": "Inter",
      "fontSize": 32,
      "fontColor": "#FFFFFF",
      "backgroundColor": "#000000",
      "backgroundOpacity": 0.85,
      "bold": true,
      "italic": false,
      "outline": true,
      "outlineColor": "#000000",
      "outlineWidth": 3,
      "shadow": true,
      "shadowColor": "#000000",
      "maxCharsPerLine": 28,
      "marginVertical": 80
    }
  }')

echo "Response:"
echo "$START_RESPONSE" | jq '.'
echo ""

# Extrair jobId
JOB_ID=$(echo "$START_RESPONSE" | jq -r '.jobId')

if [ "$JOB_ID" == "null" ] || [ -z "$JOB_ID" ]; then
  echo "❌ ERRO: Não foi possível iniciar job"
  exit 1
fi

echo "✅ Job criado com sucesso: $JOB_ID"
echo ""

# 4. Verificar se temp config foi deletada
echo "4. Verificar se temp config foi deletada"
echo "--------------------------------------"

DELETE_CHECK=$(curl -s "$BASE_URL/jobs/temp/$TEMP_ID" \
  -H "x-api-key: $API_KEY")

ERROR_CHECK=$(echo "$DELETE_CHECK" | jq -r '.error')

if [ "$ERROR_CHECK" == "CONFIG_NOT_FOUND" ]; then
  echo "✅ Configuração temporária foi deletada corretamente"
else
  echo "⚠️  AVISO: Configuração temporária ainda existe (pode ser Redis delay)"
fi
echo ""

# 5. Verificar status do job
echo "5. GET /jobs/:jobId - Verificar status do job"
echo "--------------------------------------"

JOB_STATUS=$(curl -s "$BASE_URL/jobs/$JOB_ID" \
  -H "x-api-key: $API_KEY")

echo "Response:"
echo "$JOB_STATUS" | jq '.state, .progress'
echo ""

echo "======================================"
echo "✅ Todos os testes completados!"
echo "======================================"
echo ""
echo "Resumo:"
echo "  - TempId: $TEMP_ID"
echo "  - JobId: $JOB_ID"
echo ""
echo "Acompanhe o job em: $BASE_URL/jobs/$JOB_ID"
