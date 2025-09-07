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

### RANK
- Seleção de 8-12 clipes finais a partir dos candidatos gerados pelo SCENES
- Análise de CPS (Characters Per Second) - foco em 17-20 CPS para legibilidade
- Hook scoring dos primeiros 10 segundos (perguntas, números, 2ª pessoa)
- Otimização de duração com alvo de ~55s (ideal para Shorts)
- Análise de diversidade via embeddings para evitar near-duplicates
- Boost por palavras-chave educacionais (dicas, passos, listas)
- Upload para `projects/${rootId}/rank/rank.json`

### TEXTS
- Geração de metadados para YouTube Shorts e rascunho de blog (PT-BR)
- Entrada: `projects/${rootId}/rank/rank.json` e `projects/${rootId}/transcribe/transcript.json`
- Para cada clipe (8–12):
  - Título (<=100 chars, com gancho)
  - Descrição (1–2 frases fortes + 3 bullets + CTA curto)
  - Hashtags 3–12 (sem espaços; evite genéricos; se duração <=60s, pode incluir `#Shorts` entre as 3 primeiras)
- Saída por clipe:
  - `projects/${rootId}/texts/<clipId>/title.txt`
  - `projects/${rootId}/texts/<clipId>/description.md`
  - `projects/${rootId}/texts/<clipId>/hashtags.txt`
- Saída do projeto:
  - `projects/${rootId}/texts/blog.md` (800–1200 palavras, Markdown)
  - `projects/${rootId}/texts/seo.json` ({ slug, seoTitle, metaDescription })

#### Limites YouTube (resumo)
- Título: até 100 caracteres; Descrição: até 5000 caracteres
- Hashtags: apenas 3 aparecem acima do título; use 3–12 úteis
- Shorts: até 60s aparecem fortemente no feed; o YouTube expandiu o limite, mas 60s é o alvo preferido

#### Notas de monetização
- Evite conteúdo inautêntico/repetitivo: varie prompts e estilos, foque em valor real e originalidade.

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

### Configuração de Rank
- `RANK_TOP_K=12`: Número máximo de clipes a selecionar
- `RANK_MIN=30`: Duração mínima de clipe em segundos
- `RANK_MAX=90`: Duração máxima de clipe em segundos
- `RANK_TARGET=55`: Duração alvo para pontuação ótima
- `RANK_EMBED_MODEL=text-embedding-3-small`: Modelo de embedding OpenAI

A pontuação final combina força do hook (30%), qualidade CPS (15%), novidade/diversidade (20%), relevância de palavras-chave (15%) e adequação de duração (10%), com penalidades por gaps de silêncio excessivos.

### Configuração de Texts
- `TEXTS_MODEL=gpt-4o-mini`: modelo de geração
- `TEXTS_TONE=informal-claro`: tom/voz do texto
- `TEXTS_HASHTAG_MAX=12`: máximo de hashtags por clipe (mantém 3–12, hard cap 60)
- `TEXTS_BLOG_WORDS_MIN=800` / `TEXTS_BLOG_WORDS_MAX=1200`: tamanho do rascunho de blog

## Notas
- Para Redis Gerenciado, use o URL `rediss://...` do provedor (Upstash é compatível com BullMQ).
- rootId consistente entre todas as filas para paths organizados no Storage
- Logs detalhados em cada fase para debugging
