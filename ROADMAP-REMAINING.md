# Echo Weather — Roadmap Handoff (Jul 2026)

Portable summary for continuing work in a new chat.  
**Current version: v268** (`APP_VERSION` in `app.js`, `CACHE` in `sw.js`, `?v=` in `index.html`).

**Status: maintenance only.** The enthusiast roadmap (Phases 1–4) is **complete**. No feature batch is assigned. Use this file for orientation, version bumps, and optional upkeep — not as a product backlog.

---

## Product positioning (agreed)

> **Echo Weather is a US severe- and mesoscale-aware weather dashboard** — NWS forecasts and alerts, enthusiast radar, and SPC/storm context in one installable PWA.

**Four pillars:** Hazard intelligence · Radar & mesoscale · Forecast literacy · Regional context.

**Tab naming:** Visible label **Impacts**; internal tab id **`impact`** (`data-tab="impact"`, `#impact`, `mtab-impact`). Legacy deep links `#outdoor` and `#air` still open Impacts.

**Deprioritized:** Push notifications, global alerts parity, international AQI, lifestyle-first outdoor framing.

**Layout decisions (kept):** Full SPC convective outlook stays on **Radar** (not Impacts/Forecast). No general forecast-maps gallery; CPC/USDM remain point teasers on Forecast. Prefer in-app location answers over outbound NOAA map links.

---

## What is shipped

### v236–v266 (maintenance)

- HMS smoke proxy + rate-limit/cache fixes; threat overlay pane and dual-pane sync
- Storm banner narrative (SPC DN scale + clean hazard probs); removed redundant “Open radar” on Radar
- Smoke layer opacity / location marker pane
- Radar legend footer; current-conditions smoke/haze vs METAR Clear
- **v266:** Air-quality alert floors Impact/Air panel scores; tighter Now storm-setup trigger; clearer threat empty vs error copy

### v197–v235 (post-roadmap polish)

- 5-day forecast charts, Forecast tab trim, precip sparkline, pollen UI, METAR wind backfill

### Earlier

See git history for v136–v196 (core PWA, storm mode, planners, marine, module splits).

---

## What remains

**Nothing planned.** Only optional maintenance if something breaks in the field or a module grows unwieldy again.

| Kind | Notes |
|------|--------|
| **`app.js` splits** | Core is ~3k lines; extract daily-chart lane only if it keeps growing |
| **`panelUnavail`** | Add codes when new edge cases appear |
| **Docs** | Keep README and this file in sync on meaningful version bumps |
| **Version sync** | `./scripts/check-versions.sh` before deploy; `./scripts/smoke.sh` after |

### Explicitly deprioritized (do not build unless scope changes)

- Push notifications
- Global/international alert parity
- Lifestyle-first outdoor marketing
- ECMWF hobby APIs, MeteoAlarm, PurpleAir
- Forecast-maps gallery / second interactive map stack
- Moving SPC outlook off Radar

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
| `sw.js` | Service worker; keep `CACHE` in sync with `APP_VERSION` |
| `scripts/check-versions.sh` | Ensures `APP_VERSION` ↔ `sw.js` ↔ `index.html` ?v= sync |
| `scripts/smoke.sh` | Post-deploy API route checks (incl. `/api/hms-smoke`) |
| `scripts/ci-check.sh` | Syntax + static checks |

**Script load order:** `app.js` → `tabs.js` → `nav.js` → `impact.js` → `marine.js` → `air.js` → `forecast-extras.js` → `mesonet.js` → `climo.js` → `obs.js` → `aviation.js` → `storm.js` → `loc-compare.js` → `radar.js` → `boot.js`

**Version bump checklist:**
1. `APP_VERSION` in `app.js`
2. `CACHE` in `sw.js`
3. All `?v=` in `index.html`
4. `./scripts/check-versions.sh`
5. Update this file’s version line when shipping meaningful maintenance
