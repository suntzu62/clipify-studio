# Security Deploy Notes

## Neon vs Supabase

Neste projeto, `Neon` e `Supabase` nao sao mutuamente exclusivos.

- `Neon`: banco Postgres principal via `DATABASE_URL` no backend.
- `Supabase`: ainda aparece no codigo para storage, uploads e Edge Functions.

Hoje o codigo ainda referencia Supabase em:

- `src/integrations/supabase/client.ts`
- `src/components/FileUploadZone.tsx`
- `src/hooks/useJobStream.ts`
- `src/lib/billing.ts`
- `backend-v2/src/services/storage.ts`
- `backend-v2/src/api/routes.ts`
- `render.yaml`

Se voce realmente nao usa mais Supabase em producao, o correto e fazer uma remocao/refatoracao dedicada. Ate la, trate Supabase como dependencia ativa de storage/functions.

## O que ja foi feito no codigo

- Chave de compatibilidade do browser nao e mais enviada em producao.
- Rotas internas ficaram separadas do trafego publico.
- `job-status`, `job-stream` e `enqueue-export` passaram a validar posse do job.
- IDs de job na Edge Function deixaram de ser deterministicas.
- CORS das Edge Functions saiu de `*` para allowlist.
- `worker-health` pode ser restrito por `EDGE_ADMIN_EMAILS`.

## O que falta em producao

- Fazer deploy do codigo endurecido.
- Definir `INTERNAL_API_KEY`, `CORS_ALLOWED_ORIGINS`, `COOKIE_DOMAIN`, `TRUST_PROXY=true`, `STRICT_ORIGIN_CHECKS=true` no backend.
- Rodar `test-security-production.sh` contra o ambiente do Render.
- Confirmar que `health/details` e `queue/stats` nao ficam publicos.
- Confirmar que um usuario nao acessa job de outro usuario.

## Historico Git

- `.env` e `.env.local` nao estao rastreados no estado atual.
- Ha historico de commits tocando caminhos de ambiente. Como voce ja rotacionou, o risco imediato das chaves antigas cai, mas vale manter isso documentado.
