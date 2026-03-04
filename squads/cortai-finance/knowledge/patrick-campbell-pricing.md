# Patrick Campbell — ProfitWell: A Ciência de SaaS Pricing

**Background:** Fundador da ProfitWell (adquirida por Paddle por $200M), analisou dados de 30.000+ empresas SaaS
**Contribuição central:** Data-driven SaaS pricing, subscription analytics, churn reduction

---

## 1. O Framework de Value-Based Pricing

### Por Que Pricing Baseado em Custo Não Funciona
```
Pricing por custo: Custo × 3 = Preço
Problema: Deixa dinheiro na mesa quando o valor é alto,
          e mata a margem quando o custo sobe.

Pricing por valor: Quanto o cliente valoriza? × % que você captura = Preço
Resultado: Margem muito maior, menor churn.
```

### Como Determinar o Valor para o Cliente
**Método de Campbell: Pesquisa de Willingness to Pay**

1. **Pergunta 1:** "A qual preço este produto parece tão barato que você duvidaria da qualidade?"
2. **Pergunta 2:** "A qual preço este produto começa a parecer caro, mas você ainda consideraria?"
3. **Pergunta 3:** "A qual preço este produto parece muito caro para você?"
4. **Pergunta 4:** "A qual preço este produto parece um barganha?"

**Resultado:** Interseção das curvas = zona de preço ótimo

### Para CortAI — Pesquisa de WTP
```
Fazer com 20-30 usuários ou potenciais usuários:
Foco em criadores BR com canal de 10k-500k seguidores

Pergunta contextualizadora:
"CortAI gera automaticamente clips de vídeos longos para TikTok/Reels usando IA.
Você pode submeter um vídeo de 1h e receber 10 clips otimizados em 30 minutos."
```

---

## 2. The Four Fits Framework

### Produto-Mercado-Preço-Canal devem estar alinhados:
```
Product         →  Market
"O produto resolve    "Para quem resolve
 um problema real?"    o problema?"
       ↓                   ↓
Price           ←  Channel
"O preço captura     "Como chega até
 o valor entregue?"   os clientes?"
```

**Para CortAI:**
- **Product:** IA que gera clips virais de vídeos longos ✓
- **Market:** Criadores de conteúdo BR (YouTube, podcasters, streamers)
- **Price:** R$? (a definir com pesquisa de WTP)
- **Channel:** SEO, comunidades, referral, micro-influencers

---

## 3. Churn: O Assassino Silencioso

### Tipos de Churn (Patrick Campbell)

**Churn Voluntário (ativo):**
- Usuário decide cancelar conscientemente
- Causa: Produto não entrega valor ou preço muito alto
- Solução: Produto melhor ou pricing correto

**Churn Involuntário (passivo):**
- Pagamento falha, cartão expirou
- Causa: Problema técnico de cobrança
- Solução: Dunning emails, retry automático
- **Dado de Campbell:** 20-40% do churn total é involuntário!

**Para CortAI — Reduzir Churn Involuntário:**
```
1. Email D-7 antes de expirar: "Seu cartão expira em 7 dias"
2. Email D-1: "Atualize seu pagamento"
3. Retry automático: 3x nos próximos 7 dias após falha
4. Dunning email: "Seu acesso será suspenso em X dias"
5. Reativação fácil: Um clique para reativar
```

### Churn Benchmarks por Segmento
| Segmento | Churn Mensal "Bom" | Problemático |
|----------|-------------------|-|
| SMB B2B | 3-5% | >7% |
| B2C SaaS | 3-7% | >10% |
| Ferramentas criativas | 4-6% | >8% |
| **Meta CortAI** | <5%/mês | >7%/mês |

---

## 4. Estrutura de Planos que Converte

### O Princípio da Ancoragem de Preços
```
[Starter]   [Pro]          [Business]
R$39/mês    R$89/mês       R$199/mês
            ← escolha mais comum
```
O plano do meio é sempre o mais escolhido. O plano caro ancora o preço e faz o médio parecer razoável.

### O Que Deve Separar os Planos
Campbell descobriu: O melhor diferenciador é **volume de uso**, não features.

**Para CortAI:**
```
Starter R$39/mês:   60 minutos de vídeo/mês
Pro     R$89/mês:   300 minutos + prioridade
Business R$199/mês: 1000 minutos + API + white-label
```

Evitar: Bloquear features core do produto nos planos básicos. Frustração = churn.

### Annual vs. Monthly Plans
- Annual plan: 20-30% de desconto → reduz churn dramaticamente
- Usuários annual churnam 3-4x menos que mensais
- Ofereça anual com destaque e urgência: "Economize R$XX por ano"

---

## 5. Métricas de Pricing que Importam

### Revenue Per Customer Benchmarks
| Produto | ARPC Saudável |
|---------|--------------|
| B2C Consumer | $10-30/mês |
| B2C Productivity SaaS | $20-100/mês |
| SMB SaaS | $100-500/mês |
| **Meta CortAI** | R$50-150/mês |

### Expansion Revenue (o motor do crescimento)
"A melhor receita é de clientes que já pagam e aumentam o plano."

**Para CortAI — Triggers de Upgrade:**
1. Usuário chega em 80% do limite de uso → banner de upgrade
2. Feature premium usada → paywall com CTA claro
3. Usuário ativo há 3+ meses → oferta de anual com desconto
4. Usuário indica 2 amigos → upgrade de presente

---

## Citações Chave de Patrick Campbell

> "Charging more doesn't mean you'll lose customers. It means you'll get better customers."

> "The best acquisition strategy is retention. A company with 0% churn can stop acquiring customers and still grow through expansion revenue."

> "Involuntary churn is free money you're leaving on the table. Fix your dunning process."

> "Your pricing page is your most important marketing page. Most SaaS companies treat it like an afterthought."

> "Don't price to your cost. Price to your value. There's a massive difference."
