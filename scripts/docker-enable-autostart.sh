#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Rode com sudo: sudo bash scripts/docker-enable-autostart.sh" >&2
  exit 1
fi

systemctl enable --now containerd.service 2>/dev/null || true
systemctl enable --now docker.service docker.socket 2>/dev/null || true

echo "OK: docker/containerd habilitados no boot."

