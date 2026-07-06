# Echo Weather — Roadmap Handoff (Jul 2026)

Portable summary for continuing the enthusiast roadmap elsewhere.  
**Current version: v163** (`APP_VERSION` in `app.js`, `CACHE` in `sw.js`, `?v=163` in `index.html`).

---

## Product positioning (agreed)

> **Echo Weather is a US severe- and mesoscale-aware weather dashboard** — NWS forecasts and alerts, enthusiast radar, and SPC/storm context in one installable PWA.

**Four pillars:** Hazard intelligence · Radar & mesoscale · Forecast literacy · Regional context.

**Tab naming:** The visible tab label is **Impacts** (not "Outdoor"). Internal ids stay `outdoor` (`data-tab="outdoor"`, `#outdoor`, `mtab-outdoor`, deep link `#outdoor`, legacy `#air` → Impacts tab).

**Deprioritized:** Push notifications, global alerts parity, international AQI, lifestyle-first outdoor framing.

---

## What is shipped (v136–v163)

### v163 (latest)
- Storm banner **Warning polygon** jump — centers radar on nearest active warning centroid, enables warning layer
- **Auto threat layers** — storm reports + SPC Day 1 categorical turn on when storm mode fires (if off)
- **panelUnavail** pass — river gauges show clear unavailable copy; radar velocity fallback messages

### v161–v162
- Station history 3-column layout; observation count below charts
- Cross-browser in-app anchor navigation (`#afdPanel`, panel deep links)

### v152–v160 (interim batches)
- Lifestyle activity planner restored alongside impact hours; impact scoring fixes (UV, heat, cold)
- Great Lakes GLF office selection, water verdict attribution, on-water wind from buoy/lake point
- Inland hide for marine/coastal/water panels; AFD anchor scroll fix

### v151
- Storm banner actions: severe window on timeline, nearest SPC report jump
- Chase-mode radar: Site radar nudge from MRMS; vel toggle when storm mode active
- NWS hourly POP strip on Forecast tab (when precip likely)
- Impact hours planner (replaces lifestyle activity cards)

## What was shipped (v136–v150)

### Infrastructure & code health
- Split `index.html` → `app.css` + `app.js` (+ later `storm.js`, `radar.js`, `boot.js`)
- `scripts/check-versions.sh` + `scripts/ci-check.sh` in CI
- Per-location radar/threat layer prefs (`st_radar_*` per location key)
- TAF proxy disk cache (`lib/taf_cache.php`)
- AirNow server-side cache (v144)
- locToast white-dot bug fixed (v147) — `#locToast` hidden by default until message set

### Storm desk & radar
- Storm mode banner + threat narrative
- SPC Day 1–3 cat, tor/hail/wind probs, MCDs with distance, storm report filters
- HMS smoke layer + smoke→radar hint when PM2.5/AQI elevated (v142)
- Fire weather banner + 24h RH/wind timeline (v143)
- Storm report → radar jump (`jumpRadarToStormReport` in `radar.js`, clickable in `storm.js`) (v148)
- MRMS default radar for US locations (`defaultRadarMode()`) (v148)
- SKYWARN / spotter links in storm panel
- WPC ERO, NHC, alert polygons on map

### Forecast literacy
- 5-day visual forecast with hour-by-hour sky strip
- Climate normals + **vs normal** anomaly on day cards (`climoNormals`, `day-anomaly`)
- Precip **timing windows** on day cards (`dayPrecipWindow`)
- NWS detailed forecast periods
- METAR vs NWS hourly forecast bias badges
- METAR 7-day station history: temp/wind/pressure sparklines, 24h/7d summary (v150)
- AFD full text + highlight in More (`afdHighlightText`)
- AFD synoptic teaser on Forecast tab (`loadForecastAfdTeaser`, `fetchLatestAfdText`) (v150)
- Winter weather outlook (conditional)
- NBM precip probability panel (More tab)

### Regional & marine
- Great Lakes proximity gate (~50 nm), GLF/NWS marine text, Open-Meteo waves, buoy picker (`/api/buoy`)
- Coastal NOAA tides + Open-Meteo swell + NWS marine zone text (v143–v144)
- Unified **On the water** verdict (GL + coastal) (v148)
- USGS streamgages within ~30 mi (conditional panel)
- Lake-effect hints in storm panel

### Impacts tab (formerly Outdoor)
- Tab reorganized (v149): Activity planner → Air & exposure → Water/coast/rivers → Sky
- Activity planner with pins, best-window summary, NWS advisory scoring (fog, wind, smoke/AQI)
- Air quality (AirNow + Open-Meteo), monitor distance/direction (v137), pollen 3-day
- UV & exposure strip
- Aurora hint + OVATION probability strip (v150)
- Consistent **panel unavail** messaging (`panelUnavail` / `setPanelUnavail` in `app.js`) (v150)

### Aviation (More tab)
- METAR + TAF side-by-side at nearest field(s)
- VFR/IFR/MVFR flight category strip (v144)

### Other
- Location compare with alerts + SPC Day 1 badges (v144)
- HRRR extras: precip type + SRH proxy in Advanced Atmosphere (v148)

---

## What remains

The original phased roadmap (Phases 1–4) is **largely complete**. Remaining work is **refinement and surfacing**, not greenfield features.

### Suggested next batch — v164+ (not started)

| # | Item | Notes |
|---|------|--------|
| 1 | **Watch polygon jump** | Same pattern as warning jump for watch areas |
| 2 | **README / docs** | Keep feature list in sync as batches ship |
| 3 | **panelUnavail pass** | Remaining edge cases (radar load failure, etc.) |

### v163 (shipped)

| # | Item | Status |
|---|------|--------|
| 1 | Warning polygon jump | Done |
| 2 | Auto threat layers (reports + SPC cat) | Done |
| 3 | panelUnavail pass (gauges + velocity) | Done |

### v152+ (superseded by v163 batch above)

### v151 (shipped)

| # | Item | Status |
|---|------|--------|
| 1 | Storm desk hero actions | Done |
| 2 | Chase-mode radar UX | Done |
| 3 | NBM on Forecast | Done |
| 4 | Impacts copy pass | Done |

### Smaller follow-ons (no batch assigned)

- Extend `panelUnavail()` to remaining edge cases (stream gauges when API fails, radar site velocity notes, etc.)
- Optional: split more logic out of `app.js` (maintenance; radar/storm already split)

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
| `app.js` | Core app: state, fetch, render, tabs, most panels (~6k lines) |
| `storm.js` | SPC, storm mode, threat layers, storm panel, fire banner hooks |
| `radar.js` | Leaflet map, radar modes, animation, storm report jump |
| `boot.js` | Entry / init glue |
| `sw.js` | Service worker; `CACHE = 'echo-weather-v163'` |
| `lib/taf_cache.php` | TAF proxy cache |
| `scripts/check-versions.sh` | Ensures `APP_VERSION` ↔ `sw.js` ↔ `index.html` ?v= sync |
| `scripts/ci-check.sh` | Syntax + static checks |

**Script load order:** `app.js` → `storm.js` → `radar.js` → `boot.js`

**Version bump checklist:**
1. `APP_VERSION` in `app.js`
2. `CACHE` in `sw.js`
3. All `?v=` query strings in `index.html` (css + 4 scripts)
4. Run `./scripts/check-versions.sh && ./scripts/ci-check.sh`
5. Deploy: `./update.sh --smoke`

**Tabs:** `now` | `forecast` | `radar` | `outdoor` (label: Impacts) | `more`  
**Deep links:** `#now`, `#forecast`, `#radar`, `#outdoor`, `#more`, `#radar?mode=mrms&frame=8`, `#afdPanel` → More tab, legacy `#air` → Impacts.

**Storage keys (localStorage via `store`):** `st_locs`, `st_active`, `st_units`, `st_theme`, `st_activity_pins`, `st_radar_mode`, per-location radar/threat prefs, `st_app_ver`.

---

## Key functions added recently (v148–v150)

| Function | File | Purpose |
|----------|------|---------|
| `jumpRadarToWarningPolygon` | `radar.js` | Center radar on warning polygon centroid |
| `nearestWarningPolygon` | `storm.js` | Nearest active warning geometry to pin |
| `autoEnableStormThreatLayers` | `storm.js` | Turn on reports + SPC cat when storm mode fires |
| `defaultRadarMode` | `app.js`, `radar.js` | MRMS for US, RainViewer elsewhere |
| `waterVerdictPanel` / `renderWaterVerdict` | `app.js` | Unified boating summary |
| `fetchLatestAfdText` | `app.js` | Shared AFD fetch for More + Forecast teaser |
| `loadForecastAfdTeaser` | `app.js` | Synoptic excerpt on 5-day panel |
| `panelUnavail` / `setPanelUnavail` | `app.js` | Consistent unavailable copy |
| `renderOvationStrip` | `app.js` | Aurora OVATION bar chart |
| `metarHistorySummary` | `app.js` | 24h/7d temp + pressure trend note |

---

## How to resume in a new chat

Paste or attach this file and say something like:

> Continue the Echo Weather enthusiast roadmap from `ROADMAP-REMAINING.md`. Implement v151 items 1–4 in order (or pick a lane). Do not commit unless I ask.

Useful context: conversation history lived in agent transcript `9d70f5e6-8cb6-4874-aace-ff0232a45b16` (Cursor project transcripts folder).

---

## Commit / deploy conventions (from user rules)

- **Do not commit** unless explicitly requested
- **Do not push** unless explicitly requested
- Commit message style: 1–2 sentences, focus on *why*
- PRs via `gh` when asked; version sync is mandatory before deploy

---

*Generated for handoff after v151 (storm banner actions, chase radar, NBM strip, impact hours).*
