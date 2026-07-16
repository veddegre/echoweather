// ---------- radar (RainViewer + IEM NEXRAD) ----------
let map = null, mapMarker = null, radarFrames = [], satFrames = [], iemFrames = [];
let radarOverlayLayers = [null, null], satOverlayLayers = [null, null], iemOverlayLayers = [null, null];
let radarOverlaySlot = 0, satOverlaySlot = 0, iemOverlaySlot = 0;
let radarSlotFrame = [-1, -1], satSlotFrame = [-1, -1], iemSlotFrame = [-1, -1];
let goesSatLayer = null;
let radarIdx = 0, radarTimer = null, radarHost = '', radarSatOn = false, radarLoadId = 0;
let rvPastCount = 0;
let rainviewerTileErrors = 0;
let iemVelocitySite = null;
let iemReflectFrames = [];
let iemLoadGen = 0;
let mrmsFrames = [];
let mrmsOverlayLayers = [null, null], mrmsSlotFrame = [-1, -1], mrmsOverlaySlot = 0;
let mrmsProduct = 'bref';
let mrmsVelocitySite = null;
let mrmsWmsLayerKey = '';
let mrmsOverlayLayerB = null;
let mrmsFrameIdxB = -1;
let mrmsWmsLayerKeyB = '';
let radarDeepFrame = null;
let mapB = null, mapBMarker = null, basemapLayerB = null;
let iemOverlayLayersB = [null, null], iemSlotFrameB = [-1, -1], iemOverlaySlotB = 0;
let radarDualOn = false, mapSyncLock = false;
const MRMS_BREF_WMS_URL = 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows';
const MRMS_GEOSERVER_OWS = 'https://opengeo.ncep.noaa.gov/geoserver/ows';
const MRMS_WMS_URL = MRMS_BREF_WMS_URL;
const MRMS_MAX_FRAMES = 60;
const MRMS_STRIDE_OPTS = [2, 5, 10];
const MRMS_STRIDE_DEFAULT = 5;
let mrmsAllTimes = [];
let mrmsRefreshBusy = false;
let radarMode = store.get('st_radar_mode') || defaultRadarMode(state.locations[state.active]);
const IEM_SUFFIXES = ['900913-m50m','900913-m45m','900913-m40m','900913-m35m','900913-m30m','900913-m25m','900913-m20m','900913-m15m','900913-m10m','900913-m05m','900913'];
const IEM_MINS = [50,45,40,35,30,25,20,15,10,5,0];
const IEM_TILES = {
  'iem-n0q': { product: 'n0q', label: 'IEM NEXRAD base reflectivity' },
  'iem-n0r': { product: 'n0r', label: 'IEM composite reflectivity' },
  'iem-n0u': { product: 'N0U', label: 'IEM NEXRAD velocity', velocity: true }
};
const RADAR_ZOOM = { min: 4, default: 6, rainviewer: 6, iem: 9, mrms: 10 };
const RV_TILE_OPTS = {
  opacity: 0.72,
  maxNativeZoom: 6,
  maxZoom: 6,
  zIndex: 450,
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 1
};
function markerStyle(){
  const c = cssVar('--accent') || '#3c91e6';
  return { radius: 7, color: c, fillColor: c, fillOpacity: 0.9, weight: 2 };
}
function radarMaxZoom(){
  if(radarMode === 'mrms') return RADAR_ZOOM.mrms;
  return IEM_TILES[radarMode] ? RADAR_ZOOM.iem : RADAR_ZOOM.rainviewer;
}
function isLiveOnlyRadar(){
  if(radarDualOn && radarMode === 'iem-n0u') return false;
  return !!(IEM_TILES[radarMode] && IEM_TILES[radarMode].velocity);
}
function isChaseRadarMode(){
  return !!(stormState.stormMode || stormState.severeWindow
    || (stormState.loaded && (stormState.maxDn >= 3 || stormState.reports.length > 0)));
}
function syncRadarVelToggle(){
  const btn = $('radarVelToggle');
  if(!btn) return;
  const loc = state.locations[state.active];
  const iemMode = radarMode === 'iem-n0q' || radarMode === 'iem-n0u';
  const show = loc && isLikelyUS(loc) && (iemMode || radarMode === 'mrms');
  btn.hidden = !show;
  if(btn.hidden) return;
  if(radarMode === 'mrms'){
    const vel = mrmsProduct === 'bvel';
    btn.textContent = vel ? 'Reflectivity' : 'Velocity';
    btn.setAttribute('aria-label', vel ? 'Switch to MRMS reflectivity' : 'Switch to MRMS velocity');
    return;
  }
  const vel = radarMode === 'iem-n0u';
  btn.textContent = vel ? 'Reflectivity' : 'Velocity';
  btn.setAttribute('aria-label', vel ? 'Switch to reflectivity' : 'Switch to velocity');
}
function syncRadarSiteBtn(){
  const btn = $('radarSiteBtn');
  if(!btn) return;
  const loc = state.locations[state.active];
  const show = loc && isLikelyUS(loc) && radarMode === 'mrms' && isChaseRadarMode();
  btn.hidden = !show;
}
function jumpRadarToSevereWindow(){
  const win = stormState.severeWindow;
  if(!win) return;
  if(radarMode === 'mrms' && isLikelyUS(state.locations[state.active])){
    radarMode = 'iem-n0q';
    saveLocRadarPrefs();
    if($('radarMode')) $('radarMode').value = radarMode;
    radarLoadId++;
    iemLoadGen++;
  }
  setAppTab('radar');
  const run = () => {
    if(!map) return;
    centerRadarMap();
    const tMs = new Date(win.start).getTime();
    const fi = findRadarFrameForTime(tMs);
    if(fi != null && radarFrameCount() > 1){
      stopRadarTimer();
      showFrame(fi);
    }
    updateRadarStormMark();
  };
  setTimeout(run, map ? 150 : 550);
}
function buildRadarHash(){
  const parts = [];
  if(radarMode) parts.push('mode=' + encodeURIComponent(radarMode));
  const n = radarFrameCount();
  if(n > 1) parts.push('frame=' + radarIdx);
  const layers = typeof threatLayersHashParam === 'function' ? threatLayersHashParam() : '';
  if(layers) parts.push('layers=' + encodeURIComponent(layers));
  return '#radar' + (parts.length ? '?' + parts.join('&') : '');
}
function applyPendingRadarFrame(){
  if(radarDeepFrame == null) return;
  const f = radarDeepFrame;
  radarDeepFrame = null;
  const n = radarFrameCount();
  if(n > 1 && f < n) showFrame(f);
}
function updateRadarHash(){
  if(getAppTab() !== 'radar') return;
  const next = buildRadarHash();
  if(location.hash !== next) history.replaceState(null, '', next);
}
function applyRadarZoomLimits(){
  if(!map) return;
  const maxZ = radarMaxZoom();
  map.setMinZoom(RADAR_ZOOM.min);
  map.setMaxZoom(maxZ);
  if(map.getZoom() > maxZ) map.setZoom(maxZ);
  if(basemapLayer) basemapLayer.options.maxZoom = maxZ;
  radarOverlayLayers.forEach(l => {
    if(l){ l.options.maxNativeZoom = RADAR_ZOOM.rainviewer; l.options.maxZoom = RADAR_ZOOM.rainviewer; }
  });
  satOverlayLayers.forEach(l => {
    if(l){ l.options.maxNativeZoom = RADAR_ZOOM.rainviewer; l.options.maxZoom = RADAR_ZOOM.rainviewer; }
  });
  iemOverlayLayers.forEach(l => {
    if(l){ l.options.maxNativeZoom = RADAR_ZOOM.iem; l.options.maxZoom = RADAR_ZOOM.iem; }
  });
  mrmsOverlayLayers.forEach(l => {
    if(l) l.options.maxZoom = RADAR_ZOOM.mrms;
  });
}
function swapOverlaySlot(layers, slot, opacity){
  layers.forEach((l, i) => { if(l) l.setOpacity(i === slot ? opacity : 0); });
}
function ensurePingPongLayer(layers, slot, onError, opts, targetMap){
  const m = targetMap || map;
  if(!m) return null;
  if(!layers[slot]){
    layers[slot] = L.tileLayer('', { ...opts, opacity: 0 });
    if(onError) layers[slot].on('tileerror', onError);
    layers[slot].addTo(m);
  } else if(!m.hasLayer(layers[slot])) {
    layers[slot].addTo(m);
  }
  return layers[slot];
}
function loadPingPongFrame(layers, slotFrames, slot, frameIdx, url, opacity, onError, showWhenReady, layerOpts, targetMap){
  const layer = ensurePingPongLayer(layers, slot, onError, layerOpts || RV_TILE_OPTS, targetMap);
  if(slotFrames[slot] === frameIdx && layer._url === url){
    if(showWhenReady) swapOverlaySlot(layers, slot, opacity);
    return;
  }
  slotFrames[slot] = frameIdx;
  if(showWhenReady){
    let done = false;
    const finish = () => {
      if(done) return;
      done = true;
      swapOverlaySlot(layers, slot, opacity);
    };
    layer.once('load', finish);
    layer.once('tileerror', finish);
    layer.setOpacity(0);
    layer.setUrl(url);
    return;
  }
  layer.setOpacity(0);
  layer.setUrl(url);
}
function showPingPongFrame(layers, slotFrames, activeSlot, frameIdx, url, opacity, onError, layerOpts, targetMap){
  if(slotFrames[activeSlot] === frameIdx){
    swapOverlaySlot(layers, activeSlot, opacity);
    return activeSlot;
  }
  const inactive = 1 - activeSlot;
  if(slotFrames[inactive] === frameIdx){
    swapOverlaySlot(layers, inactive, opacity);
    return inactive;
  }
  loadPingPongFrame(layers, slotFrames, inactive, frameIdx, url, opacity, onError, true, layerOpts, targetMap);
  return inactive;
}
function preloadPingPongFrame(layers, slotFrames, activeSlot, frameIdx, url, onError, layerOpts, targetMap){
  const preloadSlot = 1 - activeSlot;
  if(slotFrames[preloadSlot] === frameIdx) return;
  loadPingPongFrame(layers, slotFrames, preloadSlot, frameIdx, url, 0, onError, false, layerOpts, targetMap);
}
const SAT_TILE_OPTS = { ...RV_TILE_OPTS, zIndex: 448 };
const IEM_TILE_OPTS = {
  opacity: 0.78,
  maxNativeZoom: RADAR_ZOOM.iem,
  maxZoom: RADAR_ZOOM.iem,
  zIndex: 450,
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 1,
  attribution: 'IEM / NOAA NEXRAD'
};
const MRMS_TILE_OPTS = {
  opacity: 0.78,
  maxZoom: RADAR_ZOOM.mrms,
  zIndex: 450,
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 1,
  attribution: 'NOAA MRMS'
};
function hidePingPongLayers(layers){
  layers.forEach(l => { if(l) l.setOpacity(0); });
}
function removePingPongLayers(layers, targetMap){
  if(!targetMap) return;
  hidePingPongLayers(layers);
  layers.forEach(l => { if(l && targetMap.hasLayer(l)) targetMap.removeLayer(l); });
}
function resetPingPongSlots(){
  radarSlotFrame = [-1, -1];
  satSlotFrame = [-1, -1];
  iemSlotFrame = [-1, -1];
  iemSlotFrameB = [-1, -1];
  mrmsSlotFrame = [-1, -1];
  radarOverlaySlot = satOverlaySlot = iemOverlaySlot = mrmsOverlaySlot = 0;
  iemOverlaySlotB = 0;
}
function clearDualPaneOverlays(){
  removePingPongLayers(iemOverlayLayersB, mapB);
  removePingPongLayers(iemOverlayLayersB, map);
}
function clearRadarLayers(){
  removePingPongLayers(radarOverlayLayers, map);
  removePingPongLayers(satOverlayLayers, map);
  removePingPongLayers(iemOverlayLayers, map);
  removePingPongLayers(mrmsOverlayLayers, map);
  clearDualPaneOverlays();
  hideGoesSatellite();
  resetPingPongSlots();
}
function stopRadarTimer(){
  if(radarTimer){ clearInterval(radarTimer); radarTimer = null; $('radarPlay').textContent = '\u25B6 Play'; }
}
function primeRadarLoad(){
  clearRadarLayers();
  stopRadarTimer();
  const time = $('radarTime');
  if(time) time.textContent = 'Loading\u2026';
}
function onRainviewerTileError(){
  rainviewerTileErrors++;
  if(radarMode !== 'rainviewer') return;
  const note = $('radarNote');
  if(rainviewerTileErrors >= 3 && rainviewerTileErrors < 5){
    if(note) note.textContent = 'RainViewer tiles intermittent — if the map stays blank, switch radar source.';
    return;
  }
  if(rainviewerTileErrors < 5) return;
  rainviewerTileErrors = 0;
  radarMode = 'iem-n0q';
  saveLocRadarPrefs();
  $('radarMode').value = radarMode;
  setPanelUnavail($('radarNote'), 'radar_rainviewer');
  stopRadarTimer();
  loadIemRadar('iem-n0q');
}
function isRadarTabVisible(){
  return document.body.classList.contains('mtab-radar');
}
function clearExpandedRadarLayout(){
  const stage = $('radarStage');
  const wrap = stage?.querySelector('.radar-wrap');
  const panes = $('radarPanes');
  if(wrap) wrap.style.removeProperty('height');
  if(panes) panes.style.removeProperty('height');
  ['radar', 'radarB'].forEach(id => {
    const el = $(id);
    if(el) el.style.removeProperty('height');
  });
}
function syncExpandedRadarLayout(){
  const stage = $('radarStage');
  if(!stage?.classList.contains('expanded')){
    clearExpandedRadarLayout();
    return;
  }
  const wrap = stage.querySelector('.radar-wrap');
  const panes = $('radarPanes');
  const ctl = stage.querySelector('.radar-ctl');
  if(!wrap || !panes) return;
  const gap = 10;
  const wrapH = Math.max(200, stage.clientHeight - (ctl ? ctl.offsetHeight + gap : 0) - gap);
  wrap.style.height = wrapH + 'px';
  panes.style.height = wrapH + 'px';
  panes.querySelectorAll('.radar-pane:not([hidden]) #radar, .radar-pane:not([hidden]) #radarB').forEach(el => {
    const pane = el.closest('.radar-pane');
    if(!pane || pane.hidden) return;
    const lbl = pane.querySelector('.radar-pane-lbl:not([hidden])');
    const lblH = lbl ? lbl.offsetHeight + 4 : 0;
    el.style.height = Math.max(120, wrapH - lblH) + 'px';
  });
}
function refreshRadarMapSize(){
  if(!map) return;
  syncExpandedRadarLayout();
  const invalidate = () => {
    if(map){
      map.invalidateSize({ animate: false });
      sizeLightningCanvas();
    }
    if(mapB) mapB.invalidateSize({ animate: false });
  };
  invalidate();
  requestAnimationFrame(() => {
    invalidate();
    requestAnimationFrame(invalidate);
  });
}
function dualPaneAvailable(){
  const loc = state.locations[state.active];
  if(!loc || !isLikelyUS(loc)) return false;
  if(radarMode === 'iem-n0q' || radarMode === 'iem-n0u') return true;
  return radarMode === 'mrms';
}
function dualPaneSecondaryMode(){
  if(radarMode === 'mrms') return mrmsProduct === 'bvel' ? 'mrms-bref' : 'mrms-bvel';
  if(radarMode === 'iem-n0q') return 'iem-n0u';
  if(radarMode === 'iem-n0u') return 'iem-n0q';
  return null;
}
function dualPanePrimaryLabel(){
  if(radarMode === 'mrms') return mrmsProduct === 'bvel' ? 'MRMS velocity' : 'MRMS reflectivity';
  if(radarMode === 'iem-n0u') return 'Velocity';
  return 'Reflectivity';
}
function dualPaneSecondaryLabel(){
  if(radarMode === 'mrms') return mrmsProduct === 'bvel' ? 'Reflectivity' : 'Velocity';
  if(radarMode === 'iem-n0u') return 'Reflectivity';
  return 'Velocity';
}
async function ensureDualPaneVelocitySite(){
  if(!radarDualOn) return true;
  const sec = dualPaneSecondaryMode();
  if(sec === 'mrms-bvel'){
    if(!mrmsOpengeoSiteId()) mrmsVelocitySite = await resolveIemVelocitySite();
    return !!mrmsVelocityLayerName();
  }
  if(sec !== 'iem-n0u') return true;
  if(iemVelocitySite) return true;
  iemVelocitySite = await resolveIemVelocitySite();
  return !!iemVelocitySite;
}
function syncMapBBasemap(){
  if(!mapB) return;
  const style = cssVar('--map-tiles') || (isDarkTheme() ? 'dark_all' : 'light_all');
  const url = 'https://{s}.basemaps.cartocdn.com/' + style + '/{z}/{x}/{y}{r}.png';
  if(basemapLayerB) mapB.removeLayer(basemapLayerB);
  basemapLayerB = L.tileLayer(url, {
    attribution: '\u00A9 OpenStreetMap \u00A9 CARTO', subdomains: 'abcd',
    minZoom: RADAR_ZOOM.min, maxZoom: radarMaxZoom()
  }).addTo(mapB);
  basemapLayerB.bringToBack();
  if(mapBMarker) mapBMarker.bringToFront();
}
function syncMapBFromA(){
  if(mapSyncLock || !map || !mapB) return;
  mapSyncLock = true;
  mapB.setView(map.getCenter(), map.getZoom(), { animate: false });
  mapSyncLock = false;
}
function syncMapAFromB(){
  if(mapSyncLock || !map || !mapB) return;
  mapSyncLock = true;
  map.setView(mapB.getCenter(), mapB.getZoom(), { animate: false });
  mapSyncLock = false;
}
function destroyMapB(){
  clearDualPaneOverlays();
  if(mrmsOverlayLayerB && mapB){
    mapB.removeLayer(mrmsOverlayLayerB);
    mrmsOverlayLayerB = null;
    mrmsFrameIdxB = -1;
    mrmsWmsLayerKeyB = '';
  }
  if(!mapB) return;
  if(map) map.off('moveend', syncMapBFromA);
  mapB.off('moveend', syncMapAFromB);
  mapB.remove();
  mapB = null;
  mapBMarker = null;
  basemapLayerB = null;
  iemOverlayLayersB = [null, null];
  iemSlotFrameB = [-1, -1];
  iemOverlaySlotB = 0;
}
function initMapB(){
  const loc = state.locations[state.active];
  if(!loc || !radarDualOn || !dualPaneAvailable()) return;
  if(mapB){
    mapB.setView([loc.lat, loc.lon], map ? map.getZoom() : RADAR_ZOOM.default);
    if(mapBMarker) mapBMarker.setLatLng([loc.lat, loc.lon]);
    syncMapBBasemap();
    showDualPaneFrame(radarIdx);
    return;
  }
  mapB = L.map('radarB', {
    zoomControl: false,
    minZoom: RADAR_ZOOM.min,
    maxZoom: radarMaxZoom(),
    attributionControl: false
  }).setView([loc.lat, loc.lon], map ? map.getZoom() : RADAR_ZOOM.default);
  syncMapBBasemap();
  mapBMarker = L.circleMarker([loc.lat, loc.lon], markerStyle()).addTo(mapB);
  if(map){
    map.on('moveend', syncMapBFromA);
    mapB.on('moveend', syncMapAFromB);
  }
  showDualPaneFrame(radarIdx);
}
function dualPaneSecondarySuffix(frameIdx){
  const secMode = dualPaneSecondaryMode();
  if(!secMode || !IEM_TILES[secMode]) return '900913';
  if(IEM_TILES[secMode].velocity) return '0';
  const src = (radarMode === 'iem-n0u' && iemReflectFrames.length) ? iemReflectFrames : iemFrames;
  const raw = src[frameIdx] ?? src[src.length - 1] ?? '900913';
  return raw === '0' ? '900913' : raw;
}
function showDualPaneFrame(i){
  if(!mapB || !radarDualOn || !dualPaneAvailable()) return;
  const secMode = dualPaneSecondaryMode();
  if(!secMode) return;
  if(secMode === 'mrms-bref' || secMode === 'mrms-bvel'){
    if(secMode === 'mrms-bvel' && !mrmsVelocityLayerName()) return;
    hidePingPongLayers(iemOverlayLayersB);
    const frameIdx = radarIdx;
    showDualPaneMrmsFrame(frameIdx, secMode === 'mrms-bref' ? 'bref' : 'bvel');
    if(basemapLayerB) basemapLayerB.bringToBack();
    if(mapBMarker) mapBMarker.bringToFront();
    return;
  }
  if(!IEM_TILES[secMode]) return;
  if(IEM_TILES[secMode].velocity && !iemVelocitySite) return;
  const frameIdx = i;
  const suffix = dualPaneSecondarySuffix(frameIdx);
  const name = iemLayerName(secMode, suffix);
  if(!name) return;
  hidePingPongLayers(iemOverlayLayersB);
  const url = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/' + name + '/{z}/{x}/{y}.png';
  const err = IEM_TILES[secMode].velocity ? onIemTileError : null;
  iemOverlaySlotB = showPingPongFrame(iemOverlayLayersB, iemSlotFrameB, iemOverlaySlotB, frameIdx, url, 0.78, err, IEM_TILE_OPTS, mapB);
  if(basemapLayerB) basemapLayerB.bringToBack();
  if(mapBMarker) mapBMarker.bringToFront();
}
function syncRadarDualUi(){
  const btn = $('radarDualBtn');
  const paneB = $('radarPaneB');
  const panes = $('radarPanes');
  const lblA = $('radarPaneLblA');
  const lblB = $('radarPaneLblB');
  const avail = dualPaneAvailable();
  if(btn){
    btn.hidden = !avail;
    btn.classList.toggle('on', radarDualOn && avail);
    btn.title = avail ? '' : 'Dual pane needs IEM NEXRAD or MRMS (US locations only)';
  }
  if(!avail) radarDualOn = false;
  if(panes) panes.classList.toggle('dual-pane', radarDualOn && avail);
  if(lblA){
    lblA.textContent = dualPanePrimaryLabel();
    lblA.hidden = !(radarDualOn && avail);
  }
  if(lblB){
    lblB.textContent = dualPaneSecondaryLabel();
  }
  if(paneB) paneB.hidden = !(radarDualOn && avail);
  if(radarDualOn && avail) initMapB();
  else destroyMapB();
  refreshRadarMapSize();
}
function activateRadarPanel(){
  const loc = state.locations[state.active];
  if(!loc) return;
  initMap(loc);
  refreshRadarMapSize();
  loadRadar();
  updateRadarLegend();
  syncRadarVelToggle();
  syncRadarSiteBtn();
  if(radarLightningOn) setLightningOverlay(true);
  if(typeof radarWindOn !== 'undefined' && radarWindOn) setWindOverlay(true);
  syncAlertPolygons(stormState.alertFeatures.filter(f => f.geometry));
  syncStormReportMarkers();
}
function initMap(loc){
  if(map){
    map.setView([loc.lat, loc.lon], Math.min(map.getZoom(), radarMaxZoom()));
    applyRadarZoomLimits();
    if(mapMarker) mapMarker.setLatLng([loc.lat, loc.lon]);
    else mapMarker = L.circleMarker([loc.lat, loc.lon], markerStyle()).addTo(map);
    syncAlertPolygons(stormState.alertFeatures.filter(f => f.geometry));
    if(radarLightningOn) setLightningOverlay(true);
    if(typeof radarWindOn !== 'undefined' && radarWindOn) setWindOverlay(true);
    return;
  }
  map = L.map('radar', {
    zoomControl: false,
    minZoom: RADAR_ZOOM.min,
    maxZoom: radarMaxZoom(),
    attributionControl: true
  }).setView([loc.lat, loc.lon], RADAR_ZOOM.default);
  L.control.zoom({ position: 'topleft' }).addTo(map);
  map.on('zoomend', () => {
    const maxZ = radarMaxZoom();
    if(map.getZoom() > maxZ) map.setZoom(maxZ);
  });
  syncMapBasemap();
  mapMarker = L.circleMarker([loc.lat, loc.lon], markerStyle()).addTo(map);
}
function centerRadarMap(){
  if(!map) return;
  const loc = state.locations[state.active];
  if(!loc) return;
  map.setView([loc.lat, loc.lon], map.getZoom(), { animate: true });
  if(mapMarker) mapMarker.setLatLng([loc.lat, loc.lon]);
}
function parseStormReportTimeUtc(timeStr){
  const m = String(timeStr || '').match(/(\d{4})/);
  if(!m) return null;
  const hh = parseInt(m[1].slice(0, 2), 10);
  const mm = parseInt(m[1].slice(2, 4), 10);
  if(hh > 23 || mm > 59) return null;
  const now = new Date();
  let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0);
  if(t > Date.now() + 1800000) t -= 86400000;
  return t;
}
function findRadarFrameForTime(targetMs){
  if(radarMode === 'rainviewer' && radarFrames.length){
    let best = 0, bestDiff = Infinity;
    radarFrames.forEach((f, i) => {
      const diff = Math.abs(f.time * 1000 - targetMs);
      if(diff < bestDiff){ bestDiff = diff; best = i; }
    });
    return best;
  }
  if(IEM_TILES[radarMode] && iemFrames.length){
    const minsAgo = Math.max(0, (Date.now() - targetMs) / 60000);
    let best = 0, bestDiff = Infinity;
    IEM_MINS.forEach((m, i) => {
      const diff = Math.abs(m - minsAgo);
      if(diff < bestDiff){ bestDiff = diff; best = i; }
    });
    return best;
  }
  if(radarMode === 'mrms' && mrmsFrames.length){
    let best = 0, bestDiff = Infinity;
    mrmsFrames.forEach((iso, i) => {
      const diff = Math.abs(Date.parse(iso) - targetMs);
      if(diff < bestDiff){ bestDiff = diff; best = i; }
    });
    return best;
  }
  return null;
}
function jumpRadarToStormReport(r){
  if(!r || r.lat == null || r.lon == null) return;
  if(!threatLayerOpts.stormReports){
    threatLayerOpts.stormReports = true;
    const inp = document.querySelector('[data-threat="stormReports"]');
    if(inp) inp.checked = true;
    saveLocRadarPrefs();
  }
  setAppTab('radar');
  const run = () => {
    if(!map) return;
    const z = Math.min(Math.max(map.getZoom(), radarMode === 'mrms' ? 8 : 9), radarMaxZoom());
    map.setView([r.lat, r.lon], z, { animate: true });
    const tMs = parseStormReportTimeUtc(r.time);
    const fi = tMs != null ? findRadarFrameForTime(tMs) : null;
    if(fi != null && radarFrameCount() > 1){
      stopRadarTimer();
      showFrame(fi);
    }
    syncStormReportMarkers();
    if(stormReportGroup){
      stormReportGroup.eachLayer(m => {
        const ll = m.getLatLng();
        if(Math.abs(ll.lat - r.lat) < 0.02 && Math.abs(ll.lng - r.lon) < 0.02) m.openPopup();
      });
    }
  };
  if(map) setTimeout(run, 120);
  else setTimeout(run, 500);
}
function jumpRadarToAlertPolygon(target, layerKey){
  if(!target || target.lat == null || target.lon == null) return;
  if(layerKey && !threatLayerOpts[layerKey]){
    threatLayerOpts[layerKey] = true;
    const inp = document.querySelector('[data-threat="' + layerKey + '"]');
    if(inp) inp.checked = true;
    saveLocRadarPrefs();
  }
  setAppTab('radar');
  const run = () => {
    if(!map) return;
    const feats = (stormState.alertFeatures || []).filter(f => f.geometry);
    syncAlertPolygons(feats);
    const z = Math.min(Math.max(map.getZoom(), 8), radarMaxZoom());
    map.setView([target.lat, target.lon], z, { animate: true });
    if(alertLayerGroup){
      alertLayerGroup.eachLayer(layer => {
        const bounds = layer.getBounds && layer.getBounds();
        if(!bounds) return;
        const c = bounds.getCenter();
        if(Math.abs(c.lat - target.lat) < 0.15 && Math.abs(c.lng - target.lon) < 0.15) layer.openPopup();
      });
    }
  };
  if(map) setTimeout(run, 120);
  else setTimeout(run, 500);
}
function jumpRadarToWarningPolygon(target){
  jumpRadarToAlertPolygon(target, 'warnings');
}
function jumpRadarToWatchPolygon(target){
  jumpRadarToAlertPolygon(target, 'watches');
}
function mrmsOpengeoSiteId(){
  if(mrmsVelocitySite) return mrmsVelocitySite;
  const rs = state.data?.nwsPoints?.radarStation;
  if(rs) return rs.replace(/^K/i, '').toUpperCase();
  return iemVelocitySite || null;
}
function mrmsVelocityLayerName(){
  const site = mrmsOpengeoSiteId();
  if(!site) return null;
  const id = site.toLowerCase();
  return id + ':' + id + '_sr_bvel';
}
function mrmsWmsConfigForProduct(product){
  if(product === 'bvel'){
    const layers = mrmsVelocityLayerName();
    if(!layers) return null;
    return { url: MRMS_GEOSERVER_OWS, layers, styles: 'radar_velocity' };
  }
  return { url: MRMS_BREF_WMS_URL, layers: 'conus_bref_qcd', styles: '' };
}
function mrmsWmsConfig(){
  return mrmsWmsConfigForProduct(mrmsProduct);
}
function ensureMrmsWmsLayerB(product){
  if(!mapB) return null;
  const cfg = mrmsWmsConfigForProduct(product);
  if(!cfg) return null;
  const key = cfg.url + '|' + cfg.layers + '|' + cfg.styles;
  if(mrmsOverlayLayerB && mrmsWmsLayerKeyB && mrmsWmsLayerKeyB !== key){
    if(mapB.hasLayer(mrmsOverlayLayerB)) mapB.removeLayer(mrmsOverlayLayerB);
    mrmsOverlayLayerB = null;
  }
  mrmsWmsLayerKeyB = key;
  if(!mrmsOverlayLayerB){
    mrmsOverlayLayerB = L.tileLayer.wms(cfg.url, {
      layers: cfg.layers,
      styles: cfg.styles || '',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      time: mrmsFrames[0] || '',
      opacity: 0.78,
      ...MRMS_TILE_OPTS
    });
    mrmsOverlayLayerB.addTo(mapB);
  }else if(!mapB.hasLayer(mrmsOverlayLayerB)){
    mrmsOverlayLayerB.addTo(mapB);
  }
  return mrmsOverlayLayerB;
}
function showDualPaneMrmsFrame(frameIdx, product){
  const layer = ensureMrmsWmsLayerB(product);
  if(!layer || !mrmsFrames.length) return;
  const timeIso = mrmsFrames[frameIdx] ?? mrmsFrames[mrmsFrames.length - 1];
  if(mrmsFrameIdxB === frameIdx && layer.wmsParams?.time === timeIso) return;
  mrmsFrameIdxB = frameIdx;
  layer.setOpacity(0.78);
  layer.setParams({ time: timeIso }, false);
}
function ensureMrmsWmsLayer(slot){
  if(!map) return null;
  const cfg = mrmsWmsConfig();
  if(!cfg) return null;
  const key = cfg.url + '|' + cfg.layers + '|' + cfg.styles;
  if(mrmsOverlayLayers[slot] && mrmsWmsLayerKey && mrmsWmsLayerKey !== key){
    if(map.hasLayer(mrmsOverlayLayers[slot])) map.removeLayer(mrmsOverlayLayers[slot]);
    mrmsOverlayLayers[slot] = null;
  }
  mrmsWmsLayerKey = key;
  if(!mrmsOverlayLayers[slot]){
    mrmsOverlayLayers[slot] = L.tileLayer.wms(cfg.url, {
      layers: cfg.layers,
      styles: cfg.styles || '',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      time: mrmsFrames[0] || '',
      opacity: 0,
      ...MRMS_TILE_OPTS
    });
    mrmsOverlayLayers[slot].addTo(map);
  }else if(!map.hasLayer(mrmsOverlayLayers[slot])){
    mrmsOverlayLayers[slot].addTo(map);
  }
  return mrmsOverlayLayers[slot];
}
function loadMrmsPingPongFrame(slot, frameIdx, timeIso, showWhenReady){
  const layer = ensureMrmsWmsLayer(slot);
  if(!layer) return;
  if(mrmsSlotFrame[slot] === frameIdx && layer.wmsParams?.time === timeIso){
    if(showWhenReady) swapOverlaySlot(mrmsOverlayLayers, slot, 0.78);
    return;
  }
  mrmsSlotFrame[slot] = frameIdx;
  if(showWhenReady){
    let done = false;
    const finish = () => {
      if(done) return;
      done = true;
      swapOverlaySlot(mrmsOverlayLayers, slot, 0.78);
    };
    layer.once('load', finish);
    layer.once('tileerror', finish);
    layer.setOpacity(0);
    layer.setParams({ time: timeIso }, false);
    return;
  }
  layer.setOpacity(0);
  layer.setParams({ time: timeIso }, false);
}
function showMrmsPingPongFrame(frameIdx, timeIso){
  if(mrmsSlotFrame[mrmsOverlaySlot] === frameIdx){
    swapOverlaySlot(mrmsOverlayLayers, mrmsOverlaySlot, 0.78);
    return mrmsOverlaySlot;
  }
  const inactive = 1 - mrmsOverlaySlot;
  if(mrmsSlotFrame[inactive] === frameIdx){
    swapOverlaySlot(mrmsOverlayLayers, inactive, 0.78);
    return inactive;
  }
  loadMrmsPingPongFrame(inactive, frameIdx, timeIso, true);
  return inactive;
}
function preloadMrmsPingPongFrame(frameIdx, timeIso){
  const preloadSlot = 1 - mrmsOverlaySlot;
  if(mrmsSlotFrame[preloadSlot] === frameIdx) return;
  loadMrmsPingPongFrame(preloadSlot, frameIdx, timeIso, false);
}
function mrmsStrideMin(){
  const loc = state.locations[state.active];
  const raw = loc?.radarPrefs?.mrmsStride ?? store.get('st_mrms_stride');
  const v = Number(raw) || MRMS_STRIDE_DEFAULT;
  return MRMS_STRIDE_OPTS.includes(v) ? v : MRMS_STRIDE_DEFAULT;
}
function mrmsMaxFrames(strideMin){
  if(strideMin <= 2) return 60;
  if(strideMin <= 5) return 30;
  return 18;
}
function syncMrmsStrideUi(){
  const sel = $('radarMrmsStride');
  if(!sel) return;
  const show = radarMode === 'mrms' && mrmsFrames.length > 1;
  sel.hidden = !show;
  if(show) sel.value = String(mrmsStrideMin());
}
function resetMrmsPingPongSlots(){
  mrmsSlotFrame = [-1, -1];
  mrmsOverlaySlot = 0;
}
function parseMrmsTimesFromCapabilities(xml, layerName){
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if(layerName){
    const layers = doc.querySelectorAll('Layer');
    for(const layer of layers){
      const nameEl = layer.querySelector(':scope > Name');
      if(!nameEl || nameEl.textContent !== layerName) continue;
      const dim = layer.querySelector('Dimension[name="time"]');
      if(dim?.textContent){
        return dim.textContent.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return null;
  }
  const dim = doc.querySelector('Dimension[name="time"]');
  if(!dim || !dim.textContent) return null;
  return dim.textContent.split(',').map(s => s.trim()).filter(Boolean);
}
function pickMrmsFrames(allTimes, strideMin){
  if(!allTimes?.length) return [];
  const sMin = Number(strideMin);
  const stride = MRMS_STRIDE_OPTS.includes(sMin) ? sMin : mrmsStrideMin();
  const strideMs = stride * 60 * 1000;
  const maxFrames = mrmsMaxFrames(stride);
  const parsed = allTimes.map(iso => ({ iso, ms: Date.parse(iso) })).filter(p => !isNaN(p.ms));
  if(parsed.length < 2) return allTimes;
  const newest = parsed[parsed.length - 1].ms;
  const oldest = parsed[0].ms;
  const out = [];
  for(let target = oldest; target <= newest + 1 && out.length < maxFrames; target += strideMs){
    let best = parsed[0], bestD = Infinity;
    for(const p of parsed){
      const d = Math.abs(p.ms - target);
      if(d < bestD){ bestD = d; best = p; }
    }
    if(!out.length || out[out.length - 1] !== best.iso) out.push(best.iso);
  }
  const last = parsed[parsed.length - 1].iso;
  if(!out.length || out[out.length - 1] !== last) out.push(last);
  return out.slice(-maxFrames);
}
async function fetchMrmsRawTimes(loadId){
  const bvel = mrmsProduct === 'bvel';
  const layerName = bvel ? mrmsVelocityLayerName() : null;
  const capUrl = bvel ? MRMS_GEOSERVER_OWS : MRMS_BREF_WMS_URL;
  if(bvel && !layerName) throw new Error('no MRMS velocity site');
  const r = await fetch(capUrl + '?service=WMS&version=1.3.0&request=GetCapabilities');
  if(loadId !== radarLoadId) return null;
  if(!r.ok) throw new Error('MRMS capabilities ' + r.status);
  return parseMrmsTimesFromCapabilities(await r.text(), layerName);
}
async function fetchMrmsFrameTimes(loadId, strideMin){
  const times = await fetchMrmsRawTimes(loadId);
  if(!times?.length) throw new Error('no MRMS frames');
  mrmsAllTimes = times;
  return pickMrmsFrames(times, strideMin ?? mrmsStrideMin());
}
function mrmsFrameIndexForIso(iso, preferLatest){
  if(!mrmsFrames.length) return 0;
  if(preferLatest) return mrmsFrames.length - 1;
  if(!iso) return mrmsFrames.length - 1;
  const exact = mrmsFrames.indexOf(iso);
  if(exact >= 0) return exact;
  const pms = Date.parse(iso);
  if(isNaN(pms)) return mrmsFrames.length - 1;
  let best = 0, bestD = Infinity;
  mrmsFrames.forEach((t, i) => {
    const d = Math.abs(Date.parse(t) - pms);
    if(d < bestD){ bestD = d; best = i; }
  });
  return best;
}
async function refreshMrmsFrames(opts){
  if(radarMode !== 'mrms' || mrmsRefreshBusy) return;
  const loadId = radarLoadId;
  mrmsRefreshBusy = true;
  try{
    const stride = mrmsStrideMin();
    let times;
    if(opts?.repickOnly && mrmsAllTimes.length){
      times = pickMrmsFrames(mrmsAllTimes, stride);
    }else{
      times = await fetchMrmsFrameTimes(loadId, stride);
    }
    if(loadId !== radarLoadId || radarMode !== 'mrms' || !times?.length) return;
    const prevIso = mrmsFrames[radarIdx];
    mrmsFrames = times;
    resetMrmsPingPongSlots();
    $('radarScrub').max = Math.max(0, mrmsFrames.length - 1);
    radarIdx = opts?.restart ? 0 : mrmsFrameIndexForIso(prevIso, !!opts?.toLive);
    $('radarScrub').value = radarIdx;
    $('radarNote').textContent = mrmsNoteText();
    setRadarAnimControls(mrmsFrames.length > 1);
    showFrame(radarIdx);
  }catch(e){
    console.warn('mrmsRefresh', e);
  }finally{
    mrmsRefreshBusy = false;
  }
}
function mrmsLoopMinutes(){
  if(mrmsFrames.length < 2) return 0;
  return Math.max(1, Math.round((Date.parse(mrmsFrames[mrmsFrames.length - 1]) - Date.parse(mrmsFrames[0])) / 60000));
}
function mrmsNoteText(){
  const mins = mrmsLoopMinutes();
  const site = mrmsOpengeoSiteId();
  if(mrmsProduct === 'bvel'){
    if(mrmsFrames.length < 2) return 'NOAA MRMS velocity \u00B7 ' + (site || 'site');
    return 'NOAA MRMS velocity \u00B7 ' + (site || 'site') + ' \u00B7 last ' + mins + ' min \u00B7 '
      + mrmsStrideMin() + ' min frames';
  }
  if(mrmsFrames.length < 2) return 'NOAA MRMS composite reflectivity \u00B7 CONUS';
  return 'NOAA MRMS composite \u00B7 last ' + mins + ' min \u00B7 '
    + mrmsStrideMin() + ' min frames \u00B7 CONUS';
}
function formatMrmsFrameTime(iso, isLatest){
  const t = new Date(iso);
  const s = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return isLatest ? 'Live \u00B7 ' + s : s;
}
function toggleRadarExpand(){
  const stage = $('radarStage');
  const btn = $('radarExpandBtn');
  if(!stage || !btn) return;
  const on = stage.classList.toggle('expanded');
  document.body.classList.toggle('radar-expanded', on);
  btn.textContent = on ? 'Close' : 'Expand';
  btn.setAttribute('aria-label', on ? 'Close expanded radar' : 'Expand radar fullscreen');
  if(!on) clearExpandedRadarLayout();
  refreshRadarMapSize();
  setTimeout(refreshRadarMapSize, 80);
  setTimeout(refreshRadarMapSize, 280);
}
async function loadMrmsRadar(loadId){
  clearRadarLayers();
  stopRadarTimer();
  radarSatOn = false;
  $('radarSat').classList.remove('on');
  if(!radarDualOn) iemVelocitySite = null;
  iemFrames = radarDualOn ? ['0'] : [];
  mrmsFrames = [];
  mrmsAllTimes = [];
  mrmsWmsLayerKey = '';
  $('radarTime').textContent = 'Loading\u2026';
  const loadingNote = mrmsProduct === 'bvel'
    ? 'NOAA MRMS velocity \u00B7 resolving site\u2026'
    : 'NOAA MRMS composite \u00B7 loading frames\u2026';
  $('radarNote').textContent = loadingNote;
  if(mrmsProduct === 'bvel'){
    mrmsVelocitySite = await resolveIemVelocitySite();
    if(loadId !== radarLoadId) return;
    if(!mrmsVelocityLayerName()){
      mrmsProduct = 'bref';
      saveLocRadarPrefs();
      syncRadarVelToggle();
      updateRadarLegend();
    }
  }else{
    mrmsVelocitySite = null;
  }
  try{
    const frames = await fetchMrmsFrameTimes(loadId, mrmsStrideMin());
    if(loadId !== radarLoadId) return;
    if(!frames || !frames.length) throw new Error('no MRMS frames');
    mrmsFrames = frames;
  }catch(e){
    if(loadId !== radarLoadId) return;
    if(mrmsProduct === 'bvel'){
      mrmsProduct = 'bref';
      mrmsVelocitySite = null;
      saveLocRadarPrefs();
      syncRadarVelToggle();
      updateRadarLegend();
      setPanelUnavail($('radarNote'), 'radar_vel_unavail');
      $('radarTime').textContent = 'Velocity unavailable';
      console.warn('mrms velocity', e);
      return loadMrmsRadar(loadId);
    }
    setPanelUnavail($('radarNote'), 'mrms_api');
    $('radarTime').textContent = 'MRMS unavailable';
    console.error('mrms', e);
    return;
  }
  setRadarAnimControls(mrmsFrames.length > 1);
  syncMrmsStrideUi();
  syncRadarVelToggle();
  syncRadarSiteBtn();
  radarIdx = mrmsFrames.length - 1;
  $('radarScrub').max = Math.max(0, mrmsFrames.length - 1);
  $('radarScrub').value = radarIdx;
  $('radarNote').textContent = mrmsNoteText();
  updateRadarLegend();
  applyRadarZoomLimits();
  showFrame(radarIdx);
  syncStormReportMarkers();
  applyPendingRadarFrame();
  updateRadarHash();
  syncRadarDualUi();
  if(radarDualOn){
    ensureDualPaneVelocitySite().then(ok => {
      if(loadId !== radarLoadId) return;
      if(ok) showDualPaneFrame(radarIdx);
      else{
        radarDualOn = false;
        syncRadarDualUi();
        setPanelUnavail($('radarNote'), 'radar_vel_site');
      }
    });
  }
}
function setRadarAnimControls(visible){
  $('radarAnimCtl').classList.toggle('hidden', !visible || isLiveOnlyRadar());
  const satBtn = $('radarSat');
  if(satBtn) satBtn.style.display = radarMode === 'rainviewer' ? '' : 'none';
  syncMrmsStrideUi();
  syncRadarVelToggle();
  if(!visible) stopRadarTimer();
}
function iemLayerName(mode, suffix){
  const spec = IEM_TILES[mode];
  if(!spec) return null;
  if(spec.velocity){
    if(!iemVelocitySite) return null;
    return 'ridge::' + iemVelocitySite + '-N0U-0';
  }
  return 'nexrad-' + spec.product + '-' + suffix;
}
async function resolveIemVelocitySite(){
  const rs = state.data && state.data.nwsPoints && state.data.nwsPoints.radarStation;
  if(rs) return rs.replace(/^K/i, '').toUpperCase();
  const loc = state.locations[state.active];
  if(!loc || !isLikelyUS(loc)) return null;
  try{
    const r = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
    if(!r.ok) return null;
    const props = (await r.json()).properties;
    return props && props.radarStation ? props.radarStation.replace(/^K/i, '').toUpperCase() : null;
  }catch(e){ return null; }
}
function onIemTileError(){
  if(radarMode !== 'iem-n0u' || !iemVelocitySite) return;
  radarMode = 'iem-n0q';
  iemVelocitySite = null;
  saveLocRadarPrefs();
  $('radarMode').value = radarMode;
  setPanelUnavail($('radarNote'), 'radar_vel_unavail');
  stopRadarTimer();
  loadIemRadar('iem-n0q');
}
function updateRadarLegend(){
  const leg = $('radarLegend') || document.querySelector('.radar-legend');
  if(!leg) return;
  const vel = (IEM_TILES[radarMode] && IEM_TILES[radarMode].velocity)
    || (radarMode === 'mrms' && mrmsProduct === 'bvel');
  leg.innerHTML = vel
    ? '<div>Velocity</div><div class="bar" style="background:linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00,#f0f)"></div><div style="display:flex;justify-content:space-between;margin-top:2px"><span>In</span><span>0</span><span>Out</span></div>'
    : '<div>Reflectivity (dBZ)</div><div class="bar"></div><div style="display:flex;justify-content:space-between;margin-top:2px"><span>5</span><span>35</span><span>65+</span></div>';
  if(typeof syncOverlayLegends === 'function') syncOverlayLegends();
}
function radarFrameCount(){
  if(radarMode === 'rainviewer') return radarFrames.length;
  if(radarMode === 'mrms') return mrmsFrames.length;
  if(radarMode === 'iem-n0u' && radarDualOn && iemReflectFrames.length) return iemReflectFrames.length;
  return iemFrames.length;
}
function hideGoesSatellite(){
  if(goesSatLayer && map && map.hasLayer(goesSatLayer)) map.removeLayer(goesSatLayer);
}
function ensureGoesSatLayer(){
  if(!map) return null;
  if(!goesSatLayer){
    goesSatLayer = L.tileLayer('https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/goes_east_conus_ch13/{z}/{x}/{y}.png', {
      opacity: 0.55,
      maxNativeZoom: 9,
      maxZoom: RADAR_ZOOM.rainviewer,
      zIndex: 440,
      attribution: 'IEM / NOAA GOES-East IR'
    });
  }
  return goesSatLayer;
}
function applySatelliteOverlay(frameIdx){
  if(!map || radarMode !== 'rainviewer' || !radarSatOn){
    hidePingPongLayers(satOverlayLayers);
    hideGoesSatellite();
    return;
  }
  if(satFrames.length){
    hideGoesSatellite();
    const si = Math.min(Math.floor(frameIdx / Math.max(1, radarFrames.length) * satFrames.length), satFrames.length - 1);
    const f = satFrames[si];
    if(f){
      const url = radarHost + f.path + '/256/{z}/{x}/{y}/2/1_1.png';
      satOverlaySlot = showPingPongFrame(satOverlayLayers, satSlotFrame, satOverlaySlot, si, url, 0.45, onRainviewerTileError, SAT_TILE_OPTS);
      const nextSi = (si + 1) % satFrames.length;
      const nf = satFrames[nextSi];
      if(nf) preloadPingPongFrame(satOverlayLayers, satSlotFrame, satOverlaySlot, nextSi, radarHost + nf.path + '/256/{z}/{x}/{y}/2/1_1.png', onRainviewerTileError, SAT_TILE_OPTS);
    }
    return;
  }
  hidePingPongLayers(satOverlayLayers);
  const goes = ensureGoesSatLayer();
  if(goes && !map.hasLayer(goes)) goes.addTo(map);
  if(goes) goes.setOpacity(0.55);
}
function rainviewerCoverageNote(){
  if(!radarFrames.length) return 'RainViewer';
  const past = radarFrames.slice(0, rvPastCount);
  const fc = radarFrames.slice(rvPastCount);
  const parts = ['RainViewer'];
  if(past.length >= 2){
    const mins = Math.round((past[past.length - 1].time - past[0].time) / 60);
    if(mins > 0) parts.push('past ' + mins + ' min');
  } else if(past.length) parts.push('recent radar');
  if(fc.length >= 2){
    const fm = Math.round((fc[fc.length - 1].time - fc[0].time) / 60);
    parts.push((fm > 0 ? fm + ' min ' : '') + 'nowcast');
  } else if(fc.length) parts.push('nowcast');
  return parts.join(' \u00B7 ');
}
function radarNoteForMode(){
  if(radarMode === 'mrms') return mrmsNoteText();
  const spec = IEM_TILES[radarMode];
  if(spec){
    if(spec.velocity && iemVelocitySite){
      return spec.label + ' \u00B7 ' + iemVelocitySite + ' \u00B7 live \u00B7 Iowa Environmental Mesonet';
    }
    return spec.label + ' \u00B7 last 50 min \u00B7 Iowa Environmental Mesonet';
  }
  if(radarSatOn){
    return satFrames.length
      ? 'RainViewer \u00B7 radar + synced satellite IR'
      : 'RainViewer radar + GOES-East IR (IEM) \u00B7 CONUS';
  }
  return rainviewerCoverageNote();
}
function loadIemRadar(mode){
  const gen = ++iemLoadGen;
  clearRadarLayers();
  stopRadarTimer();
  radarSatOn = false;
  $('radarSat').classList.remove('on');
  iemVelocitySite = null;
  iemFrames = [];
  radarIdx = 0;
  $('radarScrub').max = 0;
  $('radarScrub').value = 0;
  hidePingPongLayers(iemOverlayLayers);

  const spec = IEM_TILES[mode];
  if(spec && spec.velocity){
    $('radarTime').textContent = 'Loading velocity\u2026';
    $('radarNote').textContent = 'Resolving nearest NEXRAD site\u2026';
    setRadarAnimControls(false);
    return resolveIemVelocitySite().then(site => {
      if(gen !== iemLoadGen) return;
      if(!site){
        setPanelUnavail($('radarNote'), 'radar_vel_site');
        radarMode = 'iem-n0q';
        saveLocRadarPrefs();
        $('radarMode').value = radarMode;
        return loadIemRadar('iem-n0q');
      }
      iemVelocitySite = site;
      iemFrames = ['0'];
      iemReflectFrames = radarDualOn ? IEM_SUFFIXES.slice() : [];
      finishIemRadarLoad(mode);
    });
  }
  iemFrames = IEM_SUFFIXES.slice();
  iemReflectFrames = [];
  finishIemRadarLoad(mode);
}
function finishIemRadarLoad(mode){
  const spec = IEM_TILES[mode];
  const velDual = !!(spec?.velocity && radarDualOn && iemReflectFrames.length);
  setRadarAnimControls(velDual || !spec?.velocity);
  if(velDual){
    radarIdx = iemReflectFrames.length - 1;
    $('radarScrub').max = Math.max(0, iemReflectFrames.length - 1);
  }else if(spec?.velocity){
    radarIdx = 0;
    $('radarScrub').max = 0;
  }else{
    radarIdx = iemFrames.length - 1;
    $('radarScrub').max = Math.max(0, iemFrames.length - 1);
  }
  $('radarScrub').value = radarIdx;
  const note = $('radarNote');
  if(note) note.textContent = radarNoteForMode();
  updateRadarLegend();
  showFrame(radarIdx);
  applyRadarZoomLimits();
  syncStormReportMarkers();
  applyPendingRadarFrame();
  updateRadarHash();
  syncRadarDualUi();
}
async function loadRainViewerRadar(loadId){
  radarSatOn = false;
  rainviewerTileErrors = 0;
  $('radarSat').classList.remove('on');
  const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if(loadId !== radarLoadId) return;
  if(!r.ok) throw new Error('rainviewer_api');
  const j = await r.json();
  setRadarAnimControls(true);
  radarHost = j.host;
  const past = (j.radar.past || []).slice(-8);
  const nowcast = (j.radar.nowcast || []).slice(0, 3);
  rvPastCount = past.length;
  radarFrames = [...past, ...nowcast];
  satFrames = (j.satellite && j.satellite.infrared) ? j.satellite.infrared.slice(-3) : [];
  if(!radarFrames.length) throw new Error('no RainViewer frames');
  radarIdx = Math.max(0, past.length - 1);
  $('radarScrub').max = Math.max(0, radarFrames.length - 1);
  $('radarScrub').value = radarIdx;
  $('radarNote').textContent = radarNoteForMode();
  showFrame(radarIdx);
  applyRadarZoomLimits();
  syncStormReportMarkers();
  applyPendingRadarFrame();
  updateRadarHash();
}
async function loadRadar(){
  return panelTask('radarPanel', 'radarStatus', async () => {
    if(!map) return;
    const loadId = ++radarLoadId;
    primeRadarLoad();
    try{
      if(radarMode === 'rainviewer') await loadRainViewerRadar(loadId);
      else if(radarMode === 'mrms'){
        if(loadId !== radarLoadId) return;
        await loadMrmsRadar(loadId);
      }
      else if(IEM_TILES[radarMode]){
        if(loadId !== radarLoadId) return;
        await loadIemRadar(radarMode);
      }
    }catch(e){
      if(loadId !== radarLoadId) return;
      $('radarTime').textContent = 'Radar unavailable';
      const code = (radarMode === 'rainviewer' && String(e.message).includes('rainviewer'))
        ? 'rainviewer_api' : 'radar_load';
      setPanelUnavail($('radarNote'), code);
      console.error('radar', e);
    }finally{
      if(loadId === radarLoadId) syncRadarDualUi();
    }
  });
}
function showFrame(i){
  if(!map) return;
  radarIdx = i;
  if(radarMode === 'rainviewer'){
    if(!radarFrames.length) return;
    hidePingPongLayers(iemOverlayLayers);
    const f = radarFrames[i];
    if(f){
      const url = radarHost + f.path + '/256/{z}/{x}/{y}/2/1_1.png';
      radarOverlaySlot = showPingPongFrame(radarOverlayLayers, radarSlotFrame, radarOverlaySlot, i, url, 0.72, onRainviewerTileError, RV_TILE_OPTS);
      const next = (i + 1) % radarFrames.length;
      const nf = radarFrames[next];
      if(nf) preloadPingPongFrame(radarOverlayLayers, radarSlotFrame, radarOverlaySlot, next, radarHost + nf.path + '/256/{z}/{x}/{y}/2/1_1.png', onRainviewerTileError, RV_TILE_OPTS);
      const t = new Date(f.time * 1000);
      const isFuture = i >= rvPastCount && f.time * 1000 > Date.now();
      $('radarTime').textContent = t.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) + (isFuture ? ' (nowcast)' : '');
    }
    applySatelliteOverlay(i);
  }else if(IEM_TILES[radarMode]){
    if(!iemFrames.length) return;
    const mode = radarMode;
    const isVel = IEM_TILES[mode].velocity;
    if(isVel && !iemVelocitySite) return;
    const velDual = isVel && radarDualOn && iemReflectFrames.length;
    const primFrame = isVel ? 0 : i;
    const suffix = iemFrames[isVel ? 0 : i];
    const name = iemLayerName(mode, suffix);
    if(!name) return;
    hidePingPongLayers(radarOverlayLayers);
    hidePingPongLayers(satOverlayLayers);
    hideGoesSatellite();
    const url = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/' + name + '/{z}/{x}/{y}.png';
    const iemErr = isVel ? onIemTileError : null;
    iemOverlaySlot = showPingPongFrame(iemOverlayLayers, iemSlotFrame, iemOverlaySlot, primFrame, url, 0.78, iemErr, IEM_TILE_OPTS);
    if(!isVel){
      const next = (i + 1) % iemFrames.length;
      const ns = iemFrames[next];
      if(ns){
        const nname = iemLayerName(mode, ns);
        preloadPingPongFrame(iemOverlayLayers, iemSlotFrame, iemOverlaySlot, next, 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/' + nname + '/{z}/{x}/{y}.png', iemErr, IEM_TILE_OPTS);
      }
      $('radarTime').textContent = IEM_MINS[i] === 0 ? 'Live \u00B7 now' : IEM_MINS[i] + ' min ago';
    }else if(velDual){
      $('radarTime').textContent = (IEM_MINS[i] === 0 ? 'Reflectivity live' : 'Reflectivity ' + IEM_MINS[i] + ' min ago')
        + ' \u00B7 velocity live';
    }else{
      $('radarTime').textContent = 'Live \u00B7 ' + (iemVelocitySite || 'site');
    }
  }else if(radarMode === 'mrms'){
    if(!mrmsFrames.length) return;
    hidePingPongLayers(radarOverlayLayers);
    hidePingPongLayers(iemOverlayLayers);
    hidePingPongLayers(satOverlayLayers);
    hideGoesSatellite();
    const timeIso = mrmsFrames[i];
    mrmsOverlaySlot = showMrmsPingPongFrame(i, timeIso);
    const next = (i + 1) % mrmsFrames.length;
    if(mrmsFrames[next]) preloadMrmsPingPongFrame(next, mrmsFrames[next]);
    $('radarTime').textContent = formatMrmsFrameTime(timeIso, i === mrmsFrames.length - 1);
    if(radarDualOn){
      const sec = dualPaneSecondaryMode();
      if(sec === 'mrms-bvel') $('radarTime').textContent += ' \u00B7 velocity';
      else if(sec === 'mrms-bref') $('radarTime').textContent += ' \u00B7 reflectivity pane';
      else if(sec === 'iem-n0u') $('radarTime').textContent += ' \u00B7 velocity live';
    }
  }
  if(basemapLayer) basemapLayer.bringToBack();
  bringStormMapLayersFront();
  $('radarScrub').value = i;
  updateRadarStormMark();
  updateRadarHash();
  if(radarDualOn) showDualPaneFrame(i);
}
$('radarMode').value = radarMode;
$('radarMode').addEventListener('change', e => {
  radarMode = e.target.value;
  saveLocRadarPrefs();
  radarLoadId++;
  iemLoadGen++;
  applyRadarZoomLimits();
  updateRadarLegend();
  syncRadarDualUi();
  loadRadar();
});
const radarDualBtn = $('radarDualBtn');
if(radarDualBtn){
  radarDualBtn.addEventListener('click', async () => {
    if(!dualPaneAvailable()) return;
    radarDualOn = !radarDualOn;
    if(radarDualOn){
      const note = $('radarNote');
      if(note && dualPaneSecondaryMode() === 'iem-n0u' && !iemVelocitySite){
        note.textContent = 'Resolving velocity site\u2026';
      }
      const ok = await ensureDualPaneVelocitySite();
      if(note) note.textContent = radarMode === 'mrms' ? mrmsNoteText() : radarNoteForMode();
      if(!ok){
        radarDualOn = false;
        setPanelUnavail($('radarNote'), 'radar_vel_site');
      }else if(radarMode === 'iem-n0u'){
        iemReflectFrames = IEM_SUFFIXES.slice();
        radarIdx = iemReflectFrames.length - 1;
        $('radarScrub').max = Math.max(0, iemReflectFrames.length - 1);
        setRadarAnimControls(true);
      }
    }else if(radarMode === 'iem-n0u'){
      iemReflectFrames = [];
      setRadarAnimControls(false);
      radarIdx = 0;
      $('radarScrub').max = 0;
    }
    saveLocRadarPrefs();
    syncRadarDualUi();
    if(radarDualOn && radarMode === 'iem-n0u' && iemReflectFrames.length) showFrame(radarIdx);
  });
}
$('radarScrub').addEventListener('input', e => {
  stopRadarTimer();
  showFrame(Number(e.target.value));
});
$('radarPlay').addEventListener('click', () => {
  const n = radarFrameCount();
  if(!n) return;
  if(radarTimer){
    stopRadarTimer();
  }else{
    radarTimer = setInterval(() => {
      const count = radarFrameCount();
      if(!count) return;
      if(radarMode === 'mrms' && radarIdx >= count - 1){
        refreshMrmsFrames({ restart: true });
        return;
      }
      radarIdx = (radarIdx + 1) % count;
      showFrame(radarIdx);
    }, 700);
    $('radarPlay').textContent = '\u275A\u275A Pause';
  }
});
const radarMrmsStrideSel = $('radarMrmsStride');
if(radarMrmsStrideSel){
  radarMrmsStrideSel.addEventListener('change', e => {
    if(radarMode !== 'mrms') return;
    const v = Number(e.target.value);
    if(!MRMS_STRIDE_OPTS.includes(v)) return;
    const loc = state.locations[state.active];
    if(loc){
      if(!loc.radarPrefs) loc.radarPrefs = {};
      loc.radarPrefs.mrmsStride = v;
      persist();
    }
    store.set('st_mrms_stride', v);
    stopRadarTimer();
    const repick = mrmsAllTimes.length > 0;
    refreshMrmsFrames({ repickOnly: repick, toLive: true });
  });
}
$('radarSat').addEventListener('click', () => {
  if(radarMode !== 'rainviewer') return;
  radarSatOn = !radarSatOn;
  $('radarSat').classList.toggle('on', radarSatOn);
  $('radarNote').textContent = radarNoteForMode();
  showFrame(radarIdx);
});
$('radarLightning').addEventListener('click', () => {
  setLightningOverlay(!radarLightningOn);
});
$('radarWind')?.addEventListener('click', () => {
  setWindOverlay(!radarWindOn);
});
document.querySelectorAll('[data-threat]').forEach(inp => {
  inp.addEventListener('change', () => {
    const k = inp.getAttribute('data-threat');
    if(!(k in threatLayerOpts)) return;
    threatLayerOpts[k] = inp.checked;
    if(k === 'hmsSmoke' && typeof syncOverlayLegends === 'function') syncOverlayLegends();
    saveThreatLayerPrefs();
    if(typeof updateRadarHash === 'function') updateRadarHash();
    if(k === 'stormReports'){
      syncStormReportMarkers();
    }else if(k === 'warnings' || k === 'watches' || k === 'advisories'){
      syncAlertPolygons(stormState.alertFeatures);
    }else{
      syncThreatOverlays();
    }
  });
});
const radarVelBtn = $('radarVelToggle');
if(radarVelBtn){
  radarVelBtn.addEventListener('click', () => {
    if(radarMode === 'mrms'){
      mrmsProduct = mrmsProduct === 'bvel' ? 'bref' : 'bvel';
      saveLocRadarPrefs();
      radarLoadId++;
      applyRadarZoomLimits();
      updateRadarLegend();
      syncRadarVelToggle();
      syncRadarSiteBtn();
      syncRadarDualUi();
      loadRadar();
      return;
    }
    radarMode = (radarMode === 'iem-n0u') ? 'iem-n0q' : 'iem-n0u';
    saveLocRadarPrefs();
    $('radarMode').value = radarMode;
    radarLoadId++;
    iemLoadGen++;
    applyRadarZoomLimits();
    updateRadarLegend();
    syncRadarVelToggle();
    syncRadarSiteBtn();
    syncRadarDualUi();
    loadRadar();
  });
}
const radarSiteBtn = $('radarSiteBtn');
if(radarSiteBtn){
  radarSiteBtn.addEventListener('click', () => {
    if(radarMode !== 'mrms' || !isChaseRadarMode()) return;
    radarMode = 'iem-n0q';
    saveLocRadarPrefs();
    $('radarMode').value = radarMode;
    radarLoadId++;
    iemLoadGen++;
    applyRadarZoomLimits();
    updateRadarLegend();
    syncRadarVelToggle();
    syncRadarSiteBtn();
    syncRadarDualUi();
    loadRadar();
  });
}
loadThreatLayerPrefs();

function updateRadarStormMark(){
  const mark = $('radarStormMark'), scrub = $('radarScrub');
  if(!mark || !scrub || !stormState.severeWindow || !state.data){
    if(mark) mark.hidden = true;
    return;
  }
  const winStart = stormState.severeWindow.start;
  const winEnd = stormState.severeWindow.end;
  const n = radarFrameCount();
  if(!n){ mark.hidden = true; return; }
  let i0 = -1, i1 = -1;
  if(radarMode === 'rainviewer' && radarFrames.length){
    const t0 = new Date(winStart).getTime() / 1000;
    const t1 = new Date(winEnd).getTime() / 1000;
    radarFrames.forEach((f, i) => {
      if(f.time >= t0 - 1800 && i0 < 0) i0 = i;
      if(f.time <= t1 + 1800) i1 = i;
    });
  }else if(radarMode === 'mrms' && mrmsFrames.length){
    const t0 = new Date(winStart).getTime();
    const t1 = new Date(winEnd).getTime();
    mrmsFrames.forEach((iso, i) => {
      const ft = Date.parse(iso);
      if(ft >= t0 - 900000 && i0 < 0) i0 = i;
      if(ft <= t1 + 900000) i1 = i;
    });
  }else if(iemFrames.length){
    const now = Date.now();
    const ws = new Date(winStart).getTime();
    const we = new Date(winEnd).getTime();
    iemFrames.forEach((suffix, i) => {
      const mins = IEM_MINS[i] || 0;
      const ft = now - mins * 60000;
      if(ft >= ws - 900000 && i0 < 0) i0 = i;
      if(ft <= we + 900000) i1 = i;
    });
  }
  if(i0 < 0 || i1 < i0){ mark.hidden = true; return; }
  const max = Math.max(1, n - 1);
  mark.style.left = (i0 / max) * 100 + '%';
  mark.style.width = Math.max(4, ((i1 - i0) / max) * 100) + '%';
  mark.hidden = false;
  mark.title = 'Severe window ' + stormState.severeWindow.label;
}

const radarCenterBtn = $('radarCenterBtn');
if(radarCenterBtn) radarCenterBtn.addEventListener('click', centerRadarMap);
const radarExpandBtn = $('radarExpandBtn');
if(radarExpandBtn) radarExpandBtn.addEventListener('click', toggleRadarExpand);

