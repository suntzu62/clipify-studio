# CortAI Product Context

## Produto
**CortAI** — Plataforma SaaS para geração automatizada de short clips virais de vídeos longos.

## Proposta de Valor
> "Transforme qualquer vídeo longo em clips virais em minutos, sem edição manual."

## Mercado Alvo
- **Primário:** Criadores de conteúdo BR (YouTube, podcasters, streamers)
- **Secundário:** Agências de marketing, empresas de mídia, influencers
- **Tamanho:** Brasil tem >10M criadores de conteúdo

## Dores do Usuário
1. Editar vídeos longos é demorado e caro
2. Difícil saber quais momentos são mais virais
3. Formatos diferentes para cada plataforma (9:16, 1:1, 4:5)
4. Criar legendas manualmente é tedioso
5. Publicar em múltiplas plataformas é manual

## Concorrentes Principais
| Produto | Preço | Diferencial | Fraqueza |
|---------|-------|-------------|----------|
| Opus Clip | $9-29/mês | Primeiro a escalar | Interface EUA-centric |
| Captions | $17/mês | Mobile-first | Pouco AI de highlights |
| Vizard | $16-50/mês | Editor completo | Complexo |
| Submagic | $20-50/mês | Legendas animadas | Foco só em legendas |
| Clipping.ai | ~$15/mês | Multi-idioma | Menos features |

## Diferencial CortAI
- **Mercado BR:** português nativo, MercadoPago, preços em BRL
- **AI de virality:** scoring mais sofisticado (emoção + áudio + fala)
- **Pipeline completo:** transcrição → highlights → render → SEO em um fluxo
- **Mobile:** app para publicar em qualquer lugar

## Métricas de Sucesso
- MRR (Monthly Recurring Revenue)
- Clips gerados por usuário/mês (engajamento)
- Churn rate (retenção)
- NPS (satisfação)
- CAC por canal (eficiência de aquisição)

## Roadmap Priorização (framework ICE)
- **Impact:** quanto impacta MRR ou retenção?
- **Confidence:** quão certo estamos que funciona?
- **Ease:** quão fácil de implementar?

## Feature Flags Atuais
- `UPLOADS_ENABLED` = true (upload de vídeo local)
- `SOCIAL_MEDIA_ENABLED` = false (publicação social ainda não ativa)
- `BETA_MODE` = false
- `LIVE_CLIPPING_ENABLED` = false
- `DIRECT_PUBLISHING_ENABLED` = false
- `SCHEDULER_ENABLED` = false
- `BRAND_KIT_ENABLED` = false
