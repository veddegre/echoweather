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
let iemLoadGen = 0;
let mrmsLayer = null;
let radarDeepFrame = null;
let mapB = null, mapBMarker = null, basemapLayerB = null;
let iemOverlayLayersB = [null, null], iemSlotFrameB = [-1, -1], iemOverlaySlotB = 0;
let radarDualOn = false, mapSyncLock = false;
const MRMS_WMS_URL = 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows';
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
  return radarMode === 'mrms' || !!(IEM_TILES[radarMode] && IEM_TILES[radarMode].velocity);
}
function isChaseRadarMode(){
  return !!(stormState.stormMode || stormState.severeWindow
    || (stormState.loaded && (stormState.maxDn >= 3 || stormState.reports.length > 0)));
}
function syncRadarVelToggle(){
  const btn = $('radarVelToggle');
  if(!btn) return;
  const loc = state.locations[state.active];
  const chase = isChaseRadarMode();
  const iemMode = radarMode === 'iem-n0q' || radarMode === 'iem-n0u';
  const show = loc && isLikelyUS(loc) && (iemMode || (chase && radarMode === 'mrms'));
  btn.hidden = !show;
  if(btn.hidden) return;
  if(radarMode === 'mrms' && chase){
    btn.textContent = 'Site radar';
    btn.setAttribute('aria-label', 'Switch to animated NEXRAD site radar');
    return;
  }
  const vel = radarMode === 'iem-n0u';
  btn.textContent = vel ? 'Reflectivity' : 'Velocity';
  btn.setAttribute('aria-label', vel ? 'Switch to reflectivity' : 'Switch to velocity');
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
  if(mrmsLayer){ mrmsLayer.options.maxZoom = RADAR_ZOOM.mrms; }
}
function swapOverlaySlot(layers, slot, opacity){
  layers.forEach((l, i) => { if(l) l.setOpacity(i === slot ? opacity : 0); });
}
function ensurePingPongLayer(layers, slot, onError, opts){
  if(!map) return null;
  if(!layers[slot]){
    layers[slot] = L.tileLayer('', { ...opts, opacity: 0 });
    if(onError) layers[slot].on('tileerror', onError);
    layers[slot].addTo(map);
  } else if(!map.hasLayer(layers[slot])) {
    layers[slot].addTo(map);
  }
  return layers[slot];
}
function loadPingPongFrame(layers, slotFrames, slot, frameIdx, url, opacity, onError, showWhenReady, layerOpts){
  const layer = ensurePingPongLayer(layers, slot, onError, layerOpts || RV_TILE_OPTS);
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
function showPingPongFrame(layers, slotFrames, activeSlot, frameIdx, url, opacity, onError, layerOpts){
  if(slotFrames[activeSlot] === frameIdx){
    swapOverlaySlot(layers, activeSlot, opacity);
    return activeSlot;
  }
  const inactive = 1 - activeSlot;
  if(slotFrames[inactive] === frameIdx){
    swapOverlaySlot(layers, inactive, opacity);
    return inactive;
  }
  loadPingPongFrame(layers, slotFrames, inactive, frameIdx, url, opacity, onError, true, layerOpts);
  return inactive;
}
function preloadPingPongFrame(layers, slotFrames, activeSlot, frameIdx, url, onError, layerOpts){
  const preloadSlot = 1 - activeSlot;
  if(slotFrames[preloadSlot] === frameIdx) return;
  loadPingPongFrame(layers, slotFrames, preloadSlot, frameIdx, url, 0, onError, false, layerOpts);
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
  radarOverlaySlot = satOverlaySlot = iemOverlaySlot = 0;
  iemOverlaySlotB = 0;
}
function clearDualPaneOverlays(){
  removePingPongLayers(iemOverlayLayersB, mapB);
}
function clearRadarLayers(){
  removePingPongLayers(radarOverlayLayers, map);
  removePingPongLayers(satOverlayLayers, map);
  removePingPongLayers(iemOverlayLayers, map);
  clearDualPaneOverlays();
  hideGoesSatellite();
  if(mrmsLayer && map && map.hasLayer(mrmsLayer)) map.removeLayer(mrmsLayer);
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
  if(rainviewerTileErrors < 5 || radarMode !== 'rainviewer') return;
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
function refreshRadarMapSize(){
  if(!map) return;
  requestAnimationFrame(() => {
    if(map){
      map.invalidateSize({ animate: false });
      sizeLightningCanvas();
    }
    if(mapB) mapB.invalidateSize({ animate: false });
  });
}
function dualPaneAvailable(){
  const loc = state.locations[state.active];
  return !!(loc && isLikelyUS(loc) && (radarMode === 'iem-n0q' || radarMode === 'iem-n0u' || radarMode === 'mrms'));
}
function dualPaneSecondaryMode(){
  if(radarMode === 'iem-n0q' || radarMode === 'mrms') return 'iem-n0u';
  if(radarMode === 'iem-n0u') return 'iem-n0q';
  return null;
}
function dualPanePrimaryLabel(){
  if(radarMode === 'mrms') return 'MRMS reflectivity';
  if(radarMode === 'iem-n0u') return 'Velocity';
  return 'Reflectivity';
}
function dualPaneSecondaryLabel(){
  if(radarMode === 'iem-n0u') return 'Reflectivity';
  return 'Velocity';
}
async function ensureDualPaneVelocitySite(){
  if(!radarDualOn || dualPaneSecondaryMode() !== 'iem-n0u') return true;
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
  const raw = iemFrames[frameIdx] ?? iemFrames[iemFrames.length - 1] ?? '900913';
  return raw === '0' ? '900913' : raw;
}
function showDualPaneFrame(i){
  if(!mapB || !radarDualOn || !dualPaneAvailable()) return;
  const secMode = dualPaneSecondaryMode();
  if(!secMode || !IEM_TILES[secMode]) return;
  if(IEM_TILES[secMode].velocity && !iemVelocitySite) return;
  const frameIdx = radarMode === 'mrms' ? 0 : i;
  const suffix = dualPaneSecondarySuffix(frameIdx);
  const name = iemLayerName(secMode, suffix);
  if(!name) return;
  hidePingPongLayers(iemOverlayLayersB);
  const url = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/' + name + '/{z}/{x}/{y}.png';
  const err = IEM_TILES[secMode].velocity ? onIemTileError : null;
  iemOverlaySlotB = showPingPongFrame(iemOverlayLayersB, iemSlotFrameB, iemOverlaySlotB, frameIdx, url, 0.78, err, IEM_TILE_OPTS);
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
  if(radarLightningOn) setLightningOverlay(true);
  else syncAlertPolygons(stormState.alertFeatures.filter(f => f.geometry));
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
function toggleRadarExpand(){
  const stage = $('radarStage');
  const btn = $('radarExpandBtn');
  if(!stage || !btn) return;
  const on = stage.classList.toggle('expanded');
  document.body.classList.toggle('radar-expanded', on);
  btn.textContent = on ? 'Close' : 'Expand';
  btn.setAttribute('aria-label', on ? 'Close expanded radar' : 'Expand radar fullscreen');
  setTimeout(() => { if(map) map.invalidateSize(); }, 220);
}
function ensureMrmsLayer(){
  if(!map) return null;
  if(!mrmsLayer){
    mrmsLayer = L.tileLayer.wms(MRMS_WMS_URL, {
      layers: 'conus_bref_qcd',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      opacity: 0.78,
      maxZoom: RADAR_ZOOM.mrms,
      zIndex: 450,
      attribution: 'NOAA MRMS'
    });
  }
  return mrmsLayer;
}
function loadMrmsRadar(){
  clearRadarLayers();
  stopRadarTimer();
  radarSatOn = false;
  $('radarSat').classList.remove('on');
  if(!radarDualOn) iemVelocitySite = null;
  iemFrames = radarDualOn ? ['0'] : [];
  setRadarAnimControls(false);
  syncRadarVelToggle();
  const layer = ensureMrmsLayer();
  if(layer && map && !map.hasLayer(layer)) layer.addTo(map);
  $('radarTime').textContent = 'Live \u00B7 MRMS';
  $('radarNote').textContent = 'NOAA MRMS composite reflectivity \u00B7 CONUS';
  updateRadarLegend();
  applyRadarZoomLimits();
  syncStormReportMarkers();
  applyPendingRadarFrame();
  updateRadarHash();
  syncRadarDualUi();
  if(radarDualOn){
    ensureDualPaneVelocitySite().then(ok => {
      if(ok) showDualPaneFrame(0);
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
  const leg = document.querySelector('.radar-legend');
  if(!leg) return;
  const vel = IEM_TILES[radarMode] && IEM_TILES[radarMode].velocity;
  leg.innerHTML = vel
    ? '<div>Velocity</div><div class="bar" style="background:linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00,#f0f)"></div><div style="display:flex;justify-content:space-between;margin-top:2px"><span>In</span><span>0</span><span>Out</span></div>'
    : '<div>Reflectivity (dBZ)</div><div class="bar"></div><div style="display:flex;justify-content:space-between;margin-top:2px"><span>5</span><span>35</span><span>65+</span></div>';
}
function radarFrameCount(){
  if(radarMode === 'rainviewer') return radarFrames.length;
  if(radarMode === 'mrms') return 0;
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
      finishIemRadarLoad(mode);
    });
  }
  iemFrames = IEM_SUFFIXES.slice();
  finishIemRadarLoad(mode);
}
function finishIemRadarLoad(mode){
  setRadarAnimControls(true);
  radarIdx = iemFrames.length - 1;
  $('radarScrub').max = Math.max(0, iemFrames.length - 1);
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
        loadMrmsRadar();
      }
      else if(IEM_TILES[radarMode]){
        if(loadId !== radarLoadId) return;
        await loadIemRadar(radarMode);
      }
    }catch(e){
      if(loadId !== radarLoadId) return;
      $('radarTime').textContent = 'Radar unavailable';
      setPanelUnavail($('radarNote'), 'radar_load');
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
    if(IEM_TILES[mode].velocity && !iemVelocitySite) return;
    const suffix = iemFrames[i];
    const name = iemLayerName(mode, suffix);
    if(!name) return;
    hidePingPongLayers(radarOverlayLayers);
    hidePingPongLayers(satOverlayLayers);
    hideGoesSatellite();
    const url = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/' + name + '/{z}/{x}/{y}.png';
    const iemErr = IEM_TILES[mode] && IEM_TILES[mode].velocity ? onIemTileError : null;
    iemOverlaySlot = showPingPongFrame(iemOverlayLayers, iemSlotFrame, iemOverlaySlot, i, url, 0.78, iemErr, IEM_TILE_OPTS);
    const next = (i + 1) % iemFrames.length;
    const ns = iemFrames[next];
    if(ns){
      const nname = iemLayerName(mode, ns);
      preloadPingPongFrame(iemOverlayLayers, iemSlotFrame, iemOverlaySlot, next, 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/' + nname + '/{z}/{x}/{y}.png', iemErr, IEM_TILE_OPTS);
    }
    $('radarTime').textContent = IEM_TILES[mode] && IEM_TILES[mode].velocity
      ? 'Live \u00B7 ' + (iemVelocitySite || 'site')
      : (IEM_MINS[i] === 0 ? 'Live \u00B7 now' : IEM_MINS[i] + ' min ago');
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
      if(note) note.textContent = radarMode === 'mrms'
        ? 'NOAA MRMS composite reflectivity \u00B7 CONUS'
        : radarNoteForMode();
      if(!ok){
        radarDualOn = false;
        setPanelUnavail($('radarNote'), 'radar_vel_site');
      }
    }
    syncRadarDualUi();
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
      radarIdx = (radarIdx + 1) % n;
      showFrame(radarIdx);
    }, 700);
    $('radarPlay').textContent = '\u275A\u275A Pause';
  }
});
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
document.querySelectorAll('[data-threat]').forEach(inp => {
  inp.addEventListener('change', () => {
    const k = inp.getAttribute('data-threat');
    if(!(k in threatLayerOpts)) return;
    threatLayerOpts[k] = inp.checked;
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
    if(radarMode === 'mrms' && isChaseRadarMode()){
      radarMode = 'iem-n0q';
    }else{
      radarMode = (radarMode === 'iem-n0u') ? 'iem-n0q' : 'iem-n0u';
    }
    saveLocRadarPrefs();
    $('radarMode').value = radarMode;
    radarLoadId++;
    iemLoadGen++;
    applyRadarZoomLimits();
    updateRadarLegend();
    syncRadarVelToggle();
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

