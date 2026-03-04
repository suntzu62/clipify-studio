# STORY-[EPIC]-[N]: [Título da Story]

**Epic:** [Nome do Epic]
**Agente Responsável:** @dev
**Status:** [ ] Todo [ ] In Progress [x] Done
**Criada em:** [data]
**Branch:** feature/[slug]

---

## Contexto

[Explique O QUE, POR QUE e COMO desta story. Inclua:
- Decisões arquiteturais relevantes
- Arquivos existentes que devem ser consultados
- Padrões que devem ser seguidos]

### Arquivos de Referência
- `clipify-studio/backend-v2/src/services/[similar-service].ts` — padrão a seguir
- `migrations/004_[last-migration].sql` — referência de migration

---

## Critérios de Aceite

- [ ] AC1: [critério específico e testável]
- [ ] AC2: [critério específico e testável]
- [ ] AC3: [critério específico e testável]

---

## Guia de Implementação

### Arquivos a Criar
| Arquivo | Propósito |
|---------|-----------|
| `clipify-studio/backend-v2/src/services/[name].ts` | [descrever] |
| `migrations/00N_[description].sql` | [schema change] |

### Arquivos a Modificar
| Arquivo | O que muda |
|---------|-----------|
| `clipify-studio/backend-v2/src/api/[name].routes.ts` | [adicionar rota] |
| `clipify-studio/backend-v2/src/types/index.ts` | [adicionar schema Zod] |

### Contrato de API (se aplicável)
```
Method: POST
Path: /api/v1/[endpoint]
Auth: Required (Bearer token)
Request: {
  field: string
}
Response: {
  field: string
  id: string
}
```

### Migration SQL (se aplicável)
```sql
-- migrations/00N_description.sql
ALTER TABLE [table]
  ADD COLUMN IF NOT EXISTS [column] [type];
```

### Lógica de Negócio (pontos críticos)
1. [ponto importante]
2. [edge case a tratar]

---

## Requisitos de Teste

- [ ] Unit test: `clipify-studio/backend-v2/src/services/[name].test.ts`
- [ ] Cobrir: [cenário de sucesso]
- [ ] Cobrir: [cenário de erro]
- [ ] Cobrir: [edge case]

---

## File List (atualizado pelo @dev durante implementação)

- [ ] `migrations/00N_description.sql` (criar)
- [ ] `clipify-studio/backend-v2/src/services/[name].ts` (criar)
- [ ] `clipify-studio/backend-v2/src/api/[name].routes.ts` (modificar)
- [ ] `clipify-studio/backend-v2/src/types/index.ts` (modificar)
- [ ] `clipify-studio/backend-v2/src/services/[name].test.ts` (criar)

---

## Notas de Deploy

```bash
# Submodule commit
cd clipify-studio && git add -p && git commit -m "feat: [story title]" && git push origin staging
cd .. && git add clipify-studio && git commit -m "chore: sync submodule with [story title]"
```

### Ordem de Deploy em Produção
1. [ ] Aplicar migration: `npm run migrate` no Render.com
2. [ ] Deploy da API
3. [ ] Deploy do Worker
4. [ ] Verificar /health
