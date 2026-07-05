#!/usr/bin/env bash
# Echo Weather — post-deploy smoke tests (run on server or locally).
# Usage:
#   ./scripts/smoke.sh                    # http://127.0.0.1
#   BASE_URL=https://echoweather.com ./scripts/smoke.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1}"
BASE_URL="${BASE_URL%/}"
LAT="${SMOKE_LAT:-43.0631}"
LON="${SMOKE_LON:--86.2284}"

pass=0
fail=0

check() {
  local name="$1"
  local ok="$2"
  local detail="$3"
  if [[ "$ok" == "1" ]]; then
    echo "  OK   $name — $detail"
    pass=$((pass + 1))
  else
    echo "  FAIL $name — $detail"
    fail=$((fail + 1))
  fi
}

echo "Smoke tests: $BASE_URL"
echo

# --- /api/status ---
status_code="$(curl -sS -o /tmp/echo-smoke-status.json -w '%{http_code}' "$BASE_URL/api/status" || echo 000)"
status_body="$(cat /tmp/echo-smoke-status.json 2>/dev/null || true)"
check "GET /api/status" "$([[ "$status_code" == "200" ]] && echo 1 || echo 0)" "HTTP $status_code"

airnow_cfg=0
pollen_cfg=0
buoy_cfg=0
if command -v python3 >/dev/null 2>&1; then
  airnow_cfg="$(python3 -c "import json; d=json.load(open('/tmp/echo-smoke-status.json')); print(1 if d.get('airnow') else 0)" 2>/dev/null || echo 0)"
  pollen_cfg="$(python3 -c "import json; d=json.load(open('/tmp/echo-smoke-status.json')); print(1 if d.get('pollen') else 0)" 2>/dev/null || echo 0)"
  buoy_cfg="$(python3 -c "import json; d=json.load(open('/tmp/echo-smoke-status.json')); print(1 if d.get('buoy') else 0)" 2>/dev/null || echo 0)"
fi
check "status.airnow configured" "$airnow_cfg" "$([[ "$airnow_cfg" == "1" ]] && echo 'true' || echo 'false — set airnow_api_key in config.local.php')"
check "status.pollen configured" "1" "$([[ "$pollen_cfg" == "1" ]] && echo 'true' || echo 'false (optional)')"
check "status.buoy" "$buoy_cfg" "$([[ "$buoy_cfg" == "1" ]] && echo 'true' || echo 'false')"

# --- /api/airnow ---
airnow_code="$(curl -sS -o /tmp/echo-smoke-airnow.json -w '%{http_code}' \
  "$BASE_URL/api/airnow?latitude=$LAT&longitude=$LON&distance=50" || echo 000)"
airnow_body="$(cat /tmp/echo-smoke-airnow.json 2>/dev/null || true)"
if [[ "$airnow_code" == "200" ]]; then
  airnow_ok=1
  if command -v python3 >/dev/null 2>&1; then
    obs_count="$(python3 -c "import json; d=json.load(open('/tmp/echo-smoke-airnow.json')); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo 0)"
    airnow_detail="HTTP 200, ${obs_count} observation(s) near Grand Haven"
    if [[ "$obs_count" == "0" ]]; then
      airnow_ok=1
      airnow_detail="HTTP 200, empty (no monitor within 50 mi — modeled AQI fallback in app)"
    fi
  else
    airnow_detail="HTTP 200"
  fi
  check "GET /api/airnow" "$airnow_ok" "$airnow_detail"
elif [[ "$airnow_code" == "503" ]]; then
  check "GET /api/airnow" "0" "HTTP 503 — key missing or invalid: $airnow_body"
else
  check "GET /api/airnow" "0" "HTTP $airnow_code — $airnow_body"
fi

# --- /api/pollen (optional) ---
pollen_code="$(curl -sS -o /tmp/echo-smoke-pollen.json -w '%{http_code}' \
  "$BASE_URL/api/pollen?latitude=$LAT&longitude=$LON&days=3" || echo 000)"
if [[ "$pollen_code" == "200" ]]; then
  check "GET /api/pollen" "1" "HTTP 200"
elif [[ "$pollen_code" == "503" || "$pollen_code" == "502" ]]; then
  check "GET /api/pollen" "1" "HTTP $pollen_code — not configured or quota (optional)"
else
  check "GET /api/pollen" "0" "HTTP $pollen_code"
fi

# --- /api/buoy ---
buoy_code="$(curl -sS -o /tmp/echo-smoke-buoy.txt -w '%{http_code}' \
  "$BASE_URL/api/buoy/45029" || echo 000)"
buoy_head="$(head -c 80 /tmp/echo-smoke-buoy.txt 2>/dev/null | tr '\n' ' ' || true)"
check "GET /api/buoy/45029" "$([[ "$buoy_code" == "200" ]] && echo 1 || echo 0)" "HTTP $buoy_code — $buoy_head"

# --- static assets ---
for path in index.html sw.js og-image.png manifest.json; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/$path" || echo 000)"
  check "GET /$path" "$([[ "$code" == "200" ]] && echo 1 || echo 0)" "HTTP $code"
done

rm -f /tmp/echo-smoke-status.json /tmp/echo-smoke-airnow.json /tmp/echo-smoke-pollen.json /tmp/echo-smoke-buoy.txt

echo
echo "Results: $pass passed, $fail failed"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
