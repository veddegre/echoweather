// ---------- in-page nav ----------
  }catch(e){ console.warn('sw', e); }
}

// ---------- in-page nav ----------
const APP_TABS = ['now', 'forecast', 'radar', 'impact', 'more'];

function syncChromeHeight(){
  const top = $('siteTop');
  const loc = $('locbar');
  const tabs = $('appTabBar');
  const mobile = isMobileTabLayout();
  let chromeH = '';
  if(mobile && loc) chromeH = loc.offsetHeight + 'px';
  else if(top) chromeH = top.offsetHeight + 'px';
  if(chromeH && chromeH !== syncChromeHeight._chromeH){
    syncChromeHeight._chromeH = chromeH;
    document.documentElement.style.setProperty('--chrome-h', chromeH);
  }
  if(tabs && mobile){
    const tabH = tabs.offsetHeight + 'px';
    if(tabH !== syncChromeHeight._tabH){
      syncChromeHeight._tabH = tabH;
      document.documentElement.style.setProperty('--tab-bar-h', tabH);
    }
  }
}
syncChromeHeight._chromeH = '';
syncChromeHeight._tabH = '';
let chromeHeightRaf = 0;
function scheduleSyncChromeHeight(){
  if(chromeHeightRaf) return;
  chromeHeightRaf = requestAnimationFrame(() => {
    chromeHeightRaf = 0;
    syncChromeHeight();
  });
}

function scrollToNavTarget(id){
  if(!id || APP_TABS.includes(id)) return;
  const el = document.getElementById(id);
  if(!el || !el.classList.contains('nav-target')) return;
  const behavior = isMobileTabLayout() ? 'auto' : 'smooth';
  let frame = 0;
  const tryScroll = () => {
    frame++;
    const h = el.getBoundingClientRect().height;
    if(h > 0 || frame >= 16){
      el.scrollIntoView({ behavior: frame > 2 ? 'auto' : behavior, block: 'start' });
    }
    if(h === 0 && frame < 16) requestAnimationFrame(tryScroll);
  };
  requestAnimationFrame(() => requestAnimationFrame(tryScroll));
  setTimeout(() => {
    if(!document.body.contains(el) || el.getBoundingClientRect().height === 0) return;
    const top = el.getBoundingClientRect().top;
    const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-h')) || 80;
    if(top < chrome + 4 || top > window.innerHeight * 0.45)
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, 180);
}

function navPathFromHref(href){
  const raw = decodeURIComponent((href || '').replace(/^#/, ''));
  const qi = raw.indexOf('?');
  return qi >= 0 ? raw.slice(0, qi) : raw;
}

function tabForNavPath(path){
  if(APP_TABS.includes(path)) return path;
  if(path === 'air' || path === 'outdoor') return 'impact';
  if(path === 'lightPanel' || path === 'hourlyPanel' || path === 'nowPanel') return 'now';
  if(path === 'dailyPanel' || path === 'forecastTextPanel' || path === 'obsPanel') return 'forecast';
  if(path === 'radarPanel' || path === 'stormLinks') return 'radar';
  if(path === 'airPanel' || path === 'exposurePanel' || path === 'marinePanel' || path === 'activityPanel' || path === 'impactPanel') return 'impact';
  if(path === 'afdPanel' || path === 'tafPanel' || path === 'moonPanel' || path === 'advPanel' || path === 'advCollapse') return 'more';
  return 'now';
}

function applyNavHash(){
  syncChromeHeight();
  applyRadarDeepLinkFromHash();
  const { path } = parseNavHash();
  const isTab = APP_TABS.includes(path);
  setAppTab(tabForNavPath(path), { skipScroll: !isTab, skipHash: true });
  scrollToNavTarget(path);
}

function navigateToNavTarget(href){
  const raw = (href || '').replace(/^#/, '');
  if(!raw) return;
  const want = '#' + raw;
  if(location.hash !== want) location.hash = want;
  else applyNavHash();
}

function parseNavHash(){
  const raw = (location.hash || '').replace(/^#/, '');
  const qi = raw.indexOf('?');
  return {
    path: qi >= 0 ? raw.slice(0, qi) : raw,
    params: new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '')
  };
}
function applyRadarDeepLinkFromHash(){
  const { path, params } = parseNavHash();
  if(path !== 'radar') return;
  const mode = params.get('mode');
  if(mode && (mode === 'rainviewer' || mode === 'mrms' || IEM_TILES[mode])){
    radarMode = mode;
    if($('radarMode')) $('radarMode').value = radarMode;
    saveLocRadarPrefs();
  }
  const frame = params.get('frame');
  if(frame != null && frame !== '') radarDeepFrame = Math.max(0, parseInt(frame, 10) || 0);
}

function setAppTab(tab, opts){
  if(!APP_TABS.includes(tab)) tab = 'now';
  document.body.classList.remove('mtab-now', 'mtab-forecast', 'mtab-radar', 'mtab-impact', 'mtab-more');
  document.body.classList.add('mtab-' + tab);
  const bar = $('appTabBar');
  if(bar){
    bar.querySelectorAll('button[data-tab]').forEach(btn => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle('on', on);
      if(on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  }
  if(!opts || !opts.skipScroll){
    window.scrollTo({ top: 0, behavior: isMobileTabLayout() ? 'auto' : 'smooth' });
  }
  if(!opts || !opts.skipHash){
    const next = tab === 'radar' ? buildRadarHash() : '#' + tab;
    if(location.hash !== next) history.replaceState(null, '', next);
  }
  if(tab === 'radar') activateRadarPanel();
  else if(radarLightningOn) syncLightningOverlay();
  else if(map) refreshRadarMapSize();
  const scrub = $('radarScrub');
  if(scrub){
    const onRadar = tab === 'radar';
    scrub.disabled = !onRadar;
    scrub.tabIndex = onRadar ? 0 : -1;
    scrub.setAttribute('aria-hidden', onRadar ? 'false' : 'true');
  }
  ensureTabPanels(tab);
  syncChromeHeight();
  if(tab === 'impact') syncImpactTabChrome();
  else if(impactSectionObs){
    impactSectionObs.disconnect();
    impactSectionObs = null;
  }
}

function tabFromHash(){
  return tabForNavPath(parseNavHash().path);
}

function initPageNav(){
  const ver = $('footerVersion');
  if(ver) ver.textContent = 'v' + APP_VERSION;
  const tabBar = $('appTabBar');
  if(tabBar){
    tabBar.querySelectorAll('button[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => setAppTab(btn.dataset.tab));
    });
  }

  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && $('radarStage')?.classList.contains('expanded')) toggleRadarExpand();
  });

  document.addEventListener('click', e => {
    if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href^="#"]');
    if(!a) return;
    const href = a.getAttribute('href');
    if(!href || href === '#') return;
    const path = navPathFromHref(href);
    if(!path) return;
    if(APP_TABS.includes(path) || document.getElementById(path)?.classList.contains('nav-target')){
      e.preventDefault();
      navigateToNavTarget(href.slice(1));
    }
  }, true);

  bindImpactSectionNav();

  $('smokeRadarBtn')?.addEventListener('click', () => {
    enableHmsSmokeLayer();
    setAppTab('radar');
  });

  let siteTopCompact = false;
  const SCROLL_COMPACT_AT = 100;
  const SCROLL_EXPAND_AT = 16;
  const syncSiteTop = () => {
    if(isMobileTabLayout()) return;
    const y = window.scrollY;
    let compact = siteTopCompact;
    if(!siteTopCompact && y > SCROLL_COMPACT_AT) compact = true;
    else if(siteTopCompact && y < SCROLL_EXPAND_AT) compact = false;
    if(compact !== siteTopCompact){
      const top = $('siteTop');
      const y0 = window.scrollY;
      const beforeH = top ? top.offsetHeight : 0;
      siteTopCompact = compact;
      document.body.classList.toggle('scrolled', compact);
      if(top) void top.offsetHeight;
      const afterH = top ? top.offsetHeight : 0;
      const delta = afterH - beforeH;
      if(delta) window.scrollTo({ top: Math.max(0, y0 + delta), behavior: 'instant' });
      scheduleSyncChromeHeight();
    }
  };

  window.addEventListener('scroll', () => {
    syncSiteTop();
  }, {passive:true});
  syncSiteTop();
  syncChromeHeight();

  const siteTop = $('siteTop');
  const locbar = $('locbar');
  const siteHeader = siteTop?.querySelector('header');
  if(typeof ResizeObserver !== 'undefined'){
    const ro = new ResizeObserver(() => scheduleSyncChromeHeight());
    if(siteTop) ro.observe(siteTop);
    if(siteHeader) ro.observe(siteHeader);
    if(locbar) ro.observe(locbar);
    if(tabBar) ro.observe(tabBar);
  }

  const syncLayout = () => { applyNavHash(); };

  window.addEventListener('hashchange', syncLayout);
  window.addEventListener('pageshow', e => { if(e.persisted) syncLayout(); });
  window.addEventListener('resize', () => {
    syncChromeHeight();
    syncLayout();
    syncImpactTabChrome();
    if(state.data) renderActivityPlanner(state.data);
    positionSearchResults();
    if(isRadarTabVisible() && map) refreshRadarMapSize();
  });
  window.addEventListener('scroll', () => positionSearchResults(), {passive:true});
  syncLayout();
}

