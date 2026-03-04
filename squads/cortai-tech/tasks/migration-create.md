# Task: migration-create

Cria uma nova migration PostgreSQL numerada para mudanças de schema.

## Regras Absolutas
- ⚠️ NUNCA editar migrations já commitadas (001, 002, 003, 004)
- SEMPRE criar uma nova migration com próximo número
- Migrations devem ser idempotentes (usar IF NOT EXISTS, IF EXISTS)
- Próxima migration disponível: verificar `ls migrations/` e usar N+1

## Elicitação
1. O que precisa mudar no schema? (nova tabela, nova coluna, novo índice...)
2. Qual o nome descritivo? (ex: `add_tiktok_token_to_users`)

## Passos

1. **Verificar próximo número disponível**
   ```bash
   ls /home/usuario/Documentos/cortai/migrations/ | sort
   ```

2. **Criar arquivo** `migrations/00N_description.sql`

3. **Template de migration**:
```sql
-- migrations/00N_description.sql
-- Descrição: [o que esta migration faz]
-- Criada em: [data]

-- Adicionar coluna (idempotente)
ALTER TABLE [table]
  ADD COLUMN IF NOT EXISTS [column] [type] [constraints];

-- Criar índice (idempotente)
CREATE INDEX IF NOT EXISTS idx_[table]_[column]
  ON [table]([column]);

-- Criar tabela nova (idempotente)
CREATE TABLE IF NOT EXISTS [new_table] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

4. **Testar localmente**:
```bash
# Dentro de clipify-studio/backend-v2/
PGPASSWORD=postgres psql -h localhost -U postgres -d cortai -f ../../migrations/00N_description.sql
```

5. **Registrar no script de migrate** (`backend-v2/src/scripts/migrate.ts`)

6. **Documentar na story** — incluir o SQL exato da mudança
