#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "docker nao encontrado no PATH." >&2
  exit 127
fi

if ! docker info >/dev/null 2>&1; then
  if sg docker -c "docker info" >/dev/null 2>&1; then
    exec sg docker -c "$(printf '%q ' bash "$0" "$@")"
  fi
fi

echo "Prune seguro: remove build cache, imagens nao usadas e containers parados (NAO remove volumes)."

docker builder prune -f
docker image prune -f
docker container prune -f

echo
docker system df -v || docker system df
