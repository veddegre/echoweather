# The Hundred Acre Weather

A PHP weather display inspired by A. A. Milne's 1926 public-domain *Winnie-the-Pooh*, with a six-level severity scale and a 14-slide guide deck.

**Not affiliated with or endorsed by Disney.** Character illustrations are original pen-and-ink style artwork, not copies of E. H. Shepard or Disney designs.

## Features

- Live weather from [Open-Meteo](https://open-meteo.com/) (no API key required)
- Optional [NWS active alerts](https://www.weather.gov/documentation/services-web-api) for US locations
- Watches, warnings, and advisories grouped with official details
- Six-level Hundred Acre Weather Scale (Fine → Emergency)
- Progressive visual styling — calm at low levels, stark at Level 5
- 14-slide educational guide with keyboard and touch navigation
- Configurable location via query parameters

## Requirements

- PHP 8.0+ with `curl` or `allow_url_fopen`
- Network access for weather API calls

## Quick start

```bash
cd /home/veddersg/pooh
php -S localhost:8080
```

Then open:

- **Live forecast:** http://localhost:8080/index.php
- **Slide guide:** http://localhost:8080/slides.php

## Location detection

The forecast resolves your location automatically:

1. **URL parameters** — `?lat=…&lon=…` (optional `&name=…`) override everything
2. **Saved cookie** — remembers your last location for 30 days
3. **IP geolocation** — estimated city/region on first visit (via ip-api.com)
4. **Browser geolocation** — prompted automatically (or via “Use my precise location”) for GPS accuracy
5. **Fallback** — `fallback_latitude` / `fallback_longitude` in `config.php` if all else fails

Place names come from [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/).

## Configuration

Edit `config.php`:

| Setting | Default | Description |
|---------|---------|-------------|
| `fallback_latitude` / `fallback_longitude` | NYC | Last-resort coordinates |
| `fallback_location_name` | The Hundred Acre Wood | Name when detection fails |
| `temperature_unit` | fahrenheit | `fahrenheit` or `celsius` |
| `wind_unit` | mph | `mph`, `kmh`, or `ms` |
| `nws_alerts` | true | Fetch US NWS alerts |
| `auto_browser_location` | true | Try device GPS after IP estimate |

## Manual location override

```
http://localhost:8080/index.php?lat=51.5074&lon=-0.1278&name=London
```

## The scale

| Level | Name |
|------:|------|
| 0 | A Fine Day for a Walk |
| 1 | A Slightly Bothersome Day |
| 2 | A Rather Blustery Day |
| 3 | A Very Wet and Worrisome Day |
| 4 | Everyone to Christopher Robin's House |
| 5 | The Hundred Acre Emergency |

Level is determined from the highest of: weather code, wind, temperature extremes, precipitation, and active NWS alerts.

## Slide navigation

- **Arrow keys** or **Space** — next/previous slide
- **Home / End** — first/last slide
- **Swipe** — touch devices

## Character illustrations

Original **E. H. Shepard** pen-and-ink illustrations from *Winnie-the-Pooh* (1926), sourced from [Project Gutenberg #67098](https://www.gutenberg.org/ebooks/67098):

| Character | Gutenberg file | Scene |
|-----------|----------------|-------|
| Pooh (Level 0) | `illus3.jpg` | At the door of Mr. Sanders |
| Pooh (Level 1) | `illus4.jpg` | Peering up at the sky |
| Piglet | [Wikimedia: Piglet EHShepard.jpg](https://commons.wikimedia.org/wiki/File:Piglet_EHShepard.jpg) | Getting ready for the party (1500×1212 scan) |
| Rabbit | `illus69.jpg` | Discussing plans, Chapter VII |
| Owl | `illus63.jpg` | Writing at his desk, Chapter VI |
| Eeyore | [Wikimedia: Winnie-the-Pooh 166-1.png](https://commons.wikimedia.org/wiki/File:Winnie-the-Pooh_166-1.png) | Eeyore with his tail bow, Chapter X |
| Christopher Robin | `illus2.jpg` | On the stairs, Chapter I |
| Hundred Acre Wood map | `map.jpg` | Endpaper map |

These works are in the **public domain in the United States**. Shepard's illustrations may remain under copyright in other countries until 2046 — verify rules for your jurisdiction. These are **not** Disney designs.

## File structure

```
pooh/
├── index.php           # Live weather display
├── slides.php          # 14-slide guide
├── config.php          # Settings
├── includes/
│   ├── levels.php      # Scale definitions
│   ├── images.php      # Character image helpers & attribution
│   └── weather.php     # API fetch & level logic
├── assets/
│   ├── images/
│   │   └── characters/ # Public-domain Shepard illustrations
│   ├── css/
│   └── js/
└── cache/              # Weather response cache (auto-created)
```

## License

Application code: use freely. Weather data © respective providers (Open-Meteo, NWS). Milne's 1926 text is public domain in the US; verify rules for your jurisdiction.
