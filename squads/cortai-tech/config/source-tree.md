# CortAI Source Tree

```
/home/usuario/Documentos/cortai/              ← RAIZ DO MONOREPO
├── clipify-studio/                            ← ⚠️ GIT SUBMODULE
│   ├── src/                                   ← Frontend React
│   │   ├── pages/                             ← Route pages (*.tsx)
│   │   ├── components/                        ← UI components
│   │   ├── hooks/                             ← Custom hooks
│   │   ├── services/                          ← API client (fetch)
│   │   └── contexts/                          ← React contexts
│   ├── backend-v2/
│   │   └── src/
│   │       ├── api/                           ← Fastify routes (*.routes.ts)
│   │       ├── services/                      ← Business logic (*.service.ts, *.ts)
│   │       ├── jobs/                          ← BullMQ processor (processor.ts)
│   │       ├── config/                        ← env.ts, redis.ts, sentry.ts
│   │       ├── types/                         ← Zod schemas + TS types (index.ts)
│   │       ├── utils/                         ← Shared utilities
│   │       ├── lib/                           ← External service wrappers
│   │       └── scripts/                       ← migrate.ts, download-models.ts
│   └── Dockerfile
├── clipify-mobile/                            ← NÃO é submodule
│   ├── app/                                   ← Expo Router pages
│   ├── components/
│   ├── services/
│   └── stores/                               ← Zustand stores
├── migrations/                               ← SQL (001_..004_ deployadas, próxima: 005_)
├── scripts/                                  ← dev-up.sh, dev-down.sh, smoke.sh
├── docker-compose.yml
├── render.yaml
└── init.sql
```

## Naming Conventions
- Backend routes: `clipify-studio/backend-v2/src/api/[feature].routes.ts`
- Backend services: `clipify-studio/backend-v2/src/services/[feature].ts`
- Frontend pages: `clipify-studio/src/pages/[Feature].tsx`
- Stories: `docs/stories/STORY-[EPIC]-[N]-[slug].md`
- Migrations: `migrations/00N_[description].sql` (nunca editar as já deployadas)

## Regra Crítica: Submodule em 2 Commits
```bash
# Sempre que modificar arquivos em clipify-studio/:
cd clipify-studio && git add -p && git commit -m "feat: ..." && git push origin staging
cd .. && git add clipify-studio && git commit -m "chore: sync submodule with [feature]"
```
