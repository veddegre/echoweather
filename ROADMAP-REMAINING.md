# Echo Weather — Roadmap Handoff (Jul 2026)

Portable summary for continuing work in a new chat.  
**Current version: v235** (`APP_VERSION` in `app.js`, `CACHE` in `sw.js`, `?v=235` in `index.html`).

**Status: maintenance only.** The enthusiast roadmap (Phases 1–4) is **complete**. No feature batch is assigned. Use this file for orientation, version bumps, and optional upkeep — not as a product backlog.

---

## Product positioning (agreed)

> **Echo Weather is a US severe- and mesoscale-aware weather dashboard** — NWS forecasts and alerts, enthusiast radar, and SPC/storm context in one installable PWA.

**Four pillars:** Hazard intelligence · Radar & mesoscale · Forecast literacy · Regional context.

**Tab naming:** Visible label **Impacts**; internal tab id **`impact`** (`data-tab="impact"`, `#impact`, `mtab-impact`). Legacy deep links `#outdoor` and `#air` still open Impacts.

**Deprioritized:** Push notifications, global alerts parity, international AQI, lifestyle-first outdoor framing.

---

## What is shipped

### v197–v235 (post-roadmap polish)

- **5-day forecast charts** — Combined temperature curve + hatched rain-chance band (or precip amount when measurable); temp labels on the line; rain scale on the right; **Now** marker aligned with plot; hover hints (**time · temp · precip %**); precip-likely time windows on cards
- **Forecast classification** — Warm-season ice/mix suppression; chance shower/thunder wording maps to rain (not all-day storm); NWS PoP merged into hourly chart data (`chartHourly`)
- **Forecast tab layout** — Removed redundant NWS discussion teaser and NWS grid hourly strip from Forecast; full AFD and grid hourly live on **More**; CPC extended outlook and U.S. Drought Monitor teasers **below** day cards
- **Now tab** — **Precip chance** mini sparkline (0–100% domain) alongside pressure, temp, dew, CAPE
- **Pollen UI** — MSN-style gauge; expandable **Pollen types & plants** (tree / grass / weed species when Google pollen is configured)
- **Observations** — METAR backfill for null NWS observation wind (`backfillNwsObsFields`)
- **Docs** — README synced to v235

### v196

- **panelUnavail edge cases** — RainViewer tile exhaustion (`radar_rainviewer_tiles`), RainViewer API vs generic radar load, obs points, pollen API, planner forecast gaps (activity/impact hours), loc-compare per-card weather (`loc_compare_wx`), climo API
- **app.js splits** — `climo.js`, `obs.js`, `loc-compare.js`

### v174–v195 (summary)

Dual-pane radar (IEM + MRMS); CPC/USDM teasers; regional mesonet + auto-refresh; NWS CLI records; AHPS streamgages; NBM grid on More; alert expiration + shareable radar URLs; SPC meso links; MRMS chase UX; module splits (`forecast-extras.js`, `mesonet.js`, `tabs.js`, `impact.js`, `marine.js`, `air.js`, `aviation.js`, `nav.js`).

### v136–v173 (summary)

Core PWA split; storm mode + threat layers; 5-day visual forecast + climo anomaly; marine/coastal; activity/impact planners; pollen/AQI/UV; aurora; METAR history; loc compare; fire weather; `panelUnavail` foundation.

*Per-version notes remain in git history.*

---

## What remains

**Nothing planned.** Only optional maintenance if something breaks in the field or a module grows unwieldy again.

| Kind | Notes |
|------|--------|
| **`app.js` splits** | Core is ~3k lines; consider extracting daily-chart / render-daily lane only if it keeps growing |
| **`panelUnavail`** | Add codes when new edge cases appear (API failures, empty upstream data) |
| **Docs** | Keep README and this file in sync on meaningful version bumps |
| **Version sync** | `./scripts/check-versions.sh` before deploy |

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
| `app.js` | Core: state, fetch, render, daily charts, hourly (~3k lines) |
| `tabs.js` | Lazy tab panel loading and idle prefetch |
| `nav.js` | Tab bar, hash deep links, chrome height |
| `impact.js` | Impacts: activity/impact planners, aurora, section chips |
| `marine.js` | Great Lakes, coastal/tides, buoy, stream gauges, water verdict |
| `air.js` | Air quality, pollen, UV & exposure |
| `forecast-extras.js` | CPC/USDM forecast teasers (below day cards), NBM grid + full AFD (More) |
| `mesonet.js` | Regional ASOS strip (More + Radar storm row) |
| `climo.js` | Climate normals, NWS CLI records, day-card anomaly hints |
| `obs.js` | Observations vs NWS forecast, METAR 7-day history |
| `loc-compare.js` | Saved location comparison with alerts + SPC badges |
| `aviation.js` | Aviation METAR + TAF |
| `storm.js` | SPC, storm mode, threat layers, storm panel, fire banner hooks |
| `radar.js` | Leaflet map, radar modes, animation, storm report jump |
| `boot.js` | Entry / init glue |
| `sw.js` | Service worker; `CACHE = 'echo-weather-v235'` |
| `lib/taf_cache.php` | TAF proxy cache |
| `scripts/check-versions.sh` | Ensures `APP_VERSION` ↔ `sw.js` ↔ `index.html` ?v= sync |
| `scripts/ci-check.sh` | Syntax + static checks |

**Script load order:** `app.js` → `tabs.js` → `nav.js` → `impact.js` → `marine.js` → `air.js` → `forecast-extras.js` → `mesonet.js` → `climo.js` → `obs.js` → `aviation.js` → `storm.js` → `loc-compare.js` → `radar.js` → `boot.js`

**Version bump checklist:**
1. `APP_VERSION` in `app.js`
2. `CACHE` in `sw.js`
3. All `?v=` query strings in `index.html` (css + scripts)
4. Run `./scripts/check-versions.sh && ./scripts/ci-check.sh`
5. Update README (and this file on meaningful releases)
6. Deploy: `./update.sh --smoke`

**Tabs:** `now` | `forecast` | `radar` | `impact` (label: Impacts) | `more`  
**Deep links:** `#now`, `#forecast`, `#radar`, `#impact`, `#more`, `#radar?mode=mrms&frame=8&layers=warnings,watches,stormReports,spcCat`, `#afdPanel` → More tab; legacy `#outdoor`, `#air` → Impacts.

**Storage keys (localStorage via `store`):** `st_locs`, `st_active`, `st_units`, `st_theme`, `st_activity_pins`, `st_radar_mode`, per-location radar/threat prefs, `st_app_ver`.

---

## Key functions by module (reference)

| Function | File | Purpose |
|----------|------|---------|
| `panelUnavail` / `setPanelUnavail` | `app.js` | Consistent unavailable copy |
| `renderDaily` / `buildDayTimeline` | `app.js` | 5-day cards, condition strip, combined chart |
| `dayHourlyWetData` / `dayChartHoverHtml` | `app.js` | Rain band scores + hover tooltips |
| `chartHourly` / `conditionBucket` | `app.js` | Merged hourly data + sky/storm classification |
| `backfillNwsObsFields` | `app.js` | METAR wind backfill for sparse NWS obs |
| `renderHourly` | `app.js` | Now-tab hourly strip + sparklines |
| `fetchClimoNormals` / `dayClimoAnomaly` | `climo.js` | 10-yr normals + day-card hints |
| `loadObs` / `renderMetarTrace` | `obs.js` | Obs vs forecast + METAR history |
| `pollenPlantExpandHtml` | `air.js` | Expandable pollen types & plants |
| `loadForecastCpcTeaser` / `loadNbm` / `loadAFD` | `forecast-extras.js` | CPC/USDM teasers, grid hourly, full discussion |
| `renderLocCompare` | `loc-compare.js` | Multi-location compare cards |
| `jumpRadarToAlertPolygon` | `radar.js` | Center radar on warning/watch polygon |
| `fetchMrmsFrameTimes` | `radar.js` | MRMS animated loop via opengeo WMS |
| `threatLayersHashParam` | `storm.js` | Shareable radar layer state in URL hash |
| `autoEnableStormThreatLayers` | `storm.js` | Turn on reports + SPC cat when storm mode fires |

---

## How to resume in a new chat

Paste or attach this file and say something like:

> Continue Echo Weather maintenance from `ROADMAP-REMAINING.md`. Fix a bug or polish UX. Do not commit unless I ask.

---

## Commit / deploy conventions (from user rules)

- **Do not commit** unless explicitly requested
- **Do not push** unless explicitly requested
- Commit message style: 1–2 sentences, focus on *why*
- PRs via `gh` when asked; version sync is mandatory before deploy

---

*Updated after v235 (5-day chart polish, Forecast tab cleanup, pollen expander, README sync). Roadmap complete — maintenance only.*
