# 🔧 Guia de Troubleshooting - Sistema de Render

## Problema: Clipes não estão sendo gerados

### Diagnóstico
Verifique os logs para uma dessas mensagens:

```
[WARN] Skipping invalid clip: { reason: 'Clipe muito curto: 15s < 30s' }
[WARN] Skipping invalid clip: { reason: 'Clipe muito longo: 150s > 120s' }
[WARN] Skipping invalid clip: { reason: 'Start/End fora do range' }
```

### Solução
1. **Se clipes muito curtos**: Reduza `RENDER_MAX_RETRIES` no .env - alguns vídeos têm segmentos curtos naturais
2. **Se clipes muito longos**: Aumentar truncamento? Verifique se o rank.json está gerando bons segmentos
3. **Se fora do range**: Verifique se a duração do vídeo foi detectada corretamente

---

## Problema: Renderização muito lenta

### Causa Provável
- Preset muito agressivo (`RENDER_PRESET=superfast` já está otimizado)
- Bitrate muito alto
- CPU insuficiente no servidor

### Solução
```env
# 1. Reduza bitrate
RENDER_VIDEO_BITRATE=3M    # Reduzir de 4M para 3M
RENDER_AUDIO_BITRATE=64k   # Reduzir de 96k para 64k

# 2. Reduzir FPS (se aceitável)
RENDER_FPS=24              # Reduzir de 30 para 24

# 3. Aumentar paralelização (em render.ts)
# Mude: const maxParallel = Math.min(3, adjustedItems.length);
# Para: const maxParallel = Math.min(4, adjustedItems.length);
```

---

## Problema: "Arquivo muito pequeno: 500000 bytes"

### Causa
Render falhou mas FFmpeg não lançou erro. Arquivo corrompido ou incompleto.

### Solução
```env
# Aumentar tentativas de retry
RENDER_MAX_RETRIES=4           # Aumentar de 2 para 4
RENDER_RETRY_DELAY_MS=2000    # Aumentar delay entre tentativas
```

---

## Problema: Upload falha com erro 403/404

### Causa
- Storage bucket não existe
- Permissões incorretas
- Path incorreto

### Diagnóstico
```bash
# Verificar bucket e arquivos
curl https://qibjqqucmbrtuirysexl.supabase.co/storage/v1/object/public/raw/projects/
```

### Solução
```env
# Verificar variáveis de storage
SUPABASE_STORAGE_BUCKET=raw  # Deve corresponder ao bucket criado no Supabase
```

---

## Problema: Memory leak / Consumo crescente de RAM

### Causa
Cleanup de arquivos temporários pode falhar

### Solução
```bash
# Limpar manualmente /tmp
rm -rf /tmp/*/render/

# Adicionar cron job (opcional)
# 0 * * * * rm -rf /tmp/*/render/
```

---

## Problema: Logs não aparecem

### Causa
Logger pode estar bufferizando

### Solução
```env
# Adicionar ao .env
DEBUG=*

# Ou, remova a limitação de output
# Em render.ts, mude:
const log = pino({ name: 'render' });
# Para:
const log = pino({ name: 'render', level: 'debug' });
```

---

## Problema: "RenderAttemptFailed" com "Timeout"

### Causa
FFmpeg levando mais tempo que esperado

### Solução
```typescript
// Em render.ts, aumentar timeout de FFmpeg
// Procure por: await runFFmpeg(args, ...)
// O 4º argumento é timeout em ms
// Mude de: durationMs (duração do clipe)
// Para: durationMs * 1.5 (50% mais tempo)
```

---

## Problema: Clipes com legendas cortadas

### Solução
Ajustar `RENDER_MARGIN_V` no .env:
```env
RENDER_MARGIN_V=40   # Reduzir (menos espaço)
RENDER_MARGIN_V=80   # Aumentar (mais espaço)
```

---

## Problema: Thumbnail não aparece

Não é crítico - sistema continua sem thumbnail. Verificar:
```
[WARN] Thumbnail generation failed, proceeding without
```

Não faz clipe falhar. Se quiser debugar:
```bash
# Testar geração de thumbnail manualmente
ffmpeg -ss 1 -i clip.mp4 -frames:v 1 -q:v 3 -vf 'scale=540:960' thumb.jpg
```

---

## Problema: Batch não completa

### Causa
Exceção em um dos clipes do batch

### Solução
Cada clipe é processado independentemente. Se um falha:
```
[ERROR] ClipRenderFailed: { clipId: 'clip2', error: '...' }
```
Outros continuam. Verificar `results` array na resposta.

---

## Logs de Sucesso - Esperado

```
[INFO] RenderStarted: { rootId: 'abc123', jobId: '1' }
[INFO] ExistingClipsFound: { existingCount: 3 }
[INFO] ClipsFiltered: { original: 5, adjusted: 4, videoDuration: 600 }
[INFO] RenderConfig: { totalClips: 4, maxParallel: 3, renderOptions: {...} }
[INFO] RenderAttempt: { clipId: 'clip1', itemIndex: 0, attempt: 1, start: 0, end: 60 }
[INFO] ClipRenderedSuccessfully: { clipId: 'clip1', itemIndex: 0, duration: 60 }
[INFO] ClipUploadComplete: { rootId: 'abc123', clipId: 'clip1', itemIndex: 0 }
[INFO] RenderComplete: { totalAttempted: 4, successful: 4, failed: 0, elapsedMs: 120000 }
```

---

## Debug Mode - Ativar logs detalhados

Editar `workers/src/workers/render.ts`:

```typescript
// Linha ~14, mude:
const log = pino({ name: 'render' });

// Para:
const log = pino({ 
  name: 'render', 
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});
```

---

## Contato / Suporte

Se o problema persiste:
1. Colete os logs completos
2. Envie para análise
3. Incluir: vídeo de entrada, .env values, erros específicos

