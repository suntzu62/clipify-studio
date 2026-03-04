# Launch Checklist (Execution Snapshot)

Updated: 2026-03-03
Environment: local Docker (`localhost`)

## Status Summary

| Item | Status | Evidence |
|---|---|---|
| Containers and backend health | `done` | `docker ps` healthy + `GET /health` returning `status: ok` |
| YouTube ingest fallback (`yt-dlp`) | `done` | `yt-dlp --version` available in backend container and YouTube processing succeeded end-to-end |
| Public billing/auth access rules | `done` | `/plans` and `/payments/config` accessible without auth; JWT via cookie works |
| Backend smoke test (`scripts/smoke.sh`) | `done` | `SMOKE_CREATE_USER=1 bash scripts/smoke.sh` finished with `[smoke] OK` |
| QA flow 3/4 (`scripts/qa-3-4.sh`) aligned to current API | `done` | `QA_CREATE_USER=1 bash scripts/qa-3-4.sh` finished with `[qa] OK (3 and 4 validated locally)` |
| Free-tier usage accounting for `increment-usage` | `done` | Fixed `checkUserLimits` to aggregate `usage_records` for users without active subscription |
| Limit enforcement when creating/starting jobs | `done` | Fixed routes to return `403 LIMIT_EXCEEDED` when quota is exceeded |
| Trial flow | `done` | Trial removed from launch scope (no `/trial/start` dependency in QA/release checklist) |
| Automatic usage increment after successful job processing | `done` | QA evidence after fix: `usage diff after job: clips 0 -> 1, minutes 0 -> 4` |
| Unlimited admin access (`gabrielfootze@gmail.com`) | `done` | `checkUserLimits` returns unlimited and `incrementUsage` is skipped for this email |
| Mercado Pago production readiness | `in_progress` | Local `/payments/config` shows `isConfigured: false`; production keys/webhook still required |

## Changes Applied During Execution

- Updated QA script to current backend contracts:
  - `scripts/qa-3-4.sh`
- Fixed free-tier usage visibility + idempotency scope:
  - `clipify-studio/backend-v2/src/services/mercadopago.service.ts`
- Added quota enforcement before queueing jobs:
  - `clipify-studio/backend-v2/src/api/routes.ts`
- Added automatic usage debit on successful job completion:
  - `clipify-studio/backend-v2/src/jobs/processor.ts`
- Added unlimited access bypass for `gabrielfootze@gmail.com`:
  - `clipify-studio/backend-v2/src/services/mercadopago.service.ts`

## Release-Critical Open Work

1. Configure Mercado Pago production credentials + validate webhook and checkout callbacks in staging/production.
