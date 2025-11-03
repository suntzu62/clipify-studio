#!/bin/bash

# Script de teste simplificado (sem validação de DNS externo)

echo "🚀 TESTE RÁPIDO - VALIDAÇÃO LOCAL"
echo "================================="
echo ""

cd /home/usuario/Documentos/cortai/clipify-studio

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

# ======================================
# 1. Validar .env
# ======================================
log_info "1. Validando .env..."

if [ ! -f ".env" ]; then
    log_error ".env não encontrado"
    exit 1
fi

check_var() {
    local var=$1
    if grep -q "^${var}=" .env; then
        log_success "$var definido"
    else
        log_error "$var não encontrado"
        exit 1
    fi
}

check_var "REDIS_URL"
check_var "VITE_SUPABASE_URL"
check_var "RENDER_PRESET"
check_var "RENDER_MAX_RETRIES"

echo ""

# ======================================
# 2. Verificar sintaxe de .env
# ======================================
log_info "2. Validando sintaxe .env..."

if grep -E "redis://.*redis-cloud\.com" .env > /dev/null; then
    log_success "Redis URL corrigida (redis-cloud.com)"
else
    log_error "Redis URL ainda com erro (deve ser redis-cloud.com)"
    exit 1
fi

echo ""

# ======================================
# 3. Verificar arquivo render.ts
# ======================================
log_info "3. Validando render.ts..."

RENDER_FILE="workers/src/workers/render.ts"

check_function() {
    local func=$1
    if grep -q "function $func\|const $func" "$RENDER_FILE"; then
        log_success "Função '$func' encontrada"
    else
        log_error "Função '$func' não encontrada"
        exit 1
    fi
}

check_function "validateClip"
check_function "filterAndAdjustClips"
check_function "renderClipWithRetry"

echo ""

# ======================================
# 4. Verificar build
# ======================================
log_info "4. Testando build TypeScript..."

cd workers

if npm run build > /tmp/build.log 2>&1; then
    log_success "Build completado"
else
    log_error "Build falhou"
    cat /tmp/build.log | tail -20
    exit 1
fi

cd ..

echo ""

# ======================================
# 5. Verificar arquivos gerados
# ======================================
log_info "5. Verificando arquivos compilados..."

if [ -f "workers/dist/src/workers/render.js" ]; then
    log_success "render.js compilado"
else
    log_error "render.js não encontrado"
    exit 1
fi

if [ -f "workers/dist/src/lib/bullmq.js" ]; then
    log_success "bullmq.js compilado"
else
    log_error "bullmq.js não encontrado"
    exit 1
fi

echo ""

# ======================================
# 6. Sumário
# ======================================
echo "================================="
log_success "TODOS OS TESTES PASSARAM!"
echo "================================="
echo ""
log_info "Próximos passos:"
echo "   1. npm run dev (inicia servidor em http://localhost:8080)"
echo "   2. Em outro terminal: cd workers && npm run dev"
echo "   3. Teste enviando um vídeo YouTube"
echo ""
