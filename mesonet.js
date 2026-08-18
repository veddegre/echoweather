// ---------- regional mesonet (More tab + Radar storm strip) ----------
let radarMesonetGen = 0;
let mesonetCache = { key: '', rows: null, at: 0 };
const MESONET_CACHE_MS = 3 * 60 * 1000;

function mesonetCacheKey(loc){
  return Number(loc.lat).toFixed(3) + ',' + Number(loc.lon).toFixed(3) + ':' + state.units;
}

function isLikelyMetarId(id){
  return /^[A-Z]{4}$/.test(String(id || '').toUpperCase());
}

function mesonetObsFromFeature(s, feat){
  const o = (feat && feat.properties) || {};
  const tc = nwsVal(o.temperature);
  if(tc == null) return null;
  const temp = state.units === 'F' ? Math.round(tc * 9 / 5 + 32) : Math.round(tc);
  const wspd = nwsWindToDisp(o.windSpeed);
  const wdir = o.windDirection?.value != null ? compass(o.windDirection.value) : '';
  const wind = wspd != null ? (wdir ? wdir + ' ' : '') + wspd + ' ' + windUnit() : null;
  return { ...s, temp, wind };
}

async function fetchMesonetRows(loc, limit){
  limit = limit || 6;
  const key = mesonetCacheKey(loc);
  if(mesonetCache.rows && mesonetCache.key === key && (Date.now() - mesonetCache.at) < MESONET_CACHE_MS){
    return mesonetCache.rows.slice(0, limit);
  }

  const lat = Number(loc.lat).toFixed(4);
  const lon = Number(loc.lon).toFixed(4);
  const stationsUrl = state.data?.nwsPoints?.observationStations
    || ('https://api.weather.gov/points/' + lat + ',' + lon + '/stations');
  const r = await nwsFetch(stationsUrl);
  if(!r.ok) throw new Error('stations ' + r.status);
  const feats = (await r.json()).features || [];
  const stations = feats.map((f, rank) => {
    const p = f.properties || {};
    const coords = f.geometry?.coordinates;
    const slon = coords?.[0], slat = coords?.[1];
    const dist = (slat != null && slon != null && typeof haversineMi === 'function')
      ? haversineMi(loc.lat, loc.lon, slat, slon) : null;
    return {
      id: p.stationIdentifier,
      name: p.name || p.stationIdentifier,
      dist,
      rank
    };
  }).filter(s => s.id);
  const preferred = stations.filter(s => isLikelyMetarId(s.id));
  const fallback = stations.filter(s => !isLikelyMetarId(s.id));
  const pool = preferred.concat(fallback).slice(0, Math.max(12, limit * 3));
  if(!pool.length) return [];

  const rows = [];
  for(const s of pool){
    if(rows.length >= limit) break;
    try{
      // /observations?limit=1 returns 200 + empty features when the site is silent.
      // /observations/latest 404s and Chrome logs it (K8D4 and similar).
      const or = await nwsFetch('https://api.weather.gov/stations/' + encodeURIComponent(s.id) + '/observations?limit=1');
      if(!or.ok) continue;
      const obsFeats = (await or.json()).features || [];
      const row = mesonetObsFromFeature(s, obsFeats[0]);
      if(row) rows.push(row);
    }catch(e){ /* skip silent or unreachable stations */ }
  }

  mesonetCache = { key, rows, at: Date.now() };
  return rows.slice(0, limit);
}
function renderMesonetHoursHtml(rows, opts){
  opts = opts || {};
  const compact = !!opts.compact;
  return '<div class="mesonet-hours' + (compact ? ' mesonet-hours-compact' : '') + '">' + rows.map(row => {
    const idShort = row.id.replace(/^K/, '');
    const distLbl = row.dist != null ? Math.round(row.dist) + ' mi' : '';
    const title = mesonetStationLabel(row.name, row.id);
    return '<div class="mesonet-hour"><span class="k">' + esc(idShort)
      + (distLbl ? '<small> \u00B7 ' + esc(distLbl) + '</small>' : '') + '</span>'
      + '<span class="v">' + (row.temp != null ? row.temp + degSym() : '\u2014') + '</span>'
      + '<span class="mesonet-wind">' + esc(row.wind || '\u2014') + '</span>'
      + (compact ? '' : '<span class="mesonet-name" title="' + esc(row.name || title) + '">' + esc(title) + '</span>')
      + '</div>';
  }).join('') + '</div>';
}
async function loadMesonetStrip(loc){
  const panel = $('mesonetPanel'), body = $('mesonetBody');
  if(!panel || !body) return;
  if(!isLikelyUS(loc)){ panel.hidden = true; return; }
  return panelTask('mesonetPanel', 'mesonetStatus', async () => {
    panel.hidden = false;
    body.className = 'mesonet-strip';
    body.textContent = 'Loading regional observations\u2026';
    try{
      const rows = await fetchMesonetRows(loc, 6);
      if(!rows.length){
        body.innerHTML = panelUnavail('no_station');
        return;
      }
      body.innerHTML = renderMesonetHoursHtml(rows) + mesonetSpreadNote(rows);
    }catch(e){
      setPanelUnavail(body, 'mesonet_api');
      console.warn('mesonet', e);
    }
  });
}
function mesonetStationLabel(name, id){
  const short = String(name || '').replace(/,.*$/, '').replace(/\s+Airport$/i, '').replace(/\s+Air\s+Force\s+Base$/i, ' AFB').trim();
  const idShort = String(id || '').replace(/^K/, '');
  if(short && short.length <= 20) return short;
  if(short) return short.slice(0, 18) + '\u2026';
  return idShort;
}
function mesonetSpreadNote(rows){
  const temps = rows.map(r => r.temp).filter(t => t != null);
  if(temps.length < 2) return '';
  const spread = Math.max(...temps) - Math.min(...temps);
  const thresh = state.units === 'F' ? 5 : 3;
  if(spread < thresh) return '';
  return '<p class="mesonet-foot">Regional spread: ' + spread + degSym() + ' across ' + temps.length + ' stations.</p>';
}
function shouldRefreshMesonet(loc){
  if(!loc || !isLikelyUS(loc)) return false;
  if(stormState.stormMode || stormState.maxDn >= 2 || (stormState.mcds && stormState.mcds.length > 0)) return true;
  return false;
}
function shouldShowRadarMesonet(){
  return !!(stormState.stormMode || stormState.maxDn >= 3 || stormState.reports.length > 0
    || stormState.severeWindow);
}
function syncRadarMesonet(loc){
  const box = $('radarMesonet');
  if(!box) return;
  if(!loc || !isLikelyUS(loc) || !shouldShowRadarMesonet()){
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
}
async function loadRadarMesonetStrip(loc){
  const box = $('radarMesonet');
  if(!box || !loc || !isLikelyUS(loc) || !shouldShowRadarMesonet()){
    syncRadarMesonet(loc);
    return;
  }
  const gen = ++radarMesonetGen;
  box.hidden = false;
  box.innerHTML = '<div class="radar-mesonet-head"><span class="radar-mesonet-lbl">Regional ASOS</span></div>'
    + '<div class="radar-note">Loading\u2026</div>';
  try{
    const rows = await fetchMesonetRows(loc, 4);
    if(gen !== radarMesonetGen) return;
    if(!rows.length){
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = '<div class="radar-mesonet-head"><span class="radar-mesonet-lbl">Regional ASOS</span>'
      + '<a href="#mesonetPanel" class="radar-mesonet-more">Full strip \u2192</a></div>'
      + renderMesonetHoursHtml(rows, { compact: true }) + mesonetSpreadNote(rows);
  }catch(e){
    if(gen !== radarMesonetGen) return;
    box.innerHTML = '<div class="radar-mesonet-lbl">Regional ASOS</div>' + panelUnavail('mesonet_api');
    console.warn('radarMesonet', e);
  }
}
function refreshMesonetIfNeeded(loc, opts){
  if(!loc || !isLikelyUS(loc)) return;
  if(opts?.moreTab || shouldRefreshMesonet(loc)) loadMesonetStrip(loc);
  if(shouldShowRadarMesonet()) loadRadarMesonetStrip(loc);
  else syncRadarMesonet(loc);
}
