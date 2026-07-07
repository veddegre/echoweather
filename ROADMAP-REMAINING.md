# Echo Weather — Roadmap Handoff (Jul 2026)

Portable summary for continuing the enthusiast roadmap elsewhere.  
**Current version: v195** (`APP_VERSION` in `app.js`, `CACHE` in `sw.js`, `?v=195` in `index.html`).

---

## Product positioning (agreed)

> **Echo Weather is a US severe- and mesoscale-aware weather dashboard** — NWS forecasts and alerts, enthusiast radar, and SPC/storm context in one installable PWA.

**Four pillars:** Hazard intelligence · Radar & mesoscale · Forecast literacy · Regional context.

**Tab naming:** Visible label **Impacts**; internal tab id **`impact`** (`data-tab="impact"`, `#impact`, `mtab-impact`). Legacy deep links `#outdoor` and `#air` still open Impacts.

**Deprioritized:** Push notifications, global alerts parity, international AQI, lifestyle-first outdoor framing.

---

## What is shipped (v136–v163)

### v195 (latest)
- **panelUnavail depth** — threat layer fetch/empty status; lightning feed failure after reconnect cap; alerts API failure copy
- **app.js splits** — `forecast-extras.js` (AFD/CPC/USDM/NBM), `mesonet.js`, `tabs.js` (lazy tab loading)
- **MRMS chase UX** — Velocity toggle always on MRMS; separate **Site radar** button during storm mode
- **MRMS dual pane** — reflectivity + velocity side-by-side via opengeo (both MRMS products)
- **Radar mesonet strip** — compact regional ASOS row on Radar tab during elevated storm conditions

### v194
- **Mesonet auto-refresh** — regional strip refreshes on 15‑min `loadAll` when More tab was open; also when storm mode / elevated SPC risk / MCDs load
- **MRMS velocity** — opengeo per-site `sr_bvel` via Velocity toggle on MRMS mode (nearest NWS radar site); animated time loop like reflectivity

### v193
- **MRMS loop refresh** — re-fetches opengeo frame list when animation wraps past live
- **MRMS frame stride** — 2 / 5 / 10 min density selector (saved per location)
- **Mesonet depth** — station names, distance labels, regional temp spread footnote

### v192
- **panelUnavail polish** — specific codes for mesonet, NBM, streamgages, storm intel, loc compare, CPC/USDM teasers; storm panel shows error instead of vanishing on fetch failure

### v191
- **Regional mesonet fix** — use NWS `/points/{lat},{lon}/stations` (or cached `observationStations`); old `?latitude=&radius=` query returned 400

### v190
- **SPC storm links** — mesoanalysis `…/mesoanalysis/` (not `mesoscale/`); surface `…/surfaceMaps/` (case); SKYWARN `…/skywarn` (not `/spotter`); rounded MapClick coords

### v189
- **MRMS animation** — ~2 hr loop from NOAA opengeo GetCapabilities + WMS `time` ping-pong (~30 frames, ~5 min stride)

### v186–v188
- **Radar expand fullscreen** — flex/hidden-pane layout fix; explicit expand heights; `invalidateSize` on open/close

### v185
- **Dual-pane polish** — animated reflectivity on pane B when primary is velocity; dual-pane pref saved per location
- **NWS CLI records** — official record high/low on day cards via IEM CLI (nearest ASOS)
- **Radar/refresh fixes** (v182–v184) — refresh reloads radar; velocity clears on mode switch; pane B tile target fix
- **panelUnavail** — coastal API failures, CPC/USDM codes

### v181
- **MRMS dual-pane** — side-by-side MRMS reflectivity + nearest-site velocity (Dual pane on MRMS mode)
- **README sync** — v174–v180 feature list in README

### v180
- **USDM drought teaser** — U.S. Drought Monitor category at your location on Forecast
- **Daily record hints** — 10-yr record/near-record high and low on 5-day cards

### v179
- **Dual-pane radar** — side-by-side reflectivity + velocity on IEM NEXRAD
- **CPC teaser** — 6–10 / 8–14 day temp & precip outlook on Forecast
- **Regional mesonet** — nearest ASOS strip on More tab
- **Climo polish** — low + precip anomaly vs 10-yr normals on day cards

### v176
- **AHPS at streamgages** — NWPS flood category badges + hydrograph links per USGS gauge (`marine.js`)
- **Snow accumulation** — hourly/daily snow on 5-day cards; 48h/72h storm totals in winter outlook
- **NBM grid expansion** — temp, wind, sky + POP in forecast strip and More panel
- **Loc compare fix** — preserve `#locCompare` grid class during loading (v175)

### v175
- Loc compare grid class regression fix

### v174
- **Alert expiration** — in-effect alerts show countdown when expiring soon (`Expires in N min`); multi-alert list sorted by severity then end time
- **Shareable radar URLs** — `#radar?mode=…&frame=…&layers=…` encodes threat layer toggles; hash updates when layers change
- **SPC meso links** — mesoanalysis, surface analysis, observed soundings in storm panel when risk elevated
- **Day 2/3 SPC discussions** — outlook discussion excerpts shown whenever parsed (not gated on point risk for days 2–3)

### v173
- **`air.js`** — AQI, pollen, UV & exposure (~530 lines)
- **`aviation.js`** — METAR + TAF (~300 lines)
- **Impacts UX** — aria-label copy pass; mobile deep links scroll to matching section chip (desktop unchanged)
- **README** synced for module split and v151–v173

### v172
- **`marine.js`** — Great Lakes, coastal/tides, buoy, stream gauges, water verdict (~1.2k lines extracted from `app.js`)
- **panelUnavail polish** — marine/coastal error states, loc compare catastrophic failure, forecast NBM strip API errors, pollen note on air failure

### v171
- **Syntax fix** — restored truncated `initServiceWorker()` in `app.js`; removed orphaned catch block from `nav.js`

### v170
- **`outdoor` → `impact` rename** — tab id, `impact.js`, CSS/HTML ids (`impactsGrid`, `impact-section-nav`, …); canonical hash `#impact`; legacy `#outdoor` / `#air` preserved

### v169
- **Mobile planner collapse** — unpinned activity/impact cards collapse when pins exist; all cards expanded when none pinned
- **Shorter Impacts ledes** on mobile (dual long/short copy in HTML)
- **`impact.js`** — activity/impact planners, aurora, section chips (~1.5k lines)
- **`nav.js`** — tab bar, hash deep links, chrome height sync

### v167–v168
- **Aurora panelUnavail** when NOAA SWPC APIs fail (≥40°N); **Sky** group hides when aurora panel inactive
- **panelUnavail** on daily forecast render failure; loc compare loading state cleanup

### v165
- **Auto-enable watches layer** in watch-only storm mode (no active warning); warnings layer when warnings active
- **panelUnavail** — METAR 7-day history load failure; air quality uses styled unavailable when both sources fail

### v164
- Storm banner **Watch polygon** jump (same pattern as warning jump)
- **panelUnavail** — radar load failure and RainViewer rate-limit fallback copy
- **README** feature list synced (v151–v164)

### v163
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

### Phased enthusiast batch (v174–v177)

| Batch | Items | Status |
|-------|-------|--------|
| **v174** | Alert expiration · shareable radar URLs · SPC meso links · Day 2/3 discussions | **Shipped** |
| **v175–v176** | AHPS streamgages · snow accumulation · NBM grid expansion · loc compare fix | **Shipped** (v176) |
| **v177–v179** | Dual-pane radar · CPC teaser · mesonet · climo polish | **Shipped** (v179) |
| **v180** | USDM drought · daily record hints | **Shipped** |
| **v181** | MRMS dual-pane · README sync | **Shipped** |
| **v182–v185** | Radar refresh/dual-pane fixes · NWS records · polish | **Shipped** (v185) |
| **v186–v195** | Expand · MRMS · mesonet · panelUnavail · velocity · polish · splits | **Shipped** (v195) |
| **v195+** | Optional depth / maintenance | Planned |

### v179 detail
- **Dual-pane radar** — side-by-side reflectivity + velocity on IEM NEXRAD (Dual pane button)
- **CPC teaser** — 6–10 / 8–14 day temp & precip outlook at your location on Forecast
- **Regional mesonet** — nearest ASOS strip on More tab
- **Climo polish** — low + precip anomaly vs 10-yr normals on day cards

### v177 detail (shipped in v179)

| # | Item | Status |
|---|------|--------|
| 5 | **Dual-pane radar** | Done — IEM NEXRAD + MRMS/velocity |
| 8 | **CPC teaser** | Done — 6–10 / 8–14 on Forecast |
| 10 | **Mesonet** | Done — regional ASOS strip on More |
| — | **Climate polish** | Done — low + precip anomaly on day cards |

#### v175–v176 detail (shipped)

| # | Item | Notes |
|---|------|--------|
| 2 | **AHPS at streamgages** | NWPS flood category + hydrograph links per USGS gauge |
| 3 | **Winter snow accumulation** | Snow on 5-day cards; 48h/72h totals in winter outlook |
| 9 | **NBM beyond POP** | Temp, wind, sky strips from NWS grid hourly (Forecast + More) |

### Climate

**Shipped:** `fetchClimoNormals()` + `dayClimoAnomaly()` — 10-year Open-Meteo archive; high/low/precip anomaly vs 10-yr normals on 5-day cards; CPC 6–10 / 8–14 teaser; USDM drought teaser; **NWS CLI record/near-record** hints on day cards (falls back to 10-yr archive).

**Not yet:** Nothing critical in climate lane.

### Suggested next batch

| # | Item | Notes |
|---|------|--------|
| 1 | **Further splits** | Obs/METAR, loc compare, or climo modules if `app.js` still feels heavy |
| 2 | **panelUnavail edge cases** | RainViewer tile exhaustion messaging, remaining impact panels |

### Smaller follow-ons (no batch assigned)

- Extend `panelUnavail()` to remaining edge cases (threat layer tile failures, lightning WS, etc.)
- Optional: split more logic out of `app.js` (maintenance; radar/storm already split)

### Explicitly deprioritized (do not build unless scope changes)

- Push notifications
- Global/international alert parity
- Lifestyle-first outdoor marketing
- ECMWF hobby APIs, MeteoAlarm, PurpleAir (unless urban smoke granularity becomes a goal)

### v185 (shipped)

| # | Item | Status |
|---|------|--------|
| — | Dual-pane reflectivity animation (velocity primary) | Done |
| — | Dual-pane pref per location | Done |
| — | NWS CLI official records on day cards | Done |
| — | Radar refresh / dual-pane bugfixes (v182–184) | Done |
| — | panelUnavail coastal + teaser codes | Done |

### v181 (shipped)

| # | Item | Status |
|---|------|--------|
| — | MRMS + velocity dual-pane | Done |
| — | README sync (v174–v180) | Done |

### v180 (shipped)

| # | Item | Status |
|---|------|--------|
| — | USDM drought teaser | Done |
| — | Daily record / near-record hints | Done |

### v179 (shipped)

| # | Item | Status |
|---|------|--------|
| 5 | Dual-pane radar | Done |
| 8 | CPC 6–10 / 8–14 teaser | Done |
| 10 | Regional mesonet ASOS strip | Done |
| — | Climo low + precip anomaly | Done |

### v176 (shipped)

| # | Item | Status |
|---|------|--------|
| 1 | AHPS/NWPS streamgages | Done |
| 2 | Snow accumulation | Done |
| 3 | NBM grid expansion | Done |
| 4 | Loc compare class fix | Done |

### v174 (shipped)

| # | Item | Status |
|---|------|--------|
| 1 | Alert expiration in summary (countdown when soon) | Done |
| 4 | Shareable radar hash with `layers=` | Done |
| 6 | SPC mesoanalysis / surface / soundings links | Done |
| 7 | Day 2/3 outlook discussion excerpts | Done |

### v173 (shipped)

| # | Item | Status |
|---|------|--------|
| 1 | `air.js` + `aviation.js` splits | Done |
| 2 | Impacts aria + mobile deep-link scroll | Done |
| 3 | README sync | Done |

### Earlier suggested batch (superseded)

| # | Item | Notes |
|---|------|--------|
| 1 | ~~Code maintenance~~ | marine split done in v172 |
| 2 | ~~Polish~~ | panelUnavail pass done in v172 |
| 3 | ~~Deploy / commit~~ | v151–v172 batch when ready |

### v166 (shipped)

| # | Item | Status |
|---|------|--------|
| 1 | Aurora SWPC panelUnavail | Done |
| 2 | Sky group visibility + daily/loc compare polish | Done |

### v165 (shipped)

| # | Item | Status |
|---|------|--------|
| 1 | Auto-enable watches layer | Done |
| 2 | panelUnavail (METAR history, air) | Done |

### v164 (shipped)

| # | Item | Status |
|---|------|--------|
| 1 | Watch polygon jump | Done |
| 2 | README / docs sync | Done |
| 3 | panelUnavail (radar load) | Done |

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

---

## Architecture quick reference

| File | Role |
|------|------|
| `index.html` | Shell, tab bar, panel markup |
| `app.css` | All styles |
| `app.js` | Core app: state, fetch, render (~3k lines) |
| `nav.js` | In-page nav: tabs, hash deep links, chrome height |
| `impact.js` | Impacts: activity/impact planners, aurora, section chips |
| `marine.js` | Great Lakes, coastal/tides, buoy, stream gauges, water verdict |
| `air.js` | Air quality, pollen, UV & exposure |
| `aviation.js` | Aviation METAR + TAF |
| `storm.js` | SPC, storm mode, threat layers, storm panel, fire banner hooks |
| `radar.js` | Leaflet map, radar modes, animation, storm report jump |
| `boot.js` | Entry / init glue |
| `sw.js` | Service worker; `CACHE = 'echo-weather-v195'` |
| `lib/taf_cache.php` | TAF proxy cache |
| `scripts/check-versions.sh` | Ensures `APP_VERSION` ↔ `sw.js` ↔ `index.html` ?v= sync |
| `scripts/ci-check.sh` | Syntax + static checks |

**Script load order:** `app.js` → `nav.js` → `impact.js` → `marine.js` → `air.js` → `aviation.js` → `storm.js` → `radar.js` → `boot.js`

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

## Key functions added recently (v148–v150)

| Function | File | Purpose |
|----------|------|---------|
| `jumpRadarToAlertPolygon` | `radar.js` | Center radar on warning/watch polygon centroid |
| `formatAlertSummaryTiming` / `formatAlertExpiresLabel` | `impact.js` | Inline alert expiration + soon countdown |
| `threatLayersHashParam` / `applyThreatLayersFromHash` | `storm.js` | Shareable radar layer state in URL hash |
| `nearestWatchPolygon` | `storm.js` | Nearest active watch geometry to pin |
| `autoEnableStormThreatLayers` | `storm.js` | Turn on reports + SPC cat when storm mode fires |
| `defaultRadarMode` | `app.js`, `radar.js` | MRMS for US, RainViewer elsewhere |
| `waterVerdictPanel` / `renderWaterVerdict` | `app.js` | Unified boating summary |
| `fetchLatestAfdText` | `app.js` | Shared AFD fetch for More + Forecast teaser |
| `loadForecastAfdTeaser` | `app.js` | Synoptic excerpt on 5-day panel |
| `nwsPointForecastUrl` / `nwsSkywarnUrl` | `app.js` | NWS MapClick + local SKYWARN links |
| `SPC_STORM_LINKS` | `storm.js` | Canonical SPC external link URLs |
| `panelUnavail` / `setPanelUnavail` | `app.js` | Consistent unavailable copy |
| `fetchMrmsFrameTimes` / `showMrmsPingPongFrame` | `radar.js` | MRMS animated loop via opengeo WMS time |
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
