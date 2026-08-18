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

const SKY_TOLD_SIGNS = [
  ['Capricorn', 12, 22, 1, 19],
  ['Aquarius', 1, 20, 2, 18],
  ['Pisces', 2, 19, 3, 20],
  ['Aries', 3, 21, 4, 19],
  ['Taurus', 4, 20, 5, 20],
  ['Gemini', 5, 21, 6, 20],
  ['Cancer', 6, 21, 7, 22],
  ['Leo', 7, 23, 8, 22],
  ['Virgo', 8, 23, 9, 22],
  ['Libra', 9, 23, 10, 22],
  ['Scorpio', 10, 23, 11, 21],
  ['Sagittarius', 11, 22, 12, 21]
];
const SKY_TOLD_STAR = {
  Capricorn: [
    'You already checked the pressure trend. The stars notice, and they are a little intimidated.',
    'A stubborn high builds over your to-do list. Leave one item unfinished on purpose.',
    'If the plan is solid, do not add a bonus errand just because the sky looks honest.'
  ],
  Aquarius: [
    'You will invent a better way to watch the sky, then use the old way anyway.',
    'A weird idea about the wind is correct. Do not workshop it in a group chat.',
    'Stay curious, but come inside when the lightning does.'
  ],
  Pisces: [
    'Feelings arrive like stratus: quiet, total, and somehow damp. Name one of them.',
    'A small kindness lands better than a grand speech. Fog does not need a spotlight.',
    'Trust the hunch, then check a real observation. Poetry plus a METAR.'
  ],
  Aries: [
    'Charge the hill, but not the one with the severe thunderstorm warning.',
    'Someone will try to slow you down. They are not the wind. You can still go.',
    'Start before you are ready. Finish before the next cell arrives.'
  ],
  Taurus: [
    'Comfort is not a character flaw. Neither is leaving the porch when it gusts.',
    'Hold your ground, then eat something that is not a weather snack.',
    'A slow evening beats a dramatic one. The sky can be dramatic without you.'
  ],
  Gemini: [
    'Two tabs, two theories, one actual sky. Pick a window and look.',
    'A conversation splits like a warm front. Let the interesting side win.',
    'You can explain the radar to someone, or you can go outside. Both is greedy.'
  ],
  Cancer: [
    'Home pressure is falling. Text the person who makes the room feel high pressure.',
    'Protect your evening like a lake-effect band: local, intense, nobody else\u2019s business.',
    'If you nest, nest with a view of the western sky.'
  ],
  Leo: [
    'The sun is doing bits and so are you. Save a little gold for after dusk.',
    'Compliments arrive. Accept one without issuing a forecast disclaimer.',
    'You do not have to host the whole horizon. Let someone else point at the moon.'
  ],
  Virgo: [
    'You will want to correct the model. The model does not know you are watching.',
    'Tidy one small system. Leave the atmosphere to the atmosphere.',
    'Precision is a gift. So is stopping at good enough before midnight.'
  ],
  Libra: [
    'Balance is not 50/50 cloud cover. Choose the nicer evening and mean it.',
    'A polite disagreement clears like haze after a cold front. Open a window.',
    'You can be fair without becoming the referee of other people\u2019s weather.'
  ],
  Scorpio: [
    'Something under the surface is moving. You already knew. Do not poke it twice.',
    'Intensity is allowed. A midnight walk is allowed. A speech is optional.',
    'Keep the secret. Share the sky.'
  ],
  Sagittarius: [
    'The far horizon looks better than your inbox. That is data.',
    'Say yes to one outing. No to the one that starts after the lightning.',
    'You do not need a new philosophy. You need a clear west and earlier bedtime.'
  ]
};
const SKY_TOLD_ANIMALS = [
  { name: 'Rat', ch: '\u9F20', hint: 'Notice the small leak before it is a flood.' },
  { name: 'Ox', ch: '\u725B', hint: 'Steady work outlasts a flashy front.' },
  { name: 'Tiger', ch: '\u864E', hint: 'A bold step, then a pause to hear the thunder.' },
  { name: 'Rabbit', ch: '\u5154', hint: 'Soft landings. Leave early if the road ices.' },
  { name: 'Dragon', ch: '\u9F8D', hint: 'Big weather, bigger patience. Do not chase every cell.' },
  { name: 'Snake', ch: '\u86C7', hint: 'Read the quiet sky. The loud one is already obvious.' },
  { name: 'Horse', ch: '\u99AC', hint: 'Move while the window is open. Windows close.' },
  { name: 'Goat', ch: '\u7F8A', hint: 'Gather your people. Leave the argument on the porch.' },
  { name: 'Monkey', ch: '\u7334', hint: 'A clever shortcut exists. Check it is not a gust front.' },
  { name: 'Rooster', ch: '\u96DE', hint: 'Announce less. Watch the sunrise more.' },
  { name: 'Dog', ch: '\u72D7', hint: 'Loyalty first. Then a walk, weather allowing.' },
  { name: 'Pig', ch: '\u8C6C', hint: 'Comfort is a plan. Rest is not a failure of ambition.' }
];
const SKY_TOLD_STEMS = ['Wood', 'Wood', 'Fire', 'Fire', 'Earth', 'Earth', 'Metal', 'Metal', 'Water', 'Water'];
const SKY_TOLD_CNY = {
  2020: '2020-01-25', 2021: '2021-02-12', 2022: '2022-02-01', 2023: '2023-01-22',
  2024: '2024-02-10', 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06',
  2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03', 2031: '2031-01-23',
  2032: '2032-02-11', 2033: '2033-01-31', 2034: '2034-02-19', 2035: '2035-02-08'
};
const SKY_TOLD_LUCK = [
  'Lucky direction: wherever the wind is not in your face.',
  'Lucky hour: the one after you stop refreshing the radar.',
  'Lucky color: whatever the western sky does at dusk.',
  'Lucky number: the visibility in miles, if it is still honest.',
  'Lucky move: look up once without taking a photo.',
  'Lucky caution: do not confuse a pretty sky with a safe one.'
];

const SKY_TOLD_BIRTH_KEY = 'st_sky_told_birth';
const SKY_TOLD_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SKY_TOLD_MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function eggHash(s){
  let h = 2166136261;
  const str = String(s || '');
  for(let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function eggPick(arr, seed){
  if(!arr?.length) return '';
  return arr[eggHash(seed) % arr.length];
}
function skyToldMonthDay(date, tz){
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: 'numeric', day: 'numeric', year: 'numeric'
  }).formatToParts(date);
  let y = date.getFullYear(), m = 1, d = 1;
  for(const p of parts){
    if(p.type === 'year') y = +p.value;
    if(p.type === 'month') m = +p.value;
    if(p.type === 'day') d = +p.value;
  }
  return { y, m, d };
}
function skyToldSunSign(m, d){
  for(const [name, m1, d1, m2, d2] of SKY_TOLD_SIGNS){
    if(m1 === m2 && d >= d1 && d <= d2) return name;
    if(m1 < m2 && ((m === m1 && d >= d1) || (m === m2 && d <= d2))) return name;
    if(m1 > m2 && ((m === m1 && d >= d1) || (m === m2 && d <= d2))) return name;
  }
  return 'Capricorn';
}
function skyToldSignRange(name){
  const row = SKY_TOLD_SIGNS.find(s => s[0] === name);
  if(!row) return '';
  const a = SKY_TOLD_MONTH_SHORT[row[1] - 1] + ' ' + row[2];
  const b = SKY_TOLD_MONTH_SHORT[row[3] - 1] + ' ' + row[4];
  return a + '\u2013' + b;
}
function skyToldDaysInMonth(m, y){
  return new Date(y || 2024, m, 0).getDate();
}
function skyToldLoadBirth(){
  let v = null;
  try{ v = typeof store !== 'undefined' ? store.get(SKY_TOLD_BIRTH_KEY) : null; }catch(e){}
  const m = +v?.m || 0;
  const d = +v?.d || 0;
  const y = +v?.y || 0;
  return { m, d, y };
}
function skyToldSaveBirth(birth){
  try{
    if(typeof store !== 'undefined') store.set(SKY_TOLD_BIRTH_KEY, birth);
  }catch(e){}
}
function skyToldReadBirthForm(){
  const monthEl = document.getElementById('skyToldMonth');
  const dayEl = document.getElementById('skyToldDay');
  const yearEl = document.getElementById('skyToldYear');
  return {
    m: monthEl ? +monthEl.value : 0,
    d: dayEl ? +dayEl.value : 0,
    y: yearEl ? +yearEl.value : 0
  };
}
function skyToldFillBirthSelects(){
  const monthEl = document.getElementById('skyToldMonth');
  const dayEl = document.getElementById('skyToldDay');
  const yearEl = document.getElementById('skyToldYear');
  if(!monthEl || !dayEl || !yearEl) return;
  const saved = skyToldLoadBirth();
  if(!monthEl.options.length){
    monthEl.appendChild(new Option('Month', '0'));
    SKY_TOLD_MONTHS.forEach((name, i) => monthEl.appendChild(new Option(name, String(i + 1))));
    dayEl.appendChild(new Option('Day', '0'));
    for(let d = 1; d <= 31; d++) dayEl.appendChild(new Option(String(d), String(d)));
    yearEl.appendChild(new Option('Year', '0'));
    const thisYear = new Date().getFullYear();
    for(let y = thisYear; y >= 1924; y--) yearEl.appendChild(new Option(String(y), String(y)));
  }
  monthEl.value = saved.m ? String(saved.m) : '0';
  dayEl.value = saved.d ? String(saved.d) : '0';
  yearEl.value = saved.y ? String(saved.y) : '0';
}
function skyToldLunarYear(y, m, d){
  const cny = SKY_TOLD_CNY[y];
  if(!cny){
    if(m === 1 || (m === 2 && d < 10)) return y - 1;
    return y;
  }
  const [ , cm, cd] = cny.split('-').map(Number);
  if(m < cm || (m === cm && d < cd)) return y - 1;
  return y;
}
function skyToldZodiac(lunarYear){
  const idx = ((lunarYear - 4) % 12 + 12) % 12;
  const stem = ((lunarYear - 4) % 10 + 10) % 10;
  const animal = SKY_TOLD_ANIMALS[idx];
  return { ...animal, element: SKY_TOLD_STEMS[stem], lunarYear };
}
function skyToldBits(loc, when){
  const bits = { moon: 'the moon', moonUp: false, planet: null };
  if(typeof moonIllumination === 'function' && typeof phaseName === 'function'){
    const ill = moonIllumination(when);
    const row = phaseName(ill.phase);
    bits.moon = (row && row[1] ? row[1] : 'the moon').toLowerCase();
  }
  if(loc && typeof moonPosition === 'function'){
    bits.moonUp = moonPosition(when, loc.lat, loc.lon).alt > 0;
  }
  if(loc && typeof planetSky === 'function'){
    const names = { venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' };
    let best = null;
    Object.keys(names).forEach(id => {
      const p = planetSky(id, when, loc.lat, loc.lon);
      if(!p || p.alt < 8 || p.elong < 15) return;
      if(!best || p.alt > best.alt) best = { name: names[id], alt: p.alt };
    });
    bits.planet = best;
  }
  return bits;
}
function fillSkyToldEgg(){
  const loc = hundredAcreLocation();
  const tz = (typeof state !== 'undefined' && state.data && state.data.timezone)
    || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const when = new Date();
  const md = skyToldMonthDay(when, tz);
  const transitSign = skyToldSunSign(md.m, md.d);
  const birth = skyToldReadBirthForm();
  const dayMax = birth.m ? skyToldDaysInMonth(birth.m, birth.y || 2024) : 31;
  if(birth.d > dayMax) birth.d = dayMax;
  const natalSign = (birth.m && birth.d) ? skyToldSunSign(birth.m, birth.d) : null;
  const natalYear = birth.y
    ? skyToldLunarYear(birth.y, birth.m || 6, birth.d || 15)
    : 0;
  const natalZo = natalYear ? skyToldZodiac(natalYear) : null;
  const yearZo = skyToldZodiac(skyToldLunarYear(md.y, md.m, md.d));
  const bits = skyToldBits(loc, when);
  const placeEl = document.getElementById('skyToldPlace');
  const starHead = document.getElementById('skyToldStarHead');
  const starBody = document.getElementById('skyToldStar');
  const zoHead = document.getElementById('skyToldZodiacHead');
  const zoBody = document.getElementById('skyToldZodiac');
  const place = loc
    ? (loc.name + ' \u00B7 ' + md.m + '/' + md.d)
    : ('Today \u00B7 ' + md.m + '/' + md.d);
  if(placeEl) placeEl.textContent = place;

  if(!natalSign){
    if(starHead) starHead.textContent = 'Your sun sign';
    if(starBody){
      starBody.textContent = 'The sun is in ' + transitSign + ' today \u2014 that is the sky, not a personal horoscope. '
        + 'Everyone with the same birthday shares a sun sign (for example Aug 18 is Leo). Pick month and day above.';
    }
  }else{
    const seed = [md.y, md.m, md.d, loc?.lat?.toFixed(2), loc?.lon?.toFixed(2), natalSign].join('|');
    const star = eggPick(SKY_TOLD_STAR[natalSign] || SKY_TOLD_STAR.Leo, seed + '|star');
    let skyNote = bits.moonUp
      ? ' Overhead tonight: ' + bits.moon + '.'
      : ' The moon is down tonight.';
    if(bits.planet){
      skyNote += ' ' + bits.planet.name + ' is actually up.';
    }
    if(starHead) starHead.textContent = 'You are ' + natalSign + ' \u00B7 ' + skyToldSignRange(natalSign);
    if(starBody){
      starBody.textContent = star + skyNote
        + ' The sun is in ' + transitSign + ' right now \u2014 that is today\u2019s sky, not your sign.';
    }
  }

  if(!natalZo){
    if(zoHead) zoHead.textContent = 'Chinese zodiac';
    if(zoBody){
      zoBody.textContent = 'This lunar year is ' + yearZo.element + ' ' + yearZo.name + ' for everyone. '
        + 'Add a birth year to see your animal.';
    }
  }else{
    const seed = [md.y, md.m, md.d, natalZo.name, loc?.lat?.toFixed(2)].join('|');
    const luck = eggPick(SKY_TOLD_LUCK, seed + '|luck');
    if(zoHead){
      zoHead.textContent = 'You are a ' + natalZo.element + ' ' + natalZo.name + '  ' + natalZo.ch
        + ' \u00B7 year ' + natalZo.lunarYear;
    }
    if(zoBody){
      zoBody.textContent = natalZo.hint + ' ' + luck
        + ' This lunar year is ' + yearZo.element + ' ' + yearZo.name + ' for the calendar.';
    }
  }
}
function closeSkyToldEgg(){
  const egg = document.getElementById('skyToldEgg');
  if(egg) egg.hidden = true;
  document.body.classList.remove('sky-told-open');
}
function openSkyToldEgg(){
  skyToldFillBirthSelects();
  fillSkyToldEgg();
  const egg = document.getElementById('skyToldEgg');
  if(!egg) return;
  egg.hidden = false;
  document.body.classList.add('sky-told-open');
  const birth = skyToldReadBirthForm();
  const focusEl = (!birth.m && document.getElementById('skyToldMonth'))
    || document.getElementById('skyToldClose');
  if(focusEl) focusEl.focus();
}
function initSkyToldEgg(){
  const panel = document.getElementById('tonightSkyPanel');
  const title = panel && panel.querySelector('h2');
  const egg = document.getElementById('skyToldEgg');
  if(!title || !egg) return;
  skyToldFillBirthSelects();
  ['skyToldMonth', 'skyToldDay', 'skyToldYear'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('change', () => {
      skyToldSaveBirth(skyToldReadBirthForm());
      fillSkyToldEgg();
    });
  });
  let taps = 0;
  let tapTimer = 0;
  title.addEventListener('click', e => {
    taps++;
    clearTimeout(tapTimer);
    if(taps >= 3){
      taps = 0;
      e.preventDefault();
      if(typeof showLocToast === 'function') showLocToast('The stars insist on a word\u2026');
      setTimeout(openSkyToldEgg, 400);
      return;
    }
    tapTimer = setTimeout(() => { taps = 0; }, 2500);
  });
  const close = document.getElementById('skyToldClose');
  const backdrop = document.getElementById('skyToldBackdrop');
  if(close) close.addEventListener('click', closeSkyToldEgg);
  if(backdrop) backdrop.addEventListener('click', closeSkyToldEgg);
  document.addEventListener('keydown', ev => {
    if(ev.key === 'Escape' && !egg.hidden) closeSkyToldEgg();
  });
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
  initSkyToldEgg();
}
