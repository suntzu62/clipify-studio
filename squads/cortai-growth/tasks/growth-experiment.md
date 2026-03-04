# Task: growth-experiment

Estrutura um growth experiment com hipótese clara, métricas e critério de sucesso.

## Elicitação
1. Qual é o objetivo do experimento? (aquisição, ativação, retenção, receita)
2. Qual é a hipótese?
3. Qual o recurso disponível? (tempo, orçamento, canais)
4. Qual o prazo?

## Template de Experimento

Criar em `docs/growth/experiments/[slug]-experiment.md`:

```markdown
# Growth Experiment: [Nome]

**Data de início:** [data]
**Data de término:** [data]
**Objetivo:** Aquisição | Ativação | Retenção | Receita | Indicação
**Status:** Planejado | Em andamento | Concluído

## Hipótese
"Acreditamos que **[AÇÃO ESPECÍFICA]** vai **[RESULTADO ESPERADO]**
para **[SEGMENTO DE USUÁRIO]** porque **[RAZÃO/EVIDÊNCIA]**."

## Métrica Principal
- Métrica: [métrica específica]
- Baseline: [valor atual]
- Meta: [valor alvo]
- Como medir: [ferramenta/método]

## Métricas Secundárias
- [métrica 2]
- [métrica 3]

## Critério de Sucesso
O experimento é um SUCESSO se: [critério claro e mensurável]
O experimento é um FRACASSO se: [critério claro]

## Execução
| Semana | Ação | Responsável |
|--------|------|-------------|
| 1 | | |
| 2 | | |

## Recursos Necessários
- Tempo estimado: [X horas/semana]
- Orçamento: [R$ X ou orgânico]
- Ferramentas: [PostHog, n8n, etc.]

## Resultados (preencher após)
- Métrica final: [resultado]
- Aprendizado: [o que aprendemos]
- Próximo passo: [escalar | pivotar | descartar]
```
