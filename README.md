# Echo Weather

Personal weather PWA with a small PHP integration layer for server-side
secrets and CORS relief. No API keys required for core features.

**Home:** [echoweather.com](https://echoweather.com) · **Source:** [github.com/your-user/echoweather](https://github.com/your-user/echoweather)

```
  browser ──────────────▶  Apache (or php -S locally)
                              ├─ index.html, sw.js, …        (static PWA)
                              └─ /api/status|airnow|pollen|buoy (PHP proxies)
```

`index.html` is the entire weather app — forecasts, radar, marine, alerts,
and more, mostly fetched client-side from public APIs.

`api/*.php` is a thin PHP layer that:

- Proxies **AirNow** (keeps your API key off the browser)
- Proxies **NDBC buoys** (NDBC has no browser CORS)
- Proxies **Google Pollen** (5-day tree/grass/weed forecast; server-side cache)
- Exposes `/api/status` so the app knows what's configured

## Files

| File / folder | Purpose |
|---|---|
| `index.html` | The weather app |
| `manifest.json` | PWA install manifest |
| `sw.js` | Service worker |
| `config.js` | Optional client overrides via `window.ECHO_WEATHER` (no secrets; see `config.example.js`) |
| `logo.svg`, `icon.svg`, `og-image.png` | Branding |
| `api/` | Integration endpoints (`status`, `airnow`, `pollen`, `buoy`) |
| `lib/` | Shared PHP helpers (not web-accessible in production) |
| `router.php` | URL router for `php -S` local dev only |
| `update.sh` | **Primary update path** — `git pull` on the server |
| `deploy.sh` | Optional rsync deploy when the server is not a git clone |
| `scripts/update-server.sh` | Server-side update logic (called by `update.sh`) |
| `scripts/fix-permissions.sh` | Repair `.git` / cache ownership after a bad `chown` |
| `scripts/smoke.sh` | Post-deploy health checks |
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
`cors_origins` in `config.local.php`). Clone URLs use **`your-user`** — substitute
your GitHub username or org.

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
git clone https://github.com/your-user/echoweather.git /var/www/echoweather
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
./update.sh --smoke
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
- `CACHE` name in `sw.js` (e.g. `echo-weather-v34` → `echo-weather-v35`)

Deploy them together. Users can hard-refresh or use the in-app **Update app** link.

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
git clone https://github.com/your-user/echoweather.git
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
| `cors_origins` | see example | Browser origins allowed to call `/api/*`. Include your dev URL for `php -S`. |

### API keys

#### AirNow (optional)

- Free key: [docs.airnow.gov](https://docs.airnow.gov/)
- Enables real EPA monitor observations for US locations
- Proxied at `/api/airnow`

#### Google Pollen API (optional)

- [Pollen API overview](https://developers.google.com/maps/documentation/pollen/overview)
- Enables 5-day **tree / grass / weed** pollen forecast
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
| `GET /api/status` | none | Reports which integrations are configured (`airnow`, `pollen`, `buoy`) |
| `GET /api/airnow?latitude=&longitude=&distance=` | none | AirNow lat/long proxy (distance 1–100 mi, default 50) |
| `GET /api/pollen?latitude=&longitude=&days=` | none | Google Pollen forecast (days 1–5, default 3; server-cached) |
| `GET /api/buoy/{id}` | none | NDBC buoy text proxy |

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

**`git pull` fails (dubious ownership / `.git/FETCH_HEAD` permission denied).**
Usually caused by `chown -R www-data:www-data` on the whole repo. **Do not use
`sudo git pull`** — fix ownership instead:

```bash
cd /var/www/echoweather
./scripts/fix-permissions.sh
git pull --ff-only
```

If `fix-permissions.sh` is not on the server yet, run manually:

```bash
sudo chown -R "$USER:$USER" /var/www/echoweather/.git
sudo chown -R "$USER:www-data" /var/www/echoweather
sudo chown -R "$USER:$USER" /var/www/echoweather/.git
sudo chown -R www-data:www-data /var/www/echoweather/cache
sudo chown root:www-data /var/www/echoweather/config.local.php
sudo chmod 640 /var/www/echoweather/config.local.php
sudo -u "$USER" -H git config --global --add safe.directory /var/www/echoweather
```

**`git pull` fails with permission errors (general).** The clone should be owned by your
SSH user, not `www-data`. Only `cache/` and `config.local.php` need special
ownership — see the install steps above.

**Air Quality hint still shows.** Set `airnow_api_key` in `config.local.php`.
Verify `curl -H "Host: example.com" http://127.0.0.1/api/status` shows `"airnow":true`.

**Pollen panel empty.** Set `google_pollen_api_key` in `config.local.php`.
Enable Pollen API in Google Cloud Console. Verify
`curl -H "Host: example.com" http://127.0.0.1/api/status` shows `"pollen":true`.

**503 on `/api/pollen`.** Key not set — configure `google_pollen_api_key`.

**502 on `/api/pollen` after heavy use.** Daily limit (`pollen_daily_limit`) may
be reached with no stale cache for that grid cell. Check Apache error log and
`cache/pollen/_quota.json`.

**429 on `/api/*`.** Per-IP rate limit hit. Raise `rate_limit_*` in
`config.local.php` or wait until the next hour.

**Buoy panel unavailable.** Confirm
`curl -H "Host: example.com" http://127.0.0.1/api/buoy/45029` returns JSON.

**500 / 502 with generic message.** Check Apache error log for details:
`sudo tail -f /var/log/apache2/error.log`

---

## Migrating from the old Python daemon

If you previously ran `echo_weather_server.py` under systemd on port 8093,
remove it before deploying PHP:

```bash
sudo systemctl stop echo-weather-server 2>/dev/null || true
sudo systemctl disable echo-weather-server 2>/dev/null || true
sudo rm -f /etc/systemd/system/echo-weather-server.service
sudo systemctl daemon-reload
```

Remove any Apache `ProxyPass` rules to `:8093` from your vhost — PHP serves
`/api/*` in-process.

---

## What the app includes

| Section | What it shows |
|---|---|
| **Now** | Current conditions, glance metrics, CAPE, clouds, UV |
| **Sun & Light** | Sun arc, golden/blue hour bar, compass, sunset outlook |
| **Hourly / 7-Day** | 48-hour strip; 7-day bars |
| **Detailed Forecast** | NWS zone text (US) |
| **Radar** | RainViewer + IEM NEXRAD |
| **Obs / Discussion** | METAR vs NWS; AFD text |
| **Air / Moon** | AirNow or modeled AQI; Google Pollen forecast; moon phase |
| **Advanced** | HRRR metrics |
| **Great Lakes** | GLF text, waves, buoy — basin only |
| **Convective outlook** | SPC Day 1–3 |

Active NWS warnings appear in the top banner. Location via geolocation or search;
default fallback Grand Haven, MI. Light / Dark / System themes. Installable PWA.

Shareable URLs: `?lat=43.06&lon=-86.23&name=Grand+Haven`

---

## Data sources

NWS, METAR, SPC, Open-Meteo/HRRR, RainViewer, IEM, AirNow (optional),
Google Pollen API (optional), NDBC buoys (via PHP proxy), Open-Meteo geocoding,
CARTO basemap.
