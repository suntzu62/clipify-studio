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

## Rodar
- Suba os workers:
  - `npm run dev`
- Enfileire um pipeline demo:
  - `npm run enqueue:demo`

Os workers simulam progresso 0→100 com `job.updateProgress(...)` e os eventos (`waiting`, `active`, `progress`, `completed`, `failed`) são logados no console.

## Notas
- Para Redis Gerenciado, use o URL `rediss://...` do provedor (Upstash é compatível com BullMQ).
- Próximo passo: substituir cada stub por lógica real (yt-dlp, Whisper, FFmpeg, etc).
