#!/usr/bin/env bash
# Rasterize icon.svg → PWA / Apple touch PNGs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/icon.svg"

CHROME="${CHROME:-}"
if [[ -z "$CHROME" ]]; then
  for c in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    google-chrome chromium; do
    if command -v "$c" &>/dev/null || [[ -x "$c" ]]; then
      CHROME="$c"
      break
    fi
  done
fi

if [[ -z "$CHROME" ]]; then
  echo "Chrome/Chromium not found. Set CHROME= to a headless-capable binary." >&2
  exit 1
fi

render(){
  local size="$1" out="$2"
  local tmp="${out}.tmp.png"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size="${size},${size}" --screenshot="$tmp" "file://$SVG" >/dev/null 2>&1
  mv -f "$tmp" "$out"
  echo "Wrote $out (${size}×${size})"
}

render 192 "$ROOT/icon-192.png"
render 512 "$ROOT/icon-512.png"
render 180 "$ROOT/apple-touch-icon.png"
