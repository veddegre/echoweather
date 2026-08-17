# Echo Weather Feature Roadmap

## Overview

Five features to add to the existing vanilla JS + PHP app (no build tools, no framework). All features follow existing patterns: panels in `index.html`, logic in dedicated JS files, PHP proxies where CORS blocks direct browser access.

---

## Feature 1: Forecast Comparison Panel

**Goal**: Show NWS, Open-Meteo (default), Open-Meteo (GFS-only), and 7Timer! forecasts side-by-side so users can gauge forecast confidence.

**New files**:
- `api/7timer.php` — PHP proxy for 7Timer! (HTTP-only, no CORS). Follows `api/buoy.php` pattern: validate lat/lon params, fetch `http://www.7timer.info/bin/civil.php?lat={lat}&lon={lon}&output=json`, return parsed JSON. Add rate limit key `rate_limit_7timer` to `config.example.php`.
- `forecast-compare.js` — New JS module (~200-300 lines) for fetching, normalizing, and rendering the comparison.

**Modified files**:
- `api/.htaccess` — Add rewrite rule: `RewriteRule ^7timer$ 7timer.php [L,QSA]`
- `config.example.php` — Add `rate_limit_7timer` key
- `index.html` — Add `<script defer src="forecast-compare.js?v=273"></script>` in head; add a new `<section class="panel full nav-target" id="forecastComparePanel" data-tab="forecast">` after the `#dailyPanel` section
- `app.css` — Styles for `.compare-table`, `.compare-row`, `.compare-diverge`
- `lib/bootstrap.php` — Add `rate_limit_7timer` to `default_config()`

**Data flow**:
1. On Forecast tab load, `forecast-compare.js` fires parallel fetches:
   - NWS: already available from `state.data.nwsForecast` (no new fetch)
   - Open-Meteo default: already in `state.data.om` (no new fetch)
   - Open-Meteo GFS-only: new fetch to `api.open-meteo.com/v1/forecast?models=gfs_seamless` with daily temp/precip/wind params
   - 7Timer! civil: fetch via `/api/7timer?lat={lat}&lon={lon}`
2. Normalize all responses to a common shape: `{ days: [{ date, hi, lo, pop, wind }] }`
3. Render a table with one row per day, columns per source, cells color-coded by divergence (green = close, yellow = moderate, red = >10F spread)

**7Timer! normalization**: The `civil` product returns `dataseries[]` with `timepoint` (hour offset from `init`), `temp2m`, `prec_type`, `wind10m`. Aggregate to daily by grouping by calendar day.

**Effort**: Medium.

---

## Feature 2: Satellite Imagery Panel

**Goal**: Dedicated GOES IR/visible view as a standalone section, separate from the radar overlay toggle.

**New files**: None.

**Modified files**:
- `index.html` — Add `<section class="panel full nav-target" id="satellitePanel" data-tab="radar">` after `#radarPanel` with `<div id="satelliteMap"></div>` and layer toggle buttons
- `radar.js` — Add `initSatelliteMap()`, `loadSatellitePanel()`. Create a second Leaflet map in `#satelliteMap` using existing IEM GOES-East IR tile URL. Add GOES-West if available. Add IR/visible channel toggle.
- `app.css` — Styles for `#satelliteMap`, `.satellite-ctl`

**Implementation details**:
- Reuse `ensureGoesSatLayer()` pattern but as a standalone map
- Reuse existing basemap logic
- Center on active location
- Include timestamp and attribution
- Lazy-load when user scrolls to or taps the panel

**Effort**: Low.

---

## Feature 3: Map Measurement Tools

**Goal**: Distance measurement on the radar map (click two points to get distance in miles/km).

**New files**: None.

**Modified files**:
- `index.html` — Add Leaflet.draw CDN CSS and JS links
- `radar.js` — Add `initDrawTools()`. Create `L.Control.Draw` with polyline option only. On draw:created, calculate distance using `latLng.distanceTo()`. Display in a small overlay. On draw:deleted, clear measurement.
- `app.css` — Style `.measure-result` overlay

**Implementation details**:
- Only enable when radar tab is active
- Show distance in miles or km based on `state.units`
- Clear measurements on tab/location/radar mode changes
- Keep simple: polyline distance only

**Effort**: Medium.

---

## Feature 4: Color-Blind Radar Palette

**Goal**: Alternative reflectivity color ramp for users with color vision deficiency.

**New files**: None.

**Modified files**:
- `radar.js` — Add `radarPalette` state (localStorage). For MRMS WMS, try `STYLES=` param for alternative palette. For IEM/RainViewer, use canvas-based pixel remapping through a Cividis-based lookup table.
- `index.html` — Add palette toggle button inside `.radar-map-tools`
- `app.css` — Styles for palette button active state

**Implementation details**:
- Two palettes: "Standard" (current) and "Color-blind friendly" (Cividis-based)
- Canvas remap: hidden `<canvas>`, draw tile, iterate pixels, remap via LUT, display canvas
- Store preference in `store.get('st_radar_palette')`
- Only apply canvas when colorblind palette is active (CPU overhead)

**Effort**: Low-Medium.

---

## Feature 5: Additional Basemap Options

**Goal**: Add terrain and topographic basemap options to the radar panel.

**New files**: None.

**Modified files**:
- `radar.js` — Add basemap options: `light_all`, `dark_all`, `voyager` (CARTO), `topo` (OpenTopoMap). Store in `store.get('st_basemap')`. Modify `syncMapBasemap()` to use selected style.
- `index.html` — Add basemap `<select>` inside `.radar-map-tools` with options: Auto, Light, Dark, Terrain, Topographic
- `app.css` — Reuse `.radar-mode` class for the select

**Implementation details**:
- "Auto" = current theme-based behavior
- "Terrain" = CARTO Voyager (`rastertiles/voyager`)
- "Topographic" = OpenTopoMap (shows contours, elevation)
- Store per-app, not per-location
- Update both primary and dual-pane basemaps

**Effort**: Low.

---

## Version Bump Checklist

For all features combined, bump to v274:
1. `app.js` — `APP_VERSION = '274'`
2. `sw.js` — `CACHE = 'echo-weather-v274'`
3. `index.html` — All `?v=273` → `?v=274`
4. Run `scripts/check-versions.sh` to verify sync

## Testing

- Run `scripts/smoke.sh` after deploy to verify all API routes still work
- Add `7timer.php` to the smoke test script
- Manual testing: verify each feature on both light/dark themes, mobile and desktop viewports
- Test 7Timer! proxy with invalid coordinates (should return 400)
- Test colorblind palette across all radar modes
