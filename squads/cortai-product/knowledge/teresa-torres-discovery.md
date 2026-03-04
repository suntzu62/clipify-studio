# Teresa Torres — Continuous Discovery Habits

**Background:** Product Discovery Coach, autora de *Continuous Discovery Habits* (2021)
**Contribuição central:** Opportunity Solution Tree, entrevistas semanais com usuário, teste de hipóteses

---

## 1. Continuous Discovery: O Que É

### A Premissa
"As melhores product teams falam com usuários toda semana. Isso não é opcional — é um hábito."

### Métricas de Discovery Saudável
- ≥ 1 entrevista de usuário por semana
- ≥ 1 experimento ativo em andamento
- Assumption testing antes de construir

### Para CortAI Solo:
Meta mínima: **2 entrevistas de usuário por semana** (30 min cada)
Onde encontrar: Early adopters, grupos de criadores, WhatsApp community

---

## 2. O Opportunity Solution Tree (OST)

### A Estrutura
```
Desired Outcome (resultado desejado de negócio)
       ↓
Opportunities (problemas/desejos do usuário)
       ↓
Solutions (features, mudanças UX, experimentos)
       ↓
Experiments (validação rápida antes de construir)
```

### OST para CortAI
```
Desired Outcome: MRR R$10k com churn < 4%/mês

Opportunities Identificadas (via entrevistas):
  ├── "Demora muito para criar clips de qualidade"
  │     └── Solutions: Wizard de onboarding, templates prontos
  ├── "Não sei quais clips vão performar bem"
  │     └── Solutions: Virality score visível, preview de performance
  ├── "Preciso ajustar os clips antes de publicar"
  │     └── Solutions: Editor simples inline
  └── "É difícil publicar em múltiplas plataformas"
        └── Solutions: Direct publishing TikTok/Instagram
```

---

## 3. O Método de Entrevista de Torres

### Regras de Ouro das Entrevistas
1. **Converse sobre o passado, não hipotético:** "Quando foi a última vez que você editou um vídeo?"
2. **3 histórias concretas por entrevista:** Detalhes específicos revelam o problema real
3. **Não valide sua solução — descubra o problema:** Deixe o usuário guiar
4. **Anote citações literais:** "Levo 3 horas para editar um vídeo de 20 minutos" > "usuários acham demorado"

### Roteiro de Entrevista para CortAI (45 min)

**Abertura (5 min):**
"Obrigado por vir. Não existe resposta errada. Quero entender como você trabalha com vídeo, não validar nada específico."

**História 1 — Criação de conteúdo (15 min):**
"Me conta a última vez que você criou um clip para TikTok ou Reels. Por onde você começou?"
[Sonda: O que aconteceu depois? Como foi esse momento? Que outras opções você considerou?]

**História 2 — Problema específico (15 min):**
"Me conta de uma situação em que você teve dificuldade ao criar conteúdo curto a partir de um vídeo longo."
[Sonda: O que tornava isso difícil? O que você tentou fazer? Qual foi o resultado?]

**História 3 — Ferramenta atual (10 min):**
"Me mostra como você faria para criar um clip agora. Pode ser qualquer ferramenta que você usa."
[Observe o processo sem interromper]

**Encerramento:**
"Se você pudesse mudar UMA coisa sobre como você cria clips, o que seria?"

---

## 4. Assumption Testing (antes de construir)

### Tipos de Assumptions
1. **Desirability:** Os usuários querem isso?
2. **Feasibility:** Conseguimos construir?
3. **Viability:** Vale a pena financeiramente?
4. **Usability:** Eles conseguem usar?

### Como Testar Rápido (antes de código)
| Assumption | Método de Teste | Tempo |
|------------|----------------|-------|
| Desirability | Mockup + 5 entrevistas | 1 semana |
| Usability | Protótipo clicável + usability test | 2 dias |
| Feasibility | Spike técnico (prova de conceito) | 1-3 dias |
| Viability | Análise financeira | 1 dia |

### Para CortAI — Exemplos de Assumption Testing
```
Feature: Publicação direta no TikTok

Assumption 1 (Desirability): Criadores querem publicar diretamente do CortAI
  → Test: Perguntar nas entrevistas "como você publica hoje?"
  → Critério: ≥ 7/10 entrevistados mencionam como dor

Assumption 2 (Feasibility): API do TikTok permite upload direto
  → Test: Verificar documentação da TikTok API (spike de 1 dia)
  → Critério: API disponível e não proibida para apps de terceiros

Assumption 3 (Desirability): Usuário prefere publicar do CortAI vs. baixar e publicar
  → Test: Mockup do flow + 5 entrevistas com protótipo
  → Critério: ≥ 4/5 dizem que usariam regularmente
```

---

## 5. Opportunity Sizing: Priorizando Oportunidades

### Como Torres Prioriza Opportunities
Não use opinião — use dados das entrevistas:

1. **Frequência:** Com que frequência esse problema ocorre?
2. **Intensidade:** Quão doloroso é?
3. **Satisfação atual:** Como o usuário resolve hoje? (se bem, baixo valor)
4. **Segmento afetado:** Quantos usuários têm este problema?

### Para CortAI — Score de Oportunidades
| Oportunidade | Freq | Intensidade | Satisf. Atual | Segmento | Score |
|-------------|------|------------|--------------|----------|-------|
| Demora criar clips | Alta | Alta | Baixa (manual) | 90% | ⭐⭐⭐⭐⭐ |
| Legendas automáticas | Alta | Média | Média | 80% | ⭐⭐⭐⭐ |
| Publicação direta | Média | Média | Média (manual) | 60% | ⭐⭐⭐ |
| Editor de clips | Baixa | Alta | Alta (Premiere) | 40% | ⭐⭐ |

---

## Citações Chave de Teresa Torres

> "If you're only talking to users when you have something to show them, you're doing it wrong."

> "The best product decisions come from a deep understanding of the problem space, not the solution space."

> "Don't fall in love with your solutions. Fall in love with the problems your customers have."

> "An assumption test takes a day. Building the wrong feature takes months."
