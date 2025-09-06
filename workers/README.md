# CortAÍ Workers (BullMQ + Node/TS)

Pipeline de processamento orquestrado com BullMQ.

## Requisitos
- Node 18+
- Redis (Upstash/ElastiCache/Local)

## Setup
- Instale deps:
  - `npm i`
- Crie `.env` a partir de `.env.example` e preencha:
  - `REDIS_URL=rediss://default:password@host:port`
  - `WORKERS_CONCURRENCY=2`
  - `OPENAI_API_KEY=sk-...` (para transcrição)
  - `SUPABASE_URL=https://...` (para storage)
  - `SUPABASE_SERVICE_ROLE_KEY=...` (para storage)
  - `SUPABASE_STORAGE_BUCKET=raw` (bucket padrão)
  - `TRANSCRIBE_MODEL=whisper-1` (opcional: gpt-4o-transcribe ou gpt-4o-mini-transcribe)

## Rodar
- Suba os workers:
  - `npm run dev`
- Enfileire um pipeline demo:
  - `npm run enqueue:demo`

Os workers simulam progresso 0→100 com `job.updateProgress(...)` e os eventos (`waiting`, `active`, `progress`, `completed`, `failed`) são logados no console.

## Workers Implementados

### INGEST
- Download de vídeo do YouTube via yt-dlp
- Probe de informações (título, duração, formato)
- Upload para Supabase Storage em `projects/${rootId}/source.mp4`

### TRANSCRIBE
- Download do vídeo processado do Storage
- Extração de áudio WAV mono 16kHz via FFmpeg
- Segmentação em chunks de ~900s (limite da API OpenAI)
- Transcrição via OpenAI Whisper ou GPT-4o
- Geração de arquivos: transcript.json, segments.srt, segments.vtt
- Upload para `projects/${rootId}/transcribe/`

### SCENES
- Análise da transcrição e áudio para gerar 8-12 clipes candidatos de 30-90s
- Detecção de silêncios via FFmpeg silencedetect
- Análise semântica usando embeddings OpenAI para detectar mudanças de tópico
- Quebras por texto (final de sentenças)
- Sistema de pontuação heurística baseado em densidade de palavras, perguntas, números
- Upload para `projects/${rootId}/scenes/scenes.json`

## Configuração de Transcrição

### TRANSCRIBE_MODEL
- `whisper-1` (padrão): Retorna segments detalhados com timestamps precisos
- `gpt-4o-transcribe`: Modelo mais avançado, sem segments detalhados (fallback por chunk)
- `gpt-4o-mini-transcribe`: Versão rápida do GPT-4o, sem segments detalhados

### Limites e Considerações
- API OpenAI: ~25MB por requisição, ~1500s de áudio
- Segmentação automática em chunks de 900s para contornar limites
- Arquivos temporários em `/tmp/${rootId}/` (cleanup automático)
- Suporte a cookies para yt-dlp via `YTDLP_COOKIES_PATH`

### Configuração de Scenes
- `SCENES_SILENCE_DB=-35`: Threshold de silêncio em dB
- `SCENES_SILENCE_MIN=0.3`: Duração mínima de silêncio em segundos
- `SCENES_SIM_THRESHOLD=0.85`: Threshold de similaridade semântica (0-1)
- `SCENES_MIN=30`: Duração mínima de clipe em segundos
- `SCENES_MAX=90`: Duração máxima de clipe em segundos

## Notas
- Para Redis Gerenciado, use o URL `rediss://...` do provedor (Upstash é compatível com BullMQ).
- rootId consistente entre todas as filas para paths organizados no Storage
- Logs detalhados em cada fase para debugging
