# Dave McClure — AARRR Pirate Metrics

**Background:** Fundador da 500 Startups, angel investor
**Contribuição central:** Framework AARRR (Pirate Metrics) — o framework de funil mais usado em startups

---

## O Framework AARRR

```
A — Acquisition   (Como usuários te encontram?)
A — Activation    (Quando têm a primeira boa experiência?)
R — Retention     (Eles voltam?)
R — Revenue       (Como você ganha dinheiro?)
R — Referral      (Eles indicam outros?)
```

**Por que AARRR? Porque piratas dizem "AARRR!"** — framework levado a sério mas apresentado com humor.

---

## 1. ACQUISITION — Aquisição

**Pergunta:** De onde vêm seus usuários?

### Canais de Aquisição para Medir
| Canal | Métrica Principal | Secundária |
|-------|-----------------|------------|
| SEO | Visitas orgânicas | Posição keywords |
| Paid | CPC, CTR | CAC por campanha |
| Social | Cliques no link | Engajamento |
| Email | Open rate | CTR |
| Referral | Usuários indicados | Taxa de conversão |
| Direct | Visitas diretas | Brand awareness |

### Para CortAI — Tracking de Acquisition
```
UTM parameters em TODOS os links:
?utm_source=instagram&utm_medium=social&utm_campaign=launch

Medir CAC por canal:
CAC = Custo do canal no mês / Novos usuários pagantes do canal
```

---

## 2. ACTIVATION — Ativação

**Pergunta:** Quando o usuário tem a PRIMEIRA experiência boa?

### Definição de Ativação Acionável
Não é "se cadastrou" — é o momento de AHA.

**Para CortAI:**
```
Ativação Level 1: Submeteu primeiro vídeo (chegou ao produto)
Ativação Level 2: Pipeline completou com sucesso (viu resultado)
Ativação Level 3: Fez download do primeiro clip (tomou ação com o resultado)
Ativação Level 4: Publicou nas redes sociais (entregou valor completo)
```

### Taxa de Ativação Benchmarks
- Cadastro → Primeira ação: 40-60% (bom)
- Cadastro → Aha Moment: 20-40% (bom)
- Aha Moment → Usuário ativo: 50-70% (bom)

### Como Melhorar Ativação
1. **Reduzir tempo até valor:** Menos steps, menos fricção
2. **Onboarding educativo:** Mostrar O QUE fazer, não só como fazer
3. **Template/exemplo pronto:** Deixar usuário ver resultado antes de submeter conteúdo próprio
4. **Progress bar:** Mostrar onde está no onboarding
5. **Email de "quase lá":** Trigger se usuário não ativou em 24h

---

## 3. RETENTION — Retenção

**Pergunta:** Usuários voltam? Com qual frequência?

### Segmentação de Retenção
Dave McClure divide usuários em:
- **Active:** Usou nas últimas 2 semanas
- **At Risk:** Usou há 2-4 semanas
- **Churned:** Não usa há mais de 4 semanas

### Táticas de Retenção por Segmento
**Active Users:** Feature discovery, upsell
**At Risk:** Re-engagement email, in-app notification, desconto
**Churned:** Email de "sentimos sua falta" + oferta especial

### Para CortAI — Retenção Automations
```
D+3 sem ativação: "Não conseguiu criar seu primeiro clip? Ajuda em 5 min"
D+7 sem uso: "Seu canal merece mais conteúdo — veja o que o CortAI pode fazer"
D+14 sem uso: "Que tal uma sessão gratuita para criar 3 clips juntos?"
D+30 sem uso: "Última chance: 30% de desconto se voltar esta semana"
```

---

## 4. REVENUE — Receita

**Pergunta:** Como e quando usuários pagam?

### Modelo de Monetização para CortAI
```
Free Tier:    X minutos/mês [gerar demanda]
Starter:      R$XX/mês [capturar criadores regulares]
Pro:          R$XX/mês [capturar criadores sérios]
Business:     R$XX/mês [capturar agências/empresas]
```

### Métricas de Revenue
- **MRR** = Receita mensal recorrente
- **ARPU** = Receita por usuário ativo por mês
- **ARPC** = Receita por cliente pagante por mês
- **Expansão MRR** = Upgrade de plano de usuários existentes
- **Contraction MRR** = Downgrade
- **Churn MRR** = Cancelamentos

### Revenue Optimization
1. **Annual plans:** Ofereça desconto de 20-30% para plano anual (reduz churn, aumenta cash)
2. **Upgrade prompts:** No limite de uso, mostrar upgrade fácil
3. **Feature gates:** Features premium visíveis mas bloqueadas (cria desejo)

---

## 5. REFERRAL — Indicação

**Pergunta:** Usuários recomendam o produto?

### Mecanismos de Referral

| Mecanismo | Exemplo | Para CortAI |
|-----------|---------|-------------|
| **Incentivado:** | Dropbox +16GB | "Indique e ganhe 1 mês grátis" |
| **No produto:** | Figma share link | "Compartilhe seu clip" |
| **Orgânico:** | Slack WOM | Clips incríveis geram WOM natural |
| **Watermark:** | Canva "Made with Canva" | "Criado com CortAI" no clip |

### NPS como Proxy de Referral
- **NPS ≥ 50:** Forte referral orgânico
- **NPS 30-50:** Moderado
- **NPS < 30:** Trabalhar no produto antes de investir em referral

---

## Dashboard AARRR Simplificado para CortAI

```
SEMANA: [data]

ACQUISITION
  Novos cadastros: ___ | Canal #1: ___ | Canal #2: ___

ACTIVATION
  Ativaram (criaram 1º clip): ___% dos cadastros

RETENTION
  Usuários ativos (semana): ___ | D30 retention: ___%

REVENUE
  MRR: R$___ | Novos pagantes: ___ | Churn: ___%

REFERRAL
  NPS: ___ | Usuários de referral: ___
```

---

## Citações Chave de Dave McClure

> "Stop talking about features and start talking about metrics."

> "The biggest mistake founders make is focusing on acquisition when their retention is broken."

> "AARRR is not a strategy, it's a framework. The strategy is figuring out which R to focus on."
