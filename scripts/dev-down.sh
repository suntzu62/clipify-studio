#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
SELF_PATH="$(readlink -f "${BASH_SOURCE[0]}")"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker nao encontrado no PATH." >&2
  exit 127
fi

if ! docker info >/dev/null 2>&1; then
  if [[ -z "${CODEX_SG_REEXEC:-}" ]] && sg docker -c "docker info" >/dev/null 2>&1; then
    echo "Sessao atual ainda nao pegou o grupo docker; reexecutando via 'sg docker'..."
    export CODEX_SG_REEXEC=1
    exec sg docker -c "$(printf '%q ' bash "$SELF_PATH" "$@")"
  fi
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose nao encontrado (plugin ou docker-compose)." >&2
  exit 127
fi

"${COMPOSE[@]}" down

# If you really want Docker to only run when you ask, stop the daemon too.
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet docker.service 2>/dev/null; then
    echo "Parando docker.service..."
    sudo systemctl stop docker.service || true
  fi
fi
