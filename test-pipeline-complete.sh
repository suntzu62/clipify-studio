#!/bin/bash

# Script de teste completo do pipeline
# Use: bash test-pipeline-complete.sh

set -e

echo "🎬 TESTE COMPLETO DO PIPELINE"
echo "=============================="
echo ""

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

cd /home/usuario/Documentos/cortai/clipify-studio

# ======================================
# 1. Validar .env
# ======================================
log_info "1️⃣ Validando arquivo .env..."

if [ ! -f ".env" ]; then
    log_error ".env não encontrado"
    exit 1
fi

# Verificar variáveis críticas
check_env() {
    local var=$1
    if grep -q "^$var=" .env; then
        local value=$(grep "^$var=" .env | cut -d'=' -f2-)
        log_success "$var definido"
        echo "   ${value:0:50}..."
    else
        log_error "$var não encontrado"
        exit 1
    fi
}

check_env "REDIS_URL"
check_env "VITE_SUPABASE_URL"
check_env "SUPABASE_STORAGE_BUCKET"
check_env "RENDER_PRESET"

echo ""

# ======================================
# 2. Testar Redis
# ======================================
log_info "2️⃣ Testando conexão Redis..."

bash test-redis-connection.sh || {
    log_error "Redis não está conectando"
    exit 1
}

echo ""

# ======================================
# 3. Verificar dependências
# ======================================
log_info "3️⃣ Verificando dependências..."

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    log_success "Node.js: $NODE_VERSION"
else
    log_error "Node.js não instalado"
    exit 1
fi

# npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    log_success "npm: $NPM_VERSION"
else
    log_error "npm não instalado"
    exit 1
fi

# FFmpeg
if command -v ffmpeg &> /dev/null; then
    FFMPEG_VERSION=$(ffmpeg -version 2>/dev/null | head -1)
    log_success "FFmpeg: $(echo $FFMPEG_VERSION | cut -d' ' -f1-3)"
else
    log_warn "FFmpeg não instalado - necessário para render"
fi

echo ""

# ======================================
# 4. Verificar node_modules
# ======================================
log_info "4️⃣ Verificando node_modules..."

if [ -d "node_modules" ]; then
    log_success "node_modules/ encontrado (main)"
else
    log_warn "Instalando dependências (main)..."
    npm install --silent
fi

if [ -d "workers/node_modules" ]; then
    log_success "node_modules/ encontrado (workers)"
else
    log_warn "Instalando dependências (workers)..."
    cd workers && npm install --silent && cd ..
fi

echo ""

# ======================================
# 5. Build TypeScript
# ======================================
log_info "5️⃣ Compilando TypeScript..."

cd workers
npm run build 2>&1 | tail -10
BUILD_EXIT=$?
cd ..

if [ $BUILD_EXIT -eq 0 ]; then
    log_success "Build completado com sucesso"
else
    log_error "Build falhou"
    exit 1
fi

echo ""

# ======================================
# 6. Testar imports
# ======================================
log_info "6️⃣ Testando imports principais..."

node -e "
try {
    require('./workers/dist/src/lib/bullmq');
    console.log('   ✅ bullmq.ts compila');
    
    require('./workers/dist/src/workers/render');
    console.log('   ✅ render.ts compila');
    
    console.log('   ✅ Todos os imports OK');
} catch (err) {
    console.error('   ❌ Erro ao importar:', err.message);
    process.exit(1);
}
" || exit 1

echo ""

# ======================================
# 7. Verificar arquivos de render
# ======================================
log_info "7️⃣ Verificando funções de render..."

node -e "
const fs = require('fs');
const content = fs.readFileSync('./workers/src/workers/render.ts', 'utf-8');

const checks = [
    { name: 'validateClip', pattern: /function validateClip/ },
    { name: 'filterAndAdjustClips', pattern: /function filterAndAdjustClips/ },
    { name: 'renderClipWithRetry', pattern: /function renderClipWithRetry/ },
    { name: 'runRender', pattern: /export async function runRender/ },
    { name: 'RENDER_MAX_RETRIES', pattern: /RENDER_MAX_RETRIES/ },
];

let allOk = true;
for (const check of checks) {
    if (check.pattern.test(content)) {
        console.log(\`   ✅ \${check.name} encontrado\`);
    } else {
        console.error(\`   ❌ \${check.name} não encontrado\`);
        allOk = false;
    }
}

process.exit(allOk ? 0 : 1);
" || exit 1

echo ""

# ======================================
# 8. Sumário
# ======================================
echo "=============================="
log_success "TODOS OS TESTES PASSARAM! ✅"
echo "=============================="
echo ""
log_info "Sistema pronto para iniciar:"
echo "   1. npm run dev (inicia servidor)"
echo "   2. Abra http://localhost:8080"
echo "   3. Envie um vídeo YouTube"
echo "   4. Monitore os logs de render"
echo ""
log_info "Variáveis de render em .env:"
grep "^RENDER_" .env | sed 's/^/   • /'
echo ""
