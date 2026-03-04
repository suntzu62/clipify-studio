# CortAI Pre-PR Checklist

Use este checklist antes de qualquer PR para staging ou produção.

## Backend (clipify-studio/backend-v2/)
- [ ] TypeScript: `npm run typecheck` — zero erros
- [ ] Testes: `npm test` — todos passando
- [ ] Cobertura: ≥80% nos arquivos novos de service
- [ ] Novas rotas Fastify têm middleware de auth aplicado
- [ ] Nova migration numerada corretamente (005, 006...) e idempotente
- [ ] NUNCA editou migrations já deployadas (001, 002, 003, 004)
- [ ] Schemas Zod validam todos os novos inputs de API
- [ ] Feature flags respeitadas (UPLOADS_ENABLED, SOCIAL_MEDIA_ENABLED, BETA_MODE...)
- [ ] Erros de BullMQ jobs capturados com try/catch e reportados ao Sentry
- [ ] Variáveis de env novas adicionadas ao `backend-v2/.env.example`

## Frontend (clipify-studio/src/)
- [ ] ESLint: `npm run lint` — zero warnings
- [ ] Error states do TanStack Query tratados (não só loading states)
- [ ] Clerk auth gate aplicado em rotas protegidas
- [ ] Nenhum console.error no happy path

## Mobile (clipify-mobile/)
- [ ] `npx expo start` sem erros no terminal
- [ ] Zustand store rehydrata corretamente no restart

## Submodule (OBRIGATÓRIO)
- [ ] Commit feito DENTRO de `clipify-studio/` com seu próprio git
- [ ] Push do submodule para origin staging
- [ ] Commit na RAIZ: `chore: sync submodule with [feature]`

## DevOps
- [ ] `bash scripts/dev-up.sh` sobe sem erros
- [ ] `curl localhost:3000/health` retorna `{"status":"ok"}`
- [ ] Smoke test passa: `bash scripts/smoke.sh` (se existir)
- [ ] Staging testado após deploy no Render
