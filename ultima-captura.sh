#!/bin/bash
# Script para encontrar a captura de tela mais recente

SCREENSHOTS_DIR="$HOME/Imagens/Capturas de tela"

# Verifica se o diretório existe
if [ ! -d "$SCREENSHOTS_DIR" ]; then
    echo "Erro: Diretório de capturas não encontrado: $SCREENSHOTS_DIR"
    exit 1
fi

# Encontra o arquivo mais recente (por data de modificação)
LATEST=$(ls -t "$SCREENSHOTS_DIR"/*.png 2>/dev/null | head -n 1)

if [ -z "$LATEST" ]; then
    echo "Erro: Nenhuma captura de tela encontrada"
    exit 1
fi

# Retorna o caminho completo
echo "$LATEST"
