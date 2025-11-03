#!/bin/bash

echo "🚀 ClipifyStudio Backend V2 - Setup"
echo "===================================="
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale Node.js 20+ primeiro."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ é necessário. Versão atual: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detectado"

# Verificar Redis
if ! command -v redis-cli &> /dev/null; then
    echo "⚠️  Redis não encontrado. Instale Redis para rodar os jobs."
    echo "   Ubuntu/Debian: sudo apt install redis-server"
    echo "   Mac: brew install redis"
else
    echo "✅ Redis detectado"

    # Testar conexão
    if redis-cli ping &> /dev/null; then
        echo "✅ Redis está rodando"
    else
        echo "⚠️  Redis não está rodando. Inicie com: sudo systemctl start redis"
    fi
fi

# Instalar dependências
echo ""
echo "📦 Instalando dependências..."
npm install

# Criar .env se não existir
if [ ! -f .env ]; then
    echo ""
    echo "📝 Criando arquivo .env..."
    cp .env.example .env
    echo "⚠️  IMPORTANTE: Configure as variáveis de ambiente em .env"
else
    echo "✅ Arquivo .env já existe"
fi

echo ""
echo "✅ Setup completo!"
echo ""
echo "📋 Próximos passos:"
echo "   1. Configure as variáveis em .env"
echo "   2. Execute: npm run dev"
echo "   3. Acesse: http://localhost:3001/health"
echo ""
