#!/usr/bin/env bash
set -euo pipefail

STAGING_BACKEND_URL="${STAGING_BACKEND_URL:-${1:-}}"
WEBHOOK_PATH="${WEBHOOK_PATH:-/webhooks/mercadopago}"
X_SIGNATURE="${X_SIGNATURE:-}"
X_REQUEST_ID="${X_REQUEST_ID:-test-request-$(date +%s)}"

if [[ -z "${STAGING_BACKEND_URL}" ]]; then
  echo "Uso:" >&2
  echo "  STAGING_BACKEND_URL=https://seu-backend-staging.onrender.com bash scripts/test-webhook-staging.sh" >&2
  echo "ou" >&2
  echo "  bash scripts/test-webhook-staging.sh https://seu-backend-staging.onrender.com" >&2
  exit 2
fi

url="${STAGING_BACKEND_URL%/}${WEBHOOK_PATH}"
tmp_dir="$(mktemp -d)"
headers_file="${tmp_dir}/headers.txt"
body_file="${tmp_dir}/body.json"

cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

payload="$(cat <<'JSON'
{
  "type": "payment",
  "action": "payment.updated",
  "data": { "id": "1234567890" }
}
JSON
)"

echo "[webhook-staging] POST ${url}"

curl_args=(
  -sS
  -X POST
  -H "Content-Type: application/json"
  -H "X-Request-Id: ${X_REQUEST_ID}"
  -d "${payload}"
  -D "${headers_file}"
  -o "${body_file}"
  -w "%{http_code}"
  "${url}"
)

if [[ -n "${X_SIGNATURE}" ]]; then
  curl_args+=(-H "X-Signature: ${X_SIGNATURE}")
fi

status="$(curl "${curl_args[@]}")"

echo "[webhook-staging] status=${status}"
echo "[webhook-staging] body:"
cat "${body_file}"
echo

python3 - <<'PY' "${status}" "${body_file}"
import json, sys
status = int(sys.argv[1])
body_path = sys.argv[2]
raw = open(body_path, "r", encoding="utf-8").read().strip()
if status < 200 or status >= 300:
    raise SystemExit(f"FAIL: expected 2xx, got {status}. body={raw}")
try:
    data = json.loads(raw) if raw else {}
except Exception:
    raise SystemExit(f"FAIL: response is not valid JSON: {raw!r}")
if "received" not in data:
    raise SystemExit(f"FAIL: expected field 'received' in response, got: {data}")
print("OK: webhook endpoint respondeu corretamente.")
PY
