#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
ADMIN_ACCESS_TOKEN="${ADMIN_ACCESS_TOKEN:-}"
SMOKE_EMAIL="${SMOKE_EMAIL:-}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-}"
SMOKE_CREATE_USER="${SMOKE_CREATE_USER:-0}"
# true: assert upload routes are disabled
# false: assert upload routes are enabled (input validation errors are expected with empty payload)
# auto: accept either mode (useful for generic post-deploy smoke)
SMOKE_EXPECT_UPLOADS_DISABLED="${SMOKE_EXPECT_UPLOADS_DISABLED:-auto}"

tmp_dir="$(mktemp -d)"
cookie_jar="${tmp_dir}/cookies.txt"
register_json="${tmp_dir}/register.json"
me_json="${tmp_dir}/me.json"
plans_json="${tmp_dir}/plans.json"
usage_json="${tmp_dir}/usage.json"
temp_json="${tmp_dir}/temp.json"
temp_get_json="${tmp_dir}/temp_get.json"
upload_disabled_json="${tmp_dir}/upload_disabled.json"
from_upload_disabled_json="${tmp_dir}/from_upload_disabled.json"

created_user_id=""
temp_id=""
smoke_user_id=""

cleanup() {
  if [[ -n "${created_user_id}" && -n "${ADMIN_ACCESS_TOKEN}" ]]; then
    echo "[smoke] cleanup: DELETE /admin/users/${created_user_id}"
    curl -fsS -X DELETE \
      -H "Cookie: access_token=${ADMIN_ACCESS_TOKEN}" \
      "${BACKEND_URL}/admin/users/${created_user_id}" >/dev/null || true
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

echo "[smoke] backend: ${BACKEND_URL}"

echo "[smoke] WAIT /health"
health_ok="0"
for i in $(seq 1 90); do
  if curl -fsS "${BACKEND_URL}/health" >/dev/null; then
    health_ok="1"
    break
  fi
  sleep 2
done

if [[ "${health_ok}" != "1" ]]; then
  echo "[smoke] FAIL: backend not healthy after ~180s"
  exit 1
fi

echo "[smoke] health ok"

if [[ -n "${SMOKE_EMAIL}" ]]; then
  if [[ -z "${SMOKE_PASSWORD}" ]]; then
    echo "[smoke] FAIL: SMOKE_PASSWORD missing (required when SMOKE_EMAIL is set)" >&2
    exit 2
  fi

  email="${SMOKE_EMAIL}"
  password="${SMOKE_PASSWORD}"

  echo "[smoke] POST /auth/login (${email})"
  curl -fsS \
    -c "${cookie_jar}" -b "${cookie_jar}" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    "${BACKEND_URL}/auth/login" > "${register_json}"

  python3 - <<'PY' "${register_json}" "${email}"
import json, sys
path, email = sys.argv[1], sys.argv[2]
data = json.load(open(path))
assert data.get("success") is True, data
assert data.get("user", {}).get("email") == email, data
print("[smoke] login ok")
PY
elif [[ "${SMOKE_CREATE_USER}" == "1" ]]; then
  email="smoke_$(date +%s)_$RANDOM@example.com"
  password="SmokeTest123!"

  echo "[smoke] POST /auth/register (${email})"
  curl -fsS \
    -c "${cookie_jar}" -b "${cookie_jar}" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\",\"fullName\":\"Smoke Test\"}" \
    "${BACKEND_URL}/auth/register" > "${register_json}"

  created_user_id="$(python3 - <<'PY' "${register_json}"
import json, sys
path = sys.argv[1]
data = json.load(open(path))
assert data.get("success") is True, data
assert data.get("user", {}).get("email"), data
assert data.get("user", {}).get("id"), data
print(data["user"]["id"])
PY
)"
  echo "[smoke] register ok"
else
  echo "[smoke] FAIL: provide SMOKE_EMAIL/SMOKE_PASSWORD (recommended) or set SMOKE_CREATE_USER=1" >&2
  exit 2
fi

smoke_user_id="$(python3 - <<'PY' "${register_json}"
import json, sys
path = sys.argv[1]
data = json.load(open(path))
assert data.get("user", {}).get("id"), data
print(data["user"]["id"])
PY
)"

echo "[smoke] GET /auth/me"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/auth/me" > "${me_json}"

python3 - <<'PY' "${me_json}" "${email}"
import json, sys
path, email = sys.argv[1], sys.argv[2]
data = json.load(open(path))
assert data.get("user", {}).get("email") == email, data
print("[smoke] auth/me ok")
PY

echo "[smoke] GET /plans"
curl -fsS "${BACKEND_URL}/plans" > "${plans_json}"

python3 - <<'PY' "${plans_json}"
import json, sys
path = sys.argv[1]
data = json.load(open(path))
assert isinstance(data, list), data
assert len(data) >= 1, data
print("[smoke] plans ok")
PY

echo "[smoke] GET /usage/limits"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/usage/limits" > "${usage_json}"

python3 - <<'PY' "${usage_json}"
import json, sys
path = sys.argv[1]
data = json.load(open(path))

if "usage" in data:
    # Legacy shape
    assert "clips_remaining" in data["usage"], data
    assert "minutes_remaining" in data["usage"], data
else:
    # Current shape
    assert "planName" in data, data
    assert "clips" in data and isinstance(data["clips"], dict), data
    assert "minutes" in data and isinstance(data["minutes"], dict), data
    assert "remaining" in data["clips"], data
    assert "remaining" in data["minutes"], data

print("[smoke] usage/limits ok")
PY

echo "[smoke] POST /jobs/temp (YouTube-only workflow)"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d "{\"youtubeUrl\":\"https://youtube.com/watch?v=dQw4w9WgXcQ\",\"sourceType\":\"youtube\",\"userId\":\"${smoke_user_id}\"}" \
  "${BACKEND_URL}/jobs/temp" > "${temp_json}"

temp_id="$(python3 - <<'PY' "${temp_json}"
import json, sys
path = sys.argv[1]
data = json.load(open(path))
assert data.get("tempId"), data
assert data.get("config", {}).get("youtubeUrl"), data
print(data["tempId"])
PY
)"
echo "[smoke] jobs/temp ok (tempId=${temp_id})"

echo "[smoke] GET /jobs/temp/${temp_id}"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/jobs/temp/${temp_id}" > "${temp_get_json}"

python3 - <<'PY' "${temp_get_json}" "${temp_id}"
import json, sys
path, temp_id = sys.argv[1], sys.argv[2]
data = json.load(open(path))
assert data.get("tempId") == temp_id, data
assert data.get("youtubeUrl"), data
assert data.get("sourceType") == "youtube", data
print("[smoke] jobs/temp/:id ok")
PY

echo "[smoke] POST /upload-video (mode=${SMOKE_EXPECT_UPLOADS_DISABLED})"
upload_status="$(
  curl -sS \
    -o "${upload_disabled_json}" \
    -w '%{http_code}' \
    -X POST \
    -c "${cookie_jar}" -b "${cookie_jar}" \
    -H 'Content-Type: application/json' \
    -d '{}' \
    "${BACKEND_URL}/upload-video"
)"

echo "[smoke] POST /jobs/from-upload (mode=${SMOKE_EXPECT_UPLOADS_DISABLED})"
from_upload_status="$(
  curl -sS \
    -o "${from_upload_disabled_json}" \
    -w '%{http_code}' \
    -X POST \
    -c "${cookie_jar}" -b "${cookie_jar}" \
    -H 'Content-Type: application/json' \
    -d '{}' \
    "${BACKEND_URL}/jobs/from-upload"
)"

python3 - <<'PY' "${SMOKE_EXPECT_UPLOADS_DISABLED}" "${upload_disabled_json}" "${upload_status}" "${from_upload_disabled_json}" "${from_upload_status}"
import json, sys

mode = (sys.argv[1] or "auto").strip().lower()
upload_path, upload_status = sys.argv[2], int(sys.argv[3])
from_upload_path, from_upload_status = sys.argv[4], int(sys.argv[5])

def load_json(path):
    raw = open(path).read().strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {"raw": raw}

upload = load_json(upload_path)
from_upload = load_json(from_upload_path)

disabled_errors = {"UPLOADS_DISABLED", "NOT_FOUND", "NOT_ALLOWED"}
enabled_upload_statuses = {400, 415, 422}
enabled_from_upload_statuses = {400, 422}

upload_is_disabled = upload_status in (403, 404) and upload.get("error") in disabled_errors
from_upload_is_disabled = from_upload_status in (403, 404) and from_upload.get("error") in disabled_errors

upload_route_missing = (
    upload_status == 404
    and (
        str(upload.get("message", "")).lower().find("route post:/upload-video not found") >= 0
        or str(upload.get("error", "")).lower() == "not found"
    )
)

upload_looks_enabled = upload_status in enabled_upload_statuses and upload.get("error") != "UPLOADS_DISABLED"
from_upload_looks_enabled = (
    from_upload_status in enabled_from_upload_statuses
    and from_upload.get("error") in ("INVALID_INPUT", "VALIDATION_ERROR", None)
)

if mode in ("1", "true", "yes"):
    assert upload_is_disabled or upload_route_missing, (upload_status, upload)
    assert from_upload_is_disabled, (from_upload_status, from_upload)
    print("[smoke] upload routes disabled ok")
elif mode in ("0", "false", "no"):
    assert upload_looks_enabled or upload_route_missing, (upload_status, upload)
    assert from_upload_looks_enabled, (from_upload_status, from_upload)
    print("[smoke] upload routes enabled ok")
elif mode in ("auto", ""):
    if (upload_is_disabled or upload_route_missing) and from_upload_is_disabled:
        print("[smoke] upload routes disabled (auto mode)")
    elif (upload_looks_enabled or upload_route_missing) and from_upload_looks_enabled:
        print("[smoke] upload routes enabled (auto mode)")
    else:
        raise AssertionError({
            "mode": "auto",
            "upload": {"status": upload_status, "body": upload},
            "from_upload": {"status": from_upload_status, "body": from_upload},
        })
else:
    raise AssertionError(f"invalid SMOKE_EXPECT_UPLOADS_DISABLED value: {mode}")
PY

echo "[smoke] POST /auth/logout"
curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "${BACKEND_URL}/auth/logout" >/dev/null

echo "[smoke] OK"
