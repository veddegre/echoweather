#!/usr/bin/env bash
# Rasterize og-image.svg → og-image.png (1200×630) for Open Graph / Twitter cards.
# Social crawlers do not support SVG in og:image; keep the SVG as source of truth.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/og-image.svg"
OUT="$ROOT/og-image.png"
TMP="${OUT}.tmp.png"

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

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1200,630 --screenshot="$TMP" "file://$SVG" >/dev/null 2>&1

mv -f "$TMP" "$OUT"
w=$(sips -g pixelWidth "$OUT" 2>/dev/null | awk '/pixelWidth/{print $2}')
h=$(sips -g pixelHeight "$OUT" 2>/dev/null | awk '/pixelHeight/{print $2}')
echo "Wrote $OUT (${w:-?}×${h:-?})"
