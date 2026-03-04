# Marty Cagan — INSPIRED: Como Criar Produtos que as Pessoas Amam

**Background:** Fundador do SVPG (Silicon Valley Product Group), ex-VP Product Netflix e eBay
**Livros:** *INSPIRED* (2008, 2018), *EMPOWERED* (2020), *TRANSFORMED* (2023)
**Contribuição central:** Produto como discovery + delivery, diferença entre feature teams e product teams

---

## 1. A Grande Distinção: Feature Teams vs. Product Teams

### Feature Teams (O Que Não Fazer)
```
Input:  Roadmap de features definido pelo CEO/stakeholders
Processo: Entregar features na ordem do roadmap
Output: Features entregues (não necessariamente valor)
Resultado: Produto cresce por soma de features, não por valor
```

### Product Teams Verdadeiros (O Que Fazer)
```
Input:  Problema a resolver (não feature a construir)
Processo: Discovery → Delivery (teste de hipóteses)
Output: Resultados de negócio (MRR, retenção, ativação)
Resultado: Produto cresce por valor entregue
```

### Para CortAI Solo (Solo Founder como Product Team)
Como founder solo, você é PM + designer + engenheiro. Aplique:
1. **Defina o problema** antes de pensar na solução
2. **Valide a solução** antes de construir (protótipo, conversa com usuário)
3. **Meça o resultado** após lançar (não só "feature entregue")

---

## 2. Os 4 Riscos de Produto

Cagan diz que cada decisão de produto tem 4 riscos que devem ser validados:

### Risk 1: Value Risk
"O cliente vai querer isso?"
- Teste: Protótipo + entrevista com 5 usuários
- Para CortAI: "Os criadores vão usar esta feature específica?"

### Risk 2: Usability Risk
"O usuário vai entender como usar?"
- Teste: Usability test sem dar instruções
- Para CortAI: "O criador consegue usar o CortAI sem tutorial?"

### Risk 3: Feasibility Risk
"Conseguimos construir isso?"
- Teste: Spike técnico (prova de conceito rápida)
- Para CortAI: "Conseguimos processar 2h de vídeo em <30min?"

### Risk 4: Business Viability Risk
"Isso funciona para o negócio?"
- Teste: Análise de unit economics, compliance
- Para CortAI: "O custo de AI por vídeo permite margem positiva?"

---

## 3. Continuous Discovery (Product Discovery)

### O Ciclo de Discovery do Cagan
```
1. Identify Opportunity (quais problemas dos usuários resolver?)
2. Discover Solutions (qual solução tem mais valor/viabilidade?)
3. Validate Solutions (a solução resolve o problema?)
4. Deliver Solutions (construir com confiança)
```

### Weekly Habits de Discovery (para solo founder)
- **2-3 entrevistas com usuários/semana** (30 min cada)
- **1 usability test/semana** (observe alguém usando o produto)
- **1 experimento/sprint** (teste A/B, feature flag, etc.)
- **Análise de dados/semana** (PostHog, funil de conversão)

### Como Conduzir Entrevistas (Método Cagan)
❌ "O que você quer que o produto faça?"
✅ "Me conta a última vez que você tentou criar um clip para o TikTok..."

Regras:
1. Perguntas abertas, nunca fechadas
2. Pergunte sobre o passado, não sobre o futuro
3. Não revele a solução que está pensando
4. Anote citações exatas, não interpretações

---

## 4. Roadmap Orientado a Outcome (Resultado)

### Roadmap Tradicional (evitar)
```
Q1: Feature A
Q2: Feature B
Q3: Feature C
Resultado: Time de features, não de produto
```

### Roadmap de Outcomes (usar)
```
Q1: Aumentar ativação de D1 de 30% para 50%
Q2: Reduzir churn de 7% para 4%/mês
Q3: Aumentar ARPU de R$89 para R$120 via expansion
Resultado: Time focado em valor real
```

### Para CortAI — Roadmap de Outcomes
```
Hoje: [definir baseline de cada métrica]
Q1 2026: D1 Activation ≥ 40%
Q2 2026: Monthly Churn ≤ 4%
Q3 2026: NPS ≥ 50
Q4 2026: MRR R$10k
```

---

## 5. Priorização com ICE Score

### ICE Score (usado no SVPG)
```
ICE = Impact × Confidence × Ease
Cada critério: 1-10

Impact: Quanto impacta o outcome desejado?
Confidence: Quão confiante estamos que vai funcionar?
Ease: Quão fácil é implementar?
```

### Exemplo de Priorização CortAI
| Feature/Experimento | Impact | Confidence | Ease | ICE |
|--------------------|-|--|--|--|
| Onboarding wizard | 9 | 8 | 6 | 432 |
| TikTok direct publish | 8 | 7 | 3 | 168 |
| Legendas animadas | 7 | 6 | 5 | 210 |
| Brand Kit | 5 | 5 | 4 | 100 |
| Live clipping | 9 | 4 | 2 | 72 |

**Prioridade:** Onboarding wizard > Legendas > TikTok publish > Brand Kit > Live

---

## 6. OKRs para Produto

### Framework de OKRs do SVPG
```
Objective: Declaração inspiracional do que queremos atingir
Key Results: Métricas específicas que indicam sucesso

O: Criar o produto de clips mais amado por criadores BR
  KR1: NPS ≥ 60 (de __ atual)
  KR2: D30 retention ≥ 40% (de __ atual)
  KR3: Must Have Survey ≥ 40% muito desapontados

O: Crescer MRR para R$10k até Dez/2026
  KR1: ≥ 100 clientes pagantes
  KR2: Churn ≤ 4%/mês
  KR3: ARPU ≥ R$89/mês
```

---

## Citações Chave de Marty Cagan

> "The root cause of most product failures is that companies put features on roadmaps instead of problems to solve."

> "If you're just executing the product roadmap, you're not doing product management. You're doing project management."

> "Discovery and delivery must happen in parallel, not sequentially."

> "Fall in love with the problem, not the solution."

> "The best teams I've seen talk to users every single week. They're never surprised by what users want."
