# CortAI

SaaS para geração de clipes curtos a partir de vídeos (YouTube/upload), com backend Fastify + workers, frontend Vite/React e app mobile React Native.

## Requisitos

- Docker + Docker Compose plugin
- Bash
- (Opcional) Chromium para smoke UI

## Setup rápido (local com Docker)

```bash
bash scripts/dev-up.sh
```

Serviços locais:

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- pgAdmin: `http://localhost:5050`

Para parar:

```bash
bash scripts/dev-down.sh
```

## Variáveis de ambiente

### Backend (`clipify-studio/backend-v2/.env.example`)

Copie para `clipify-studio/backend-v2/.env` e ajuste:

- Segurança: `API_KEY`, `JWT_SECRET`, `COOKIE_SECRET`
- Banco: `DATABASE_URL`
- Redis: `REDIS_URL` ou `REDIS_HOST`/`REDIS_PORT`
- IA: `OPENAI_API_KEY` (Whisper/transcrição real)
- Pagamentos: `MERCADOPAGO_*`
- Billing: `UNLIMITED_ADMIN_EMAIL` (obrigatório; usuário que não consome cota)
- Observabilidade: `SENTRY_DSN` (opcional)
- Notificações de email:
  - `NOTIFICATIONS_EMAIL_ENABLED`
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`
  - `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Feature flags:
  - `UPLOADS_ENABLED`
  - `SOCIAL_MEDIA_ENABLED`
  - `BETA_MODE`, `BETA_ALLOWLIST_EMAILS`

### Frontend (`clipify-studio/.env.example`)

Copie para `clipify-studio/.env.local`:

- `VITE_BACKEND_URL`
- `VITE_FEATURE_UPLOAD`
- `VITE_FEATURE_DIRECT_PUBLISHING`
- `VITE_HERO_VARIANT` (opcional)
- `VITE_SUPABASE_*` (storage)
- `VITE_SENTRY_DSN` (opcional)
- `VITE_SITE_URL` (opcional)

## Smoke tests e QA

### Smoke backend

```bash
SMOKE_CREATE_USER=1 bash scripts/smoke.sh
```

Para ambientes com upload habilitado (produção), use:

```bash
SMOKE_CREATE_USER=1 SMOKE_EXPECT_UPLOADS_DISABLED=false bash scripts/smoke.sh
```

### QA core flow + billing

```bash
QA_CREATE_USER=1 bash scripts/qa-3-4.sh
```

O QA valida, entre outros pontos:
- débito automático de uso após job concluído (`clips` e `minutes`)
- idempotência de `/increment-usage`
- bloqueio por limite (`403 LIMIT_EXCEEDED`)

Trial:
- fora do escopo atual de lançamento (não há endpoint `/trial/start` no backend v2).

Regra especial de billing:
- `UNLIMITED_ADMIN_EMAIL` define o único usuário com acesso ilimitado (não consome cota).
- sem essa variável o backend não inicia (validação de ambiente).

### Smoke UI frontend

No host:

```bash
cd clipify-studio
npm run test:ui
```

No container Docker, o script detecta ambiente automaticamente, usa `http://backend:3000` por padrão
e cria um proxy local (`127.0.0.1:3000`) quando o frontend estiver apontando para `localhost:3000`.

## Produção (Render) - Go Live

Use o `render.yaml` da raiz do repositório.

### Configuração mínima obrigatória

No backend/worker de produção:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `OPENAI_API_KEY`
- `JWT_SECRET`, `COOKIE_SECRET`, `API_KEY`
- `MERCADOPAGO_ACCESS_TOKEN` (APP_USR-...)
- `MERCADOPAGO_PUBLIC_KEY` (APP_USR-...)
- `MERCADOPAGO_WEBHOOK_SECRET`
- `MERCADOPAGO_SANDBOX_MODE=false`
- `SENTRY_DSN` (recomendado)

No frontend:

- `VITE_BACKEND_URL`
- `VITE_FEATURE_UPLOAD=true`
- `VITE_SENTRY_DSN` (recomendado)

### Staging recomendado

- `MERCADOPAGO_SANDBOX_MODE=true`
- credenciais `TEST-*` do Mercado Pago

### Verificação pós deploy

1. `GET /health` retorna `status=ok`.
2. `GET /payments/config` retorna `isConfigured=true`.
3. Criar checkout e validar retorno `success/failure/pending`.
4. Validar webhook em `/webhooks/mercadopago`.
5. Executar geração de job curto e longo (ex.: 10 e 50 min).

## Teste de webhook Mercado Pago em staging

```bash
STAGING_BACKEND_URL=https://seu-backend-staging.onrender.com \
bash scripts/test-webhook-staging.sh
```

Opcional:

- `X_SIGNATURE` para validar fluxo com assinatura
- `WEBHOOK_PATH` para endpoint customizado

## Notificações por email de jobs

Quando `NOTIFICATIONS_EMAIL_ENABLED=true` e SMTP estiver configurado:

- Envia email ao concluir job
- Envia email ao falhar job
- Respeita preferências do usuário em `/user/settings`:
  - `notifications.jobCompleteEmail`
  - `notifications.jobFailedEmail`

## Mobile (real-time)

`clipify-mobile/services/api.ts` usa polling de 3s em `subscribeToJobUpdates` como fallback de tempo real para React Native (EventSource não nativo).
