/* ============================================================
   Echo Weather — personal weather app
   Sources: NWS/METAR (US), HRRR convective fields, Open-Meteo, IEM/RainViewer radar
   ============================================================ */

const APP_VERSION = '255';
const HOURLY_HOURS = 24;
const DAILY_DAYS = 5;
const LOC_SYNC_MIN_MI = 12;
let urlLocPinned = false;
let lastHiddenAt = 0;
let loadAllBusy = false;
let stormReportFilter = 'all';

// ---------- safe persistent storage (localStorage w/ in-memory fallback) ----------
const _mem = {};
const store = {
  get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : (_mem[k] ?? null); }catch(e){ return _mem[k] ?? null; } },
  set(k,v){ _mem[k]=v; try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const $ = id => document.getElementById(id);

// ---------- global error surface (field debugging) ----------
let appErrorShown = false;
function reportAppError(err){
  console.error('appError', err);
  if(appErrorShown) return;
  const msg = String((err && err.message) || err || '');
  // network flakiness is handled per-panel; only surface real code errors
  if(/failed to fetch|networkerror|load failed|aborted/i.test(msg)) return;
  appErrorShown = true;
  const el = $('appErrorBadge');
  if(!el) return;
  el.textContent = 'Something went wrong in the app (v' + APP_VERSION + '). A hard refresh may help.';
  el.hidden = false;
}
window.addEventListener('error', e => reportAppError(e.error || e.message));
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  if(r && r.name === 'AbortError') return;
  reportAppError(r);
});

// ---------- state ----------
const DEFAULT_LOC = { name:'Allendale', admin1:'Michigan', country:'US', lat:42.9721, lon:-85.9536 };
const savedLocs = store.get('st_locs');
let state = {
  units: store.get('st_units') || 'F',
  theme: store.get('st_theme') || 'system',
  locations: savedLocs || [DEFAULT_LOC],
  active: store.get('st_active') ?? 0,
  data: null
};
if(state.active >= state.locations.length) state.active = 0;
stormReportFilter = store.get('st_report_filter') || 'all';
let activityPins = store.get('st_activity_pins') || [];
if(!Array.isArray(activityPins)) activityPins = [];
let impactPins = store.get('st_impact_pins') || [];
if(!Array.isArray(impactPins)) impactPins = [];

// ---------- theme (light / dark / system) ----------
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function isDarkTheme(){
  const t = state.theme || 'system';
  if(t === 'dark') return true;
  if(t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function updateThemeColorMeta(){
  const m = document.querySelector('meta[name="theme-color"]');
  if(m) m.content = isDarkTheme() ? '#12151a' : '#eaf4ff';
}
let basemapLayer = null;
function syncMapBasemap(){
  if(!map) return;
  const style = cssVar('--map-tiles') || (isDarkTheme() ? 'dark_all' : 'light_all');
  const url = 'https://{s}.basemaps.cartocdn.com/' + style + '/{z}/{x}/{y}{r}.png';
  if(basemapLayer) map.removeLayer(basemapLayer);
  basemapLayer = L.tileLayer(url, {
    attribution: '\u00A9 OpenStreetMap \u00A9 CARTO', subdomains: 'abcd',
    minZoom: RADAR_ZOOM.min, maxZoom: map ? radarMaxZoom() : RADAR_ZOOM.rainviewer
  }).addTo(map);
  basemapLayer.bringToBack();
  if(mapMarker) mapMarker.bringToFront();
}
function applyTheme(mode){
  state.theme = mode;
  store.set('st_theme', mode);
  document.documentElement.setAttribute('data-theme', mode);
  $('themeLight').classList.toggle('on', mode === 'light');
  $('themeDark').classList.toggle('on', mode === 'dark');
  $('themeSystem').classList.toggle('on', mode === 'system');
  updateThemeColorMeta();
  syncMapBasemap();
  if(typeof syncMapBBasemap === 'function') syncMapBBasemap();
  if(mapMarker){
    const c = cssVar('--accent') || '#3c91e6';
    mapMarker.setStyle({ color: c, fillColor: c });
  }
  if(state.data) renderLight(state.data);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if(state.theme === 'system'){
    updateThemeColorMeta();
    syncMapBasemap();
    if(typeof syncMapBBasemap === 'function') syncMapBBasemap();
    if(state.data) renderLight(state.data);
  }
});
$('themeLight').addEventListener('click', () => applyTheme('light'));
$('themeDark').addEventListener('click', () => applyTheme('dark'));
$('themeSystem').addEventListener('click', () => applyTheme('system'));

// ---------- URL deep-linking ----------
function parseUrlLoc(){
  const p = new URLSearchParams(location.search);
  const lat = parseFloat(p.get('lat')), lon = parseFloat(p.get('lon'));
  if(!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180){
    return { name: p.get('name') || (lat.toFixed(2) + ', ' + lon.toFixed(2)),
      admin1: p.get('admin1') || '', country: p.get('country') || '', lat, lon };
  }
  const loc = p.get('loc');
  if(loc){
    const [la, lo] = loc.split(',').map(Number);
    if(!isNaN(la) && !isNaN(lo)) return { name: p.get('name') || (la.toFixed(2) + ', ' + lo.toFixed(2)),
      admin1: '', country: '', lat: la, lon: lo };
  }
  return null;
}
function syncUrl(){
  const loc = state.locations[state.active];
  if(!loc) return;
  const u = new URL(location.href);
  u.searchParams.set('lat', loc.lat.toFixed(4));
  u.searchParams.set('lon', loc.lon.toFixed(4));
  u.searchParams.set('name', loc.name);
  if(loc.admin1) u.searchParams.set('admin1', loc.admin1); else u.searchParams.delete('admin1');
  history.replaceState(null, '', u);
}

// ---------- NWS fetch (browser: no custom headers — NWS CORS allows only API-Key/User-Agent) ----------
async function nwsFetch(url){
  return fetch(url);
}
async function fetchTimeout(url, opts, ms){
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort(new DOMException('Request timed out after ' + (ms || 8000) + 'ms', 'TimeoutError'));
  }, ms || 8000);
  try{
    return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
  }finally{
    clearTimeout(timer);
  }
}
let serverIntegrations = { airnow: false, buoy: false, pollen: false, taf: false, reachable: false };
async function probeServerIntegrations(){
  try{
    const r = await fetchTimeout('/api/status', {}, 3000);
    if(r.ok){
      serverIntegrations.reachable = true;
      const j = await r.json();
      serverIntegrations.airnow = !!j.airnow;
      serverIntegrations.buoy = !!j.buoy;
      serverIntegrations.pollen = !!j.pollen;
      serverIntegrations.taf = !!j.taf;
    }
  }catch(e){ /* static hosting or PHP not wired */ }
}

// ---------- per-panel loading ----------
let panelPending = 0;
function panelBusy(id, busy){
  const el = $(id);
  if(!el) return;
  el.classList.toggle('panel-busy', busy);
}
function setPanelStatus(id, text){
  const el = $(id);
  if(el) el.textContent = text || '';
}
async function panelTask(panelId, statusId, fn){
  panelBusy(panelId, true);
  if(statusId) setPanelStatus(statusId, 'loading');
  panelPending++;
  updatePanelFooter();
  try{
    const r = await fn();
    if(statusId) setPanelStatus(statusId, '');
    return r;
  }catch(e){
    if(statusId) setPanelStatus(statusId, 'failed');
    throw e;
  }finally{
    panelBusy(panelId, false);
    panelPending = Math.max(0, panelPending - 1);
    updatePanelFooter();
  }
}
const PANEL_UNAVAIL_MSG = {
  non_us: 'Not available outside the United States.',
  no_grid: 'Open-Meteo has no wave grid at this point — check the NWS marine text if shown.',
  no_station: 'No observation station found within range.',
  api_error: 'The data source could not be reached. Try refreshing in a moment.',
  no_obs: 'No recent METAR observations for comparison.',
  no_monitor: 'No EPA air monitor within 50 mi — modeled AQI only.',
  no_taf: 'Aviation forecast unavailable for the nearest field.',
  no_tides: 'NOAA tide predictions could not be loaded.',
  no_gauges: 'No active USGS streamgages within ~30 mi.',
  no_waves: 'Wave model has no grid here — use buoy readings or NWS marine forecast.',
  winter_layup: 'Buoy station is offline for winter layup.',
  no_discussion: 'NWS forecast discussion not published for this office.',
  no_precip_prob: 'No significant precipitation probability on the NWS grid in the next 12 hours.',
  air_api: 'Air quality could not be loaded from AirNow or Open-Meteo.',
  buoy_offline: 'Station may be offline or seasonal — pick another or tap Nearest.',
  taf_proxy: 'TAF needs the server proxy — ensure /api/taf is deployed with PHP.',
  taf_timeout: 'TAF request timed out — tap Refresh or try again in a moment.',
  radar_vel_unavail: 'Nearest NEXRAD velocity tile failed — showing reflectivity instead.',
  radar_vel_site: 'No radar site resolved for this pin — velocity needs a US location.',
  radar_load: 'Radar tiles could not be loaded — try another source or refresh.',
  radar_rainviewer: 'RainViewer rate limited — switched to IEM NEXRAD reflectivity.',
  radar_rainviewer_tiles: 'RainViewer tiles are failing — try another zoom or switch radar source.',
  rainviewer_api: 'RainViewer frame list could not be loaded.',
  obs_points: 'NWS grid lookup failed — observations could not be loaded for this location.',
  pollen_api: 'Pollen forecast could not be loaded.',
  planner_forecast: 'Forecast data is required for activity and impact planners.',
  loc_compare_wx: 'Open-Meteo conditions could not be loaded for this location.',
  climo_api: '10-year climate normals could not be loaded — anomaly hints omitted.',
  metar_history: 'METAR observation history could not be loaded for this station.',
  aurora_api: 'NOAA space weather data could not be reached — try again later.',
  cpc_api: 'CPC extended outlook could not be loaded.',
  usdm_api: 'U.S. Drought Monitor data could not be loaded.',
  coastal_api: 'Coastal marine and tide data could not be loaded.',
  mesonet_api: 'Regional ASOS observations could not be loaded from NWS.',
  nbm_api: 'NWS grid hourly forecast could not be loaded.',
  stream_api: 'USGS streamgage data could not be reached.',
  storm_api: 'SPC outlook or storm reports could not be loaded.',
  mrms_api: 'MRMS frame list could not be loaded — try refresh or another radar source.',
  loc_compare_api: 'Saved location comparison could not be loaded.',
  threat_layer_api: 'Threat map layer could not be loaded — try refresh.',
  threat_layer_empty: 'No threat geometry for this layer at the moment.',
  hms_smoke_api: 'Smoke layer unavailable — server proxy /api/hms-smoke failed.',
  hms_smoke_empty: 'No HMS smoke polygons in the latest NESDIS product yet.',
  lightning_api: 'Live lightning feed could not connect — Blitzortung may be down.',
  alerts_api: 'Active NWS alerts could not be loaded.'
};
function panelUnavail(code, extra){
  const msg = PANEL_UNAVAIL_MSG[code] || 'Unavailable for this location.';
  const tail = extra ? ' ' + String(extra).trim() : '';
  return '<p class="panel-unavail"><strong>Unavailable.</strong> ' + esc(msg) + (tail ? ' ' + esc(tail) : '') + '</p>';
}
function setPanelUnavail(el, code, extra){
  if(!el) return;
  el.innerHTML = panelUnavail(code, extra);
}
function updatePanelFooter(){
  $('panelStatus').textContent = panelPending > 0 ? panelPending + ' panel(s) loading\u2026' : '';
  if(panelPending === 0 && state.data){
    $('lastUpdate').textContent = 'UPDATED ' + new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})
      + ' \u00B7 TZ ' + (state.data.timezone_abbreviation || '');
  }
}

// ---------- sparklines ----------
function sparklineDomain(nums, opts){
  opts = opts || {};
  const dataMin = Math.min(...nums), dataMax = Math.max(...nums);
  if(opts.domain){
    return { min: opts.domain.min, max: opts.domain.max };
  }
  let min = dataMin, max = dataMax;
  const minSpan = opts.minSpan ?? 0;
  if(minSpan && max - min < minSpan){
    const mid = (min + max) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  return { min, max };
}
function sparkline(values, w, h, opts){
  opts = opts || {};
  if(!values.length) return '';
  const { min, max } = sparklineDomain(values, opts);
  const span = max - min || 1;
  const yOf = v => h - 2 - ((v - min) / span) * (h - 4);
  let bands = '';
  (opts.refLines || []).forEach(rl => {
    if(rl.value < min || rl.value > max) return;
    const y = yOf(rl.value).toFixed(1);
    bands += '<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y
      + '" stroke="currentColor" stroke-opacity=".18" stroke-dasharray="2,3" vector-effect="non-scaling-stroke"/>';
  });
  const pts = values.map((v, i) => {
    const x = values.length < 2 ? w / 2 : (i / (values.length - 1)) * w;
    return x.toFixed(1) + ',' + yOf(v).toFixed(1);
  }).join(' ');
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"' + (opts.title ? ' aria-label="' + esc(opts.title) + '"' : '') + '>'
    + bands
    + '<polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>';
}
function sparklineCard(label, values, cls, unitSuffix, opts){
  opts = opts || {};
  const nums = values.filter(v => v != null && !isNaN(v)).map(Number);
  if(!nums.length) return '';
  const fmt = opts.fmt || (v => String(Math.round(v)));
  const u = unitSuffix || '';
  const dataMin = Math.min(...nums), dataMax = Math.max(...nums);
  const latest = nums[nums.length - 1];
  const rangeTxt = opts.rangeFmt
    ? opts.rangeFmt(dataMin, dataMax, latest, fmt, u)
    : (dataMin === dataMax ? (fmt(dataMin) + u) : (fmt(dataMin) + u + ' \u2013 ' + fmt(dataMax) + u));
  const left = opts.left || 'Older';
  const right = (opts.rightPrefix || 'Latest') + ' \u00B7 ' + (opts.rightTail != null ? opts.rightTail : (fmt(latest) + u));
  const cat = opts.catFn ? opts.catFn(latest) : '';
  const catCls = opts.catClsFn ? opts.catClsFn(latest) : (cat ? cat.replace(/\s+/g, '-') : '');
  const catHtml = cat ? ' <span class="trend-cat ' + esc(catCls) + '">' + esc(cat) + '</span>' : '';
  const hint = opts.hint ? '<div class="trend-hint">' + esc(opts.hint) + '</div>' : '';
  return '<div class="trend ' + cls + '"' + (opts.title ? ' title="' + esc(opts.title) + '"' : '') + '>'
    + '<div class="trend-head"><div class="lbl">' + esc(label) + catHtml + '</div>'
    + '<div class="trend-range">' + esc(rangeTxt) + '</div></div>'
    + sparkline(nums, 100, 28, opts)
    + '<div class="trend-foot"><span>' + esc(left) + '</span><span>' + esc(right) + '</span></div>'
    + hint
    + '</div>';
}

// ---------- helpers ----------
const WMO = {
  0:['Clear','\u2600\uFE0F'],1:['Mostly clear','\uD83C\uDF24\uFE0F'],2:['Partly cloudy','\u26C5'],3:['Overcast','\u2601\uFE0F'],
  45:['Fog','\uD83C\uDF2B\uFE0F'],48:['Rime fog','\uD83C\uDF2B\uFE0F'],
  51:['Light drizzle','\uD83C\uDF26\uFE0F'],53:['Drizzle','\uD83C\uDF26\uFE0F'],55:['Heavy drizzle','\uD83C\uDF27\uFE0F'],
  56:['Freezing drizzle','\uD83C\uDF27\uFE0F'],57:['Freezing drizzle','\uD83C\uDF27\uFE0F'],
  61:['Light rain','\uD83C\uDF26\uFE0F'],63:['Rain','\uD83C\uDF27\uFE0F'],65:['Heavy rain','\uD83C\uDF27\uFE0F'],
  66:['Freezing rain','\uD83C\uDF27\uFE0F'],67:['Freezing rain','\uD83C\uDF27\uFE0F'],
  71:['Light snow','\uD83C\uDF28\uFE0F'],73:['Snow','\uD83C\uDF28\uFE0F'],75:['Heavy snow','\u2744\uFE0F'],77:['Snow grains','\u2744\uFE0F'],
  80:['Light showers','\uD83C\uDF26\uFE0F'],81:['Showers','\uD83C\uDF27\uFE0F'],82:['Violent showers','\u26C8\uFE0F'],
  85:['Snow showers','\uD83C\uDF28\uFE0F'],86:['Snow showers','\u2744\uFE0F'],
  95:['Thunderstorm','\u26C8\uFE0F'],96:['T-storm w/ hail','\u26C8\uFE0F'],99:['T-storm w/ hail','\u26C8\uFE0F']
};
const wmo = (c, isDay) => {
  const entry = WMO[c] || ['—','\u2601\uFE0F'];
  if(isDay === 0 || isDay === false){
    if(c === 0) return ['Clear', '\uD83C\uDF19'];
    if(c === 1) return ['Mostly clear', '\uD83C\uDF19'];
    if(c === 2) return ['Partly cloudy', '\u2601\uFE0F'];
  }
  return entry;
};
const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const compass = d => COMPASS[Math.round(d/22.5) % 16];
const RAD = Math.PI / 180;
function windCompassHtml(degFrom, size){
  if(degFrom == null || isNaN(degFrom)) return '';
  const flow = (degFrom + 180) % 360;
  const sz = size || 32;
  return '<svg class="dir-icon wind-dir" viewBox="0 0 32 32" width="' + sz + '" height="' + sz + '" aria-hidden="true">'
    + '<circle class="wc-fill" cx="16" cy="16" r="13.5" stroke="currentColor" stroke-width="1.25"/>'
    + '<text x="16" y="7.5" text-anchor="middle" font-size="4.5" font-weight="600" fill="currentColor" opacity=".7">N</text>'
    + '<g transform="rotate(' + flow + ' 16 16)"><path d="M16 7 L19.5 21 L16 17.5 L12.5 21 Z" fill="currentColor"/></g>'
    + '</svg>';
}
function sunPosition(date, lat, lon){
  const EOBL = RAD * 23.4397;
  const toD = dt => dt / 86400000 - 0.5 + 2440588 - 2451545;
  const rasc = (l, b) => Math.atan2(Math.sin(l) * Math.cos(EOBL) - Math.tan(b) * Math.sin(EOBL), Math.cos(l));
  const decl = (l, b) => Math.asin(Math.sin(b) * Math.cos(EOBL) + Math.cos(b) * Math.sin(EOBL) * Math.sin(l));
  const sidereal = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
  const d = toD(date);
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const sc = { ra: rasc(L, 0), dec: decl(L, 0) };
  const lw = RAD * -lon, phi = RAD * lat;
  const H = sidereal(d, lw) - sc.ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(sc.dec) + Math.cos(phi) * Math.cos(sc.dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(sc.dec) * Math.cos(phi));
  return { alt: alt / RAD, az: (az / RAD + 180) % 360 };
}
let sunArcSr = null, sunArcSs = null, sunArcTz = null, sunArcTimer = null;
function nowMinsInTz(tz){
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour:'numeric', minute:'numeric', hour12:false
  }).formatToParts(new Date());
  let h = 0, m = 0;
  for(const p of parts){
    if(p.type === 'hour') h = (+p.value) % 24;
    if(p.type === 'minute') m = +p.value;
  }
  return h * 60 + m;
}
function todayKeyInTz(tz){
  return new Date().toLocaleDateString('en-CA', {
    timeZone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone
  });
}
function forecastDayKey(iso){
  return iso ? String(iso).slice(0, 10) : '';
}
function forecastWallMins(iso){
  if(!iso || iso.length < 13) return 0;
  return (+iso.slice(11, 13)) * 60 + (+(iso.slice(14, 16) || 0));
}
function forecastHour(iso){
  if(!iso || iso.length < 13) return 0;
  return +iso.slice(11, 13);
}
function dayDiffKeys(fromKey, toKey){
  if(!fromKey || !toKey || fromKey === toKey) return 0;
  const [y1, m1, d1] = fromKey.split('-').map(Number);
  const [y2, m2, d2] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function dateKeyAddDays(key, delta){
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
function isForecastToday(dateStr, tz){
  return forecastDayKey(dateStr) === todayKeyInTz(tz);
}
function nowPctInDayTimeline(indices, hh, tz){
  if(!indices.length) return null;
  const nowM = nowMinsInTz(tz);
  const firstM = forecastWallMins(hh.time[indices[0]]);
  const lastM = forecastWallMins(hh.time[indices[indices.length - 1]]) + 60;
  const span = lastM - firstM;
  if(span <= 0) return null;
  return Math.max(0, Math.min(100, ((nowM - firstM) / span) * 100));
}
function dayLabelFromDate(dateStr, tz){
  const diff = dayDiffKeys(todayKeyInTz(tz), forecastDayKey(dateStr));
  if(diff === 0) return 'Today';
  if(diff === 1) return 'Tomorrow';
  return fmtDayWeekday(dateStr);
}
function fmtSunDuration(mins){
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60), r = m % 60;
  if(h && r) return h + 'h ' + r + 'm';
  if(h) return h + 'h';
  return r + 'm';
}
function placeSunArc(){
  if(!sunArcSr || !sunArcSs) return;
  const srM = minsOfDay(sunArcSr);
  const ssM = minsOfDay(sunArcSs);
  const tz = sunArcTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nowM = nowMinsInTz(tz);
  const night = nowM < srM || nowM >= ssM;
  const span = Math.max(1, ssM - srM);
  const t = night ? (nowM < srM ? 0 : 1) : Math.min(1, Math.max(0, (nowM - srM) / span));
  const a = Math.PI * (1 - t);
  const x = 320 + 260 * Math.cos(a);
  const y = 150 - 130 * Math.sin(a);
  const dot = $('sunDot');
  const trail = $('sunTrail');
  const meta = $('sunArcMeta');
  if(!dot || !trail) return;
  dot.setAttribute('cx', x.toFixed(1));
  dot.setAttribute('cy', y.toFixed(1));
  dot.setAttribute('opacity', night ? '0.25' : '1');
  if(!night && t > 0.005){
    trail.setAttribute('d', 'M 60 150 A 260 130 0 0 1 ' + x.toFixed(1) + ' ' + y.toFixed(1));
  }else{
    trail.setAttribute('d', '');
  }
  if(meta){
    if(night){
      meta.textContent = nowM < srM
        ? fmtSunDuration(srM - nowM) + ' until sunrise'
        : 'Sun has set';
    }else{
      const pct = Math.round(t * 100);
      meta.textContent = pct + '% along today\u2019s arc \u00B7 ' + fmtSunDuration(ssM - nowM) + ' until sunset';
    }
  }
}
function renderSunArc(sr, ss, tz){
  sunArcSr = sr;
  sunArcSs = ss;
  sunArcTz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('sunArcTimes').innerHTML = '<span>Sunrise <b>' + hm(sr) + '</b></span><span>Sunset <b>' + hm(ss) + '</b></span>';
  placeSunArc();
  if(sunArcTimer) clearInterval(sunArcTimer);
  sunArcTimer = setInterval(placeSunArc, 30000);
}
function sunCompassHtml(az, alt, size){
  const sz = size || 56;
  const cx = sz / 2, cy = sz / 2, R = sz / 2 - 5;
  const azR = az * RAD;
  const altUp = Math.max(0, alt);
  const r = R * (1 - altUp / 90);
  const sx = cx + r * Math.sin(azR);
  const sy = cy - r * Math.cos(azR);
  const sunR = alt > 0 ? 5 : 3.5;
  const warm = cssVar('--warm') || '#F0A028';
  const sunFill = alt > 0 ? warm : 'var(--dim)';
  return '<svg class="dir-icon sun-dir" viewBox="0 0 ' + sz + ' ' + sz + '" width="' + sz + '" height="' + sz + '" aria-hidden="true">'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="currentColor" stroke-width="1.25" opacity=".35"/>'
    + '<line x1="' + (cx - R) + '" y1="' + cy + '" x2="' + (cx + R) + '" y2="' + cy + '" stroke="currentColor" stroke-width="1" opacity=".2"/>'
    + '<text x="' + cx + '" y="8" text-anchor="middle" font-size="6" font-weight="600" fill="currentColor" opacity=".65">N</text>'
    + (alt > 0 ? '<circle cx="' + sx + '" cy="' + sy + '" r="8" fill="none" stroke="' + warm + '" stroke-width="1" opacity=".4"/>' : '')
    + '<circle cx="' + sx + '" cy="' + sy + '" r="' + sunR + '" fill="' + sunFill + '" stroke="currentColor" stroke-width="1"/>'
    + '</svg>';
}
function moonCompassHtml(az, alt, size){
  const sz = size || 48;
  const cx = sz / 2, cy = sz / 2, R = sz / 2 - 5;
  const azR = az * RAD;
  const altUp = Math.max(0, alt);
  const r = R * (1 - altUp / 90);
  const sx = cx + r * Math.sin(azR);
  const sy = cy - r * Math.cos(azR);
  const dotR = alt > 0 ? 4.5 : 3;
  return '<svg class="dir-icon moon-dir" viewBox="0 0 ' + sz + ' ' + sz + '" width="' + sz + '" height="' + sz + '" aria-hidden="true">'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="currentColor" stroke-width="1.25" opacity=".35"/>'
    + '<text x="' + cx + '" y="8" text-anchor="middle" font-size="6" font-weight="600" fill="currentColor" opacity=".65">N</text>'
    + (alt > 0 ? '<circle cx="' + sx + '" cy="' + sy + '" r="7" fill="none" stroke="var(--mut)" stroke-width="1" opacity=".5"/>' : '')
    + '<circle cx="' + sx + '" cy="' + sy + '" r="' + dotR + '" fill="var(--mut)" stroke="currentColor" stroke-width="1"/>'
    + '</svg>';
}
const degSym = () => state.units === 'F' ? '\u00B0F' : '\u00B0C';
const windUnit = () => state.units === 'F' ? 'mph' : 'km/h';
const uvCat = u => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very High' : 'Extreme';
const CAPE_SCALE_MAX = 2500;
const capeCat = c => c < 300 ? 'stable' : c < 1000 ? 'marginal' : c < 2500 ? 'unstable' : 'very unstable';
function capeCatCls(c){ return capeCat(c ?? 0).replace(/\s+/g, '-'); }

// parse "2026-07-04T14:00" as wall time components (no tz conversion)
function hm(iso){
  const [h,m] = iso.slice(11,16).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + String(m).padStart(2,'0') + ' ' + ap;
}
function hourLabel(iso){
  const h = Number(iso.slice(11,13));
  const ap = h >= 12 ? 'PM' : 'AM';
  return (h % 12 === 0 ? 12 : h % 12) + ' ' + ap;
}
function hourLabelCompact(iso){
  const h = Number(iso.slice(11,13));
  const suffix = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + suffix;
}
const minsOfDay = iso => {
  if(!iso || typeof iso !== 'string' || iso.length < 16) return 0;
  return Number(iso.slice(11,13))*60 + Number(iso.slice(14,16));
};
function shiftMins(iso, delta){ // returns minutes-of-day clamped 0..1439
  return Math.max(0, Math.min(1439, minsOfDay(iso) + delta));
}
const fmtMins = m => {
  let h = Math.floor(m/60), mm = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return h + ':' + String(mm).padStart(2,'0') + ' ' + ap;
};
function sunAltAt(lat, lon, date){
  return sunPosition(date, lat, lon).alt;
}
function timeAtSunAlt(lat, lon, date, targetAlt, rising, timezone){
  // Search the local calendar day (location TZ when provided), not "24h from now".
  const base = timezone ? locDayStart(timezone) : (() => {
    const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
  })();
  let lo = 0, hi = 24 * 60;
  for(let i = 0; i < 28; i++){
    const mid = (lo + hi) / 2;
    const t = new Date(base.getTime() + mid * 60000);
    const alt = sunAltAt(lat, lon, t);
    if((rising && alt < targetAlt) || (!rising && alt > targetAlt)) lo = mid;
    else hi = mid;
  }
  return new Date(base.getTime() + hi * 60000).toLocaleTimeString([], {
    hour:'numeric', minute:'2-digit', timeZone: timezone || undefined
  });
}
function twilightTimes(lat, lon, date, timezone){
  return {
    civilDawn: timeAtSunAlt(lat, lon, date, -6, true, timezone),
    civilDusk: timeAtSunAlt(lat, lon, date, -6, false, timezone),
    nauticalDawn: timeAtSunAlt(lat, lon, date, -12, true, timezone),
    nauticalDusk: timeAtSunAlt(lat, lon, date, -12, false, timezone),
    astroDawn: timeAtSunAlt(lat, lon, date, -18, true, timezone),
    astroDusk: timeAtSunAlt(lat, lon, date, -18, false, timezone)
  };
}
function estimateSkyDarkness(moonFrac, cloudPct, sunAlt){
  if(sunAlt > -6) return { label: 'Daylight / twilight', cls: 'mid', detail: 'Too bright for deep-sky observing.' };
  let score = 8;
  if(moonFrac > 0.85) score -= 3;
  else if(moonFrac > 0.45) score -= 2;
  else if(moonFrac > 0.15) score -= 1;
  if(cloudPct > 70) score -= 2;
  else if(cloudPct > 35) score -= 1;
  score = Math.max(1, Math.min(9, score));
  const labels = ['', 'Excellent dark sky', 'Very dark', 'Rural dark', 'Suburban dark', 'Moderate light', 'Bright skyglow', 'Urban skyglow', 'Very bright', 'Day-bright'];
  return {
    label: 'Bortle ~' + score,
    cls: score <= 4 ? 'good' : score <= 6 ? 'mid' : 'warn',
    detail: labels[score] + ' — moon ' + Math.round(moonFrac * 100) + '% lit, clouds ' + Math.round(cloudPct) + '%.'
  };
}
const dayName = iso => new Date(iso + 'T12:00:00').toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'});
function esc(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function nwsPointForecastUrl(loc){
  if(!loc) return 'https://forecast.weather.gov/';
  return 'https://forecast.weather.gov/MapClick.php?lat=' + Number(loc.lat).toFixed(4) + '&lon=' + Number(loc.lon).toFixed(4);
}
function nwsSkywarnUrl(cwa){
  return cwa
    ? 'https://www.weather.gov/' + String(cwa).toLowerCase() + '/skywarn'
    : 'https://www.weather.gov/skywarn/';
}
function cssColor(v){
  const s = String(v || '').trim();
  return /^#[0-9A-Fa-f]{3,8}$/.test(s) ? s : '';
}

// ---------- location chips ----------
let locMoreOpen = false;

function closeLocMore(){
  locMoreOpen = false;
  const panel = $('locMorePanel');
  const btn = $('locMoreBtn');
  if(panel) panel.hidden = true;
  if(btn) btn.setAttribute('aria-expanded', 'false');
  syncChromeHeight();
}

function toggleLocMore(){
  locMoreOpen = !locMoreOpen;
  const panel = $('locMorePanel');
  const btn = $('locMoreBtn');
  if(panel) panel.hidden = !locMoreOpen;
  if(btn) btn.setAttribute('aria-expanded', String(locMoreOpen));
  syncChromeHeight();
}

function createLocationChip(loc, i){
  const chip = document.createElement('div');
  chip.className = 'chip' + (i === state.active ? ' active' : '');
  const nameBtn = document.createElement('button');
  nameBtn.className = 'name';
  nameBtn.textContent = loc.name + (loc.admin1 ? ', ' + shortAdmin(loc.admin1) : '');
  nameBtn.onclick = () => {
    state.active = i;
    persist();
    closeLocMore();
    renderChips();
    loadAll();
  };
  chip.appendChild(nameBtn);
  if(state.locations.length > 1){
    const rm = document.createElement('button');
    rm.className = 'rm'; rm.textContent = '\u00D7'; rm.title = 'Remove';
    rm.onclick = e => {
      e.stopPropagation();
      const wasActive = i === state.active;
      state.locations.splice(i, 1);
      if(state.active >= state.locations.length) state.active = state.locations.length - 1;
      else if(i < state.active) state.active--;
      if(wasActive) closeLocMore();
      persist(); renderChips(); loadAll();
    };
    chip.appendChild(rm);
  }
  return chip;
}

function renderChips(){
  const chips = $('locbarChips');
  const panel = $('locMorePanel');
  const moreBtn = $('locMoreBtn');
  if(!chips || !panel) return;

  chips.querySelectorAll('.chip').forEach(c => c.remove());
  panel.innerHTML = '';

  const active = state.locations[state.active];
  if(active){
    chips.insertBefore(createLocationChip(active, state.active), moreBtn);
  }

  const others = state.locations.map((loc, i) => ({ loc, i })).filter(x => x.i !== state.active);
  if(others.length && moreBtn){
    moreBtn.hidden = false;
    moreBtn.textContent = others.length === 1 ? '1 more' : others.length + ' more';
    others.forEach(({ loc, i }) => panel.appendChild(createLocationChip(loc, i)));
    panel.hidden = !locMoreOpen;
    moreBtn.setAttribute('aria-expanded', String(locMoreOpen));
  } else {
    closeLocMore();
    if(moreBtn) moreBtn.hidden = true;
  }

  syncChromeHeight();
}
const US_STATES = {'Michigan':'MI','Illinois':'IL','Wisconsin':'WI','Indiana':'IN','Ohio':'OH','Minnesota':'MN','California':'CA','New York':'NY','Florida':'FL','Texas':'TX','Colorado':'CO','Arizona':'AZ','Washington':'WA','Oregon':'OR'};
const shortAdmin = a => US_STATES[a] || a;
function persist(){
  store.set('st_locs', state.locations);
  store.set('st_active', state.active);
  store.set('st_units', state.units);
  syncUrl();
}

// ---------- geocoding search ----------
let searchTimer = null;

function searchEdgePad(){
  return window.matchMedia('(max-width:520px)').matches ? 14 : 20;
}

function positionSearchResults(){
  const box = $('searchResults');
  const input = $('searchInput');
  if(!box || !input || box.style.display === 'none') return;
  if(!isMobileTabLayout()){
    box.classList.remove('search-results-fixed');
    box.style.top = box.style.left = box.style.right = box.style.width = '';
    return;
  }
  const pad = searchEdgePad();
  const r = input.getBoundingClientRect();
  box.classList.add('search-results-fixed');
  box.style.left = pad + 'px';
  box.style.right = pad + 'px';
  box.style.width = 'auto';
  box.style.top = Math.round(r.bottom + 6) + 'px';
}

function openSearchResults(){
  const box = $('searchResults');
  if(!box) return;
  box.style.display = 'block';
  positionSearchResults();
}

function hideSearchResults(){
  const box = $('searchResults');
  if(!box) return;
  box.style.display = 'none';
  box.classList.remove('search-results-fixed');
}

$('searchInput').addEventListener('input', e => {
  closeLocMore();
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if(q.length < 2){ hideSearchResults(); return; }
  searchTimer = setTimeout(() => geocode(q), 350);
});
$('searchInput').addEventListener('focus', positionSearchResults);
document.addEventListener('click', e => {
  if(!e.target.closest('.search')) hideSearchResults();
  if(locMoreOpen && !e.target.closest('#locMorePanel') && !e.target.closest('#locMoreBtn')) closeLocMore();
});
$('locMoreBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleLocMore();
});
function addLocation(loc){
  // if it's essentially an existing saved location, just switch to it
  const existing = state.locations.findIndex(l =>
    Math.abs(l.lat - loc.lat) < 0.02 && Math.abs(l.lon - loc.lon) < 0.02);
  state.active = existing >= 0 ? existing : (state.locations.push(loc) - 1);
  persist();
  $('searchInput').value = '';
  hideSearchResults();
  renderChips(); loadAll();
}
function resultButton(label, sub, loc){
  const b = document.createElement('button');
  b.innerHTML = esc(label) + (sub ? ' <span class="sub">' + esc(sub) + '</span>' : '');
  b.onclick = () => addLocation(loc);
  return b;
}
function searchNote(msg){
  const box = $('searchResults');
  if(!box.querySelector('button')){
    box.innerHTML = '<div class="note">' + esc(msg) + '</div>';
  }
  openSearchResults();
}
async function geocode(q){
  const box = $('searchResults');
  box.innerHTML = '';
  // direct coordinate entry: "42.97, -85.95" — works even if search is unreachable
  const m = q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(m){
    const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
    if(Math.abs(lat) <= 90 && Math.abs(lon) <= 180){
      box.appendChild(resultButton('Use coordinates', lat.toFixed(4) + ', ' + lon.toFixed(4),
        { name: lat.toFixed(2) + ', ' + lon.toFixed(2), admin1: '', country: '', lat, lon }));
      openSearchResults();
    }
  }
  try{
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=' + encodeURIComponent(q));
    if(!r.ok) throw new Error('geocode HTTP ' + r.status);
    const j = await r.json();
    (j.results || []).forEach(res => {
      box.appendChild(resultButton(res.name,
        [res.admin1, res.country_code].filter(Boolean).join(' \u00B7 '),
        { name: res.name, admin1: res.admin1 || '', country: res.country_code || '',
          lat: res.latitude, lon: res.longitude }));
    });
    if(!box.querySelector('button')){
      searchNote('NO MATCHES \u2014 TRY A LARGER NEARBY TOWN OR ENTER "LAT, LON"');
    } else {
      openSearchResults();
    }
  }catch(e){
    console.error('geocode', e);
    searchNote('SEARCH UNREACHABLE HERE \u2014 ENTER COORDINATES AS "LAT, LON" INSTEAD');
  }
}
$('searchInput').addEventListener('keydown', e => {
  if(e.key === 'Enter'){
    clearTimeout(searchTimer);
    const first = $('searchResults').querySelector('button');
    if(first){ first.click(); }
    else { geocode(e.target.value.trim()); }
  } else if(e.key === 'Escape'){
    hideSearchResults();
  }
});

// ---------- geolocation (auto on first visit, on open, or via geo button) ----------
const GEO_MAX_AUTO_ACCURACY_MI = 20;
const GEO_MAX_MANUAL_ACCURACY_MI = 50;
const GEO_TELEPORT_REJECT_MI = 350;
const GEO_MANUAL_TRUST_MI = 5;
let lastGeoRejectReason = '';
function geoAccuracyMi(pos){
  const m = pos?.accuracy;
  return m != null && !isNaN(m) ? m / 1609.344 : null;
}
function isCentralAmericaIpBand(lat, lon){
  return lat < 17 && lon > -125 && lon < -65;
}
function userContextSuggestsUS(prevLoc){
  try{
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if(/^America\//.test(tz)) return true;
    const lang = (navigator.language || '').toLowerCase();
    if(/^en(-us)?$/.test(lang)) return true;
  }catch(e){}
  if(prevLoc){
    const cc = (prevLoc.country || '').toUpperCase();
    if(cc === 'US' || cc === 'CA') return true;
    if(isLikelyUS(prevLoc)) return true;
  }
  return false;
}
function geoNameSuggestsCentralAmerica(geo){
  const n = String(geo?.name || '').toLowerCase();
  return /san salvador|guatemala city|guatemala|tegucigalpa|managua|belize|san pedro sula|el salvador/.test(n);
}
function geoLikelySpuriousDesktopFix(lat, lon, prevLoc){
  if(!isCentralAmericaIpBand(lat, lon)) return false;
  return userContextSuggestsUS(prevLoc);
}
function geoBrowserNote(){
  if(!/Firefox\//i.test(navigator.userAgent)) return '';
  return ' Firefox often reports wrong desktop locations (WiFi/IP database) — search is most reliable.';
}
function geoRejectReason(pos, prevLoc, newGeo, opts){
  const accMi = geoAccuracyMi(pos);
  const spurious = geoLikelySpuriousDesktopFix(pos.lat, pos.lon, prevLoc)
    || (geoNameSuggestsCentralAmerica(newGeo) && userContextSuggestsUS(prevLoc));
  if(spurious){
    if(opts?.manual){
      return 'Browser placed you in Central America (likely wrong IP location on desktop). Search for your city instead.'
        + geoBrowserNote();
    }
    return 'Ignored coarse location fix in Central America';
  }
  if(accMi != null && accMi > (opts?.manual ? GEO_MAX_MANUAL_ACCURACY_MI : GEO_MAX_AUTO_ACCURACY_MI)){
    return 'Location fix too coarse (' + Math.round(accMi) + ' mi) — use search on desktop';
  }
  if(prevLoc){
    const dist = haversineMi(prevLoc.lat, prevLoc.lon, pos.lat, pos.lon);
    const prevUS = prevLoc.country === 'US' || (isLikelyUS(prevLoc) && !prevLoc.country);
    const newCC = (newGeo?.country || '').toUpperCase();
    if(dist > GEO_TELEPORT_REJECT_MI && (accMi == null || accMi > 12)){
      return 'Ignored implausible jump (' + Math.round(dist) + ' mi away)';
    }
    if(prevUS && newCC && newCC !== 'US' && newCC !== 'CA' && (accMi == null || accMi > GEO_MANUAL_TRUST_MI)){
      return 'Ignored overseas fix while your saved location is in the US — use search if you traveled';
    }
  }
  return 'Location unavailable — use search or "lat, lon"';
}
function acceptGeoUpdate(pos, prevLoc, newGeo, opts){
  lastGeoRejectReason = '';
  if(!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return false;
  const accMi = geoAccuracyMi(pos);
  const spurious = geoLikelySpuriousDesktopFix(pos.lat, pos.lon, prevLoc)
    || (geoNameSuggestsCentralAmerica(newGeo) && userContextSuggestsUS(prevLoc));
  const prevUS = prevLoc && (prevLoc.country === 'US' || (isLikelyUS(prevLoc) && !prevLoc.country));
  const newCC = (newGeo?.country || '').toUpperCase();
  const nonUS = newCC && newCC !== 'US' && newCC !== 'CA';
  const highTrust = accMi != null && accMi <= GEO_MANUAL_TRUST_MI;

  if(spurious){
    if(opts?.manual){
      if(!highTrust){
        lastGeoRejectReason = geoRejectReason(pos, prevLoc, newGeo, opts);
        return false;
      }
    }else{
      lastGeoRejectReason = geoRejectReason(pos, prevLoc, newGeo, opts);
      return false;
    }
  }
  if(opts?.manual){
    if(accMi != null && accMi > GEO_MAX_MANUAL_ACCURACY_MI){
      lastGeoRejectReason = geoRejectReason(pos, prevLoc, newGeo, opts);
      return false;
    }
    if(prevLoc && prevUS && nonUS){
      const dist = haversineMi(prevLoc.lat, prevLoc.lon, pos.lat, pos.lon);
      if(dist > 200 && !highTrust){
        lastGeoRejectReason = geoRejectReason(pos, prevLoc, newGeo, opts);
        return false;
      }
    }
    return true;
  }
  if(accMi != null && accMi > GEO_MAX_AUTO_ACCURACY_MI) return false;
  if(prevLoc){
    const dist = haversineMi(prevLoc.lat, prevLoc.lon, pos.lat, pos.lon);
    if(dist > GEO_TELEPORT_REJECT_MI && (accMi == null || accMi > 12)) return false;
    if(prevUS && nonUS && (accMi == null || accMi > GEO_MANUAL_TRUST_MI)) return false;
  }
  return true;
}
function migrateBadGeoLocations(){
  if(store.get('st_geo_ca_purge')) return;
  store.set('st_geo_ca_purge', true);
  if(!state.locations?.length) return;
  const anchor = state.locations[state.active] || state.locations[0];
  if(!userContextSuggestsUS(anchor) && !userContextSuggestsUS(DEFAULT_LOC)) return;
  const filtered = state.locations.filter(loc => {
    if(geoNameSuggestsCentralAmerica(loc)) return false;
    if(!isCentralAmericaIpBand(loc.lat, loc.lon)) return true;
    const cc = (loc.country || '').toUpperCase();
    return cc === 'US' || cc === 'CA';
  });
  if(filtered.length === state.locations.length) return;
  state.locations = filtered.length ? filtered : [DEFAULT_LOC];
  if(state.active >= state.locations.length) state.active = 0;
  persist();
}
async function reverseGeocodeLoc(lat, lon){
  let name = lat.toFixed(2) + ', ' + lon.toFixed(2), admin1 = '', country = '';
  try{
    const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='
      + lat + '&longitude=' + lon + '&localityLanguage=en');
    const j = await r.json();
    name = j.city || j.locality || name;
    admin1 = j.principalSubdivision || '';
    country = j.countryCode || '';
  }catch(e){ /* coords as name */ }
  return { name, admin1, country, lat, lon };
}
function getCurrentPositionFast(opts){
  const o = typeof opts === 'number' ? { maximumAge: opts } : (opts || {});
  return new Promise(resolve => {
    if(!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      {
        enableHighAccuracy: !!o.highAccuracy,
        timeout: o.timeout ?? 9000,
        maximumAge: o.maximumAge ?? 120000
      }
    );
  });
}
let locToastTimer = 0;
function showLocToast(msg){
  const box = $('locToast');
  if(!box || !msg) return;
  box.textContent = msg;
  box.hidden = false;
  box.classList.add('show');
  clearTimeout(locToastTimer);
  locToastTimer = setTimeout(() => {
    box.classList.remove('show');
    box.textContent = '';
    box.hidden = true;
  }, 4200);
}
async function syncLocationOnOpen(opts){
  if(urlLocPinned && !opts?.force) return false;
  const loc = state.locations[state.active];
  if(!loc || !navigator.geolocation) return false;
  try{
    if(navigator.permissions){
      const st = await navigator.permissions.query({ name: 'geolocation' });
      if(st.state === 'denied') return false;
    }
  }catch(e){}
  const desktop = !window.matchMedia('(max-width:860px)').matches;
  const pos = await getCurrentPositionFast({
    maximumAge: desktop ? 90000 : (opts?.maximumAge ?? 180000),
    highAccuracy: false,
    timeout: desktop ? 7000 : 9000
  });
  if(!pos) return false;
  const dist = haversineMi(loc.lat, loc.lon, pos.lat, pos.lon);
  if(dist < LOC_SYNC_MIN_MI) return false;
  const updated = await reverseGeocodeLoc(pos.lat, pos.lon);
  if(!acceptGeoUpdate(pos, loc, updated, opts)) return false;
  const idx = state.active;
  state.locations[idx] = Object.assign({}, loc, updated);
  persist();
  renderChips();
  syncUrl();
  showLocToast('Location updated to ' + updated.name);
  refreshWeatherSoft();
  return true;
}
function detectUserLocation(opts){
  return new Promise(resolve => {
    if(!navigator.geolocation) return resolve({ geo: null, reason: 'Geolocation not supported' });
    navigator.geolocation.getCurrentPosition(async pos => {
      const posObj = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
      const prev = state.locations[state.active];
      const geo = await reverseGeocodeLoc(posObj.lat, posObj.lon);
      if(!acceptGeoUpdate(posObj, prev, geo, opts)){
        return resolve({ geo: null, reason: lastGeoRejectReason || geoRejectReason(posObj, prev, geo, opts) });
      }
      resolve({ geo, reason: '' });
    }, () => resolve({ geo: null, reason: 'Location permission denied or timed out' }), {
      enableHighAccuracy: !!opts?.manual,
      timeout: opts?.manual ? 15000 : 10000,
      maximumAge: opts?.manual ? 0 : 300000
    });
  });
}
async function initFirstLocation(){
  if(savedLocs || parseUrlLoc()) return;
  $('nowCond').textContent = 'Detecting your location\u2026';
  const result = await detectUserLocation({ manual: false });
  if(result?.geo){
    state.locations = [result.geo];
    state.active = 0;
    persist();
    renderChips();
  }
}
$('geoBtn').addEventListener('click', async () => {
  const btn = $('geoBtn');
  if(!navigator.geolocation){
    searchNote('GEOLOCATION NOT SUPPORTED IN THIS BROWSER');
    return;
  }
  btn.textContent = '\u22EF';
  const result = await detectUserLocation({ manual: true });
  btn.textContent = '\uD83D\uDCCD';
  if(result?.geo) addLocation(result.geo);
  else{
    const msg = result?.reason || 'LOCATION UNAVAILABLE \u2014 USE SEARCH OR "LAT, LON"';
    showLocToast(msg);
    searchNote(msg.toUpperCase());
  }
});

// ---------- NWS + METAR + Open-Meteo merge ----------
function isLikelyUS(loc){
  if(loc.country === 'US') return true;
  if(loc.country && loc.country !== 'US') return false;
  return loc.lat >= 18 && loc.lat <= 72 && loc.lon >= -180 && loc.lon <= -60;
}
function defaultRadarMode(loc){
  return loc && isLikelyUS(loc) ? 'mrms' : 'rainviewer';
}
function nwsToWmo(text){
  const s = String(text || '').toLowerCase();
  if(/tornado|severe thunder/.test(s)) return 95;
  const isChance = /\b(chance|slight chance|isolated|scattered)\b/.test(s);
  if(/thunder/.test(s)) return isChance ? 80 : 95;
  if(/wintry mix|rain\/snow|snow\/rain|ice pellet/.test(s)) return 67;
  if(/freezing rain|sleet|wintry/.test(s)) return 67;
  if(/snow|blizzard|flurr/.test(s)) return s.includes('light') ? 71 : 73;
  if(/rain|shower|drizzle/.test(s)) return s.includes('light') || s.includes('chance') ? 61 : 63;
  if(/fog|mist|haze|smoke/.test(s)) return 45;
  if(/cloudy|overcast/.test(s)) return s.includes('part') ? 2 : 3;
  if(/mostly sunny|partly/.test(s)) return 2;
  if(/sunny|clear/.test(s)) return s.includes('mostly') ? 1 : 0;
  if(/wind/.test(s)) return 2;
  return 2;
}
function nwsForecastPair(text){
  const code = nwsToWmo(text);
  return WMO[code] || ['—','\u2601\uFE0F'];
}
function parseNwsWindMph(s){
  const m = String(s || '').match(/(\d+)\s*to\s*(\d+)|(\d+)/);
  if(!m) return 0;
  if(m[1] && m[2]) return Math.round((+m[1] + +m[2]) / 2);
  return +(m[3] || m[1] || 0);
}
const NWS_DIR = {N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315,NNE:22.5,ENE:67.5,ESE:112.5,SSE:157.5,SSW:202.5,WSW:247.5,WNW:292.5,NNW:337.5};
function nwsDirToDeg(s){ return NWS_DIR[String(s || '').toUpperCase()] ?? 0; }
function nwsTempToDisp(t, unit){
  if(t === null || t === undefined) return null;
  if(state.units === 'F') return unit === 'F' ? t : Math.round(t * 9/5 + 32);
  return unit === 'C' ? t : Math.round((t - 32) * 5/9);
}
function nwsVal(obj){
  if(!obj) return null;
  if(typeof obj === 'object' && 'value' in obj) return obj.value;
  return obj;
}
function nwsWindToMs(obj){
  const v = nwsVal(obj);
  if(v === null || v === undefined) return null;
  const uc = (obj && obj.unitCode) || '';
  if(uc.includes('km_h')) return v / 3.6;
  if(uc.includes('kn')) return v * 0.514444;
  return v;
}
function nwsWindToDisp(obj){
  const ms = nwsWindToMs(obj);
  return ms === null ? null : msToDisp(ms);
}
function fmtRh(rh){
  if(rh == null) return null;
  return Math.round(rh);
}
function rhDisp(rh){
  return rh == null ? '\u2014' : Math.round(rh);
}
function msToDisp(ms){
  if(ms === null || ms === undefined) return null;
  return state.units === 'F' ? Math.round(ms * 2.237) : Math.round(ms * 3.6);
}
function closestOmIndex(iso, omTimes){
  const t = new Date(iso).getTime();
  let best = 0, diff = Infinity;
  for(let i = 0; i < omTimes.length; i++){
    const d = Math.abs(new Date(omTimes[i]).getTime() - t);
    if(d < diff){ diff = d; best = i; }
  }
  return best;
}
function backfillNwsObsFields(latest, older){
  if(!latest) return null;
  const out = Object.assign({}, latest);
  ['windSpeed', 'windDirection', 'windGust'].forEach(field => {
    if(nwsVal(out[field]) != null) return;
    for(let i = 0; i < older.length; i++){
      const v = nwsVal(older[i][field]);
      if(v != null){ out[field] = older[i][field]; break; }
    }
  });
  return out;
}
async function fetchStationLatestObs(stationId){
  const or = await nwsFetch('https://api.weather.gov/stations/' + encodeURIComponent(stationId) + '/observations?limit=12');
  if(!or.ok) return null;
  const data = await or.json();
  const props = (data.features || [])
    .map(f => f.properties)
    .filter(p => p && p.timestamp);
  if(!props.length) return null;
  return backfillNwsObsFields(props[0], props.slice(1));
}
async function fetchMetarObs(pointsProps){
  const stationsUrl = pointsProps && pointsProps.observationStations;
  if(!stationsUrl) return null;
  const sr = await nwsFetch(stationsUrl);
  if(!sr.ok) return null;
  const stList = await sr.json();
  const stations = (stList.features || []).slice(0, 4);
  const tries = await Promise.all(stations.map(async station => {
    const id = station.properties.stationIdentifier || station.properties.stationId;
    if(!id) return null;
    const p = await fetchStationLatestObs(id);
    return p ? { id, props: p } : null;
  }));
  return tries.find(t => t) || null;
}
async function fetchNwsForecasts(loc, opts = {}){
  const includeMetar = opts.includeMetar !== false;
  const pr = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
  if(!pr.ok) throw new Error('NWS points HTTP ' + pr.status);
  const pts = await pr.json();
  const props = pts.properties;
  const [hr, fc, metar] = await Promise.all([
    nwsFetch(props.forecastHourly).then(r => r.ok ? r.json() : null),
    nwsFetch(props.forecast).then(r => r.ok ? r.json() : null),
    includeMetar ? fetchMetarObs(props) : Promise.resolve(null)
  ]);
  return {
    points: props,
    hourlyPeriods: hr ? hr.properties.periods : [],
    dailyPeriods: fc ? fc.properties.periods : [],
    metar
  };
}
async function fetchOpenMeteoBase(loc){
  const tempU = state.units === 'F' ? 'fahrenheit' : 'celsius';
  const windU = state.units === 'F' ? 'mph' : 'kmh';
  const precU = state.units === 'F' ? 'inch' : 'mm';
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + loc.lat + '&longitude=' + loc.lon
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
    + '&hourly=is_day,temperature_2m,dew_point_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,cape,freezing_level_height,wet_bulb_temperature_2m,boundary_layer_height,sunshine_duration,snow_depth,snowfall,soil_temperature_0cm,soil_moisture_0_to_1cm,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_80m,wind_direction_120m,wind_direction_180m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunshine_duration,daylight_duration,snowfall_sum,precipitation_sum'
    + '&temperature_unit=' + tempU + '&wind_speed_unit=' + windU + '&precipitation_unit=' + precU
    + '&timezone=auto&forecast_days=7';
  const r = await fetch(url);
  if(!r.ok) throw new Error('Open-Meteo HTTP ' + r.status);
  return r.json();
}
async function fetchOpenMeteoHrrr(loc){
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + loc.lat + '&longitude=' + loc.lon
    + '&hourly=cape,freezing_level_height,boundary_layer_height'
    + '&models=ncep_hrrr_conus&forecast_days=2&timezone=auto';
  const r = await fetch(url);
  if(!r.ok) return null;
  return r.json();
}
function nwsPeriodForOmIndex(periods, omTimes, oi){
  for(const p of periods){
    if(closestOmIndex(p.startTime, omTimes) === oi) return p;
  }
  return null;
}
function buildHourlyFromNws(periods, om){
  const omH = om.hourly;
  const i0 = nowIndex({ hourly: omH });
  const slots = HOURLY_HOURS + 1;
  const hourly = {
    time: [], temperature_2m: [], precipitation_probability: [], weather_code: [], is_day: [],
    wind_speed_10m: [], wind_direction_10m: [], shortForecast: [],
    dew_point_2m: [], pressure_msl: [], cape: [], wind_gusts_10m: [], cloud_cover: [], cloud_cover_low: [], cloud_cover_mid: [], cloud_cover_high: [],
    precipitation: [], visibility: [], uv_index: [], freezing_level_height: [],
    wet_bulb_temperature_2m: [], relative_humidity_2m: [],
    anchoredNow: true
  };
  for(let n = 0; n < slots; n++){
    const i = i0 + n;
    if(i >= omH.time.length) break;
    const p = nwsPeriodForOmIndex(periods, omH.time, i);
    hourly.time.push(omH.time[i]);
    hourly.temperature_2m.push(
      p ? nwsTempToDisp(p.temperature, p.temperatureUnit === 'C' ? 'C' : 'F') : omH.temperature_2m[i]
    );
    hourly.precipitation_probability.push(
      p ? (p.probabilityOfPrecipitation?.value ?? 0) : (omH.precipitation_probability[i] ?? 0)
    );
    hourly.weather_code.push(omH.weather_code[i]);
    hourly.is_day.push(omH.is_day[i] ?? 1);
    hourly.wind_speed_10m.push(p ? parseNwsWindMph(p.windSpeed) : omH.wind_speed_10m[i]);
    hourly.wind_direction_10m.push(p ? nwsDirToDeg(p.windDirection) : omH.wind_direction_10m[i]);
    hourly.shortForecast.push(p ? p.shortForecast : null);
    hourly.dew_point_2m.push(omH.dew_point_2m[i] ?? null);
    hourly.pressure_msl.push(omH.pressure_msl[i] ?? null);
    hourly.cape.push(omH.cape[i] ?? 0);
    hourly.wind_gusts_10m.push(omH.wind_gusts_10m?.[i] ?? 0);
    hourly.cloud_cover.push(omH.cloud_cover?.[i] ?? 0);
    hourly.cloud_cover_low.push(omH.cloud_cover_low[i] ?? 0);
    hourly.cloud_cover_mid.push(omH.cloud_cover_mid[i] ?? 0);
    hourly.cloud_cover_high.push(omH.cloud_cover_high[i] ?? 0);
    hourly.precipitation.push(omH.precipitation[i] ?? 0);
    hourly.visibility.push(omH.visibility[i] ?? 0);
    hourly.uv_index.push(omH.uv_index[i] ?? 0);
    hourly.freezing_level_height.push(omH.freezing_level_height[i] ?? 0);
    hourly.wet_bulb_temperature_2m.push(omH.wet_bulb_temperature_2m[i] ?? null);
    hourly.relative_humidity_2m.push(omH.relative_humidity_2m[i] ?? null);
  }
  return hourly;
}
function buildDailyFromNws(periods, omDaily){
  const days = [];
  for(let i = 0; i < periods.length && days.length < DAILY_DAYS; i++){
    const p = periods[i];
    if(!p.isDaytime) continue;
    const night = periods[i + 1];
    const date = p.startTime.slice(0, 10);
    const omIdx = omDaily.time.findIndex(t => t === date);
    const dayMax = nwsTempToDisp(p.temperature, p.temperatureUnit === 'C' ? 'C' : 'F');
    const dayMin = night && !night.isDaytime
      ? nwsTempToDisp(night.temperature, night.temperatureUnit === 'C' ? 'C' : 'F')
      : (omIdx >= 0 ? omDaily.temperature_2m_min[omIdx] : dayMax);
    days.push({
      time: date,
      temperature_2m_max: dayMax,
      temperature_2m_min: dayMin,
      weather_code: nwsToWmo(p.shortForecast),
      shortForecast: p.shortForecast,
      precipitation_probability_max: Math.max(
        p.probabilityOfPrecipitation?.value ?? 0,
        night && !night.isDaytime ? (night.probabilityOfPrecipitation?.value ?? 0) : 0
      ),
      wind_speed_10m_max: omIdx >= 0 ? (omDaily.wind_speed_10m_max[omIdx] ?? 0) : 0,
      wind_gusts_10m_max: omIdx >= 0 ? (omDaily.wind_gusts_10m_max[omIdx] ?? 0) : 0,
      uv_index_max: omIdx >= 0 ? (omDaily.uv_index_max[omIdx] ?? 0) : 0,
      sunrise: omIdx >= 0 ? omDaily.sunrise[omIdx] : omDaily.sunrise[0],
      sunset: omIdx >= 0 ? omDaily.sunset[omIdx] : omDaily.sunset[0],
      sunshine_duration: omIdx >= 0 ? (omDaily.sunshine_duration[omIdx] ?? 0) : 0,
      daylight_duration: omIdx >= 0 ? (omDaily.daylight_duration[omIdx] ?? 0) : 0
    });
  }
  return days;
}
function buildCurrentFromMetar(metar, om, nwsHourly){
  const p = metar.props;
  const tempC = nwsVal(p.temperature);
  const dewC = nwsVal(p.dewpoint);
  const windMs = nwsWindToMs(p.windSpeed);
  const gustMs = nwsWindToMs(p.windGust);
  const presPa = nwsVal(p.barometricPressure);
  const visM = nwsVal(p.visibility);
  const heatC = nwsVal(p.heatIndex);
  const chillC = nwsVal(p.windChill);
  const temp = tempC !== null ? (state.units === 'F' ? Math.round(tempC * 9/5 + 32) : Math.round(tempC)) : om.current.temperature_2m;
  let apparent = temp;
  if(heatC !== null) apparent = state.units === 'F' ? Math.round(heatC * 9/5 + 32) : Math.round(heatC);
  else if(chillC !== null) apparent = state.units === 'F' ? Math.round(chillC * 9/5 + 32) : Math.round(chillC);
  else if(om.current.apparent_temperature != null) apparent = Math.round(om.current.apparent_temperature);
  const hp = nwsHourly && nwsHourly[0];
  const [cond, icon] = hp ? nwsForecastPair(hp.shortForecast) : wmo(om.current.weather_code);
  return {
    time: p.timestamp || om.current.time,
    source: 'metar',
    station: metar.id,
    textDescription: p.textDescription || hp?.shortForecast || cond,
    temperature_2m: temp,
    apparent_temperature: apparent,
    relative_humidity_2m: fmtRh(nwsVal(p.relativeHumidity) ?? om.current.relative_humidity_2m),
    wind_speed_10m: windMs !== null ? msToDisp(windMs) : om.current.wind_speed_10m,
    wind_direction_10m: nwsVal(p.windDirection) ?? om.current.wind_direction_10m,
    wind_gusts_10m: gustMs !== null ? msToDisp(gustMs) : om.current.wind_gusts_10m,
    pressure_msl: presPa !== null ? presPa / 100 : om.current.pressure_msl,
    visibility_m: visM,
    weather_code: nwsToWmo(p.textDescription || hp?.shortForecast || ''),
    icon,
    condition: cond,
    dewpoint_c: dewC
  };
}
function mergeHrrrFields(om, hrrr){
  if(!hrrr || !hrrr.hourly) return;
  const ht = hrrr.hourly.time;
  om.hourly.time.forEach((t, i) => {
    const hi = closestOmIndex(t, ht);
    if(hrrr.hourly.cape[hi] !== undefined) om.hourly.cape[i] = hrrr.hourly.cape[hi];
    if(hrrr.hourly.freezing_level_height[hi] !== undefined) om.hourly.freezing_level_height[i] = hrrr.hourly.freezing_level_height[hi];
    if(hrrr.hourly.boundary_layer_height[hi] !== undefined) om.hourly.boundary_layer_height[i] = hrrr.hourly.boundary_layer_height[hi];
  });
}
function mergeWeatherData(loc, om, hrrr, nws){
  mergeHrrrFields(om, hrrr);
  const out = {
    timezone: om.timezone,
    timezone_abbreviation: om.timezone_abbreviation,
    om,
    nwsPoints: nws ? nws.points : null,
    metar: nws ? nws.metar : null,
    sources: { forecast: 'open-meteo', current: 'open-meteo' }
  };
  if(nws && nws.hourlyPeriods.length){
    out.sources.forecast = 'nws';
    out.hourly = buildHourlyFromNws(nws.hourlyPeriods, om);
    const dailyArr = buildDailyFromNws(nws.dailyPeriods, om.daily);
    out.daily = {
      time: dailyArr.map(d => d.time),
      temperature_2m_max: dailyArr.map(d => d.temperature_2m_max),
      temperature_2m_min: dailyArr.map(d => d.temperature_2m_min),
      weather_code: dailyArr.map(d => d.weather_code),
      shortForecast: dailyArr.map(d => d.shortForecast),
      precipitation_probability_max: dailyArr.map(d => d.precipitation_probability_max),
      wind_gusts_10m_max: dailyArr.map(d => d.wind_gusts_10m_max),
      wind_speed_10m_max: dailyArr.map(d => d.wind_speed_10m_max),
      uv_index_max: dailyArr.map(d => d.uv_index_max),
      sunrise: dailyArr.map(d => d.sunrise),
      sunset: dailyArr.map(d => d.sunset),
      sunshine_duration: dailyArr.map(d => d.sunshine_duration),
      daylight_duration: dailyArr.map(d => d.daylight_duration)
    };
    out.nwsHourly = nws.hourlyPeriods;
    out.nwsDaily = nws.dailyPeriods;
  }else{
    out.hourly = om.hourly;
    out.daily = om.daily;
  }
  if(nws && nws.metar){
    out.current = buildCurrentFromMetar(nws.metar, om, nws.hourlyPeriods);
    out.sources.current = 'metar';
  }else{
    out.current = Object.assign({}, om.current, {
      source: 'open-meteo',
      condition: wmo(om.current.weather_code)[0],
      icon: wmo(om.current.weather_code)[1],
      apparent_temperature: Math.round(om.current.apparent_temperature ?? om.current.temperature_2m)
    });
  }
  return out;
}
function chartHourly(d){
  const omH = d?.om?.hourly || d?.hourly;
  if(!omH?.time?.length) return d?.hourly || omH;
  if(!d?.nwsHourly?.length) return omH;
  const pop = (omH.precipitation_probability || []).slice();
  const codes = (omH.weather_code || []).slice();
  const shortForecast = [];
  d.nwsHourly.forEach(p => {
    const i = closestOmIndex(p.startTime, omH.time);
    if(i < 0 || i >= omH.time.length) return;
    const nwsPop = p.probabilityOfPrecipitation?.value;
    if(nwsPop != null) pop[i] = Math.max(pop[i] ?? 0, nwsPop);
    const wmo = nwsToWmo(p.shortForecast);
    if(wmo) codes[i] = Math.max(codes[i] ?? 0, wmo);
    shortForecast[i] = p.shortForecast || shortForecast[i];
  });
  return Object.assign({}, omH, {
    precipitation_probability: pop,
    weather_code: codes,
    shortForecast
  });
}
function inferHourlyPop(pop, code, short){
  let p = pop ?? 0;
  const s = String(short || '').toLowerCase();
  const chance = /\b(chance|slight|isolated|scattered)\b/.test(s);
  if(code >= 95 && !chance) p = Math.max(p, 70);
  else if(code >= 80) p = Math.max(p, chance ? 40 : 50);
  else if(code >= 61) p = Math.max(p, 40);
  else if(code >= 51) p = Math.max(p, 28);
  if(/thunder|t-storm|tstorm/.test(s)) p = Math.max(p, chance ? 40 : 55);
  else if(/shower|rain|storm|drizzle/.test(s)) p = Math.max(p, 35);
  return p;
}
function wetScoreFromCode(code, short){
  const chance = /\b(chance|slight|isolated|scattered)\b/i.test(String(short || ''));
  if(code >= 95) return chance ? 0.35 : 0.62;
  if(code >= 80) return 0.42;
  if(code >= 61) return 0.32;
  if(code >= 51) return 0.22;
  return 0;
}

const AQI_CATS = [[50,'Good','good'],[100,'Moderate','mid'],[150,'Unhealthy (sensitive)','mid'],[200,'Unhealthy','warn'],[300,'Very Unhealthy','warn'],[9999,'Hazardous','warn']];

async function fetchAirSnapshot(loc){
  if(!isLikelyUS(loc)) return null;
  const airNow = await fetchAirNow(loc);
  if(airNow && airNow.AQI != null){
    const cat = AQI_CATS.find(x => airNow.AQI <= x[0]) || AQI_CATS[AQI_CATS.length - 1];
    return {
      aqi: airNow.AQI,
      pm25: airNow.PM2_5,
      category: airNow.Category?.Name || cat[1],
      cls: cat[2],
      source: 'AirNow'
    };
  }
  try{
    const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
      + '?latitude=' + loc.lat + '&longitude=' + loc.lon + '&current=us_aqi,pm2_5';
    const r = await fetchTimeout(url, {}, 6000);
    if(!r.ok) return null;
    const c = (await r.json()).current;
    if(!c || c.us_aqi == null) return null;
    const cat = AQI_CATS.find(x => c.us_aqi <= x[0]) || AQI_CATS[AQI_CATS.length - 1];
    return { aqi: c.us_aqi, pm25: c.pm2_5, category: cat[1], cls: cat[2], source: 'Open-Meteo modeled' };
  }catch(e){ return null; }
}

// ---------- fetch weather ----------
async function fetchWeather(loc, opts = {}){
  const fast = !!opts.fastPath;
  const [om, hrrr, nwsResult] = await Promise.all([
    fetchOpenMeteoBase(loc),
    !fast && isLikelyUS(loc) ? fetchOpenMeteoHrrr(loc).catch(() => null) : Promise.resolve(null),
    isLikelyUS(loc) ? fetchNwsForecasts(loc, { includeMetar: !fast }).catch(() => null) : Promise.resolve(null)
  ]);
  return mergeWeatherData(loc, om, hrrr, nwsResult);
}
async function enrichWeatherBackground(loc){
  const d = state.data;
  if(!d || !isLikelyUS(loc)) return;
  const [hrrr, metar] = await Promise.all([
    fetchOpenMeteoHrrr(loc).catch(() => null),
    !d.metar && d.nwsPoints ? fetchMetarObs(d.nwsPoints) : Promise.resolve(null)
  ]);
  if(state.data !== d) return;
  if(hrrr){
    mergeHrrrFields(d.om, hrrr);
    renderHourly(d);
    if(stormState.loaded) renderStormSetup(d);
    if(tabPanelsLoaded.more) renderAdvanced(d);
  }
  if(metar){
    d.metar = metar;
    d.current = buildCurrentFromMetar(metar, d.om, d.nwsHourly);
    d.sources.current = 'metar';
    renderCurrent(d);
    if(tabPanelsLoaded.more) loadTaf(loc);
    if(!nwsCliByDoy){
      fetchNwsCliByDoy(metar.id).then(cli => {
        if(cli && state.data === d){
          nwsCliByDoy = cli;
          renderDaily(d);
        }
      });
    }
  }
}
function nowIndex(d){
  const hourly = d.hourly;
  if(!hourly?.time?.length) return 0;
  if(hourly.anchoredNow) return 0;
  const tz = d.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayKeyInTz(tz);
  const nowM = nowMinsInTz(tz);
  let best = 0, bestDiff = Infinity;
  for(let i = 0; i < hourly.time.length; i++){
    const slotM = dayDiffKeys(today, forecastDayKey(hourly.time[i])) * 1440 + forecastWallMins(hourly.time[i]);
    const diff = Math.abs(slotM - nowM);
    if(diff < bestDiff){ bestDiff = diff; best = i; }
  }
  return best;
}

// ---------- render: current ----------
function beaufortDesc(mph){
  if(mph < 1) return 'Calm';
  if(mph < 4) return 'Light air';
  if(mph < 8) return 'Light breeze';
  if(mph < 13) return 'Gentle breeze';
  if(mph < 18) return 'Moderate breeze';
  if(mph < 24) return 'Fresh breeze';
  if(mph < 31) return 'Strong breeze';
  return 'High wind';
}

// ---------- render: light planner ----------
function renderLight(d){
  const loc = state.locations[state.active];
  if(!d || !d.daily || !d.daily.sunrise || !d.daily.sunset || !d.daily.sunrise.length){
    return;
  }
  const now = new Date();
  const sun = sunPosition(now, loc.lat, loc.lon);
  const sr = d.daily.sunrise[0], ss = d.daily.sunset[0];
  renderSunArc(sr, ss, d.timezone);
  $('sunCompass').innerHTML = sunCompassHtml(sun.az, sun.alt, 56);
  if(sun.alt > 0){
    $('sunCompassMeta').innerHTML = '<strong>Sun is up</strong><br>'
      + sun.alt.toFixed(1) + '\u00B0 above horizon \u00B7 '
      + compass(sun.az) + ' (' + Math.round(sun.az) + '\u00B0)<br>'
      + '<span style="font-size:.75rem;color:var(--dim)">Dot shows direction & height in the sky</span>';
  }else{
    $('sunCompassMeta').innerHTML = '<strong>Sun is below the horizon</strong><br>'
      + 'Azimuth ' + compass(sun.az) + ' (' + Math.round(sun.az) + '\u00B0) \u00B7 '
      + Math.abs(sun.alt).toFixed(1) + '\u00B0 below<br>'
      + '<span style="font-size:.75rem;color:var(--dim)">Golden &amp; blue hour windows below</span>';
  }
  const srM = minsOfDay(sr), ssM = minsOfDay(ss);
  const blueAmS = shiftMins(sr,-35), blueAmE = shiftMins(sr,-8);
  const goldAmE = shiftMins(sr, 60);
  const goldPmS = shiftMins(ss,-60);
  const bluePmS = shiftMins(ss, 8), bluePmE = shiftMins(ss, 35);
  const pc = m => (m/1440*100).toFixed(2) + '%';
  const NIGHT = cssVar('--lb-night'), BLUE = cssVar('--lb-blue'), GOLD = cssVar('--lb-gold'), DAY = cssVar('--lb-day');
  $('lightbar').style.background = 'linear-gradient(90deg,'
    + NIGHT + ' 0%,' + NIGHT + ' ' + pc(blueAmS) + ','
    + BLUE + ' ' + pc(blueAmS) + ',' + BLUE + ' ' + pc(blueAmE) + ','
    + GOLD + ' ' + pc(srM) + ',' + GOLD + ' ' + pc(goldAmE) + ','
    + DAY + ' ' + pc(goldAmE + 30) + ',' + DAY + ' ' + pc(goldPmS - 30) + ','
    + GOLD + ' ' + pc(goldPmS) + ',' + GOLD + ' ' + pc(ssM) + ','
    + BLUE + ' ' + pc(bluePmS) + ',' + BLUE + ' ' + pc(bluePmE) + ','
    + NIGHT + ' ' + pc(bluePmE + 25) + ',' + NIGHT + ' 100%)';
  const nowPct = pc(nowMinsInTz(d.timezone));
  const lightNow = $('lightbarNow');
  if(lightNow){
    lightNow.style.left = nowPct;
    lightNow.hidden = false;
  }
  // Keep legacy id hook for any CSS/tests that still target #nowMark
  const nowMark = $('nowMark');
  if(nowMark) nowMark.title = 'Now';

  const cells = [
    ['Golden AM', hm(sr) + ' \u2013 ' + fmtMins(goldAmE), 'gold'],
    ['Golden PM', fmtMins(goldPmS) + ' \u2013 ' + hm(ss), 'gold'],
    ['Blue AM', fmtMins(blueAmS) + ' \u2013 ' + fmtMins(blueAmE), 'blue'],
    ['Blue PM', fmtMins(bluePmS) + ' \u2013 ' + fmtMins(bluePmE), 'blue']
  ];
  $('suntimes').innerHTML = cells.map(r =>
    '<div class="metric lb-' + r[2] + '"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>'
  ).join('');

  const tw = twilightTimes(loc.lat, loc.lon, now, d.timezone);
  $('twilightGrid').innerHTML = [
    ['Civil dawn', tw.civilDawn], ['Civil dusk', tw.civilDusk],
    ['Nautical dawn', tw.nauticalDawn], ['Nautical dusk', tw.nauticalDusk],
    ['Astro dawn', tw.astroDawn], ['Astro dusk', tw.astroDusk]
  ].map(r => '<div class="metric"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>').join('');

  const moon = moonIllumination(now);
  const cloud = d.hourly.cloud_cover?.[nowIndex(d)] ?? 0;
  const dark = estimateSkyDarkness(moon.fraction, cloud, sun.alt);
  $('skyDarkness').innerHTML = '<div class="lbl">Night sky quality (estimate)</div>'
    + '<div class="verdict ' + dark.cls + '">' + esc(dark.label) + '</div>'
    + '<div class="detail">' + esc(dark.detail) + '</div>';

  // Photography sunset outlook: layered cloud + NWS smoke wording + AQI/PM2.5.
  const windowIdx = [];
  (d.hourly.time || []).forEach((t, i) => {
    const m = minsOfDay(t);
    if(Math.abs(m - ssM) <= 60) windowIdx.push(i);
  });
  let si = -1, bestDist = Infinity;
  (d.hourly.time || []).forEach((t, i) => {
    const dist = Math.abs(minsOfDay(t) - ssM);
    if(dist < bestDist){ bestDist = dist; si = i; }
  });
  const idxs = windowIdx.length ? windowIdx : (si >= 0 ? [si] : []);
  const avgCloud = (key) => {
    if(!idxs.length) return 0;
    const arr = d.hourly[key];
    if(!arr) return 0;
    return Math.round(idxs.reduce((s, i) => s + (arr[i] ?? 0), 0) / idxs.length);
  };
  const lo = avgCloud('cloud_cover_low');
  const mid = avgCloud('cloud_cover_mid');
  const hi = avgCloud('cloud_cover_high');
  const tot = avgCloud('cloud_cover');
  const pp = avgCloud('precipitation_probability');
  const mh = mid + hi;
  const layerSum = lo + mid + hi;
  const skyPct = Math.max(tot, Math.min(100, Math.round(lo + mid * 0.85 + hi * 0.7)));

  let smokeHits = 0, hazeHits = 0;
  idxs.forEach(i => {
    const sf = (d.hourly.shortForecast?.[i] || '').toLowerCase();
    if(/smoke/.test(sf)) smokeHits++;
    if(/\bhaze\b|dust/.test(sf)) hazeHits++;
  });
  const aqi = (typeof outdoorAir !== 'undefined' && outdoorAir) ? outdoorAir.aqi : null;
  const pm25 = (typeof outdoorAir !== 'undefined' && outdoorAir) ? outdoorAir.pm25 : null;
  const smokeAlert = (typeof stormState !== 'undefined' && stormState.alertFeatures || []).some(f =>
    /air quality|smoke|particle pollution/i.test(f.properties?.event || '')
    && alertActiveAtHour(f, d.hourly.time?.[si] || d.daily.sunset[0], d.timezone)
  );
  const heavySmoke = smokeHits > 0 || (pm25 != null && pm25 >= 55) || (aqi != null && aqi > 150);
  const lightSmoke = !heavySmoke && (
    hazeHits > 0 || smokeAlert || (pm25 != null && pm25 >= 35) || (aqi != null && aqi > 100)
  );
  const anySmoke = heavySmoke || lightSmoke;

  let verdict, cls, detail, meterSub = '';
  if(si < 0){
    verdict = 'Unavailable'; cls = 'mid';
    detail = 'No hourly sky data near sunset yet.';
  } else if(pp > 60 || lo > 75){
    verdict = 'Socked in'; cls = 'warn';
    detail = 'Low cloud or rain through golden hour \u2014 light will likely die flat.';
    meterSub = 'Low cloud ~' + lo + '% \u00B7 precip ~' + pp + '%';
  } else if(anySmoke && lo < 45 && mh < 40){
    verdict = heavySmoke ? 'Dramatic sky' : 'Color boost likely';
    cls = 'good';
    detail = heavySmoke
      ? 'Wildfire smoke with a mostly clear deck \u2014 strong chance of deep orange and red, even without cloud structure.'
      : 'Haze or light smoke over clearer skies \u2014 warmer than a clean sunset; worth being set up for golden hour.';
    meterSub = 'Smoke / haze in the forecast' + (pm25 != null ? ' \u00B7 PM2.5 ' + Math.round(pm25) : (aqi != null ? ' \u00B7 AQI ' + aqi : ''));
  } else if(anySmoke && lo < 50 && mh >= 25 && mh <= 110){
    verdict = 'Dramatic sky'; cls = 'good';
    detail = 'Broken mid/high cloud plus smoke or haze \u2014 best odds for a painted sunset.';
    meterSub = 'Clouds ~' + skyPct + '% with smoke in the mix';
  } else if(lo < 40 && mh >= 25 && mh <= 95){
    verdict = 'Dramatic sky'; cls = 'good';
    detail = 'Broken mid/high cloud with a clear low deck \u2014 best odds for a painted sunset.';
    meterSub = 'Mid ~' + mid + '% \u00B7 high ~' + hi + '% \u00B7 low ~' + lo + '%';
  } else if(lo < 40 && hi >= 70 && mid < 25 && mh > 95){
    verdict = 'Soft pastels'; cls = 'mid';
    detail = 'Mostly high overcast with little mid-level structure. Gentle color possible; not classic drama.';
    meterSub = 'High cloud ~' + hi + '%';
  } else if(layerSum < 15 && tot < 15){
    if(anySmoke){
      verdict = heavySmoke ? 'Dramatic sky' : 'Color boost likely';
      cls = 'good';
      detail = 'Nearly cloudless, but smoke or haze should still tint the horizon.';
      meterSub = 'Clear deck + smoke/haze';
    }else{
      verdict = 'Clean & crisp'; cls = 'mid';
      detail = 'Nearly cloudless \u2014 crisp horizon light, minimal sky color.';
      meterSub = 'Cloud cover ~' + skyPct + '%';
    }
  } else {
    verdict = 'Worth a look'; cls = 'mid';
    detail = 'Mixed deck through golden hour \u2014 could break either way.';
    meterSub = 'Cloud L/M/H ~' + lo + '/' + mid + '/' + hi + '%' + (anySmoke ? ' \u00B7 smoke also in play' : '');
  }

  const v = $('verdict');
  if(v){
    v.textContent = verdict;
    v.className = 'photo-outlook-verdict ' + cls;
  }
  const detailEl = $('verdictDetail');
  if(detailEl) detailEl.textContent = detail;

  const kicker = $('photoOutlookKicker');
  if(kicker) kicker.textContent = "Tonight's golden hour";
  const meter = $('photoOutlookMeter');
  const fill = $('photoOutlookMeterFill');
  const mark = $('photoOutlookMeterMark');
  const pctEl = $('photoOutlookMeterPct');
  const subEl = $('photoOutlookMeterSub');
  const labelEl = $('photoOutlookMeterLabel');
  if(meter && fill && pctEl){
    if(si < 0){
      meter.hidden = true;
    }else{
      meter.hidden = false;
      // 0 = clear/plain, ~40–70 = sweet spot (broken cloud or smoke tint), high = heavy/socked.
      const showPct = anySmoke && skyPct < 20 ? Math.max(skyPct, heavySmoke ? 52 : 38) : skyPct;
      const clamped = Math.max(0, Math.min(100, showPct));
      fill.style.width = clamped + '%';
      if(mark) mark.style.left = clamped + '%';
      if(labelEl){
        labelEl.textContent = anySmoke && skyPct < 20 ? 'Color potential' : 'Cloud cover at sunset';
      }
      pctEl.textContent = anySmoke && skyPct < 20
        ? (heavySmoke ? 'Smoke tint' : 'Haze tint')
        : (clamped + '%');
      if(subEl){
        const tip = clamped < 20 ? 'Clear end — usually less sky color'
          : clamped <= 70 ? 'Broken / textured — often the best photo odds'
          : 'Heavy cover — color more likely muted';
        subEl.textContent = (meterSub ? meterSub + ' \u00B7 ' : '') + tip;
      }
    }
  }
  const win = $('photoOutlookWindow');
  if(win){
    win.innerHTML = 'Golden hour <span>' + fmtMins(goldPmS) + ' \u2013 ' + hm(ss) + '</span>';
  }
}
function renderFireBanner(loc, d, spcLabel){
  const box = $('fireModeBanner');
  const timeline = $('fireTimeline');
  if(!box || !loc || !isLikelyUS(loc) || !d) return;
  const rh = d.current.relative_humidity_2m;
  const gust = d.current.wind_gusts_10m ?? d.hourly.wind_gusts_10m?.[nowIndex(d)];
  const wind = d.current.wind_speed_10m;
  const redFlag = (stormState.alertFeatures || []).some(f => /red flag|fire weather/i.test(f.properties?.event || ''));
  const dryWindy = rh != null && rh <= 25 && ((gust != null && gust >= 25) || (wind != null && wind >= 20));
  const inSpc = spcLabel && !/none|see text/i.test(spcLabel);
  fireState.active = redFlag || dryWindy || inSpc;
  if(!fireState.active){
    box.classList.remove('visible');
    box.innerHTML = '';
    if(timeline) timeline.hidden = true;
    return;
  }
  const bits = [];
  if(redFlag) bits.push('Red Flag Warning active');
  if(inSpc) bits.push('SPC fire weather outlook: ' + spcLabel);
  if(dryWindy) bits.push('Very dry air (' + Math.round(rh) + '% RH) with gusty winds');
  box.innerHTML = '<strong>Fire weather</strong> ' + esc(bits.join(' · ')) + '.';
  box.classList.add('visible');
  renderFireTimeline(d);
}
function renderFireTimeline(d){
  const wrap = $('fireTimeline'), bar = $('fireTimelineBar');
  if(!wrap || !bar || !fireState.active || !d?.hourly?.time?.length){
    if(wrap) wrap.hidden = true;
    return;
  }
  const i0 = d.hourly.anchoredNow ? 0 : nowIndex(d);
  const end = Math.min(i0 + HOURLY_HOURS, d.hourly.time.length);
  const segments = [];
  for(let j = i0; j < end; j++){
    const rh = d.hourly.relative_humidity_2m?.[j];
    const wind = d.hourly.wind_speed_10m?.[j] ?? 0;
    const gust = d.hourly.wind_gusts_10m?.[j] ?? wind;
    let cls = 'ok';
    if(rh != null && rh <= 25 && (gust >= 25 || wind >= 20)) cls = 'critical';
    else if(rh != null && (rh <= 35 || wind >= 18 || gust >= 22)) cls = 'elevated';
    segments.push('<span class="' + cls + '" title="'
      + esc(hourLabel(d.hourly.time[j]))
      + ' · RH ' + (rh != null ? Math.round(rh) : '—') + '% · wind '
      + Math.round(state.units === 'F' ? wind * 2.237 : wind * 3.6) + ' ' + windUnit()
      + '"></span>');
  }
  if(!segments.length){ wrap.hidden = true; return; }
  bar.innerHTML = segments.join('');
  wrap.hidden = false;
}
async function refreshFireWeather(loc, d){
  if(!isLikelyUS(loc) || !d) return;
  let spcLabel = '';
  try{
    const geo = await fetchThreatGeo('fireWx', THREAT_LAYER_URLS.fireWx);
    if(geo){
      const risk = spcRiskAtPoint(loc.lon, loc.lat, geo);
      if(risk) spcLabel = risk.label2 || risk.label || '';
    }
  }catch(e){}
  renderFireBanner(loc, d, spcLabel);
}

// ---------- render: hourly + sparkline trends ----------
function renderHourly(d){
  if(!d || !d.hourly || !d.hourly.time || !d.hourly.time.length){
    $('trends').innerHTML = '';
    $('hourly').innerHTML = '<div class="radar-note">Hourly forecast unavailable.</div>';
    $('hourlySource').textContent = d && d.cached ? 'Cached snapshot' : '';
    return;
  }
  const i0 = d.hourly.anchoredNow ? 0 : nowIndex(d);
  const end = d.hourly.anchoredNow
    ? d.hourly.time.length
    : Math.min(i0 + HOURLY_HOURS + 1, d.hourly.time.length);
  const slice = (arr, f, fb) => (arr && arr.length)
    ? arr.slice(i0, end).map(v => (f ? f(v) : v))
    : Array(Math.max(0, end - i0)).fill(fb ?? 0);
  const pres = slice(d.hourly.pressure_msl, v => v, null);
  const temps = slice(d.hourly.temperature_2m, v => v);
  const dews = slice(d.hourly.dew_point_2m, v => v);
  const capes = slice(d.hourly.cape, v => v ?? 0);
  const pops = slice(d.hourly.precipitation_probability, v => v ?? 0, 0);
  const foot = { left: 'Now', rightPrefix: 'Later' };
  const dU = degSym();
  const capePeak = capes.length ? Math.max(...capes) : 0;
  $('trends').innerHTML = [
    sparklineCard('Pressure', pres, 'pres', ' hPa', { ...foot, minSpan: 6 }),
    sparklineCard('Temperature', temps, 'temp', dU, { ...foot, minSpan: state.units === 'F' ? 8 : 5 }),
    sparklineCard('Dew point', dews, 'dew', dU, { ...foot, minSpan: state.units === 'F' ? 8 : 5 }),
    sparklineCard('Precip chance', pops, 'pop', '%', {
      ...foot,
      domain: { min: 0, max: 100 },
      fmt: v => String(Math.round(v)),
      rangeFmt: (min, max, latest, fmt) => (min === max ? fmt(min) + '%' : fmt(min) + '% \u2013 ' + fmt(max) + '%'),
      rightTail: Math.round(pops[pops.length - 1] ?? 0) + '%',
      hint: 'Hourly probability of measurable precipitation (0\u2013100%)'
    }),
    sparklineCard('CAPE', capes, 'cape', ' J/kg', {
      ...foot,
      domain: { min: 0, max: CAPE_SCALE_MAX },
      refLines: [{ value: 300 }, { value: 1000 }, { value: 2500 }],
      catFn: () => capeCat(capePeak),
      catClsFn: () => capeCatCls(capePeak),
      rangeFmt: (min, max, latest, fmt, u) => 'peak ' + fmt(max) + u + ' \u00B7 now ' + fmt(capes[0] ?? 0) + u,
      hint: '0\u20132500 J/kg scale \u00B7 dashed: 300 marginal \u00B7 1000 unstable \u00B7 2500 very unstable',
      title: 'Convective Available Potential Energy (HRRR). Peak next 24h: '
        + Math.round(capePeak) + ' J/kg (' + capeCat(capePeak) + ').'
    })
  ].join('');

  const out = [];
  for(let i = i0; i < end; i++){
    const code = d.hourly.weather_code?.[i] ?? 0;
    const isDay = d.hourly.is_day ? d.hourly.is_day[i] : 1;
    const [ , icon] = wmo(code, isDay);
    const tip = d.hourly.shortForecast ? d.hourly.shortForecast[i] : wmo(code)[0];
    out.push('<div class="hour' + (i === i0 ? ' now-h' : '') + '" title="' + esc(tip) + '">'
      + '<div class="t">' + (i === i0 ? 'NOW' : hourLabel(d.hourly.time[i])) + '</div>'
      + '<div class="ic">' + icon + '</div>'
      + '<div class="tmp">' + Math.round(d.hourly.temperature_2m?.[i] ?? 0) + '\u00B0</div>'
      + '<div class="pp">' + (d.hourly.precipitation_probability?.[i] ?? 0) + '%</div>'
      + '<div class="wd">' + windCompassHtml(d.hourly.wind_direction_10m?.[i] ?? 0, 20) + Math.round(d.hourly.wind_speed_10m?.[i] ?? 0) + '</div>'
      + '</div>');
  }
  $('hourly').innerHTML = out.join('');
  const srcBits = [];
  if(d.sources){
    if(d.sources.forecast === 'nws') srcBits.push('NWS hourly periods');
    else srcBits.push('Open-Meteo hourly');
    if(d.sources.current === 'metar') srcBits.push('METAR current');
    if(d.om && d.om.hourly.cape) srcBits.push('HRRR CAPE');
  }
  $('hourlySource').textContent = srcBits.length ? srcBits.join(' \u00B7 ') : '';
}

// ---------- render: daily ----------
const COND_BUCKETS = {
  clear:'Clear', partly:'Partly', cloudy:'Cloudy', fog:'Fog', rain:'Rain', snow:'Snow', ice:'Ice/mix', storm:'Storm'
};
function isWarmPrecipTemp(temp){
  if(temp == null || temp === undefined) return false;
  return state.units === 'F' ? temp > 35 : temp > 2;
}
function conditionBucket(code, hourly, idx, tempOverride){
  const c = code ?? 2;
  const temp = tempOverride ?? (hourly != null && idx != null ? hourly.temperature_2m?.[idx] : null);
  const pop = hourly != null && idx != null ? (hourly.precipitation_probability?.[idx] ?? 0) : null;
  const short = hourly != null && idx != null ? String(hourly.shortForecast?.[idx] || '') : '';
  const chanceWording = /\b(chance|slight|isolated|scattered)\b/i.test(short);
  if(hourly != null && idx != null){
    const rain = hourly.precipitation?.[idx] ?? 0;
    const snow = hourly.snowfall?.[idx] ?? 0;
    const rainThresh = state.units === 'F' ? 0.02 : 0.2;
    const snowThresh = state.units === 'F' ? 0.02 : 0.2;
    if(rain > rainThresh && snow > snowThresh){
      return isWarmPrecipTemp(temp) ? 'rain' : 'ice';
    }
  }
  if(c >= 95){
    if(chanceWording || (pop != null && pop < 55)) return 'rain';
    return 'storm';
  }
  if(c >= 85 || (c >= 71 && c <= 77)){
    return isWarmPrecipTemp(temp) ? 'rain' : 'snow';
  }
  if(c >= 56 && c <= 67) return isWarmPrecipTemp(temp) ? 'rain' : 'ice';
  if((c >= 51 && c <= 55) || (c >= 80 && c <= 82)) return 'rain';
  if(c >= 45 && c <= 48) return 'fog';
  if(c === 3) return 'cloudy';
  if(c === 2) return 'partly';
  return 'clear';
}
function dayHourlyIndices(hourly, dateStr){
  const key = String(dateStr).slice(0, 10);
  const out = [];
  for(let i = 0; i < hourly.time.length; i++){
    if(String(hourly.time[i]).slice(0, 10) === key) out.push(i);
  }
  return out;
}
function buildConditionSegments(indices, hourly){
  if(!indices.length) return [];
  const segs = [];
  let start = 0;
  let bucket = conditionBucket(hourly.weather_code[indices[0]], hourly, indices[0]);
  for(let j = 1; j <= indices.length; j++){
    const next = j < indices.length ? conditionBucket(hourly.weather_code[indices[j]], hourly, indices[j]) : null;
    if(next !== bucket){
      segs.push({
        bucket,
        label: COND_BUCKETS[bucket],
        pct: ((j - start) / indices.length) * 100
      });
      start = j;
      bucket = next;
    }
  }
  return segs;
}
function dayExtrema(indices, hourly){
  if(!indices.length) return { avg: null, lo: null, hi: null, loAt: '', hiAt: '', rain: 0, snow: 0, wind: 0 };
  let loI = indices[0], hiI = indices[0];
  let lo = hourly.temperature_2m[loI], hi = hourly.temperature_2m[hiI];
  let sum = 0, rain = 0, snow = 0, wind = 0;
  for(const i of indices){
    const t = hourly.temperature_2m[i];
    sum += t;
    if(t < lo){ lo = t; loI = i; }
    if(t > hi){ hi = t; hiI = i; }
    rain += hourly.precipitation[i] ?? 0;
    snow += hourly.snowfall?.[i] ?? 0;
    wind = Math.max(wind, hourly.wind_speed_10m[i] ?? 0);
  }
  return {
    avg: sum / indices.length,
    lo, hi,
    loAt: hourLabel(hourly.time[loI]),
    hiAt: hourLabel(hourly.time[hiI]),
    rain, snow, wind: Math.round(wind)
  };
}
function fmtSnowSum(cm){
  if(cm == null || cm < 0.05) return '';
  return state.units === 'F' ? (cm / 2.54).toFixed(1) + ' in snow' : cm.toFixed(1) + ' cm snow';
}
function snowStormTotals(dd){
  if(!dd?.snowfall_sum?.length) return null;
  const s0 = dd.snowfall_sum[0] ?? 0;
  const s1 = dd.snowfall_sum[1] ?? 0;
  const s2 = dd.snowfall_sum[2] ?? 0;
  const h48 = s0 + s1;
  const h72 = h48 + s2;
  if(h48 < 0.1 && h72 < 0.1) return null;
  return { h48, h72 };
}
function fmtDayDate(iso){
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month:'long', day:'numeric' });
}
function fmtDayWeekday(iso){
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday:'long' });
}
function fmtPrecipSum(sum){
  if(sum == null || isNaN(sum)) return null;
  if(sum < (state.units === 'F' ? 0.005 : 0.05)) return null;
  if(state.units === 'F') return (sum < 0.1 ? sum.toFixed(2) : sum.toFixed(1)) + ' in';
  return sum.toFixed(1) + ' mm';
}
function daySeriesSparkline(values, w, h, opts){
  opts = opts || {};
  const vals = values.filter(v => v != null && !isNaN(v)).map(Number);
  if(!vals.length) return '';
  const min = opts.domain ? opts.domain.min : Math.min(...vals);
  const max = opts.domain ? opts.domain.max : Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = vals.length < 2 ? w / 2 : (i / (vals.length - 1)) * w;
    const y = h - 2 - ((v - min) / span) * (h - 4);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  const line = pts.join(' ');
  const fillOpacity = opts.fillOpacity ?? 0.14;
  const aria = opts.ariaLabel ? ' aria-label="' + esc(opts.ariaLabel) + '"' : ' aria-hidden="true"';
  const area = '0,' + h + ' ' + line + ' ' + w + ',' + h;
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"' + aria + '>'
    + '<polygon points="' + area + '" fill="currentColor" opacity="' + fillOpacity + '"/>'
    + '<polyline points="' + line + '" fill="none" stroke="currentColor" stroke-width="1.75" vector-effect="non-scaling-stroke"/></svg>';
}
function dayHourlyWetData(indices, hh, opts){
  opts = opts || {};
  const items = indices.map(j => {
    const code = hh.weather_code?.[j] ?? 0;
    const pop = inferHourlyPop(
      hh.precipitation_probability?.[j] ?? 0,
      code,
      hh.shortForecast?.[j]
    );
    return {
      pop,
      amt: Math.max(hh.precipitation?.[j] ?? 0, 0),
      snow: Math.max(hh.snowfall?.[j] ?? 0, 0),
      code
    };
  });
  const wetAmt = items.map(it => it.amt + it.snow * 0.08);
  const maxAmt = Math.max(...wetAmt, 0);
  let scores = items.map((it, i) => {
    const popScore = it.pop / 100;
    const amtScore = maxAmt > 0 ? wetAmt[i] / maxAmt : 0;
    if(popScore > 0) return Math.max(popScore, amtScore);
    if(amtScore > 0.04) return amtScore;
    return wetScoreFromCode(it.code, hh.shortForecast?.[indices[i]]);
  });
  const dayMaxPop = opts.dayMaxPop ?? 0;
  const dayShort = opts.dayShort || '';
  const dayCode = opts.dayCode ?? 0;
  const dailyPop = inferHourlyPop(dayMaxPop, dayCode, dayShort);
  if(dayMaxPop >= 12){
    const peak = Math.max(...scores, 0);
    if(peak < 0.18){
      scores = scores.map((s, i) => {
        const j = indices[i];
        const bucket = conditionBucket(hh.weather_code?.[j], hh, j);
        if(bucket === 'rain' || bucket === 'storm' || bucket === 'ice'){
          return Math.max(s, (dayMaxPop / 100) * 0.9);
        }
        return s;
      });
    }
  }
  if(dailyPop >= 20 && Math.max(...scores, 0) < dailyPop / 100 * 0.35){
    const floor = (dailyPop / 100) * 0.82;
    const stormDay = /thunder|shower|rain|storm/i.test(dayShort);
    scores = scores.map((s, i) => {
      const j = indices[i];
      const bucket = conditionBucket(hh.weather_code?.[j], hh, j);
      if(bucket === 'rain' || bucket === 'storm' || bucket === 'ice' || items[i].pop >= 15){
        return Math.max(s, floor);
      }
      if(stormDay){
        const hr = parseInt(String(hh.time[j] || '').slice(11, 13), 10);
        if(hr >= 11 && hr <= 20) return Math.max(s, floor * 0.88);
      }
      return s;
    });
  }
  return { scores, maxAmt, peakPop: Math.max(...items.map(it => it.pop), dailyPop, 0) };
}
function fmtChartPrecipAmt(amt){
  if(amt == null || amt <= 0) return '0';
  if(state.units === 'F'){
    if(amt < 0.1) return amt.toFixed(2) + '"';
    return amt.toFixed(2) + '"';
  }
  if(amt < 1) return amt.toFixed(1) + ' mm';
  return amt.toFixed(1) + ' mm';
}
function dayChartRainAxis(wet){
  const useAmt = wet.maxAmt > (state.units === 'F' ? 0.005 : 0.05);
  if(useAmt){
    const top = fmtChartPrecipAmt(wet.maxAmt);
    const mid = fmtChartPrecipAmt(wet.maxAmt / 2);
    return { label: state.units === 'F' ? 'Precip (in)' : 'Precip (mm)', top, mid, bot: '0' };
  }
  const peak = wet.peakPop || Math.round(Math.max(...(wet.scores || [0]), 0) * 100);
  return { label: 'Rain chance', top: peak + '%', mid: Math.round(peak / 2) + '%', bot: '0%' };
}
function dayChartTempGeometry(temps, h){
  const n = temps.length;
  const tempVals = temps.map(v => Number(v));
  const tMin = Math.min(...tempVals);
  const tMax = Math.max(...tempVals);
  const tSpan = Math.max(tMax - tMin, state.units === 'F' ? 8 : 5);
  const padT = 14;
  const padB = 6;
  const precipSplit = 0.36;
  const precipTop = h * (1 - precipSplit);
  const tempPlotH = precipTop - padT;
  const xPct = i => n < 2 ? 50 : (i / (n - 1)) * 100;
  const yPct = v => ((padT + (1 - (v - tMin) / tSpan) * Math.max(tempPlotH - 4, 1)) / h) * 100;
  const xSvg = (i, w) => n < 2 ? w / 2 : (i / (n - 1)) * w;
  const ySvg = v => padT + (1 - (v - tMin) / tSpan) * Math.max(tempPlotH - 4, 1);
  return { n, tempVals, tMin, tMax, precipTop, precipSplit, padT, padB, xPct, yPct, xSvg, ySvg };
}
function dayChartTempLabelsHtml(temps, h, opts){
  opts = opts || {};
  const geo = dayChartTempGeometry(temps, h);
  const step = opts.labelStep || Math.max(1, Math.ceil(geo.n / 8));
  let html = '';
  for(let i = 0; i < geo.n; i += step){
    const isNow = i === opts.nowLabelIdx;
    const y = geo.yPct(geo.tempVals[i]);
    const flip = y < 24;
    const cls = 'day-chart-temp-lbl' + (isNow ? ' now' : '') + (flip ? ' below' : '');
    html += '<span class="' + cls + '" style="left:'
      + geo.xPct(i).toFixed(2) + '%;top:' + y.toFixed(2) + '%">'
      + Math.round(geo.tempVals[i]) + '°</span>';
  }
  return html;
}
function dayForecastChartSvg(temps, wetScores, w, h, opts){
  opts = opts || {};
  const geo = dayChartTempGeometry(temps, h);
  const n = geo.n;
  if(!n) return '';
  const precipPlotH = h - geo.padB - geo.precipTop;
  const xAt = i => geo.xSvg(i, w);
  const yTemp = v => geo.ySvg(v);
  const yPrecipBase = h - geo.padB;
  const yPrecip = score => geo.precipTop + (1 - Math.min(1, Math.max(0, score))) * Math.max(precipPlotH - 2, 1);
  const wet = wetScores.map(s => Math.max(0, Math.min(1, s)));
  const pid = 'day-precip-' + (opts.chartId || '0');
  let body = '<defs><pattern id="' + pid + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
    + '<rect width="6" height="6" fill="currentColor" opacity=".18"/>'
    + '<line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="1.5" opacity=".45"/>'
    + '</pattern></defs>';
  if(wet.some(v => v > 0.03)){
    const topPts = wet.map((s, i) => xAt(i).toFixed(1) + ',' + yPrecip(s).toFixed(1));
    const area = xAt(0).toFixed(1) + ',' + yPrecipBase + ' '
      + topPts.join(' ') + ' '
      + xAt(n - 1).toFixed(1) + ',' + yPrecipBase;
    body += '<polygon class="day-chart-precip" fill="url(#' + pid + ')" points="' + area + '"/>';
  }
  const tPts = geo.tempVals.map((v, i) => xAt(i).toFixed(1) + ',' + yTemp(v).toFixed(1));
  body += '<polyline class="day-chart-temp" points="' + tPts.join(' ') + '"/>'
    + '<line class="day-chart-split" x1="0" y1="' + geo.precipTop.toFixed(1) + '" x2="' + w + '" y2="' + geo.precipTop.toFixed(1) + '"/>';
  const peakScore = Math.max(...wet, 0);
  if(peakScore > 0.08){
    const yMid = yPrecip(peakScore / 2).toFixed(1);
    body += '<line class="day-chart-rain-grid" x1="0" y1="' + yMid + '" x2="' + w + '" y2="' + yMid + '"/>';
  }
  const labelStep = opts.labelStep || Math.max(1, Math.ceil(n / 8));
  for(let i = 0; i < n; i += labelStep){
    const x = xAt(i).toFixed(1);
    const y = yTemp(geo.tempVals[i]).toFixed(1);
    const dotCls = i === opts.nowLabelIdx ? ' day-chart-temp-dot-now' : '';
    body += '<circle class="day-chart-temp-dot' + dotCls + '" cx="' + x + '" cy="' + y + '" r="2.5"/>';
  }
  const aria = 'Hourly temperature and precipitation for the day';
  return '<svg class="day-chart-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-label="' + esc(aria) + '">' + body + '</svg>';
}
function dayChartHoverHtml(tips){
  if(!tips?.length) return '';
  return '<div class="day-chart-hover" aria-hidden="true">'
    + tips.map(t => {
      const tip = t.time + ' \u00B7 ' + t.temp + ' \u00B7 ' + t.rain + ' rain';
      return '<div class="day-chart-hit" title="' + esc(tip) + '">'
        + '<span class="day-chart-tip">' + esc(t.time) + ' \u00B7 <strong>' + esc(t.temp) + '</strong> \u00B7 ' + esc(t.rain) + ' rain</span>'
        + '</div>';
    }).join('')
    + '</div>';
}
function dayChartHoverTips(indices, hh, temps){
  return indices.map((j, idx) => {
    const code = hh.weather_code?.[j] ?? 0;
    const pop = inferHourlyPop(
      hh.precipitation_probability?.[j] ?? 0,
      code,
      hh.shortForecast?.[j]
    );
    return {
      time: hourLabel(hh.time[j]),
      temp: Math.round(temps[idx]) + '°',
      rain: pop + '%'
    };
  });
}
function dayForecastChartHtml(temps, wet, opts){
  opts = opts || {};
  const w = 320;
  const h = 88;
  const geo = dayChartTempGeometry(temps, h);
  const rainAxis = dayChartRainAxis(wet);
  const labels = dayChartTempLabelsHtml(temps, h, opts);
  const rainPad = Math.round(geo.precipSplit * 100);
  return '<div class="day-chart-wrap">'
    + '<div class="day-chart-yaxis" aria-hidden="true">'
    + '<span>' + Math.round(geo.tMax) + '°</span>'
    + '<span>' + Math.round(geo.tMin) + '°</span>'
    + '</div>'
    + '<div class="day-chart-plot">'
    + dayForecastChartSvg(temps, wet.scores, w, h, opts)
    + (labels ? '<div class="day-chart-temp-labels" aria-hidden="true">' + labels + '</div>' : '')
    + '</div>'
    + '<div class="day-chart-yaxis day-chart-yaxis-r" aria-hidden="true">'
    + '<span class="day-chart-rain-lbl">' + esc(rainAxis.label) + '</span>'
    + '<div class="day-chart-rain-scale" style="padding-top:' + rainPad + '%">'
    + '<div class="day-chart-rain-scale-inner">'
    + '<span>' + esc(rainAxis.top) + '</span>'
    + '<span>' + esc(rainAxis.mid) + '</span>'
    + '<span>' + esc(rainAxis.bot) + '</span>'
    + '</div></div>'
    + '</div>'
    + '</div>'
    + '<div class="day-chart-key" aria-hidden="true">'
    + '<span class="day-chart-key-temp">Temperature</span>'
    + '<span class="day-chart-key-rain">Rain</span>'
    + '</div>';
}
function buildDayTimeline(indices, hh, dd, i, opts){
  const compactTicks = opts.compactTicks;
  const nowHour = opts.nowHour;
  const nowPct = opts.nowPct;
  if(indices.length){
    const segs = buildConditionSegments(indices, hh);
    const segHtml = segs.map(s =>
      '<div class="day-seg dc-' + s.bucket + '" style="width:' + s.pct.toFixed(2) + '%" title="' + esc(s.label) + '">'
      + (s.pct >= 6 ? '<span>' + esc(s.label) + '</span>' : '')
      + '</div>'
    ).join('');
    const nowMark = nowPct != null
      ? '<div class="day-now" style="--now-pct:' + nowPct.toFixed(2) + '" title="Current time">'
        + '<span class="day-now-lbl">Now</span>'
        + '<span class="day-now-line" aria-hidden="true"></span></div>'
      : '';
    const temps = indices.map(j => hh.temperature_2m[j]);
    const wet = dayHourlyWetData(indices, hh, {
      dayMaxPop: dd.precipitation_probability_max?.[i] ?? 0,
      dayShort: dd.shortForecast?.[i] ?? '',
      dayCode: dd.weather_code?.[i] ?? 0
    });
    const maxTicks = compactTicks ? 6 : 12;
    const tickStep = Math.max(1, Math.ceil(indices.length / maxTicks));
    let nowLabelIdx = -1;
    for(let j = 0; j < indices.length; j++){
      if(hh.time[indices[j]].slice(0, 13) === nowHour) nowLabelIdx = j;
    }
    const tickParts = [];
    for(let j = 0; j < indices.length; j += tickStep){
      const idx = indices[j];
      const hrKey = hh.time[idx].slice(0, 13);
      const isNow = hrKey === nowHour;
      const tickLbl = compactTicks ? hourLabelCompact(hh.time[idx]) : hourLabel(hh.time[idx]);
      tickParts.push('<div class="day-tick' + (isNow ? ' now' : '') + '">'
        + '<div class="day-tick-t">' + tickLbl + '</div>'
        + '</div>');
    }
    const hoverTips = dayChartHoverTips(indices, hh, temps);
    return {
      hourly: true,
      segHtml: segHtml,
      nowMark,
      temps,
      wet,
      chartHtml: dayForecastChartHtml(temps, wet, { nowPct, chartId: i, labelStep: tickStep, nowLabelIdx }),
      hoverHtml: dayChartHoverHtml(hoverTips),
      ticksHtml: tickParts.length ? '<div class="day-ticks">' + tickParts.join('') + '</div>' : '',
      note: ''
    };
  }
  const bucket = conditionBucket(dd.weather_code[i], null, null, dd.temperature_2m_max?.[i]);
  const lo = dd.temperature_2m_min[i];
  const hi = dd.temperature_2m_max[i];
  const segHtml = '<div class="day-seg dc-' + bucket + '" style="width:100%" title="' + esc(COND_BUCKETS[bucket]) + '">'
    + '<span>' + esc(COND_BUCKETS[bucket]) + '</span></div>';
  const ticksHtml = '<div class="day-ticks">'
    + '<div class="day-tick"><div class="day-tick-t">Low</div></div>'
    + '<div class="day-tick"><div class="day-tick-t">High</div></div>'
    + '</div>';
  const dayPop = dd.precipitation_probability_max?.[i] ?? 0;
  const boostedPop = inferHourlyPop(dayPop, dd.weather_code?.[i] ?? 0, dd.shortForecast?.[i] ?? '');
  const wet = {
    scores: [boostedPop / 100, boostedPop / 100],
    maxAmt: 0,
    peakPop: boostedPop
  };
  const hoverTips = [
    { time: 'Low', temp: Math.round(lo) + '°', rain: boostedPop + '%' },
    { time: 'High', temp: Math.round(hi) + '°', rain: boostedPop + '%' }
  ];
  return {
    hourly: false,
    segHtml,
    nowMark: '',
    temps: [lo, hi],
    wet,
    chartHtml: dayForecastChartHtml([lo, hi], wet, { chartId: i, labelStep: 1 }),
    hoverHtml: dayChartHoverHtml(hoverTips),
    ticksHtml,
    note: '<div class="day-card-note">Hourly detail not available for this day</div>'
  };
}
function dayPrecipWindow(indices, hh){
  if(!indices.length || !hh) return '';
  const blocks = [];
  let start = -1;
  for(let k = 0; k < indices.length; k++){
    const j = indices[k];
    const pop = hh.precipitation_probability?.[j] ?? 0;
    const precip = hh.precipitation?.[j] ?? 0;
    const code = hh.weather_code?.[j] ?? 0;
    const snow = hh.snowfall?.[j] ?? 0;
    const temp = hh.temperature_2m?.[j];
    const icy = (code >= 56 && code <= 67) && !isWarmPrecipTemp(temp);
    const wet = pop >= 35 || precip > 0.1 || code >= 51;
    if(wet || icy){
      if(start < 0) start = k;
    }else if(start >= 0){
      blocks.push([indices[start], indices[k - 1]]);
      start = -1;
    }
  }
  if(start >= 0) blocks.push([indices[start], indices[indices.length - 1]]);
  if(!blocks.length) return '';
  const fmt = j => hourLabelCompact(hh.time[j]);
  const [a, b] = blocks[0];
  const codeA = hh.weather_code?.[a] ?? 0;
  const icy = (codeA >= 56 && codeA <= 67) && !isWarmPrecipTemp(hh.temperature_2m?.[a]);
  const label = icy ? 'Freezing precip' : 'Rain';
  if(blocks.length === 1) return a === b ? label + ' possible ~' + fmt(a) : label + ' likely ' + fmt(a) + '\u2013' + fmt(b);
  return label + ' possible at times';
}
function afdHighlightText(text){
  if(!text) return '';
  const clean = text.replace(/\r/g, '');
  const syn = clean.match(/\.SYNOPSIS[\s\S]*?\n\n([\s\S]*?)(?=\n\.[A-Z]|\n&&|$)/i);
  if(syn && syn[1]){
    const p = syn[1].trim().split(/\n\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)[0];
    if(p) return p.slice(0, 480);
  }
  const short = clean.match(/\.SHORT TERM[\s\S]*?\n\n([\s\S]*?)(?=\n\.[A-Z]|\n&&|$)/i);
  if(short && short[1]){
    const p = short[1].trim().split(/\n\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)[0];
    if(p) return p.slice(0, 480);
  }
  const paras = clean.split(/\n\n/).map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 50 && !/^[\.\&]/.test(p) && !/^\.[A-Z]/.test(p));
  return paras[0] ? paras[0].slice(0, 480) : '';
}
function renderDaily(d){
  const dd = d.daily;
  const hh = chartHourly(d);
  if(!dd || !dd.time || !dd.time.length || !hh || !hh.time){
    $('daily').innerHTML = '<p class="radar-note">Daily forecast unavailable.</p>';
    $('dailySource').textContent = '';
    return;
  }
  const nowI = nowIndex({ hourly: hh, timezone: d.timezone });
  const nowHour = hh.time[nowI] ? hh.time[nowI].slice(0, 13) : '';
  const dayCount = Math.min(DAILY_DAYS, dd.time.length);
  try{
  $('daily').innerHTML = dd.time.slice(0, dayCount).map((t, i) => {
    const cond = dd.shortForecast ? dd.shortForecast[i] : wmo(dd.weather_code[i])[0];
    const [ , icon] = wmo(dd.weather_code[i]);
    const indices = dayHourlyIndices(hh, t);
    const stats = dayExtrema(indices, hh);
    const lo = Math.round(dd.temperature_2m_min[i]);
    const hi = Math.round(dd.temperature_2m_max[i]);
    const loAt = stats.loAt || '';
    const hiAt = stats.hiAt || '';
    const pop = dd.precipitation_probability_max[i] ?? 0;
    const rainAmt = fmtPrecipSum(stats.rain);
    const rainMeta = rainAmt
      ? 'Rain ' + rainAmt
      : (pop > 0 ? pop + '% rain' : '');
    const snowMeta = fmtSnowSum(stats.snow) || (dd.snowfall_sum?.[i] > 0.05 ? fmtSnowSum(dd.snowfall_sum[i]) : '');
    const windSpd = stats.wind
      || Math.round(dd.wind_speed_10m_max?.[i] ?? dd.wind_gusts_10m_max?.[i] ?? 0);
    const windMeta = windSpd ? 'Wind ~' + windSpd + ' ' + windUnit() : '';
    const metaParts = [snowMeta, rainMeta, windMeta].filter(Boolean);
    const dayDn = dayLabelFromDate(t, d.timezone);
    const title = '<span class="day-dn">' + esc(dayDn) + '</span> <span class="day-date">' + fmtDayDate(t) + '</span>';
    const summary = 'Low <strong>' + lo + '°</strong>'
      + (loAt ? ' at ' + loAt : '')
      + ' · High <strong>' + hi + '°</strong>'
      + (hiAt ? ' at ' + hiAt : '');
    const compactTicks = window.matchMedia('(max-width:860px)').matches;
    const nowPct = isForecastToday(t, d.timezone) && indices.length
      ? nowPctInDayTimeline(indices, hh, d.timezone)
      : null;
    const timeline = buildDayTimeline(indices, hh, dd, i, { compactTicks, nowHour, nowPct });
    const gust = Math.round(dd.wind_gusts_10m_max[i]);
    const uv = (dd.uv_index_max[i] ?? 0).toFixed(0);
    const precipWin = dayPrecipWindow(indices, hh);
    const anomaly = dayClimoAnomaly(t, hi, lo, dd.precipitation_sum?.[i]);
    const record = dayClimoRecord(t, hi, lo);
    return '<article class="day-card' + (timeline.hourly ? '' : ' day-card-summary-only') + '" title="' + esc(cond) + ' · gusts ' + gust + ' ' + windUnit() + ' · UV ' + uv + '">'
      + '<div class="day-card-head">'
      + '<div class="day-card-title"><span class="day-ic" aria-hidden="true">' + icon + '</span>' + title
      + '<span class="day-cond">' + esc(cond) + '</span></div>'
      + (metaParts.length ? '<div class="day-card-meta">' + metaParts.map(p => {
        const cls = /snow/i.test(p) ? ' class="day-snow"' : (/rain/i.test(p) ? ' class="day-rain"' : '');
        return '<span' + cls + '>' + esc(p) + '</span>';
      }).join('') + '</div>' : '')
      + '</div>'
      + '<div class="day-summary">' + summary
      + (anomaly ? '<div class="day-anomaly">' + esc(anomaly) + '</div>' : '')
      + (record || '')
      + (precipWin ? '<div class="day-precip-win">' + esc(precipWin) + '</div>' : '')
      + '</div>'
      + '<div class="day-timeline-wrap">'
      + (timeline.nowMark || '')
      + '<div class="day-cond-wrap">'
      + '<div class="day-cond-strip" role="img" aria-label="Hour-by-hour sky conditions for this day">' + timeline.segHtml + '</div>'
      + '</div>'
      + '<div class="day-temp-chart">'
      + timeline.chartHtml
      + timeline.ticksHtml
      + (timeline.hoverHtml || '')
      + timeline.note
      + '</div>'
      + '</div></article>';
  }).join('');
  }catch(e){
    console.error('renderDaily', e);
    $('daily').innerHTML = panelUnavail('api_error');
  }
  $('dailySource').textContent = (d.sources && d.sources.forecast === 'nws') ? 'NWS' : 'Open-Meteo';
  renderWinterOutlook(d);
}
function renderWinterOutlook(d){
  const box = $('winterOutlook');
  if(!box || !d) return;
  const dd = (d.om && d.om.daily) || d.daily;
  if(!dd) return;
  const snow = dd.snowfall_sum && dd.snowfall_sum[0];
  const hh = (d.om && d.om.hourly) || d.hourly;
  const i0 = hh ? nowIndex({ hourly: hh }) : 0;
  const snowDepth = d.om?.hourly?.snow_depth?.[i0] ?? d.hourly?.snow_depth?.[i0];
  const nwsText = (d.nwsDaily || []).map(p => (p.shortForecast || '') + ' ' + (p.detailedForecast || '')).join(' ').toLowerCase();
  const winterWords = /winter storm|ice storm|freezing rain|freezing drizzle|sleet|blizzard|heavy snow|snow accum|black ice|wind chill/i.test(nwsText);
  const temp = d.hourly.temperature_2m?.[i0];
  const wind = d.hourly.wind_speed_10m?.[i0];
  const windChill = (temp != null && wind != null && state.units === 'F' && temp < 50 && wind >= 3)
    ? Math.round(35.74 + 0.6215 * temp - 35.75 * Math.pow(wind, 0.16) + 0.4275 * temp * Math.pow(wind, 0.16))
    : null;
  const hasSnow = (snow != null && snow > 0.1) || (snowDepth != null && snowDepth > 0.05) || winterWords;
  if(!hasSnow && windChill == null){
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  const snowDisp = snow != null
    ? (state.units === 'F' ? (snow / 25.4).toFixed(1) + ' in' : snow.toFixed(1) + ' cm')
    : null;
  const stormTotals = snowStormTotals(dd);
  const depthDisp = snowDepth != null
    ? (state.units === 'F' ? (snowDepth * 3.281 / 12).toFixed(1) + ' in on ground' : snowDepth.toFixed(2) + ' m on ground')
    : null;
  let detail = '';
  if(snowDisp) detail += 'Modeled snowfall today: ' + snowDisp + '. ';
  if(stormTotals){
    const u = state.units === 'F' ? v => (v / 2.54).toFixed(1) + ' in' : v => v.toFixed(1) + ' cm';
    detail += 'Storm accumulation: ' + u(stormTotals.h48) + ' (48h)';
    if(stormTotals.h72 > stormTotals.h48 + 0.05) detail += ', ' + u(stormTotals.h72) + ' (72h)';
    detail += '. ';
  }
  if(depthDisp) detail += 'Snow depth: ' + depthDisp + '. ';
  if(/freezing rain|ice storm|sleet|black ice/i.test(nwsText)) detail += 'NWS mentions freezing precip or ice. ';
  if(windChill != null && windChill <= 10) detail += 'Wind chill near ' + windChill + '\u00B0F. ';
  if(isGreatLakesLoc(state.locations[state.active]) && /lake.effect|banded snow/i.test(nwsText)){
    detail += 'Lake-effect wording in NWS forecast. ';
  }
  if(winterWords && !detail) detail += 'NWS text mentions wintry precipitation.';
  const verdict = /blizzard|ice storm|heavy snow/i.test(nwsText) ? 'Significant winter weather possible'
    : (windChill != null && windChill <= 0) ? 'Bitter wind chills' : 'Wintry precipitation possible';
  box.innerHTML = '<div class="lbl">Winter weather</div>'
    + '<div class="verdict mid">' + esc(verdict) + '</div>'
    + '<div class="detail">' + esc(detail.trim()) + '</div>';
}

function renderForecastPeriod(p){
  const pop = p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value;
  const temp = nwsTempToDisp(p.temperature, p.temperatureUnit === 'C' ? 'C' : 'F');
  const wind = [p.windSpeed, p.windDirection].filter(Boolean).join(' ');
  const detail = p.detailedForecast || p.shortForecast || '';
  return '<article class="fc-period' + (p.isDaytime ? '' : ' fc-night') + '">'
    + '<header class="fc-head">'
    + '<span class="fc-badge">' + (p.isDaytime ? 'Day' : 'Night') + '</span>'
    + '<strong>' + esc(p.name) + '</strong>'
    + (temp != null ? '<span class="fc-temp">' + temp + '<small>' + degSym() + '</small></span>' : '')
    + '</header>'
    + '<div class="fc-short">' + esc(p.shortForecast) + (pop != null ? ' \u00B7 ' + pop + '% precip' : '') + '</div>'
    + '<div class="fc-detail">' + esc(detail) + '</div>'
    + (wind ? '<div class="fc-wind">Wind: ' + esc(wind) + '</div>' : '')
    + '</article>';
}

function renderExtendedBlock(periods, startIdx, renderPeriod){
  const extended = periods.slice(startIdx);
  if(!extended.length) return '';
  const teaser = extended.map(p => {
    const temp = nwsTempToDisp(p.temperature, p.temperatureUnit === 'C' ? 'C' : 'F');
    const shortName = (p.name || '').replace(/Night$/i, '').trim();
    return shortName + (temp != null ? ' ' + temp + degSym() : '');
  }).join(' \u00B7 ');
  return '<details class="fc-extended-block">'
    + '<summary><span class="fc-extended-title">Extended outlook \u00B7 days 4\u20137</span>'
    + '<span class="fc-extended-teaser">' + esc(teaser) + '</span></summary>'
    + '<div class="fc-extended-body">'
    + extended.map(p => renderPeriod(p)).join('')
    + '</div></details>';
}

function renderForecastText(d){
  const box = $('forecastText');
  const meta = $('forecastTextMeta');
  const loc = state.locations[state.active];
  const periods = d.nwsDaily;
  const FULL_PERIODS = 6;
  if(periods && periods.length){
    const office = d.nwsPoints && d.nwsPoints.cwa;
    const fcUrl = nwsPointForecastUrl(loc);
    meta.innerHTML = 'National Weather Service zone forecast'
      + (office ? ' \u00B7 office ' + esc(office) : '')
      + ' \u00B7 days 1\u20133 below \u00B7 tap to expand days 4\u20137'
      + ' \u00B7 <a href="' + fcUrl + '" target="_blank" rel="noopener">Full forecast on weather.gov</a>';
    const shown = periods.slice(0, 14);
    const near = shown.slice(0, FULL_PERIODS).map(p => renderForecastPeriod(p)).join('');
    const extended = shown.length > FULL_PERIODS ? renderExtendedBlock(shown, FULL_PERIODS, renderForecastPeriod) : '';
    box.innerHTML = near + extended;
    return;
  }
  meta.textContent = 'Open-Meteo modeled summary (NWS text forecast is US-only)';
  const parts = [];
  const dd = d.daily;
  const nearParts = [];
  const extParts = [];
  const extTeaser = [];
  for(let i = 0; i < Math.min(7, dd.time.length); i++){
    const [cond] = wmo(dd.weather_code[i]);
    const label = dayLabelFromDate(dd.time[i], d.timezone);
    const hi = Math.round(dd.temperature_2m_max[i]);
    const lo = Math.round(dd.temperature_2m_min[i]);
    const pp = dd.precipitation_probability_max[i];
    let text = label + ': ' + cond + '. High near ' + hi + '\u00B0, low around ' + lo + '\u00B0.';
    if(pp) text += ' Chance of precipitation ' + pp + '%.';
    if(i < 3){
      nearParts.push('<article class="fc-period"><header class="fc-head"><strong>' + esc(label) + '</strong>'
        + '<span class="fc-temp">' + hi + '\u00B0 / ' + lo + '\u00B0</span></header>'
        + '<div class="fc-detail">' + esc(text) + '</div></article>');
    } else {
      extTeaser.push(label + ' ' + hi + '/' + lo + degSym());
      extParts.push('<article class="fc-period"><header class="fc-head"><strong>' + esc(label) + '</strong>'
        + '<span class="fc-temp">' + hi + '\u00B0 / ' + lo + '\u00B0</span></header>'
        + '<div class="fc-detail">' + esc(text) + '</div></article>');
    }
  }
  const extBlock = extParts.length
    ? '<details class="fc-extended-block"><summary><span class="fc-extended-title">Extended outlook \u00B7 days 4\u20137</span>'
      + '<span class="fc-extended-teaser">' + esc(extTeaser.join(' \u00B7 ')) + '</span></summary>'
      + '<div class="fc-extended-body">' + extParts.join('') + '</div></details>'
    : '';
  box.innerHTML = nearParts.join('') + extBlock;
}

// ---------- moon (compact astronomical formulas, SunCalc-style) ----------
const EOBL = RAD * 23.4397;
const toDays = date => date / 86400000 - 0.5 + 2440588 - 2451545;
const rasc = (l, b) => Math.atan2(Math.sin(l) * Math.cos(EOBL) - Math.tan(b) * Math.sin(EOBL), Math.cos(l));
const decl = (l, b) => Math.asin(Math.sin(b) * Math.cos(EOBL) + Math.cos(b) * Math.sin(EOBL) * Math.sin(l));
const sidereal = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
function moonCoords(d){
  const L = RAD * (218.316 + 13.176396 * d),
        M = RAD * (134.963 + 13.064993 * d),
        F = RAD * (93.272 + 13.229350 * d);
  const l = L + RAD * 6.289 * Math.sin(M),
        b = RAD * 5.128 * Math.sin(F),
        dist = 385001 - 20905 * Math.cos(M); // km
  return { ra: rasc(l, b), dec: decl(l, b), dist };
}
function sunCoords(d){
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { ra: rasc(L, 0), dec: decl(L, 0) };
}
function moonPosition(date, lat, lon){
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const c = moonCoords(d), H = sidereal(d, lw) - c.ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi));
  return { alt: alt / RAD, az: (az / RAD + 180) % 360, dist: c.dist };
}
function moonIllumination(date){
  const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI };
}
const MOON_PHASES = [
  [0.0175,'New Moon','\u{1F311}'],[0.2325,'Waxing Crescent','\u{1F312}'],[0.2675,'First Quarter','\u{1F313}'],
  [0.4825,'Waxing Gibbous','\u{1F314}'],[0.5175,'Full Moon','\u{1F315}'],[0.7325,'Waning Gibbous','\u{1F316}'],
  [0.7675,'Last Quarter','\u{1F317}'],[0.9825,'Waning Crescent','\u{1F318}'],[1.01,'New Moon','\u{1F311}']
];
function phaseName(p){ return MOON_PHASES.find(x => p < x[0]) || MOON_PHASES[0]; }
function locDayStart(timezone){
  const now = new Date();
  const dayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  const probe = new Date(now.getTime());
  probe.setMinutes(0, 0, 0);
  for(let i = 0; i < 96; i++){
    const t = new Date(probe.getTime() - i * 15 * 60000);
    if(t.toLocaleDateString('en-CA', { timeZone: timezone }) !== dayStr) continue;
    const h = +new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour:'numeric', hour12:false }).format(t);
    const m = +new Intl.DateTimeFormat('en-US', { timeZone: timezone, minute:'numeric' }).format(t);
    if(h === 0 && m === 0) return t;
  }
  const fb = new Date(); fb.setHours(0, 0, 0, 0); return fb;
}
function moonRiseSet(lat, lon, timezone){
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = locDayStart(tz);
  let rise = null, set = null;
  let prev = moonPosition(start, lat, lon).alt;
  for(let m = 10; m <= 1440; m += 10){
    const t = new Date(start.getTime() + m * 60000);
    const alt = moonPosition(t, lat, lon).alt;
    if(prev <= 0 && alt > 0 && !rise) rise = t;
    if(prev > 0 && alt <= 0 && !set) set = t;
    prev = alt;
  }
  return { rise, set };
}
function renderMoon(loc){
  const now = new Date();
  const tz = (state.data && state.data.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ill = moonIllumination(now);
  const pos = moonPosition(now, loc.lat, loc.lon);
  const [ , pname, picon] = ['', ...phaseName(ill.phase).slice(1)];
  $('moonIcon').textContent = picon;
  $('moonPhase').textContent = pname;
  $('moonIllum').textContent = Math.round(ill.fraction * 100) + '% ILLUMINATED \u00B7 AGE ' + (ill.phase * 29.53).toFixed(1) + ' DAYS';
  $('moonCompass').innerHTML = '<div class="sky-compass-wrap" style="margin-top:14px">'
    + moonCompassHtml(pos.az, pos.alt, 48)
    + '<div class="sky-compass-meta"><strong>Moon in the sky</strong><br>'
    + pos.alt.toFixed(1) + '\u00B0 ' + (pos.alt > 0 ? 'above' : 'below') + ' horizon \u00B7 '
    + compass(pos.az) + ' (' + Math.round(pos.az) + '\u00B0)</div></div>';
  const rs = moonRiseSet(loc.lat, loc.lon, tz);
  const fmt = t => t ? t.toLocaleTimeString([], { hour:'numeric', minute:'2-digit', timeZone: tz }) : '\u2014 (none today)';
  const dist = state.units === 'F'
    ? Math.round(pos.dist * 0.621371).toLocaleString() + '<small> mi</small>'
    : Math.round(pos.dist).toLocaleString() + '<small> km</small>';
  const daysToFull = ((0.5 - ill.phase + 1) % 1) * 29.53;
  const rows = [
    ['Altitude', pos.alt.toFixed(1) + '<small>\u00B0 ' + (pos.alt > 0 ? 'above' : 'below') + ' horizon</small>'],
    ['Azimuth', Math.round(pos.az) + '<small>\u00B0 ' + compass(pos.az) + '</small>'],
    ['Moonrise', fmt(rs.rise)],
    ['Moonset', fmt(rs.set)],
    ['Distance', dist],
    ['Next full', daysToFull < 0.5 ? 'Tonight' : Math.round(daysToFull) + '<small> days</small>']
  ];
  $('moonMetrics').innerHTML = rows.map(r =>
    '<div class="metric"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>'
  ).join('');
}





// ---------- advanced atmosphere ----------
function precipTypeAt(d, i){
  const h = (d.om && d.om.hourly) || d.hourly;
  if(!h) return '\u2014';
  const snow = h.snowfall?.[i] ?? 0;
  const rain = h.precipitation?.[i] ?? 0;
  const code = h.weather_code?.[i] ?? 0;
  if(snow > 0.05 && rain < 0.02) return 'Snow';
  if(code >= 71 && code <= 77) return 'Snow';
  if(code >= 56 && code <= 57) return 'Freezing drizzle';
  if(code >= 66 && code <= 67) return 'Freezing rain';
  if(code >= 95) return 'Thunderstorm';
  if(code >= 85) return 'Rain showers';
  if(rain > 0.01 || code >= 51) return 'Rain';
  return 'None';
}
function srhProxyAt(d, i){
  const h = (d.om && d.om.hourly) || d.hourly;
  if(!h) return null;
  const s10 = h.wind_speed_10m?.[i] ?? 0;
  const s80 = h.wind_speed_80m?.[i];
  const s180 = h.wind_speed_180m?.[i];
  const d10 = h.wind_direction_10m?.[i] ?? 0;
  const d80 = h.wind_direction_80m?.[i];
  const d180 = h.wind_direction_180m?.[i];
  if(s80 == null || d80 == null) return null;
  const spdShear = Math.abs(s80 - s10) + (s180 != null ? Math.abs(s180 - s80) * 0.5 : 0);
  let dirDiff = Math.abs((d180 ?? d80) - d10);
  if(dirDiff > 180) dirDiff = 360 - dirDiff;
  const proxy = Math.round(spdShear * (1 + dirDiff / 90) * 12);
  const cat = proxy >= 150 ? 'Strong' : proxy >= 75 ? 'Moderate' : 'Weak';
  return { proxy, cat, note: cat + ' low-level shear profile (HRRR wind)' };
}
function renderAdvanced(d){
  const om = d.om || d;
  const i = nowIndex(d);
  const h = om.hourly;
  const ft = m => (Math.round(m * 3.281 / 100) * 100).toLocaleString();
  const sunToday = (d.daily.sunshine_duration[0] ?? 0) / 3600;
  const dayLen = (d.daily.daylight_duration[0] ?? 0) / 3600;
  const snow = h.snow_depth[i] ?? 0; // meters
  const snowVal = state.units === 'F' ? (snow * 39.37).toFixed(1) + '<small> in</small>' : (snow * 100).toFixed(0) + '<small> cm</small>';
  const blh = h.boundary_layer_height[i] ?? 0;
  const windAt = lvl => Math.round(h['wind_speed_' + lvl][i]) + '<small> ' + windUnit() + ' ' + compass(h['wind_direction_' + lvl][i]) + '</small>';
  const cape = Math.round(h.cape?.[i] ?? 0);
  const frz = h.freezing_level_height?.[i];
  const srh = srhProxyAt(d, i);
  const ptype = precipTypeAt(d, i);
  const rows = [
    ['Precip type (now)', ptype + '<small> (HRRR/model)</small>'],
    ['CAPE (HRRR)', cape + '<small> J/kg</small>'],
    ['Freezing level', frz != null ? (state.units === 'F' ? Math.round(frz * 3.28084).toLocaleString() + '<small> ft</small>' : Math.round(frz).toLocaleString() + '<small> m</small>') : '\u2014'],
    ['Wet bulb', Math.round(h.wet_bulb_temperature_2m[i]) + '<small>' + degSym() + '</small>'],
    ['SRH proxy', srh ? srh.proxy + '<small> m\u00B2/s\u00B2 \u00B7 ' + srh.cat + '</small>' : '\u2014'],
    ['Boundary layer', (state.units === 'F' ? ft(blh) + '<small> ft (HRRR)</small>' : Math.round(blh).toLocaleString() + '<small> m (HRRR)</small>')],
    ['Sunshine today', sunToday.toFixed(1) + '<small> / ' + dayLen.toFixed(1) + ' h daylight</small>'],
    ['Snow depth', snowVal],
    ['Soil temp 0cm', Math.round(h.soil_temperature_0cm[i]) + '<small>' + degSym() + '</small>'],
    ['Soil moisture', (h.soil_moisture_0_to_1cm[i] ?? 0).toFixed(2) + '<small> m\u00B3/m\u00B3</small>'],
    ['Wind 80 m', windAt('80m')],
    ['Wind 120 m', windAt('120m')],
    ['Wind 180 m', windAt('180m')]
  ];
  $('advMetrics').innerHTML = rows.map(r =>
    '<div class="metric"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>'
  ).join('');
}






// ---------- units toggle ----------
$('unitF').addEventListener('click', () => setUnits('F'));
$('unitC').addEventListener('click', () => setUnits('C'));
function setUnits(u){
  if(state.units === u) return;
  state.units = u; persist();
  $('unitF').classList.toggle('on', u === 'F');
  $('unitC').classList.toggle('on', u === 'C');
  loadAll();
}
$('refreshBtn').addEventListener('click', loadAll);

function weatherCacheKey(loc){
  return 'ew_wx_' + locKey(loc);
}
const HOURLY_CACHE_KEYS = [
  'time', 'temperature_2m', 'dew_point_2m', 'pressure_msl', 'cape', 'weather_code', 'is_day',
  'precipitation_probability', 'wind_direction_10m', 'wind_speed_10m', 'cloud_cover',
  'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'visibility', 'uv_index',
  'freezing_level_height', 'precipitation', 'shortForecast'
];
function snapshotHourly(h, slots){
  const n = Math.min(slots, h.time?.length || 0);
  const out = { anchoredNow: !!h.anchoredNow };
  HOURLY_CACHE_KEYS.forEach(k => {
    if(h[k] && h[k].length) out[k] = h[k].slice(0, n);
  });
  return out;
}
function cacheWeatherSnapshot(loc, d){
  if(!loc || !d || !d.hourly) return;
  try{
    store.set(weatherCacheKey(loc), {
      t: Date.now(),
      timezone: d.timezone,
      timezone_abbreviation: d.timezone_abbreviation,
      current: d.current,
      hourly: snapshotHourly(d.hourly, 30),
      daily: d.daily,
      sources: d.sources,
      metarId: d.metar?.id || null,
      nwsRadar: d.nwsPoints?.radarStation || null
    });
  }catch(e){}
}
function normalizeCachedHourly(h){
  if(!h) return { time: [], anchoredNow: false };
  const out = Object.assign({ anchoredNow: !!h.anchoredNow }, h);
  if(!out.time) out.time = [];
  HOURLY_CACHE_KEYS.forEach(k => { if(!out[k]) out[k] = []; });
  return out;
}
function loadCachedWeather(loc){
  try{
    const hit = store.get(weatherCacheKey(loc));
    if(!hit || Date.now() - hit.t > 3 * 60 * 60 * 1000) return null;
    return {
      timezone: hit.timezone,
      timezone_abbreviation: hit.timezone_abbreviation,
      current: hit.current,
      hourly: normalizeCachedHourly(hit.hourly),
      daily: hit.daily,
      sources: hit.sources || { forecast: 'cached', current: 'cached' },
      metarId: hit.metarId || null,
      nwsRadar: hit.nwsRadar || null,
      cached: true
    };
  }catch(e){ return null; }
}
function setOfflineBadge(on){
  const el = $('offlineBadge');
  if(el) el.classList.toggle('show', !!on);
  setCachedMode(!!on);
}
function setCachedMode(on){
  const cached = !!(on && state.data && state.data.cached);
  document.querySelectorAll('.panel-status').forEach(el => el.classList.toggle('is-cached', cached));
}
function renderWeatherUi(d){
  renderCurrent(d);
  renderLight(d);
  renderHourly(d);
  $('lastUpdate').textContent = (d.cached ? 'CACHED' : 'FORECAST') + ' '
    + new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})
    + (d.timezone_abbreviation ? ' \u00B7 TZ ' + d.timezone_abbreviation : '');
}
async function refreshWeatherSoft(){
  const loc = state.locations[state.active];
  if(!loc || loadAllBusy) return false;
  loadAllBusy = true;
  try{
    const fetched = await fetchWeather(loc, { fastPath: true });
    if(!fetched || state.locations[state.active] !== loc) return false;
    state.data = fetched;
    try{ cacheWeatherSnapshot(loc, fetched); }catch(e){}
    try{ renderWeatherUi(fetched); }catch(e){ console.error('renderWeatherUi', e); }
    prefetchImpactPanels(loc, fetched);
    if(isLikelyUS(loc) && state.data){
      refreshStormTracking(loc, state.data);
      refreshFireWeather(loc, state.data);
    }
    ensureTabPanels(getAppTab());
    return true;
  }catch(e){
    console.error('refreshWeatherSoft', e);
    return false;
  }finally{
    loadAllBusy = false;
  }
}
async function loadAll(){
  if(loadAllBusy) return;
  loadAllBusy = true;
  try{
  const loc = state.locations[state.active];
  applyLocRadarPrefs(loc, { reloadRadar: getAppTab() === 'radar' });
  const reloadBuoy = tabPanelsLoaded.impact;
  const reloadMesonet = tabPanelsLoaded.more;
  syncMarinePanelVisibility(loc);
  waterVerdictState.marine = null;
  waterVerdictState.coastal = null;
  renderWaterVerdict();
  getTideStations().then(() => syncCoastalPanelVisibility(loc));
  setOfflineBadge(false);
  setCachedMode(false);
  stormState.loaded = false;
  stormTrackGen++;
  const setup = $('stormSetup');
  if(setup) setup.hidden = true;
  resetTabPanelsLoaded();
  syncBuoyForLocation(loc, reloadBuoy);
  $('content').classList.add('loading');
  let fetched = null;
  try{
    fetched = await fetchWeather(loc, { fastPath: true });
  }catch(e){
    console.error('fetchWeather', e);
  }
  if(fetched){
    state.data = fetched;
    try{ cacheWeatherSnapshot(loc, fetched); }catch(e){}
    try{
      renderWeatherUi(fetched);
    }catch(e){
      console.error('renderWeatherUi', e);
      $('nowCond').textContent = 'Forecast loaded — retry refresh if display looks wrong.';
    }
    $('content').classList.remove('loading');
    loadAlerts(loc);
    prefetchImpactPanels(loc, fetched);
    if(isLikelyUS(loc) && state.data){
      refreshStormTracking(loc, state.data);
      refreshFireWeather(loc, state.data);
    }
    if(reloadMesonet) refreshMesonetIfNeeded(loc, { moreTab: true });
    enrichWeatherBackground(loc);
    if(map) initMap(loc);
    ensureTabPanels(getAppTab());
    scheduleIdleForecastPrefetch();
    scheduleIdleImpactPrefetch(loc);
    scheduleIdleStormPrefetch(loc);
    return;
  }
  const cached = loadCachedWeather(loc);
  if(cached){
    state.data = cached;
    setOfflineBadge(true);
    setCachedMode(true);
    try{
      renderWeatherUi(cached);
    }catch(e){
      console.error('renderWeatherUi cached', e);
      $('nowCond').textContent = cached.current?.condition || cached.current?.textDescription || 'Cached conditions';
    }
    prefetchImpactPanels(loc, cached);
    ensureTabPanels(getAppTab());
  }else{
    $('nowCond').textContent = 'Could not load weather \u2014 check connection and retry.';
    $('lastUpdate').textContent = 'LOAD FAILED';
  }
  $('content').classList.remove('loading');
  }finally{
    loadAllBusy = false;
  }
}

// auto-refresh every 15 min
setInterval(loadAll, 15 * 60 * 1000);

// ---------- PWA ----------
let deferredInstall = null;
let swReg = null;
const SW_RELOAD_KEY = 'sw-reload';
const SW_BG_READY = 'sw-bg-ready';

function isStandalonePwa(){
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isIosDevice(){
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isAndroidDevice(){
  return /Android/i.test(navigator.userAgent);
}

function setupInstallHint(){
  const hint = $('installHint');
  const body = $('installHintBody');
  const summary = $('installHintSummary');
  if(!hint || !body) return;
  if(isStandalonePwa()){
    hint.hidden = true;
    return;
  }
  let html = '';
  let title = 'Add to home screen';
  if(isIosDevice()){
    title = 'Add to iPhone or iPad home screen';
    html = '<ol>'
      + '<li>Open this page in <strong>Safari</strong> (other browsers cannot add home screen icons on iOS).</li>'
      + '<li>Tap the <strong>Share</strong> button <span aria-hidden="true">(□↑)</span> at the bottom of the screen.</li>'
      + '<li>Scroll the sheet and tap <strong>Add to Home Screen</strong>.</li>'
      + '<li>Tap <strong>Add</strong> in the top corner.</li>'
      + '</ol>'
      + '<p class="install-hint-note">If the icon looks wrong, remove the old shortcut first, then add it again.</p>';
  } else if(isAndroidDevice()){
    title = 'Add to Android home screen';
    html = '<ol>'
      + '<li>Tap <strong>Install app</strong> above if Chrome offers it.</li>'
      + '<li>Otherwise open the browser menu <span aria-hidden="true">(⋮)</span> and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>'
      + '<li>Confirm when prompted.</li>'
      + '</ol>';
  } else {
    title = 'Install on this device';
    html = '<ol>'
      + '<li>Tap <strong>Install app</strong> above if your browser shows it.</li>'
      + '<li>In Chrome or Edge, you can also use the install icon in the address bar.</li>'
      + '<li>On mobile, use your browser menu to add the site to your home screen.</li>'
      + '</ol>';
  }
  if(summary) summary.textContent = title;
  body.innerHTML = html;
  hint.hidden = false;
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  const btn = $('installBtn');
  btn.style.display = 'inline';
  const hint = $('installHint');
  if(hint) hint.hidden = true;
  btn.onclick = ev => {
    ev.preventDefault();
    if(deferredInstall){ deferredInstall.prompt(); deferredInstall = null; btn.style.display = 'none'; setupInstallHint(); }
  };
});

function prefetchShell(){
  fetch(location.href, { cache: 'no-store' }).catch(() => {});
}

function markBackgroundReady(){
  sessionStorage.setItem(SW_BG_READY, '1');
}

function consumeBackgroundReady(){
  if(!sessionStorage.getItem(SW_BG_READY)) return false;
  sessionStorage.removeItem(SW_BG_READY);
  return true;
}

function showSwUpdateBar(reg, msg){
  document.querySelectorAll('.sw-update').forEach(bar => {
    const text = bar.querySelector('[data-sw-text]');
    if(text && msg) text.textContent = msg;
    bar.classList.add('show');
    const btn = bar.querySelector('[data-sw-btn]');
    if(btn) btn.onclick = () => applySwUpdate(reg, true);
  });
}

function activateWaitingWorker(reg){
  const waiting = reg.waiting;
  if(!waiting) return false;
  prefetchShell();
  waiting.postMessage({ type:'SKIP_WAITING' });
  return true;
}

function isPageAtTop(){
  return window.scrollY <= 48;
}

function onSwUpdateReady(reg){
  prefetchShell();
  if(document.visibilityState === 'hidden'){
    activateWaitingWorker(reg);
    return;
  }
  showSwUpdateBar(reg, 'Update ready — tap Refresh or switch away briefly');
}

function hideSwUpdateBars(){
  document.querySelectorAll('.sw-update').forEach(bar => bar.classList.remove('show'));
}

function applySwUpdate(reg, immediate){
  if(immediate){
    hideSwUpdateBars();
    sessionStorage.setItem(SW_RELOAD_KEY, '1');
    if(activateWaitingWorker(reg)){
      setTimeout(() => {
        if(sessionStorage.getItem(SW_RELOAD_KEY)){
          sessionStorage.removeItem(SW_RELOAD_KEY);
          location.reload();
        }
      }, 1500);
      return;
    }
    location.reload();
    return;
  }
  activateWaitingWorker(reg);
}

async function forceAppUpdate(reg){
  const btn = $('updateAppBtn');
  const prev = btn ? btn.textContent : '';
  if(btn) btn.textContent = 'Checking…';
  try{
    await reg.update();
    if(reg.waiting){
      applySwUpdate(reg, true);
      return;
    }
    const ctrl = navigator.serviceWorker.controller;
    if(ctrl) ctrl.postMessage({ type:'CLEAR_CACHE' });
    prefetchShell();
    location.reload();
  }catch(e){
    console.warn('sw update', e);
    location.reload();
  }finally{
    if(btn) btn.textContent = prev;
  }
}

async function migrateAppVersion(){
  const prev = store.get('st_app_ver');
  store.set('st_app_ver', APP_VERSION);
  if(prev && prev !== APP_VERSION){
    try{
      if(navigator.serviceWorker?.controller)
        navigator.serviceWorker.controller.postMessage({ type:'CLEAR_CACHE' });
    }catch(e){ console.warn('sw migrate', e); }
  }
  return false;
}

async function initServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(sessionStorage.getItem(SW_RELOAD_KEY)){
      sessionStorage.removeItem(SW_RELOAD_KEY);
      location.reload();
    }
  });
  try{
    swReg = await navigator.serviceWorker.register('sw.js?v=' + APP_VERSION);
    swReg.addEventListener('updatefound', () => {
      const nw = swReg.installing;
      if(!nw) return;
      nw.addEventListener('statechange', () => {
        if(nw.state === 'installed' && navigator.serviceWorker.controller)
          onSwUpdateReady(swReg);
      });
    });
    if(swReg.waiting) onSwUpdateReady(swReg);
    const updateBtn = $('updateAppBtn');
    if(updateBtn){
      updateBtn.addEventListener('click', e => {
        e.preventDefault();
        forceAppUpdate(swReg);
      });
    }
    setTimeout(() => { if(swReg) swReg.update().catch(() => {}); }, 15000);
    setInterval(() => { if(swReg) swReg.update().catch(() => {}); }, 45 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if(!swReg) return;
      if(document.visibilityState === 'hidden'){
        lastHiddenAt = Date.now();
        if(swReg.waiting) activateWaitingWorker(swReg);
        return;
      }
      swReg.update().catch(() => {});
      if(swReg.waiting) onSwUpdateReady(swReg);
    });
  }catch(e){ console.warn('sw', e); }
}
