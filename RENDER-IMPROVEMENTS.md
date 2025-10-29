# 🎬 Melhorias no Sistema de Recorte de Vídeos

## Resumo das Alterações

Implementamos um sistema robusto de recorte de vídeos inspirado no OpusClip, com foco em:
- ✅ **Validação rigorosa** de clipes
- ✅ **Retry automático** com backoff exponencial
- ✅ **Filtragem inteligente** de segmentos inválidos
- ✅ **Logs detalhados** para debugging
- ✅ **Paralelização otimizada** de renderização

---

## 📝 Mudanças no Arquivo `workers/src/workers/render.ts`

### 1. **Interfaces Melhoradas**

```typescript
interface ClipValidation {
  valid: boolean;
  error?: string;
  duration?: number;
  reason?: string;
}

interface RenderOptions {
  fps: number;
  font: string;
  marginV: number;
  preset: 'superfast' | 'veryfast' | 'fast';
  maxRetries: number;
  retryDelayMs: number;
}
```

### 2. **Funções de Validação**

#### `validateClip(start, end, videoDuration, minDuration, maxDuration)`
Valida se um clipe é válido:
- ✅ Verifica bounds (start >= 0, end <= videoDuration, start < end)
- ✅ Verifica duração mínima (padrão: 30s)
- ✅ Verifica duração máxima (padrão: 120s)
- ✅ Retorna detalhes do erro

**Exemplo:**
```typescript
const validation = validateClip(10, 50, 300, 30, 120);
// { valid: true, duration: 40 }

const validation2 = validateClip(10, 25, 300, 30, 120);
// { valid: false, error: 'TOO_SHORT', reason: '15s < 30s', duration: 15 }
```

### 3. **Filtragem e Ajuste de Clipes**

#### `filterAndAdjustClips(items, videoDuration, minDuration, maxDuration)`
Filtra clipes inválidos e ajusta os que estão fora do intervalo:

**Lógica:**
1. Remove clipes fora dos bounds
2. Remove clipes muito curtos (< minDuration)
3. Remove clipes muito longos (> maxDuration)
4. **Trunca** clipes muito longos mantendo a parte mais importante
5. **Expande** clipes muito curtos com padding

**Exemplo:**
```typescript
const items = [
  { id: 'clip1', start: 0, end: 20 },      // TOO_SHORT (20s)
  { id: 'clip2', start: 30, end: 90 },    // OK (60s)
  { id: 'clip3', start: 100, end: 250 }   // TOO_LONG (150s) → Truncado para 120s
];

const adjusted = filterAndAdjustClips(items, 300);
// [
//   { id: 'clip1', start: -2, end: 22, duration: 24 },  // Expandido com padding
//   { id: 'clip2', start: 30, end: 90, duration: 60 },  // Mantido
//   { id: 'clip3', start: 65, end: 185, duration: 120 } // Truncado simetricamente
// ]
```

### 4. **Renderização com Retry**

#### `renderClipWithRetry(...)`
Renderiza um clipe com retry automático:

**Melhorias:**
- 🔄 **Retry automático** com backoff exponencial (1s, 2s, 4s, ...)
- ✅ **Validação de arquivo** - Verifica se MP4 tem tamanho mínimo
- ✅ **Geração de thumbnail** - Com tratamento de erro gracioso
- ✅ **Progress tracking** - Atualiza barra de progresso do job
- ✅ **Logs estruturados** - Rastreamento detalhado de cada tentativa

**Fluxo:**
```
1. Validar clipe
2. Gerar arquivo ASS (legendas)
3. Para cada tentativa:
   a. Executar FFmpeg
   b. Verificar arquivo gerado
   c. Gerar thumbnail
   d. Se sucesso: retornar
   e. Se falha e tem tentativas: retry com delay
4. Retornar resultado
```

### 5. **Processamento em Paralelo**

- Processa até **3 clipes simultâneos**
- Distribui **threads de CPU** entre os clipes
- **Batch processing** com espera entre batches
- Atualiza progresso após cada batch

### 6. **Tratamento de Erros Melhorado**

| Erro | Ação |
|------|------|
| Clipe muito curto | Pula (skip) |
| Clipe muito longo | Trunca simetricamente |
| Render falha | Retry automático |
| Upload falha | Log + continua com próximo |
| Thumbnail falha | Log + continua sem thumbnail |

---

## ⚙️ Configurações de Render (`.env`)

```env
# FPS - 30fps otimizado para mobile
RENDER_FPS=30

# Font para legendas
RENDER_FONT=Inter

# Margin vertical para subtítulos (pixels)
RENDER_MARGIN_V=60

# Preset: superfast (rápido) < veryfast (balanço) < fast (qualidade)
RENDER_PRESET=superfast

# Modo: crop (recorta) vs fit_blur (blur de fundo)
RENDER_MODE=crop

# Bitrates (reduzidos para velocidade)
RENDER_VIDEO_BITRATE=4M
RENDER_VIDEO_MAXRATE=6M
RENDER_VIDEO_BUFSIZE=8M
RENDER_AUDIO_BITRATE=96k

# Retry automático
RENDER_MAX_RETRIES=2
RENDER_RETRY_DELAY_MS=1000
```

---

## 🧪 Como Testar

### 1. **Teste Simples - Upload um vídeo YouTube**

```bash
# 1. Acesse http://localhost:8080
# 2. Cole URL do YouTube
# 3. Clique em "Gerar clipes agora"
# 4. Monitore os logs no terminal:
#    - RenderStarted
#    - ClipsFiltered
#    - RenderAttempt (múltiplas tentativas)
#    - ClipRenderedSuccessfully
#    - ClipUploadComplete
#    - RenderComplete
```

### 2. **Teste com Validação - Verificar logs**

```bash
# Abra DevTools → Console
# Procure por:
# - "ClipsFiltered" → Vê quantos clipes foram ajustados
# - "RenderAttempt" → Vê tentativas de render
# - "ClipRenderFailed" → Vê falhas
```

### 3. **Teste de Retry - Simule um erro**

O sistema agora tenta **2 vezes por padrão**:
- Tentativa 1 falha → aguarda 1s
- Tentativa 2 falha → aguarda 2s
- Relata erro após 2 tentativas

---

## 📊 Comparação: Antes vs Depois

| Aspecto | Antes | Depois |
|--------|-------|--------|
| Validação de clipes | ❌ Mínima | ✅ Rigorosa (3 critérios) |
| Tratamento de erro | ❌ Nenhum retry | ✅ 2 retries automáticos |
| Clipes inválidos | ❌ Falha todo pipeline | ✅ Pula apenas o clipe ruim |
| Logs | ❌ Genéricos | ✅ Estruturados + contexto |
| Duração máx. clipe | ❌ Unlimited | ✅ 120s (ajustável) |
| Duração mín. clipe | ❌ Unlimited | ✅ 30s (ajustável) |
| Filtragem inteligente | ❌ Não | ✅ Sim (expande/trunca) |

---

## 🔍 Logs Esperados

### Sucesso
```
[INFO] RenderStarted: { rootId: 'abc123', jobId: '1' }
[INFO] ClipsFiltered: { original: 5, adjusted: 4, videoDuration: 600 }
[INFO] RenderConfig: { totalClips: 4, maxParallel: 3, fps: 30 }
[INFO] RenderAttempt: { clipId: 'clip1', attempt: 1, start: 0, end: 60 }
[INFO] ClipRenderedSuccessfully: { clipId: 'clip1', duration: 60 }
[INFO] ClipUploadComplete: { clipId: 'clip1' }
[INFO] RenderComplete: { totalAttempted: 4, successful: 4, failed: 0 }
```

### Falha + Retry
```
[WARN] RenderAttemptFailed: { clipId: 'clip2', attempt: 1, error: 'Timeout' }
[INFO] Retrying in 1000ms
[INFO] RenderAttempt: { clipId: 'clip2', attempt: 2 }
[INFO] ClipRenderedSuccessfully: { clipId: 'clip2' }
```

### Clipe Inválido
```
[WARN] Skipping invalid clip: { reason: 'Clipe muito longo: 150s > 120s' }
[INFO] Truncated oversized clip: { adjusted: { start: 65, end: 185 } }
```

---

## 🚀 Próximos Passos (Opcional)

1. **Melhoria do Rank Worker**: Adicionar validação similar
2. **Dashboard de Monitoramento**: Visualizar status de clipes em tempo real
3. **Cache de Segmentos**: Evitar re-processar clipes já gerados
4. **Ajuste Fino de Duração**: Machine learning para duração ideal por tipo de conteúdo

---

## 📧 Suporte

Se encontrar problemas:
1. Verifique os logs: `workers/src/workers/render.ts`
2. Aumente `RENDER_MAX_RETRIES` para 3-4 tentativas
3. Reduza `RENDER_VIDEO_BITRATE` se a renderização ficar lenta
4. Use `RENDER_PRESET=veryfast` para melhor qualidade/velocidade

