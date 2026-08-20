// ---------- forecast comparison (NWS / Open-Meteo / GFS / 7Timer) ----------
const COMPARE_DAYS = 5;
let forecastCompareGen = 0;

function compareDayKey(iso){
  return String(iso || '').slice(0, 10);
}
function compareFmtTemp(v){
  if(v == null || Number.isNaN(v)) return '\u2014';
  return Math.round(v) + '\u00b0';
}
function compareFmtPop(v){
  if(v == null || Number.isNaN(v)) return '';
  return Math.round(v) + '%';
}
function compareFmtWind(v){
  if(v == null || Number.isNaN(v)) return '';
  return Math.round(v) + ' ' + windUnit();
}

function compareFromOmDaily(daily, days){
  if(!daily?.time?.length) return [];
  const out = [];
  for(let i = 0; i < daily.time.length && out.length < days; i++){
    out.push({
      date: compareDayKey(daily.time[i]),
      hi: daily.temperature_2m_max?.[i] ?? null,
      lo: daily.temperature_2m_min?.[i] ?? null,
      pop: daily.precipitation_probability_max?.[i] ?? null,
      wind: daily.wind_speed_10m_max?.[i] ?? null
    });
  }
  return out;
}

function compareFromNws(d, days){
  const periods = d?.nwsDaily;
  if(!periods?.length) return [];
  const omDaily = d?.om?.daily;
  const out = [];
  for(let i = 0; i < periods.length && out.length < days; i++){
    const p = periods[i];
    if(!p.isDaytime) continue;
    const night = periods[i + 1];
    const date = compareDayKey(p.startTime);
    const omIdx = omDaily?.time?.findIndex(t => compareDayKey(t) === date) ?? -1;
    const hi = nwsTempToDisp(p.temperature, p.temperatureUnit === 'C' ? 'C' : 'F');
    const lo = night && !night.isDaytime
      ? nwsTempToDisp(night.temperature, night.temperatureUnit === 'C' ? 'C' : 'F')
      : (omIdx >= 0 ? omDaily.temperature_2m_min[omIdx] : hi);
    const pop = Math.max(
      p.probabilityOfPrecipitation?.value ?? 0,
      night && !night.isDaytime ? (night.probabilityOfPrecipitation?.value ?? 0) : 0
    );
    let wind = parseNwsWindMph(p.windSpeed);
    if(state.units !== 'F' && wind) wind = Math.round(wind * 1.609);
    if(!wind && omIdx >= 0) wind = omDaily.wind_speed_10m_max?.[omIdx] ?? null;
    out.push({ date, hi, lo, pop, wind });
  }
  return out;
}

function compareFromGfs(json, days){
  return compareFromOmDaily(json?.daily, days);
}

const TIMER_WIND_MS = [0, 0.3, 1.85, 5.7, 9.4, 14.0, 20.85, 28.55, 37.0];
function timerWindMs(code){
  const i = Math.max(0, Math.min(8, Number(code) || 0));
  return TIMER_WIND_MS[i] ?? 0;
}
function parseTimerInit(init){
  const s = String(init || '').replace(/\s+/g, '');
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})/);
  if(!m) return Date.now();
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], 0, 0);
}
function compareFrom7Timer(json, days, tz){
  const series = json?.dataseries;
  if(!Array.isArray(series) || !series.length) return [];
  const initMs = parseTimerInit(json.init);
  const byDay = new Map();
  series.forEach(pt => {
    const ms = initMs + (Number(pt.timepoint) || 0) * 3600000;
    const date = tz
      ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
      : new Date(ms).toISOString().slice(0, 10);
    let row = byDay.get(date);
    if(!row){
      row = { date, hiC: -Infinity, loC: Infinity, windMs: 0, pop: null };
      byDay.set(date, row);
    }
    const t = Number(pt.temp2m);
    if(!Number.isNaN(t)){
      if(t > row.hiC) row.hiC = t;
      if(t < row.loC) row.loC = t;
    }
    const w = timerWindMs(pt.wind10m?.speed);
    if(w > row.windMs) row.windMs = w;
  });
  return [...byDay.values()].slice(0, days).map(r => ({
    date: r.date,
    hi: Number.isFinite(r.hiC) ? nwsTempToDisp(r.hiC, 'C') : null,
    lo: Number.isFinite(r.loC) ? nwsTempToDisp(r.loC, 'C') : null,
    pop: null,
    wind: msToDisp(r.windMs)
  }));
}

function compareSpreadClass(his){
  const nums = his.filter(v => v != null && !Number.isNaN(v));
  if(nums.length < 2) return '';
  const spread = Math.max(...nums) - Math.min(...nums);
  const red = state.units === 'F' ? 10 : 6;
  const yellow = state.units === 'F' ? 3 : 2;
  if(spread > red) return 'compare-diverge-high';
  if(spread > yellow) return 'compare-diverge-mid';
  return 'compare-diverge-low';
}

function compareWeekday(date){
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderForecastCompareTable(sources){
  const el = $('forecastCompare');
  if(!el) return;
  const dates = [];
  const seen = new Set();
  sources.forEach(src => {
    (src.days || []).forEach(day => {
      if(day.date && !seen.has(day.date)){
        seen.add(day.date);
        dates.push(day.date);
      }
    });
  });
  const useDates = dates.slice(0, COMPARE_DAYS);
  if(!useDates.length){
    el.innerHTML = '<p class="radar-note">No overlapping forecast days yet.</p>';
    return;
  }
  const head = '<div class="compare-row compare-head"><span>Day</span>'
    + sources.map(s => '<span>' + s.label + '</span>').join('') + '</div>';
  const rows = useDates.map(date => {
    const cells = sources.map(src => (src.days || []).find(d => d.date === date) || null);
    const cls = compareSpreadClass(cells.map(c => c?.hi));
    const body = cells.map(c => {
      if(!c) return '<span class="compare-cell"><span class="compare-hi">\u2014</span></span>';
      const pop = compareFmtPop(c.pop);
      const wind = compareFmtWind(c.wind);
      return '<span class="compare-cell">'
        + '<span class="compare-hi">' + compareFmtTemp(c.hi) + '</span>'
        + '<span class="compare-lo">' + compareFmtTemp(c.lo) + '</span>'
        + (pop || wind ? '<span class="compare-meta">' + [pop, wind].filter(Boolean).join(' \u00b7 ') + '</span>' : '')
        + '</span>';
    }).join('');
    return '<div class="compare-row ' + cls + '"><span class="compare-day">' + compareWeekday(date) + '</span>' + body + '</div>';
  }).join('');
  el.innerHTML = '<div class="compare-table" role="table" aria-label="Forecast comparison">' + head + rows + '</div>';
}

async function fetchOpenMeteoGfs(loc){
  const tempU = state.units === 'F' ? 'fahrenheit' : 'celsius';
  const windU = state.units === 'F' ? 'mph' : 'kmh';
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + loc.lat + '&longitude=' + loc.lon
    + '&models=gfs_seamless'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max'
    + '&temperature_unit=' + tempU + '&wind_speed_unit=' + windU
    + '&timezone=auto&forecast_days=' + COMPARE_DAYS;
  const r = await fetch(url);
  if(!r.ok) throw new Error('GFS HTTP ' + r.status);
  return r.json();
}

async function fetch7Timer(loc){
  const r = await fetch('/api/7timer?lat=' + encodeURIComponent(loc.lat) + '&lon=' + encodeURIComponent(loc.lon));
  if(!r.ok) throw new Error('7Timer HTTP ' + r.status);
  return r.json();
}

async function loadForecastCompare(loc, d){
  const el = $('forecastCompare');
  const status = $('forecastCompareStatus');
  if(!el || !loc) return;
  const gen = ++forecastCompareGen;
  el.innerHTML = '<p class="radar-note">Loading model comparison\u2026</p>';
  if(status) status.textContent = '';

  const omDays = compareFromOmDaily(d?.om?.daily, COMPARE_DAYS);
  const nwsDays = compareFromNws(d, COMPARE_DAYS);

  const [gfsRes, timerRes] = await Promise.allSettled([
    fetchOpenMeteoGfs(loc),
    fetch7Timer(loc)
  ]);
  if(gen !== forecastCompareGen) return;

  const sources = [
    { label: 'NWS', days: nwsDays },
    { label: 'Open-Meteo', days: omDays },
    { label: 'GFS', days: gfsRes.status === 'fulfilled' ? compareFromGfs(gfsRes.value, COMPARE_DAYS) : [] },
    { label: '7Timer', days: timerRes.status === 'fulfilled' ? compareFrom7Timer(timerRes.value, COMPARE_DAYS, d?.timezone) : [] }
  ];
  renderForecastCompareTable(sources);
  const notes = [];
  if(!nwsDays.length) notes.push('NWS daily not available here');
  if(gfsRes.status === 'rejected') notes.push('GFS unavailable');
  if(timerRes.status === 'rejected') notes.push('7Timer unavailable');
  if(status) status.textContent = notes.join(' \u00b7 ');
}
