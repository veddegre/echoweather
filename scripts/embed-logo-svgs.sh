#!/usr/bin/env bash
# Embed logo-mark.png into icon/logo/og SVG wrappers (external href breaks local preview).
# The raster is re-encoded as WebP q95 (visually lossless, ~12x smaller than the source PNG).
# Run after updating logo-mark.png, then ./scripts/render-icons.sh and ./scripts/render-og-image.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PNG="$ROOT/logo-mark.png"

if [[ ! -f "$PNG" ]]; then
  echo "Missing $PNG — extract from echo-weather-logo-exact.svg first." >&2
  exit 1
fi

python3 - "$ROOT" "$PNG" <<'PY'
import base64, io, sys
from pathlib import Path
from PIL import Image

root = Path(sys.argv[1])
src = Image.open(sys.argv[2]).convert('RGBA')
buf = io.BytesIO()
src.save(buf, 'WEBP', quality=95, method=6)
uri = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
img = f'<image width="1024" height="1024" href="{uri}" xlink:href="{uri}"/>'
ns = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'

(root / 'icon.svg').write_text(f'''<svg {ns} viewBox="0 0 512 512" role="img" aria-label="Echo Weather">
  <defs>
    <linearGradient id="sky" x1="256" y1="64" x2="256" y2="448" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#003875"/>
      <stop offset="100%" stop-color="#001845"/>
    </linearGradient>
    <clipPath id="icon-clip">
      <rect width="512" height="512" rx="112"/>
    </clipPath>
  </defs>
  <g clip-path="url(#icon-clip)">
    <rect width="512" height="512" fill="url(#sky)"/>
    <svg width="512" height="512" viewBox="200 185 680 680" preserveAspectRatio="xMidYMid slice">
      {img}
    </svg>
  </g>
</svg>
''')

(root / 'icon-maskable.svg').write_text(f'''<svg {ns} viewBox="0 0 512 512" role="img" aria-label="Echo Weather">
  <defs>
    <linearGradient id="sky" x1="256" y1="64" x2="256" y2="448" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#003875"/>
      <stop offset="100%" stop-color="#001845"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#sky)"/>
  <svg x="35.84" y="35.84" width="440.32" height="440.32" viewBox="200 185 680 680" preserveAspectRatio="xMidYMid slice">
    {img}
  </svg>
</svg>
''')

(root / 'logo.svg').write_text(f'''<svg {ns} viewBox="200 185 680 680" role="img" aria-label="Echo Weather">
  {img}
</svg>
''')

(root / 'og-image.svg').write_text(f'''<svg {ns} width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Echo Weather">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12151a"/>
      <stop offset="55%" stop-color="#1a1f27"/>
      <stop offset="100%" stop-color="#12151a"/>
    </linearGradient>
    <linearGradient id="iconSky" x1="256" y1="64" x2="256" y2="448" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#003875"/>
      <stop offset="100%" stop-color="#001845"/>
    </linearGradient>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3c91e6"/>
      <stop offset="50%" stop-color="#FFC04A"/>
      <stop offset="100%" stop-color="#5aa8f0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(96 59)">
    <rect width="512" height="512" rx="112" fill="url(#iconSky)"/>
    <svg width="512" height="512" viewBox="200 185 680 680" preserveAspectRatio="xMidYMid slice">
      {img}
    </svg>
  </g>
  <g font-family="Georgia, 'Times New Roman', serif">
    <text x="660" y="248" fill="#ffffff" font-size="108" font-weight="700" letter-spacing="-2">Echo</text>
    <text x="664" y="308" fill="#7ec8ff" font-size="34" font-weight="600" letter-spacing="12">WEATHER</text>
    <text x="664" y="388" fill="#b8c4d4" font-size="36" font-family="'Segoe UI', system-ui, sans-serif" font-weight="500">Forecasts, radar &amp; atmosphere</text>
    <text x="664" y="436" fill="#8a96a8" font-size="28" font-family="'Segoe UI', system-ui, sans-serif">Built for weather enthusiasts</text>
    <text x="664" y="508" fill="#5aa8f0" font-size="30" font-family="'Segoe UI', system-ui, sans-serif" font-weight="600">echoweather.com</text>
  </g>
  <rect x="660" y="538" width="480" height="5" rx="2.5" fill="url(#accentBar)" opacity="0.9"/>
</svg>
''')

print('Wrote icon.svg, icon-maskable.svg, logo.svg, og-image.svg')
PY
