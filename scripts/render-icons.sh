#!/usr/bin/env bash
# Rasterize icon.svg → PWA / Apple touch PNGs.
# Headless Chrome must screenshot a sized HTML wrapper — opening the SVG file
# directly mis-centers the 512×512 canvas in small viewports (clipped icons).
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
  local tmp_html="$ROOT/.render-icon-$$-${size}.html"
  local tmp="${out}.tmp.png"
  {
    printf '%s\n' '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
    printf 'html,body{margin:0;width:%spx;height:%spx;overflow:hidden}\n' "$size" "$size"
    printf '%s\n' 'svg{width:100%;height:100%;display:block}' '</style></head><body>'
    sed '/^<?xml/d' "$SVG"
    printf '%s\n' '</body></html>'
  } > "$tmp_html"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size="${size},${size}" --screenshot="$tmp" "file://$tmp_html" >/dev/null 2>&1
  rm -f "$tmp_html"
  mv -f "$tmp" "$out"
  echo "Wrote $out (${size}×${size})"
}

render 192 "$ROOT/icon-192.png"
render 512 "$ROOT/icon-512.png"
render 180 "$ROOT/apple-touch-icon.png"
