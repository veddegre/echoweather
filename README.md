# Echo Weather

Personal weather PWA built for enthusiasts — forecasts, radar, storm tracking,
outdoor planning, marine, aviation, and more. No API keys required for core
features; optional server-side proxies add AirNow, Google Pollen, NDBC buoys,
and aviation TAF.

**Home:** [echoweather.com](https://echoweather.com) · **Source:** [github.com/veddegre/echoweather](https://github.com/veddegre/echoweather) · **Contact:** [contact@echoweather.com](mailto:contact@echoweather.com)

**Highlights:** NWS forecasts & alerts · animated radar with threat layers ·
activity planner with NWS advisory awareness · 5-day visual forecast · METAR
observations · SPC convective outlook · UV & air quality · Great Lakes &
coastal · aviation TAF · installable PWA with offline cache

```
  browser ──────────────▶  Apache (or php -S locally)
                              ├─ index.html, sw.js, …        (static PWA)
                              └─ /api/status|airnow|pollen|buoy|taf (PHP proxies)
```

`index.html` is the entire weather app — forecasts, radar, storm tracking, outdoor
conditions, marine, alerts, and more, mostly fetched client-side from public APIs.

`api/*.php` is a thin PHP layer that:

- Proxies **AirNow** (keeps your API key off the browser)
- Proxies **NDBC buoys** (NDBC has no browser CORS)
- Proxies **Google Pollen** (3-day tree/grass/weed forecast in the app; server-side cache)
- Proxies **Aviation TAF** (AviationWeather.gov blocks browser CORS)
- Exposes `/api/status` so the app knows what's configured

## Files

| File / folder | Purpose |
|---|---|
| `index.html` | The weather app |
| `manifest.json` | PWA install manifest |
| `sw.js` | Service worker |
| `logo.svg`, `icon.svg`, `og-image.png` | Branding |
| `api/` | Integration endpoints (`status`, `airnow`, `pollen`, `buoy`, `taf`) |
| `lib/` | Shared PHP helpers (not web-accessible in production) |
| `router.php` | URL router for `php -S` local dev only |
| `update.sh` | **Primary update path** — `git pull` on the server |
| `deploy.sh` | Optional rsync deploy when the server is not a git clone |
| `scripts/update-server.sh` | Server-side update logic (called by `update.sh`) |
| `scripts/fix-permissions.sh` | Repair `.git` / cache ownership after a bad `chown` |
| `scripts/check-versions.sh` | Verify `APP_VERSION` and `sw.js` `CACHE` stay in sync |
| `scripts/render-icons.sh` | Regenerate PWA PNG icons from `icon.svg` |
| `scripts/render-og-image.sh` | Regenerate `og-image.png` for social previews |
| `scripts/smoke.sh` | Post-deploy health checks (`/`, `/api/status`, `/api/taf`) |
| `config.example.php` | Config template — merge new keys into `config.local.php` on the server |
| `config.local.php` | Server secrets (gitignored — lives only on the server) |
| `cache/` | Server-side pollen cache and rate-limit counters (gitignored, auto-created) |

## Requirements

- **Production:** Apache 2.4 + PHP 8.1+ with `curl` (recommended) or `allow_url_fopen`
- **Local dev:** PHP 8.1+ CLI (`php -S`)
- **Production deploy:** `git` on the server (repo cloned into the Apache document root)
- Outbound HTTPS from the server to AirNow, Google Pollen, and NDBC when using integrations

---

## Install (first time)

Production uses a **git clone directly in the web root** (e.g. `/var/www/echoweather`).
`config.local.php` and `cache/` are gitignored and stay on the server across updates.

Deploy examples below use **`example.com`** as a placeholder — substitute your real
hostname everywhere (Apache `ServerName`, Cloudflare Tunnel, `SMOKE_HOST`, and
`cors_origins` in `config.local.php`).

### 1. Install Apache + PHP (Debian / Ubuntu)

```bash
sudo apt update
sudo apt install -y apache2 libapache2-mod-php php php-curl php-json git
sudo a2enmod rewrite headers
sudo systemctl restart apache2
php -v   # should show 8.1+
```

### 2. Clone into the document root

On the server:

```bash
sudo mkdir -p /var/www/echoweather
sudo chown $USER:www-data /var/www/echoweather
git clone https://github.com/veddegre/echoweather.git /var/www/echoweather
cd /var/www/echoweather

cp config.example.php config.local.php
nano config.local.php   # add API keys

mkdir -p cache/pollen cache/ratelimit
./scripts/fix-permissions.sh
```

Your SSH user owns the clone and `.git` (for `git pull`). Apache reads app files via
group/other permissions. Only `cache/` is owned by `www-data`.

**Never run `sudo chown -R www-data:www-data /var/www/echoweather`** — that breaks
`git pull` by making `.git` unreadable to your SSH user.

### 3. Apache vhost

Create `/etc/apache2/sites-available/echoweather.conf`:

```apache
<VirtualHost *:80>
    ServerName example.com
    DocumentRoot /var/www/echoweather
    DirectoryIndex index.html

    <Directory /var/www/echoweather>
        Require all granted
        Options -Indexes
        AllowOverride All
    </Directory>

    <Directory /var/www/echoweather/api>
        AllowOverride All
    </Directory>

    <FilesMatch "^(index\.html|sw\.js)$">
        Header set Cache-Control "no-cache, no-store, must-revalidate"
    </FilesMatch>
</VirtualHost>
```

Root `.htaccess` also sets `X-Frame-Options`, `Referrer-Policy`, and blocks
direct web access to `lib/`, `cache/`, and `router.php`.

```bash
sudo a2dissite 000-default.conf   # disable Apache's default /var/www/html site
sudo a2enmod rewrite headers
sudo a2ensite echoweather.conf
sudo apachectl configtest && sudo systemctl reload apache2
```

Disable the default site so `http://127.0.0.1` is not served from `/var/www/html`.
Smoke tests still send `Host: example.com` when using `127.0.0.1`, but removing
the default site avoids confusion and matches production (only your vhost on port 80).

### 4. Smoke test

On the server (hits `127.0.0.1` with `Host: example.com`):

```bash
cd /var/www/echoweather
# Production: export SMOKE_HOST=echoweather.com  (or add to ~/.bashrc)
./scripts/smoke.sh
```

Or against the public URL from any machine:

```bash
BASE_URL=https://example.com ./scripts/smoke.sh
```

Manual check:

```bash
curl -s -H "Host: example.com" http://127.0.0.1/api/status
```

### Cloudflare Tunnel

Point the public hostname at Apache on port 80:

```yaml
ingress:
  - hostname: example.com
    service: http://localhost:80
  - service: http_status:404
```

Add this to your Cloudflare Tunnel config (e.g. `/etc/cloudflared/config.yml`
or the Zero Trust dashboard).

---

## Updating the app

After pushing to GitHub:

```bash
git push origin main
```

**On the server** (recommended — repo is already there):

```bash
cd /var/www/echoweather
./update.sh --smoke    # run as your SSH user, not sudo
```

**From your laptop** (SSH in and update remotely):

```bash
DEPLOY_HOST=user@your-server ./update.sh --smoke
```

`update.sh` runs `git pull`, ensures `cache/` exists with correct permissions,
reminds you to merge any new keys from `config.example.php`, and optionally
runs smoke tests. It never touches `config.local.php`.

| Variable | Default | Meaning |
|---|---|---|
| `DEPLOY_HOST` | *(unset)* | Set when running `update.sh` from your laptop |
| `APP_DIR` | `/var/www/echoweather` | Git clone / Apache document root |
| `GIT_BRANCH` | `main` | Branch to pull |

Smoke test only (no pull):

```bash
./update.sh --smoke-only
# or: DEPLOY_HOST=user@your-server ./update.sh --smoke-only
```

Server-side smoke tests use `http://127.0.0.1` with `Host: example.com` (override
with `SMOKE_HOST` if your vhost uses a different `ServerName`).

After updates with new config keys, merge additions from `config.example.php`
into `config.local.php` by hand.

### PWA version bump

When you change `index.html` or `sw.js`, bump **both**:

- `APP_VERSION` in `index.html`
- `CACHE` name in `sw.js` (e.g. `echo-weather-v128` → `echo-weather-v129`)

Verify before deploy:

```bash
./scripts/check-versions.sh
```

`update.sh`, `deploy.sh`, and `smoke.sh` run this automatically. Deploy `index.html` and `sw.js` together. Users can hard-refresh or use the in-app **Update app** link. After icon or manifest changes, iOS home-screen shortcuts may need to be removed and re-added to pick up the new icon.

---

## Alternative: rsync deploy (`deploy.sh`)

Use this only if the server is **not** a git clone — e.g. a staging directory
and manual file copy workflow.

```bash
DEPLOY_HOST=user@your-server ./deploy.sh --smoke
```

`deploy.sh` rsyncs from your laptop to `~/echoweather-deploy/` on the server,
then copies into `/var/www/echoweather/`. It never syncs `config.local.php`
or `cache/`.

| Variable | Default | Meaning |
|---|---|---|
| `DEPLOY_HOST` | *(required)* | SSH target |
| `REMOTE_STAGING` | `~/echoweather-deploy` | Staging directory on the server |
| `REMOTE_WWW` | `/var/www/echoweather` | Apache document root |

If you start with `deploy.sh` and later switch to git, clone into `REMOTE_WWW`
and use `update.sh` going forward.

---

## Local development

```bash
git clone https://github.com/veddegre/echoweather.git
cd echoweather
cp config.example.php config.local.php
# Edit config.local.php — add airnow_api_key and/or google_pollen_api_key
mkdir -p cache/pollen cache/ratelimit
php -S 127.0.0.1:8080 router.php
```

Open **http://127.0.0.1:8080**

`router.php` maps `/api/*` the same way Apache + `.htaccess` do in production.
It is blocked from direct web access in production.

---

## Configuration reference

`config.example.php` is the source of truth for available keys and defaults.
On the server: `cp config.example.php config.local.php` (first time) or merge
new keys into the existing file. **`config.local.php` is gitignored and never
comes from git pull.**

Every key is optional.

| Key | Default | Meaning |
|---|---|---|
| `airnow_api_key` | `""` | EPA AirNow API key. Enables `/api/airnow` for US monitor observations. |
| `google_pollen_api_key` | `""` | Google Maps Pollen API key. Enables `/api/pollen`. Falls back to env `GOOGLE_POLLEN_API_KEY` when empty. |
| `pollen_cache_ttl` | `10800` | Seconds to cache pollen per grid cell (3h). Min 300, max 86400. |
| `pollen_cache_grid` | `1` | Decimal places for lat/lon rounding: `0` ≈ 70 mi, `1` ≈ 10 mi, `2` ≈ 1 mi. |
| `pollen_daily_limit` | `7500` | Max Google Pollen API calls per day. `0` = unlimited. Serves stale cache when hit. |
| `rate_limit_airnow` | `120` | Max `/api/airnow` requests per IP per hour. `0` = disabled. |
| `rate_limit_pollen` | `60` | Max `/api/pollen` requests per IP per hour. `0` = disabled. |
| `rate_limit_buoy` | `120` | Max `/api/buoy` requests per IP per hour. `0` = disabled. |
| `rate_limit_taf` | `120` | Max `/api/taf` requests per IP per hour. `0` = disabled. |
| `cors_origins` | see example | Browser origins allowed to call `/api/*`. Include your dev URL for `php -S`. |

### API keys

#### AirNow (optional)

- Free key: [docs.airnow.gov](https://docs.airnow.gov/)
- Enables real EPA monitor observations for US locations
- Proxied at `/api/airnow`

#### Google Pollen API (optional)

- [Pollen API overview](https://developers.google.com/maps/documentation/pollen/overview)
- Enables 5-day **tree / grass / weed** pollen from Google (app displays 3 days)
- Proxied at `/api/pollen`
- Enable in [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Library → "Pollen API"

Key placement — either in `config.local.php` or via environment variable:

```php
'google_pollen_api_key' => 'AIza...',
// or: export GOOGLE_POLLEN_API_KEY='AIza...'
```

### Pollen caching

Responses are cached on disk under `cache/pollen/`:

| Setting | Default | Effect |
|---|---|---|
| `pollen_cache_grid` | `1` | Round lat/lon to 1 decimal → **~10 mi grid cells** |
| `pollen_cache_ttl` | `10800` | Cache lifetime in seconds (**3 hours**) |
| `pollen_daily_limit` | `7500` | Max Google API calls per calendar day |

The `cache/` directory must be writable by the web server:

```bash
sudo mkdir -p /var/www/echoweather/cache/pollen /var/www/echoweather/cache/ratelimit
sudo chown -R www-data:www-data /var/www/echoweather/cache
```

### Security note

`/api/*` endpoints are **public** — anyone who can reach your server can call
them with `curl`, not just browsers on allowed CORS origins. Billable keys stay
server-side, but abuse can burn AirNow or Google quota. Defaults include
per-IP rate limits and `pollen_daily_limit`; tune both for public traffic.

### API endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/status` | none | Reports which integrations are configured (`airnow`, `pollen`, `buoy`, `taf`) |
| `GET /api/airnow?latitude=&longitude=&distance=` | none | AirNow lat/long proxy (distance 1–100 mi, default 50) |
| `GET /api/pollen?latitude=&longitude=&days=` | none | Google Pollen forecast (days 1–5, default 3; server-cached) |
| `GET /api/buoy/{id}` | none | NDBC buoy text proxy |
| `GET /api/taf?ids=KGRR` | none | AviationWeather.gov TAF JSON proxy (no browser CORS) |

Validation errors return `400` with a short message. Misconfiguration returns
`503`. Upstream failures return `502`. Rate limits return `429`. Internal
details are logged server-side only.

---

## Troubleshooting

**`/api/status` returns 404.** Enable `mod_rewrite`, set `AllowOverride All` on
`/var/www/echoweather/api`, confirm `api/.htaccess` is deployed. When testing on
the server with curl, include the vhost:
`curl -H "Host: example.com" http://127.0.0.1/api/status`.

**Smoke tests fail on the server.** Apache's default site (`000-default`) may be
answering `127.0.0.1` instead of Echo Weather. Disable it:
`sudo a2dissite 000-default.conf && sudo systemctl reload apache2`. Smoke tests
also send `Host: example.com` automatically — verify your vhost `ServerName`
matches (`SMOKE_HOST` env var overrides the default).

**`git pull` fails (local changes would be overwritten).** The server should not
edit tracked files — only `config.local.php` and `cache/` are server-local
(gitignored). Reset and update:

```bash
cd /var/www/echoweather
git fetch origin
git reset --hard origin/main
./scripts/fix-permissions.sh
```

Or pull the latest `update-server.sh` and run `./update.sh --smoke` (it discards
stray tracked-file edits automatically). **Do not use `sudo ./update.sh`.**

**`git pull` fails (dubious ownership / `.git/FETCH_HEAD` permission denied).**
Usually caused by `chown -R www-data:www-data` on the whole repo. **Do not use
`sudo git pull`** — fix ownership instead:

```bash
cd /var/www/echoweather
./scripts/fix-permissions.sh
git pull --ff-only
```

If the script is missing, `git pull` the latest repo first — `scripts/fix-permissions.sh` is included.

**`git pull` fails with permission errors (general).** The clone should be owned by your
SSH user, not `www-data`. Only `cache/` and `config.local.php` need special
ownership — see the install steps above.

**Air Quality hint still shows.** Set `airnow_api_key` in `config.local.php`.
Verify `curl -H "Host: example.com" http://127.0.0.1/api/status` shows `"airnow":true`.

**Pollen shows modeled data or off-season message.** Without `google_pollen_api_key`, the app uses Open-Meteo modeled pollen or an off-season placeholder — that is expected. For live Google pollen, set `google_pollen_api_key` in `config.local.php`, enable Pollen API in Google Cloud Console, and verify `curl -H "Host: example.com" http://127.0.0.1/api/status` shows `"pollen":true`.

**Pollen panel completely empty.** Check browser console for JS errors; confirm location is set. If Google is configured but quota is exhausted, the app may show a paused notice or fall back to modeled data.

**503 on `/api/pollen`.** Key not set — configure `google_pollen_api_key`.

**502 on `/api/pollen` after heavy use.** Daily limit (`pollen_daily_limit`) may
be reached with no stale cache for that grid cell. Check Apache error log and
`cache/pollen/_quota.json`.

**429 on `/api/*`.** Per-IP rate limit hit. Raise `rate_limit_*` in
`config.local.php` or wait until the next hour.

**Buoy panel unavailable.** Confirm
`curl -H "Host: example.com" http://127.0.0.1/api/buoy/45029` returns JSON.

**TAF shows “unavailable” in the browser.** The app fetches TAF via `/api/taf` (not AviationWeather.gov directly). Confirm `api/.htaccess` includes the `taf` rewrite rule and smoke passes:
`curl -H "Host: example.com" "http://127.0.0.1/api/taf?ids=KGRR"`.
Stations without a TAF return an empty array (`[]`), not 502. The client tries up to three nearby airports per request.

**502 on `/api/taf`.** Usually an upstream AviationWeather.gov issue or an outdated fire/TAF GeoJSON URL — check Apache error log. Empty TAF (HTTP 204 upstream) should return `200` with `[]`.

**Fire weather layer 404 in console.** SPC fire outlook GeoJSON must use `day1fw_windrh.lyr.geojson` (older `fwdy1otlk_*` URLs are dead). Pull latest `index.html` if you still see 404s.

**Activity or impact hours look wrong during an advisory.** Lifestyle cards score
good/fair/poor for outdoor activities; impact cards score low/moderate/high for
heat, wind, smoke, storms, cold, and UV. NWS advisories are applied from
`effective` through `ends`.

**Great Lakes panel missing inland.** The panel appears only within **~50 nm** of
a Great Lakes shore — inland cities (e.g. Mount Pleasant, MI) no longer show lake
weather by bounding-box alone.

**500 / 502 with generic message.** Check Apache error log for details:
`sudo tail -f /var/log/apache2/error.log`

---

## What the app includes

Echo Weather is a single-page PWA (`index.html`). On phones and narrow screens
(≤860px), content is organized into five bottom tabs; on wider screens the same
panels appear in one scrollable page with a compacting sticky header.

### Navigation & layout

| Tab | Panels |
|---|---|
| **Now** | Current conditions, storm setup *(when relevant)*, Sun & Light, next 24 hours |
| **Forecast** | 5-day visual forecast, detailed NWS text, observations vs forecast |
| **Radar** | Animated radar (RainViewer / MRMS / IEM), threat layers, storm & fire banners, convective outlook |
| **Impacts** | Activity planner, impact hours, air quality & pollen, UV & exposure, aurora *(when active)*, water/coast/rivers |
| **More** | Moon, advanced atmosphere (HRRR), aviation TAF, NWS forecast discussion |

- **Deep links** — `#now`, `#forecast`, `#radar`, `#outdoor`, `#more`; radar state
  `#radar?mode=iem-n0q&frame=8`; legacy `#air` → Impacts tab.
- **Locations** — Geolocation, Open-Meteo search, multiple saved chips, shareable
  URLs (`?lat=42.97&lon=-85.92&name=Allendale`).
- **Themes & units** — Light / Dark / System; °F / °C.
- **Mobile chrome** — Sticky location/search bar; bottom tab bar; single-column
  sparklines on narrow screens.

### Now

- **Current conditions** — METAR when available (US), otherwise Open-Meteo;
  feels-like, short today outlook, pressure trend (rising/falling/steady).
- **Glance row** — Wind (with compass), humidity, dew point, visibility, air
  quality teaser, and related quick metrics.
- **More detail** — Pressure, wind gusts, cloud cover, and other surface fields.
- **Storm setup** *(conditional)* — Appears when convection is possible: HRRR
  CAPE category, freezing level, wind shear, moisture, environment indices, and
  SPC Day 1 probabilistic tornado/hail/wind when relevant.
- **Sun & Light** — Sun arc with now marker; 24-hour daylight bar (civil/nautical/
  astronomical bands); sky compass; golden & blue hour times; twilight grid;
  darkness estimate; tonight's sunset outlook (cloud/visibility verdict).
- **Next 24 Hours** — Scrollable hourly strip anchored at *now* (NWS periods
  overlaid on Open-Meteo timing); correct day/night icons; wind compass per hour;
  source labels. Four mini sparklines (pressure, temperature, dew point, CAPE)
  with **Now → Later** axes; pressure/temp/dew auto-scale with minimum span so
  flat lines stay readable; **CAPE uses a fixed 0–2500 J/kg scale** with dashed
  reference lines at 300 / 1000 / 2500 and stability category badge.

### Forecast

- **5-Day Forecast** — Day cards with condition text, high/low and time-of-extrema,
  rain/wind meta, and an **hour-by-hour sky-condition strip** (clear, partly
  cloudy, cloudy, fog, rain, snow, storm) with a color legend and readable
  light/dark/mobile palettes; temperature sparkline with hourly ticks; **now**
  marker on Today (distinct from storm red).
- **Winter weather outlook** *(conditional)* — Snowfall, ice/freezing-rain
  signals, wind chill, and lake-effect wording when the forecast supports it.
- **NWS precip probability strip** *(conditional)* — Compact hourly POP from the
  NWS grid when today/tomorrow has meaningful rain or storm chances (full panel
  in More).
- **Detailed Forecast** — NWS zone periods (US): days 1–3 inline, days 4–7 in
  expandable blocks.
- **Observations vs NWS Forecast** — Latest station reading compared to the NWS
  hourly forecast for temperature, dew point, wind, and pressure; plain-language
  bias badges (higher/lower/close). **Station history (7 days)** sparklines
  (temperature, wind, pressure) with 24 h / 7 d trend summary.
- **AFD synoptic teaser** — Short excerpt from the NWS forecast discussion with
  link to the full discussion on the More tab.

### Radar & storm tracking

- **Radar sources** — RainViewer (animated + optional GOES IR satellite),
  **MRMS** composite (live CONUS), IEM NEXRAD base/composite (50‑min animation),
  or **nearest-site velocity** (live US).
- **Reflectivity ↔ velocity toggle** — Quick switch between IEM base
  reflectivity and nearest NEXRAD velocity.
- **Animation** — Scrubber, play/pause, storm-window marker on the timeline,
  fullscreen expand, center on location.
- **Lightning** — Optional live strike overlay (Blitzortung; connects only while
  the toggle is on).
- **Map threat layers** — Toggle warnings/watches/advisories (including alert
  polygons on the map), SPC Day 1 categorical and probabilistic tornado/hail/
  wind, **storm reports** (SPC CSV markers), **WPC excessive rainfall**, **SPC
  fire weather**, and NHC tropical systems.
- **Storm mode banner** — Active warnings/watches, elevated SPC risk, overhead
  mesoscale discussions, severe window, and CAPE-driven threat narrative.
  Quick actions: **Open radar**, **Severe window on timeline** (scrubs animated
  radar to the best storm window), **Nearest SPC report**, **Warning polygon**, and
  **Watch polygon** (centers radar on alert geometry; enables the matching layer).
  Storm mode auto-enables **storm reports**, **SPC Day 1 categorical**, and **warnings** or
  **watches** layers (watch-only when inside a watch with no warning) when they were off.
- **Chase-mode radar** — When storm mode is active, MRMS users see a **Site
  radar** button to switch to animated NEXRAD; reflectivity/velocity toggle
  promoted on IEM modes.
- **Fire weather banner** — Red Flag warnings, dry/windy conditions, or SPC fire
  outlook at your location.
- **Convective outlook panel** — SPC Day 1–3 categorical risk; Day 1 tornado/
  hail/wind probabilities; best storm window; nearby SPC reports; lake-effect
  hints; mesoscale discussions with expandable discussion text; flood signal
  when NWS text mentions heavy rain.

### Impacts

- **Activity planner** — Best times in the next 24 hours for **golf, hiking, yard
  work, running, beach/pool, cycling, dog walks, stargazing**, and *(when the
  local forecast is cold or snowy)* **skiing/sledding** and **snow shoveling**.
  Per-hour **green / amber / red** bars (good / fair / poor); gray = after dark
  or outside usual hours. Pin up to four favorites. NWS advisories factor into
  scoring from issuance through hazard end.
- **Impact hours** — Hourly weather stress for **heat, wind, smoke & air,
  lightning & storms, cold exposure, and UV**. Green = low impact, amber =
  moderate, red = high; gray = not applicable (e.g. UV at night). Pin up to four
  hazards to watch. Expandable **Why** on each card.
- **Air Quality & Pollen** — AirNow (via PHP proxy) or Open-Meteo modeled AQI;
  pollutant breakdown; smoke/haze row when PM2.5 is high; **year-round** 3-day
  pollen forecast (Google via proxy when configured, otherwise modeled/off-season
  messaging).
- **UV & Exposure** — Current UV index and category; humidity, dew point,
  visibility, wet bulb; **outdoor rest-of-today** hourly strip (UV, RH, comfort
  notes).
- **Aurora** *(latitude ≥ 40°N, when active)* — NOAA planetary Kp ≥ 4 and
  relatively clear skies tonight; OVATION probability strip when available.
  Sky section hides when inactive; SWPC API failures show clear unavailable copy.
- **Coastal tides** *(coastal US)* — NOAA CO-OPS tide predictions for the
  nearest station; next high/low outlook.
- **Great Lakes** *(within ~50 nm of shore)* — NWS GLF or marine zone text,
  Open-Meteo wave model, lake–air temperature delta outlook, **NDBC buoy picker**
  with live observations (proxied via `/api/buoy`).
- **On the water** *(Great Lakes or coastal)* — Unified small-craft verdict with
  source attribution; wind from buoy or lake point when inland pin is far from shore.
- **River gauges** *(US)* — USGS streamgages within ~30 mi with stage and flow;
  clear unavailable messaging when none are nearby or the API is down.

### More

- **Moon** — Phase, illumination, rise/set, compass.
- **Advanced Atmosphere** — HRRR fields: wet bulb, boundary layer height,
  sunshine vs daylight, snow depth, soil temperature/moisture, winds at 80 / 120 /
  180 m.
- **Aviation TAF** — Nearest airport(s) with a TAF (up to three ICAO codes per
  request); **decoded** periods (wind, visibility, weather, clouds) plus
  collapsible raw aviation code. Proxied at `/api/taf` (AviationWeather.gov
  blocks browser CORS).
- **NWS Forecast Discussion** — Full AFD text for your forecast office.

### Alerts & global UX

- **NWS alerts** — Warnings, watches, and advisories in a top banner with
  effective window times (`onset`–`ends`); expandable description and precautionary
  actions; alert polygons on the radar map when the Radar tab is open.
- **Offline cache** — Last good weather snapshot in `localStorage`; tab dots and
  panel status labels show **cached** when serving stored data. Fetch and render
  errors are handled separately so a render bug does not falsely trigger offline
  mode.
- **PWA** — Installable; service worker caches shell assets; in-app **Update app**
  link when a new service worker is waiting; footer shows app version (e.g. `v166`).
- **Auto-refresh** — Full data reload every 15 minutes; lazy-loads tab panels on
  first visit or idle prefetch.
- **Contact** — [contact@echoweather.com](mailto:contact@echoweather.com) in the
  footer.

---

## Data sources

NWS (forecasts, alerts, AFD, GLF marine), METAR, SPC (outlooks, fire weather, mesoscale discussions, storm reports CSV), WPC (excessive rainfall ArcGIS), NOAA MRMS (WMS), AviationWeather.gov (TAF via `/api/taf` proxy), NOAA SWPC (Kp), NOAA CO-OPS (tides), Open-Meteo / HRRR, RainViewer, IEM (NEXRAD tiles, GOES IR), Blitzortung (live lightning), AirNow (optional, via PHP proxy), Google Pollen API (optional, via PHP proxy), NDBC buoys (via PHP proxy), Open-Meteo geocoding, CARTO basemap.
