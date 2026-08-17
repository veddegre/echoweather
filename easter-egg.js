// ---------- Themed weather easter eggs ----------
const POOH_BASE = './pooh/';
const LOG_BASE = './log/';
const EGG_STORAGE = 'st_woods_unlocked';
const LOG_STORAGE = 'st_log_unlocked';

const WOODS_TOASTS = [
  'Off to the Hundred Acre Wood…',
  'Pooh is checking the sky for you…',
  'Owl has been consulted. Reluctantly.',
  'The woods have their own forecast now.',
];

const LOG_TOASTS = [
  'Opening the log…',
  'The keeper has the glass.',
  'Mind the bar.',
  'A weather eye, if you please.',
];

function hundredAcreLocation(){
  const loc = state?.locations?.[state?.active];
  if(!loc || loc.lat == null || loc.lon == null) return null;
  return {
    lat: loc.lat,
    lon: loc.lon,
    name: loc.name || 'Your location'
  };
}

function echoThemeQuery(extra){
  const loc = hundredAcreLocation();
  const q = new URLSearchParams(extra || {});
  if(loc){
    q.set('lat', String(loc.lat));
    q.set('lon', String(loc.lon));
    q.set('name', loc.name);
    q.set('from', 'echo');
  }
  return q;
}

function openHundredAcreWeather(){
  const loc = hundredAcreLocation();
  if(!loc){
    showLocToast('Set a location first — even the woods need coordinates.');
    return;
  }
  try{ store.set(EGG_STORAGE, '1'); }catch(e){}
  location.href = POOH_BASE + 'index.php?' + echoThemeQuery().toString();
}

function openHundredAcreGuide(){
  location.href = POOH_BASE + 'slides.php?' + echoThemeQuery({ from: 'echo' }).toString();
}

function openShipLogGuide(){
  try{ store.set(LOG_STORAGE, '1'); }catch(e){}
  location.href = LOG_BASE + 'slides.php?' + echoThemeQuery({ from: 'echo' }).toString();
}

function openShipLog(){
  const loc = hundredAcreLocation();
  if(!loc){
    showLocToast('Set a location first — the log needs a station.');
    return;
  }
  try{ store.set(LOG_STORAGE, '1'); }catch(e){}
  location.href = LOG_BASE + 'index.php?' + echoThemeQuery().toString();
}

function waitForLocationThen(fn, attempts){
  const left = attempts ?? 40;
  if(hundredAcreLocation()){ fn(); return; }
  if(left <= 0){
    showLocToast('Still waiting on a location.');
    return;
  }
  setTimeout(() => waitForLocationThen(fn, left - 1), 150);
}

function woodsTriggerFromUrl(){
  const params = new URLSearchParams(location.search);
  if(!params.has('woods')) return false;
  if(params.get('woods') === 'guide'){
    openHundredAcreGuide();
    return true;
  }
  waitForLocationThen(openHundredAcreWeather);
  return true;
}

function logTriggerFromUrl(){
  const params = new URLSearchParams(location.search);
  if(!params.has('log') && params.get('egg') !== 'log') return false;
  if(params.get('log') === 'guide'){
    waitForLocationThen(openShipLogGuide);
    return true;
  }
  waitForLocationThen(openShipLog);
  return true;
}

function woodsTriggerFromHash(){
  const raw = (location.hash || '').replace(/^#/, '');
  const path = raw.split('?')[0];
  if(path !== 'hundred-acre' && path !== 'woods') return false;
  if(raw.includes('guide')) openHundredAcreGuide();
  else waitForLocationThen(openHundredAcreWeather);
  return true;
}

function logTriggerFromHash(){
  const raw = (location.hash || '').replace(/^#/, '');
  const path = raw.split('?')[0];
  if(path !== 'logbook' && path !== 'log') return false;
  if(raw.includes('guide')) waitForLocationThen(openShipLogGuide);
  else waitForLocationThen(openShipLog);
  return true;
}

function woodsToast(){
  const i = Math.floor(Math.random() * WOODS_TOASTS.length);
  showLocToast(WOODS_TOASTS[i]);
}

function logToast(){
  const loc = hundredAcreLocation();
  const lake = (typeof greatLakeName === 'function' && loc)
    ? greatLakeName(loc.lat, loc.lon)
    : null;
  if(lake){
    showLocToast('Opening the log of ' + lake + '…');
    return;
  }
  const i = Math.floor(Math.random() * LOG_TOASTS.length);
  showLocToast(LOG_TOASTS[i]);
}

function initMarineLogEgg(){
  const title = document.getElementById('marineTitle');
  if(!title) return;

  let taps = 0;
  let tapTimer = 0;
  title.addEventListener('click', e => {
    const loc = hundredAcreLocation();
    const onLakes = loc && typeof isGreatLakesLoc === 'function' && isGreatLakesLoc(loc);
    if(!onLakes) return;
    taps++;
    clearTimeout(tapTimer);
    if(taps >= 3){
      taps = 0;
      e.preventDefault();
      logToast();
      setTimeout(openShipLog, 450);
      return;
    }
    tapTimer = setTimeout(() => { taps = 0; }, 2500);
  });
}

function initWoodsBrandEgg(){
  const brand = document.querySelector('.brand-mark');
  if(!brand) return;

  let taps = 0;
  let tapTimer = 0;
  brand.addEventListener('click', e => {
    taps++;
    clearTimeout(tapTimer);
    if(taps >= 5){
      taps = 0;
      e.preventDefault();
      woodsToast();
      setTimeout(openHundredAcreWeather, 450);
      return;
    }
    tapTimer = setTimeout(() => { taps = 0; }, 2500);
  }, true);
}

function initEasterEgg(){
  if(logTriggerFromUrl() || woodsTriggerFromUrl()) return;

  const onHash = () => {
    if(logTriggerFromHash() || woodsTriggerFromHash()){
      history.replaceState(null, '', location.pathname + location.search);
    }
  };
  if(logTriggerFromHash() || woodsTriggerFromHash()) onHash();
  window.addEventListener('hashchange', onHash);

  initWoodsBrandEgg();
  initMarineLogEgg();
}
