#!/usr/bin/env bash
# Echo Weather — post-deploy smoke tests (run on server or locally).
#
# On the server, Apache may still have the default 000-default site on 127.0.0.1.
# Smoke tests send Host: example.com so requests hit your vhost (override with SMOKE_HOST).
#
# Usage:
#   ./scripts/smoke.sh
#   SMOKE_HOST=your.domain ./scripts/smoke.sh
#   BASE_URL=https://your.domain ./scripts/smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ROOT="$ROOT" bash "$ROOT/scripts/check-versions.sh"

BASE_URL="${BASE_URL:-http://127.0.0.1}"
BASE_URL="${BASE_URL%/}"
SMOKE_HOST="${SMOKE_HOST:-example.com}"

curl_smoke() {
  local path="$1"
  local expect="${2:-200}"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: ${SMOKE_HOST}" "${BASE_URL}${path}")"
  if [[ "$code" != "$expect" ]]; then
    echo "FAIL ${path} — HTTP ${code} (expected ${expect})" >&2
    exit 1
  fi
  echo "OK   ${path} — HTTP ${code}"
}

echo "Smoke tests: ${BASE_URL} (Host: ${SMOKE_HOST})"
curl_smoke "/"
curl_smoke "/api/status"
curl_smoke "/api/taf?ids=KGRR"

taf_body="$(curl -sS -H "Host: ${SMOKE_HOST}" "${BASE_URL}/api/taf?ids=KGRR")"
if ! printf '%s' "$taf_body" | grep -q '"icaoId":"KGRR"'; then
  echo "FAIL /api/taf?ids=KGRR — response missing KGRR TAF payload" >&2
  exit 1
fi
echo "OK   /api/taf?ids=KGRR — JSON contains KGRR"

# Stations without TAF return 204 upstream; proxy must answer 200 + [] not 502.
curl_smoke "/api/taf?ids=KBIV"
kbiv_body="$(curl -sS -H "Host: ${SMOKE_HOST}" "${BASE_URL}/api/taf?ids=KBIV")"
if [[ "$kbiv_body" != "[]" ]]; then
  echo "FAIL /api/taf?ids=KBIV — expected [] got: ${kbiv_body:0:80}" >&2
  exit 1
fi
echo "OK   /api/taf?ids=KBIV — empty TAF list (no 502)"

curl_smoke "/api/taf?ids=KBIV,KAZO"
combo_body="$(curl -sS -H "Host: ${SMOKE_HOST}" "${BASE_URL}/api/taf?ids=KBIV,KAZO")"
if ! printf '%s' "$combo_body" | grep -q '"icaoId":"KAZO"'; then
  echo "FAIL /api/taf?ids=KBIV,KAZO — expected KAZO fallback TAF" >&2
  exit 1
fi
echo "OK   /api/taf?ids=KBIV,KAZO — KAZO TAF when KBIV has none"
