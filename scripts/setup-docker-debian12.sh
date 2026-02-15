#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Rode com sudo: sudo bash scripts/setup-docker-debian12.sh" >&2
  exit 1
fi

TARGET_USER="${TARGET_USER:-${SUDO_USER:-}}"
if [[ -z "$TARGET_USER" || "$TARGET_USER" == "root" ]]; then
  echo "Defina TARGET_USER ou rode via sudo a partir do seu usuario." >&2
  echo "Ex: sudo TARGET_USER=usuario bash scripts/setup-docker-debian12.sh" >&2
  exit 1
fi

TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
if [[ -z "$TARGET_HOME" || ! -d "$TARGET_HOME" ]]; then
  echo "Nao consegui resolver HOME do usuario: $TARGET_USER" >&2
  exit 1
fi

DATA_ROOT="${TARGET_HOME}/.docker-data"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian ${CODENAME} stable" >/etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

usermod -aG docker "$TARGET_USER" || true

mkdir -p "$DATA_ROOT"
mkdir -p /etc/docker

if [[ -f /etc/docker/daemon.json ]]; then
  cp -a /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%Y%m%d%H%M%S)"
fi

cat >/etc/docker/daemon.json <<JSON
{
  "data-root": "${DATA_ROOT}",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
JSON

systemctl daemon-reload || true
systemctl restart docker.service || true

# User preference: do not start on boot; only via manual command.
systemctl disable --now docker.service docker.socket 2>/dev/null || true
systemctl disable --now containerd.service 2>/dev/null || true

echo
echo "OK."
echo "1) Reabra a sessao para pegar o grupo docker (ou rode docker com sudo)."
echo "2) Subir o stack: bash scripts/dev-up.sh"
echo "3) Descer e parar o daemon: bash scripts/dev-down.sh"

