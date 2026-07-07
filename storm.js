// ---------- NWS alerts: warnings / watches / advisories (US only) ----------
const stormState = {
  risks: [], prob: null, mcds: [], discussions: {}, reports: [],
  alertFeatures: [], severeWindow: null, lakeEffect: null,
  maxDn: 0, stormMode: false, loaded: false
};
let alertLayerGroup = null;
let threatOverlayGroups = {};
let stormReportGroup = null;
let nhcMarkerGroup = null;
let threatGeoCache = {};
let threatOverlayGen = 0;
const THREAT_GEO_TTL = 5 * 60 * 1000;
const WPC_ERO_URL = 'https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0/query?where=1%3D1&outFields=outlook,valid_time&returnGeometry=true&f=geojson';
const HMS_SMOKE_URL = 'https://mapservices.weather.noaa.gov/vector/rest/services/hazards/smoke/MapServer/0/query?where=1%3D1&outFields=Density,Label&returnGeometry=true&f=geojson&outSR=4326';
const THREAT_LAYER_URLS = {
  spcCat: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson',
  spcTorn: 'https://www.spc.noaa.gov/products/outlook/day1otlk_torn.lyr.geojson',
  spcHail: 'https://www.spc.noaa.gov/products/outlook/day1otlk_hail.lyr.geojson',
  spcWind: 'https://www.spc.noaa.gov/products/outlook/day1otlk_wind.lyr.geojson',
  fireWx: 'https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson'
};
function defaultThreatLayers(){
  return {
    stormReports: true, wpcEro: false, fireWx: false, hmsSmoke: false,
    warnings: true, watches: true, advisories: false,
    spcCat: false, spcTorn: false, spcHail: false, spcWind: false, nhc: false
  };
}
const threatLayerOpts = defaultThreatLayers();
const fireState = { active: false };
function anyThreatOverlayOn(){
  return threatLayerOpts.spcCat || threatLayerOpts.spcTorn || threatLayerOpts.spcHail
    || threatLayerOpts.spcWind || threatLayerOpts.nhc || threatLayerOpts.wpcEro
    || threatLayerOpts.fireWx || threatLayerOpts.hmsSmoke;
}
function reportMatchesFilter(type){
  const t = String(type || '').toLowerCase();
  if(stormReportFilter === 'all') return true;
  if(stormReportFilter === 'tornado') return t.includes('torn');
  if(stormReportFilter === 'hail') return t.includes('hail');
  if(stormReportFilter === 'wind') return t.includes('wind');
  return true;
}
function filteredStormReports(){
  return (stormState.reports || []).filter(r => reportMatchesFilter(r.type));
}
function getLocRadarPrefs(loc){
  const fallbackMode = store.get('st_radar_mode') || defaultRadarMode(loc);
  const fallbackThreat = store.get('st_threat_layers');
  const threatLayers = defaultThreatLayers();
  if(fallbackThreat && typeof fallbackThreat === 'object'){
    Object.keys(threatLayers).forEach(k => {
      if(fallbackThreat[k] !== undefined) threatLayers[k] = !!fallbackThreat[k];
    });
  }
  const saved = loc?.radarPrefs;
  if(!saved) return { mode: fallbackMode, threatLayers, dualPane: false, mrmsStride: 5 };
  const mode = saved.mode || fallbackMode;
  if(saved.threatLayers && typeof saved.threatLayers === 'object'){
    Object.keys(threatLayers).forEach(k => {
      if(saved.threatLayers[k] !== undefined) threatLayers[k] = !!saved.threatLayers[k];
    });
  }
  return { mode, threatLayers, dualPane: !!saved.dualPane, mrmsStride: saved.mrmsStride || 5 };
}
function saveLocRadarPrefs(){
  const loc = state.locations[state.active];
  if(!loc) return;
  const prefs = { mode: radarMode, threatLayers: { ...threatLayerOpts }, dualPane: !!radarDualOn };
  if(typeof mrmsStrideMin === 'function') prefs.mrmsStride = mrmsStrideMin();
  loc.radarPrefs = prefs;
  persist();
  store.set('st_radar_mode', radarMode);
  store.set('st_threat_layers', { ...threatLayerOpts });
}
function applyLocRadarPrefs(loc, opts){
  opts = opts || {};
  if(!loc) return;
  const p = getLocRadarPrefs(loc);
  const modeChanged = radarMode !== p.mode;
  Object.keys(threatLayerOpts).forEach(k => { threatLayerOpts[k] = !!p.threatLayers[k]; });
  document.querySelectorAll('[data-threat]').forEach(inp => {
    const k = inp.getAttribute('data-threat');
    if(k in threatLayerOpts) inp.checked = threatLayerOpts[k];
  });
  radarMode = p.mode;
  if(typeof radarDualOn !== 'undefined') radarDualOn = !!p.dualPane;
  const sel = $('radarMode');
  if(sel) sel.value = radarMode;
  syncRadarVelToggle();
  updateRadarLegend();
  if(modeChanged || opts.forceReload){
    radarLoadId++;
    iemLoadGen++;
    stopRadarTimer();
    applyRadarZoomLimits();
    if(map && opts.reloadRadar !== false) loadRadar();
  }
  syncThreatOverlays();
  syncStormReportMarkers();
  if(stormState.alertFeatures) syncAlertPolygons(stormState.alertFeatures);
  if(typeof syncRadarDualUi === 'function') syncRadarDualUi();
}
function loadThreatLayerPrefs(){
  applyLocRadarPrefs(state.locations[state.active], { reloadRadar: false });
}
function saveThreatLayerPrefs(){
  saveLocRadarPrefs();
}
function threatLayersHashParam(){
  const def = defaultThreatLayers();
  const differs = Object.keys(threatLayerOpts).some(k => !!threatLayerOpts[k] !== !!def[k]);
  if(!differs) return '';
  return Object.keys(threatLayerOpts).filter(k => threatLayerOpts[k]).join(',');
}
function applyThreatLayersFromHash(param){
  if(param == null || param === '') return false;
  const set = new Set(param.split(',').map(s => s.trim()).filter(Boolean));
  let changed = false;
  Object.keys(threatLayerOpts).forEach(k => {
    const next = set.has(k);
    if(threatLayerOpts[k] !== next){
      threatLayerOpts[k] = next;
      changed = true;
    }
  });
  if(!changed) return false;
  document.querySelectorAll('[data-threat]').forEach(inp => {
    const k = inp.getAttribute('data-threat');
    if(k in threatLayerOpts) inp.checked = threatLayerOpts[k];
  });
  syncThreatOverlays();
  syncStormReportMarkers();
  if(stormState.alertFeatures) syncAlertPolygons(stormState.alertFeatures);
  return true;
}
function enableHmsSmokeLayer(){
  if(threatLayerOpts.hmsSmoke) return false;
  threatLayerOpts.hmsSmoke = true;
  const inp = document.querySelector('[data-threat="hmsSmoke"]');
  if(inp) inp.checked = true;
  saveLocRadarPrefs();
  syncThreatOverlays();
  return true;
}
function filterAlertFeatures(feats){
  return (feats || []).filter(f => {
    if(!f.geometry) return false;
    const ev = f.properties?.event || '';
    const isWarn = /warning/i.test(ev);
    const isWatch = /watch/i.test(ev);
    if(isWarn && !threatLayerOpts.warnings) return false;
    if(isWatch && !threatLayerOpts.watches) return false;
    if(!isWarn && !isWatch && !threatLayerOpts.advisories) return false;
    return true;
  });
}
async function fetchThreatGeo(key, url){
  const hit = threatGeoCache[key];
  if(hit && Date.now() - hit.t < THREAT_GEO_TTL) return hit.g;
  try{
    const r = await fetch(url);
    if(!r.ok) return null;
    const g = await r.json();
    threatGeoCache[key] = { g, t: Date.now() };
    return g;
  }catch(e){ return null; }
}
function removeThreatOverlays(){
  if(!map) return;
  Object.keys(threatOverlayGroups).forEach(k => {
    const grp = threatOverlayGroups[k];
    if(grp && map.hasLayer(grp)) map.removeLayer(grp);
    threatOverlayGroups[k] = null;
  });
  if(nhcMarkerGroup && map.hasLayer(nhcMarkerGroup)){
    map.removeLayer(nhcMarkerGroup);
    nhcMarkerGroup = null;
  }
}
function clearThreatOverlays(){
  threatOverlayGen++;
  removeThreatOverlays();
}
function spcThreatStyle(f){
  const fill = cssColor(f.properties?.fill) || '#e8e8e8';
  const stroke = cssColor(f.properties?.stroke) || fill;
  const dn = f.properties?.DN || 0;
  return {
    color: stroke, weight: dn >= 4 ? 2 : 1.5,
    fillColor: fill, fillOpacity: dn >= 3 ? 0.18 : 0.1, opacity: 0.9
  };
}
function wpcEroStyle(f){
  const o = String(f.properties?.outlook || '').toUpperCase();
  const colors = { MRGL: '#00c800', SLGT: '#ffff00', MDRT: '#ff7f00', HIGH: '#ff0000' };
  const fill = colors[o] || '#88cc88';
  return { color: fill, fillColor: fill, fillOpacity: 0.22, weight: 1.5, opacity: 0.9 };
}
function stormReportIcon(type){
  const t = String(type || '').toLowerCase();
  let color = '#8e44ad';
  if(/torn/i.test(t)) color = '#c0392b';
  else if(/hail/i.test(t)) color = '#27ae60';
  else if(/wind/i.test(t)) color = '#2980b9';
  return L.divIcon({
    className: 'storm-report-pin',
    html: '<span style="background:' + color + '"></span>',
    iconSize: [12, 12], iconAnchor: [6, 6]
  });
}
function syncStormReportMarkers(){
  if(!map || !isRadarTabVisible() || !threatLayerOpts.stormReports){
    if(stormReportGroup && map.hasLayer(stormReportGroup)) map.removeLayer(stormReportGroup);
    stormReportGroup = null;
    return;
  }
  if(stormReportGroup && map.hasLayer(stormReportGroup)) map.removeLayer(stormReportGroup);
  stormReportGroup = L.layerGroup();
  (stormState.reports || []).forEach(r => {
    if(r.lat == null || r.lon == null || !reportMatchesFilter(r.type)) return;
    const m = L.marker([r.lat, r.lon], { icon: stormReportIcon(r.type) });
    m.bindPopup('<strong>' + esc(r.type) + '</strong><br>' + esc(r.place)
      + (r.county ? ', ' + esc(r.county) : '') + (r.st ? ' ' + esc(r.st) : '')
      + '<br><span style="font-size:.75rem;color:#666">' + esc(r.time || '')
      + (r.remarks ? '<br>' + esc(r.remarks.slice(0, 160)) : '') + '</span>'
      + '<p style="margin:8px 0 0"><button type="button" class="storm-rpt-jump-btn">View on radar &rarr;</button></p>');
    m.on('popupopen', () => {
      const el = m.getPopup()?.getElement();
      const btn = el && el.querySelector('.storm-rpt-jump-btn');
      if(btn) btn.onclick = () => { m.closePopup(); jumpRadarToStormReport(r); };
    });
    stormReportGroup.addLayer(m);
  });
  if(stormReportGroup.getLayers().length) stormReportGroup.addTo(map);
  bringStormMapLayersFront();
}
async function syncThreatOverlays(){
  if(!map || !isRadarTabVisible() || !anyThreatOverlayOn()){
    clearThreatOverlays();
    return;
  }
  const gen = ++threatOverlayGen;
  removeThreatOverlays();
  const jobs = [];
  ['spcCat', 'spcTorn', 'spcHail', 'spcWind'].forEach(key => {
    if(!threatLayerOpts[key]) return;
    jobs.push((async () => {
      try{
        const geo = await fetchThreatGeo(key, THREAT_LAYER_URLS[key]);
        if(!geo || !map || gen !== threatOverlayGen) return;
        if(!geo.features || !geo.features.length) return;
        const grp = L.layerGroup();
        L.geoJSON(geo, {
          style: spcThreatStyle,
          onEachFeature(f, layer){
            const p = f.properties || {};
            layer.bindPopup('<strong>SPC ' + esc(p.LABEL2 || p.LABEL || key) + '</strong>');
          }
        }).eachLayer(l => grp.addLayer(l));
        if(gen !== threatOverlayGen) return;
        threatOverlayGroups[key] = grp;
        grp.addTo(map);
      }catch(e){ console.warn('threat layer', key, e); }
    })());
  });
  if(threatLayerOpts.nhc){
    jobs.push((async () => {
      try{
        const r = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json');
        if(!r.ok || !map || gen !== threatOverlayGen) return;
        const storms = (await r.json()).activeStorms || [];
        if(!storms.length || gen !== threatOverlayGen) return;
        nhcMarkerGroup = L.layerGroup();
        storms.forEach(s => {
          if(s.latitude == null || s.longitude == null) return;
          const m = L.circleMarker([s.latitude, s.longitude], {
            radius: 8, color: '#9b59b6', fillColor: '#9b59b6', fillOpacity: 0.75, weight: 2
          });
          m.bindPopup('<strong>' + esc(s.name || 'Tropical system') + '</strong><br>' + esc(s.intensity || s.classification || ''));
          nhcMarkerGroup.addLayer(m);
        });
        nhcMarkerGroup.addTo(map);
      }catch(e){ console.warn('NHC layer', e); }
    })());
  }
  if(threatLayerOpts.wpcEro){
    jobs.push((async () => {
      try{
        const geo = await fetchThreatGeo('wpcEro', WPC_ERO_URL);
        if(!geo || !map || gen !== threatOverlayGen || !geo.features?.length) return;
        const grp = L.layerGroup();
        L.geoJSON(geo, {
          style: wpcEroStyle,
          onEachFeature(f, layer){
            const p = f.properties || {};
            layer.bindPopup('<strong>WPC excessive rainfall</strong><br>' + esc(p.outlook || 'Day 1')
              + (p.valid_time ? '<br>' + esc(p.valid_time) : ''));
          }
        }).eachLayer(l => grp.addLayer(l));
        if(gen !== threatOverlayGen) return;
        threatOverlayGroups.wpcEro = grp;
        grp.addTo(map);
      }catch(e){ console.warn('WPC ERO layer', e); }
    })());
  }
  if(threatLayerOpts.fireWx){
    jobs.push((async () => {
      try{
        const geo = await fetchThreatGeo('fireWx', THREAT_LAYER_URLS.fireWx);
        if(!geo || !map || gen !== threatOverlayGen || !geo.features?.length) return;
        const grp = L.layerGroup();
        L.geoJSON(geo, {
          style: spcThreatStyle,
          onEachFeature(f, layer){
            const p = f.properties || {};
            layer.bindPopup('<strong>SPC fire weather</strong><br>' + esc(p.LABEL2 || p.LABEL || ''));
          }
        }).eachLayer(l => grp.addLayer(l));
        if(gen !== threatOverlayGen) return;
        threatOverlayGroups.fireWx = grp;
        grp.addTo(map);
      }catch(e){ console.warn('fire wx layer', e); }
    })());
  }
  if(threatLayerOpts.hmsSmoke){
    jobs.push((async () => {
      try{
        const geo = await fetchThreatGeo('hmsSmoke', HMS_SMOKE_URL);
        if(!geo || !map || gen !== threatOverlayGen || !geo.features?.length) return;
        const grp = L.layerGroup();
        L.geoJSON(geo, {
          style: () => ({ color: '#8b7355', weight: 1, fillColor: '#a08060', fillOpacity: 0.28 }),
          onEachFeature(f, layer){
            const p = f.properties || {};
            layer.bindPopup('<strong>NOAA HMS smoke</strong><br>' + esc(p.Label || p.Density || 'Smoke'));
          }
        }).eachLayer(l => grp.addLayer(l));
        if(gen !== threatOverlayGen) return;
        threatOverlayGroups.hmsSmoke = grp;
        grp.addTo(map);
      }catch(e){ console.warn('HMS smoke layer', e); }
    })());
  }
  await Promise.all(jobs);
  if(gen === threatOverlayGen) bringStormMapLayersFront();
}
let lightningCanvas = null, lightningCtx = null, lightningStrikes = [];
let lightningWs = null, lightningWsIdx = 0, lightningRcTimer = null, lightningRaf = 0;
let lightningWsState = 'off', lightningRecentHits = [];
let radarLightningOn = false;
const LIGHTNING_WS = ['wss://ws1.blitzortung.org/', 'wss://ws7.blitzortung.org/', 'wss://ws8.blitzortung.org/'];
const LIGHTNING_LIFE_MS = 3500;
let stormTrackGen = 0;

function haversineMi(lat1, lon1, lat2, lon2){
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function bearingDeg(lat1, lon1, lat2, lon2){
  const r = Math.PI / 180;
  const φ1 = lat1 * r, φ2 = lat2 * r, Δλ = (lon2 - lon1) * r;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / r + 360) % 360;
}
async function fetchAllActiveAlerts(loc){
  const r = await nwsFetch('https://api.weather.gov/alerts/active?point=' + loc.lat + ',' + loc.lon);
  if(!r.ok) return [];
  return (await r.json()).features || [];
}
async function fetchActiveAlertFeatures(loc){
  const feats = await fetchAllActiveAlerts(loc);
  return feats.filter(f => f.geometry);
}
function renderAlertsBox(feats){
  const box = $('alerts');
  if(!box) return;
  box.style.display = 'none';
  box.innerHTML = '';
  if(!feats.length) return;
  const rank = ev => /warning/i.test(ev) ? 0 : /watch/i.test(ev) ? 1 : 2;
  const sorted = feats.slice().sort((a, b) => {
    const ra = rank(a.properties.event), rb = rank(b.properties.event);
    if(ra !== rb) return ra - rb;
    const ea = alertEndMs(a.properties), eb = alertEndMs(b.properties);
    if(!isNaN(ea) && !isNaN(eb)) return ea - eb;
    return 0;
  }).slice(0, 6);
  box.innerHTML = sorted.map(f => {
    const p = f.properties;
    const ev = p.event || 'Alert';
    const cls = /warning/i.test(ev) ? '' : /watch/i.test(ev) ? ' watch' : ' adv';
    const until = formatAlertSummaryTiming(p);
    const desc = ((p.description || '') + (p.instruction ? '\n\nPRECAUTIONARY ACTIONS:\n' + p.instruction : ''))
      .replace(/&/g,'&amp;').replace(/</g,'&lt;');
    return '<details class="alert' + cls + '"><summary>'
      + '<div class="ev">\u26A0 ' + esc(ev) + until + '</div>'
      + '<div class="hl">' + esc(p.headline || '') + '</div>'
      + '</summary><div class="desc">' + desc + '</div></details>';
  }).join('');
  box.style.display = 'flex';
}
async function loadAlerts(loc){
  return panelTask('alerts', null, async () => {
    try{
      const feats = await fetchAllActiveAlerts(loc);
      stormState.alertFeatures = feats;
      renderAlertsBox(feats);
      syncAlertPolygons(feats.filter(f => f.geometry));
      if(isRadarTabVisible()) showStormPanelPending(loc);
      if(state.data) renderActivityPlanner(state.data);
      return feats.length;
    }catch(e){
      stormState.alertFeatures = [];
      renderAlertsBox([]);
      syncAlertPolygons([]);
      if(state.data) renderActivityPlanner(state.data);
      return 0;
    }
  });
}
function syncAlertPolygons(features){
  if(!map) return;
  if(alertLayerGroup){
    map.removeLayer(alertLayerGroup);
    alertLayerGroup = null;
  }
  const filtered = filterAlertFeatures(features);
  if(!filtered.length){
    if(isRadarTabVisible()) syncThreatOverlays();
    else clearThreatOverlays();
    return;
  }
  alertLayerGroup = L.layerGroup();
  L.geoJSON({ type: 'FeatureCollection', features: filtered }, {
    style(f){
      const ev = f.properties.event || '';
      const isWarn = /warning/i.test(ev);
      const isWatch = /watch/i.test(ev);
      return {
        color: isWarn ? '#c0392b' : isWatch ? '#d4ac0d' : '#3c91e6',
        weight: 2,
        fillOpacity: isWarn ? 0.2 : isWatch ? 0.14 : 0.08,
        fillColor: isWarn ? '#e74c3c' : isWatch ? '#f1c40f' : '#3498db'
      };
    },
    onEachFeature(f, layer){
      const p = f.properties;
      layer.bindPopup('<strong>' + esc(p.event || 'Alert') + '</strong><br>' + esc(p.headline || ''));
    }
  }).eachLayer(l => alertLayerGroup.addLayer(l));
  alertLayerGroup.addTo(map);
  if(isRadarTabVisible()) syncThreatOverlays();
  bringStormMapLayersFront();
}
function bringStormMapLayersFront(){
  if(!map) return;
  Object.values(threatOverlayGroups).forEach(grp => {
    if(grp) grp.eachLayer(l => l.bringToFront && l.bringToFront());
  });
  if(alertLayerGroup) alertLayerGroup.eachLayer(l => l.bringToFront && l.bringToFront());
  if(stormReportGroup) stormReportGroup.eachLayer(l => l.bringToFront && l.bringToFront());
  if(mapMarker) mapMarker.bringToFront();
}
function decodeBlitzortung(raw){
  const d = ('' + raw).split('');
  let c = d[0], f = c, g = [c], o = 256;
  const e = {};
  for(let i = 1; i < d.length; i++){
    let a = d[i].charCodeAt(0);
    a = a < 256 ? d[i] : (e[a] || f + c);
    g.push(a);
    c = a.charAt(0);
    e[o] = f + c;
    o++;
    f = a;
  }
  return g.join('');
}
function updateLightningStatus(){
  const el = $('lightningStatus');
  if(!el) return;
  if(!radarLightningOn){
    el.hidden = true;
    el.textContent = '';
    el.className = 'radar-note lightning-status';
    return;
  }
  el.hidden = false;
  const cut = Date.now() - 60000;
  lightningRecentHits = lightningRecentHits.filter(t => t >= cut);
  const n = lightningRecentHits.length;
  if(lightningWsState === 'connecting'){
    el.textContent = 'Lightning · connecting…';
    el.className = 'radar-note lightning-status wait';
  }else if(lightningWsState === 'reconnecting'){
    el.textContent = 'Lightning · reconnecting…';
    el.className = 'radar-note lightning-status err';
  }else if(lightningWsState === 'live'){
    el.textContent = n
      ? 'Lightning live · ' + n + ' strike' + (n === 1 ? '' : 's') + ' in map (last min)'
      : 'Lightning live · no strikes in map area';
    el.className = 'radar-note lightning-status';
  }else{
    el.textContent = 'Lightning · starting…';
    el.className = 'radar-note lightning-status wait';
  }
}
function blitzortungPayload(raw){
  if(typeof raw === 'string') return raw;
  if(raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);
  return '' + raw;
}
function lightningShouldRun(){
  return radarLightningOn && map && isRadarTabVisible();
}
function sizeLightningCanvas(){
  if(!lightningCanvas || !map) return;
  const sz = map.getSize();
  const dpr = window.devicePixelRatio || 1;
  lightningCanvas.width = sz.x * dpr;
  lightningCanvas.height = sz.y * dpr;
  lightningCanvas.style.width = sz.x + 'px';
  lightningCanvas.style.height = sz.y + 'px';
  if(lightningCtx) lightningCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function ensureLightningCanvas(){
  if(!map) return;
  if(!lightningCanvas){
    lightningCanvas = document.createElement('canvas');
    lightningCanvas.className = 'lightning-canvas';
    lightningCanvas.setAttribute('aria-hidden', 'true');
    map.getContainer().appendChild(lightningCanvas);
    lightningCtx = lightningCanvas.getContext('2d');
    map.on('move zoom resize', sizeLightningCanvas);
  }
  sizeLightningCanvas();
}
function removeLightningCanvas(){
  if(lightningCanvas && lightningCanvas.parentNode) lightningCanvas.parentNode.removeChild(lightningCanvas);
  lightningCanvas = null;
  lightningCtx = null;
}
function disconnectLightningWs(){
  clearTimeout(lightningRcTimer);
  lightningRcTimer = null;
  if(lightningWs){
    try{
      lightningWs.onopen = lightningWs.onmessage = lightningWs.onerror = lightningWs.onclose = null;
      lightningWs.close();
    }catch(e){}
    lightningWs = null;
  }
}
function scheduleLightningReconnect(){
  clearTimeout(lightningRcTimer);
  lightningWsIdx++;
  lightningRcTimer = setTimeout(connectLightningWs, 2500);
}
function connectLightningWs(){
  if(!lightningShouldRun()) return;
  disconnectLightningWs();
  lightningWsState = 'connecting';
  updateLightningStatus();
  const url = LIGHTNING_WS[lightningWsIdx % LIGHTNING_WS.length];
  let ws;
  try{ ws = new WebSocket(url); }catch(e){ lightningWsState = 'reconnecting'; updateLightningStatus(); scheduleLightningReconnect(); return; }
  lightningWs = ws;
  ws.onopen = () => {
    if(lightningWs === ws){
      lightningWsState = 'live';
      updateLightningStatus();
      ws.send(JSON.stringify({ a: 111 }));
    }
  };
  ws.onmessage = (ev) => {
    try{
      const s = JSON.parse(decodeBlitzortung(blitzortungPayload(ev.data)));
      if(s && typeof s.lat === 'number' && typeof s.lon === 'number') addLightningStrike(s.lat, s.lon);
    }catch(e){}
  };
  ws.onerror = () => { try{ ws.close(); }catch(e){} };
  ws.onclose = () => {
    if(lightningWs === ws){
      lightningWs = null;
      if(lightningShouldRun()){
        lightningWsState = 'reconnecting';
        updateLightningStatus();
        scheduleLightningReconnect();
      }
    }
  };
}
function addLightningStrike(lat, lon){
  if(!map) return;
  const bounds = map.getBounds().pad(0.5);
  if(!bounds.contains([lat, lon])) return;
  lightningStrikes.push({ lat, lon, t: performance.now() });
  lightningRecentHits.push(Date.now());
  updateLightningStatus();
  if(lightningStrikes.length > 3000) lightningStrikes.splice(0, lightningStrikes.length - 2000);
}
function drawLightningFrame(){
  lightningRaf = 0;
  if(!lightningCtx || !map || !radarLightningOn) return;
  const ctx = lightningCtx, sz = map.getSize(), now = performance.now();
  ctx.clearRect(0, 0, sz.x, sz.y);
  for(let i = 0; i < lightningStrikes.length; i++){
    const s = lightningStrikes[i];
    const age = now - s.t;
    if(age > LIGHTNING_LIFE_MS) continue;
    const pt = map.latLngToContainerPoint([s.lat, s.lon]);
    if(pt.x < -40 || pt.y < -40 || pt.x > sz.x + 40 || pt.y > sz.y + 40) continue;
    const p = age / LIGHTNING_LIFE_MS, fade = 1 - p;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2 + p * 18, 0, 7);
    ctx.strokeStyle = 'rgba(120,210,255,' + (fade * 0.55) + ')';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.2 * (1 - p * 0.45), 0, 7);
    ctx.fillStyle = 'rgba(255,245,210,' + Math.min(1, fade * 1.5) + ')';
    ctx.fill();
  }
  lightningStrikes = lightningStrikes.filter(s => now - s.t <= LIGHTNING_LIFE_MS);
  if(lightningShouldRun()){
    updateLightningStatus();
    lightningRaf = requestAnimationFrame(drawLightningFrame);
  }
}
function startLightningLoop(){
  if(lightningRaf) return;
  lightningRaf = requestAnimationFrame(drawLightningFrame);
}
function stopLightningLoop(){
  if(lightningRaf){ cancelAnimationFrame(lightningRaf); lightningRaf = 0; }
  if(lightningCtx && map){
    const sz = map.getSize();
    lightningCtx.clearRect(0, 0, sz.x, sz.y);
  }
  lightningStrikes = [];
  lightningRecentHits = [];
  lightningWsState = 'off';
  updateLightningStatus();
}
function syncLightningOverlay(){
  const btn = $('radarLightning');
  if(btn) btn.classList.toggle('on', radarLightningOn);
  if(!radarLightningOn || !lightningShouldRun()){
    stopLightningLoop();
    disconnectLightningWs();
    if(!radarLightningOn) removeLightningCanvas();
    return;
  }
  if(!map){
    if(btn) btn.classList.remove('on');
    radarLightningOn = false;
    return;
  }
  ensureLightningCanvas();
  connectLightningWs();
  startLightningLoop();
  updateLightningStatus();
}
function setLightningOverlay(on){
  radarLightningOn = !!on;
  const btn = $('radarLightning');
  if(btn) btn.classList.toggle('on', radarLightningOn);
  if(!map) return;
  syncLightningOverlay();
}

// ---------- active weather (SPC outlook + MCD at your location) ----------
const SPC_STORM_LINKS = {
  outlook: 'https://www.spc.noaa.gov/products/outlook/',
  mesoanalysis: 'https://www.spc.noaa.gov/exper/mesoanalysis/',
  surfaceMaps: 'https://www.spc.noaa.gov/exper/surfaceMaps/',
  soundings: 'https://www.spc.noaa.gov/exper/soundings/'
};
function pointInRing(lon, lat, ring){
  let inside = false;
  for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if(((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function pointInGeo(lon, lat, geom){
  if(!geom) return false;
  if(geom.type === 'Polygon'){
    if(!pointInRing(lon, lat, geom.coordinates[0])) return false;
    for(let h = 1; h < geom.coordinates.length; h++){
      if(pointInRing(lon, lat, geom.coordinates[h])) return false;
    }
    return true;
  }
  if(geom.type === 'MultiPolygon'){
    return geom.coordinates.some(poly => pointInGeo(lon, lat, { type:'Polygon', coordinates: poly }));
  }
  return false;
}
function spcRiskAtPoint(lon, lat, geojson){
  let best = null;
  for(const f of (geojson.features || [])){
    if(!pointInGeo(lon, lat, f.geometry)) continue;
    const dn = f.properties.DN || 0;
    if(!best || dn > best.dn) best = {
      dn, label: f.properties.LABEL || '', label2: f.properties.LABEL2 || '',
      fill: f.properties.fill || '', stroke: f.properties.stroke || '',
      valid: f.properties.VALID_ISO || '', expire: f.properties.EXPIRE_ISO || ''
    };
  }
  return best;
}
async function fetchSpcOutlookDay(loc, dayKey){
  const r = await fetch('https://www.spc.noaa.gov/products/outlook/' + dayKey + 'otlk_cat.lyr.geojson');
  if(!r.ok) return null;
  const geo = await r.json();
  const risk = spcRiskAtPoint(loc.lon, loc.lat, geo);
  return risk ? { day: dayKey, ...risk } : { day: dayKey, dn: 0, label: 'NONE', label2: 'No thunderstorm risk', fill: '#E8E8E8', stroke: '#999' };
}
function renderStormReportFilters(){
  const types = ['all', 'tornado', 'hail', 'wind'];
  const labels = { all: 'All', tornado: 'Tornado', hail: 'Hail', wind: 'Wind' };
  return '<div class="storm-report-filters" role="group" aria-label="Filter storm reports">'
    + types.map(t =>
      '<button type="button" class="storm-rpt-filter' + (stormReportFilter === t ? ' on' : '') + '" data-rpt-filter="' + t + '">'
      + labels[t] + '</button>'
    ).join('') + '</div>';
}
function bindStormReportFilters(box){
  if(!box) return;
  box.querySelectorAll('.storm-rpt-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      stormReportFilter = btn.getAttribute('data-rpt-filter') || 'all';
      store.set('st_report_filter', stormReportFilter);
      syncStormReportMarkers();
      const loc = state.locations[state.active];
      if(loc && state.data) updateStormUi(loc, state.data);
    });
  });
}
function decodeSpcCoord(s){
  if(s.length !== 8) return null;
  const lat = parseInt(s.slice(0, 4), 10) / 100;
  const lon = -(100 + parseInt(s.slice(4, 8), 10) / 100);
  return [lon, lat];
}
function pointInMcd(lon, lat, text){
  const ring = mcdRingFromText(text);
  return ring.length >= 3 && pointInRing(lon, lat, ring);
}
function mcdRingFromText(text){
  const m = text.match(/LAT\.\.\.LON\s+([\d\s]+)/);
  if(!m) return [];
  return m[1].trim().split(/\s+/).filter(x => x.length === 8).map(decodeSpcCoord).filter(Boolean);
}
function minDistToRingMi(lon, lat, ring){
  if(!ring.length) return Infinity;
  let min = Infinity;
  ring.forEach(([rlon, rlat]) => { min = Math.min(min, haversineMi(lat, lon, rlat, rlon)); });
  const clat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const clon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  return Math.min(min, haversineMi(lat, lon, clat, clon));
}
function geoRingCentroid(ring){
  if(!ring || !ring.length) return null;
  let slat = 0, slon = 0, n = 0;
  ring.forEach(([lon, lat]) => {
    if(lat == null || lon == null) return;
    slat += lat;
    slon += lon;
    n++;
  });
  return n ? { lat: slat / n, lon: slon / n } : null;
}
function geoFeatureCentroid(geom){
  if(!geom) return null;
  if(geom.type === 'Point') return { lat: geom.coordinates[1], lon: geom.coordinates[0] };
  if(geom.type === 'Polygon') return geoRingCentroid(geom.coordinates[0]);
  if(geom.type === 'MultiPolygon'){
    let best = null, bestN = 0;
    geom.coordinates.forEach(poly => {
      const c = geoRingCentroid(poly[0]);
      const n = poly[0]?.length || 0;
      if(c && n > bestN){ best = c; bestN = n; }
    });
    return best;
  }
  return null;
}
function nearestAlertPolygon(matchEvent){
  const loc = state.locations[state.active];
  if(!loc) return null;
  const feats = (stormState.alertFeatures || []).filter(f =>
    matchEvent(f.properties?.event || '') && f.geometry);
  if(!feats.length) return null;
  let best = null, bestDist = Infinity;
  feats.forEach(f => {
    const c = geoFeatureCentroid(f.geometry);
    if(!c) return;
    const d = haversineMi(loc.lat, loc.lon, c.lat, c.lon);
    if(d < bestDist){ bestDist = d; best = { feature: f, lat: c.lat, lon: c.lon, dist: d }; }
  });
  return best;
}
function isNwsWarningEvent(ev){
  return /warning/i.test(ev) && !/watch/i.test(ev);
}
function isNwsWatchEvent(ev){
  return /watch/i.test(ev);
}
function nearestWarningPolygon(){
  return nearestAlertPolygon(isNwsWarningEvent);
}
function nearestWatchPolygon(){
  return nearestAlertPolygon(isNwsWatchEvent);
}
function autoEnableStormThreatLayers(){
  if(!stormState.stormMode) return;
  const alerts = stormState.alertFeatures || [];
  const hasWarning = alerts.some(f => isNwsWarningEvent(f.properties?.event || ''));
  const hasWatch = alerts.some(f => isNwsWatchEvent(f.properties?.event || ''));
  let changed = false;
  if(!threatLayerOpts.stormReports){
    threatLayerOpts.stormReports = true;
    changed = true;
  }
  if(!threatLayerOpts.spcCat && stormState.maxDn >= 2){
    threatLayerOpts.spcCat = true;
    changed = true;
  }
  if(!threatLayerOpts.warnings && hasWarning){
    threatLayerOpts.warnings = true;
    changed = true;
  }
  if(!threatLayerOpts.watches && hasWatch && !hasWarning){
    threatLayerOpts.watches = true;
    changed = true;
  }
  if(!changed) return;
  document.querySelectorAll('[data-threat]').forEach(inp => {
    const k = inp.getAttribute('data-threat');
    if(k in threatLayerOpts) inp.checked = threatLayerOpts[k];
  });
  saveLocRadarPrefs();
  if(isRadarTabVisible()){
    syncThreatOverlays();
    syncStormReportMarkers();
    if(hasWarning || hasWatch) syncAlertPolygons(alerts.filter(f => f.geometry));
  }
}
async function fetchSwoProducts(limit){
  const r = await nwsFetch('https://api.weather.gov/products/types/SWO');
  if(!r.ok) return [];
  const list = await r.json();
  const items = (list['@graph'] || []).slice(0, limit);
  const prods = await Promise.allSettled(items.map(item =>
    nwsFetch('https://api.weather.gov/products/' + item.id).then(pr => pr.ok ? pr.json() : null)
  ));
  return prods.filter(p => p.status === 'fulfilled' && p.value).map(p => p.value);
}
function parseMcd(prod){
  const text = prod.productText || '';
  if(!text.includes('Mesoscale Discussion')) return null;
  const num = (text.match(/Mesoscale Discussion\s+(\d+)/i) || [])[1];
  const areas = (text.match(/Areas affected\.\.\.(.+?)(?:\n|$)/i) || [])[1];
  const watch = (text.match(/Probability of Watch Issuance\.\.\.(.+?)(?:\n|$)/i) || [])[1];
  const summaryMatch = text.match(/SUMMARY\.\.\.\s*\n([\s\S]*?)(?:\n\n|\n\.{3}[A-Z]|&&)/i);
  const summary = summaryMatch ? summaryMatch[1].trim().replace(/\s+/g, ' ') : '';
  return { num, areas, watch, summary, text, issued: prod.issuanceTime };
}
function outlookParagraphs(raw){
  return raw.trim().split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
function parseOutlookDiscussion(text, issued){
  if(!text) return null;
  const main = text.split(/\n\.PREV DISCUSSION/i)[0].split(/\n\$\$/)[0];
  const lines = main.split('\n');
  const headlines = [];
  for(let i = 0; i < lines.length; i++){
    const trimmed = lines[i].trim();
    if(!trimmed) continue;
    if(/^\.\.\./.test(trimmed) && /RISK/i.test(trimmed)){
      let head = trimmed.replace(/^\.\.\./, '').trim();
      let j = i + 1;
      while(j < lines.length){
        const next = lines[j].trim();
        if(!next || /^\.\.\./.test(next)) break;
        head += ' ' + next;
        j++;
      }
      headlines.push(head);
      i = j - 1;
    }
  }
  const sumMatch = main.match(/\.\.\.SUMMARY\.\.\.\s*\n([\s\S]*?)(?=\n\.\.\.|$)/i);
  const summaryParas = sumMatch ? outlookParagraphs(sumMatch[1]) : [];
  const sections = [];
  const afterSummary = sumMatch ? main.slice(main.indexOf(sumMatch[0]) + sumMatch[0].length) : main;
  const secRe = /\.\.\.([^.\n]+)\.\.\.\s*\n([\s\S]*?)(?=\n\.\.\.[^.]|\n\.\.[A-Za-z]|$)/g;
  let m;
  while((m = secRe.exec(afterSummary))){
    const title = m[1].trim();
    if(/^(SUMMARY|THERE IS)/i.test(title) || /RISK$/i.test(title)) continue;
    const paragraphs = outlookParagraphs(m[2]);
    if(title && paragraphs.length) sections.push({ title, paragraphs });
  }
  if(!headlines.length && !summaryParas.length && !sections.length) return null;
  return { headlines, summaryParas, sections, issued };
}
function findOutlookByDay(products, dayNum){
  const re = new RegExp('Day ' + dayNum + ' Convective Outlook', 'i');
  for(const prod of products){
    if(re.test(prod.productText || ''))
      return parseOutlookDiscussion(prod.productText, prod.issuanceTime);
  }
  return null;
}
function renderOutlookDiscussionHtml(disc, dayLabel, open){
  if(!disc) return '';
  const preview = disc.summaryParas[0] || disc.headlines[0] || 'Regional forecast discussion';
  let body = '';
  if(disc.headlines.length){
    body += '<div class="storm-disc-risks">' + disc.headlines.map(h =>
      '<div class="storm-disc-risk">' + esc(h) + '</div>').join('') + '</div>';
  }
  if(disc.summaryParas.length){
    body += '<div class="storm-disc-summary">' + disc.summaryParas.map(p =>
      '<p>' + esc(p) + '</p>').join('') + '</div>';
  }
  if(disc.sections.length){
    body += disc.sections.map(s =>
      '<div class="storm-disc-section"><h4>' + esc(s.title) + '</h4>'
      + s.paragraphs.map(p => '<p>' + esc(p) + '</p>').join('') + '</div>').join('');
  }
  const meta = disc.issued
    ? new Date(disc.issued).toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
    : '';
  return '<details class="storm-disc"' + (open ? ' open' : '') + '><summary>'
    + '<span class="storm-disc-hd">' + esc(dayLabel) + ' discussion</span>'
    + '<span class="storm-disc-preview">' + esc(preview) + '</span>'
    + (meta ? '<span class="storm-disc-meta">Issued ' + esc(meta) + '</span>' : '')
    + '</summary><div class="storm-disc-body">' + body + '</div></details>';
}
async function fetchSpcProbLayer(loc, layer){
  const r = await fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_' + layer + '.lyr.geojson');
  if(!r.ok) return null;
  const geo = await r.json();
  return spcRiskAtPoint(loc.lon, loc.lat, geo);
}
async function fetchSpcProbRisks(loc){
  const [torn, hail, wind] = await Promise.all([
    fetchSpcProbLayer(loc, 'torn'),
    fetchSpcProbLayer(loc, 'hail'),
    fetchSpcProbLayer(loc, 'wind')
  ]);
  return { torn, hail, wind };
}
async function fetchNearbyStormReports(loc, maxMi){
  try{
    const r = await fetch('https://www.spc.noaa.gov/climo/reports/today.csv');
    if(!r.ok) return [];
    const lines = (await r.text()).trim().split('\n').slice(1);
    const out = [];
    for(const line of lines){
      const parts = line.split(',');
      if(parts.length < 7) continue;
      const lat = parseFloat(parts[5]);
      const lon = parseFloat(parts[6]);
      if(isNaN(lat) || isNaN(lon)) continue;
      const dist = haversineMi(loc.lat, loc.lon, lat, lon);
      if(dist > (maxMi || 120)) continue;
      const time = parts[0] || '';
      const type = parts[1] || 'Report';
      const place = parts[2] || '';
      const county = parts[3] || '';
      const st = parts[4] || '';
      const remarks = parts.slice(7).join(',').trim();
      out.push({ time, type, place, county, st, lat, lon, dist, remarks });
    }
    return out.sort((a, b) => a.dist - b.dist).slice(0, 20);
  }catch(e){ return []; }
}
async function fetchLakeEffectHint(loc, d){
  if(!isGreatLakesLoc(loc) || !d) return null;
  try{
    const c = await fetchMarineCurrent(loc.lat, loc.lon);
    if(c.sea_surface_temperature == null) return null;
    const airC = state.units === 'F'
      ? (d.current.temperature_2m - 32) * 5 / 9
      : d.current.temperature_2m;
    const deltaC = airC - c.sea_surface_temperature;
    const lake = greatLakeName(loc.lat, loc.lon);
    if(deltaC <= -13){
      return {
        verdict: 'Lake-effect potential',
        detail: 'Cold air over ' + lake + ' water \u2014 watch for banded snow/showers downwind.',
        cls: 'good'
      };
    }
    if(deltaC <= -8){
      return {
        verdict: 'Moderate lake influence',
        detail: 'Air colder than ' + lake + ' \u2014 some lake-modified weather possible.',
        cls: 'mid'
      };
    }
    return null;
  }catch(e){ return null; }
}
function isStormCode(code){
  return (code ?? 0) >= 95;
}
function hourStormScore(d, j){
  const h = d.hourly;
  const cape = h.cape?.[j] ?? 0;
  const code = h.weather_code?.[j] ?? 0;
  const pop = h.precipitation_probability?.[j] ?? 0;
  const gust = h.wind_gusts_10m?.[j] ?? 0;
  let score = 0;
  if(isStormCode(code)) score += 3;
  else if(code >= 80) score += 1;
  if(cape >= 1500) score += 2;
  else if(cape >= 800) score += 1;
  if(pop >= 50) score += 1;
  if(gust >= 35) score += 1;
  return score;
}
function computeSevereWindow(d){
  if(!d || !d.hourly || !d.hourly.time) return null;
  const i0 = nowIndex(d);
  const todayKey = d.hourly.time[i0].slice(0, 10);
  let bestStart = -1, bestEnd = -1, bestSum = 0;
  let curStart = -1, curSum = 0;
  for(let j = i0; j < d.hourly.time.length && d.hourly.time[j].slice(0, 10) === todayKey; j++){
    const score = hourStormScore(d, j);
    if(score >= 2){
      if(curStart < 0) curStart = j;
      curSum += score;
    } else if(curStart >= 0){
      if(curSum > bestSum){ bestSum = curSum; bestStart = curStart; bestEnd = j - 1; }
      curStart = -1;
      curSum = 0;
    }
  }
  if(curStart >= 0 && curSum > bestSum){
    bestStart = curStart;
    bestEnd = d.hourly.time.length - 1;
    while(bestEnd > bestStart && d.hourly.time[bestEnd].slice(0, 10) !== todayKey) bestEnd--;
  }
  if(bestStart < 0 || bestEnd < bestStart) return null;
  return {
    start: d.hourly.time[bestStart],
    end: d.hourly.time[bestEnd],
    label: (bestStart === bestEnd
      ? hourLabelCompact(d.hourly.time[bestStart])
      : hourLabelCompact(d.hourly.time[bestStart]) + '\u2013' + hourLabelCompact(d.hourly.time[bestEnd]))
  };
}
function windShearNote(d, i){
  const h = d.hourly;
  const s10 = h.wind_speed_10m[i] ?? 0;
  const s80 = h.wind_speed_80m && h.wind_speed_80m[i];
  const d10 = h.wind_direction_10m[i] ?? 0;
  const d80 = h.wind_direction_80m && h.wind_direction_80m[i];
  if(s80 == null || d80 == null) return null;
  const spdShear = Math.round(s80 - s10);
  let dirDiff = Math.abs(d80 - d10);
  if(dirDiff > 180) dirDiff = 360 - dirDiff;
  const strong = spdShear >= 15 || dirDiff >= 45;
  return (strong ? 'Strong' : 'Weak') + ' shear \u00B7 ' + spdShear + ' ' + windUnit() + ' \u0394 \u00B7 ' + dirDiff + '\u00B0 dir';
}
function moistureNote(d, i){
  const rh = d.hourly.relative_humidity_2m && d.hourly.relative_humidity_2m[i];
  const temp = d.hourly.temperature_2m[i] ?? 0;
  if(rh == null) return null;
  if(rh >= 65 && temp > 15) return 'Moist surface air';
  if(rh >= 50) return 'Moderate moisture';
  return 'Limited moisture';
}
function shouldShowStormSetup(d){
  if(!d) return false;
  const i = nowIndex(d);
  const cape = d.hourly.cape[i] ?? 0;
  return stormState.stormMode || stormState.maxDn >= 2 || cape >= 500 || !!stormState.severeWindow;
}
function renderStormSetup(d){
  const wrap = $('stormSetup'), box = $('stormSetupGlance');
  if(!wrap || !box || !d) return;
  if(!shouldShowStormSetup(d)){
    wrap.hidden = true;
    box.innerHTML = '';
    return;
  }
  const i = nowIndex(d);
  const cape = Math.round(d.hourly.cape[i] ?? 0);
  const frz = d.hourly.freezing_level_height[i] ?? 0;
  const frzDisp = state.units === 'F'
    ? (Math.round(frz * 3.281 / 100) * 100).toLocaleString() + '<small> ft</small>'
    : Math.round(frz).toLocaleString() + '<small> m</small>';
  const items = [
    { k: 'CAPE', v: cape + '<small> J/kg</small>', s: capeCat(cape) + ' (HRRR)' },
    { k: 'Freezing lvl', v: frzDisp, s: 'Storm depth reference' }
  ];
  const shear = windShearNote(d, i);
  if(shear) items.push({ k: 'Wind shear', v: shear.split(' \u00B7 ')[0], s: shear });
  const moist = moistureNote(d, i);
  if(moist) items.push({ k: 'Moisture', v: moist, s: 'Surface layer' });
  const cidx = convectiveIndexNote(d, i);
  if(cidx) items.push({ k: 'Environment', v: cidx, s: 'HRRR-derived indices' });
  if(stormState.prob){
    const p = stormState.prob;
    const bits = [];
    if(p.torn) bits.push('T ' + (p.torn.label2 || p.torn.label));
    if(p.hail) bits.push('Hail ' + (p.hail.label2 || p.hail.label));
    if(p.wind) bits.push('Wind ' + (p.wind.label2 || p.wind.label));
    if(bits.length) items.push({ k: 'SPC probs', v: bits[0], s: bits.slice(1).join(' \u00B7 ') });
  }
  box.innerHTML = items.map(it =>
    '<div class="g"><div class="gk">' + it.k + '</div><div class="gv">' + it.v + '</div>'
    + (it.s ? '<div class="gs">' + it.s + '</div>' : '') + '</div>'
  ).join('');
  wrap.hidden = false;
}
function buildStormBannerText(){
  const parts = [];
  const warns = stormState.alertFeatures.filter(f => /warning/i.test(f.properties.event));
  const watches = stormState.alertFeatures.filter(f => /watch/i.test(f.properties.event));
  if(warns.length){
    const p = warns[0].properties;
    const until = alertEndIso(p)
      ? ' until ' + new Date(alertEndIso(p)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '';
    parts.push('<strong>' + esc(p.event) + '</strong>' + esc(until));
  } else if(watches.length){
    parts.push('<strong>' + esc(watches[0].properties.event) + '</strong>');
  }
  const day1 = stormState.risks.find(r => r.day === 'day1');
  if(day1 && day1.dn >= 2) parts.push('SPC ' + esc(day1.label2 || day1.label));
  if(stormState.mcds.length) parts.push('Mesoscale Discussion overhead');
  if(stormState.severeWindow) parts.push('Best window ' + esc(stormState.severeWindow.label));
  return parts.join(' \u00B7 ');
}
function buildThreatNarrative(d){
  if(!d || !stormState.stormMode) return '';
  const i = nowIndex(d);
  const cape = Math.round(d.hourly.cape?.[i] ?? 0);
  const bits = [];
  const warns = stormState.alertFeatures.filter(f => /warning/i.test(f.properties?.event || ''));
  const watches = stormState.alertFeatures.filter(f => /watch/i.test(f.properties?.event || ''));
  if(warns.length){
    bits.push('Active warning polygon at your location');
  }else if(watches.length){
    bits.push('Inside a watch area — storms may develop nearby');
  }
  if(cape >= 500) bits.push(cape + ' J/kg CAPE (HRRR) supports strong updrafts');
  const shear = windShearNote(d, i);
  if(shear && /Strong/i.test(shear)) bits.push('favorable wind shear for organized storms');
  const day1 = stormState.risks.find(r => r.day === 'day1');
  if(day1 && day1.dn >= 3) bits.push('SPC places this area in ' + (day1.label2 || day1.label).toLowerCase() + ' risk');
  if(stormState.severeWindow) bits.push('hourly signals peak ' + stormState.severeWindow.label);
  if(stormState.reports && stormState.reports.length){
    bits.push(stormState.reports.length + ' SPC storm report' + (stormState.reports.length === 1 ? '' : 's') + ' within ~120 mi');
  }
  return bits.length ? bits.join('. ') + '.' : '';
}
function convectiveIndexNote(d, i){
  const cape = d.hourly.cape?.[i] ?? 0;
  const s10 = d.hourly.wind_speed_10m?.[i] ?? 0;
  const s80 = d.hourly.wind_speed_80m?.[i];
  if(s80 == null || cape < 300) return null;
  const shear = s80 - s10;
  if(cape >= 1500 && shear >= 20) return 'High CAPE + shear — supercell environment possible';
  if(cape >= 800 && shear >= 12) return 'Moderate CAPE + shear — organized convection possible';
  if(cape >= 500) return 'Weak to moderate instability';
  return null;
}
function nearestStormReport(){
  const reports = filteredStormReports();
  if(!reports.length) return null;
  return reports.reduce((a, b) => ((a.dist ?? 9999) < (b.dist ?? 9999) ? a : b));
}
function buildStormBannerActions(){
  const parts = ['<button type="button" class="storm-banner-link" data-storm-open-radar>Open radar &rarr;</button>'];
  if(stormState.severeWindow){
    parts.push('<button type="button" class="storm-banner-link" data-storm-radar-window>Severe window on timeline</button>');
  }
  const near = nearestStormReport();
  if(near){
    const dist = near.dist != null ? ' (' + Math.round(near.dist) + ' mi)' : '';
    parts.push('<button type="button" class="storm-banner-link" data-storm-radar-report>Nearest report' + esc(dist) + '</button>');
  }
  const warnPoly = nearestWarningPolygon();
  if(warnPoly){
    const dist = warnPoly.dist > 0.5 ? ' (' + Math.round(warnPoly.dist) + ' mi)' : '';
    parts.push('<button type="button" class="storm-banner-link" data-storm-radar-warning>Warning polygon' + esc(dist) + '</button>');
  }
  const watchPoly = nearestWatchPolygon();
  if(watchPoly){
    const dist = watchPoly.dist > 0.5 ? ' (' + Math.round(watchPoly.dist) + ' mi)' : '';
    parts.push('<button type="button" class="storm-banner-link" data-storm-radar-watch>Watch polygon' + esc(dist) + '</button>');
  }
  return '<div class="storm-banner-actions">' + parts.join('') + '</div>';
}
function bindStormBannerActions(){
  const box = $('stormModeBanner');
  if(!box) return;
  box.querySelector('[data-storm-open-radar]')?.addEventListener('click', e => {
    e.preventDefault();
    setAppTab('radar');
  });
  box.querySelector('[data-storm-radar-window]')?.addEventListener('click', e => {
    e.preventDefault();
    jumpRadarToSevereWindow();
  });
  box.querySelector('[data-storm-radar-report]')?.addEventListener('click', e => {
    e.preventDefault();
    const r = nearestStormReport();
    if(r) jumpRadarToStormReport(r);
  });
  box.querySelector('[data-storm-radar-warning]')?.addEventListener('click', e => {
    e.preventDefault();
    const w = nearestWarningPolygon();
    if(w) jumpRadarToAlertPolygon(w, 'warnings');
  });
  box.querySelector('[data-storm-radar-watch]')?.addEventListener('click', e => {
    e.preventDefault();
    const w = nearestWatchPolygon();
    if(w) jumpRadarToAlertPolygon(w, 'watches');
  });
}
function renderStormBanner(){
  const box = $('stormModeBanner');
  if(!box) return;
  const text = buildStormBannerText();
  const narrative = buildThreatNarrative(state.data);
  if(stormState.stormMode && (text || narrative)){
    box.innerHTML = (text ? '<div>' + text + '</div>' : '')
      + (narrative ? '<div class="storm-narrative">' + esc(narrative) + '</div>' : '')
      + buildStormBannerActions();
    box.classList.add('visible');
    bindStormBannerActions();
  } else {
    box.innerHTML = '';
    box.classList.remove('visible');
  }
}
function renderStormPanel(box, loc, opts){
  const risks = opts.risks || [];
  const mcds = opts.mcds || [];
  const discussions = opts.discussions || {};
  const prob = opts.prob;
  const reports = opts.reports || [];
  const severeWindow = opts.severeWindow;
  const lakeEffect = opts.lakeEffect;
  const muted = opts.muted;
  const riskHtml = risks.map(r => {
    const name = r.day === 'day1' ? 'Day 1' : r.day === 'day2' ? 'Day 2' : 'Day 3';
    const fill = cssColor(r.fill);
    const stroke = cssColor(r.stroke);
    const style = fill ? 'background:' + fill + ';color:#1a1a1a;border-color:' + (stroke || fill) : '';
    return '<div class="storm-risk"><span class="day">' + name + '</span>'
      + '<span class="storm-badge" style="' + style + '">' + esc(r.label2 || r.label || 'None') + '</span></div>';
  }).join('');
  let probHtml = '';
  if(prob && (prob.torn || prob.hail || prob.wind)){
    const rows = [
      ['Tornado', prob.torn],
      ['Hail', prob.hail],
      ['Wind', prob.wind]
    ].filter(r => r[1]).map(r =>
      '<div class="storm-prob"><span class="k">' + r[0] + '</span><span class="v">' + esc(r[1].label2 || r[1].label) + '</span></div>'
    ).join('');
    if(rows) probHtml = '<div class="storm-probs">' + rows + '</div>';
  }
  let windowHtml = '';
  if(severeWindow){
    windowHtml = '<div class="storm-window"><strong>Best storm window today:</strong> '
      + esc(severeWindow.label) + '</div>';
  }
  let lakeHtml = '';
  if(lakeEffect){
    lakeHtml = '<div class="storm-window"><strong>' + esc(lakeEffect.verdict) + ':</strong> '
      + esc(lakeEffect.detail) + '</div>';
  }
  let mcdHtml = '';
  if(mcds.length){
    mcdHtml = '<div class="storm-mcds">' + mcds.map(m =>
      '<div class="storm-mcd"><span class="md-num">SPC Mesoscale Discussion ' + esc(m.num) + '</span>'
      + (m.distMi != null && !pointInMcd(loc.lon, loc.lat, m.text)
        ? '<div class="md-meta">' + Math.round(m.distMi) + ' mi from your location</div>' : '')
      + (m.areas ? '<div>' + esc(m.areas.trim()) + '</div>' : '')
      + (m.summary ? '<div>' + esc(m.summary.trim()) + '</div>' : '')
      + '<div class="md-meta">' + (m.watch ? esc(m.watch.trim()) : '')
      + (m.issued ? ' \u00B7 ' + new Date(m.issued).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' }) : '')
      + '</div></div>'
    ).join('') + '</div>';
  }
  let reportHtml = '';
  const reportsShown = filteredStormReports();
  if(reportsShown.length){
    reportHtml = renderStormReportFilters()
      + '<div class="storm-reports">' + reportsShown.slice(0, 8).map((r, ri) =>
      '<button type="button" class="storm-report storm-report-jump" data-rpt-i="' + ri + '"><strong>' + esc(r.type) + '</strong> \u00B7 ' + esc(r.place)
      + (r.county ? ', ' + esc(r.county) : '') + (r.st ? ' ' + esc(r.st) : '')
      + '<span class="sr-meta">' + esc(r.time || '')
      + (r.dist != null ? ' \u00B7 ' + Math.round(r.dist) + ' mi away' : '')
      + (r.remarks ? ' \u00B7 ' + esc(r.remarks.slice(0, 120)) : '')
      + ' <span class="storm-report-go">View on radar &rarr;</span></span></button>'
    ).join('') + '</div>';
  }
  const dayLabels = { day1:'Day 1', day2:'Day 2', day3:'Day 3' };
  const maxDn = Math.max(...risks.map(r => r.dn || 0), 0);
  let discHtml = '';
  const parts = [];
  ['day1','day2','day3'].forEach(day => {
    const disc = discussions[day];
    if(!disc) return;
    const risk = risks.find(r => r.day === day);
    const dn = risk?.dn || 0;
    if(day === 'day1' && dn < 1) return;
    const open = day === 'day1' && maxDn >= 4;
    parts.push(renderOutlookDiscussionHtml(disc, dayLabels[day] || day, open));
  });
  if(parts.length) discHtml = '<div class="storm-discs">' + parts.join('') + '</div>';
  let floodHtml = '';
  const outlook = state.data ? todayOutlook(state.data) : '';
  if(/flash flood|excessive rainfall|heavy rain|areal flood|river flood/i.test(outlook || '')){
    floodHtml = '<div class="storm-window"><strong>Heavy rain / flood signal:</strong> '
      + 'NWS forecast mentions flooding or excessive rainfall — enable <em>WPC excessive rain</em> on the radar map for regional outlook polygons.</div>';
  }
  const fcUrl = nwsPointForecastUrl(loc);
  const skywarnUrl = nwsSkywarnUrl(state.data?.nwsPoints?.cwa);
  box.classList.toggle('storm-panel-muted', !!muted);
  box.innerHTML = '<div class="storm-head"><div class="lbl">Convective outlook</div>'
    + '<div class="storm-meta">SPC at your location</div></div>'
    + '<div class="storm-risks">' + riskHtml + '</div>'
    + probHtml + windowHtml + lakeHtml + floodHtml + mcdHtml + reportHtml + discHtml
    + '<div class="storm-foot">'
    + '<a href="' + SPC_STORM_LINKS.outlook + '" target="_blank" rel="noopener">SPC outlook maps</a>'
    + (maxDn >= 2 || stormState.stormMode
      ? '<a href="' + SPC_STORM_LINKS.mesoanalysis + '" target="_blank" rel="noopener">SPC mesoanalysis</a>'
        + '<a href="' + SPC_STORM_LINKS.surfaceMaps + '" target="_blank" rel="noopener">Surface analysis</a>'
        + '<a href="' + SPC_STORM_LINKS.soundings + '" target="_blank" rel="noopener">Observed soundings</a>'
      : '')
    + '<a href="' + fcUrl + '" target="_blank" rel="noopener">NWS point forecast</a>'
    + '<a href="' + skywarnUrl + '" target="_blank" rel="noopener">SKYWARN / spotter info</a>'
    + '</div>';
  bindStormReportFilters(box);
  bindStormReportJumps(box, reportsShown);
}
function bindStormReportJumps(box, reports){
  if(!box || !reports) return;
  box.querySelectorAll('.storm-report-jump').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.getAttribute('data-rpt-i'), 10);
      if(reports[i]) jumpRadarToStormReport(reports[i]);
    });
  });
}
function updateStormUi(loc, d){
  renderStormBanner();
  renderStormSetup(d);
  if(typeof syncRadarVelToggle === 'function') syncRadarVelToggle();
  const box = $('stormLinks');
  if(!box) return;
  const show = stormState.maxDn >= 2 || stormState.mcds.length > 0 || stormState.reports.length > 0
    || stormState.stormMode || !!stormState.severeWindow || !!stormState.lakeEffect;
  if(!show){
    box.classList.remove('visible');
    box.innerHTML = '';
    return;
  }
  renderStormPanel(box, loc, {
    risks: stormState.risks,
    mcds: stormState.mcds,
    discussions: stormState.discussions,
    prob: stormState.prob,
    reports: stormState.reports,
    severeWindow: stormState.severeWindow,
    lakeEffect: stormState.lakeEffect,
    muted: stormState.maxDn === 2 && !stormState.stormMode
  });
  box.classList.add('visible');
}
async function refreshStormTracking(loc, d){
  if(!isLikelyUS(loc) || !d) return;
  const gen = ++stormTrackGen;
  const cape = d.hourly.cape[nowIndex(d)] ?? 0;
  stormState.severeWindow = computeSevereWindow(d);
  updateRadarStormMark();
  try{
    const [day1, day2, day3, products, prob, reports, lakeEffect, alertFeats] = await Promise.all([
      fetchSpcOutlookDay(loc, 'day1'),
      fetchSpcOutlookDay(loc, 'day2'),
      fetchSpcOutlookDay(loc, 'day3'),
      fetchSwoProducts(30),
      fetchSpcProbRisks(loc),
      fetchNearbyStormReports(loc, 120),
      fetchLakeEffectHint(loc, d),
      fetchAllActiveAlerts(loc)
    ]);
    if(gen !== stormTrackGen) return;
    stormState.risks = [day1, day2, day3].filter(Boolean);
    stormState.maxDn = Math.max(...stormState.risks.map(r => r.dn || 0), 0);
    stormState.prob = prob;
    stormState.mcds = products.map(parseMcd).filter(Boolean)
      .map(m => Object.assign({}, m, { distMi: minDistToRingMi(loc.lon, loc.lat, mcdRingFromText(m.text)) }))
      .filter(m => m.distMi <= 250)
      .sort((a, b) => a.distMi - b.distMi)
      .slice(0, 4);
    stormState.discussions = {
      day1: findOutlookByDay(products, 1),
      day2: findOutlookByDay(products, 2),
      day3: findOutlookByDay(products, 3)
    };
    stormState.reports = reports;
    stormState.lakeEffect = lakeEffect;
    stormState.alertFeatures = alertFeats;
    const hasWarning = stormState.alertFeatures.some(f => /warning/i.test(f.properties.event));
    const hasWatch = stormState.alertFeatures.some(f => /watch/i.test(f.properties.event));
    stormState.stormMode = hasWarning || hasWatch || stormState.maxDn >= 3
      || stormState.mcds.length > 0 || cape >= 1000;
    stormState.loaded = true;
    autoEnableStormThreatLayers();
    updateStormUi(loc, d);
    syncAlertPolygons(alertFeats.filter(f => f.geometry));
    syncStormReportMarkers();
    refreshFireWeather(loc, d);
    renderAlertsBox(alertFeats);
    if(state.data) renderActivityPlanner(state.data);
  }catch(e){
    console.error('storm intel', e);
    stormState.loaded = false;
    const box = $('stormLinks');
    if(box && loc && isLikelyUS(loc)){
      box.classList.add('visible');
      box.innerHTML = '<div class="storm-head"><div class="lbl">Convective outlook</div>'
        + '<div class="storm-meta">SPC at your location</div></div>'
        + panelUnavail('storm_api');
    }else if(box){
      box.classList.remove('visible');
      box.innerHTML = '';
    }
  }
}
async function loadStormIntel(loc, d){
  showStormPanelPending(loc);
  if(stormState.loaded && state.data === d){
    updateStormUi(loc, d);
    syncAlertPolygons(stormState.alertFeatures.filter(f => f.geometry));
    return;
  }
  return refreshStormTracking(loc, d || state.data);
}
function showStormPanelPending(loc){
  const box = $('stormLinks');
  if(!box || stormState.loaded) return;
  const activeWx = stormState.alertFeatures.some(f => /warning|watch/i.test(f.properties?.event || ''));
  if(!activeWx && stormState.maxDn < 2) return;
  box.classList.add('visible');
  box.innerHTML = '<div class="storm-head"><div class="lbl">Convective outlook</div>'
    + '<div class="storm-meta">Loading SPC outlook and storm reports…</div></div>';
}

