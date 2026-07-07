// ---------- tab panel loading & idle prefetch ----------
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
    loadForecastCpcTeaser(loc);
    loadForecastUsdmTeaser(loc);
    loadForecastNbmStrip(loc, d);
  }
  if((all || tab === 'radar') && !tabPanelsLoaded.radar){
    tabPanelsLoaded.radar = true;
    loadStormIntel(loc, d);
    activateRadarPanel();
    if(typeof syncRadarMesonet === 'function') syncRadarMesonet(loc);
    if(typeof loadRadarMesonetStrip === 'function') loadRadarMesonetStrip(loc);
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
    loadMesonetStrip(loc);
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
