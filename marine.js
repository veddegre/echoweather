// ---------- marine (Great Lakes, coastal, buoy, stream) ----------
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
      box.innerHTML = '';
      nwsBox.textContent = '';
      if(lakeBox) lakeBox.style.display = 'none';
      setPanelUnavail(note, 'no_waves');
      console.error('marine', e);
    }
  });
}

// ---------- USGS streamgages (US, free) + NWS NWPS/AHPS ----------
let streamLoadGen = 0;
const NWPS_FLOOD_LABEL = {
  action: 'Action stage',
  minor: 'Minor flood',
  moderate: 'Moderate flood',
  major: 'Major flood',
  near_flood: 'Near flood',
  low_threshold: 'Low water'
};
const NWPS_FLOOD_SHOW = new Set(Object.keys(NWPS_FLOOD_LABEL));
let nwpsBboxCache = { key: '', t: 0, gauges: [] };
const NWPS_BBOX_TTL = 5 * 60 * 1000;
async function fetchNwpsGaugesBbox(west, south, east, north){
  const key = [west, south, east, north].join(',');
  if(nwpsBboxCache.key === key && Date.now() - nwpsBboxCache.t < NWPS_BBOX_TTL){
    return nwpsBboxCache.gauges;
  }
  try{
    const url = 'https://api.water.noaa.gov/nwps/v1/gauges?bbox.xmin=' + encodeURIComponent(west)
      + '&bbox.ymin=' + encodeURIComponent(south) + '&bbox.xmax=' + encodeURIComponent(east)
      + '&bbox.ymax=' + encodeURIComponent(north) + '&srid=EPSG_4326&limit=50';
    const r = await fetchTimeout(url, {}, 8000);
    if(!r.ok) return [];
    const j = await r.json();
    const gauges = j.gauges || [];
    nwpsBboxCache = { key, t: Date.now(), gauges };
    return gauges;
  }catch(e){ return []; }
}
function matchNwpsGauge(row, nwpsGauges){
  if(row.lat == null || row.lon == null || !nwpsGauges.length) return null;
  let best = null, bestMi = 0.6;
  for(const g of nwpsGauges){
    if(g.latitude == null || g.longitude == null) continue;
    const d = haversineMi(row.lat, row.lon, g.latitude, g.longitude);
    if(d < bestMi){ bestMi = d; best = g; }
  }
  return best;
}
function nwpsFloodHtml(nwps){
  const raw = nwps?.status?.observed?.floodCategory || nwps?.ObservedFloodCategory;
  if(!raw) return '';
  const cat = String(raw).toLowerCase().trim();
  if(!NWPS_FLOOD_SHOW.has(cat)) return '';
  const lbl = NWPS_FLOOD_LABEL[cat];
  const cls = /major|moderate/.test(cat) ? ' stream-flood-warn' : ' stream-flood-adv';
  return '<span class="stream-flood' + cls + '">' + esc(lbl) + '</span>';
}
async function loadStreamGauges(loc){
  const panel = $('streamPanel'), list = $('streamList');
  if(!panel || !list) return;
  if(!isLikelyUS(loc)){ panel.hidden = true; syncImpactTabChrome(); return; }
  const gen = ++streamLoadGen;
  panel.hidden = false;
  list.className = 'stream-list is-loading';
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
      list.className = 'stream-list';
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
        row = { id: site.siteCode?.[0]?.value, name, dist, lat, lon, stage: null, flow: null };
        rows.push(row);
      }
      if(param === '00065') row.stage = val != null ? val + ' ft' : null;
      if(param === '00060') row.flow = val != null ? Math.round(val) + ' cfs' : null;
    });
    rows.sort((a, b) => a.dist - b.dist);
    const top = rows.slice(0, 6);
    const nwpsGauges = await fetchNwpsGaugesBbox(west, south, east, north);
    if(gen !== streamLoadGen) return;
    list.className = 'stream-list';
    if(!top.length){
      setPanelUnavail(list, 'no_gauges');
      return;
    }
    list.innerHTML = top.map(g => {
      const meta = matchNwpsGauge(g, nwpsGauges);
      const usgsUrl = 'https://waterdata.usgs.gov/monitoring-location/' + encodeURIComponent(g.id) + '/';
      const ahpsUrl = meta?.lid ? 'https://water.noaa.gov/gauges/' + encodeURIComponent(meta.lid) : '';
      const links = '<div class="stream-links">'
        + (ahpsUrl ? '<a href="' + ahpsUrl + '" target="_blank" rel="noopener">AHPS hydrograph</a>' : '')
        + '<a href="' + usgsUrl + '" target="_blank" rel="noopener">USGS data</a></div>';
      return '<div class="stream-gauge"><div class="stream-gauge-head"><span class="k">' + esc(g.name)
        + '<small> \u00B7 ' + Math.round(g.dist) + ' mi</small></span>' + nwpsFloodHtml(meta) + '</div><div class="v">'
        + esc([g.stage, g.flow].filter(Boolean).join(' \u00B7 ') || 'No recent reading') + '</div>' + links + '</div>';
    }).join('');
  }catch(e){
    if(gen !== streamLoadGen) return;
    list.className = 'stream-list';
    setPanelUnavail(list, 'api_error');
  }
  if(gen === streamLoadGen) syncImpactTabChrome();
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
      const metrics = $('coastalMetrics');
      if(metrics) metrics.innerHTML = panelUnavail('no_tides');
      const verdict = $('coastalVerdict'), detail = $('coastalDetail');
      if(verdict) verdict.textContent = 'Unavailable';
      if(detail) detail.textContent = '';
      const marineBox = $('coastalMarine');
      if(marineBox){ marineBox.hidden = true; marineBox.innerHTML = ''; }
      const nwsBox = $('coastalNws');
      if(nwsBox){ nwsBox.hidden = true; nwsBox.innerHTML = ''; }
      console.warn('tides', e);
    }
  });
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

function initMarineControls(){
  $('buoyRefresh')?.addEventListener('click', () => loadBuoy());
  $('buoyGo')?.addEventListener('click', () => userSelectBuoy($('buoyId').value));
  $('buoyNearest')?.addEventListener('click', resetBuoyToNearest);
  $('buoyId')?.addEventListener('keydown', e => { if(e.key === 'Enter') userSelectBuoy($('buoyId').value); });
  $('buoySelect')?.addEventListener('change', () => {
    if(buoySelectSyncing) return;
    const v = $('buoySelect').value;
    if(v === '_custom'){
      $('buoyId').style.display = '';
      $('buoyId').focus();
      return;
    }
    userSelectBuoy(v);
  });
}
