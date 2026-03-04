#!/usr/bin/env bash
set -euo pipefail

# QA for roadmap items:
# (3) Core flow: create temp config -> start job -> process -> download clip
# (4) Billing basics without MercadoPago keys: usage, idempotency, limit enforcement

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
ADMIN_ACCESS_TOKEN="${ADMIN_ACCESS_TOKEN:-}"
QA_EMAIL="${QA_EMAIL:-}"
QA_PASSWORD="${QA_PASSWORD:-}"
QA_CREATE_USER="${QA_CREATE_USER:-0}"
QA_YOUTUBE_URL="${QA_YOUTUBE_URL:-https://www.youtube.com/watch?v=dQw4w9WgXcQ}"
QA_MAX_POLLS="${QA_MAX_POLLS:-240}"
QA_POLL_INTERVAL_SECONDS="${QA_POLL_INTERVAL_SECONDS:-5}"

tmp_dir="$(mktemp -d)"
cookie_jar="${tmp_dir}/cookies.txt"

register_json="${tmp_dir}/register.json"
usage0_json="${tmp_dir}/usage0.json"
usage1_json="${tmp_dir}/usage1.json"
usage2_json="${tmp_dir}/usage2.json"
usage3_json="${tmp_dir}/usage3.json"
usage4_json="${tmp_dir}/usage4.json"

temp_json="${tmp_dir}/temp.json"
temp2_json="${tmp_dir}/temp2.json"
job_json="${tmp_dir}/job.json"
status_json="${tmp_dir}/status.json"
limit_probe_json="${tmp_dir}/limit-probe.json"

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

assert_usage_shape() {
  python3 - "$1" <<'PY'
import json, sys

data = json.load(open(sys.argv[1]))

if "usage" in data:
  # Legacy shape
  usage = data.get("usage") or {}
  for key in ("clips_used", "clips_limit", "clips_remaining", "minutes_used", "minutes_limit", "minutes_remaining"):
    assert key in usage, (key, data)
else:
  # Current shape
  assert "planName" in data, data
  assert "clips" in data and isinstance(data["clips"], dict), data
  assert "minutes" in data and isinstance(data["minutes"], dict), data
  for key in ("used", "limit", "remaining"):
    assert key in data["clips"], (key, data)
    assert key in data["minutes"], (key, data)
  assert "canCreate" in data["clips"], data
  assert "canProcess" in data["minutes"], data

print("[qa] usage payload ok")
PY
}

usage_value() {
  local usage_json="$1"
  local metric="$2"
  python3 - "${usage_json}" "${metric}" <<'PY'
import json, sys

path, metric = sys.argv[1], sys.argv[2]
data = json.load(open(path))

if "usage" in data:
  usage = data["usage"]
  values = {
    "clips.used": usage.get("clips_used"),
    "clips.limit": usage.get("clips_limit"),
    "clips.remaining": usage.get("clips_remaining"),
    "clips.can": (usage.get("clips_remaining", 0) or 0) > 0,
    "minutes.used": usage.get("minutes_used"),
    "minutes.limit": usage.get("minutes_limit"),
    "minutes.remaining": usage.get("minutes_remaining"),
    "minutes.can": (usage.get("minutes_remaining", 0) or 0) > 0,
  }
else:
  clips = data.get("clips") or {}
  minutes = data.get("minutes") or {}
  values = {
    "clips.used": clips.get("used"),
    "clips.limit": clips.get("limit"),
    "clips.remaining": clips.get("remaining"),
    "clips.can": clips.get("canCreate"),
    "minutes.used": minutes.get("used"),
    "minutes.limit": minutes.get("limit"),
    "minutes.remaining": minutes.get("remaining"),
    "minutes.can": minutes.get("canProcess"),
  }

if metric not in values:
  raise SystemExit(f"unsupported usage metric: {metric}")

value = values[metric]
if value is None:
  raise SystemExit(f"metric {metric!r} is missing in {path}")

if isinstance(value, bool):
  print("true" if value else "false")
else:
  print(value)
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
assert_usage_shape "${usage0_json}"

echo "[qa] GET /usage/limits (after auth)"
curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/usage/limits" > "${usage1_json}"
assert_usage_shape "${usage1_json}"

echo "[qa] POST /jobs/temp (youtube)"
temp_body="${tmp_dir}/temp-body.json"
python3 - "${temp_body}" "${QA_YOUTUBE_URL}" "${user_id}" <<'PY'
import json, sys
path, youtube_url, user_id = sys.argv[1], sys.argv[2], sys.argv[3]
body = {
  "sourceType": "youtube",
  "youtubeUrl": youtube_url,
  "userId": user_id,
}
open(path, "w").write(json.dumps(body))
PY

curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d @"${temp_body}" \
  "${BACKEND_URL}/jobs/temp" > "${temp_json}"

python3 - "${temp_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert data.get("tempId"), data
assert data.get("config", {}).get("sourceType") == "youtube", data
assert data.get("config", {}).get("youtubeUrl"), data
print("[qa] temp config created")
PY

temp_id="$(json_get "${temp_json}" "tempId")"

start_body="${tmp_dir}/start-body.json"
cat > "${start_body}" <<'JSON'
{
  "clipSettings": {
    "aiClipping": true,
    "model": "Fast",
    "targetDuration": 30,
    "minDuration": 15,
    "maxDuration": 60,
    "clipCount": 3
  },
  "subtitlePreferences": {
    "position": "bottom",
    "format": "multi-line",
    "font": "Inter",
    "fontSize": 32,
    "fontColor": "#FFFFFF",
    "backgroundColor": "#000000",
    "backgroundOpacity": 0.8,
    "bold": true,
    "italic": false,
    "outline": true,
    "outlineColor": "#000000",
    "outlineWidth": 3,
    "shadow": true,
    "shadowColor": "#000000",
    "maxCharsPerLine": 28,
    "marginVertical": 260
  }
}
JSON

echo "[qa] POST /jobs/temp/${temp_id}/start"
curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d @"${start_body}" \
  "${BACKEND_URL}/jobs/temp/${temp_id}/start" > "${job_json}"

python3 - "${job_json}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert data.get("jobId"), data
print("[qa] job queued ok")
PY

job_id="$(json_get "${job_json}" "jobId")"

echo "[qa] Poll /jobs/${job_id} until completed"
completed="0"
for i in $(seq 1 "${QA_MAX_POLLS}"); do
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
print(json.dumps({"state": data.get("state"), "error": data.get("error"), "resultError": (data.get("result") or {}).get("error")}, indent=2))
PY
    exit 1
  fi

  if (( i % 12 == 0 )); then
    echo "[qa] poll ${i}/${QA_MAX_POLLS}: state=${state}"
  fi

  sleep "${QA_POLL_INTERVAL_SECONDS}"
done

if [[ "${completed}" != "1" ]]; then
  echo "[qa] FAIL: job did not complete within timeout"
  exit 1
fi

echo "[qa] Validate clip metadata (description + downloadUrl)"
download_url="$(
  python3 - "${status_json}" "${BACKEND_URL}" <<'PY'
import json, sys
path, base = sys.argv[1], sys.argv[2]
data = json.load(open(path))
result = data.get("result") or {}
clips = result.get("clips") or []
assert isinstance(clips, list) and len(clips) >= 1, data
clip = clips[0]
description = (clip.get("description") or "").strip()
assert description, clip
raw_url = (clip.get("downloadUrl") or "").strip()
assert raw_url, clip
if raw_url.startswith("http://") or raw_url.startswith("https://"):
  print(raw_url)
else:
  print(f"{base.rstrip('/')}/{raw_url.lstrip('/')}")
PY
)"
echo "[qa] clip metadata ok"

echo "[qa] Download first clip (${download_url})"
curl -fsSL \
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
assert_usage_shape "${usage2_json}"

clips_used_before_job="$(usage_value "${usage1_json}" "clips.used")"
clips_used_after_job="$(usage_value "${usage2_json}" "clips.used")"
minutes_used_before_job="$(usage_value "${usage1_json}" "minutes.used")"
minutes_used_after_job="$(usage_value "${usage2_json}" "minutes.used")"
echo "[qa] usage diff after job: clips ${clips_used_before_job} -> ${clips_used_after_job}, minutes ${minutes_used_before_job} -> ${minutes_used_after_job}"

echo "[qa] Idempotency: /increment-usage minutes=2 (same key twice)"
usage_before="$(usage_value "${usage2_json}" "minutes.used")"
idempotency_key="qa_idem_minutes_2_$(date +%s)_$RANDOM"

curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d "{\"minutes\":2,\"idempotencyKey\":\"${idempotency_key}\"}" \
  "${BACKEND_URL}/increment-usage" >/dev/null

curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d "{\"minutes\":2,\"idempotencyKey\":\"${idempotency_key}\"}" \
  "${BACKEND_URL}/increment-usage" >/dev/null

curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/usage/limits" > "${usage3_json}"

usage_after="$(usage_value "${usage3_json}" "minutes.used")"

python3 - "${usage_before}" "${usage_after}" <<'PY'
import sys
b = int(float(sys.argv[1]))
a = int(float(sys.argv[2]))
assert a == b + 2, (b, a)
print("[qa] idempotency ok")
PY

echo "[qa] Force clips over quota with /increment-usage"
clips_remaining="$(usage_value "${usage3_json}" "clips.remaining")"
over_by="$(( $(printf '%.0f' "${clips_remaining}") + 1 ))"
if [[ "${over_by}" -lt 1 ]]; then
  over_by=1
fi

overage_key="qa_over_clips_$(date +%s)_$RANDOM"
curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d "{\"shorts\":${over_by},\"idempotencyKey\":\"${overage_key}\"}" \
  "${BACKEND_URL}/increment-usage" >/dev/null

curl -fsS \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  "${BACKEND_URL}/usage/limits" > "${usage4_json}"

clips_can_after_overage="$(usage_value "${usage4_json}" "clips.can")"
clips_remaining_after_overage="$(usage_value "${usage4_json}" "clips.remaining")"

python3 - "${clips_can_after_overage}" "${clips_remaining_after_overage}" <<'PY'
import sys
can_flag = (sys.argv[1] or "").strip().lower()
remaining = float(sys.argv[2])
assert can_flag in ("false", "0"), (can_flag, remaining)
assert remaining <= 0, remaining
print("[qa] limits state after overage ok")
PY

echo "[qa] Probe enforcement: over-limit user should be blocked when starting a new job"
curl -fsS \
  -X POST \
  -c "${cookie_jar}" -b "${cookie_jar}" \
  -H 'Content-Type: application/json' \
  -d @"${temp_body}" \
  "${BACKEND_URL}/jobs/temp" > "${temp2_json}"
temp2_id="$(json_get "${temp2_json}" "tempId")"

limit_probe_status="$(
  curl -sS \
    -o "${limit_probe_json}" \
    -w '%{http_code}' \
    -X POST \
    -c "${cookie_jar}" -b "${cookie_jar}" \
    -H 'Content-Type: application/json' \
    -d @"${start_body}" \
    "${BACKEND_URL}/jobs/temp/${temp2_id}/start"
)"

if [[ "${limit_probe_status}" == "201" ]]; then
  probe_job_id="$(python3 - "${limit_probe_json}" <<'PY'
import json, sys
try:
  data = json.load(open(sys.argv[1]))
except Exception:
  data = {}
print(data.get("jobId", ""))
PY
)"
  if [[ -n "${probe_job_id}" ]]; then
    echo "[qa] cleanup: DELETE /jobs/${probe_job_id}"
    curl -fsS \
      -X DELETE \
      -c "${cookie_jar}" -b "${cookie_jar}" \
      -H 'Content-Type: application/json' \
      "${BACKEND_URL}/jobs/${probe_job_id}" >/dev/null || true
  fi
fi

python3 - "${limit_probe_status}" "${limit_probe_json}" <<'PY'
import json, sys
status = int(sys.argv[1])
path = sys.argv[2]

raw = open(path).read().strip()
if not raw:
  data = {}
else:
  try:
    data = json.loads(raw)
  except Exception:
    data = {"raw": raw}

assert status == 403, {"status": status, "body": data}
assert data.get("error") in ("LIMIT_EXCEEDED", "PLAN_REQUIRED", "FEATURE_NOT_AVAILABLE"), data
assert data.get("upgradeUrl"), data
print("[qa] limit enforcement ok")
PY

echo "[qa] OK (3 and 4 validated locally)"
