#!/usr/bin/env bash
set -euo pipefail

# QA for roadmap items:
# (3) Core flow: create job -> process -> download/export assets -> no missing descriptions
# (4) Billing basics without MercadoPago keys: trial, usage limits, idempotency, limit enforcement

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
ADMIN_ACCESS_TOKEN="${ADMIN_ACCESS_TOKEN:-}"
QA_EMAIL="${QA_EMAIL:-}"
QA_PASSWORD="${QA_PASSWORD:-}"
QA_CREATE_USER="${QA_CREATE_USER:-0}"

tmp_dir="$(mktemp -d)"
cookie_jar="${tmp_dir}/cookies.txt"

register_json="${tmp_dir}/register.json"
trial_json="${tmp_dir}/trial.json"
usage0_json="${tmp_dir}/usage0.json"
usage1_json="${tmp_dir}/usage1.json"
usage2_json="${tmp_dir}/usage2.json"

upload_json="${tmp_dir}/upload.json"
job_json="${tmp_dir}/job.json"
status_json="${tmp_dir}/status.json"

clip_bin="${tmp_dir}/clip.mp4"
clip_headers="${tmp_dir}/clip.headers"

created_user_id=""
did_create_user="0"

cleanup() {
  if [[ -n "${created_user_id}" && -n "${ADMIN_ACCESS_TOKEN}" ]]; then
    echo "[qa] cleanup: DELETE /admin/users/${created_user_id}"
    curl -fsS -X DELETE \
      -H "Cookie: access_token=${ADMIN_ACCESS_TOKEN}" \
      "${BACKEND_URL}/admin/users/${created_user_id}" >/dev/null || true
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

wait_health() {
  echo "[qa] WAIT /health (${BACKEND_URL})"
  for _ in $(seq 1 120); do
    if curl -fsS "${BACKEND_URL}/health" >/dev/null; then
      echo "[qa] health ok"
      return 0
    fi
    sleep 2
  done
  echo "[qa] FAIL: backend not healthy after ~240s"
  return 1
}

json_get() {
  python3 - "$@" <<'PY'
import json, sys

path = sys.argv[1]
key = sys.argv[2]

data = json.load(open(path))

cur = data
for part in key.split("."):
  if isinstance(cur, list):
    try:
      idx = int(part)
    except Exception:
      raise SystemExit(f"expected list index, got {part!r}")
    cur = cur[idx]
    continue
  if not isinstance(cur, dict):
    raise SystemExit(f"cannot traverse {part!r} on non-object: {cur!r}")
  if part not in cur:
    raise SystemExit(f"missing key {part!r} in {path}")
  cur = cur[part]

if cur is None:
  raise SystemExit(f"value for {key} is null")

if isinstance(cur, (dict, list)):
  print(json.dumps(cur))
else:
  print(cur)
PY
}

wait_health

if [[ -n "${QA_EMAIL}" ]]; then
  if [[ -z "${QA_PASSWORD}" ]]; then
    echo "[qa] FAIL: QA_PASSWORD missing (required when QA_EMAIL is set)" >&2
    exit 2
  fi

  email="${QA_EMAIL}"
  password="${QA_PASSWORD}"

  echo "[qa] POST /auth/login (${email})"
  curl -fsS \
    -c "${cookie_jar}" -b "${cookie_jar}" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    "${BACKEND_URL}/auth/login" > "${register_json}"

  python3 - "${register_json}" "${email}" <<'PY'
import json, sys
path, email = sys.argv[1], sys.argv[2]
data = json.load(open(path))
assert data.get("success") is True, data
assert data.get("user", {}).get("email") == email, data
assert data.get("user", {}).get("id"), data
print("[qa] login ok")
PY
elif [[ "${QA_CREATE_USER}" == "1" ]]; then
  email="qa_$(date +%s)_$RANDOM@example.com"
  password="QaTest123!"

  echo "[qa] POST /auth/register (${email})"
  curl -fsS \
    -c "${cookie_jar}" -b "${cookie_jar}" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\",\"fullName\":\"QA 3/4\"}" \
    "${BACKEND_URL}/auth/register" > "${register_json}"

  python3 - "${register_json}" "${email}" <<'PY'
import json, sys
path, email = sys.argv[1], sys.argv[2]
data = json.load(open(path))
assert data.get("success") is True, data
assert data.get("user", {}).get("email") == email, data
assert data.get("user", {}).get("id"), data
print("[qa] register ok")
PY
  did_create_user="1"
else
  echo "[qa] FAIL: provide QA_EMAIL/QA_PASSWORD (recommended) or set QA_CREATE_USER=1" >&2
  exit 2
fi

user_id="$(json_get "${register_json}" "user.id")"
if [[ "${did_create_user}" == "1" ]]; then
  created_user_id="${user_id}"
fi

echo "[qa] GET /usage/limits (baseline)"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/usage/limits" > "${usage0_json}"

python3 - "${usage0_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert "plan" in data and isinstance(data["plan"], dict), data
assert "usage" in data and isinstance(data["usage"], dict), data
for k in ("clips_used","clips_limit","clips_remaining","minutes_used","minutes_limit","minutes_remaining"):
  assert k in data["usage"], (k, data)
print("[qa] usage baseline ok")
PY

echo "[qa] POST /trial/start"
curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "${BACKEND_URL}/trial/start" > "${trial_json}"

python3 - "${trial_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
sub = data.get("subscription") or {}
assert sub.get("id"), data
assert sub.get("is_trial") is True, data
print("[qa] trial started ok")
PY

echo "[qa] GET /usage/limits (after trial)"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/usage/limits" > "${usage1_json}"

python3 - "${usage1_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert data.get("subscription"), data
assert data["subscription"].get("is_trial") is True, data
print("[qa] usage after trial ok")
PY

echo "[qa] Generate test video (ffmpeg)"
input_mp4="${tmp_dir}/input.mp4"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc=size=720x1280:rate=30" \
  -f lavfi -i "sine=frequency=440:sample_rate=44100" \
  -t 25 \
  -c:v libx264 -pix_fmt yuv420p \
  -c:a aac \
  -shortest \
  "${input_mp4}"

echo "[qa] POST /upload-video"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -F "video=@${input_mp4};type=video/mp4" \
  "${BACKEND_URL}/upload-video" > "${upload_json}"

python3 - "${upload_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert data.get("storagePath"), data
assert data.get("fileName"), data
assert data.get("jobId"), data
print("[qa] upload ok")
PY

storage_path="$(json_get "${upload_json}" "storagePath")"
file_name="$(json_get "${upload_json}" "fileName")"

echo "[qa] POST /jobs/from-upload (clipCount=1 targetDuration=15)"
curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"${user_id}\",\"storagePath\":\"${storage_path}\",\"fileName\":\"${file_name}\",\"targetDuration\":15,\"clipCount\":1}" \
  "${BACKEND_URL}/jobs/from-upload" > "${job_json}"

python3 - "${job_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert data.get("jobId"), data
print("[qa] job queued ok")
PY

job_id="$(json_get "${job_json}" "jobId")"

echo "[qa] Poll /jobs/${job_id} until completed"
completed="0"
for _ in $(seq 1 240); do
  curl -fsS \
    -c "${cookie_jar}" -b "${cookie_jar}" \
    -H 'Content-Type: application/json' \
    "${BACKEND_URL}/jobs/${job_id}" > "${status_json}"

  state="$(python3 - "${status_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
print(data.get("state") or data.get("status") or "")
PY
)"

  if [[ "${state}" == "completed" ]]; then
    completed="1"
    break
  fi

  if [[ "${state}" == "failed" ]]; then
    echo "[qa] FAIL: job failed"
    python3 - "${status_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
print(json.dumps({"state": data.get("state"), "error": data.get("error")}, indent=2))
PY
    exit 1
  fi

  sleep 5
done

if [[ "${completed}" != "1" ]]; then
  echo "[qa] FAIL: job did not complete within timeout"
  exit 1
fi

echo "[qa] Validate clip metadata (non-empty description + downloadUrl)"
python3 - "${status_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
result = data.get("result") or {}
clips = result.get("clips") or []
assert isinstance(clips, list) and len(clips) >= 1, data
clip = clips[0]
desc = (clip.get("description") or "").strip()
assert desc, clip
assert clip.get("downloadUrl"), clip
print("[qa] clip metadata ok")
PY

download_url="$(python3 - "${status_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
url = (data.get("result") or {}).get("clips", [{}])[0].get("downloadUrl") or ""
print(url)
PY
)"

echo "[qa] Download first clip (${download_url})"
curl -fsS \
  -D "${clip_headers}" \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  "${download_url}" > "${clip_bin}"

python3 - "${clip_bin}" "${clip_headers}" <<'PY'
import os, sys
bin_path, headers_path = sys.argv[1], sys.argv[2]
size = os.path.getsize(bin_path)
assert size > 10000, f"clip too small: {size} bytes"
headers = open(headers_path, "r", encoding="utf-8", errors="ignore").read().lower()
assert "content-type:" in headers, headers
assert ("video/mp4" in headers) or ("application/octet-stream" in headers), headers
print("[qa] clip download ok")
PY

echo "[qa] GET /usage/limits (after job)"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/usage/limits" > "${usage2_json}"

python3 - "${usage1_json}" "${usage2_json}" <<'PY'
import json, sys
b = json.load(open(sys.argv[1]))
a = json.load(open(sys.argv[2]))

bu, au = b["usage"], a["usage"]
assert au["clips_used"] >= bu["clips_used"] + 1, (bu, au)
assert au["minutes_used"] >= bu["minutes_used"] + 1, (bu, au)
print("[qa] usage increment after job ok")
PY

echo "[qa] Idempotency: /increment-usage minutes=2 (same idempotencyKey twice)"
usage_before="$(json_get "${usage2_json}" "usage.minutes_used")"

curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d '{"minutes":2,"idempotencyKey":"qa_idem_minutes_2"}' \
  "${BACKEND_URL}/increment-usage" >/dev/null

curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d '{"minutes":2,"idempotencyKey":"qa_idem_minutes_2"}' \
  "${BACKEND_URL}/increment-usage" >/dev/null

usage3_json="${tmp_dir}/usage3.json"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/usage/limits" > "${usage3_json}"
usage_after="$(json_get "${usage3_json}" "usage.minutes_used")"

python3 - "${usage_before}" "${usage_after}" <<'PY'
import sys
b = int(sys.argv[1])
a = int(sys.argv[2])
assert a == b + 2, (b, a)
print("[qa] idempotency ok")
PY

echo "[qa] Limit enforcement: exceed clips quota then POST /jobs/from-upload => 403 LIMIT_EXCEEDED"
limits_json="${tmp_dir}/limits.json"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/usage/limits" > "${limits_json}"
clips_remaining="$(json_get "${limits_json}" "usage.clips_remaining")"

over_by=$((clips_remaining + 1))
curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d "{\"shorts\":${over_by},\"idempotencyKey\":\"qa_over_clips_${RANDOM}\"}" \
  "${BACKEND_URL}/increment-usage" >/dev/null

http_code="$(curl -sS \
  -o "${tmp_dir}/limit_resp.json" \
  -w '%{http_code}' \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"${user_id}\",\"storagePath\":\"${storage_path}\",\"fileName\":\"${file_name}\",\"targetDuration\":15,\"clipCount\":1}" \
  "${BACKEND_URL}/jobs/from-upload" || true)"

python3 - "${http_code}" "${tmp_dir}/limit_resp.json" <<'PY'
import json, sys
code, path = int(sys.argv[1]), sys.argv[2]
assert code == 403, code
data = json.load(open(path))
assert data.get("error") == "LIMIT_EXCEEDED", data
assert data.get("upgradeUrl"), data
print("[qa] limit enforcement ok")
PY

echo "[qa] OK (3 and 4 validated locally)"
