# Task: feature-prd

Cria um Product Requirements Document (PRD) para uma nova feature.

## Elicitação
1. Qual é a feature? (nome e descrição em 1 frase)
2. Quem pediu? (usuário, análise de dados, competitor analysis?)
3. Qual a dor que resolve?
4. Qual o tamanho do impacto esperado? (MRR, retenção, aquisição)

## Template de PRD

Criar arquivo em: `docs/prd/[feature-name]-prd.md`

```markdown
# PRD: [Feature Name]

**Data:** [data]
**Status:** Draft | Review | Approved
**Prioridade:** P0 (blocker) | P1 (alta) | P2 (média) | P3 (baixa)

## Problema
[Descreva o problema ou oportunidade que esta feature resolve]

## Usuários Afetados
- Segmento: [criadores, agências, etc.]
- Tamanho: [estimativa de usuários que se beneficiam]

## Solução Proposta
[Descrição clara do que a feature faz — NÃO como é implementada]

## Casos de Uso
1. **[Actor]** pode **[ação]** para **[objetivo]**
2. **[Actor]** pode **[ação]** para **[objetivo]**

## Critérios de Sucesso
| Métrica | Baseline | Meta em 30 dias |
|---------|---------|-----------------|
| [métrica] | [atual] | [alvo] |

## Fora do Escopo
- [O que esta feature NÃO vai fazer]

## Dependências
- Feature flag: [qual flag ativar?]
- Externos: [APIs, integrações?]
- Internos: [outras features que devem existir?]

## Riscos
| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|

## Timeline Estimada
- Design/UX: [X dias]
- Backend: [X dias]
- Frontend: [X dias]
- QA: [X dias]

## Próximos Passos
1. [ ] Aprovação do PRD
2. [ ] Architecture Design (@architect)
3. [ ] Stories criadas (@sm)
4. [ ] Desenvolvimento (@dev)
```
