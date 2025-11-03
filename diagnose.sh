#!/bin/bash

# Script para rastrear e debugar erros de render

echo "🔍 DIAGNÓSTICO COMPLETO - ERROS DE RENDER"
echo "=========================================="
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
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }

# ======================================
# 1. Verificar .env
# ======================================
log_info "1. Verificando variáveis de ambiente..."

VARS=("REDIS_URL" "VITE_SUPABASE_URL" "SUPABASE_STORAGE_BUCKET" "RENDER_PRESET" "RENDER_MAX_RETRIES")

for var in "${VARS[@]}"; do
    if grep -q "^${var}=" .env; then
        VALUE=$(grep "^${var}=" .env | cut -d'=' -f2- | cut -c1-40)
        log_success "$var = $VALUE"
    else
        log_error "$var não configurado"
    fi
done

echo ""

# ======================================
# 2. Verificar TypeScript
# ======================================
log_info "2. Verificando TypeScript compilation..."

cd workers

if npm run build > /tmp/tsc.log 2>&1; then
    log_success "Build passou"
else
    log_error "Build falhou com erros:"
    cat /tmp/tsc.log | grep -E "error|Error" | head -10
    exit 1
fi

cd ..

echo ""

# ======================================
# 3. Verificar funções de render
# ======================================
log_info "3. Verificando funções no render.ts..."

FUNCS=("validateClip" "filterAndAdjustClips" "renderClipWithRetry" "runRender")

for func in "${FUNCS[@]}"; do
    if grep -q "function $func\|const $func\|export.*function $func" workers/src/workers/render.ts; then
        log_success "Função '$func' encontrada"
    else
        log_error "Função '$func' não encontrada"
    fi
done

echo ""

# ======================================
# 4. Verificar imports
# ======================================
log_info "4. Verificando imports críticos..."

IMPORTS=(
    "enqueueUnique"
    "QUEUES"
    "runFFmpeg"
    "buildASS"
    "downloadToTemp"
    "uploadFile"
)

for imp in "${IMPORTS[@]}"; do
    if grep -q "$imp" workers/src/workers/render.ts; then
        log_success "Import '$imp' OK"
    else
        log_error "Import '$imp' faltando"
    fi
done

echo ""

# ======================================
# 5. Verificar tratamento de erro
# ======================================
log_info "5. Verificando tratamento de erros..."

if grep -q "try {" workers/src/workers/render.ts && grep -q "catch" workers/src/workers/render.ts; then
    log_success "Try/catch encontrado"
else
    log_warn "Sem try/catch detectado"
fi

if grep -q "log.error" workers/src/workers/render.ts; then
    log_success "Log de erro detectado"
fi

echo ""

# ======================================
# 6. Sumário
# ======================================
echo "=========================================="
log_success "DIAGNÓSTICO COMPLETO!"
echo "=========================================="
echo ""
log_info "Próximos passos:"
echo "   1. npm run dev (em /clipify-studio)"
echo "   2. cd workers && npm run dev (em outro terminal)"
echo "   3. Acesse http://localhost:8080"
echo "   4. Envie um vídeo YouTube"
echo "   5. Monitore logs para [ERROR]"
echo ""
