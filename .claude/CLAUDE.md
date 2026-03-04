# Synkra AIOS Development Rules for Claude Code

You are working with Synkra AIOS, an AI-Orchestrated System for Full Stack Development.

<!-- AIOS-MANAGED-START: core-framework -->
## Core Framework Understanding

Synkra AIOS is a meta-framework that orchestrates AI agents to handle complex development workflows. Always recognize and work within this architecture.
<!-- AIOS-MANAGED-END: core-framework -->

<!-- AIOS-MANAGED-START: agent-system -->
## Agent System

### Agent Activation
- Agents are activated with @agent-name syntax: @dev, @qa, @architect, @pm, @po, @sm, @analyst, @devops, @ux-design-expert, @data-engineer
- The master agent is activated with @aios-master
- Custom CortAI agents: @growth-strategist, @content-creator, @community-manager, @cfo-advisor, @pricing-strategist
- **Executive agent:** @ceo (Vega) — estratégia cross-squad, OKRs, PMF, roadmap, wartime
- Agent commands use the * prefix: *help, *create-story, *task, *exit

### Agent Context
When an agent is active:
- Follow that agent's specific persona and expertise
- Use the agent's designated workflow patterns
- Maintain the agent's perspective throughout the interaction
<!-- AIOS-MANAGED-END: agent-system -->

---

## CortAI — Contexto Completo do Projeto

**Solo Founder.** Plataforma SaaS brasileira para geração automatizada de short clips virais a partir de vídeos longos (YouTube ou upload).

**Mercado:** Criadores de conteúdo BR que precisam de presença no TikTok, Reels e Shorts.
**Diferencial:** IA que detecta e corta automaticamente os momentos mais virais.
**Fase:** Early-stage, primeiros pagantes.
**Pagamentos:** MercadoPago (Brasil).

---

## Estrutura do Monorepo

```
/home/usuario/Documentos/cortai/         ← RAIZ (AIOS instalado aqui)
├── .aios-core/                           ← Framework AIOS core
├── .claude/CLAUDE.md                     ← Este arquivo
├── squads/                               ← Squads customizados CortAI
│   ├── cortai-tech/                      ← Dev, QA, DevOps
│   ├── cortai-product/                   ← Produto, UX
│   ├── cortai-growth/                    ← Marketing, Crescimento
│   └── cortai-finance/                   ← Finanças, Precificação
├── docs/
│   ├── stories/                          ← Development stories (STORY-[EPIC]-[N]-slug.md)
│   ├── prd/                              ← Product Requirements Documents
│   └── architecture/                     ← Architecture Decision Records
├── clipify-studio/                       ← ⚠️ GIT SUBMODULE (commits separados!)
│   ├── src/                              ← React 18 + Vite frontend
│   └── backend-v2/                       ← Fastify 4.26 backend
│       └── src/
│           ├── api/                      ← Rotas Fastify (*.routes.ts)
│           ├── services/                 ← Business logic (*.service.ts)
│           ├── jobs/                     ← BullMQ workers (processor.ts)
│           ├── config/                   ← env, redis, sentry
│           └── types/                    ← Zod schemas + TS types
├── clipify-mobile/                       ← React Native + Expo (NÃO é submodule)
│   ├── app/                              ← Expo Router pages
│   ├── components/
│   ├── services/
│   └── stores/                           ← Zustand stores
├── migrations/                           ← SQL migrations (001..N — NUNCA editar deployadas)
├── scripts/                              ← Shell scripts DevOps
├── docker-compose.yml                    ← Local dev (postgres:15, redis:7)
└── render.yaml                           ← Render.com IaC
```

---

## Pipeline Técnico (7 Estágios BullMQ)

```
1. Ingest      → yt-dlp (YouTube) ou upload Supabase Storage
2. Transcribe  → OpenAI Whisper → array de palavras com timestamps
3. Scenes      → Detecção de cenas, face tracking, ROI (TensorFlow.js)
4. Rank        → Highlight detection + virality scoring (GPT-4 + heurísticas)
5. Render      → FFmpeg clip extraction + intelligent reframing (9:16 / 1:1 / 4:5)
6. Texts       → GPT-4 título/descrição/hashtags + SEO metadata
7. Export      → Upload clips para Supabase Storage + update PostgreSQL
```

---

## Stack Técnico

### Backend (clipify-studio/backend-v2/)
- Node.js 20.x ESM + Fastify 4.26 + TypeScript strict
- BullMQ 5.x + Redis 7 (ioredis 5.x) — jobs em `src/jobs/`
- PostgreSQL 15 via `pg` (SQL puro, sem ORM) — migrations em `/migrations/`
- openai ^4.x (Whisper + GPT-4), @anthropic-ai/sdk ^0.68 (instalado, subutilizado)
- fluent-ffmpeg + ffmpeg-static, yt-dlp-wrap, @distube/ytdl-core
- Supabase JS SDK (@supabase/supabase-js) — storage only
- mercadopago ^2.x (Brasil)
- Testes: Vitest + vitest/coverage-v8

### Frontend (clipify-studio/src/)
- React 18 + Vite 5 + TypeScript
- Radix UI + Tailwind CSS + shadcn/ui + Framer Motion
- TanStack Query v5 + React Router v6 + Clerk auth
- Analytics: PostHog + Sentry

### Mobile (clipify-mobile/)
- React Native 0.81 + Expo SDK 54
- Expo Router v6 + NativeWind 4 + Zustand + TanStack Query v5

---

## Regras Críticas

### ⚠️ SUBMODULE — A Regra Mais Importante
`clipify-studio/` é um Git submodule. Toda mudança dentro dele requer **2 commits separados**:
```bash
# 1. Commit DENTRO do submodule
cd clipify-studio/
git add -p && git commit -m "feat: ..."
git push origin staging

# 2. Commit NA RAIZ atualizando o pointer
cd ..
git add clipify-studio
git commit -m "chore: sync submodule with [feature]"
git push origin staging
```
NUNCA use `git add clipify-studio/path/to/file` da raiz.

### ⚠️ MIGRATIONS — Nunca Editar as Deployadas
- Toda mudança de schema PostgreSQL: criar nova migration numerada em `/migrations/`
- Formato: `00N_description.sql` (continuar a partir de `004_`)
- NUNCA editar migrations já commitadas (001, 002, 003, 004)

### ⚠️ FEATURE FLAGS — Sempre Verificar
Novas features devem respeitar os flags no `.env`:
- `UPLOADS_ENABLED` — upload de vídeos locais
- `SOCIAL_MEDIA_ENABLED` — publicação em plataformas sociais
- `BETA_MODE` — gating de acesso beta
- `LIVE_CLIPPING_ENABLED` — clipping de live streams
- `DIRECT_PUBLISHING_ENABLED` — publicação direta

---

## Deploy

```
feature/branch → PR para staging → merge
  ↓ Render auto-deploy: cortai-backend-staging + cortai-frontend-staging
  ↓ Smoke tests
  ↓ PR staging → main → merge
  ↓ Render auto-deploy: produção (cortai-backend + cortai-frontend + cortai-worker)
```

**Variáveis de ambiente:**
- Backend local: `clipify-studio/backend-v2/.env`
- Backend staging/prod: configuradas no Render.com
- MercadoPago sandbox: `MERCADOPAGO_SANDBOX_MODE=true`

---

## Knowledge Bases dos Especialistas Mundiais

Cada squad tem conhecimento profundo dos maiores especialistas do mundo em sua área:

**📈 Growth** (`squads/cortai-growth/knowledge/`):
- **Sean Ellis** — Criador do Growth Hacking, Must Have Survey (≥40%=PMF), North Star Metric
- **Andrew Chen** (a16z/Uber) — Viral loops, Cold Start Problem, Retention como foundation
- **Lenny Rachitsky** (ex-Airbnb) — Benchmarks SaaS, PLG tactics, retention benchmarks
- **Dave McClure** — AARRR Pirate Metrics framework completo
- **Mercado BR** — Comportamento do consumidor BR, WhatsApp, micro-influencers, SEO BR

**💰 Finance** (`squads/cortai-finance/knowledge/`):
- **Jason Lemkin** (SaaStr) — 9 mandamentos SaaS, customer success, NRR, go-to-market
- **David Skok** (ForEntrepreneurs) — CAC/LTV definitivo, LTV:CAC >3×, cohort analysis
- **Patrick Campbell** (ProfitWell) — Value-based pricing, WTP research, dunning, annual plans

**📦 Product** (`squads/cortai-product/knowledge/`):
- **Marty Cagan** (SVPG/Netflix/eBay) — INSPIRED, feature teams vs product teams, discovery
- **Teresa Torres** — Continuous Discovery, Opportunity Solution Tree, entrevistas semanais
- **Eric Ries** — Lean Startup, MVP types, Build-Measure-Learn, Pivot vs. Persevere

**🔧 Tech** (`squads/cortai-tech/knowledge/`):
- **Martin Fowler** (ThoughtWorks) — Refactoring, Clean Architecture, padrões de arquitetura
- **Robert C. Martin** (Uncle Bob) — Clean Code, SOLID principles, TDD mindset
- **Gene Kim / DORA** — DORA four keys, DevOps culture, CI/CD pipeline, observabilidade

---

## Squads Disponíveis e Seus Agentes

### 🔧 cortai-tech — Desenvolvimento
| Agente | Quando Usar |
|--------|------------|
| `@architect` | Novo design técnico: pipeline stages, API contracts, schema changes |
| `@sm` | Criar stories detalhadas em docs/stories/ |
| `@dev` | Implementar: backend services, routes, migrations, frontend, mobile |
| `@data-engineer` | Criar migrations SQL, data pipelines |
| `@qa` | Vitest tests, pre-PR checklist, validação |
| `@devops` | Deploy staging/produção, submodule sync, Render.com |

### 📦 cortai-product — Produto
| Agente | Quando Usar |
|--------|------------|
| `@pm` | Criar PRD, roadmap, priorização de backlog |
| `@analyst` | Pesquisa de mercado, análise de concorrentes, métricas |
| `@po` | Quebrar PRD em epics + stories com critérios de aceite |
| `@ux-design-expert` | Fluxos de UI, component tree, UX patterns |

### 📈 cortai-growth — Marketing e Crescimento
| Agente | Quando Usar |
|--------|------------|
| `@growth-strategist` | Estratégia de aquisição, growth experiments, análise de cohorts |
| `@content-creator` | Posts, copy de landing page, emails, SEO |
| `@community-manager` | Discord/WhatsApp/YouTube, early users, feedback |

### 💰 cortai-finance — Finanças
| Agente | Quando Usar |
|--------|------------|
| `@cfo-advisor` | Unit economics (CAC/LTV), MRR projections, análise de custos |
| `@pricing-strategist` | Estratégia de planos, precificação, comparação com concorrentes |

### 🚀 cortai-executive — Estratégia & Liderança
| Agente | Quando Usar |
|--------|------------|
| `@ceo` | Decisões estratégicas cross-squad, OKRs, PMF assessment, pivot-or-persevere, roadmap, wartime, investor narrative |

**Arquivo:** `squads/cortai-executive/agents/ceo.md` — Persona: Vega
**Comanda todos os squads.** Use @ceo quando precisar de visão integrada do negócio.

---

## Workflow: Ideia → Produção

```
@ceo → Visão estratégica + OKRs + Squad briefing
  ↓
@pm → PRD  →  @analyst → Análise  →  @architect → Design Técnico
  ↓
@po → Epics  →  @sm → Stories detalhadas (docs/stories/)
  ↓
@dev → Implementação  →  @qa → Review + Tests
  ↓
@devops → Deploy staging → Deploy produção
  ↓
@content-creator → Anúncio  →  @growth-strategist → Growth experiment
  ↓
@cfo-advisor → Monitorar impacto no MRR  →  @ceo → Weekly review
```

---

## Development Methodology

### Story-Driven Development
1. **Work from stories** — All development starts with a story in `docs/stories/`
2. **Update progress** — Mark checkboxes as tasks complete: `[ ]` → `[x]`
3. **Track changes** — Maintain the File List section in the story
4. **Follow criteria** — Implement exactly what the acceptance criteria specify

### Story Template Location
`squads/cortai-tech/templates/story-template.md`

### Code Standards
- TypeScript strict mode
- Zod schemas para todos os inputs de API
- Auth middleware em todas as rotas protegidas do Fastify
- Erros BullMQ capturados + reportados ao Sentry
- Tests (Vitest) para toda nova lógica de service

---

## Comandos Comuns

```bash
# Local dev
bash scripts/dev-up.sh          # Sobe Docker + backend + frontend
curl localhost:3000/health      # Verifica backend

# Backend (dentro de clipify-studio/backend-v2/)
npm run typecheck               # TypeScript check
npm test                        # Vitest tests
npm run dev                     # Dev server

# Frontend (dentro de clipify-studio/)
npm run dev                     # Vite dev server
npm run lint                    # ESLint
npm run build                   # Production build

# Deploy
git push origin staging         # Render staging auto-deploy
# (PR staging → main = produção)
```

---

*CortAI + Synkra AIOS v4.2.13 — Solo Founder Edition*
