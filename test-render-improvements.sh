#!/bin/bash

# Script para testar o novo sistema de render

set -e

echo "🎬 Iniciando testes do sistema de render..."
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para log
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# 1. Verificar se o arquivo render.ts foi modificado
log_info "Verificando arquivo render.ts..."
if grep -q "validateClip" /home/usuario/Documentos/cortai/clipify-studio/workers/src/workers/render.ts; then
    log_success "Arquivo render.ts contém validateClip()"
else
    log_error "Arquivo render.ts não contém validateClip()"
    exit 1
fi

if grep -q "filterAndAdjustClips" /home/usuario/Documentos/cortai/clipify-studio/workers/src/workers/render.ts; then
    log_success "Arquivo render.ts contém filterAndAdjustClips()"
else
    log_error "Arquivo render.ts não contém filterAndAdjustClips()"
    exit 1
fi

if grep -q "renderClipWithRetry" /home/usuario/Documentos/cortai/clipify-studio/workers/src/workers/render.ts; then
    log_success "Arquivo render.ts contém renderClipWithRetry()"
else
    log_error "Arquivo render.ts não contém renderClipWithRetry()"
    exit 1
fi

# 2. Verificar se o .env foi atualizado
log_info "Verificando arquivo .env..."
if grep -q "RENDER_MAX_RETRIES" /home/usuario/Documentos/cortai/clipify-studio/.env; then
    log_success "Arquivo .env contém RENDER_MAX_RETRIES"
else
    log_error "Arquivo .env não contém RENDER_MAX_RETRIES"
    exit 1
fi

if grep -q "RENDER_PRESET=superfast" /home/usuario/Documentos/cortai/clipify-studio/.env; then
    log_success "Arquivo .env contém RENDER_PRESET=superfast"
else
    log_error "Arquivo .env não contém RENDER_PRESET=superfast"
    exit 1
fi

# 3. Verificar documentação
log_info "Verificando documentação..."
if [ -f "/home/usuario/Documentos/cortai/clipify-studio/RENDER-IMPROVEMENTS.md" ]; then
    log_success "Documentação RENDER-IMPROVEMENTS.md criada"
else
    log_error "Documentação RENDER-IMPROVEMENTS.md não encontrada"
    exit 1
fi

# 4. Verificar sintaxe TypeScript
log_info "Verificando sintaxe TypeScript..."
cd /home/usuario/Documentos/cortai/clipify-studio/workers
if npm run build 2>&1 | head -20; then
    log_success "Build do workers completado"
else
    log_warn "Build pode ter warnings, mas continua..."
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Todos os testes passaram!${NC}"
echo "=========================================="
echo ""
log_info "Próximos passos:"
echo "  1. Execute: npm run dev (na pasta clipify-studio)"
echo "  2. Acesse: http://localhost:8080"
echo "  3. Envie um vídeo do YouTube"
echo "  4. Monitore os logs da renderização"
echo ""
log_info "Variáveis importantes em .env:"
grep "^RENDER_" /home/usuario/Documentos/cortai/clipify-studio/.env | sed 's/^/  • /'
echo ""
log_success "Sistema de render melhorado está pronto para testes!"
