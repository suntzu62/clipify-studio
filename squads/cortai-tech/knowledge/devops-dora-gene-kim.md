# DevOps & DORA Metrics — Gene Kim & DORA Research

**Background:** Gene Kim (The Phoenix Project, The DevOps Handbook, Accelerate), DORA (DevOps Research and Assessment) team
**Contribuição central:** DORA metrics, elite performance benchmarks, DevOps culture

---

## 1. DORA Four Key Metrics

### As 4 Métricas que Separam Elite de Low Performers

| Métrica | O Que Mede | Elite | High | Medium | Low |
|---------|-----------|-------|------|--------|-----|
| **Deployment Frequency** | Com que frequência você deploya? | Múltiplas vezes/dia | Diário-semanal | Semanal-mensal | Mensal-semestral |
| **Lead Time for Changes** | Quanto tempo do commit ao produção? | < 1 hora | 1 dia-1 semana | 1 semana-1 mês | >1 mês |
| **Change Failure Rate** | % de deploys que causam problemas | < 5% | 5-10% | 10-15% | >15% |
| **Time to Restore** | Quanto tempo para recuperar de incidente? | < 1 hora | < 1 dia | 1 dia-1 semana | >1 semana |

### Para CortAI — Metas de DevOps
```
Atual (estimativa):
  Deployment Frequency: Semanal → Meta: Múltiplas vezes/semana
  Lead Time: 1-2 dias → Meta: < 4 horas (staging → production)
  Change Failure Rate: ? → Medida com Sentry/Render logs
  Time to Restore: ? → Meta: < 2 horas

Prioridade: Aumentar deployment frequency (sinal de confiança no pipeline)
```

---

## 2. The Three Ways (Gene Kim)

### First Way: Flow (Left to Right)
"Otimize o fluxo de trabalho de desenvolvimento para produção."

Para CortAI:
- Staging branch automático no Render ✓
- Main branch automático no Render ✓
- Missing: Testes automáticos em cada PR

### Second Way: Feedback (Right to Left)
"Feedback rápido de produção para desenvolvimento."

Para CortAI:
- Sentry para erros em produção ✓
- Missing: Alertas automáticos de error rate spike
- Missing: Health checks automáticos após deploy

### Third Way: Continual Experimentation
"Cultura de aprendizado e experimentação."

Para CortAI:
- Feature flags para experimentos controlados
- A/B tests na landing page
- Canary deploys para features de risco

---

## 3. Pipeline de CI/CD para CortAI

### Estado Atual
```
Dev → push staging → Render auto-deploy → Manual test → PR main → prod
```

### Pipeline Ideal (incrementos para atingir)
```
Dev → push feature branch
  → GitHub Actions: lint + typecheck + testes
  → PR criada com resultado dos checks
  → Code review (você mesmo)
  → Merge staging → Render auto-deploy
  → Smoke tests automáticos contra staging URL
  → PR staging → main (aprovada)
  → Render auto-deploy produção
  → Health check automático
  → Alert no Slack/Discord se degradação
```

### GitHub Actions — Arquivo Básico para CortAI
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [staging, main]
  pull_request:
    branches: [staging, main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          submodules: true  # CRÍTICO: clipify-studio é submodule

      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install backend deps
        working-directory: clipify-studio/backend-v2
        run: npm ci

      - name: TypeScript check
        working-directory: clipify-studio/backend-v2
        run: npm run typecheck

      - name: Run tests
        working-directory: clipify-studio/backend-v2
        run: npm test
```

---

## 4. Observabilidade (The Monitoring Pillar)

### Os 3 Pilares da Observabilidade
1. **Logs** — O que aconteceu?
2. **Metrics** — Como o sistema está se comportando?
3. **Traces** — Como uma request atravessa o sistema?

### Para CortAI — O Que Monitorar

**Logs (Render logs + Sentry):**
- Erros de BullMQ jobs: capturar sempre
- Falhas de API externa (OpenAI, Supabase): logar com contexto
- Requests lentas (>5s): logar automaticamente

**Métricas de negócio (via PostHog/custom):**
- Jobs criados por hora
- Taxa de sucesso do pipeline (jobs completed / jobs created)
- Tempo médio de processamento por estágio
- Uso de API OpenAI (tokens/hora)

**Alertas Críticos:**
```
🔴 CRÍTICO (acordar): /health retorna 500
🔴 CRÍTICO: Taxa de erro > 20% em 5 minutos
🟡 ATENÇÃO: Jobs em fila > 50 (backlog)
🟡 ATENÇÃO: Tempo de processamento > 2× média
🟢 INFO: Deploy bem-sucedido
```

---

## 5. Disaster Recovery para CortAI

### RTO e RPO
- **RTO (Recovery Time Objective):** Tempo máximo aceitável fora do ar = 2 horas
- **RPO (Recovery Point Objective):** Máximo de dados que podemos perder = 24 horas

### Backup Strategy
```
PostgreSQL:
  - Render.com faz backup automático diário ✓
  - Retention: 7 dias
  - Testado? [confirmar com Render dashboard]

Supabase Storage (vídeos e clips):
  - Redundância no S3 da AWS ✓
  - Não precisamos backup adicional

Redis:
  - BullMQ jobs persistentes no Redis ✓
  - Se Redis cair: jobs em andamento são reprocessados
  - Completed jobs ficam no PostgreSQL
```

### Runbook de Incidente
```
1. Identifique: O que está quebrado? (Render logs + Sentry)
2. Contenha: Rollback imediato se possível (Render manual deploy)
3. Comunique: Usuários afetados? Status page?
4. Resolva: Fix + novo deploy
5. Documente: Post-mortem em docs/incidents/
```

---

## Citações Chave

> "Any system that cannot be recovered cannot be trusted." — Gene Kim

> "If it hurts, do it more frequently. The pain will force you to improve the process." — DORA Research

> "Elite performers deploy on demand, not on a schedule. The deployment is a non-event." — Gene Kim

> "The goal of DevOps is to make deployments boring." — Gene Kim
