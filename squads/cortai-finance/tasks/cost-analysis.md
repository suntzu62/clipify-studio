# Task: cost-analysis

Calcula o custo de processamento por vídeo e por usuário/mês.

## Elicitação
1. Qual serviço ou cenário analisar? (ex: "processar vídeo de 60 min")
2. Quais serviços estão envolvidos? (OpenAI Whisper, GPT-4, Render, Supabase)
3. Qual o volume mensal esperado? (usuários × vídeos por usuário)

## Template de Análise

### Custo por Vídeo

| Serviço | Cálculo | Custo Estimado |
|---------|---------|----------------|
| OpenAI Whisper | [N minutos] × $0.006 | $X.XX |
| GPT-4o (análise) | [N tokens] × $0.005/1k | $X.XX |
| GPT-4o (metadados) | [N tokens] × $0.005/1k | $X.XX |
| Supabase Storage | [N GB] × $0.021 | $X.XX |
| Render compute | [N segundos FFmpeg] | $X.XX |
| **Total por vídeo** | | **$X.XX** |

### Custo por Usuário/Mês
```
Vídeos por usuário/mês: [N]
Custo por vídeo: $X.XX
Custo de infra por usuário: $X.XX/mês
```

### Gross Margin por Plano
```
Plano Starter: R$XX/mês
COGS estimado: R$XX/mês (converter USD × cotação)
Gross Margin: XX%
```

### Escala de Custos
| Usuários Pagantes | MRR | Custo COGS | Gross Profit |
|-------------------|-----|------------|--------------|
| 10 | | | |
| 100 | | | |
| 500 | | | |
| 1000 | | | |

### Alertas de Custo
- Se COGS > 30% do MRR: revisar limites de uso dos planos
- Se Whisper > 40% do COGS: considerar modelo open-source alternativo
- Se Render > 30% do COGS: avaliar auto-scaling ou plano diferente
