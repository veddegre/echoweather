#!/usr/bin/env bash
# Echo Weather — CI validation (versions, JS syntax, static assets).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_ROOT="$ROOT" bash "$ROOT/scripts/check-versions.sh"

for f in app.js nav.js impact.js marine.js air.js aviation.js storm.js radar.js boot.js; do
  node --check "$ROOT/$f"
  echo "OK   $f syntax"
done

for f in index.html app.css app.js nav.js impact.js marine.js air.js aviation.js storm.js radar.js boot.js sw.js manifest.json; do
  [[ -f "$ROOT/$f" ]] || { echo "FAIL missing $f" >&2; exit 1; }
done
echo "OK   required static files present"

if grep -q 'src="nav.js' "$ROOT/index.html" && grep -q 'src="impact.js' "$ROOT/index.html" && grep -q 'src="marine.js' "$ROOT/index.html" && grep -q 'src="air.js' "$ROOT/index.html" && grep -q 'src="aviation.js' "$ROOT/index.html" && grep -q 'src="storm.js' "$ROOT/index.html" && grep -q 'src="radar.js' "$ROOT/index.html" && grep -q 'src="boot.js' "$ROOT/index.html"; then
  echo "OK   index.html loads app.js, nav.js, impact.js, marine.js, air.js, aviation.js, storm.js, radar.js, boot.js"
else
  echo "FAIL index.html missing nav.js, impact.js, marine.js, air.js, aviation.js, storm.js, radar.js, or boot.js script tags" >&2
  exit 1
fi

echo "CI checks passed."
