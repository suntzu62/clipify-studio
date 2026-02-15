#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Rode com sudo: sudo bash scripts/docker-disable-autostart.sh" >&2
  exit 1
fi

# Disable both the service and the socket so Docker does not start on boot
# and also does not start "on demand" via socket activation.
systemctl disable --now docker.service docker.socket 2>/dev/null || true
systemctl disable --now containerd.service 2>/dev/null || true

echo "OK: docker/containerd desabilitados no boot."
echo "Para iniciar manualmente: sudo systemctl start docker.service"

