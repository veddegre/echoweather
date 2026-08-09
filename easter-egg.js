// ---------- Hundred Acre Weather easter egg ----------
const POOH_BASE = './pooh/';
const EGG_STORAGE = 'st_woods_unlocked';

const WOODS_TOASTS = [
  'Off to the Hundred Acre Wood…',
  'Pooh is checking the sky for you…',
  'Owl has been consulted. Reluctantly.',
  'The woods have their own forecast now.',
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

function openHundredAcreWeather(){
  const loc = hundredAcreLocation();
  if(!loc){
    showLocToast('Set a location first — even the woods need coordinates.');
    return;
  }
  try{ store.set(EGG_STORAGE, '1'); }catch(e){}
  const q = new URLSearchParams({
    lat: String(loc.lat),
    lon: String(loc.lon),
    name: loc.name,
    from: 'echo'
  });
  location.href = POOH_BASE + 'index.php?' + q.toString();
}

function openHundredAcreGuide(){
  const q = new URLSearchParams({ from: 'echo' });
  const loc = hundredAcreLocation();
  if(loc){
    q.set('lat', String(loc.lat));
    q.set('lon', String(loc.lon));
    q.set('name', loc.name);
  }
  location.href = POOH_BASE + 'slides.php?' + q.toString();
}

function waitForLocationThen(fn, attempts){
  const left = attempts ?? 40;
  if(hundredAcreLocation()){ fn(); return; }
  if(left <= 0){
    showLocToast('Still waiting on a location — the woods are patient, but not forever.');
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

function woodsTriggerFromHash(){
  const raw = (location.hash || '').replace(/^#/, '');
  const path = raw.split('?')[0];
  if(path !== 'hundred-acre' && path !== 'woods') return false;
  if(raw.includes('guide')) openHundredAcreGuide();
  else waitForLocationThen(openHundredAcreWeather);
  return true;
}

function woodsToast(){
  const i = Math.floor(Math.random() * WOODS_TOASTS.length);
  showLocToast(WOODS_TOASTS[i]);
}

function initEasterEgg(){
  if(woodsTriggerFromUrl()) return;

  const onHash = () => {
    if(!woodsTriggerFromHash()) return;
    history.replaceState(null, '', location.pathname + location.search);
  };
  if(woodsTriggerFromHash()) onHash();
  window.addEventListener('hashchange', onHash);

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
