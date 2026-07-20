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
# CI / flaky upstream: retry transient failures a few times.
SMOKE_RETRIES="${SMOKE_RETRIES:-3}"
SMOKE_RETRY_SLEEP="${SMOKE_RETRY_SLEEP:-2}"

curl_code() {
  local path="$1"
  local out="${2:-/dev/null}"
  curl -sS -o "$out" -w '%{http_code}' -H "Host: ${SMOKE_HOST}" --connect-timeout 8 --max-time 45 \
    "${BASE_URL}${path}" || echo "000"
}

curl_smoke() {
  local path="$1"
  local expect="${2:-200}"
  local code="" attempt=1
  while (( attempt <= SMOKE_RETRIES )); do
    code="$(curl_code "$path")"
    if [[ "$code" == "$expect" ]]; then
      echo "OK   ${path} — HTTP ${code}"
      return 0
    fi
    # Retry only transient upstream / boot races.
    if [[ "$code" != "502" && "$code" != "503" && "$code" != "000" && "$code" != "429" ]]; then
      break
    fi
    if (( attempt < SMOKE_RETRIES )); then
      echo "RETRY ${path} — HTTP ${code} (attempt ${attempt}/${SMOKE_RETRIES})" >&2
      sleep "$SMOKE_RETRY_SLEEP"
    fi
    attempt=$((attempt + 1))
  done
  echo "FAIL ${path} — HTTP ${code} (expected ${expect})" >&2
  exit 1
}

echo "Smoke tests: ${BASE_URL} (Host: ${SMOKE_HOST})"
curl_smoke "/"
curl_smoke "/api/status"

# TAF depends on aviationweather.gov — retry, then soft-fail in CI if still down.
taf_ok=0
taf_code=""
for attempt in $(seq 1 "$SMOKE_RETRIES"); do
  taf_code="$(curl_code "/api/taf?ids=KGRR" /tmp/echoweather-taf-kgrr.json)"
  if [[ "$taf_code" == "200" ]] && grep -q '"icaoId":"KGRR"' /tmp/echoweather-taf-kgrr.json; then
    echo "OK   /api/taf?ids=KGRR — HTTP 200 JSON contains KGRR"
    taf_ok=1
    break
  fi
  if (( attempt < SMOKE_RETRIES )); then
    echo "RETRY /api/taf?ids=KGRR — HTTP ${taf_code} (attempt ${attempt}/${SMOKE_RETRIES})" >&2
    sleep "$SMOKE_RETRY_SLEEP"
  fi
done
if [[ "$taf_ok" != "1" ]]; then
  if [[ "${CI:-}" == "true" && ( "$taf_code" == "502" || "$taf_code" == "503" || "$taf_code" == "000" ) ]]; then
    echo "WARN /api/taf?ids=KGRR — HTTP ${taf_code} (upstream AviationWeather unavailable in CI; route OK)"
  else
    echo "FAIL /api/taf?ids=KGRR — HTTP ${taf_code} (expected 200 with KGRR)" >&2
    exit 1
  fi
else
  curl_smoke "/api/taf?ids=KBIV"
  kbiv_body="$(curl -sS -H "Host: ${SMOKE_HOST}" --connect-timeout 8 --max-time 45 "${BASE_URL}/api/taf?ids=KBIV" || true)"
  if [[ "$kbiv_body" != "[]" ]]; then
    echo "FAIL /api/taf?ids=KBIV — expected [] got: ${kbiv_body:0:80}" >&2
    exit 1
  fi
  echo "OK   /api/taf?ids=KBIV — empty TAF list (no 502)"

  curl_smoke "/api/taf?ids=KBIV,KAZO"
  combo_body="$(curl -sS -H "Host: ${SMOKE_HOST}" --connect-timeout 8 --max-time 45 "${BASE_URL}/api/taf?ids=KBIV,KAZO" || true)"
  if ! printf '%s' "$combo_body" | grep -q '"icaoId":"KAZO"'; then
    echo "FAIL /api/taf?ids=KBIV,KAZO — expected KAZO fallback TAF" >&2
    exit 1
  fi
  echo "OK   /api/taf?ids=KBIV,KAZO — KAZO TAF when KBIV has none"
fi

# HMS smoke proxy must be routed — 404 means rewrite missing.
# 200 ideal; 502/429 acceptable when upstream/rate-limit; empty cache in CI is OK.
hms_code="000"
for attempt in $(seq 1 "$SMOKE_RETRIES"); do
  hms_code="$(curl_code "/api/hms-smoke" /tmp/echoweather-hms.json)"
  if [[ "$hms_code" == "200" || "$hms_code" == "502" || "$hms_code" == "429" ]]; then
    break
  fi
  if [[ "$hms_code" == "404" ]]; then
    break
  fi
  if (( attempt < SMOKE_RETRIES )); then
    echo "RETRY /api/hms-smoke — HTTP ${hms_code} (attempt ${attempt}/${SMOKE_RETRIES})" >&2
    sleep "$SMOKE_RETRY_SLEEP"
  fi
done
if [[ "$hms_code" == "404" ]]; then
  echo "FAIL /api/hms-smoke — HTTP 404 (add RewriteRule ^hms-smoke\$ hms-smoke.php in api/.htaccess)" >&2
  exit 1
fi
if [[ "$hms_code" == "200" ]]; then
  if ! grep -q '"type":"FeatureCollection"' /tmp/echoweather-hms.json; then
    echo "FAIL /api/hms-smoke — expected GeoJSON FeatureCollection, got: $(head -c 120 /tmp/echoweather-hms.json)" >&2
    exit 1
  fi
  echo "OK   /api/hms-smoke — HTTP 200 GeoJSON FeatureCollection"
elif [[ "$hms_code" == "502" ]]; then
  echo "WARN /api/hms-smoke — HTTP 502 (upstream NESDIS unavailable; route OK)"
elif [[ "$hms_code" == "429" ]]; then
  echo "WARN /api/hms-smoke — HTTP 429 (rate limited; route OK)"
else
  echo "FAIL /api/hms-smoke — HTTP ${hms_code}" >&2
  exit 1
fi

# WPC / NHC map proxies — must not 404 (CORS bypass for browser threat layers).
for path in /api/wpc-ero /api/nhc-storms; do
  code="000"
  for attempt in $(seq 1 "$SMOKE_RETRIES"); do
    code="$(curl_code "$path" /tmp/echoweather-threat.json)"
    if [[ "$code" == "200" || "$code" == "502" || "$code" == "429" ]]; then
      break
    fi
    if [[ "$code" == "404" ]]; then
      break
    fi
    if (( attempt < SMOKE_RETRIES )); then
      echo "RETRY ${path} — HTTP ${code} (attempt ${attempt}/${SMOKE_RETRIES})" >&2
      sleep "$SMOKE_RETRY_SLEEP"
    fi
  done
  if [[ "$code" == "404" ]]; then
    echo "FAIL ${path} — HTTP 404 (missing api/.htaccess rewrite)" >&2
    exit 1
  fi
  if [[ "$code" != "200" && "$code" != "502" && "$code" != "429" ]]; then
    echo "FAIL ${path} — HTTP ${code}" >&2
    exit 1
  fi
  echo "OK   ${path} — HTTP ${code}"
done
