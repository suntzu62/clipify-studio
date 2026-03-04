# Sean Ellis — Pai do Growth Hacking

**Livro principal:** *Hacking Growth* (2017)
**Contribuição central:** Criou o termo "growth hacking", definiu o framework de growth sistemático, inventou a "Must Have Survey"

---

## 1. Must Have Survey (Framework Principal)

### A Pergunta Mais Importante de Produto
> "Como você se sentiria se não pudesse mais usar [produto]?"
> - Muito desapontado
> - Um pouco desapontado
> - Não me sentiria desapontado
> - Não uso mais este produto

**Regra:** Se ≥40% respondem "muito desapontado" → produto tem Product-Market Fit
**Abaixo de 40%?** Não adianta escalar aquisição — conserte o produto primeiro.

### Perguntas Complementares da Pesquisa
1. "Qual é o principal benefício que você recebe do [produto]?"
2. "Qual tipo de pessoa mais se beneficiaria do [produto]?"
3. "Como você melhoraria o [produto]?" (só dos que disseram "muito desapontado")

### Aplicação no CortAI
```
Pergunta a usuários que criaram pelo menos 3 clips:
"Como você se sentiria se o CortAI parasse de existir?"
Meta: ≥40% "muito desapontado" antes de investir pesado em aquisição
```

---

## 2. North Star Metric (NSM)

### Conceito
Uma única métrica que captura o valor central entregue ao usuário E que, quando cresce, o negócio cresce.

### Critérios da North Star Metric
- Captura o valor central para o usuário
- Representa crescimento sustentável (não só novos usuários)
- É acionável pela equipe
- Prediz receita futura

### Exemplos por Tipo de Negócio
| Empresa | NSM |
|---------|-----|
| Spotify | Tempo ouvido por usuário/mês |
| Airbnb | Noites reservadas |
| Facebook | DAU (Daily Active Users) |
| Slack | Mensagens enviadas por equipe |
| Netflix | Horas assistidas |

### NSM do CortAI (sugestão)
> **"Clips publicados por criador ativo por semana"**

Por quê: Captura que o usuário criou E publicou clips (valor completo entregue), e aumenta quando o CortAI funciona bem.

### Métricas de Input (que movem a NSM)
1. Vídeos submetidos/semana
2. Taxa de conclusão do pipeline (ingest → export)
3. Taxa de aprovação de clips pelo usuário
4. Taxa de publicação (clips exportados → publicados)

---

## 3. Growth Hacking Framework (4 Etapas)

### Etapa 1: Encontrar o "Aha Moment"
O momento exato em que o usuário percebe o valor do produto.
- Para CortAI: Primeira vez que vê o clip gerado automaticamente

### Etapa 2: Ativar os Usuários no Aha Moment Mais Rápido
- Reduzir o tempo entre cadastro e primeiro clip
- Remover fricção no onboarding
- Guiar o usuário ao Aha Moment na primeira sessão

### Etapa 3: Reter os Usuários
- Criar hábito de uso semanal
- Notificações/lembretes que trazem de volta
- Feature que melhora com o uso (ex: IA aprende preferências)

### Etapa 4: Monetizar
- Só depois de ter retenção = upsell com menor resistência

---

## 4. Growth Team Structure

### North Star + Input Metrics = Growth Squad
O time de growth foca nas métricas de input, não na NSM diretamente:

```
NSM: Clips publicados/semana
    ↑
    Input 1: Taxa de ativação (usuário cria 1º clip em 48h)
    Input 2: Taxa de retenção D7 (voltou na 1ª semana)
    Input 3: Taxa de retenção D30 (voltou no 1º mês)
    Input 4: Viral coefficient (usuários que indicam)
```

### Growth Sprints (ciclo de 2 semanas)
1. **Análise:** Qual input metric está mais abaixo do benchmark?
2. **Ideação:** 10-20 hipóteses de como melhorar
3. **Priorização:** ICE Score (Impact × Confidence × Ease)
4. **Teste:** 1-3 experimentos por sprint
5. **Análise:** O que funcionou? Escalar ou descartar

---

## 5. Hacking Growth Playbook para Aquisição

### Canal de Aquisição: Como Escolher
Sean Ellis avalia canais em 3 dimensões:
1. **Volume:** Quantos usuários pode trazer?
2. **Custo:** CAC vs. LTV
3. **Targeting:** Consegue atingir o ICP exato?

### Para CortAI (zero budget):
1. **Comunidades de criadores:** Grupos de YouTubers BR (maior ROI)
2. **SEO:** "como cortar clipes de vídeo", "criar short clips YouTube"
3. **Product Hunt:** Spike de awareness + backlinks
4. **Parcerias com criadores:** Revenue share ou desconto
5. **Viral no produto:** "Criado com CortAI" watermark opcional

---

## Citações Chave de Sean Ellis

> "Growth hacking is a mindset, not a toolset."

> "Before you try to scale growth, make sure you have a product worth growing."

> "The best growth experiments are quick, cheap, and easy to measure."

> "Growth teams should own retention, not just acquisition."
