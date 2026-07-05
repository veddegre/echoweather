#!/usr/bin/env bash
# Echo Weather — ensure APP_VERSION (index.html) matches CACHE (sw.js).
#
# Usage:
#   ./scripts/check-versions.sh
#   APP_ROOT=/var/www/echoweather ./scripts/check-versions.sh
set -euo pipefail

ROOT="${APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

if [[ ! -f "$ROOT/index.html" || ! -f "$ROOT/sw.js" ]]; then
  echo "check-versions: missing index.html or sw.js in $ROOT" >&2
  exit 1
fi

APP_VER="$(sed -n "s/.*const APP_VERSION = '\([0-9]*\)'.*/\1/p" "$ROOT/index.html" | head -1)"
CACHE_VER="$(sed -n "s/.*const CACHE = 'echo-weather-v\([0-9]*\)'.*/\1/p" "$ROOT/sw.js" | head -1)"

if [[ -z "$APP_VER" || -z "$CACHE_VER" ]]; then
  echo "check-versions: could not parse APP_VERSION or CACHE in $ROOT" >&2
  exit 1
fi

if [[ "$APP_VER" != "$CACHE_VER" ]]; then
  echo "Version mismatch: index.html APP_VERSION=$APP_VER but sw.js CACHE=echo-weather-v$CACHE_VER" >&2
  echo "Bump both together before deploying (see README — PWA version bump)." >&2
  exit 1
fi

echo "Versions OK: v$APP_VER"
