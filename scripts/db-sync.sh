#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
SELF_PATH="$(readlink -f "${BASH_SOURCE[0]}")"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-cortai-postgres}"
DB_NAME="${DB_NAME:-cortai_dev}"
DB_USER="${DB_USER:-postgres}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker nao encontrado no PATH." >&2
  exit 127
fi

# Re-exec via sg docker if the current session hasn't picked up docker group yet.
if ! docker info >/dev/null 2>&1; then
  if [[ -z "${CODEX_SG_REEXEC:-}" ]] && sg docker -c "docker info" >/dev/null 2>&1; then
    echo "Sessao atual ainda nao pegou o grupo docker; reexecutando via 'sg docker'..."
    export CODEX_SG_REEXEC=1
    exec sg docker -c "$(printf '%q ' bash "$SELF_PATH" "$@")"
  fi

  echo "Sem permissao para acessar o Docker daemon." >&2
  echo "Dica: rode 'newgrp docker' e tente de novo." >&2
  exit 1
fi

apply_sql_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Arquivo SQL nao encontrado: $file" >&2
    exit 1
  fi

  echo "Aplicando: $file"
  docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$file"
}

apply_sql_file "scripts/db-sync.sql"

# Keep local DB schema aligned with the backend-v2 migrations directory (single source of truth).
MIGRATIONS_DIR="clipify-studio/backend-v2/migrations"
if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "Diretorio de migrations nao encontrado: $MIGRATIONS_DIR" >&2
  exit 1
fi

while IFS= read -r file; do
  apply_sql_file "$file"
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort)

echo
docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "\\dt"
