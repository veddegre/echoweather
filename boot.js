// ---------- boot (runs after app.js, storm.js, radar.js) ----------
const urlLoc = parseUrlLoc();
if(urlLoc){
  urlLocPinned = true;
  const idx = state.locations.findIndex(l =>
    Math.abs(l.lat - urlLoc.lat) < 0.02 && Math.abs(l.lon - urlLoc.lon) < 0.02);
  if(idx >= 0) state.active = idx;
  else { state.locations.push(urlLoc); state.active = state.locations.length - 1; persist(); }
}
initBuoySelect();
migrateBuoyPins();
syncBuoyForLocation(state.locations[state.active], false);
syncMarinePanelVisibility(state.locations[state.active]);
getTideStations().then(() => syncCoastalPanelVisibility(state.locations[state.active]));
try{ localStorage.removeItem('st_airnow_key'); }catch(e){}
$('unitF').classList.toggle('on', state.units === 'F');
$('unitC').classList.toggle('on', state.units === 'C');
applyTheme(state.theme);
initPageNav();
setupInstallHint();
migrateAppVersion().then(() => initServiceWorker());
probeServerIntegrations().then(async () => {
  await initFirstLocation();
  renderChips();
  syncUrl();
  loadAll();
  setTimeout(() => syncLocationOnOpen({ silent: true }), 1200);
});
window.addEventListener('pageshow', e => {
  if(e.persisted) syncLocationOnOpen({ silent: true });
});
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden'){
    lastHiddenAt = Date.now();
    return;
  }
  if(lastHiddenAt && Date.now() - lastHiddenAt > 120000)
    syncLocationOnOpen({ silent: true });
});
