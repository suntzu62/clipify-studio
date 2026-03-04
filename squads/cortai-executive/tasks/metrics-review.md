# Task: metrics-review — CEO Dashboard Completo

## Objetivo
Conduzir uma revisão completa das métricas do CortAI como CEO, diagnosticar a saúde do negócio e priorizar ações.

## Quando Usar
- Revisão semanal do fundador
- Antes de qualquer decisão estratégica importante
- Ao ativar `*metrics-dashboard` ou `*weekly-review`

## Protocolo de Execução

### STEP 1 — Coleta de Dados (Solicitar ao usuário)
```
Para conduzir o dashboard completo, preciso dos dados atuais:

📊 RECEITA
- MRR atual: R$___
- MRR no mês passado: R$___
- Total de clientes pagantes: ___
- Novos clientes este mês: ___
- Cancelamentos este mês: ___

👥 ENGAJAMENTO
- DAU/MAU (se disponível): ___
- Clips gerados por usuário/semana (média): ___
- Taxa de ativação (% que gera ≥1 clip na semana 1): ___

💰 UNIT ECONOMICS
- Custo mensal total (Render + OpenAI + Supabase + outros): R$___
- Caixa disponível: R$___
- CAC (se mensurável): R$___

🎯 PMF SIGNALS
- Já fez Must Have Survey? Se sim, resultado: ___%
- NPS (se medido): ___
- Maior motivo de cancelamento: ___
```

### STEP 2 — Cálculos Automáticos
Calcular automaticamente:
- MRR Growth Rate MoM: (MRR atual - MRR anterior) / MRR anterior × 100
- Churn Rate: cancelamentos / clientes início do mês × 100
- LTV estimado: ARPU / Churn rate
- Runway: caixa / (custos - MRR)
- Gross Margin: (MRR - COGS variável) / MRR × 100
- Default Alive status: crescimento atual leva à lucratividade antes de acabar o caixa?

### STEP 3 — Diagnóstico por Dimensão

**CRESCIMENTO**
Benchmark (Lenny Rachitsky): Early-stage saudável = 15-20% MoM
- Verde: >15% MoM
- Amarelo: 5-15% MoM
- Vermelho: <5% MoM

**RETENÇÃO**
Benchmark (Andrew Chen): D30 retention ≥35% para ferramentas de produtividade
- Verde: ≥35% D30
- Amarelo: 20-35% D30
- Vermelho: <20% D30

**ATIVAÇÃO**
Benchmark (Lenny): ≥60% dos novos usuários devem atingir "aha moment" na semana 1
- Aha moment CortAI: primeiro clip exportado com sucesso

**SUSTENTABILIDADE**
Paul Graham Default Alive:
- Se crescimento continuar no ritmo atual, quando atingimos lucratividade?
- Se antes de acabar o caixa → Default Alive ✅
- Se depois → Default Dead ⚠️

### STEP 4 — Prioridade CEO

Baseado no diagnóstico, identificar:
1. **Maior risco agora:** (ex: churn alto, ativação baixa, runway curto)
2. **Maior oportunidade agora:** (ex: canal que está funcionando, feature com alta adoção)
3. **3 ações desta semana:** Concretas, com owner (você) e prazo

### STEP 5 — Squad Briefings Necessários
Identificar quais squads precisam de briefing baseado no diagnóstico:
- Churn alto → @dev + @pm (investigar UX) + @growth-strategist (retention tactics)
- Ativação baixa → @pm + @ux-design-expert (onboarding)
- Runway curto → @cfo-advisor (cortes) + @pricing-strategist (upgrade push)
- Crescimento lento → @growth-strategist (novo canal ou experimento)

## Output Format
```
🚀 CEO DASHBOARD — [Data]

📊 MÉTRICAS CORE
MRR: R$___ | Growth: ___% MoM | Churn: ___%
Clientes: ___ | ARPU: R$___ | LTV est: R$___
CAC: R$___ | LTV:CAC: ___ | Payback: ___ meses
Runway: ___ meses | Default Alive: ✅/⚠️

🎯 PMF STATUS
Must Have: ___%  [🔴 <30% | 🟡 30-40% | 🟢 ≥40%]
D30 Retention: ___% [🔴 <20% | 🟡 20-35% | 🟢 ≥35%]
NPS: ___ [🔴 <30 | 🟡 30-50 | 🟢 ≥50]

⚠️ MAIOR RISCO: [diagnóstico em 1 frase]
🚀 MAIOR OPORTUNIDADE: [diagnóstico em 1 frase]

✅ AÇÕES DESTA SEMANA
1. [ação específica] — prazo: [data]
2. [ação específica] — prazo: [data]
3. [ação específica] — prazo: [data]

📢 SQUAD BRIEFINGS NECESSÁRIOS: [lista]
```
