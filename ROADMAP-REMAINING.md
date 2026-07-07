# Echo Weather — Roadmap Handoff (Jul 2026)

Portable summary for continuing the enthusiast roadmap elsewhere.  
**Current version: v196** (`APP_VERSION` in `app.js`, `CACHE` in `sw.js`, `?v=196` in `index.html`).

---

## Product positioning (agreed)

> **Echo Weather is a US severe- and mesoscale-aware weather dashboard** — NWS forecasts and alerts, enthusiast radar, and SPC/storm context in one installable PWA.

**Four pillars:** Hazard intelligence · Radar & mesoscale · Forecast literacy · Regional context.

**Tab naming:** Visible label **Impacts**; internal tab id **`impact`** (`data-tab="impact"`, `#impact`, `mtab-impact`). Legacy deep links `#outdoor` and `#air` still open Impacts.

**Deprioritized:** Push notifications, global alerts parity, international AQI, lifestyle-first outdoor framing.

---

## What is shipped (v136–v196)

### v196 (latest)
- **panelUnavail edge cases** — RainViewer tile exhaustion (`radar_rainviewer_tiles`), RainViewer API vs generic radar load, obs points, pollen API, planner forecast gaps (activity/impact hours), loc-compare per-card weather (`loc_compare_wx`), climo API
- **app.js splits** — `climo.js` (normals, NWS CLI records, day-card hints), `obs.js` (obs vs forecast, METAR 7-day trace), `loc-compare.js` (saved locations, alerts, SPC badges)

### v195
- **panelUnavail depth** — threat layer fetch/empty status; lightning feed failure after reconnect cap; alerts API failure copy
- **app.js splits** — `forecast-extras.js`, `mesonet.js`, `tabs.js`
- **MRMS chase UX** — Velocity toggle on MRMS; separate **Site radar** button in storm mode
- **MRMS dual pane** — reflectivity + velocity side-by-side (opengeo)
- **Radar mesonet strip** — compact regional ASOS row on Radar during elevated storm conditions

### v174–v194 (summary)
Dual-pane radar (IEM + MRMS); CPC/USDM teasers; regional mesonet + auto-refresh; NWS CLI records; AHPS streamgages; snow accumulation; NBM grid expansion; alert expiration + shareable radar URLs; SPC meso links; MRMS animation/loop refresh/velocity; radar expand fullscreen; module splits (`impact.js`, `marine.js`, `air.js`, `aviation.js`, `nav.js`).

### v151–v173 (summary)
Storm banner polygon jumps; chase-mode radar; impact hours planner; `outdoor`→`impact` rename; Great Lakes/coastal/water verdict; pollen/AQI/UV; aurora OVATION; METAR history; AFD teaser; loc compare; fire weather banner; HMS smoke layer.

### v136–v150 (summary)
Core PWA split (`app.css`, `app.js`, `storm.js`, `radar.js`, `boot.js`); storm mode + threat layers; 5-day visual forecast + climo anomaly; marine/coastal panels; `panelUnavail` foundation; version sync CI.

*Per-version notes through v193 remain in git history; this file tracks handoff state only.*

---

## What remains

The enthusiast roadmap (Phases 1–4) is **complete**. v174–v196 batches shipped the planned refinement work.

### Optional future maintenance (no batch assigned)

- Further `app.js` splits only if a lane grows again (core is ~2.4k lines)
- New `panelUnavail` codes as edge cases appear in the field
- README / ROADMAP sync on each version bump

### Explicitly deprioritized (do not build unless scope changes)

- Push notifications
- Global/international alert parity
- Lifestyle-first outdoor marketing
- ECMWF hobby APIs, MeteoAlarm, PurpleAir (unless urban smoke granularity becomes a goal)

---

## Architecture quick reference

| File | Role |
|------|------|
| `index.html` | Shell, tab bar, panel markup |
| `app.css` | All styles |
| `app.js` | Core app: state, fetch, render (~2.4k lines) |
| `tabs.js` | Lazy tab panel loading and idle prefetch |
| `nav.js` | Tab bar, hash deep links, chrome height |
| `impact.js` | Impacts: activity/impact planners, aurora, section chips |
| `marine.js` | Great Lakes, coastal/tides, buoy, stream gauges, water verdict |
| `air.js` | Air quality, pollen, UV & exposure |
| `forecast-extras.js` | CPC/USDM teasers, NBM grid, AFD teaser and full panel |
| `mesonet.js` | Regional ASOS strip (More + Radar storm row) |
| `climo.js` | Climate normals, NWS CLI records, day-card anomaly hints |
| `obs.js` | Observations vs NWS forecast, METAR 7-day history |
| `loc-compare.js` | Saved location comparison with alerts + SPC badges |
| `aviation.js` | Aviation METAR + TAF |
| `storm.js` | SPC, storm mode, threat layers, storm panel, fire banner hooks |
| `radar.js` | Leaflet map, radar modes, animation, storm report jump |
| `boot.js` | Entry / init glue |
| `sw.js` | Service worker; `CACHE = 'echo-weather-v196'` |
| `lib/taf_cache.php` | TAF proxy cache |
| `scripts/check-versions.sh` | Ensures `APP_VERSION` ↔ `sw.js` ↔ `index.html` ?v= sync |
| `scripts/ci-check.sh` | Syntax + static checks |

**Script load order:** `app.js` → `tabs.js` → `nav.js` → `impact.js` → `marine.js` → `air.js` → `forecast-extras.js` → `mesonet.js` → `climo.js` → `obs.js` → `aviation.js` → `storm.js` → `loc-compare.js` → `radar.js` → `boot.js`

**Version bump checklist:**
1. `APP_VERSION` in `app.js`
2. `CACHE` in `sw.js`
3. All `?v=` query strings in `index.html` (css + scripts)
4. Run `./scripts/check-versions.sh && ./scripts/ci-check.sh`
5. Deploy: `./update.sh --smoke`

**Tabs:** `now` | `forecast` | `radar` | `impact` (label: Impacts) | `more`  
**Deep links:** `#now`, `#forecast`, `#radar`, `#impact`, `#more`, `#radar?mode=mrms&frame=8&layers=warnings,watches,stormReports,spcCat`, `#afdPanel` → More tab; legacy `#outdoor`, `#air` → Impacts.

**Storage keys (localStorage via `store`):** `st_locs`, `st_active`, `st_units`, `st_theme`, `st_activity_pins`, `st_radar_mode`, per-location radar/threat prefs, `st_app_ver`.

---

## Key functions by module (reference)

| Function | File | Purpose |
|----------|------|---------|
| `panelUnavail` / `setPanelUnavail` | `app.js` | Consistent unavailable copy |
| `fetchClimoNormals` / `dayClimoAnomaly` | `climo.js` | 10-yr normals + day-card hints |
| `loadObs` / `renderMetarTrace` | `obs.js` | Obs vs forecast + METAR history |
| `renderLocCompare` | `loc-compare.js` | Multi-location compare cards |
| `jumpRadarToAlertPolygon` | `radar.js` | Center radar on warning/watch polygon |
| `fetchMrmsFrameTimes` | `radar.js` | MRMS animated loop via opengeo WMS |
| `threatLayersHashParam` | `storm.js` | Shareable radar layer state in URL hash |
| `autoEnableStormThreatLayers` | `storm.js` | Turn on reports + SPC cat when storm mode fires |

---

## How to resume in a new chat

Paste or attach this file and say something like:

> Continue Echo Weather maintenance from `ROADMAP-REMAINING.md`. Pick an optional item or fix a bug. Do not commit unless I ask.

---

## Commit / deploy conventions (from user rules)

- **Do not commit** unless explicitly requested
- **Do not push** unless explicitly requested
- Commit message style: 1–2 sentences, focus on *why*
- PRs via `gh` when asked; version sync is mandatory before deploy

---

*Updated after v196 (panelUnavail edge cases, climo/obs/loc-compare splits).*
