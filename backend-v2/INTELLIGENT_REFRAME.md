# 🎯 Reenquadramento Inteligente

Sistema de reenquadramento automático de vídeos usando detecção de faces com IA para converter vídeos horizontais em formatos verticais/quadrados mantendo o assunto principal em foco.

## 📋 Funcionalidades

- ✅ **Detecção automática de faces** usando face-api.js
- ✅ **Múltiplos formatos suportados**: 9:16 (Shorts/Reels), 1:1 (Instagram), 4:5 (Portrait), 16:9 (YouTube)
- ✅ **Crop inteligente** que mantém pessoas centralizadas
- ✅ **Fallback automático** para crop central quando não detecta faces
- ✅ **Interface visual completa** com configurações avançadas

## 🚀 Como Usar

### 1. Instalação das Dependências

As dependências já foram instaladas automaticamente:
```bash
npm install
```

### 2. Download dos Modelos de Face Detection (Opcional)

**Opção A: Download Automático (Recomendado)**

Execute o script de download:
```bash
npm run download-models
```

**Opção B: Download Manual**

Se o script automático falhar, baixe manualmente:

1. Acesse: https://github.com/vladmandic/face-api/tree/master/model
2. Baixe os seguintes arquivos para `backend-v2/models/`:
   - `tiny_face_detector_model-weights_manifest.json`
   - `tiny_face_detector_model-shard1`

**Opção C: Usar sem Modelos**

O sistema funciona mesmo sem os modelos! Neste caso, usará **crop central** em vez de detecção de faces.

### 3. Usar no Código

#### Backend - Renderização com Reframe

```typescript
import { renderClips } from './services/rendering.js';
import { ReframeOptions } from './types/index.js';

const reframeOptions: ReframeOptions = {
  enabled: true,
  targetAspectRatio: '9:16', // TikTok/Reels/Shorts
  autoDetect: true, // Detectar faces automaticamente
  sampleInterval: 2, // Analisar a cada 2 segundos
  minConfidence: 0.5, // Confiança mínima de 50%
};

const result = await renderClips(
  videoPath,
  segments,
  transcript,
  {
    format: '9:16',
    addSubtitles: true,
    reframeOptions, // ← Adicione aqui!
  }
);
```

#### Frontend - UI de Configuração

```tsx
import { ReframePanel } from '@/components/editor/ReframePanel';

function EditorPage() {
  const handleApplyReframe = (settings) => {
    console.log('Aplicando reframe:', settings);
    // Enviar para API backend
  };

  return (
    <ReframePanel
      onApply={handleApplyReframe}
      initialSettings={{
        enabled: true,
        targetAspectRatio: '9:16',
        autoDetect: true,
      }}
    />
  );
}
```

## 🎨 Formatos Suportados

| Formato | Aspect Ratio | Resolução | Plataformas |
|---------|--------------|-----------|-------------|
| 📱 Vertical | 9:16 | 1080x1920 | TikTok, Instagram Reels, YouTube Shorts |
| ⬜ Quadrado | 1:1 | 1080x1080 | Instagram Post |
| 🖼️ Retrato | 4:5 | 1080x1350 | Instagram Portrait |
| 🖥️ Paisagem | 16:9 | 1920x1080 | YouTube, Desktop |

## ⚙️ Opções de Configuração

### ReframeOptions

```typescript
interface ReframeOptions {
  enabled: boolean;              // Habilitar reenquadramento
  targetAspectRatio: AspectRatio; // Formato desejado
  autoDetect: boolean;           // Detectar faces com IA
  sampleInterval?: number;       // Intervalo de amostragem (1-10s)
  minConfidence?: number;        // Confiança mínima (0.0-1.0)
  manualROI?: {                  // ROI manual (opcional)
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

### Valores Padrão

```typescript
{
  enabled: false,
  targetAspectRatio: '9:16',
  autoDetect: true,
  sampleInterval: 2,      // Analisa a cada 2 segundos
  minConfidence: 0.5      // 50% de confiança
}
```

## 📊 Como Funciona

### Pipeline de Processamento

```
1. EXTRAÇÃO DE FRAMES
   ↓
   Extrai frames do vídeo a cada N segundos

2. DETECÇÃO DE FACES
   ↓
   Usa face-api.js (TinyFaceDetector) para detectar rostos

3. CÁLCULO DE ROI
   ↓
   Calcula região de interesse baseada nas faces detectadas

4. CROP INTELIGENTE
   ↓
   Aplica crop FFmpeg mantendo pessoas centralizadas

5. RENDERIZAÇÃO FINAL
   ↓
   Escala para resolução alvo com qualidade máxima
```

### Métodos de Detecção

1. **Face Detection (autoDetect=true)**
   - Detecta faces com IA
   - Calcula ROI média de todos os frames
   - Confiança: baseada no score do detector

2. **Manual ROI (manualROI definido)**
   - Usa coordenadas fornecidas
   - Confiança: 100%

3. **Center Crop (fallback)**
   - Crop central quando nenhuma face é detectada
   - Confiança: 0%

## 🔧 Troubleshooting

### "No faces detected, using center crop as fallback"

**Solução:**
- Reduza `minConfidence` para 0.3 ou menos
- Aumente `sampleInterval` para analisar mais frames
- Verifique se os modelos foram baixados corretamente

### "Failed to load detection models"

**Solução:**
```bash
# Tente baixar novamente
npm run download-models

# Ou baixe manualmente em:
# https://github.com/vladmandic/face-api/tree/master/model
```

### Crop não está centralizado

**Solução:**
- Use `autoDetect: false` para crop central fixo
- Ou defina `manualROI` com coordenadas específicas

## 📈 Performance

### Tempo de Processamento

| Duração do Vídeo | Tempo de Detecção | Tempo de Renderização |
|------------------|-------------------|-----------------------|
| 30s | ~2-3s | ~5-10s |
| 60s | ~4-6s | ~10-20s |
| 120s | ~8-12s | ~20-40s |

**Nota:** Tempos variam baseado em:
- `sampleInterval` (menor = mais lento)
- Resolução do vídeo
- Hardware disponível

### Otimização

```typescript
// Para vídeos longos, aumente o intervalo
{
  sampleInterval: 5, // Analisa a cada 5s (mais rápido)
}

// Para máxima precisão, diminua o intervalo
{
  sampleInterval: 1, // Analisa a cada 1s (mais lento)
}
```

## 🎯 Casos de Uso

### 1. Converter Podcast para Shorts
```typescript
{
  targetAspectRatio: '9:16',
  autoDetect: true,
  sampleInterval: 3, // Podcasts são estáticos
}
```

### 2. Vlog de Viagem para Instagram
```typescript
{
  targetAspectRatio: '4:5',
  autoDetect: true,
  sampleInterval: 2, // Movimento moderado
}
```

### 3. Webinar para TikTok
```typescript
{
  targetAspectRatio: '9:16',
  autoDetect: true,
  sampleInterval: 5, // Palestrante estático
}
```

## 🔗 Arquivos Relacionados

### Backend
- `backend-v2/src/services/roi-detector.ts` - Detecção de ROI
- `backend-v2/src/services/intelligent-reframe.ts` - Serviço principal
- `backend-v2/src/services/rendering.ts` - Integração com renderização
- `backend-v2/src/types/index.ts` - Tipos TypeScript

### Frontend
- `src/components/editor/ReframePanel.tsx` - UI de configuração

### Scripts
- `backend-v2/scripts/download-models.js` - Download de modelos

## 📝 Licença

Este recurso usa:
- [face-api.js](https://github.com/vladmandic/face-api) - MIT License
- [FFmpeg](https://ffmpeg.org/) - LGPL/GPL

## 🤝 Contribuindo

Para adicionar novos métodos de detecção:

1. Implemente em `roi-detector.ts`
2. Adicione tipo em `types/index.ts`
3. Integre em `rendering.ts`
4. Atualize UI em `ReframePanel.tsx`

---

**✨ Desenvolvido com IA e ❤️**
