# Task: mrr-projection

Modela a projeção de MRR para os próximos N meses com cenários conservador, base e otimista.

## Elicitação
1. MRR atual: R$?
2. Usuários pagantes atuais: ?
3. Distribuição nos planos: (free: %, starter: %, pro: %, business: %)
4. Churn mensal atual: ?% (se não souber, usar 5% como benchmark)
5. Meta de MRR: R$?
6. Horizonte da projeção: ? meses

## Template de Projeção

### Premissas
```
ARPU (ticket médio): R$XX
Churn rate mensal: X%
Crescimento de novos usuários pagantes/mês:
  - Conservador: +X usuários/mês
  - Base: +X usuários/mês
  - Otimista: +X usuários/mês
```

### Projeção Mensal

| Mês | Novos | Churned | Total Pagantes | MRR (Base) |
|-----|-------|---------|----------------|------------|
| M1 | | | | R$ |
| M2 | | | | R$ |
| M3 | | | | R$ |
| M6 | | | | R$ |
| M12 | | | | R$ |

### Break-even
```
Custos fixos mensais: R$XX (Render + Supabase + outros)
ARPU: R$XX
Usuários para break-even: ceil(custos_fixos / ARPU) = XX usuários
```

### Tempo para R$10k MRR (base case)
```
[Calcular com base nas premissas]
```

### Sensibilidade
O que acontece com o MRR se:
- Churn aumenta 2%? → [impacto]
- ARPU aumenta R$20? → [impacto]
- Crescimento dobra? → [impacto]
