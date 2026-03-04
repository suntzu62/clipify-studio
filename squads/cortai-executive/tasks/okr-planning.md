# Task: okr-planning — OKR Planning (Andrew Grove Framework)

## Objetivo
Definir OKRs do quarter para o CortAI com rigor metodológico.

## Regras Fundamentais (Andrew Grove / John Doerr)
- Máximo 3 Objectives por quarter
- Máximo 3-5 Key Results por Objective
- KR deve ser: mensurável + específico + com prazo
- 70% de atingimento = sucesso (100% = KR muito fácil)
- OKRs são aspiracionais (stretch), não garantidos
- Revisão semanal obrigatória (check-in)

## Processo de Criação

### STEP 1 — Contexto Estratégico
Perguntar ao fundador:
1. Qual é o maior desafio do CortAI este quarter?
2. O que, se bem-feito, mudaria tudo?
3. Onde estamos no PMF journey?
4. Qual é o status do Default Alive?

### STEP 2 — Draft de Objectives
Objectives são qualitativos, inspiradores, direcionais:
- Formato: verbo + resultado desejado + contexto
- Exemplo: "Conquistar Product-Market Fit com criadores BR"
- Exemplo: "Tornar o CortAI indispensável para os primeiros 100 pagantes"

### STEP 3 — Key Results por Objective
KRs são métricas que provam que o Objective foi atingido:
- Formato: verbo + número + métrica + prazo
- Exemplo: "Atingir Must Have Survey ≥40% até [data]"
- Exemplo: "Reduzir churn de X% para Y% até [data]"

### STEP 4 — Validação dos KRs
Cada KR deve passar no checklist:
- [ ] É mensurável (tem número)?
- [ ] É específico (tem prazo)?
- [ ] Está sob nosso controle?
- [ ] Se atingido, realmente provaria o Objective?
- [ ] É difícil mas possível (70% confidence)?

### STEP 5 — Filtro de North Star
Todo KR deve ter relação clara com a North Star Metric:
- Se um KR não impacta a North Star direta ou indiretamente → questionar se deve estar aqui

## Template de Output

```
═══════════════════════════════════════
🎯 OKRs Q[X] 2026 — CortAI
Data: [início] → [fim]
North Star: [métrica]
═══════════════════════════════════════

O1: [Objective 1]
├── KR1: [métrica] de X → Y até [data]
├── KR2: [métrica] de X → Y até [data]
└── KR3: [métrica] de X → Y até [data]

O2: [Objective 2]
├── KR1: [métrica] de X → Y até [data]
├── KR2: [métrica] de X → Y até [data]
└── KR3: [métrica] de X → Y até [data]

O3: [Objective 3]
├── KR1: [métrica] de X → Y até [data]
└── KR2: [métrica] de X → Y até [data]

───────────────────────────────────────
🚫 O QUE NÃO FAZEMOS ESTE QUARTER:
- [item explicitamente descartado]
- [item explicitamente descartado]

📅 CHECK-IN: toda sexta-feira (15 min)
📊 MID-QUARTER REVIEW: [data]
🏁 FINAL REVIEW: [data]
═══════════════════════════════════════
```

## Squad Assignments por OKR
Para cada KR, definir qual squad é responsável:
- Métricas de produto/retenção → @dev + @pm
- Métricas de crescimento/aquisição → @growth-strategist
- Métricas financeiras → @cfo-advisor
- Métricas técnicas → @architect + @devops
