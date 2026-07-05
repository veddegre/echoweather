# Echo Weather

Personal weather PWA with a small PHP integration layer for server-side
secrets and CORS relief. No API keys required for core features.

Home: **echoweather.com**

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
| `logo.svg`, `icon.svg`, `og-image.png` | Branding |
| `api/` | Integration endpoints (`status`, `airnow`, `pollen`, `buoy`) |
| `lib/` | Shared PHP helpers |
| `router.php` | URL router for `php -S` local dev |
| `config.example.php` | Config template — sync this; copy to `config.local.php` on the server |
| `config.local.php` | Server secrets (gitignored — **never rsync from laptop**) |
| `cache/pollen/` | Pollen API response cache (gitignored, auto-created) |
| `config.example.js` | Optional client overrides (no secrets) |

## Requirements

- **Production:** Apache 2.4 + PHP 8.1+ with `curl` (recommended) or `allow_url_fopen`
- **Local dev:** PHP 8.1+ CLI (`php -S`)
- Outbound HTTPS from the server to AirNow, Google Pollen, and NDBC when using integrations

---

## Fresh start — remove the old Python daemon

If you previously ran `echo_weather_server.py` or `echo_weather_alerts.py` under
systemd, remove it before deploying PHP.

**On the server (as root or with sudo):**

```bash
# Stop and disable the old service (name may be echo-weather-server or echo-weather-alerts)
sudo systemctl stop echo-weather-server 2>/dev/null || true
sudo systemctl stop echo-weather-alerts 2>/dev/null || true
sudo systemctl disable echo-weather-server 2>/dev/null || true
sudo systemctl disable echo-weather-alerts 2>/dev/null || true

# Remove unit files
sudo rm -f /etc/systemd/system/echo-weather-server.service
sudo rm -f /etc/systemd/system/echo-weather-alerts.service
sudo systemctl daemon-reload

# Remove old Python install (optional — keeps /opt clean)
sudo rm -rf /opt/echoweather

# Remove Apache proxy rules to :8093 from your vhost if present, e.g.:
#   ProxyPass /api/status http://127.0.0.1:8093/...
#   ProxyPass /api/airnow ...
#   ProxyPass /api/buoy/ ...
# PHP handles /api/* directly — no reverse proxy needed.
```

After editing the vhost, reload Apache:

```bash
sudo apachectl configtest && sudo systemctl reload apache2
```

---

## Install PHP on the server

### Debian / Ubuntu

```bash
sudo apt update
sudo apt install -y apache2 libapache2-mod-php php php-curl php-json
sudo a2enmod rewrite headers
sudo systemctl restart apache2
php -v   # should show 8.1+
```

`php-curl` is recommended for reliable outbound HTTPS. Without it, PHP falls
back to `file_get_contents` (requires `allow_url_fopen = On` in `php.ini`).

### Verify

```bash
echo '<?php phpinfo();' | sudo tee /var/www/html/info.php
curl -s http://127.0.0.1/info.php | head
sudo rm /var/www/html/info.php
```

---

## Deploy from scratch

**Important:** Never rsync `config.local.php` from your laptop to the server.
The server has its own copy with production keys. Only sync `config.example.php`
as a reference template — then edit `config.local.php` directly on the server.

### 1. Copy files to the server

From your dev machine (recommended):

```bash
./deploy.sh --smoke
```

Or manually:

```bash
cd /Users/veddegre/skytrace
rsync -avz \
  index.html manifest.json sw.js logo.svg icon.svg og-image.png \
  api lib router.php .htaccess config.example.php \
  veddegre@192.168.30.10:~/echoweather-deploy/
```

Do **not** include `config.local.php` in rsync.

On the server:

```bash
sudo mkdir -p /var/www/echoweather/cache/pollen
sudo rsync -a ~/echoweather-deploy/ /var/www/echoweather/

# First-time only — create config from template:
sudo cp /var/www/echoweather/config.example.php /var/www/echoweather/config.local.php

sudo chown -R www-data:www-data /var/www/echoweather
sudo chmod 640 /var/www/echoweather/config.local.php
```

If `config.local.php` already exists on the server, **do not overwrite it**.
Instead, compare against the updated `config.example.php` and add any new keys
by hand (see below).

### 2. Configure secrets (on the server only)

```bash
sudo nano /var/www/echoweather/config.local.php
```

Full example — adjust keys and limits to taste:

```php
<?php
return [
    'airnow_api_key' => 'YOUR_AIRNOW_KEY',
    'google_pollen_api_key' => 'YOUR_GOOGLE_MAPS_API_KEY',
    'pollen_cache_ttl' => 10800,
    'pollen_cache_grid' => 1,
    'pollen_daily_limit' => 7500,
    'cors_origins' => [
        'https://echoweather.com',
    ],
];
```

#### Merging new settings into an existing server config

If your server's `config.local.php` predates pollen support, add the missing
keys without touching your existing API keys:

```php
    'google_pollen_api_key' => 'YOUR_GOOGLE_MAPS_API_KEY',
    'pollen_cache_ttl' => 10800,
    'pollen_cache_grid' => 1,
    'pollen_daily_limit' => 7500,
```

See `config.example.php` in the repo for comments on each key.

#### AirNow (optional)

- Free key: [docs.airnow.gov](https://docs.airnow.gov/)
- Enables real EPA monitor observations for US locations (replaces modeled AQI when a monitor is within ~50 mi)
- Proxied at `/api/airnow`

#### Google Pollen API (optional)

- [Pollen API overview](https://developers.google.com/maps/documentation/pollen/overview) — part of Google Maps Platform (billing required)
- Enables 5-day **tree / grass / weed** pollen forecast for the US and 65+ other countries
- Species vary by region (e.g. oak, birch, ragweed, grasses for Michigan)
- Use the same Cloud project and API key as other Maps services (e.g. digital signage)
- Proxied at `/api/pollen`

**Key placement** — either set `google_pollen_api_key` in `config.local.php`, or export the environment variable on the server:

```bash
# Option A: in config.local.php (recommended)
'google_pollen_api_key' => 'AIza...',

# Option B: environment variable (used when config key is empty)
export GOOGLE_POLLEN_API_KEY='AIza...'
```

Enable the Pollen API in [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Library → search "Pollen API".

#### Pollen caching

To limit API cost, pollen responses are cached on disk under `cache/pollen/`:

| Setting | Default | Effect |
|---|---|---|
| `pollen_cache_grid` | `1` | Round lat/lon to 1 decimal → **~10 mi grid cells**. Nearby towns share one cache entry |
| `pollen_cache_ttl` | `10800` | Cache lifetime in seconds (**3 hours**). One Google request per cell per TTL |
| `pollen_daily_limit` | `7500` | Max Google API calls per calendar day. `0` = unlimited. Serves stale cache when hit |

Tune for your traffic:

- **Personal site / low traffic:** defaults are fine
- **Fewer API calls:** raise `pollen_cache_ttl` to `21600` (6h) or `pollen_cache_grid` to `0` (~70 mi cells)
- **Finer resolution:** set `pollen_cache_grid` to `2` (~1 mi) — more cache files and more Google requests
- **Daily cap:** `pollen_daily_limit` defaults to `7500` (headroom under Google's 10,000/day free tier). Set `5000` for more margin, or `0` to disable the cap. Counter resets at midnight server time; tracked in `cache/pollen/_quota.json`

The `cache/pollen/` directory must be writable by the web server:

```bash
sudo mkdir -p /var/www/echoweather/cache/pollen
sudo chown -R www-data:www-data /var/www/echoweather/cache
sudo chown root:www-data /var/www/echoweather/config.local.php
sudo chmod 640 /var/www/echoweather/config.local.php
```

### 3. Apache vhost

```apache
<VirtualHost *:80>
    ServerName echoweather.com
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

```bash
sudo a2enmod rewrite headers
sudo a2ensite echoweather.conf
sudo apachectl configtest && sudo systemctl reload apache2
```

**No `ProxyPass` to port 8093.** PHP serves `/api/*` in-process.

### 4. Smoke test

```bash
./deploy.sh --smoke-only
# or locally: php -S 127.0.0.1:8080 router.php  then  BASE_URL=http://127.0.0.1:8080 ./scripts/smoke.sh
```

Checks `/api/status`, `/api/airnow`, `/api/pollen`, `/api/buoy/45029`, and static assets including `og-image.png`.

```bash
curl -s http://127.0.0.1/api/status
# {"airnow":true,"buoy":true,"pollen":true}

curl -s "http://127.0.0.1/api/pollen?latitude=43.06&longitude=-86.23" | head -c 300
# first request: "cached":false
# repeat within TTL: "cached":true, "cacheAgeSec":...

curl -s "http://127.0.0.1/api/buoy/45029" | head -c 100
```

### 5. Cloudflare Tunnel

Point the public hostname at Apache on port 80:

```yaml
ingress:
  - hostname: echoweather.com
    service: http://localhost:80
  - service: http_status:404
```

Visitors' browsers call open-meteo, api.weather.gov, etc. directly. Only
`/api/*` hits your PHP layer.

---

## Local development

One command — static files and API routes:

```bash
cd /path/to/skytrace
cp config.example.php config.local.php
# Edit config.local.php — add airnow_api_key and/or google_pollen_api_key
mkdir -p cache/pollen
php -S 127.0.0.1:8080 router.php
```

Open **http://127.0.0.1:8080**

`router.php` maps `/api/*` the same way Apache + `.htaccess` do in
production.

---

## Configuration reference

`config.example.php` is the source of truth for available keys and defaults.
On the server: `sudo cp config.example.php config.local.php` (first time) or merge
new keys into the existing file. **Do not rsync `config.local.php` from your dev machine.**

Every key is optional.

| Key | Default | Meaning |
|---|---|---|
| `airnow_api_key` | `""` | EPA AirNow API key. Enables `/api/airnow` for US monitor observations. |
| `google_pollen_api_key` | `""` | Google Maps Pollen API key. Enables `/api/pollen` for 5-day tree/grass/weed forecast. Falls back to env `GOOGLE_POLLEN_API_KEY` when empty. |
| `pollen_cache_ttl` | `10800` | Seconds to cache pollen per grid cell (3h). Raise to reduce API calls. Min 300, max 86400. |
| `pollen_cache_grid` | `1` | Decimal places for lat/lon rounding: `0` ≈ 70 mi, `1` ≈ 10 mi, `2` ≈ 1 mi. |
| `pollen_daily_limit` | `7500` | Max Google Pollen API calls per day (server calendar day). `0` = unlimited. When reached, serves stale cache only. |
| `cors_origins` | see example | Browser origins allowed to call `/api/*`. Include your dev URL for `php -S`. |

### API endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/status` | none | Reports which integrations are configured (`airnow`, `pollen`, `buoy`) |
| `GET /api/airnow?latitude=&longitude=&distance=` | none | AirNow lat/long proxy (distance 1–100 mi, default 50) |
| `GET /api/pollen?latitude=&longitude=` | none | Google Pollen 5-day forecast (server-cached) |
| `GET /api/buoy/{id}` | none | NDBC buoy text proxy |

---

## Updating the app

**Never rsync `config.local.php`.** Edit it on the server only.

Full app + PHP update:

```bash
cd /Users/veddegre/skytrace
rsync -avz \
  index.html manifest.json sw.js logo.svg icon.svg og-image.png \
  api lib router.php .htaccess config.example.php \
  veddegre@192.168.30.10:~/echoweather-deploy/

ssh veddegre@192.168.30.10 'sudo rsync -a ~/echoweather-deploy/ /var/www/echoweather/ && sudo chown -R www-data:www-data /var/www/echoweather'
```

Static files only:

```bash
rsync -avz index.html sw.js manifest.json og-image.png \
  veddegre@192.168.30.10:~/echoweather-deploy/
ssh veddegre@192.168.30.10 'sudo rsync -a ~/echoweather-deploy/ /var/www/echoweather/ && sudo chown -R www-data:www-data /var/www/echoweather'
```

PHP only:

```bash
rsync -avz api lib router.php config.example.php \
  veddegre@192.168.30.10:~/echoweather-deploy/
ssh veddegre@192.168.30.10 'sudo rsync -a ~/echoweather-deploy/ /var/www/echoweather/ && sudo chown -R www-data:www-data /var/www/echoweather'
```

After deploying code with new config keys, merge any additions from
`config.example.php` into the server's `config.local.php` by hand.

Deploy `index.html` and `sw.js` together (bump `APP_VERSION` in `index.html` and
the `CACHE` name in `sw.js`). Hard-refresh or use the in-app **Update app** link.

---

## Troubleshooting

**`/api/status` returns 404.** Enable `mod_rewrite`, set `AllowOverride All` on
`/var/www/echoweather/api`, confirm `api/.htaccess` is deployed.

**Air Quality hint still shows.** Set `airnow_api_key` in `config.local.php`.
Verify `curl http://127.0.0.1/api/status` shows `"airnow":true`.

**Pollen panel empty.** Set `google_pollen_api_key` in `config.local.php` (or export `GOOGLE_POLLEN_API_KEY`). Enable Pollen API in Google Cloud Console. Verify `curl http://127.0.0.1/api/status` shows `"pollen":true`. Ensure `cache/pollen/` exists and is writable: `sudo chown www-data:www-data /var/www/echoweather/cache/pollen`.

**Pollen always shows `"cached":false`.** Check that `cache/pollen/` is writable and not on a read-only filesystem.

**502 on `/api/pollen` after heavy use.** Daily limit (`pollen_daily_limit`) may be reached with no stale cache for that grid cell. Lower `pollen_cache_grid`, raise TTL, or wait until midnight server time. Check `cache/pollen/_quota.json`.

**502 on `/api/pollen`.** Invalid key, Pollen API not enabled in Cloud Console, or outbound HTTPS blocked. Check `sudo tail -f /var/log/apache2/error.log`.

**Buoy panel unavailable.** Confirm `curl http://127.0.0.1/api/buoy/45029`
returns JSON. Check PHP can reach ndbc.noaa.gov (`php-curl` installed).

**500 on `/api/airnow`.** Key missing, invalid coordinates, or AirNow upstream
error — check Apache error log: `sudo tail -f /var/log/apache2/error.log`

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
| **Air / Moon** | AirNow or modeled AQI; Google Pollen forecast (tree/grass/weed); moon phase |
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
