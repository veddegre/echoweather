/* ============================================================
   Echo Weather — personal weather app
   Sources: NWS/METAR (US), HRRR convective fields, Open-Meteo, IEM/RainViewer radar
   ============================================================ */

const APP_VERSION = '170';
const HOURLY_HOURS = 24;
const DAILY_DAYS = 5;
const LOC_SYNC_MIN_MI = 12;
let climoNormals = null;
let urlLocPinned = false;
let lastHiddenAt = 0;
let stormReportFilter = 'all';

// ---------- safe persistent storage (localStorage w/ in-memory fallback) ----------
const _mem = {};
const store = {
  get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : (_mem[k] ?? null); }catch(e){ return _mem[k] ?? null; } },
  set(k,v){ _mem[k]=v; try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const $ = id => document.getElementById(id);

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
  metar_history: 'METAR observation history could not be loaded for this station.',
  aurora_api: 'NOAA space weather data could not be reached — try again later.'
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
function timeAtSunAlt(lat, lon, date, targetAlt, rising){
  const base = new Date(date);
  base.setSeconds(0, 0);
  let lo = 0, hi = 24 * 60;
  for(let i = 0; i < 28; i++){
    const mid = (lo + hi) / 2;
    const t = new Date(base.getTime() + mid * 60000);
    const alt = sunAltAt(lat, lon, t);
    if((rising && alt < targetAlt) || (!rising && alt > targetAlt)) lo = mid;
    else hi = mid;
  }
  return new Date(base.getTime() + hi * 60000).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
}
function twilightTimes(lat, lon, date){
  return {
    civilDawn: timeAtSunAlt(lat, lon, date, -6, true),
    civilDusk: timeAtSunAlt(lat, lon, date, -6, false),
    nauticalDawn: timeAtSunAlt(lat, lon, date, -12, true),
    nauticalDusk: timeAtSunAlt(lat, lon, date, -12, false),
    astroDawn: timeAtSunAlt(lat, lon, date, -18, true),
    astroDusk: timeAtSunAlt(lat, lon, date, -18, false)
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
function getCurrentPositionFast(maxAge){
  return new Promise(resolve => {
    if(!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 9000, maximumAge: maxAge ?? 120000 }
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
  const pos = await getCurrentPositionFast(opts?.maximumAge ?? 180000);
  if(!pos) return false;
  const dist = haversineMi(loc.lat, loc.lon, pos.lat, pos.lon);
  if(dist < LOC_SYNC_MIN_MI) return false;
  const updated = await reverseGeocodeLoc(pos.lat, pos.lon);
  const idx = state.active;
  state.locations[idx] = Object.assign({}, loc, updated);
  persist();
  renderChips();
  syncUrl();
  showLocToast('Location updated to ' + updated.name);
  loadAll();
  return true;
}
function detectUserLocation(){
  return new Promise(resolve => {
    if(!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      resolve(await reverseGeocodeLoc(lat, lon));
    }, () => resolve(null), { timeout: 10000, maximumAge: 300000 });
  });
}
async function initFirstLocation(){
  if(savedLocs || parseUrlLoc()) return;
  $('nowCond').textContent = 'Detecting your location\u2026';
  const loc = await detectUserLocation();
  if(loc){
    state.locations = [loc];
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
  const loc = await detectUserLocation();
  btn.textContent = '\uD83D\uDCCD';
  if(loc) addLocation(loc);
  else searchNote('LOCATION UNAVAILABLE \u2014 USE SEARCH OR "LAT, LON"');
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
  if(/thunder/.test(s)) return 95;
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
async function fetchStationLatestObs(stationId){
  const or = await nwsFetch('https://api.weather.gov/stations/' + encodeURIComponent(stationId) + '/observations?limit=1');
  if(!or.ok) return null;
  const data = await or.json();
  const feat = (data.features || [])[0];
  if(!feat) return null;
  const p = feat.properties || {};
  return p.timestamp ? p : null;
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
  const windMs = nwsVal(p.windSpeed);
  const gustMs = nwsVal(p.windGust);
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
  }
}
function nowIndex(d){
  const now = Date.now();
  let best = 0, bestDiff = Infinity;
  for(let i = 0; i < d.hourly.time.length; i++){
    const diff = Math.abs(new Date(d.hourly.time[i]).getTime() - now);
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
function visibilityQuality(mi){
  if(mi < 1) return 'Very poor visibility';
  if(mi < 3) return 'Poor visibility';
  if(mi < 5) return 'Moderate visibility';
  if(mi <= 10) return 'Good visibility';
  return 'Excellent visibility';
}
function dewPointNote(temp, dew){
  const spread = temp - dew;
  if(spread <= 3) return 'Very muggy air';
  if(spread <= 8) return 'Humid \u2014 muggy feel likely';
  if(spread <= 15) return 'Comfortable humidity';
  return 'Dry air';
}
function uvVerdictCls(u){
  if(u < 3) return 'good';
  if(u < 6) return 'mid';
  if(u < 8) return 'mid';
  return 'warn';
}
function uvValCls(u){
  if(u < 3) return 'uv-low';
  if(u < 6) return 'uv-mid';
  if(u < 8) return 'uv-mid';
  return 'uv-high';
}
function uvExposureNote(u){
  if(u < 3) return 'Minimal sun protection needed.';
  if(u < 6) return 'Some protection if outside for long periods.';
  if(u < 8) return 'Seek shade midday \u00B7 sunscreen and hat advised.';
  if(u < 11) return 'Reduce sun exposure 10am\u20134pm \u00B7 protection essential.';
  return 'Avoid midday sun \u00B7 high burn risk in minutes.';
}
function uvDayChartHtml(h, nowIdx, todayKey){
  const pts = [];
  for(let j = 0; j < h.time.length; j++){
    if(h.time[j].slice(0, 10) !== todayKey) continue;
    pts.push({ idx: j, uv: h.uv_index?.[j] ?? 0, t: h.time[j] });
  }
  if(!pts.length) return '';
  const w = 300, height = 100, padL = 4, padR = 4, maxUv = 11;
  const chartW = w - padL - padR;
  const yOfNum = u => height - 6 - (Math.min(Math.max(u, 0), maxUv) / maxUv) * (height - 12);
  const yOf = u => yOfNum(u).toFixed(1);
  const xOf = k => (padL + (pts.length < 2 ? chartW / 2 : (k / (pts.length - 1)) * chartW)).toFixed(1);
  let bands = '';
  [3, 6, 8].forEach(v => {
    bands += '<line x1="' + padL + '" y1="' + yOf(v) + '" x2="' + (w - padR) + '" y2="' + yOf(v)
      + '" stroke="currentColor" stroke-opacity=".15" stroke-dasharray="2,3" vector-effect="non-scaling-stroke"/>';
  });
  const linePts = pts.map((p, k) => xOf(k) + ',' + yOf(p.uv));
  const area = padL + ',' + height + ' ' + linePts.join(' ') + ' ' + (w - padR) + ',' + height;
  const nowK = pts.findIndex(p => p.idx === nowIdx);
  let nowLine = '';
  if(nowK >= 0 && pts.length > 1){
    const nx = xOf(nowK);
    nowLine = '<line class="uv-day-now" x1="' + nx + '" y1="4" x2="' + nx + '" y2="' + (height - 4)
      + '" vector-effect="non-scaling-stroke"/>';
  }
  const tickStep = Math.max(1, Math.ceil(pts.length / 5));
  const tickIdx = [];
  for(let k = 0; k < pts.length; k += tickStep) tickIdx.push(k);
  if(tickIdx[tickIdx.length - 1] !== pts.length - 1) tickIdx.push(pts.length - 1);
  let xTicksSvg = '';
  tickIdx.forEach(k => {
    const x = xOf(k);
    xTicksSvg += '<line x1="' + x + '" y1="' + (height - 4) + '" x2="' + x + '" y2="' + (height - 10)
      + '" stroke="currentColor" stroke-opacity=".35" vector-effect="non-scaling-stroke"/>';
  });
  const peak = pts.reduce((a, p) => p.uv > a.uv ? p : a, pts[0]);
  const svg = '<svg viewBox="0 0 ' + w + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="UV index through today, peak '
    + peak.uv.toFixed(1) + '">'
    + bands + xTicksSvg
    + '<polygon points="' + area + '" fill="currentColor" opacity=".18"/>'
    + '<polyline points="' + linePts.join(' ') + '" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>'
    + nowLine + '</svg>';
  const tickHtml = '<div class="uv-day-ticks">' + tickIdx.map(k =>
    '<div class="uv-day-tick' + (pts[k].idx === nowIdx ? ' now' : '') + '">'
    + '<div class="uv-day-tick-t">' + (pts[k].idx === nowIdx ? 'Now' : hourLabelCompact(pts[k].t)) + '</div>'
    + '<div class="uv-day-tick-v">' + pts[k].uv.toFixed(1) + '</div>'
    + '</div>'
  ).join('') + '</div>';
  const yAxisHtml = '<div class="uv-y-axis" aria-hidden="true">'
    + [11, 8, 5, 0].map(v => '<span>' + v + '</span>').join('') + '</div>';
  return '<div class="uv-day-chart-inner">' + yAxisHtml
    + '<div class="uv-chart-body">' + svg + tickHtml + '</div></div>'
    + '<div class="uv-day-chart-note">Peak ' + peak.uv.toFixed(1) + ' near ' + hourLabelCompact(peak.t)
    + ' \u00B7 dashed lines at 3 / 6 / 8</div>';
}
function hourlyComfortNote(temp, dew){
  const spread = temp - dew;
  if(spread <= 3) return 'Muggy';
  if(spread <= 8) return 'Humid';
  if(spread <= 15) return 'Comfortable';
  return 'Dry air';
}
function exposureVisibility(d, c, i){
  const visUnit = (d.om && d.om.hourly_units && d.om.hourly_units.visibility) || 'm';
  let visMeters = c.visibility_m;
  if(visMeters == null && d.hourly.visibility) visMeters = d.hourly.visibility[i];
  if(visUnit === 'ft' && visMeters != null) visMeters = visMeters * 0.3048;
  const visMiNum = visMeters != null
    ? (state.units === 'F' ? visMeters / 1609.34 : visMeters / 1000)
    : null;
  const vis = visMiNum != null
    ? (state.units === 'F' ? visMiNum.toFixed(1) + '<small> mi</small>' : visMiNum.toFixed(1) + '<small> km</small>')
    : '\u2014';
  return { vis, visMiNum };
}
function renderExposure(d){
  if(!d || !d.hourly || !d.hourly.time || !d.hourly.time.length) return;
  const c = d.current || {};
  const i = nowIndex(d);
  const h = d.hourly;
  const uvSeries = h.uv_index || [];
  const uvNow = uvSeries[i] ?? 0;
  const todayKey = h.time[i].slice(0, 10);
  let peakIdx = i, peakUv = uvNow;
  for(let j = i; j < h.time.length && h.time[j].slice(0, 10) === todayKey; j++){
    const u = uvSeries[j] ?? 0;
    if(u > peakUv){ peakUv = u; peakIdx = j; }
  }
  const uvMax = (d.daily && d.daily.uv_index_max && d.daily.uv_index_max[0] != null)
    ? d.daily.uv_index_max[0]
    : peakUv;
  const uvV = $('uvVerdict');
  if(uvV){
    uvV.textContent = uvNow.toFixed(1) + ' \u2014 ' + uvCat(uvNow);
    uvV.className = 'verdict ' + uvVerdictCls(uvNow);
  }
  const peakStr = peakUv > 0.5
    ? 'Peak near ' + hourLabelCompact(h.time[peakIdx]) + ' (' + peakUv.toFixed(1) + ')'
    : 'Low sun angle today';
  const uvD = $('uvDetail');
  if(uvD) uvD.textContent = 'Today\u2019s max ' + Number(uvMax).toFixed(1) + ' \u00B7 ' + peakStr + ' \u00B7 ' + uvExposureNote(uvNow);

  const temp = c.temperature_2m ?? h.temperature_2m[i] ?? 0;
  const dewVal = c.dewpoint_c != null
    ? (state.units === 'F' ? Math.round(c.dewpoint_c * 9/5 + 32) : Math.round(c.dewpoint_c))
    : Math.round((h.dew_point_2m && h.dew_point_2m[i]) ?? 0);
  const rh = rhDisp(c.relative_humidity_2m ?? (h.relative_humidity_2m && h.relative_humidity_2m[i]));
  const { vis, visMiNum } = exposureVisibility(d, c, i);
  const wetRaw = h.wet_bulb_temperature_2m && h.wet_bulb_temperature_2m[i];
  const wetBulb = Math.round(wetRaw != null ? wetRaw : temp);
  const rows = [
    ['Humidity', rh + '<small>%</small>', dewPointNote(temp, dewVal)],
    ['Dew point', dewVal + '<small>' + degSym() + '</small>', dewPointNote(temp, dewVal)],
    ['Visibility', vis, visMiNum != null ? visibilityQuality(visMiNum) : ''],
    ['Wet bulb', wetBulb + '<small>' + degSym() + '</small>', 'Evaporative cooling / heat stress']
  ];
  const box = $('exposureMetrics');
  if(box){
    box.innerHTML = rows.map(r =>
      '<div class="metric"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div>'
      + (r[2] ? '<div class="s">' + esc(r[2]) + '</div>' : '') + '</div>'
    ).join('');
  }

  const uvChart = $('uvDayChart');
  const uvBlock = $('uvDayChartBlock');
  if(uvChart){
    const chartHtml = uvDayChartHtml(h, i, todayKey);
    if(chartHtml){
      uvChart.innerHTML = chartHtml;
      if(uvBlock) uvBlock.hidden = false;
    }else{
      uvChart.innerHTML = '';
      if(uvBlock) uvBlock.hidden = true;
    }
  }

  const strip = $('exposureUvStrip');
  if(!strip) return;
  const rhSeries = h.relative_humidity_2m || [];
  const tempSeries = h.temperature_2m || [];
  const dewSeries = h.dew_point_2m || [];
  const cells = [];
  for(let j = i; j < h.time.length && h.time[j].slice(0, 10) === todayKey; j++){
    const uv = uvSeries[j] ?? 0;
    const temp = Math.round(tempSeries[j] ?? 0);
    const dew = Math.round(dewSeries[j] ?? temp);
    const rh = rhDisp(rhSeries[j]);
    const comfort = hourlyComfortNote(temp, dew);
    cells.push('<div class="hour exposure-hour' + (j === i ? ' now-h' : '') + '">'
      + '<div class="t">' + (j === i ? 'Now' : hourLabelCompact(h.time[j])) + '</div>'
      + '<div class="ex-row"><span class="ex-k">UV</span><span class="ex-v ' + uvValCls(uv) + '">' + uv.toFixed(1) + '</span></div>'
      + '<div class="ex-row"><span class="ex-k">RH</span><span class="ex-v">' + rh + '%</span></div>'
      + '<div class="ex-note">' + comfort + (uv >= 3 ? ' \u00B7 ' + uvCat(uv) + ' sun' : '') + '</div>'
      + '</div>');
    if(cells.length >= 10) break;
  }
  strip.innerHTML = cells.length
    ? cells.join('')
    : '<div class="radar-note">Outdoor exposure stays low for the rest of today.</div>';
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
  $('nowMark').style.left = pc(minsOfDay(d.current?.time || d.hourly?.time?.[nowIndex(d)]));

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

  // sunset cloud outlook: find hourly index closest to sunset
  const ssKey = ss.slice(0,13);
  let si = d.hourly.time.findIndex(t => t.slice(0,13) === ssKey);
  if(si < 0) si = nowIndex(d);
  const lo = d.hourly.cloud_cover_low?.[si] ?? 0;
  const mid = d.hourly.cloud_cover_mid?.[si] ?? 0;
  const hi = d.hourly.cloud_cover_high?.[si] ?? 0;
  const pp = d.hourly.precipitation_probability?.[si] ?? 0;
  const mh = mid + hi;
  let verdict, cls, detail;
  if(pp > 60 || lo > 75){
    verdict = 'Poor \u2014 socked in'; cls = 'warn';
    detail = 'Low cloud ' + lo + '% / precip ' + pp + '% at sunset. Light will likely die flat.';
  } else if(mh >= 25 && mh <= 130 && lo < 40){
    verdict = 'High drama potential'; cls = 'good';
    detail = 'Mid ' + mid + '% + high ' + hi + '% cloud with a clear low deck (' + lo + '%). Good canvas for color \u2014 be in position by golden hour.';
  } else if(lo + mid + hi < 15){
    verdict = 'Clean but plain'; cls = 'mid';
    detail = 'Nearly cloudless (' + (lo+mid+hi) + '% total). Crisp horizon light, minimal sky color.';
  } else {
    verdict = 'Mixed \u2014 worth a look'; cls = 'mid';
    detail = 'Cloud L/M/H at sunset: ' + lo + '/' + mid + '/' + hi + '%, precip ' + pp + '%. Could break either way.';
  }
  const v = $('verdict');
  v.textContent = verdict; v.className = 'verdict ' + cls;
  $('verdictDetail').textContent = detail;
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
      + esc(new Date(d.hourly.time[j]).toLocaleString([], { hour:'numeric', minute:'2-digit' }))
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
  const foot = { left: 'Now', rightPrefix: 'Later' };
  const dU = degSym();
  const capePeak = capes.length ? Math.max(...capes) : 0;
  $('trends').innerHTML = [
    sparklineCard('Pressure', pres, 'pres', ' hPa', { ...foot, minSpan: 6 }),
    sparklineCard('Temperature', temps, 'temp', dU, { ...foot, minSpan: state.units === 'F' ? 8 : 5 }),
    sparklineCard('Dew point', dews, 'dew', dU, { ...foot, minSpan: state.units === 'F' ? 8 : 5 }),
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
  clear:'Clear', partly:'Partly', cloudy:'Cloudy', fog:'Fog', rain:'Rain', snow:'Snow', storm:'Storm'
};
function conditionBucket(code){
  const c = code ?? 2;
  if(c >= 95) return 'storm';
  if(c >= 85 || (c >= 71 && c <= 77)) return 'snow';
  if((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
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
  let bucket = conditionBucket(hourly.weather_code[indices[0]]);
  for(let j = 1; j <= indices.length; j++){
    const next = j < indices.length ? conditionBucket(hourly.weather_code[indices[j]]) : null;
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
  if(!indices.length) return { avg: null, lo: null, hi: null, loAt: '', hiAt: '', rain: 0, wind: 0 };
  let loI = indices[0], hiI = indices[0];
  let lo = hourly.temperature_2m[loI], hi = hourly.temperature_2m[hiI];
  let sum = 0, rain = 0, wind = 0;
  for(const i of indices){
    const t = hourly.temperature_2m[i];
    sum += t;
    if(t < lo){ lo = t; loI = i; }
    if(t > hi){ hi = t; hiI = i; }
    rain += hourly.precipitation[i] ?? 0;
    wind = Math.max(wind, hourly.wind_speed_10m[i] ?? 0);
  }
  return {
    avg: sum / indices.length,
    lo, hi,
    loAt: hourLabel(hourly.time[loI]),
    hiAt: hourLabel(hourly.time[hiI]),
    rain, wind: Math.round(wind)
  };
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
function dayTempSparkline(temps, w, h){
  const vals = temps.filter(v => v != null && !isNaN(v));
  if(!vals.length) return '';
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = vals.length < 2 ? w / 2 : (i / (vals.length - 1)) * w;
    const y = h - 2 - ((v - min) / span) * (h - 4);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  const line = pts.join(' ');
  const area = '0,' + h + ' ' + line + ' ' + w + ',' + h;
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">'
    + '<polygon points="' + area + '" fill="currentColor" opacity=".14"/>'
    + '<polyline points="' + line + '" fill="none" stroke="currentColor" stroke-width="1.75" vector-effect="non-scaling-stroke"/></svg>';
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
      ? '<div class="day-now" style="left:' + nowPct.toFixed(2) + '%" title="Current time">'
        + '<span class="day-now-lbl">Now</span></div>'
      : '';
    const temps = indices.map(j => hh.temperature_2m[j]);
    const maxTicks = compactTicks ? 6 : 12;
    const tickStep = Math.max(1, Math.ceil(indices.length / maxTicks));
    const tickParts = [];
    for(let j = 0; j < indices.length; j += tickStep){
      const idx = indices[j];
      const hrKey = hh.time[idx].slice(0, 13);
      const isNow = hrKey === nowHour;
      const tickLbl = compactTicks ? hourLabelCompact(hh.time[idx]) : hourLabel(hh.time[idx]);
      tickParts.push('<div class="day-tick' + (isNow ? ' now' : '') + '">'
        + '<div class="day-tick-t">' + tickLbl + '</div>'
        + '<div class="day-tick-v">' + Math.round(hh.temperature_2m[idx]) + '°</div>'
        + '</div>');
    }
    return {
      hourly: true,
      segHtml: segHtml,
      nowMark,
      temps,
      ticksHtml: tickParts.length ? '<div class="day-ticks">' + tickParts.join('') + '</div>' : '',
      note: ''
    };
  }
  const bucket = conditionBucket(dd.weather_code[i]);
  const lo = dd.temperature_2m_min[i];
  const hi = dd.temperature_2m_max[i];
  const segHtml = '<div class="day-seg dc-' + bucket + '" style="width:100%" title="' + esc(COND_BUCKETS[bucket]) + '">'
    + '<span>' + esc(COND_BUCKETS[bucket]) + '</span></div>';
  const ticksHtml = '<div class="day-ticks">'
    + '<div class="day-tick"><div class="day-tick-t">Low</div><div class="day-tick-v">' + Math.round(lo) + '°</div></div>'
    + '<div class="day-tick"><div class="day-tick-t">High</div><div class="day-tick-v">' + Math.round(hi) + '°</div></div>'
    + '</div>';
  return {
    hourly: false,
    segHtml,
    nowMark: '',
    temps: [lo, hi],
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
    if(pop >= 35 || precip > 0.1 || code >= 51){
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
  if(blocks.length === 1) return a === b ? 'Rain possible ~' + fmt(a) : 'Rain likely ' + fmt(a) + '\u2013' + fmt(b);
  return 'Rain possible at times';
}
function dayClimoAnomaly(dateStr, hi, lo){
  if(!climoNormals) return '';
  const key = dateStr.slice(5);
  const n = climoNormals[key];
  if(!n || n.hi == null) return '';
  const toDisp = c => state.units === 'F' ? Math.round(c * 9 / 5 + 32) : Math.round(c);
  const dHi = toDisp(hi) - toDisp(n.hi);
  if(Math.abs(dHi) < 3) return 'Near normal high';
  return (dHi > 0 ? '+' : '') + dHi + '\u00B0 vs 10-yr avg high';
}
async function fetchClimoNormals(loc){
  const cacheKey = 'st_climo_' + loc.lat.toFixed(1) + '_' + loc.lon.toFixed(1);
  const hit = store.get(cacheKey);
  if(hit && Date.now() - hit.t < 30 * 24 * 3600 * 1000) return hit.data;
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - 9;
  const url = 'https://archive-api.open-meteo.com/v1/archive'
    + '?latitude=' + Number(loc.lat).toFixed(4) + '&longitude=' + Number(loc.lon).toFixed(4)
    + '&start_date=' + startYear + '-01-01&end_date=' + endYear + '-12-31'
    + '&daily=temperature_2m_max,temperature_2m_min&timezone=auto';
  try{
    const r = await fetch(url);
    if(!r.ok) return null;
    const j = await r.json();
    const byDoy = {};
    (j.daily?.time || []).forEach((t, i) => {
      const doy = t.slice(5);
      if(!byDoy[doy]) byDoy[doy] = { hi: [], lo: [] };
      const hi = j.daily.temperature_2m_max[i], lo = j.daily.temperature_2m_min[i];
      if(hi != null) byDoy[doy].hi.push(hi);
      if(lo != null) byDoy[doy].lo.push(lo);
    });
    const normals = {};
    Object.keys(byDoy).forEach(doy => {
      const b = byDoy[doy];
      const avg = arr => arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : null;
      normals[doy] = { hi: avg(b.hi), lo: avg(b.lo) };
    });
    store.set(cacheKey, { t: Date.now(), data: normals });
    return normals;
  }catch(e){ return null; }
}
async function loadClimoNormals(loc){
  climoNormals = await fetchClimoNormals(loc);
  if(state.data) renderDaily(state.data);
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
  const hh = (d.om && d.om.hourly) || d.hourly;
  if(!dd || !dd.time || !dd.time.length || !hh || !hh.time){
    $('daily').innerHTML = '<p class="radar-note">Daily forecast unavailable.</p>';
    $('dailySource').textContent = '';
    return;
  }
  const nowI = nowIndex({ hourly: hh });
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
    const windSpd = stats.wind
      || Math.round(dd.wind_speed_10m_max?.[i] ?? dd.wind_gusts_10m_max?.[i] ?? 0);
    const windMeta = windSpd ? 'Wind ~' + windSpd + ' ' + windUnit() : '';
    const metaParts = [rainMeta, windMeta].filter(Boolean);
    const title = i === 0
      ? '<span class="day-dn">Today</span> <span class="day-date">' + fmtDayDate(t) + '</span>'
      : '<span class="day-dn">' + fmtDayWeekday(t) + '</span> <span class="day-date">' + fmtDayDate(t) + '</span>';
    const summary = 'Low <strong>' + lo + '°</strong>'
      + (loAt ? ' at ' + loAt : '')
      + ' · High <strong>' + hi + '°</strong>'
      + (hiAt ? ' at ' + hiAt : '');
    const compactTicks = window.matchMedia('(max-width:860px)').matches;
    const nowPct = i === 0 ? (nowMinsInTz(d.timezone) / 1440) * 100 : null;
    const timeline = buildDayTimeline(indices, hh, dd, i, { compactTicks, nowHour, nowPct });
    const gust = Math.round(dd.wind_gusts_10m_max[i]);
    const uv = (dd.uv_index_max[i] ?? 0).toFixed(0);
    const precipWin = dayPrecipWindow(indices, hh);
    const anomaly = dayClimoAnomaly(t, hi, lo);
    return '<article class="day-card' + (timeline.hourly ? '' : ' day-card-summary-only') + '" title="' + esc(cond) + ' · gusts ' + gust + ' ' + windUnit() + ' · UV ' + uv + '">'
      + '<div class="day-card-head">'
      + '<div class="day-card-title"><span class="day-ic" aria-hidden="true">' + icon + '</span>' + title
      + '<span class="day-cond">' + esc(cond) + '</span></div>'
      + (metaParts.length ? '<div class="day-card-meta">' + metaParts.map(p => {
        const cls = /rain/i.test(p) ? ' class="day-rain"' : '';
        return '<span' + cls + '>' + esc(p) + '</span>';
      }).join('') + '</div>' : '')
      + '</div>'
      + '<div class="day-summary">' + summary
      + (anomaly ? '<div class="day-anomaly">' + esc(anomaly) + '</div>' : '')
      + (precipWin ? '<div class="day-precip-win">' + esc(precipWin) + '</div>' : '')
      + '</div>'
      + '<div class="day-timeline-wrap">'
      + '<div class="day-cond-wrap">'
      + (timeline.nowMark || '')
      + '<div class="day-cond-strip" role="img" aria-label="Hour-by-hour sky conditions for this day">' + timeline.segHtml + '</div>'
      + '</div>'
      + '<div class="day-temp-chart">'
      + '<div class="day-temp-line">' + dayTempSparkline(timeline.temps, 320, 36) + '</div>'
      + timeline.ticksHtml
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
  const loc = state.locations[state.active];
  if(loc && forecastNeedsNbmStrip(d)) loadForecastNbmStrip(loc, d);
  else if($('forecastNbmStrip')){ $('forecastNbmStrip').hidden = true; $('forecastNbmStrip').innerHTML = ''; }
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
  const depthDisp = snowDepth != null
    ? (state.units === 'F' ? (snowDepth * 3.281 / 12).toFixed(1) + ' in on ground' : snowDepth.toFixed(2) + ' m on ground')
    : null;
  let detail = '';
  if(snowDisp) detail += 'Modeled snowfall today: ' + snowDisp + '. ';
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
    const fcUrl = 'https://forecast.weather.gov/MapClick.php?lat=' + loc.lat + '&lon=' + loc.lon;
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
    const label = i === 0 ? 'Today' : dayName(dd.time[i]);
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
  $('moonCompass').innerHTML = '<div class="sky-compass-wrap" style="margin-top:0">'
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

// ---------- air quality (AirNow US + Open-Meteo fallback) ----------
function fmtVal(v){
  return v == null || v === '' ? '\u2014' : v;
}
async function fetchAirNow(loc){
  if(!isLikelyUS(loc)) return null;
  try{
    const proxy = '/api/airnow?latitude=' + loc.lat + '&longitude=' + loc.lon + '&distance=50';
    const r = await fetchTimeout(proxy, {}, 8000);
    if(!r.ok) return null;
    const j = await r.json();
    if(!Array.isArray(j) || !j.length) return null;
    const site = j[0].ReportingArea || j[0].SiteName || 'Nearest monitor';
    const state = j[0].StateCode ? ', ' + j[0].StateCode : '';
    const params = j.map(rec => ({
      name: rec.ParameterName || '?',
      aqi: rec.AQI,
      category: rec.Category?.Name || '\u2014'
    })).filter(p => p.aqi != null);
    if(!params.length) return null;
    const maxAqi = Math.max(...params.map(p => p.aqi));
    const slat = parseFloat(j[0].Latitude), slon = parseFloat(j[0].Longitude);
    let distMi = null, dir = '';
    if(Number.isFinite(slat) && Number.isFinite(slon)){
      distMi = Math.round(haversineMi(loc.lat, loc.lon, slat, slon));
      dir = compass(bearingDeg(loc.lat, loc.lon, slat, slon));
    }
    return { site: site + state, params, aqi: maxAqi, distMi, dir };
  }catch(e){ return null; }
}
async function fetchPollen(loc){
  if(!serverIntegrations.pollen) return null;
  try{
    const proxy = '/api/pollen?latitude=' + loc.lat + '&longitude=' + loc.lon + '&days=3';
    const r = await fetchTimeout(proxy, {}, 8000);
    if(!r.ok) return null;
    const j = await r.json();
    if(!j.days || !j.days.length) return null;
    return j;
  }catch(e){ return null; }
}
function collectPollenTodayRows(pollen){
  const rows = [];
  renderPollenRows(pollen, rows);
  return rows;
}
function renderPollenTodayDetailHtml(rows){
  if(!rows || !rows.length) return '';
  return '<div class="pollen-today-detail">' + rows.map(r =>
    '<div class="pd-row"><span>' + r[0] + '</span><span class="pd-val">' + r[1] + '</span></div>'
  ).join('') + '</div>';
}
function collectMeteoPollenTodayRows(c){
  if(!c) return [];
  return [
    ['Grass', c.grass_pollen], ['Birch', c.birch_pollen], ['Alder', c.alder_pollen],
    ['Ragweed', c.ragweed_pollen], ['Mugwort', c.mugwort_pollen], ['Olive', c.olive_pollen]
  ].filter(p => p[1] !== null && p[1] !== undefined)
    .map(p => [p[0] + ' pollen', p[1] + '<small> gr/m\u00B3</small>']);
}
function renderPollenRows(pollen, rows){
  const today = pollen.days[0];
  if(!today || !Array.isArray(today.types)) return;
  today.types.forEach(t => {
    if(!t.inSeason && !t.index) return;
    rows.push([t.name + ' pollen', t.index + '<small> \u2014 ' + t.category + '</small>']);
  });
  today.plants.slice(0, 4).forEach(p => {
    if(p.index < 1) return;
    rows.push([p.name, p.index + '<small> UPI \u00B7 ' + p.category + '</small>']);
  });
}
function polShortName(name){
  const n = String(name || '').toUpperCase();
  if(n.includes('PM2.5') || n === 'PM25') return 'PM2.5';
  if(n.includes('PM10')) return 'PM10';
  if(n === 'O3' || n.includes('OZONE')) return 'O\u2083';
  if(n.includes('NO2')) return 'NO\u2082';
  return name;
}
function buildAirNowDetail(airNow){
  const worst = airNow.params.reduce((a, b) => (a.aqi > b.aqi ? a : b), airNow.params[0]);
  const readings = airNow.params.map(p => polShortName(p.name) + ' ' + p.aqi).join(', ');
  const dist = airNow.distMi != null && airNow.dir
    ? ' (' + airNow.distMi + ' mi ' + airNow.dir + ')'
    : '';
  return 'Nearest EPA monitor' + dist + ': ' + airNow.site + '. '
    + 'The US AQI above is the highest reading at that station right now ('
    + polShortName(worst.name) + ' ' + worst.aqi + '). '
    + 'Measured pollutants: ' + readings + '.';
}
function renderAirMetricSections(sections){
  if(!sections.length) return '';
  return sections.map((sec, i) => {
    if(!sec.rows.length) return '';
    return '<div class="air-metrics-section' + (i === 0 ? ' first' : '') + '">'
      + '<div class="metrics-lbl air-metrics-lbl">' + esc(sec.title) + '</div>'
      + '<div class="air-metrics-grid">' + sec.rows.map(r =>
        '<div class="metric"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>'
      ).join('') + '</div></div>';
  }).join('');
}
function pollenCatCls(cat){
  const c = (cat || '').toLowerCase();
  if(c.includes('very high') || c === 'high') return 'pd-high';
  if(c.includes('moderate')) return 'pd-mid';
  if(c.includes('low')) return 'pd-low';
  return 'pd-none';
}
function meteoPollenLevel(v){
  if(v == null || v <= 0) return { text: 'Off', cls: 'pd-none' };
  if(v < 10) return { text: 'Low', cls: 'pd-low' };
  if(v < 50) return { text: 'Moderate', cls: 'pd-mid' };
  return { text: 'High', cls: 'pd-high' };
}
function meteoTreePollen(daily, i){
  const vals = [daily.birch_pollen[i], daily.alder_pollen[i], daily.olive_pollen[i]].filter(v => v != null);
  return meteoPollenLevel(vals.length ? Math.max(...vals) : 0);
}
function meteoWeedPollen(daily, i){
  const vals = [daily.ragweed_pollen[i], daily.mugwort_pollen[i]].filter(v => v != null);
  return meteoPollenLevel(vals.length ? Math.max(...vals) : 0);
}
function meteoPollenDailyFromHourly(h){
  if(!h || !h.time || !h.time.length) return null;
  const keys = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'olive_pollen', 'ragweed_pollen'];
  const byDay = new Map();
  h.time.forEach((t, i) => {
    const day = t.slice(0, 10);
    if(!byDay.has(day)) byDay.set(day, { time: day });
    const row = byDay.get(day);
    keys.forEach(k => {
      const v = h[k] && h[k][i];
      if(v != null) row[k] = Math.max(row[k] ?? 0, v);
    });
  });
  const days = [...byDay.values()].slice(0, 3);
  if(!days.length) return null;
  const out = { time: days.map(d => d.time) };
  keys.forEach(k => { out[k] = days.map(d => d[k] ?? 0); });
  return out;
}
function pollenDayLabel(dateStr, i){
  if(i === 0) return 'Today';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString([], { weekday: 'short' });
}
function pollenTypeVal(types, code){
  if(!Array.isArray(types)) return { text: '\u2014', cls: 'pd-none' };
  const t = types.find(x => x.code === code);
  if(!t) return { text: '\u2014', cls: 'pd-none' };
  if(!t.inSeason && !t.index) return { text: 'Off', cls: 'pd-none' };
  return { text: t.category || String(t.index), cls: pollenCatCls(t.category) };
}
function pollenDayCardHtml(label, tree, grass, weed, todayDetailRows, isToday){
  let html = '<div class="pollen-day' + (isToday ? ' pd-today' : '') + '">'
    + '<div class="pd-label">' + label + '</div>'
    + '<div class="pd-row"><span>Tree</span><span class="pd-val ' + tree.cls + '">' + esc(tree.text) + '</span></div>'
    + '<div class="pd-row"><span>Grass</span><span class="pd-val ' + grass.cls + '">' + esc(grass.text) + '</span></div>'
    + '<div class="pd-row"><span>Weed</span><span class="pd-val ' + weed.cls + '">' + esc(weed.text) + '</span></div>';
  if(isToday && todayDetailRows && todayDetailRows.length) html += renderPollenTodayDetailHtml(todayDetailRows);
  return html + '</div>';
}
function renderPollenPlaceholder(todayDetailRows){
  const box = $('pollenForecast'), block = $('pollenBlock');
  if(!box || !block) return;
  block.style.display = 'block';
  box.innerHTML = [0, 1, 2].map(i =>
    pollenDayCardHtml(i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : 'Day 3',
      { text: 'Off', cls: 'pd-none' }, { text: 'Off', cls: 'pd-none' }, { text: 'Off', cls: 'pd-none' },
      i === 0 ? todayDetailRows : null, i === 0)
  ).join('');
}
function renderPollenFromMeteoDaily(daily, todayDetailRows){
  const box = $('pollenForecast'), block = $('pollenBlock');
  if(!box || !block || !daily || !daily.time || !daily.time.length) return false;
  block.style.display = 'block';
  box.innerHTML = daily.time.slice(0, 3).map((dateStr, i) => {
    const tree = meteoTreePollen(daily, i);
    const grass = meteoPollenLevel(daily.grass_pollen[i]);
    const weed = meteoWeedPollen(daily, i);
    return pollenDayCardHtml(pollenDayLabel(dateStr, i), tree, grass, weed, i === 0 ? todayDetailRows : null, i === 0);
  }).join('');
  return true;
}
function renderPollenForecast(pollen, meteoDaily, todayDetailRows){
  const box = $('pollenForecast'), block = $('pollenBlock');
  if(!box || !block) return;
  block.style.display = 'block';
  if(pollen && pollen.days && pollen.days.length){
    const detail = todayDetailRows || collectPollenTodayRows(pollen);
    box.innerHTML = pollen.days.slice(0, 3).map((day, i) => {
      const tree = pollenTypeVal(day.types, 'TREE');
      const grass = pollenTypeVal(day.types, 'GRASS');
      const weed = pollenTypeVal(day.types, 'WEED');
      return pollenDayCardHtml(pollenDayLabel(day.date, i), tree, grass, weed, i === 0 ? detail : null, i === 0);
    }).join('');
    return;
  }
  if(meteoDaily && renderPollenFromMeteoDaily(meteoDaily, todayDetailRows)) return;
  renderPollenPlaceholder(todayDetailRows);
}
function renderPollenMeta(pollen){
  if(!pollen) return '';
  if(pollen.quotaPaused){
    return 'Showing last available forecast \u2014 daily pollen data limit reached.';
  }
  return '';
}
let airLoadGen = 0;
function renderAirnowKey(){
  const row = $('airnowRow');
  if(row){ row.style.display = 'none'; row.textContent = ''; }
}
async function loadAir(loc){
  const gen = ++airLoadGen;
  return panelTask('airPanel', 'airStatus', async () => {
    let meteoDaily = null;
    const pollenBox = $('pollenForecast');
    if(!pollenBox || !pollenBox.children.length) renderPollenPlaceholder();
    try{
      $('pollenNote').textContent = '';
      let aqi = null, source = '', detail = '', sections = [];
      const [airNow, pollen] = await Promise.all([fetchAirNow(loc), fetchPollen(loc)]);
      if(airLoadGen !== gen) return;
      if(airNow){
        aqi = airNow.aqi;
        source = 'EPA AirNow';
        sections.push({
          title: 'Pollutants at monitor (EPA AirNow)',
          rows: airNow.params.map(p =>
            [polShortName(p.name) + ' AQI', p.aqi + '<small> \u2014 ' + p.category + '</small>']
          )
        });
      }
      const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
        + '?latitude=' + Number(loc.lat).toFixed(4) + '&longitude=' + Number(loc.lon).toFixed(4)
        + '&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen'
        + '&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen'
        + '&forecast_days=3&timezone=auto';
      let j = null;
      if(!aqi || !pollen || !meteoDaily){
        try{
          const r = await fetch(url);
          if(r.ok) j = await r.json();
        }catch(e){ console.warn('meteo air', e); }
      }
      const c = j ? j.current : null;
      meteoDaily = j ? (meteoPollenDailyFromHourly(j.hourly) || j.daily) : meteoDaily;
      if(airLoadGen !== gen) return;
      if(!aqi && c && c.us_aqi != null){
        aqi = c.us_aqi;
        source = 'Open-Meteo modeled';
        detail = isLikelyUS(loc)
          ? (serverIntegrations.airnow
            ? 'Modeled US AQI \u2014 no EPA monitor within 50 mi.'
            : 'Modeled US AQI (Open-Meteo).')
          : 'Composite of PM, ozone, NO\u2082 and more (EPA scale).';
        sections.push({
          title: 'Modeled pollutants (Open-Meteo)',
          rows: [
            ['PM2.5', fmtVal(c.pm2_5) + '<small> \u00B5g/m\u00B3</small>'],
            ['PM10', fmtVal(c.pm10) + '<small> \u00B5g/m\u00B3</small>'],
            ['Ozone', fmtVal(c.ozone) + '<small> \u00B5g/m\u00B3</small>'],
            ['NO\u2082', fmtVal(c.nitrogen_dioxide) + '<small> \u00B5g/m\u00B3</small>']
          ]
        });
      } else if(!aqi && c){
        source = source || 'Open-Meteo modeled';
        detail = detail || 'Modeled pollutants (US AQI unavailable for this point).';
        if(!sections.length){
          sections.push({
            title: 'Modeled pollutants (Open-Meteo)',
            rows: [
              ['PM2.5', fmtVal(c.pm2_5) + '<small> \u00B5g/m\u00B3</small>'],
              ['PM10', fmtVal(c.pm10) + '<small> \u00B5g/m\u00B3</small>'],
              ['Ozone', fmtVal(c.ozone) + '<small> \u00B5g/m\u00B3</small>'],
              ['NO\u2082', fmtVal(c.nitrogen_dioxide) + '<small> \u00B5g/m\u00B3</small>']
            ]
          });
        }
      }
      if(pollen){
        const pollenTodayDetail = collectPollenTodayRows(pollen);
        renderPollenForecast(pollen, meteoDaily, pollenTodayDetail);
        $('pollenNote').textContent = renderPollenMeta(pollen);
      } else if(c){
        const pollenTodayDetail = collectMeteoPollenTodayRows(c);
        renderPollenForecast(null, meteoDaily, pollenTodayDetail);
        $('pollenNote').textContent = pollenTodayDetail.length
          ? '3-day forecast below uses Open-Meteo modeled levels; species detail in Today card.'
          : 'Levels are low or off-season.';
      } else {
        renderPollenForecast(null, meteoDaily);
        $('pollenNote').textContent = 'Levels are low or off-season.';
      }
      if(airNow) detail = buildAirNowDetail(airNow);
      if(airLoadGen !== gen) return;
      const v = $('aqiVerdict');
      if(aqi == null){
        v.textContent = 'No data';
        v.className = 'verdict';
        $('aqiDetail').innerHTML = source
          ? esc(detail || source)
          : panelUnavail('air_api');
      }else{
        const cat = AQI_CATS.find(x => aqi <= x[0]) || AQI_CATS[AQI_CATS.length - 1];
        v.textContent = aqi + ' \u2014 ' + cat[1];
        v.className = 'verdict ' + cat[2];
        $('aqiDetail').textContent = detail || (source ? 'Source: ' + source + '.' : '');
      }
      if(aqi != null && c && c.pm2_5 != null && c.pm2_5 >= 35){
        const smokeRow = ['Smoke / haze', (c.pm2_5 >= 55 ? 'High' : 'Moderate') + ' PM2.5 — check local smoke advisories<small></small>'];
        const airSec = sections.find(s => /AirNow|Open-Meteo/i.test(s.title));
        if(airSec) airSec.rows.push(smokeRow);
        else sections.unshift({ title: 'Air quality notes', rows: [smokeRow] });
      }
      $('airMetrics').innerHTML = renderAirMetricSections(sections);
      renderAirnowKey();
      outdoorAir = { aqi: aqi ?? null, pm25: c?.pm2_5 ?? null };
      syncSmokeRadarHint(outdoorAir.pm25, outdoorAir.aqi);
      if(state.data) renderActivityPlanner(state.data);
    }catch(e){
      $('aqiVerdict').textContent = 'unavailable';
      $('aqiDetail').innerHTML = panelUnavail('air_api');
      $('pollenNote').textContent = '';
      renderPollenForecast(null, meteoDaily);
      $('airMetrics').innerHTML = '';
      $('airnowRow').style.display = 'none';
      syncSmokeRadarHint(null, null);
      console.error('air', e);
    }
  });
}

// ---------- METAR / NWS obs vs forecast ----------
function obsBiasBadge(obs, fc, kind, unit, dec){
  if(obs === null || fc === null || isNaN(obs) || isNaN(fc)) return { html: '\u2014', cls: 'obs-close' };
  const d = obs - fc;
  const close = Math.abs(d) < (dec ?? 1);
  if(close) return { html: 'On forecast', cls: 'obs-close' };
  const n = dec ? Math.abs(d).toFixed(dec) : Math.abs(Math.round(d));
  if(kind === 'wind'){
    return d > 0
      ? { html: n + unit + ' stronger', cls: 'obs-higher' }
      : { html: n + unit + ' lighter', cls: 'obs-lower' };
  }
  if(kind === 'pressure'){
    return d > 0
      ? { html: n + unit + ' higher', cls: 'obs-higher' }
      : { html: n + unit + ' lower', cls: 'obs-lower' };
  }
  return d > 0
    ? { html: n + unit + ' warmer', cls: 'obs-higher' }
    : { html: n + unit + ' cooler', cls: 'obs-lower' };
}
function obsCompareRow(label, obsDisp, fcDisp, bias){
  return '<div class="obs-row">'
    + '<div class="obs-label">' + label + '</div>'
    + '<div class="obs-val"><div class="n">' + (obsDisp ?? '\u2014') + '</div><div class="t">Observed</div></div>'
    + '<div class="obs-val"><div class="n">' + (fcDisp ?? '\u2014') + '</div><div class="t">NWS forecast</div></div>'
    + '<span class="obs-badge ' + bias.cls + '">' + bias.html + '</span>'
    + '</div>';
}
async function loadObs(loc){
  return panelTask('obsPanel', 'obsStatus', async () => {
    $('obsMetrics').innerHTML = '';
    $('obsStation').textContent = '';
    $('obsNote').textContent = '';
    if(!state.data){ $('obsNote').textContent = 'FORECAST REQUIRED FOR COMPARISON'; return; }
    try{
      const d = state.data;
      let obs = null, sid = null;
      if(d.metar){
        obs = d.metar.props;
        sid = d.metar.id;
      }else{
        const pr = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
        if(!pr.ok) throw new Error('points HTTP ' + pr.status);
        const pts = await pr.json();
        const got = await fetchMetarObs(pts.properties);
        if(!got) throw new Error('no recent obs');
        obs = got.props; sid = got.id;
      }

      const i = nowIndex(d);
      const hp = d.nwsHourly && d.nwsHourly[i];
      const fcTemp = hp ? nwsTempToDisp(hp.temperature, hp.temperatureUnit === 'C' ? 'C' : 'F') : Math.round(d.hourly.temperature_2m[i]);
      const fcWind = hp ? parseNwsWindMph(hp.windSpeed) : Math.round(d.hourly.wind_speed_10m[i]);
      const fcDew = Math.round(d.hourly.dew_point_2m[i] ?? 0);
      const fcPres = d.hourly.pressure_msl[i] ?? d.current.pressure_msl;

      const obsTempC = nwsVal(obs.temperature);
      const obsDewC = nwsVal(obs.dewpoint);
      const obsWindMs = nwsVal(obs.windSpeed);
      const obsPresPa = nwsVal(obs.barometricPressure);
      const toDispTemp = c => state.units === 'F' ? Math.round(c * 9/5 + 32) : Math.round(c);
      const toDispWind = ms => state.units === 'F' ? Math.round(ms * 2.237) : Math.round(ms * 3.6);
      const obsTemp = obsTempC !== null && obsTempC !== undefined ? toDispTemp(obsTempC) : null;
      const obsDew = obsDewC !== null && obsDewC !== undefined ? toDispTemp(obsDewC) : null;
      const obsWind = obsWindMs !== null && obsWindMs !== undefined ? toDispWind(obsWindMs) : null;
      const obsPresHpa = obsPresPa !== null && obsPresPa !== undefined ? obsPresPa / 100 : null;
      const obsTime = obs.timestamp ? new Date(obs.timestamp).toLocaleString([], { hour:'numeric', minute:'2-digit' }) : '';
      $('obsStation').textContent = sid + ' \u00B7 observed ' + obsTime;
      const tempUnit = degSym();
      const wUnit = windUnit();
      const rows = [
        obsCompareRow('Temp',
          obsTemp !== null ? obsTemp + tempUnit : null,
          fcTemp + tempUnit,
          obsBiasBadge(obsTemp, fcTemp, 'temp', tempUnit)),
        obsCompareRow('Dew',
          obsDew !== null ? obsDew + tempUnit : null,
          fcDew + tempUnit,
          obsBiasBadge(obsDew, fcDew, 'temp', tempUnit)),
        obsCompareRow('Wind',
          obsWind !== null ? obsWind + ' ' + wUnit : null,
          fcWind + ' ' + wUnit,
          obsBiasBadge(obsWind, fcWind, 'wind', ' ' + wUnit)),
        obsCompareRow('Pressure',
          obsPresHpa !== null
            ? (state.units === 'F' ? (obsPresHpa * 0.02953).toFixed(2) + ' inHg' : Math.round(obsPresHpa) + ' hPa')
            : null,
          state.units === 'F' ? (fcPres * 0.02953).toFixed(2) + ' inHg' : Math.round(fcPres) + ' hPa',
          obsBiasBadge(obsPresHpa, fcPres, 'pressure', ' hPa', 1))
      ];
      $('obsMetrics').innerHTML = rows.join('');
      $('obsNote').textContent = 'Badge shows how the observation compares to the NWS forecast this hour (warmer/cooler, stronger/lighter wind, etc.).';
      await renderMetarTrace(sid);
    }catch(e){
      setPanelUnavail($('obsNote'), 'no_obs', e.message || '');
      $('metarTrace').hidden = true;
      console.error('obs', e);
    }
  });
}
async function renderMetarTrace(stationId){
  const wrap = $('metarTrace'), box = $('metarTrends'), summary = $('metarSummary');
  if(!wrap || !box || !stationId){ if(wrap) wrap.hidden = true; return; }
  try{
    const r = await nwsFetch('https://api.weather.gov/stations/' + encodeURIComponent(stationId) + '/observations?limit=168');
    if(!r.ok) throw new Error('obs list HTTP ' + r.status);
    const feats = ((await r.json()).features || []).slice().reverse();
    if(feats.length < 3){ wrap.hidden = true; return; }
    const temps = [], winds = [], pressures = [];
    const toDispTemp = c => state.units === 'F' ? Math.round(c * 9/5 + 32) : Math.round(c);
    const toDispWind = ms => state.units === 'F' ? Math.round(ms * 2.237) : Math.round(ms * 3.6);
    feats.forEach(f => {
      const p = f.properties || {};
      const t = nwsVal(p.temperature);
      const w = nwsVal(p.windSpeed);
      const pr = nwsVal(p.barometricPressure);
      if(t != null) temps.push(toDispTemp(t));
      if(w != null) winds.push(toDispWind(w));
      if(pr != null){
        const hpa = pr / 100;
        pressures.push(state.units === 'F' ? Math.round(hpa * 0.02953 * 100) / 100 : Math.round(hpa));
      }
    });
    if(summary){
      const sumHtml = metarHistorySummary(feats, temps, pressures);
      if(sumHtml){
        summary.hidden = false;
        summary.innerHTML = sumHtml;
      }else{
        summary.hidden = true;
        summary.innerHTML = '';
      }
    }
    const presLabel = state.units === 'F' ? 'Pressure (7d, inHg)' : 'Pressure (7d, hPa)';
    const presUnit = state.units === 'F' ? ' inHg' : ' hPa';
    const cards = [
      sparklineCard('Temperature (7d)', temps.slice(-168), 'temp', degSym(), {
        hint: 'Station METAR temperature trend',
        rightPrefix: 'Latest'
      }),
      sparklineCard('Wind speed (7d)', winds.slice(-168), 'wind', ' ' + windUnit(), {
        hint: 'Sustained wind from METAR',
        rightPrefix: 'Latest'
      })
    ];
    if(pressures.length >= 3){
      cards.push(sparklineCard(presLabel, pressures.slice(-168), 'pres', presUnit, {
        hint: 'Barometric pressure at the station',
        rightPrefix: 'Latest',
        fmt: v => state.units === 'F' ? Number(v).toFixed(2) : String(Math.round(v))
      }));
    }
    box.className = 'trends metar-trends' + (cards.length === 3 ? ' metar-trends-3' : '');
    box.innerHTML = cards.join('');
    const foot = $('metarTraceFoot');
    if(foot){
      if(feats.length >= 48){
        foot.hidden = false;
        foot.textContent = feats.length + ' hourly observations over the past 7 days.';
      }else{
        foot.hidden = true;
        foot.textContent = '';
      }
    }
    wrap.hidden = false;
  }catch(e){
    wrap.hidden = false;
    if(summary){ summary.hidden = true; summary.innerHTML = ''; }
    box.className = 'trends metar-trends';
    box.innerHTML = '';
    const foot = $('metarTraceFoot');
    if(foot){ foot.hidden = true; foot.textContent = ''; }
    setPanelUnavail(box, 'metar_history');
  }
}
function metarHistorySummary(feats, temps, pressures){
  if(!feats.length || temps.length < 2) return '';
  const latestT = temps[temps.length - 1];
  const dayAgoIdx = Math.max(0, temps.length - 25);
  const dayAgoT = temps[dayAgoIdx];
  const delta24 = latestT - dayAgoT;
  const weekAgoIdx = Math.max(0, temps.length - 168);
  const weekAgoT = temps[weekAgoIdx];
  const delta7d = latestT - weekAgoT;
  const u = degSym();
  const fmtDelta = d => {
    if(!d || Math.abs(d) < 1) return 'about steady';
    return (d > 0 ? 'up ' : 'down ') + Math.abs(Math.round(d)) + u;
  };
  let presLine = '';
  if(pressures.length >= 12){
    const pNow = pressures[pressures.length - 1];
    const p6 = pressures[Math.max(0, pressures.length - 7)];
    const pDelta = pNow - p6;
    const pu = state.units === 'F' ? ' inHg' : ' hPa';
    if(Math.abs(pDelta) >= (state.units === 'F' ? 0.03 : 1)){
      presLine = ' Pressure ' + (pDelta > 0 ? 'rising' : 'falling') + ' (~'
        + (state.units === 'F' ? Math.abs(pDelta).toFixed(2) : Math.abs(Math.round(pDelta))) + pu + ' in 6 h).';
    }
  }
  return '<div class="lbl">24 h &amp; 7 d trend</div>'
    + 'Temperature ' + fmtDelta(delta24) + ' vs ~24 h ago'
    + (temps.length >= 48 ? '; ' + fmtDelta(delta7d) + ' vs ~7 d ago' : '')
    + '.' + presLine;
}

// ---------- aviation TAF (nearest airport) ----------
async function resolveTafIcaos(loc){
  const out = [];
  const add = id => {
    const u = id && String(id).toUpperCase();
    if(u && /^K[A-Z0-9]{3}$/.test(u) && !out.includes(u)) out.push(u);
  };
  add(state.data?.metar?.id || state.data?.metarId);
  if(!isLikelyUS(loc)) return out.slice(0, 3);
  try{
    let stationsUrl = state.data?.nwsPoints?.observationStations;
    if(!stationsUrl){
      const r = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
      if(!r.ok) return out.slice(0, 3);
      stationsUrl = (await r.json()).properties?.observationStations;
    }
    if(!stationsUrl || typeof stationsUrl !== 'string') return out.slice(0, 3);
    const sr = await nwsFetch(stationsUrl);
    if(!sr.ok) return out.slice(0, 3);
    const stList = await sr.json();
    for(const station of (stList.features || []).slice(0, 12)){
      add(station.properties?.stationIdentifier || station.properties?.stationId);
      if(out.length >= 3) break;
    }
  }catch(e){
    console.warn('resolveTafIcaos', e);
  }
  return out.slice(0, 3);
}
let tafLoadGen = 0;
const TAF_WX_PHRASES = {
  VCSH:'Showers nearby', VCTS:'Thunderstorms nearby', VCFG:'Fog nearby',
  '-SHRA':'Light rain showers', SHRA:'Rain showers', '+SHRA':'Heavy rain showers',
  '-RA':'Light rain', RA:'Rain', '+RA':'Heavy rain',
  '-SN':'Light snow', SN:'Snow', '+SN':'Heavy snow',
  '-DZ':'Light drizzle', DZ:'Drizzle', BR:'Mist', FG:'Fog', HZ:'Haze', FU:'Smoke',
  TS:'Thunderstorm', TSRAGRA:'Thunderstorm with rain and hail',
  FZRA:'Freezing rain', FZDZ:'Freezing drizzle', PL:'Sleet / ice pellets',
  GR:'Hail', SQ:'Squalls', IC:'Ice crystals', SH:'Showers', VC:'Nearby'
};
const TAF_COVER = { FEW:'Few', SCT:'Scattered', BKN:'Broken', OVC:'Overcast', SKC:'Clear', CLR:'Clear' };
function tafTimeMs(t){
  if(t == null) return null;
  if(typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.getTime();
}
function fmtTafWhen(ms, opts){
  if(ms == null) return '';
  return new Date(ms).toLocaleString([], opts || { weekday:'short', hour:'numeric', minute:'2-digit' });
}
function decodeTafWx(s){
  if(!s) return '';
  const u = String(s).toUpperCase().trim();
  if(TAF_WX_PHRASES[u]) return TAF_WX_PHRASES[u];
  const parts = u.split(/\s+/).map(t => TAF_WX_PHRASES[t] || t);
  return parts.join(', ');
}
function decodeTafVis(v){
  if(v == null || v === '') return '';
  const s = String(v).trim();
  if(/^P6/i.test(s) || s === '6+') return 'More than 6 miles';
  const n = parseFloat(s);
  if(!isNaN(n)) return n + (n === 1 ? ' mile' : ' miles') + ' visibility';
  return s + ' visibility';
}
function decodeTafClouds(clouds){
  if(!clouds || !clouds.length) return 'Clear or not reported';
  return clouds.map(c => {
    const cov = TAF_COVER[c.cover] || c.cover;
    if(c.base == null) return cov;
    const ft = Number(c.base);
    const low = ft < 6000 ? ' (low clouds)' : '';
    return cov + ' at ' + ft.toLocaleString() + ' ft' + low;
  }).join('; ');
}
function decodeTafWind(wdir, wspd, wgst){
  if(wspd == null) return '';
  const kt = Number(wspd);
  const spdDisp = state.units === 'F'
    ? Math.round(kt * 1.15078) + ' mph'
    : Math.round(kt * 1.852) + ' km/h';
  let s = '';
  if(wdir != null && wdir !== 'VRB') s += compass(wdir) + ' (' + wdir + '\u00B0) at ';
  else if(String(wdir).toUpperCase() === 'VRB') s += 'Variable wind at ';
  s += spdDisp + ' (' + kt + ' kt)';
  if(wgst != null) s += ', gusts to ' + wgst + ' kt';
  return s;
}
function fmtTafPeriod(from, to){
  const a = tafTimeMs(from), b = tafTimeMs(to);
  if(a == null) return '';
  const opts = { weekday:'short', hour:'numeric', minute:'2-digit' };
  if(b == null) return 'From ' + fmtTafWhen(a, opts);
  return fmtTafWhen(a, opts) + ' \u2013 ' + fmtTafWhen(b, opts);
}
function tafVisMiles(v){
  if(v == null || v === '') return null;
  const s = String(v).trim();
  if(/^P6/i.test(s) || s === '6+') return 6.01;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function tafCeilingFt(clouds){
  if(!clouds || !clouds.length) return null;
  let low = null;
  clouds.forEach(c => {
    const cov = String(c.cover || '').toUpperCase();
    if(!/BKN|OVC|VV/.test(cov) || c.base == null) return;
    const ft = Number(c.base);
    if(!isNaN(ft) && (low == null || ft < low)) low = ft;
  });
  return low;
}
function tafFlightCategory(f){
  const visMi = tafVisMiles(f.visib);
  const ceilFt = tafCeilingFt(f.clouds);
  const wx = String(f.wxString || '').toUpperCase();
  if(/\+TS|TSRA|\+SN|FZRA|FG|FZFG/.test(wx) && (visMi == null || visMi < 3)) return 'lifr';
  if((ceilFt != null && ceilFt < 500) || (visMi != null && visMi < 1)) return 'lifr';
  if((ceilFt != null && ceilFt < 1000) || (visMi != null && visMi < 3)) return 'ifr';
  if((ceilFt != null && ceilFt < 3000) || (visMi != null && visMi < 5)) return 'mvfr';
  if(ceilFt != null || visMi != null) return 'vfr';
  return '';
}
const TAF_FLIGHT_LABEL = { vfr:'VFR', mvfr:'MVFR', ifr:'IFR', lifr:'LIFR' };
function metarFlightCategoryFromObs(p){
  if(!p) return '';
  const visM = nwsVal(p.visibility);
  const visMi = visM != null ? visM / 1609.34 : null;
  const ceilFt = nwsVal(p.cloudBase);
  if((ceilFt != null && ceilFt < 500) || (visMi != null && visMi < 1)) return 'lifr';
  if((ceilFt != null && ceilFt < 1000) || (visMi != null && visMi < 3)) return 'ifr';
  if((ceilFt != null && ceilFt < 3000) || (visMi != null && visMi < 5)) return 'mvfr';
  if(ceilFt != null || visMi != null) return 'vfr';
  return '';
}
function renderAviationMetarCard(icao, obs){
  const id = esc(icao || 'Field');
  if(!obs || !obs.props){
    return '<div class="aviation-card aviation-metar"><h3>METAR (observed)</h3>'
      + '<div class="av-icao">' + id + '</div>'
      + '<div class="av-meta">No recent observation from NWS.</div></div>';
  }
  const p = obs.props;
  const tempC = nwsVal(p.temperature);
  const windMs = nwsVal(p.windSpeed);
  const gustMs = nwsVal(p.windGust);
  const visM = nwsVal(p.visibility);
  const temp = tempC != null ? (state.units === 'F' ? Math.round(tempC * 9/5 + 32) : Math.round(tempC)) + degSym() : '\u2014';
  const wind = windMs != null ? Math.round(msToDisp(windMs)) + ' ' + windUnit() : '\u2014';
  const gust = gustMs != null ? ', gusts ' + Math.round(msToDisp(gustMs)) : '';
  const vis = visM != null
    ? (state.units === 'F' ? (visM / 1609.34).toFixed(1) + ' mi' : (visM / 1000).toFixed(1) + ' km')
    : '\u2014';
  const cat = metarFlightCategoryFromObs(p);
  const catBadge = cat ? ' <span class="lc-badge spc">' + TAF_FLIGHT_LABEL[cat] + '</span>' : '';
  const when = p.timestamp ? new Date(p.timestamp).toLocaleString([], { hour:'numeric', minute:'2-digit' }) : '';
  const raw = p.rawMessage || p.textDescription || '';
  return '<div class="aviation-card aviation-metar"><h3>METAR (observed)</h3>'
    + '<div class="av-icao">' + id + catBadge + '</div>'
    + '<div class="av-meta">' + esc(p.textDescription || 'Observation')
    + (when ? ' \u00B7 ' + when : '') + '</div>'
    + '<div class="av-meta">Temp ' + temp + ' \u00B7 Wind ' + wind + gust + ' \u00B7 Vis ' + vis + '</div>'
    + (raw ? '<details class="av-raw"><summary>Raw METAR</summary><pre>' + esc(raw) + '</pre></details>' : '')
    + '</div>';
}
function renderAviationTafSummaryCard(taf){
  const icao = esc(taf.icaoId || taf.name || 'Airport');
  const fcsts = (taf.fcsts || []).filter(f => tafFlightCategory(f));
  const nowCat = fcsts.length ? tafFlightCategory(fcsts[0]) : '';
  const catBadge = nowCat ? ' <span class="lc-badge spc">' + TAF_FLIGHT_LABEL[nowCat] + '</span>' : '';
  const first = fcsts[0];
  const summary = first
    ? [decodeTafWind(first.wdir, first.wspd, first.wgst), decodeTafVis(first.visib)].filter(Boolean).join(' \u00B7 ')
    : 'Decoded forecast below';
  const issuedMs = tafTimeMs(taf.issueTime || taf.bulletinTime);
  return '<div class="aviation-card aviation-taf-sum"><h3>TAF (forecast)</h3>'
    + '<div class="av-icao">' + icao + catBadge + '</div>'
    + '<div class="av-meta">' + esc(summary) + '</div>'
    + (issuedMs ? '<div class="av-meta">Issued ' + esc(fmtTafWhen(issuedMs)) + '</div>' : '')
    + '</div>';
}
function renderAviationFlightStrip(taf){
  const wrap = $('aviationFlight'), bar = $('aviationFlightBar');
  if(!wrap || !bar) return;
  const fcsts = (taf.fcsts || []).slice(0, 12);
  if(!fcsts.length){ wrap.hidden = true; return; }
  const segments = fcsts.map(f => {
    const cat = tafFlightCategory(f) || 'vfr';
    const title = fmtTafPeriod(f.timeFrom, f.timeTo) + ' \u00B7 ' + (TAF_FLIGHT_LABEL[cat] || cat.toUpperCase())
      + (decodeTafVis(f.visib) ? ' \u00B7 ' + decodeTafVis(f.visib) : '');
    return '<span class="' + cat + '" title="' + esc(title) + '"></span>';
  });
  bar.innerHTML = segments.join('');
  wrap.hidden = false;
}
function renderTafHtml(taf){
  const raw = taf.rawTAF || '';
  const issuedMs = tafTimeMs(taf.issueTime || taf.bulletinTime);
  const validToMs = tafTimeMs(taf.validTimeTo);
  let html = '<div class="taf-head"><strong>' + esc(taf.name || taf.icaoId || 'Airport') + '</strong>'
    + ' <span class="radar-note">(' + esc(taf.icaoId || '') + ')</span>';
  const meta = [];
  if(issuedMs) meta.push('Issued ' + fmtTafWhen(issuedMs));
  if(validToMs) meta.push('valid through ' + fmtTafWhen(validToMs));
  if(meta.length) html += '<div class="taf-meta">' + esc(meta.join(' \u00B7 ')) + '</div>';
  html += '</div>';
  if(raw){
    html += '<details class="taf-raw-wrap"><summary>Raw aviation code</summary>'
      + '<div class="taf-raw">' + esc(raw) + '</div></details>';
  }
  const fcsts = taf.fcsts || [];
  if(fcsts.length){
    html += '<div class="taf-periods">' + fcsts.slice(0, 6).map(f => {
      const wind = decodeTafWind(f.wdir, f.wspd, f.wgst);
      const vis = decodeTafVis(f.visib);
      const wx = decodeTafWx(f.wxString);
      const clouds = decodeTafClouds(f.clouds);
      const rows = [
        ['Wind', wind],
        ['Visibility', vis],
        ['Weather', wx],
        ['Clouds', clouds]
      ].filter(r => r[1]);
      const change = f.fcstChange === 'FM' ? 'Change from ' : (f.fcstChange === 'TEMPO' ? 'Temporary ' : (f.fcstChange === 'BECMG' ? 'Becoming ' : ''));
      const title = change + fmtTafPeriod(f.timeFrom, f.timeTo);
      return '<div class="taf-period-card">'
        + '<div class="taf-period-time">' + esc(title) + '</div>'
        + '<dl class="taf-dl">' + rows.map(r => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') + '</dl>'
        + '</div>';
    }).join('') + '</div>';
  }
  return html;
}
async function loadTaf(loc){
  const gen = ++tafLoadGen;
  return panelTask('tafPanel', 'tafStatus', async () => {
    const box = $('tafText');
    const dual = $('aviationDual');
    const flight = $('aviationFlight');
    if(!box) return;
    if(gen !== tafLoadGen) return;
    if(!isLikelyUS(loc)){
      if(dual) dual.hidden = true;
      if(flight) flight.hidden = true;
      box.textContent = 'Aviation METAR/TAF is available for US airport locations.';
      return;
    }
    box.textContent = 'Loading aviation data\u2026';
    if(dual) dual.hidden = true;
    if(flight) flight.hidden = true;
    let icaos = [];
    try{
      icaos = await resolveTafIcaos(loc);
      if(gen !== tafLoadGen) return;
      if(!icaos.length){ box.innerHTML = panelUnavail('no_taf'); return; }
      const primary = icaos[0];
      const [tafRes, metarObs] = await Promise.all([
        fetchTimeout('/api/taf?ids=' + encodeURIComponent(icaos.join(',')), {}, 20000),
        fetchStationLatestObs(primary).then(props => props ? { id: primary, props } : null).catch(() => null)
      ]);
      if(gen !== tafLoadGen) return;
      if(!tafRes.ok){
        if(tafRes.status === 404) throw new Error('taf proxy missing');
        throw new Error('taf http ' + tafRes.status);
      }
      const arr = await tafRes.json();
      if(!Array.isArray(arr)) throw new Error('taf bad response');
      const taf = arr.find(t => t && (t.rawTAF || t.icaoId));
      if(!taf){
        box.innerHTML = panelUnavail('no_taf', 'No TAF issued for ' + icaos.join(', ') + '.');
        return;
      }
      if(dual){
        dual.hidden = false;
        dual.innerHTML = renderAviationMetarCard(primary, metarObs) + renderAviationTafSummaryCard(taf);
      }
      renderAviationFlightStrip(taf);
      box.innerHTML = renderTafHtml(taf);
    }catch(e){
      if(gen !== tafLoadGen) return;
      const msg = String(e.message || '');
      const icaoLabel = icaos.length ? icaos.join(', ') : '';
      const timedOut = e.name === 'AbortError' || e.name === 'TimeoutError';
      if(msg.includes('proxy')){
        box.innerHTML = panelUnavail('taf_proxy');
      }else if(timedOut){
        box.innerHTML = panelUnavail('taf_timeout');
      }else if(msg.startsWith('taf http ')){
        box.innerHTML = panelUnavail('no_taf', 'HTTP ' + msg.slice(9) + (icaoLabel ? ', ' + icaoLabel : '') + '.');
      }else{
        box.innerHTML = panelUnavail('no_taf', icaoLabel || '');
      }
      if(timedOut) console.warn('taf', e.message || e.name);
      else console.error('taf', e);
    }
  });
}

// ---------- NWS forecast discussion (inline) ----------
async function fetchLatestAfdText(loc){
  if(!isLikelyUS(loc)) throw new Error('non_us');
  const r = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
  if(!r.ok) throw new Error('points');
  const j = await r.json();
  const cwa = j.properties && j.properties.cwa;
  if(!cwa) throw new Error('no cwa');
  const link = 'https://forecast.weather.gov/product.php?site=' + cwa + '&issuedby=' + cwa + '&product=AFD&format=CI&version=1&glossary=1';
  const lr = await nwsFetch('https://api.weather.gov/products/types/AFD/locations/' + cwa);
  if(!lr.ok) throw new Error('afd list');
  const list = await lr.json();
  const latest = (list['@graph'] || list.features || [])[0];
  const pid = latest && (latest.id || (latest['@id'] || '').split('/').pop());
  if(!pid) throw new Error('no afd');
  const pr = await nwsFetch('https://api.weather.gov/products/' + pid);
  if(!pr.ok) throw new Error('afd product');
  const prod = await pr.json();
  return {
    cwa,
    text: prod.productText || '',
    issued: prod.issuanceTime || prod.productTimestamp || '',
    link
  };
}
async function loadForecastAfdTeaser(loc){
  const box = $('forecastAfdTeaser');
  if(!box) return;
  if(!isLikelyUS(loc)){ box.hidden = true; box.innerHTML = ''; return; }
  try{
    const afd = await fetchLatestAfdText(loc);
    const highlight = afdHighlightText(afd.text);
    if(!highlight){ box.hidden = true; box.innerHTML = ''; return; }
    const when = afd.issued
      ? new Date(afd.issued).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' })
      : '';
    box.hidden = false;
    box.innerHTML = '<div class="forecast-afd-teaser">'
      + '<div class="lbl">From the NWS discussion \u00B7 ' + esc(afd.cwa) + (when ? ' \u00B7 ' + esc(when) : '') + '</div>'
      + '<p>' + esc(highlight) + '</p>'
      + '<a href="#afdPanel">Full forecast discussion \u2192</a>'
      + '</div>';
  }catch(e){
    box.hidden = true;
    box.innerHTML = '';
  }
}
async function loadAFD(loc){
  return panelTask('afdPanel', 'afdStatus', async () => {
    const a = $('afdLink');
    a.style.display = 'none';
    $('afdText').textContent = 'Loading discussion\u2026';
    $('afdMeta').textContent = '';
    try{
      const afd = await fetchLatestAfdText(loc);
      a.href = afd.link;
      a.textContent = 'Full AFD on forecast.weather.gov \u2192';
      a.style.display = 'inline';
      const fullText = afd.text || '(empty)';
      const highlight = afdHighlightText(fullText);
      const hlBox = $('afdHighlight');
      if(hlBox){
        if(highlight){
          hlBox.hidden = false;
          hlBox.innerHTML = '<div class="lbl">Forecast highlight</div>' + esc(highlight);
        }else{
          hlBox.hidden = true;
          hlBox.innerHTML = '';
        }
      }
      $('afdText').textContent = fullText;
      $('afdMeta').textContent = 'NWS ' + afd.cwa + (afd.issued
        ? ' \u00B7 issued ' + new Date(afd.issued).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' })
        : '');
    }catch(e){
      $('afdText').innerHTML = panelUnavail('no_discussion');
      console.error('afd', e);
    }
  });
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

// ---------- marine: Open-Meteo wave model ----------
function mToFt(m){ return (m * 3.28084).toFixed(1); }
function cToF(c){ return Math.round(c * 9 / 5 + 32); }
function greatLakeName(lat, lon){
  if(lat >= 42.2 && lat <= 42.7 && lon >= -83.2 && lon <= -82.2) return 'Lake St Clair';
  // Superior before Michigan — western/central UP and north shore (MI/MN/WI)
  if(lat >= 46.35 && lon >= -92.5 && lon < -86.8) return 'Lake Superior';
  if(lat >= 46.5 && lon >= -86.8 && lon <= -84.5) return 'Lake Superior';
  // Huron — eastern UP, Georgian Bay, Saginaw, Ontario shore
  if(lat >= 43 && lat <= 46.55 && lon >= -84.5 && lon <= -79) return 'Lake Huron';
  if(lat >= 41 && lat <= 43 && lon >= -83 && lon <= -78) return 'Lake Erie';
  if(lat >= 42.5 && lat <= 44.5 && lon >= -79.5 && lon <= -76) return 'Lake Ontario';
  // Lake Michigan — lower peninsula and NW lake Michigan shore
  if(lat >= 41 && lat <= 46.35 && lon >= -92 && lon <= -84.3) return 'Lake Michigan';
  return null;
}
const LAKE_GLF_OFFICES = {
  'Lake Superior': ['KMQT', 'KDLH', 'KGRB'],
  'Lake Huron': ['KAPX', 'KDTX', 'KGRR'],
  'Lake Michigan': ['KGRR', 'KMKX', 'KGRB', 'KLOT'],
  'Lake Erie': ['KCLE', 'KDTX', 'KBUF'],
  'Lake Ontario': ['KBUF'],
  'Lake St Clair': ['KDTX', 'KGRR']
};
function normalizeNwsOffice(cwa){
  if(!cwa) return '';
  const u = String(cwa).trim().toUpperCase();
  return u.startsWith('K') ? u : 'K' + u;
}
function lakeGlfOfficesForLoc(lake, lat, lon){
  const base = LAKE_GLF_OFFICES[lake] || [];
  if(lat == null || lon == null) return base;

  if(lake === 'Lake Superior'){
    // MN/WI north shore vs UP / east shore
    if(lon < -90.5) return ['KDLH', 'KGRB', 'KMQT'];
    if(lon >= -87.5) return ['KMQT', 'KDLH', 'KGRB'];
    return ['KMQT', 'KDLH', 'KGRB'];
  }
  if(lake === 'Lake Michigan'){
    if(lon >= -87.0) return ['KGRR', 'KGRB', 'KMKX', 'KLOT'];
    if(lon <= -87.6) return ['KMKX', 'KLOT', 'KGRB', 'KGRR'];
    return ['KGRB', 'KGRR', 'KMKX', 'KLOT'];
  }
  if(lake === 'Lake Huron'){
    // Thumb / Saginaw / Georgian approach vs northeast (Alpena) vs straits
    if(lon >= -82.5) return ['KAPX', 'KDTX', 'KGRR'];
    if(lon >= -84.5) return ['KDTX', 'KAPX', 'KGRR'];
    return ['KGRR', 'KAPX', 'KDTX'];
  }
  if(lake === 'Lake Erie'){
    if(lon >= -79.2) return ['KBUF', 'KCLE'];
    if(lon >= -82.2) return ['KCLE', 'KBUF', 'KDTX'];
    return ['KDTX', 'KCLE', 'KBUF'];
  }
  if(lake === 'Lake Ontario'){
    return ['KBUF'];
  }
  if(lake === 'Lake St Clair'){
    if(lon >= -82.75) return ['KDTX', 'KGRR'];
    return ['KGRR', 'KDTX'];
  }
  return base;
}
function pickGlfCandidate(candidates, prefer, offices){
  if(!candidates.length) return null;
  if(prefer){
    const hit = candidates.find(c => c.office === prefer);
    if(hit) return hit;
  }
  let best = null, bestIdx = 99;
  for(const c of candidates){
    const idx = offices.indexOf(c.office);
    if(idx >= 0 && idx < bestIdx){ best = c; bestIdx = idx; }
  }
  return best || candidates[0];
}
const LAKE_GLF_CODE = {
  'Lake Michigan': 'GLFLM',
  'Lake Superior': 'GLFLS',
  'Lake Huron': 'GLFLH',
  'Lake Erie': 'GLFLE',
  'Lake Ontario': 'GLFLO',
  'Lake St Clair': 'GLFSC'
};
const BUOY_PRESETS = [
  // Lake Superior
  { id: '45028', name: 'Western Lake Superior', lake: 'Lake Superior', lat: 46.814, lon: -91.829, seasonal: true },
  { id: '45216', name: 'Ontonagon, MI', lake: 'Lake Superior', lat: 46.907, lon: -89.354 },
  { id: '45171', name: 'Granite Island, MI', lake: 'Lake Superior', lat: 46.724, lon: -87.411 },
  { id: '45173', name: 'Munising, MI', lake: 'Lake Superior', lat: 46.573, lon: -86.572 },
  { id: '45211', name: 'Grand Island North, MI', lake: 'Lake Superior', lat: 46.973, lon: -86.568 },
  { id: '45172', name: 'Grand Marais, MI', lake: 'Lake Superior', lat: 46.740, lon: -85.980 },
  { id: '45025', name: 'South Entry, Keweenaw Peninsula', lake: 'Lake Superior', lat: 46.969, lon: -88.398, seasonal: true },
  { id: '45219', name: 'Two Harbors Nearshore', lake: 'Lake Superior', lat: 47.021, lon: -91.625 },
  { id: '45023', name: 'North Entry, Keweenaw Peninsula', lake: 'Lake Superior', lat: 47.270, lon: -88.607, seasonal: true },
  { id: '45006', name: 'West Superior (30 NM NE Outer Island)', lake: 'Lake Superior', lat: 47.335, lon: -89.793, seasonal: true },
  { id: '45004', name: 'East Superior (70 NM NE Marquette)', lake: 'Lake Superior', lat: 47.583, lon: -86.586, seasonal: true },
  { id: '45001', name: 'Mid Superior (60 NM NNE Hancock)', lake: 'Lake Superior', lat: 48.061, lon: -87.793, seasonal: true },
  // Lake Michigan
  { id: '45170', name: 'Michigan City, IN', lake: 'Lake Michigan', lat: 41.755, lon: -86.968 },
  { id: '45198', name: 'Chicago Buoy', lake: 'Lake Michigan', lat: 41.892, lon: -87.563 },
  { id: '45026', name: 'Cook Nuclear Plant, Stevensville', lake: 'Lake Michigan', lat: 41.982, lon: -86.619 },
  { id: '45168', name: 'South Haven, MI', lake: 'Lake Michigan', lat: 42.397, lon: -86.331 },
  { id: '45174', name: 'Wilmette, IL', lake: 'Lake Michigan', lat: 42.135, lon: -87.655 },
  { id: '45186', name: 'Waukegan, IL', lake: 'Lake Michigan', lat: 42.368, lon: -87.795 },
  { id: '45029', name: 'Holland, MI', lake: 'Lake Michigan', lat: 42.900, lon: -86.272 },
  { id: '45161', name: 'Muskegon, MI', lake: 'Lake Michigan', lat: 43.185, lon: -86.354 },
  { id: '45024', name: 'Ludington, MI', lake: 'Lake Michigan', lat: 43.980, lon: -86.560, seasonal: true },
  { id: 'GTLM4', name: 'Grand Traverse Light, MI', lake: 'Lake Michigan', lat: 45.211, lon: -85.550 },
  { id: '45183', name: 'Sleeping Bear Dunes', lake: 'Lake Michigan', lat: 44.982, lon: -85.831 },
  { id: 'FPTM4', name: 'Fairport, MI (Garden Peninsula)', lake: 'Lake Michigan', lat: 45.619, lon: -86.660 },
  { id: '45002', name: 'North Michigan (N Manitou / Washington Is.)', lake: 'Lake Michigan', lat: 45.344, lon: -86.411, seasonal: true },
  { id: '45022', name: 'Little Traverse Bay', lake: 'Lake Michigan', lat: 45.404, lon: -85.088, seasonal: true },
  // Lake Huron
  { id: '45209', name: 'Lakeport, MI', lake: 'Lake Huron', lat: 43.129, lon: -82.391 },
  { id: '45149', name: 'Southern Lake Huron', lake: 'Lake Huron', lat: 43.540, lon: -82.080 },
  { id: '45163', name: 'Saginaw Bay, MI', lake: 'Lake Huron', lat: 43.983, lon: -83.600 },
  { id: '45212', name: 'North Huron Spotter (32 NM NE Alpena)', lake: 'Lake Huron', lat: 45.351, lon: -82.840 },
  { id: 'APNM4', name: 'Alpena Harbor Light', lake: 'Lake Huron', lat: 45.060, lon: -83.424 },
  { id: '45162', name: 'Thunder Bay Buoy, Alpena', lake: 'Lake Huron', lat: 44.988, lon: -83.269, seasonal: true },
  { id: '45194', name: 'McGulpin Point North', lake: 'Lake Huron', lat: 45.803, lon: -84.792 },
  { id: '45175', name: 'Mackinac Straits West', lake: 'Lake Huron', lat: 45.825, lon: -84.772 },
  // Lake Erie
  { id: '45176', name: 'Cleveland Intake Crib, OH', lake: 'Lake Erie', lat: 41.550, lon: -81.765 },
  { id: '45005', name: 'West Erie (16 NM NW Lorain)', lake: 'Lake Erie', lat: 41.677, lon: -82.398, seasonal: true },
  { id: '45165', name: 'Toledo Water Intake, OH', lake: 'Lake Erie', lat: 41.704, lon: -83.264 },
  { id: '45200', name: 'Maumee Bay', lake: 'Lake Erie', lat: 41.724, lon: -83.370 },
  { id: '45164', name: 'Cleveland, OH', lake: 'Lake Erie', lat: 41.748, lon: -81.698 },
  { id: '45167', name: 'Erie Nearshore, PA', lake: 'Lake Erie', lat: 42.185, lon: -80.135 },
  { id: '45220', name: 'Dunkirk, NY', lake: 'Lake Erie', lat: 42.561, lon: -79.432 },
  // Lake Ontario
  { id: '45142', name: 'Port Colborne', lake: 'Lake Ontario', lat: 42.740, lon: -79.290 },
  { id: '45139', name: 'West Lake Ontario — Grimsby', lake: 'Lake Ontario', lat: 43.250, lon: -79.530 },
  { id: '45190', name: 'Sodus Point, NY', lake: 'Lake Ontario', lat: 43.282, lon: -76.961 },
  { id: '45215', name: 'Oswego, NY', lake: 'Lake Ontario', lat: 43.501, lon: -76.539 },
  { id: '45012', name: 'East Lake Ontario (20 NM NNE Rochester)', lake: 'Lake Ontario', lat: 43.621, lon: -77.401, seasonal: true },
  { id: '45159', name: 'NW Lake Ontario — Ajax', lake: 'Lake Ontario', lat: 43.770, lon: -78.980 },
  // Lake St Clair
  { id: '45147', name: 'Lake St Clair', lake: 'Lake St Clair', lat: 42.430, lon: -82.680 }
];
// Sparse nearshore anchors where NDBC buoy coverage is thin (esp. WI west shore).
const LAKE_NEARSHORE = [
  { lake: 'Lake Michigan', lat: 44.52, lon: -88.01 },
  { lake: 'Lake Michigan', lat: 44.10, lon: -87.66 },
  { lake: 'Lake Michigan', lat: 43.75, lon: -87.71 },
  { lake: 'Lake Michigan', lat: 42.73, lon: -87.78 },
  { lake: 'Lake Michigan', lat: 45.10, lon: -87.60 }
];
const GLAKE_MAX_NM = 50;
const WATER_LAKE_INLAND_NM = 12;
const NDBC_STATION_URL = 'https://www.ndbc.noaa.gov/station_page.php?station=';
const NDBC_MAP_BASE = 'https://www.ndbc.noaa.gov/';
function ndbcMapUrl(loc){
  if(!loc) return NDBC_MAP_BASE;
  return NDBC_MAP_BASE + '?lat=' + loc.lat + '&lon=' + loc.lon + '&zoom=7';
}
function locKey(loc){
  return (loc.lat || 0).toFixed(2) + ',' + (loc.lon || 0).toFixed(2);
}
function distNm(lat1, lon1, lat2, lon2){
  const R = 3440.065;
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function lakeProximityNm(lat, lon){
  const lake = greatLakeName(lat, lon);
  if(!lake) return null;
  let bestD = Infinity;
  const check = (la, lo) => {
    const d = distNm(lat, lon, la, lo);
    if(d < bestD) bestD = d;
  };
  for(const b of BUOY_PRESETS){
    if(b.lake === lake) check(b.lat, b.lon);
  }
  for(const s of LAKE_NEARSHORE){
    if(s.lake === lake) check(s.lat, s.lon);
  }
  return bestD;
}
function nearestLakeNearshore(lat, lon, lake){
  let best = null, bestD = Infinity;
  for(const s of LAKE_NEARSHORE){
    if(s.lake !== lake) continue;
    const d = distNm(lat, lon, s.lat, s.lon);
    if(d < bestD){ bestD = d; best = s; }
  }
  return best;
}
function buoyCoords(id){
  return BUOY_PRESETS.find(b => b.id === (id || '').toUpperCase()) || null;
}
function isGreatLakesBuoyWinter(){
  const m = new Date().getMonth() + 1;
  return m >= 11 || m <= 4;
}
function nearestBuoyForLoc(lat, lon, excludeIds){
  const exclude = new Set((excludeIds || []).map(id => String(id).toUpperCase()));
  const lake = greatLakeName(lat, lon);
  let pool = lake ? BUOY_PRESETS.filter(b => b.lake === lake) : BUOY_PRESETS;
  if(!pool.length) pool = BUOY_PRESETS;
  const winter = isGreatLakesBuoyWinter();
  const pick = skipSeasonal => {
    let best = null, bestD = Infinity;
    for(const b of pool){
      if(exclude.has(b.id)) continue;
      if(skipSeasonal && winter && b.seasonal) continue;
      const d = distNm(lat, lon, b.lat, b.lon);
      if(d < bestD){ bestD = d; best = b; }
    }
    return best;
  };
  return pick(true) || pick(false);
}
function buoyPins(){
  const p = store.get('st_buoy_pins');
  return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
}
function buoyPinForLocation(loc){
  if(!loc) return null;
  const id = buoyPins()[locKey(loc)];
  return id ? String(id).toUpperCase() : null;
}
function setBuoyPin(loc, id){
  const key = locKey(loc);
  const pins = buoyPins();
  if(id) pins[key] = String(id).trim().toUpperCase();
  else delete pins[key];
  store.set('st_buoy_pins', { ...pins });
}
function migrateBuoyPins(){
  let pins = buoyPins();
  let changed = false;
  for(const k of Object.keys(pins)){
    const id = String(pins[k]).toUpperCase();
    if(id === '45003'){ pins[k] = '45212'; changed = true; }
  }
  if(changed) store.set('st_buoy_pins', { ...pins });
  if(Object.keys(pins).length && !changed) return;
  if(Object.keys(buoyPins()).length) return;
  const manual = store.get('st_buoy_manual') === '1';
  const saved = store.get('st_buoy');
  const savedLoc = store.get('st_buoy_loc');
  if(manual && saved && savedLoc){
    const id = String(saved).toUpperCase();
    pins[savedLoc] = id === '45003' ? '45212' : id;
    store.set('st_buoy_pins', { ...pins });
  }
}
function resolveBuoyForLocation(loc){
  const pinned = buoyPinForLocation(loc);
  if(pinned) return pinned;
  const near = nearestBuoyForLoc(loc.lat, loc.lon);
  return near ? near.id : '45029';
}
function applyBuoyForLocation(loc){
  if(!loc) return;
  const id = resolveBuoyForLocation(loc);
  setBuoyId(id, false);
  updateBuoyNearestBtn(loc);
  const findLink = $('buoyFindLink');
  if(findLink) findLink.href = ndbcMapUrl(loc);
}
let buoySyncedLocKey = '';
let buoyLoadGen = 0;
function syncBuoyForLocation(loc, reloadData){
  if(!isGreatLakesLoc(loc)) return;
  const key = locKey(loc);
  const needsResolve = key !== buoySyncedLocKey || !($('buoyId').value || '').trim();
  if(needsResolve){
    buoySyncedLocKey = key;
    applyBuoyForLocation(loc);
  } else {
    updateBuoyNearestBtn(loc);
  }
  if(reloadData) loadBuoy();
}
function userSelectBuoy(id){
  const loc = state.locations[state.active];
  const st = (id || '').trim().toUpperCase();
  if(!st) return;
  setBuoyPin(loc, st);
  buoySyncedLocKey = locKey(loc);
  setBuoyId(st, true);
  updateBuoyNearestBtn(loc);
  const picker = $('buoyPicker');
  if(picker) picker.open = false;
}
function resetBuoyToNearest(){
  const loc = state.locations[state.active];
  if(!loc) return;
  setBuoyPin(loc, null);
  buoySyncedLocKey = locKey(loc);
  applyBuoyForLocation(loc);
  loadBuoy();
}
function updateBuoyNearestBtn(loc){
  const btn = $('buoyNearest');
  if(!btn || !loc) return;
  const pinned = !!buoyPinForLocation(loc);
  btn.disabled = !pinned;
  btn.title = pinned
    ? 'Clear pinned station and use nearest for this location'
    : 'Already using nearest station for this location';
}
function buoyPresetName(id){
  const hit = BUOY_PRESETS.find(b => b.id === (id || '').toUpperCase());
  return hit ? hit.name : null;
}
function initBuoySelect(){
  const sel = $('buoySelect');
  sel.innerHTML = BUOY_PRESETS.map(b =>
    '<option value="' + b.id + '">' + b.id + ' — ' + esc(b.name) + '</option>'
  ).join('') + '<option value="_custom">Other station…</option>';
}
let buoySelectSyncing = false;
function syncBuoySelect(){
  const st = ($('buoyId').value || '').trim().toUpperCase();
  const sel = $('buoySelect');
  const input = $('buoyId');
  const known = BUOY_PRESETS.some(b => b.id === st);
  buoySelectSyncing = true;
  if(known){
    sel.value = st;
    input.style.display = 'none';
  } else {
    sel.value = '_custom';
    input.style.display = '';
    if(st) input.value = st;
  }
  buoySelectSyncing = false;
}
function setBuoyId(id, load){
  const st = (id || '').trim().toUpperCase();
  $('buoyId').value = st;
  syncBuoySelect();
  if(load && st) loadBuoy();
}
function buoyDistanceLabel(id, loc){
  const meta = buoyCoords(id);
  if(!meta || !loc) return '';
  const nm = distNm(loc.lat, loc.lon, meta.lat, meta.lon);
  return nm < 10 ? (Math.round(nm * 10) / 10) + ' nm from you' : Math.round(nm) + ' nm from you';
}
async function fetchBuoyStationName(st){
  const id = (st || '').trim().toUpperCase();
  if(!id) return null;
  const preset = buoyPresetName(id);
  if(preset) return preset;
  try{
    const r = await nwsFetch('https://api.weather.gov/stations/' + encodeURIComponent(id));
    if(r.ok){
      const props = ((await r.json()).properties) || {};
      if(props.name) return props.name;
    }
  }catch(e){}
  return null;
}
function updateBuoyCard(st, name, obsTime){
  const id = (st || '').trim().toUpperCase();
  const titleEl = $('buoyCardTitle'), metaEl = $('buoyCardMeta'), link = $('buoyPageLink');
  if(!titleEl) return;
  if(!id){
    titleEl.textContent = 'Select a station';
    metaEl.textContent = 'Tap Nearest or change station below';
    if(link) link.href = ndbcMapUrl(state.locations[state.active]);
    return;
  }
  const loc = state.locations[state.active];
  const dist = buoyDistanceLabel(id, loc);
  titleEl.textContent = name || buoyPresetName(id) || 'NDBC station';
  const parts = [id];
  if(dist) parts.push(dist);
  if(obsTime) parts.push('OBS ' + obsTime);
  metaEl.textContent = parts.join(' \u00B7 ');
  if(link) link.href = NDBC_STATION_URL + encodeURIComponent(id);
}
function glfHeadline(text){
  if(!text) return '';
  for(const raw of text.split('\n')){
    const line = raw.trim();
    if(!line) continue;
    if(/^National Weather Service\b/i.test(line)) continue;
    if(/^NWS\b/i.test(line)) continue;
    if(/^\d{3,4}\s+(AA|BB|CC|DD|EE|FF|GG|HH|II|KK|LL|MM|NN|OO|PP|QQ|RR|SS|TT|UU|VV|WW|XX|YY|ZZ)/i.test(line)) continue;
    if(/^\.\w+\.\.\./i.test(line)){
      return line.replace(/^\.+/, '').replace(/\.\.\./g, ' \u2014 ').slice(0, 180);
    }
    if(/^(SMALL CRAFT|GALE|STORM|WIND|FOG|HAZARD)/i.test(line) && line.length > 12)
      return line.slice(0, 180);
  }
  const hit = text.split('\n').find(l => {
    const t = l.trim();
    if(t.length <= 24) return false;
    if(/^GLFL/i.test(t)) return false;
    if(/^LAKE\b/i.test(t)) return false;
    if(/^National Weather Service\b/i.test(t)) return false;
    return true;
  });
  return hit ? hit.trim().slice(0, 180) : '';
}
const waterVerdictState = { marine: null, coastal: null };
function marineHazardLevel(text){
  if(!text) return 0;
  const u = text.toUpperCase();
  if(/GALE WARNING|STORM WARNING|HURRICANE FORCE|TROPICAL STORM WARNING/.test(u)) return 3;
  if(/SMALL CRAFT ADVISORY|SMALL CRAFT|HAZARDOUS SEAS|SPECIAL MARINE WARNING/.test(u)) return 2;
  if(/SMALL CRAFT EXERCISE CAUTION|DENSE FOG|FOG ADVISORY/.test(u)) return 1;
  return 0;
}
function waveHeightFt(waveM){
  if(waveM == null) return null;
  return state.units === 'F' ? waveM * 3.28084 : waveM;
}
function waveHeightLabel(waveM){
  if(waveM == null) return null;
  return state.units === 'F' ? mToFt(waveM) + ' ft' : waveM.toFixed(1) + ' m';
}
function stashWaterMarine(ctx){
  waterVerdictState.marine = ctx;
  renderWaterVerdict();
}
function stashWaterCoastal(ctx){
  waterVerdictState.coastal = ctx;
  renderWaterVerdict();
}
function buildWaterVerdictAttribution(loc, marine, coastal, isLake, isCoast){
  const parts = [];
  const nwsSrc = marine?.nwsSource || coastal?.nwsSource;
  if(nwsSrc){
    parts.push(nwsSrc);
    if(isLake && marine?.lake && !nwsSrc.includes(marine.lake)){
      parts.push(marine.lake + ' open waters');
    }
  }else if(isLake && marine?.lake){
    parts.push('No NWS lake forecast — waves and wind only');
  }else if(isCoast){
    parts.push('No NWS marine zone text loaded');
  }
  const waveAt = marine?.waveAt || coastal?.waveAt;
  if(waveAt && waveAt !== 'your location'){
    parts.push('Waves at ' + waveAt);
  }else if(marine?.waveHeight != null || coastal?.waveHeight != null){
    parts.push('Waves modeled at your pin');
  }
  if(loc?.name){
    parts.push('Wind at ' + (marine?.windAt || coastal?.windAt || loc.name));
  }
  if(isCoast && coastal?.tideStation){
    parts.push('Tides: ' + coastal.tideStation);
  }
  if(hazardNoteFromText(marine?.nwsText || coastal?.nwsText)){
    parts.push('Verdict includes NWS marine wording');
  }
  return parts.join(' \u00B7 ');
}
function hazardNoteFromText(text){
  return text && marineHazardLevel(text) > 0;
}
function renderWaterVerdict(){
  const panel = $('waterVerdictPanel');
  if(!panel) return;
  const loc = state.locations[state.active];
  const isLake = loc && isGreatLakesLoc(loc);
  const isCoast = loc && isCoastalLoc(loc);
  if(!isLake && !isCoast){
    panel.hidden = true;
    syncImpactTabChrome();
    return;
  }
  const d = state.data;
  const wi = d ? nowIndex(d) : 0;
  const marine = waterVerdictState.marine;
  const coastal = waterVerdictState.coastal;
  const wind = marine?.wind ?? coastal?.wind ?? d?.current?.wind_speed_10m ?? d?.hourly?.wind_speed_10m?.[wi] ?? 0;
  const gust = marine?.gust ?? coastal?.gust ?? d?.current?.wind_gusts_10m ?? d?.hourly?.wind_gusts_10m?.[wi] ?? 0;
  const waveM = marine?.waveHeight ?? coastal?.waveHeight ?? null;
  const waveFt = waveHeightFt(waveM);
  const nwsText = marine?.nwsText || coastal?.nwsText || '';
  const hazard = marineHazardLevel(nwsText);
  const headline = glfHeadline(nwsText);
  let verdict, cls, detailParts = [];
  if(hazard >= 3 || (waveFt != null && waveFt >= 8) || gust >= 40){
    verdict = 'Stay ashore';
    cls = 'warn';
  }else if(hazard >= 2 || (waveFt != null && waveFt >= 4) || gust >= 28 || wind >= 22){
    verdict = 'Small craft caution';
    cls = 'mid';
  }else if(hazard >= 1 || (waveFt != null && waveFt >= 2.5)){
    verdict = 'Use caution on the water';
    cls = 'mid';
  }else if(waveM != null || nwsText){
    verdict = 'Favorable for small craft';
    cls = 'good';
  }else{
    verdict = 'Marine conditions';
    cls = 'mid';
  }
  if(waveM != null) detailParts.push('Waves ~' + waveHeightLabel(waveM));
  if(wind) detailParts.push('Wind ' + Math.round(wind) + ' ' + windUnit() + (gust > wind + 4 ? ', gusts ' + Math.round(gust) : ''));
  if(headline) detailParts.push(headline);
  else if(isLake && marine?.lake) detailParts.push(marine.lake + ' nearshore');
  else if(isCoast && coastal?.tideLabel) detailParts.push(coastal.tideLabel);
  $('waterVerdictText').textContent = verdict;
  $('waterVerdictText').className = 'verdict ' + cls;
  $('waterVerdictDetail').textContent = detailParts.join(' \u00B7 ') || 'Loading wave and marine forecast data\u2026';
  const srcEl = $('waterVerdictSource');
  if(srcEl){
    const attr = buildWaterVerdictAttribution(loc, marine, coastal, isLake, isCoast);
    srcEl.textContent = attr;
    srcEl.hidden = !attr;
  }
  panel.hidden = false;
  syncImpactTabChrome();
}
function renderNearshoreSummary(lake, c, nwsMarine, buoyId, airDeltaC){
  const box = $('nearshoreSummary'), head = $('nearshoreHeadline'), stats = $('nearshoreStats');
  if(!box || !head || !stats) return;
  const headline = glfHeadline(nwsMarine?.text || '');
  head.textContent = headline || (nwsMarine
    ? 'NWS lake forecast loaded \u2014 see full discussion below.'
    : 'Open-Meteo nearshore model for ' + lake + '.');
  const chips = [];
  if(c && c.wave_height != null){
    chips.push(['Waves', state.units === 'F' ? mToFt(c.wave_height) + ' ft' : c.wave_height + ' m']);
  }
  if(c && c.sea_surface_temperature != null){
    const t = state.units === 'F' ? cToF(c.sea_surface_temperature) : Math.round(c.sea_surface_temperature);
    chips.push(['Water temp', t + degSym()]);
  }
  if(airDeltaC != null){
    const d = state.units === 'F' ? Math.round(airDeltaC * 9 / 5) : Math.round(airDeltaC);
    chips.push(['Air \u0394 water', (d > 0 ? '+' : '') + d + degSym()]);
  }
  if(buoyId){
    const dist = buoyDistanceLabel(buoyId, state.locations[state.active]);
    chips.push(['Buoy', (buoyPresetName(buoyId) || buoyId) + (dist ? ' \u00B7 ' + dist : '')]);
  }
  stats.innerHTML = chips.map(([k, v]) =>
    '<div class="nearshore-stat"><span class="ns-k">' + esc(k) + '</span><span class="ns-v">' + esc(v) + '</span></div>'
  ).join('');
  box.hidden = !chips.length && !headline;
}
function trimGlfProduct(text){
  const lines = text.trim().split('\n');
  const body = (lines[0] === '' ? lines.slice(4) : lines.slice(3)).join('\n').trim();
  const syn = body.search(/\n\.?SYNOPSIS/i);
  const slice = syn > 0 ? body.slice(0, syn) : body;
  return slice.trim().slice(0, 1400);
}
function extractGlfSection(text, code){
  if(!text || !code) return null;
  const startRe = new RegExp('^\\s*' + code + '\\b', 'm');
  const start = text.search(startRe);
  if(start < 0) return null;
  const tail = text.slice(start);
  const next = tail.slice(1).search(/\nGLFL[A-Z]{1,2}\s/m);
  const section = next >= 0 ? tail.slice(0, next + 1) : tail;
  return trimGlfProduct(section);
}
async function glfCandidatesFromItems(items, code){
  const results = await Promise.all(items.map(async item => {
    try{
      const pr = await nwsFetch('https://api.weather.gov/products/' + item.id);
      if(!pr.ok) return null;
      const prod = await pr.json();
      const section = extractGlfSection(prod.productText || '', code);
      if(!section) return null;
      return { office: item.issuingOffice, section };
    }catch(e){ return null; }
  }));
  return results.filter(Boolean);
}
async function fetchGlfLakeProduct(lake, preferOffice, lat, lon){
  const code = LAKE_GLF_CODE[lake];
  if(!code) return null;
  const lr = await nwsFetch('https://api.weather.gov/products/types/GLF');
  if(!lr.ok) return null;
  const items = ((await lr.json())['@graph'] || []).slice(0, 48);
  const prefer = normalizeNwsOffice(preferOffice);
  const offices = lakeGlfOfficesForLoc(lake, lat, lon);
  if(prefer){
    const preferItems = items.filter(item => item.issuingOffice === prefer);
    const preferCandidates = await glfCandidatesFromItems(preferItems.slice(0, 4), code);
    const preferHit = pickGlfCandidate(preferCandidates, prefer, offices);
    if(preferHit){
      return {
        source: 'NWS Great Lakes \u2014 ' + lake + ' (' + prefer.replace(/^K/, '') + ' WFO)',
        text: preferHit.section
      };
    }
  }
  let pool = items;
  if(offices.length || prefer){
    const officeHits = items.filter(item =>
      (prefer && item.issuingOffice === prefer) || offices.includes(item.issuingOffice)
    );
    if(officeHits.length) pool = officeHits;
  }
  pool = [...pool].sort((a, b) => {
    if(prefer && a.issuingOffice === prefer) return -1;
    if(prefer && b.issuingOffice === prefer) return 1;
    const ai = offices.indexOf(a.issuingOffice);
    const bi = offices.indexOf(b.issuingOffice);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  const toFetch = pool.slice(0, 8);
  const candidates = await glfCandidatesFromItems(toFetch, code);
  if(!candidates.length) return null;
  const hit = pickGlfCandidate(candidates, prefer, offices);
  const officeLabel = hit && hit.office
    ? hit.office.replace(/^K/, '') + ' WFO'
    : '';
  return {
    source: 'NWS Great Lakes \u2014 ' + lake + (officeLabel ? ' (' + officeLabel + ')' : ''),
    text: hit.section
  };
}
async function fetchNwsMarineText(loc, pointsProps){
  const lake = greatLakeName(loc.lat, loc.lon);
  if(lake && isLikelyUS(loc)){
    const glf = await fetchGlfLakeProduct(lake, pointsProps && pointsProps.cwa, loc.lat, loc.lon);
    if(glf) return glf;
  }
  const marineUrl = pointsProps && pointsProps.forecastMarineZone;
  if(marineUrl){
    let zoneName = '';
    try{
      const zr = await nwsFetch(marineUrl);
      if(zr.ok) zoneName = (await zr.json()).properties?.name || '';
    }catch(e){ /* ignore */ }
    const r = await nwsFetch(marineUrl + '/forecast');
    if(r.ok){
      const j = await r.json();
      const p = (j.properties.periods || [])[0];
      if(p){
        return {
          source: zoneName ? 'NWS ' + zoneName : 'NWS marine zone',
          text: (p.shortForecast || '') + '\n\n' + (p.detailedForecast || '')
        };
      }
    }
  }
  return null;
}
async function fetchMarineCurrent(lat, lon){
  const url = 'https://marine-api.open-meteo.com/v1/marine'
    + '?latitude=' + lat + '&longitude=' + lon
    + '&current=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,sea_surface_temperature'
    + '&timezone=auto';
  const r = await fetch(url);
  if(!r.ok) throw new Error('marine HTTP ' + r.status);
  return (await r.json()).current || {};
}
async function fetchWindCurrent(lat, lon){
  const windU = state.units === 'F' ? 'mph' : 'kmh';
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon
    + '&current=wind_speed_10m,wind_gusts_10m&wind_speed_unit=' + windU + '&timezone=auto';
  try{
    const r = await fetch(url);
    if(!r.ok) return { wind: 0, gust: 0 };
    const cur = (await r.json()).current || {};
    return { wind: cur.wind_speed_10m ?? 0, gust: cur.wind_gusts_10m ?? 0 };
  }catch(e){
    return { wind: 0, gust: 0 };
  }
}
function waterWindSample(loc, lake, waveLat, waveLon, waveAt){
  let windLat = waveLat, windLon = waveLon, windAt = waveAt;
  if(waveAt === 'your location'){
    const prox = lake ? lakeProximityNm(loc.lat, loc.lon) : null;
    if(prox != null && prox > WATER_LAKE_INLAND_NM){
      const buoy = nearestBuoyForLoc(loc.lat, loc.lon);
      if(buoy){
        windLat = buoy.lat;
        windLon = buoy.lon;
        windAt = (buoyPresetName(buoy.id) || buoy.id) + ' buoy';
      }else{
        const shore = nearestLakeNearshore(loc.lat, loc.lon, lake);
        if(shore){
          windLat = shore.lat;
          windLon = shore.lon;
          windAt = lake + ' nearshore';
        }
      }
    }else{
      windAt = loc.name || 'your location';
    }
  }
  return { windLat, windLon, windAt };
}
let marineLoadGen = 0;
async function loadMarine(loc){
  const gen = ++marineLoadGen;
  const panel = $('marinePanel');
  const lake = greatLakeName(loc.lat, loc.lon);
  syncMarinePanelVisibility(loc);
  if(!lake || !isLikelyUS(loc)) return;
  if(!($('buoyId').value || '').trim()) applyBuoyForLocation(loc);
  const buoyId = ($('buoyId').value || '').trim().toUpperCase();
  const buoyMeta = buoyCoords(buoyId);
  $('marineTitle').textContent = lake;

  return panelTask('marinePanel', 'marineStatus', async () => {
    if(gen !== marineLoadGen) return;
    const box = $('marineMetrics'), note = $('marineNote'), nwsBox = $('marineNws');
    const lakeBox = $('lakeOutlook');
    box.innerHTML = ''; note.textContent = ''; nwsBox.textContent = '';
    lakeBox.style.display = 'none';
    const nearshore = $('nearshoreSummary');
    if(nearshore) nearshore.hidden = true;
    const pointsProps = state.data && state.data.nwsPoints;
    const nwsP = isLikelyUS(loc) ? fetchNwsMarineText(loc, pointsProps).catch(() => null) : Promise.resolve(null);
    if(buoyMeta && buoyMeta.lake !== lake){
      note.textContent = 'NWS lake forecast is for ' + lake + ' at your location. Buoy '
        + (buoyPresetName(buoyId) || buoyId) + ' is on ' + buoyMeta.lake + '.';
    }
    try{
      let waveLat = loc.lat, waveLon = loc.lon;
      let c = await fetchMarineCurrent(waveLat, waveLon);
      let waveAt = 'your location';
      if((c.wave_height === null || c.wave_height === undefined) && buoyMeta){
        waveLat = buoyMeta.lat;
        waveLon = buoyMeta.lon;
        c = await fetchMarineCurrent(waveLat, waveLon);
        waveAt = (buoyPresetName(buoyId) || buoyId) + ' buoy';
      }
      const nwsMarine = await nwsP;
      if(gen !== marineLoadGen) return;
      if(nwsMarine) nwsBox.textContent = nwsMarine.source.toUpperCase() + '\n' + nwsMarine.text;
      const windPt = waterWindSample(loc, lake, waveLat, waveLon, waveAt);
      const windObs = await fetchWindCurrent(windPt.windLat, windPt.windLon);
      if(gen !== marineLoadGen) return;
      let airDeltaC = null;
      if(state.data && c.sea_surface_temperature != null){
        airDeltaC = (state.units === 'F'
          ? (state.data.current.temperature_2m - 32) * 5 / 9
          : state.data.current.temperature_2m) - c.sea_surface_temperature;
      }
      renderNearshoreSummary(lake, c, nwsMarine, buoyId, airDeltaC);
      stashWaterMarine({
        waveHeight: c.wave_height,
        nwsText: nwsMarine?.text || '',
        nwsSource: nwsMarine?.source || '',
        lake,
        waveAt,
        wind: windObs.wind,
        gust: windObs.gust,
        windAt: windPt.windAt
      });
      if(c.wave_height === null || c.wave_height === undefined){
        const extra = note.textContent ? note.textContent + ' ' : '';
        note.textContent = extra + (nwsMarine
          ? 'Wave model: no grid coverage at your location or the selected buoy — see NWS forecast above and buoy obs below.'
          : 'Wave model: no coverage at your location or the selected buoy — try a coordinate over open water.');
        return;
      }
      const waveNote = waveAt === 'your location' ? '' : 'Wave model at ' + waveAt + '. ';
      if(waveNote){
        note.textContent = (note.textContent ? note.textContent + ' ' : '') + waveNote;
      }
      const wv = state.units === 'F' ? mToFt(c.wave_height) + '<small> ft</small>' : c.wave_height + '<small> m</small>';
      const ww = state.units === 'F' ? mToFt(c.wind_wave_height ?? 0) + '<small> ft</small>' : (c.wind_wave_height ?? 0) + '<small> m</small>';
      const sw = state.units === 'F' ? mToFt(c.swell_wave_height ?? 0) + '<small> ft</small>' : (c.swell_wave_height ?? 0) + '<small> m</small>';
      const sst = c.sea_surface_temperature === null || c.sea_surface_temperature === undefined ? '\u2014'
        : (state.units === 'F' ? cToF(c.sea_surface_temperature) : Math.round(c.sea_surface_temperature)) + '<small>' + degSym() + '</small>';
      const rows = [
        ['Wave height', wv],
        ['Wave period', (c.wave_period ?? '\u2014') + '<small> s</small>'],
        ['Wave dir', Math.round(c.wave_direction ?? 0) + '<small>\u00B0 ' + compass(c.wave_direction ?? 0) + '</small>'],
        ['Wind waves', ww],
        ['Swell', sw],
        ['Water temp', sst]
      ];
      box.innerHTML = rows.map(r =>
        '<div class="metric"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>'
      ).join('');

      if(state.data && c.sea_surface_temperature !== null && c.sea_surface_temperature !== undefined){
        const airC = state.units === 'F'
          ? (state.data.current.temperature_2m - 32) * 5 / 9
          : state.data.current.temperature_2m;
        const deltaC = airDeltaC != null ? airDeltaC : (airC - c.sea_surface_temperature);
        const deltaDisp = state.units === 'F' ? Math.round(deltaC * 9 / 5) : Math.round(deltaC);
        let verdict, cls, detail;
        if(deltaC <= -13){
          verdict = 'Lake-effect potential'; cls = 'good';
          detail = 'Air ' + deltaDisp + '\u00B0 colder than water \u2014 classic setup for lake-effect snow/showers when winds align.';
        } else if(deltaC <= -8){
          verdict = 'Moderate lake influence'; cls = 'mid';
          detail = 'Air\u2013water delta ' + deltaDisp + '\u00B0' + degSym() + '. Some lake-modified weather possible downwind.';
        } else if(deltaC >= 5){
          verdict = 'Stable / warm over water'; cls = 'warn';
          detail = 'Air warmer than water by ' + Math.abs(deltaDisp) + '\u00B0' + degSym() + ' \u2014 lake breeze or fog possible near shore.';
        } else {
          verdict = 'Neutral lake gradient'; cls = 'mid';
          detail = 'Air\u2013water delta ' + deltaDisp + '\u00B0' + degSym() + '. Limited lake-driven forcing.';
        }
        $('lakeVerdict').textContent = verdict;
        $('lakeVerdict').className = 'verdict ' + cls;
        $('lakeDetail').textContent = detail;
        lakeBox.style.display = 'block';
      }
    }catch(e){
      setPanelUnavail(note, 'no_waves');
      console.error('marine', e);
    }
  });
}

// ---------- NWS hourly precip probability (US, free) ----------
let forecastNbmGen = 0;
function forecastNeedsNbmStrip(d){
  if(!d || !isLikelyUS(state.locations[state.active])) return false;
  const dd = d.daily;
  if(dd){
    const pop0 = dd.precipitation_probability_max?.[0] ?? 0;
    const pop1 = dd.precipitation_probability_max?.[1] ?? 0;
    if(pop0 >= 25 || pop1 >= 25) return true;
  }
  const hh = d.hourly;
  if(!hh?.time?.length) return false;
  const i0 = nowIndex({ hourly: hh });
  for(let j = i0; j < Math.min(i0 + 36, hh.time.length); j++){
    if((hh.precipitation_probability?.[j] ?? 0) >= 30) return true;
    if(isRainWxCode(hh.weather_code?.[j])) return true;
    if(isStormWxCode(hh.weather_code?.[j])) return true;
  }
  return false;
}
async function fetchNbmHourlyPeriods(loc, limit){
  if(!isLikelyUS(loc)) return [];
  const pr = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
  if(!pr.ok) throw new Error('points');
  const pts = (await pr.json()).properties;
  const wfo = pts.gridId || pts.cwa;
  const gx = pts.gridX, gy = pts.gridY;
  if(!wfo || gx == null || gy == null) throw new Error('grid');
  const r = await nwsFetch('https://api.weather.gov/gridpoints/' + wfo + '/' + gx + ',' + gy + '/forecast/hourly');
  if(!r.ok) throw new Error('hourly http ' + r.status);
  const j = await r.json();
  const max = limit || 8;
  return (j.properties?.periods || []).slice(0, 18).filter(p =>
    (p.probabilityOfPrecipitation?.value ?? 0) > 0 || /rain|shower|storm|snow|drizzle|sleet|freezing/i.test(p.shortForecast || '')
  ).slice(0, max);
}
function renderNbmPeriodsHtml(periods, compact){
  return periods.map(p => {
    const prob = p.probabilityOfPrecipitation?.value;
    const start = p.startTime ? new Date(p.startTime).toLocaleString([], { weekday: compact ? 'short' : 'short', hour: 'numeric' }) : '';
    const high = prob != null && prob >= 50;
    if(compact){
      return '<div class="forecast-nbm-hour' + (high ? ' high' : '') + '"><span class="k">' + esc(start) + '</span>'
        + '<span class="v">' + (prob != null ? prob + '%' : '\u2014') + '</span></div>';
    }
    return '<div class="metric"><div class="k">' + esc(start) + '</div><div class="v">'
      + (prob != null ? prob + '<small>% · ' + esc(p.shortForecast || '') + '</small>' : esc(p.shortForecast || '\u2014'))
      + '</div></div>';
  }).join('');
}
async function loadForecastNbmStrip(loc, d){
  const box = $('forecastNbmStrip');
  if(!box) return;
  if(!loc || !d || !forecastNeedsNbmStrip(d)){
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const gen = ++forecastNbmGen;
  box.hidden = false;
  box.innerHTML = '<div class="forecast-nbm-lbl">NWS hourly precip probability</div>'
    + '<div class="radar-note">Loading probabilities\u2026</div>';
  try{
    const periods = await fetchNbmHourlyPeriods(loc, 8);
    if(gen !== forecastNbmGen) return;
    if(!periods.length){
      box.hidden = true;
      return;
    }
    box.innerHTML = '<div class="forecast-nbm-lbl">NWS hourly precip probability</div>'
      + '<div class="forecast-nbm-hours">' + renderNbmPeriodsHtml(periods, true) + '</div>'
      + '<p class="radar-note" style="margin-top:8px">From NWS grid hourly forecast. Full list in More \u2192 NBM panel.</p>';
  }catch(e){
    if(gen !== forecastNbmGen) return;
    box.hidden = true;
    console.warn('forecastNbmStrip', e);
  }
}
async function loadNbm(loc){
  const panel = $('nbmPanel'), body = $('nbmBody');
  if(!panel || !body) return;
  if(!isLikelyUS(loc)){ panel.hidden = true; return; }
  return panelTask('nbmPanel', 'nbmStatus', async () => {
    panel.hidden = false;
    body.textContent = 'Loading NWS probabilities\u2026';
    try{
      const periods = await fetchNbmHourlyPeriods(loc, 8);
      if(!periods.length){
        body.innerHTML = panelUnavail('no_precip_prob');
        return;
      }
      body.innerHTML = '<div class="metrics" style="margin-top:0">' + renderNbmPeriodsHtml(periods, false) + '</div>';
    }catch(e){
      panel.hidden = false;
      setPanelUnavail(body, 'api_error');
      console.warn('nbm', e);
    }
  });
}

// ---------- USGS streamgages (US, free) ----------
let streamLoadGen = 0;
async function loadStreamGauges(loc){
  const panel = $('streamPanel'), list = $('streamList');
  if(!panel || !list) return;
  if(!isLikelyUS(loc)){ panel.hidden = true; syncImpactTabChrome(); return; }
  const gen = ++streamLoadGen;
  panel.hidden = false;
  list.className = 'radar-note is-loading';
  list.textContent = 'Checking nearby gauges\u2026';
  try{
    const pad = 0.45;
    const west = (loc.lon - pad).toFixed(2);
    const south = (loc.lat - pad).toFixed(2);
    const east = (loc.lon + pad).toFixed(2);
    const north = (loc.lat + pad).toFixed(2);
    const url = 'https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=' + west + ',' + south + ',' + east + ',' + north
      + '&parameterCd=00060,00065&siteStatus=active';
    const r = await fetch(url);
    if(gen !== streamLoadGen) return;
    if(!r.ok){
      list.className = 'radar-note';
      setPanelUnavail(list, 'api_error');
      return;
    }
    const j = await r.json();
    const sites = j.value?.timeSeries || [];
    const rows = [];
    sites.forEach(ts => {
      const site = ts.sourceInfo || {};
      const name = site.siteName || site.siteCode?.[0]?.value || 'Gauge';
      const lat = site.geoLocation?.geogLocation?.latitude;
      const lon = site.geoLocation?.geogLocation?.longitude;
      if(lat == null || lon == null) return;
      const dist = haversineMi(loc.lat, loc.lon, lat, lon);
      if(dist > 30) return;
      const vals = ts.values?.[0]?.value || [];
      const last = vals[vals.length - 1];
      const val = last?.value;
      const param = ts.variable?.variableCode?.[0]?.value;
      let row = rows.find(x => x.id === site.siteCode?.[0]?.value);
      if(!row){
        row = { id: site.siteCode?.[0]?.value, name, dist, stage: null, flow: null };
        rows.push(row);
      }
      if(param === '00065') row.stage = val != null ? val + ' ft' : null;
      if(param === '00060') row.flow = val != null ? Math.round(val) + ' cfs' : null;
    });
    rows.sort((a, b) => a.dist - b.dist);
    if(gen !== streamLoadGen) return;
    list.className = 'radar-note';
    if(!rows.length){
      setPanelUnavail(list, 'no_gauges');
      return;
    }
    list.innerHTML = '<div class="metrics" style="margin-top:0">' + rows.slice(0, 6).map(g =>
      '<div class="metric"><div class="k">' + esc(g.name) + '<small> \u00B7 ' + Math.round(g.dist) + ' mi</small></div><div class="v">'
      + esc([g.stage, g.flow].filter(Boolean).join(' \u00B7 ') || 'No recent reading') + '</div></div>'
    ).join('') + '</div>';
  }catch(e){
    if(gen !== streamLoadGen) return;
    list.className = 'radar-note';
    setPanelUnavail(list, 'api_error');
  }
  if(gen === streamLoadGen) syncImpactTabChrome();
}

// ---------- saved location comparison ----------
let spcDay1GeoCache = null;
async function getSpcDay1Geo(){
  if(spcDay1GeoCache) return spcDay1GeoCache;
  try{
    const r = await fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson');
    if(r.ok) spcDay1GeoCache = await r.json();
  }catch(e){ /* ignore */ }
  return spcDay1GeoCache;
}
async function fetchLocAlerts(loc){
  if(!isLikelyUS(loc)) return [];
  try{
    const r = await nwsFetch('https://api.weather.gov/alerts/active?point=' + loc.lat + ',' + loc.lon);
    if(!r.ok) return [];
    return (await r.json()).features || [];
  }catch(e){ return []; }
}
function locCompareBadges(loc, alerts, spcGeo){
  const badges = [];
  if(isLikelyUS(loc) && alerts.length){
    const warns = alerts.filter(f => /warning/i.test(f.properties?.event || '')).length;
    const watches = alerts.filter(f => /watch/i.test(f.properties?.event || '')).length;
    if(warns) badges.push('<span class="lc-badge alert">' + warns + ' warning' + (warns > 1 ? 's' : '') + '</span>');
    if(watches) badges.push('<span class="lc-badge warn">' + watches + ' watch' + (watches > 1 ? 'es' : '') + '</span>');
    const adv = alerts.length - warns - watches;
    if(adv > 0) badges.push('<span class="lc-badge">' + adv + ' advisory' + (adv > 1 ? 'ies' : '') + '</span>');
  }
  if(isLikelyUS(loc) && spcGeo && typeof spcRiskAtPoint === 'function'){
    const risk = spcRiskAtPoint(loc.lon, loc.lat, spcGeo);
    if(risk && risk.dn >= 2){
      badges.push('<span class="lc-badge spc">SPC ' + esc(risk.label2 || risk.label || 'elevated') + '</span>');
    }
  }
  return badges.length ? '<div class="lc-storm">' + badges.join('') + '</div>' : '';
}
async function renderLocCompare(){
  const panel = $('locComparePanel'), box = $('locCompare');
  if(!panel || !box) return;
  if(state.locations.length < 2){ panel.hidden = true; return; }
  panel.hidden = false;
  box.className = 'radar-note';
  box.textContent = 'Loading saved locations\u2026';
  const spcGeo = await getSpcDay1Geo();
  const cards = await Promise.all(state.locations.map(async (loc, i) => {
    const alertsP = fetchLocAlerts(loc);
    if(i === state.active && state.data){
      const t = Math.round(state.data.current.temperature_2m);
      const w = Math.round(state.data.current.wind_speed_10m);
      const [, ic] = wmo(state.data.current.weather_code);
      const alerts = await alertsP;
      return { loc, i, temp: t, wind: w, icon: ic, active: true, badges: locCompareBadges(loc, alerts, spcGeo) };
    }
    try{
      const [wxRes, alerts] = await Promise.all([
        fetch('https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon
          + '&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit='
          + (state.units === 'F' ? 'fahrenheit' : 'celsius')
          + '&wind_speed_unit=' + (state.units === 'F' ? 'mph' : 'kmh') + '&timezone=auto'),
        alertsP
      ]);
      if(!wxRes.ok) throw new Error('wx');
      const j = await wxRes.json();
      const c = j.current || {};
      const [, ic] = wmo(c.weather_code ?? 0);
      return {
        loc, i,
        temp: Math.round(c.temperature_2m),
        wind: Math.round(c.wind_speed_10m),
        icon: ic,
        active: i === state.active,
        badges: locCompareBadges(loc, alerts, spcGeo)
      };
    }catch(e){
      const alerts = await alertsP;
      return { loc, i, temp: null, wind: null, icon: '', active: i === state.active, badges: locCompareBadges(loc, alerts, spcGeo) };
    }
  }));
  box.innerHTML = cards.map(c =>
    '<div class="lc-card"' + (c.active ? ' style="border-color:var(--accent)"' : '') + '>'
    + '<div class="lc-name">' + esc(c.loc.name) + (c.active ? ' \u00B7 active' : '') + '</div>'
    + '<div class="lc-temp">' + (c.icon ? '<span aria-hidden="true">' + c.icon + '</span> ' : '')
    + (c.temp != null ? c.temp + degSym() : '\u2014') + '</div>'
    + '<div class="lc-meta">' + (c.wind != null ? 'Wind ' + c.wind + ' ' + windUnit() : 'Unavailable') + '</div>'
    + (c.badges || '') + '</div>'
  ).join('');
}

// ---------- NDBC buoy observations (NDBC blocks browser CORS — proxy or fallback) ----------
async function fetchBuoyRaw(st){
  const id = st.toUpperCase();
  const ndbcUrl = 'https://www.ndbc.noaa.gov/data/realtime2/' + encodeURIComponent(id) + '.txt';
  const tries = [
    async () => {
      const r = await fetchTimeout('/api/buoy/' + encodeURIComponent(id), {}, 5000);
      if(!r.ok) throw new Error('local proxy HTTP ' + r.status);
      const j = await r.json();
      if(!j.text) throw new Error('empty proxy response');
      return { text: j.text, source: 'NDBC via server proxy' };
    },
    async () => {
      const r = await fetchTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(ndbcUrl), {}, 6000);
      if(!r.ok) throw new Error('CORS relay HTTP ' + r.status);
      const text = await r.text();
      if(text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) throw new Error('not NDBC data');
      return { text, source: 'NDBC via relay' };
    }
  ];
  let lastErr;
  for(const fn of tries){
    try{ return await fn(); }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('buoy fetch failed');
}
function parseNdbcBuoyText(text){
  const lines = text.split('\n');
  const headerLine = lines.find(l => /^#\s*YY/i.test(l) || /^#YY/i.test(l));
  if(!headerLine) throw new Error('unrecognized NDBC format');
  const cols = headerLine.replace(/^#/, '').trim().split(/\s+/);
  const dataLine = lines.find(l => /^\d{4}\s+\d{1,2}\s+\d{1,2}/.test(l.trim()));
  if(!dataLine) return null;
  const vals = dataLine.trim().split(/\s+/);
  const g = name => {
    const k = cols.indexOf(name);
    const v = k >= 0 ? vals[k] : 'MM';
    return (v === 'MM' || v === undefined) ? null : parseFloat(v);
  };
  const obsTime = vals.length >= 5
    ? vals[0] + '-' + vals[1] + '-' + vals[2] + ' ' + vals[3] + ':' + vals[4] + ' UTC' : '';
  return { g, obsTime };
}
async function loadBuoyFromNws(st){
  const id = st.toUpperCase();
  const p = await fetchStationLatestObs(id);
  if(!p) return null;
  const F = state.units === 'F';
  const nwsWind = obj => {
    const v = nwsVal(obj);
    if(v === null) return null;
    const uc = (obj && obj.unitCode) || '';
    let ms = v;
    if(uc.includes('km_h')) ms = v / 3.6;
    else if(uc.includes('kn')) ms = v * 0.514444;
    return F ? Math.round(ms * 2.237) : Math.round(ms * 3.6);
  };
  const rows = [];
  const tempC = nwsVal(p.temperature);
  if(tempC !== null) rows.push(['Air temp', (F ? cToF(tempC) : Math.round(tempC)) + '<small>' + degSym() + '</small>']);
  const wspd = nwsWind(p.windSpeed);
  if(wspd !== null){
    const wdir = nwsVal(p.windDirection);
    rows.push(['Wind', wspd + '<small> ' + windUnit() + (wdir !== null ? ' ' + compass(wdir) : '') + '</small>']);
  }
  const gust = nwsWind(p.windGust);
  if(gust !== null) rows.push(['Gusts', gust + '<small> ' + windUnit() + '</small>']);
  const presPa = nwsVal(p.seaLevelPressure) ?? nwsVal(p.barometricPressure);
  if(presPa !== null) rows.push(['Pressure', F ? (presPa / 100 * 0.02953).toFixed(2) + '<small> inHg</small>' : Math.round(presPa / 100) + '<small> hPa</small>']);
  if(!rows.length) return null;
  const obsTime = p.timestamp ? new Date(p.timestamp).toLocaleString([], { hour:'numeric', minute:'2-digit', timeZoneName:'short' }) : '';
  return { rows, obsTime, note: 'NWS obs only (no wave data) \u2014 proxy /api/buoy/ on your server for full NDBC' };
}
async function loadBuoy(allowFallback){
  const loc = state.locations[state.active];
  if(!isGreatLakesLoc(loc)) return;
  if(allowFallback === undefined) allowFallback = true;
  const gen = ++buoyLoadGen;
  const st = ($('buoyId').value || '').trim();
  const box = $('buoyMetrics'), note = $('buoyNote');
  box.innerHTML = ''; note.textContent = '';
  if(!st){
    updateBuoyCard('', null);
    return;
  }
  const id = st.toUpperCase();
  const stale = () => gen !== buoyLoadGen || ($('buoyId').value || '').trim().toUpperCase() !== id;
  updateBuoyCard(id, buoyPresetName(id) || null);
  note.textContent = 'Loading buoy\u2026';
  syncBuoySelect();
  try{
    let rows = [], obsTime = '', source = '';
    try{
      const got = await fetchBuoyRaw(st);
      if(stale()) return;
      const parsed = parseNdbcBuoyText(got.text);
      if(!parsed) throw new Error('no data rows');
      const g = parsed.g;
      obsTime = parsed.obsTime;
      source = got.source;
      const F = state.units === 'F';
      const wvht = g('WVHT'); if(wvht !== null) rows.push(['Wave height', F ? mToFt(wvht) + '<small> ft</small>' : wvht + '<small> m</small>']);
      const dpd = g('DPD');   if(dpd !== null) rows.push(['Dominant period', dpd + '<small> s</small>']);
      const wtmp = g('WTMP'); if(wtmp !== null) rows.push(['Water temp', (F ? cToF(wtmp) : Math.round(wtmp)) + '<small>' + degSym() + '</small>']);
      const atmp = g('ATMP'); if(atmp !== null) rows.push(['Air temp', (F ? cToF(atmp) : Math.round(atmp)) + '<small>' + degSym() + '</small>']);
      const wspd = g('WSPD'); if(wspd !== null) rows.push(['Wind', Math.round(F ? wspd * 2.237 : wspd * 3.6) + '<small> ' + windUnit() + (g('WDIR') !== null ? ' ' + compass(g('WDIR')) : '') + '</small>']);
      const gst = g('GST');   if(gst !== null) rows.push(['Gusts', Math.round(F ? gst * 2.237 : gst * 3.6) + '<small> ' + windUnit() + '</small>']);
      const pres = g('PRES'); if(pres !== null) rows.push(['Pressure', F ? (pres * 0.02953).toFixed(2) + '<small> inHg</small>' : Math.round(pres) + '<small> hPa</small>']);
    }catch(ndbcErr){
      console.warn('NDBC buoy', ndbcErr);
      const nws = await loadBuoyFromNws(st);
      if(stale()) return;
      if(nws){ rows = nws.rows; obsTime = nws.obsTime; source = nws.note; }
      else throw ndbcErr;
    }
    if(stale()) return;
    const stationName = await fetchBuoyStationName(id);
    if(stale()) return;
    updateBuoyCard(id, stationName, obsTime);
    if(!rows.length){
      const loc = state.locations[state.active];
      if(allowFallback && loc && !buoyPinForLocation(loc)){
        const alt = nearestBuoyForLoc(loc.lat, loc.lon, [id]);
        if(alt){
          setBuoyId(alt.id, false);
          note.textContent = id + ' has no data (often winter layup) — trying ' + alt.id + '\u2026';
          return loadBuoy(false);
        }
      }
      const seasonal = buoyCoords(id)?.seasonal;
      note.innerHTML = seasonal && isGreatLakesBuoyWinter()
        ? panelUnavail('winter_layup')
        : panelUnavail('buoy_offline');
      return;
    }
    box.innerHTML = rows.map(r =>
      '<div class="metric"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>'
    ).join('');
    note.textContent = source || '';
  }catch(e){
    if(stale()) return;
    updateBuoyCard(id, await fetchBuoyStationName(id));
    note.innerHTML = panelUnavail('buoy_offline');
    console.error('buoy', e);
  }
}
$('buoyRefresh').addEventListener('click', () => loadBuoy());
$('buoyGo').addEventListener('click', () => userSelectBuoy($('buoyId').value));
$('buoyNearest').addEventListener('click', resetBuoyToNearest);
$('buoyId').addEventListener('keydown', e => { if(e.key === 'Enter') userSelectBuoy($('buoyId').value); });
$('buoySelect').addEventListener('change', () => {
  if(buoySelectSyncing) return;
  const v = $('buoySelect').value;
  if(v === '_custom'){
    $('buoyId').style.display = '';
    $('buoyId').focus();
    return;
  }
  userSelectBuoy(v);
});

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

// ---------- master load ----------
let tabPanelsLoaded = { forecast: false, radar: false, impact: false, more: false };
function resetTabPanelsLoaded(){
  tabPanelsLoaded = { forecast: false, radar: false, impact: false, more: false };
}
function isMobileTabLayout(){
  return window.matchMedia('(max-width:860px)').matches;
}
function getAppTab(){
  if(document.body.classList.contains('mtab-forecast')) return 'forecast';
  if(document.body.classList.contains('mtab-radar')) return 'radar';
  if(document.body.classList.contains('mtab-impact')) return 'impact';
  if(document.body.classList.contains('mtab-more')) return 'more';
  return 'now';
}
function prefetchImpactPanels(loc, d){
  if(!loc || !d) return;
  renderExposure(d);
  if(isLikelyUS(loc) && !stormState.alertFeatures.length) loadAlerts(loc);
  renderActivityPlanner(d);
  syncMarinePanelVisibility(loc);
  renderAuroraHint(loc, d);
  loadAir(loc);
  loadClimoNormals(loc);
  if(isLikelyUS(loc)) loadStreamGauges(loc);
  if(isGreatLakesLoc(loc)) loadMarine(loc);
  getTideStations().then(() => {
    if(state.locations[state.active] !== loc) return;
    syncCoastalPanelVisibility(loc);
    if(isCoastalLoc(loc)) loadCoastal(loc);
  });
}
function ensureTabPanels(tab){
  const loc = state.locations[state.active];
  const d = state.data;
  if(!loc || !d) return;
  const all = tab === 'all';
  if((all || tab === 'forecast') && !tabPanelsLoaded.forecast){
    tabPanelsLoaded.forecast = true;
    try{ renderDaily(d); }catch(e){ console.error('renderDaily', e); }
    try{ renderForecastText(d); }catch(e){ console.error('renderForecastText', e); }
    loadObs(loc);
    loadClimoNormals(loc);
    loadForecastAfdTeaser(loc);
    loadForecastNbmStrip(loc, d);
  }
  if((all || tab === 'radar') && !tabPanelsLoaded.radar){
    tabPanelsLoaded.radar = true;
    loadStormIntel(loc, d);
    activateRadarPanel();
  }
  if((all || tab === 'impact') && !tabPanelsLoaded.impact){
    tabPanelsLoaded.impact = true;
    if(isGreatLakesLoc(loc)) loadBuoy();
  }
  if((all || tab === 'more') && !tabPanelsLoaded.more){
    tabPanelsLoaded.more = true;
    renderAdvanced(d);
    renderMoon(loc);
    renderLocCompare();
    loadNbm(loc);
    loadTaf(loc);
    loadAFD(loc);
  }
}
function scheduleIdleForecastPrefetch(){
  const run = () => { if(!tabPanelsLoaded.forecast) ensureTabPanels('forecast'); };
  if(typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 2000);
}
function scheduleIdleImpactPrefetch(loc){
  const run = () => {
    if(state.data && state.locations[state.active] === loc) prefetchImpactPanels(loc, state.data);
  };
  if(typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1200 });
  else setTimeout(run, 400);
}
function scheduleIdleStormPrefetch(loc){
  if(!isLikelyUS(loc)) return;
  const run = () => { if(!stormState.loaded && state.data) refreshStormTracking(loc, state.data); };
  if(typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 2200);
}
let tideStationsCache = null;
async function getTideStations(){
  if(tideStationsCache) return tideStationsCache;
  try{
    const r = await fetch('https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions');
    if(!r.ok) return [];
    tideStationsCache = (await r.json()).stations || [];
  }catch(e){ tideStationsCache = []; }
  return tideStationsCache;
}
function nearestTideStation(lat, lon, maxNm){
  const stations = tideStationsCache || [];
  let best = null, bestD = Infinity;
  stations.forEach(s => {
    if(s.lat == null || s.lng == null) return;
    const d = distNm(lat, lon, s.lat, s.lng);
    if(d < bestD){ bestD = d; best = s; }
  });
  return best && bestD <= (maxNm || 40) ? { station: best, dist: bestD } : null;
}
function isCoastalLoc(loc){
  return loc && isLikelyUS(loc) && !!nearestTideStation(loc.lat, loc.lon, 40);
}
function syncCoastalPanelVisibility(loc){
  const panel = $('coastalPanel');
  if(!panel) return;
  const show = loc && isCoastalLoc(loc);
  panel.hidden = !show;
  panel.style.display = show ? '' : 'none';
  if(!show) waterVerdictState.coastal = null;
  renderWaterVerdict();
  syncImpactTabChrome();
}
let coastalLoadGen = 0;
async function loadCoastal(loc){
  const gen = ++coastalLoadGen;
  await getTideStations();
  syncCoastalPanelVisibility(loc);
  if(!isCoastalLoc(loc)) return;
  const near = nearestTideStation(loc.lat, loc.lon, 40);
  if(!near) return;
  const st = near.station;
  return panelTask('coastalPanel', 'coastalStatus', async () => {
    if(gen !== coastalLoadGen) return;
    $('coastalStationLbl').textContent = st.name + ' (' + st.id + ')';
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10).replace(/-/g, '');
    const url = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions'
      + '&application=EchoWeather&begin_date=' + ymd + '&end_date=' + ymd
      + '&datum=MLLW&station=' + encodeURIComponent(st.id) + '&time_zone=lst_ldt&units=english&interval=hilo&format=json';
    const marineP = fetchMarineCurrent(loc.lat, loc.lon).catch(() => null);
    let pointsProps = state.data?.nwsPoints;
    const nwsMarineP = (async () => {
      if(!isLikelyUS(loc)) return null;
      if(!pointsProps){
        try{
          const pr = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
          if(pr.ok) pointsProps = (await pr.json()).properties;
        }catch(e){ /* ignore */ }
      }
      return fetchNwsMarineText(loc, pointsProps).catch(() => null);
    })();
    try{
      const r = await fetch(url);
      if(!r.ok) throw new Error('tides HTTP ' + r.status);
      const j = await r.json();
      const preds = j.predictions || [];
      const nowMs = Date.now();
      const upcoming = preds.filter(p => new Date(p.t).getTime() >= nowMs - 600000).slice(0, 4);
      $('coastalVerdict').textContent = upcoming[0]
        ? (upcoming[0].type === 'H' ? 'Next high' : 'Next low') + ' ' + new Date(upcoming[0].t).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
        : 'Tide data available';
      $('coastalDetail').textContent = Math.round(near.dist) + ' nm to station \u00B7 MLLW datum';
      $('coastalMetrics').innerHTML = upcoming.map(p =>
        '<div class="metric"><div class="k">' + esc(p.type === 'H' ? 'High' : 'Low') + ' ' + new Date(p.t).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) + '</div>'
        + '<div class="v">' + p.v + '<small> ft</small></div></div>'
      ).join('');
      let note = 'NOAA CO-OPS tide predictions';
      const marineBox = $('coastalMarine');
      if(gen !== coastalLoadGen) return;
      let c = await marineP;
      if(c && (c.wave_height == null || c.wave_height === undefined) && st.lat != null && st.lng != null){
        c = await fetchMarineCurrent(st.lat, st.lng).catch(() => c);
      }
      if(c && c.wave_height != null && c.wave_height !== undefined && marineBox){
        const wv = state.units === 'F' ? mToFt(c.wave_height) + '<small> ft</small>' : c.wave_height + '<small> m</small>';
        const sw = state.units === 'F' ? mToFt(c.swell_wave_height ?? 0) + '<small> ft</small>' : (c.swell_wave_height ?? 0) + '<small> m</small>';
        const ww = state.units === 'F' ? mToFt(c.wind_wave_height ?? 0) + '<small> ft</small>' : (c.wind_wave_height ?? 0) + '<small> m</small>';
        marineBox.hidden = false;
        marineBox.innerHTML = [
          ['Wave height', wv],
          ['Wave period', (c.wave_period ?? '\u2014') + '<small> s</small>'],
          ['Wave dir', Math.round(c.wave_direction ?? 0) + '<small>\u00B0 ' + compass(c.wave_direction ?? 0) + '</small>'],
          ['Swell', sw],
          ['Wind waves', ww]
        ].map(row =>
          '<div class="metric"><div class="k">' + row[0] + '</div><div class="v">' + row[1] + '</div></div>'
        ).join('');
        note += ' \u00B7 Open-Meteo marine nearshore';
      }else if(marineBox){
        marineBox.hidden = true;
        marineBox.innerHTML = '';
      }
      const nwsBox = $('coastalNws');
      const nwsMarine = await nwsMarineP;
      if(gen !== coastalLoadGen) return;
      let windObs = { wind: 0, gust: 0 };
      let windAt = loc.name || 'your location';
      if(st.lat != null && st.lng != null){
        windObs = await fetchWindCurrent(st.lat, st.lng);
        windAt = st.name + ' (tide station)';
      }
      if(nwsMarine && nwsBox){
        nwsBox.hidden = false;
        nwsBox.innerHTML = '<strong>' + esc(nwsMarine.source) + '</strong>\n' + esc(nwsMarine.text);
        note += ' \u00B7 ' + nwsMarine.source;
      }else if(nwsBox){
        nwsBox.hidden = true;
        nwsBox.innerHTML = '';
      }
      $('coastalNote').textContent = note;
      stashWaterCoastal({
        waveHeight: c?.wave_height ?? null,
        nwsText: nwsMarine?.text || '',
        nwsSource: nwsMarine?.source || '',
        tideLabel: upcoming[0]
          ? (upcoming[0].type === 'H' ? 'Next high' : 'Next low') + ' ' + new Date(upcoming[0].t).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
          : '',
        tideStation: st.name + ' (' + st.id + ')',
        waveAt: c?.wave_height != null ? 'your location' : (st.lat != null ? 'nearest tide station' : ''),
        wind: windObs.wind,
        gust: windObs.gust,
        windAt
      });
    }catch(e){
      setPanelUnavail($('coastalNote'), 'no_tides');
      const marineBox = $('coastalMarine');
      if(marineBox){ marineBox.hidden = true; marineBox.innerHTML = ''; }
      const nwsBox = $('coastalNws');
      if(nwsBox){ nwsBox.hidden = true; nwsBox.innerHTML = ''; }
      console.warn('tides', e);
    }
  });
}
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
function isGreatLakesLoc(loc){
  if(!loc || !isLikelyUS(loc)) return false;
  const d = lakeProximityNm(loc.lat, loc.lon);
  return d !== null && d <= GLAKE_MAX_NM;
}
function syncMarinePanelVisibility(loc){
  const panel = $('marinePanel');
  if(!panel) return;
  const show = loc && isGreatLakesLoc(loc);
  panel.hidden = !show;
  panel.style.display = show ? '' : 'none';
  if(!show) waterVerdictState.marine = null;
  renderWaterVerdict();
  syncImpactTabChrome();
}
function renderWeatherUi(d){
  renderCurrent(d);
  renderLight(d);
  renderHourly(d);
  $('lastUpdate').textContent = (d.cached ? 'CACHED' : 'FORECAST') + ' '
    + new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})
    + (d.timezone_abbreviation ? ' \u00B7 TZ ' + d.timezone_abbreviation : '');
}
async function loadAll(){
  const loc = state.locations[state.active];
  applyLocRadarPrefs(loc, { reloadRadar: getAppTab() === 'radar' });
  const reloadBuoy = tabPanelsLoaded.impact;
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
    loadForecastNbmStrip(loc, fetched);
    if(isLikelyUS(loc) && state.data){
      refreshStormTracking(loc, state.data);
      refreshFireWeather(loc, state.data);
    }
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

function applySwUpdate(reg, immediate){
  if(immediate){
    sessionStorage.setItem(SW_RELOAD_KEY, '1');
    if(!activateWaitingWorker(reg)) location.reload();
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
    swReg = await navigator.serviceWorker.register('sw.js');
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
