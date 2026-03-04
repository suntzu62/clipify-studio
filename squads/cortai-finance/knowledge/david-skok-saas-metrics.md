# David Skok — For Entrepreneurs: A Bíblia de Unit Economics SaaS

**Background:** Partner na Matrix Partners, blog forEntrepreneurs.com é referência mundial em métricas SaaS
**Contribuição central:** Framework completo de CAC, LTV, payback period — o padrão da indústria

---

## 1. O Framework CAC/LTV: A Base de Tudo

### CAC (Customer Acquisition Cost)
```
CAC = Total gasto em marketing e vendas no mês
      ÷
      Número de novos clientes no mês

Incluir em marketing:
  - Ads (Google, Facebook, Instagram)
  - Conteúdo pago
  - Ferramentas de marketing
  - Seu próprio tempo (se dedicado a marketing)

Para CortAI solo:
  CAC = (Custo de ads + ferramentas) / Novos pagantes
  Se orgânico: CAC ≈ seu tempo × seu custo por hora
```

### LTV (Lifetime Value)
```
LTV = ARPU ÷ Monthly Churn Rate

Exemplo:
  ARPU = R$89/mês
  Churn = 5%/mês
  LTV = R$89 ÷ 0.05 = R$1.780

Versão mais precisa (com gross margin):
  LTV = (ARPU × Gross Margin) ÷ Churn Rate
```

### A Regra de Ouro de David Skok
> **LTV deve ser ≥ 3× o CAC**
> **Payback Period deve ser ≤ 12 meses**

```
Se CAC = R$100
LTV deve ser ≥ R$300
Payback deve ser ≤ 12 meses
```

### Análise de Saúde do Negócio CortAI
| Métrica | Fórmula | Meta |
|---------|---------|------|
| CAC | Gasto aquisição / Novos clientes | < R$150 |
| LTV | ARPU / Churn | > R$450 (3× CAC) |
| LTV:CAC | LTV / CAC | > 3× |
| Payback | CAC / (ARPU × Gross Margin) | < 12 meses |

---

## 2. O Problema do Caixa em SaaS (SaaS Cash Flow)

### Por Que SaaS Consome Caixa
```
Mês 1: Você gasta R$100 para adquirir o cliente (saída)
Mês 1-12: Você recebe R$89/mês (entrada gradual)
Break-even do cliente: Mês 12 (payback)
Profit: Mês 13+ (LTV - CAC)
```

**Quanto mais rápido cresce, mais caixa consome.**

### Para CortAI — Gerenciar o Caixa
1. **Annual plans:** Receba R$960 upfront vs. R$89/mês → melhor caixa
2. **Preço mais alto:** Payback mais curto
3. **Reduzir CAC:** Canais orgânicos > paid
4. **Aumentar retenção:** LTV maior = mais lucro por cliente

---

## 3. Cohort Analysis: A Lupa do SaaS

### O Que É Cohort Analysis
Agrupa clientes pelo mês de aquisição e rastreia MRR ao longo do tempo.

```
Cohort Jan/2026:  10 clientes × R$89 = R$890 MRR
  → Fev: 9 clientes × R$89 = R$801 (-10% churn)
  → Mar: 8 clientes × R$95 = R$760 (1 upgrade, 2 churned)
  → Abr: 7 clientes × R$95 = R$665

Cohort Fev/2026:  15 clientes × R$89 = R$1.335 MRR
  → Mar: 14 × R$89 = R$1.246
  ...
```

### O Que Procurar nas Cohorts
- **Curva de churn achatando?** = PMF melhorando com o tempo
- **Cohorts mais novas retendo mais?** = Produto melhorando
- **Expansion revenue?** = Receita crescendo mesmo com churn (sinal excelente)

### Negative Churn (o graal)
```
Negative Churn = MRR de upgrades > MRR de cancelamentos
Resultado: Você cresce MRR mesmo sem novos clientes
```
Para CortAI atingir negative churn:
- Volume de uso cresce → usuário faz upgrade natural
- Features premium com alto valor → fácil de vender mais

---

## 4. Unit Economics por Canal

### Calcular CAC por Canal Separadamente
```
Canal: Organic Search (SEO)
  Custo: R$2.000/mês (criação de conteúdo + ferramenta)
  Novos pagantes: 15
  CAC: R$133

Canal: Instagram Ads
  Custo: R$3.000/mês
  Novos pagantes: 10
  CAC: R$300

Canal: Referral
  Custo: R$0 (+ custo do programa: R$500/mês)
  Novos pagantes: 8
  CAC: R$63
```

**Decisão:** Investir mais em SEO e Referral, menos em Instagram Ads.

### Payback por Canal
```
Canal com CAC = R$300, ARPU = R$89, Gross Margin = 70%:
  Payback = R$300 ÷ (R$89 × 70%) = 4,8 meses ✓ (< 12 meses)

Canal com CAC = R$500, ARPU = R$39, Gross Margin = 70%:
  Payback = R$500 ÷ (R$39 × 70%) = 18,3 meses ✗ (> 12 meses)
```

---

## 5. Métricas de Crescimento por Estágio

### Curva de Crescimento Saudável para B2C SaaS (David Skok)
```
Early (0-$50k MRR):   Crescimento de 20-30% MoM aceitável
Growth ($50k-$500k):  15-20% MoM
Scale ($500k+):       5-15% MoM
```

### Dashboard Financeiro Simplificado
```
SAÚDE DO NEGÓCIO — [mês]

MRR:              R$___
New MRR:          R$___
Expansion MRR:    R$___
Churned MRR:      R$___
Net New MRR:      R$___
MoM Growth:       ___%

CAC (médio):      R$___
LTV (estimado):   R$___
LTV:CAC:          ___×
Payback:          ___ meses

Churn Rate:       ___%
NRR:              ___%
```

---

## Citações Chave de David Skok

> "SaaS is a marathon, not a sprint. The unit economics must work before you scale."

> "The magic ratio is LTV:CAC > 3. Below that, you're burning money. Above that, you're printing money."

> "Churn is the silent killer of SaaS. 2% monthly churn sounds small until you realize it's 22% annual churn."

> "Negative churn is the holy grail of SaaS. When expansion revenue exceeds churn revenue, you grow even without new customers."
