# Task: pmf-assessment — Product-Market Fit Assessment

## Objetivo
Avaliar objetivamente onde o CortAI está no continuum de PMF e definir ações específicas.

## Framework de Avaliação

### NÍVEL 1: Problem-Solution Fit
**Pergunta:** Usuários pagam pelo problema?
- Temos pagantes: ✅ (PSF atingido)
- Não temos pagantes: ❌ → Foco em vendas manuais antes de qualquer escala

### NÍVEL 2: Product-Market Fit
**Medição multi-dimensional:**

**A) Sean Ellis Must Have Survey**
Pergunta: "Como você se sentiria se não pudesse mais usar o CortAI?"
- Muito desapontado (Must Have): ___%
- Um pouco desapontado: ___%
- Não desapontado: ___%
- Interpretação: ≥40% "muito desapontado" = PMF atingido

**B) Retention Signal (Andrew Chen)**
- D7 Retention: ___% (meta: ≥50%)
- D30 Retention: ___% (meta: ≥35%)
- D90 Retention: ___% (meta: ≥20%)
- Sinal: curva de retenção estabiliza (não vai a zero) = PMF

**C) NPS (Net Promoter Score)**
- Score: ___ (meta: ≥50)
- Promotores (9-10): ___%
- Neutros (7-8): ___%
- Detratores (0-6): ___%

**D) Sinais Qualitativos (Lenny Rachitsky)**
- Usuários indicam espontaneamente? ✅/❌
- Ficam chateados quando o sistema cai? ✅/❌
- Usam o produto mais do que planejavam? ✅/❌
- Descrevem o produto com entusiasmo para outros? ✅/❌

### NÍVEL 3: Scale Readiness
**Medição:**
- CAC por canal: R$___
- LTV: R$___
- LTV:CAC: ___ (meta: >3×)
- Canal de aquisição replicável: ✅/❌
- Gross Margin: ___% (meta: >70%)

## Diagnóstico e Output

### Se PMF NÃO atingido (Must Have <40% OU D30 <35%):
```
⚠️ PMF NÃO CONFIRMADO

Status atual: [nível exato]
Maior gap: [qual métrica está mais longe]

Ações obrigatórias (Paul Graham doctrine):
1. Falar com 10 usuários esta semana — perguntar: o que você mais usa? o que te frustrou?
2. Identificar os top 3 usuários mais engajados — o que eles fazem diferente?
3. NÃO escalar aquisição até resolver o gap

Hipótese de desbloqueio: [o que acredito que está impedindo PMF]
Próximo teste: [experimento específico para validar hipótese]
Prazo para reavaliação: [data]
```

### Se PMF ATINGIDO (Must Have ≥40% E D30 ≥35%):
```
✅ PMF CONFIRMADO

Próximo estágio: Scale Readiness
Verificar:
- CAC/LTV ratio: ___
- Canal replicável: sim/não
- Gross margin: ___%

Se Scale Ready → *squad-briefing growth para escalar aquisição
Se não Scale Ready → *cfo-advisor para otimizar unit economics primeiro
```
