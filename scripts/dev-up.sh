#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
SELF_PATH="$(readlink -f "${BASH_SOURCE[0]}")"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker nao encontrado no PATH." >&2
  echo "Debian 12: rode 'sudo bash scripts/setup-docker-debian12.sh' e depois reabra a sessao (grupo docker)." >&2
  exit 127
fi

if command -v systemctl >/dev/null 2>&1; then
  if ! systemctl is-active --quiet docker.service 2>/dev/null; then
    echo "Iniciando docker.service..."
    sudo systemctl start docker.service
  fi
fi

if ! docker info >/dev/null 2>&1; then
  # Common after install: user was added to group docker but current session
  # hasn't refreshed supplementary groups yet.
  if [[ -z "${CODEX_SG_REEXEC:-}" ]] && sg docker -c "docker info" >/dev/null 2>&1; then
    echo "Sessao atual ainda nao pegou o grupo docker; reexecutando via 'sg docker'..."
    export CODEX_SG_REEXEC=1
    exec sg docker -c "$(printf '%q ' bash "$SELF_PATH" "$@")"
  fi

  echo "Sem permissao para acessar o Docker daemon." >&2
  echo "Opcoes:" >&2
  echo "  1) feche a sessao e abra de novo (ou logout/login) para pegar o grupo docker" >&2
  echo "  2) rode: newgrp docker" >&2
  echo "  3) rode: sg docker -c 'bash scripts/dev-up.sh'" >&2
  echo "  4) rode os comandos docker com sudo (nao recomendado para dev com bind-mounts)" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose nao encontrado (plugin ou docker-compose)." >&2
  exit 127
fi

"${COMPOSE[@]}" up -d --build

# Keep local DB schema in sync with the backend expectations.
# Safe to re-run; useful when the repo evolves while the volume persists.
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-cortai-postgres}"
DB_NAME="${DB_NAME:-cortai_dev}"
DB_USER="${DB_USER:-postgres}"

if docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "Aguardando Postgres ficar pronto..."
  for _ in $(seq 1 30); do
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  bash scripts/db-sync.sh
fi

"${COMPOSE[@]}" ps
