#!/bin/bash

set -euo pipefail

BASE_URL="${BASE_URL:-}"
INTERNAL_API_KEY="${INTERNAL_API_KEY:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
OWN_JOB_ID="${OWN_JOB_ID:-}"
FOREIGN_JOB_ID="${FOREIGN_JOB_ID:-}"

if [ -z "$BASE_URL" ]; then
  echo "Uso: BASE_URL=https://api.seuapp.com [INTERNAL_API_KEY=...] [AUTH_TOKEN=...] [OWN_JOB_ID=...] [FOREIGN_JOB_ID=...] $0"
  exit 1
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

status_code() {
  local url="$1"
  shift
  curl -sS -o /tmp/cortai-security-check.out -w "%{http_code}" "$@" "$url"
}

assert_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [ "$expected" = "$actual" ]; then
    ok "$label -> HTTP $actual"
  else
    echo "Resposta:"
    cat /tmp/cortai-security-check.out || true
    fail "$label -> esperado HTTP $expected, recebido $actual"
  fi
}

assert_not_status() {
  local forbidden="$1"
  local actual="$2"
  local label="$3"
  if [ "$forbidden" = "$actual" ]; then
    echo "Resposta:"
    cat /tmp/cortai-security-check.out || true
    fail "$label -> recebeu HTTP proibido $actual"
  else
    ok "$label -> HTTP $actual"
  fi
}

assert_one_of() {
  local actual="$1"
  local label="$2"
  shift 2
  local allowed=("$@")
  for expected in "${allowed[@]}"; do
    if [ "$actual" = "$expected" ]; then
      ok "$label -> HTTP $actual"
      return 0
    fi
  done
  echo "Resposta:"
  cat /tmp/cortai-security-check.out || true
  fail "$label -> esperado um de: ${allowed[*]}, recebido $actual"
}

echo "========================================"
echo "Security Smoke Test - Production"
echo "BASE_URL=$BASE_URL"
echo "========================================"

info "1. Health publico"
code="$(status_code "$BASE_URL/health")"
assert_status "200" "$code" "GET /health"

info "2. Endpoints internos bloqueados sem chave"
code="$(status_code "$BASE_URL/health/details")"
assert_one_of "$code" "GET /health/details sem chave" 401 403

code="$(status_code "$BASE_URL/queue/stats")"
assert_one_of "$code" "GET /queue/stats sem chave" 401 403

if [ -n "$INTERNAL_API_KEY" ]; then
  info "3. Endpoints internos liberados com INTERNAL_API_KEY"
  code="$(status_code "$BASE_URL/health/details" -H "x-api-key: $INTERNAL_API_KEY")"
  assert_status "200" "$code" "GET /health/details com chave interna"

  code="$(status_code "$BASE_URL/queue/stats" -H "x-api-key: $INTERNAL_API_KEY")"
  assert_status "200" "$code" "GET /queue/stats com chave interna"
else
  warn "INTERNAL_API_KEY ausente; pulando testes positivos de endpoints internos"
fi

info "4. CORS: origem maliciosa nao deve ser aceita em mutacoes"
code="$(status_code "$BASE_URL/jobs" -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST")"
assert_one_of "$code" "Preflight com origem invalida" 403 204

if [ -s /tmp/cortai-security-check.out ] && grep -qi "origin_not_allowed" /tmp/cortai-security-check.out; then
  ok "Origem invalida rejeitada explicitamente"
else
  warn "A resposta nao expôs 'origin_not_allowed'; confirme no header se a origem nao foi permitida"
fi

info "5. Criacao de job sem autenticacao"
code="$(status_code "$BASE_URL/jobs" -X POST -H "Content-Type: application/json" --data '{"sourceType":"youtube","youtubeUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}')"
assert_one_of "$code" "POST /jobs sem autenticacao" 401 403

if [ -n "$AUTH_TOKEN" ] && [ -n "$OWN_JOB_ID" ]; then
  info "6. Job proprio com token"
  code="$(status_code "$BASE_URL/jobs/$OWN_JOB_ID" -H "Authorization: Bearer $AUTH_TOKEN")"
  assert_not_status "401" "$code" "GET /jobs/$OWN_JOB_ID com token"
else
  warn "AUTH_TOKEN ou OWN_JOB_ID ausentes; pulando teste positivo de job proprio"
fi

if [ -n "$AUTH_TOKEN" ] && [ -n "$FOREIGN_JOB_ID" ]; then
  info "7. Job de outro usuario deve falhar"
  code="$(status_code "$BASE_URL/jobs/$FOREIGN_JOB_ID" -H "Authorization: Bearer $AUTH_TOKEN")"
  assert_one_of "$code" "GET /jobs/$FOREIGN_JOB_ID com token alheio" 403 404
else
  warn "FOREIGN_JOB_ID ausente; pulando teste de isolamento entre usuarios"
fi

echo "========================================"
ok "Smoke test finalizado"
echo "========================================"
