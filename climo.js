// ---------- climate normals & record hints ----------
let climoNormals = null;
let nwsCliByDoy = null;
function dayClimoAnomaly(dateStr, hi, lo, precipMm){
  if(!climoNormals) return '';
  const key = dateStr.slice(5);
  const n = climoNormals[key];
  if(!n) return '';
  const toDisp = c => state.units === 'F' ? Math.round(c * 9 / 5 + 32) : Math.round(c);
  const parts = [];
  if(n.hi != null){
    const dHi = toDisp(hi) - toDisp(n.hi);
    if(Math.abs(dHi) >= 3) parts.push((dHi > 0 ? '+' : '') + dHi + '\u00B0 vs 10-yr avg high');
    else parts.push('Near normal high');
  }
  if(n.lo != null){
    const dLo = toDisp(lo) - toDisp(n.lo);
    if(Math.abs(dLo) >= 3) parts.push((dLo > 0 ? '+' : '') + dLo + '\u00B0 vs 10-yr avg low');
  }
  if(n.precip != null && precipMm != null && precipMm > 1){
    const pNorm = state.units === 'F' ? n.precip / 25.4 : n.precip;
    const pAct = state.units === 'F' ? precipMm / 25.4 : precipMm;
    const dP = pAct - pNorm;
    if(dP >= 0.15) parts.push('+' + dP.toFixed(2) + (state.units === 'F' ? ' in' : ' mm') + ' precip vs normal');
    else if(dP <= -0.15) parts.push(dP.toFixed(2) + (state.units === 'F' ? ' in' : ' mm') + ' precip vs normal');
  }
  return parts.join(' \u00B7 ');
}
function formatRecYears(years){
  if(!years?.length) return '';
  const show = years.slice(0, 2).map(String);
  return show.join(', ') + (years.length > 2 ? '\u2026' : '');
}
function dayClimoRecord(dateStr, hi, lo){
  const doy = dateStr.slice(5);
  const toDisp = c => state.units === 'F' ? Math.round(c * 9 / 5 + 32) : Math.round(c);
  const cliToDisp = v => v == null ? null : (state.units === 'F' ? Math.round(v) : Math.round((v - 32) * 5 / 9));
  const hDisp = toDisp(hi);
  const lDisp = toDisp(lo);
  const parts = [];
  const nws = nwsCliByDoy?.[doy];
  if(nws?.recHi != null){
    const rec = cliToDisp(nws.recHi);
    const yrs = formatRecYears(nws.recHiYears);
    if(hDisp >= rec) parts.push({ text: 'NWS record high (' + rec + '\u00B0' + (yrs ? ', ' + yrs : '') + ')', record: true });
    else if(hDisp >= rec - 2) parts.push({ text: 'Near NWS record high (' + rec + '\u00B0' + (yrs ? ', ' + yrs : '') + ')', record: false });
  }
  if(nws?.recLo != null){
    const rec = cliToDisp(nws.recLo);
    const yrs = formatRecYears(nws.recLoYears);
    if(lDisp <= rec) parts.push({ text: 'NWS record low (' + rec + '\u00B0' + (yrs ? ', ' + yrs : '') + ')', record: true });
    else if(lDisp <= rec + 2) parts.push({ text: 'Near NWS record low (' + rec + '\u00B0' + (yrs ? ', ' + yrs : '') + ')', record: false });
  }
  if(!parts.length && climoNormals){
    const n = climoNormals[doy];
    if(n){
      if(n.recHi){
        const rec = toDisp(n.recHi.v);
        if(hDisp >= rec) parts.push({ text: '10-yr high for date (' + rec + '\u00B0 in ' + n.recHi.year + ')', record: true });
        else if(hDisp >= rec - 2) parts.push({ text: 'Near 10-yr high (' + rec + '\u00B0 in ' + n.recHi.year + ')', record: false });
      }
      if(n.recLo){
        const rec = toDisp(n.recLo.v);
        if(lDisp <= rec) parts.push({ text: '10-yr low for date (' + rec + '\u00B0 in ' + n.recLo.year + ')', record: true });
        else if(lDisp <= rec + 2) parts.push({ text: 'Near 10-yr low (' + rec + '\u00B0 in ' + n.recLo.year + ')', record: false });
      }
    }
  }
  if(!parts.length) return '';
  const anyRec = parts.some(p => p.record);
  return '<div class="day-record' + (anyRec ? ' is-record' : '') + '">' + esc(parts.map(p => p.text).join(' \u00B7 ')) + '</div>';
}
async function fetchNwsCliByDoy(stationId){
  if(!stationId) return null;
  const cacheKey = 'st_nwscli_' + stationId;
  const hit = store.get(cacheKey);
  if(hit && Date.now() - hit.t < 14 * 24 * 3600 * 1000) return hit.data;
  const year = new Date().getFullYear();
  const byDoy = {};
  for(const y of [year - 1, year, year + 1]){
    try{
      const r = await fetch('https://mesonet.agron.iastate.edu/json/cli.py?station='
        + encodeURIComponent(stationId) + '&year=' + y);
      if(!r.ok) continue;
      const j = await r.json();
      (j.results || []).forEach(row => {
        if(!row.valid || row.high_record == null) return;
        byDoy[row.valid.slice(5)] = {
          recHi: row.high_record,
          recLo: row.low_record,
          recHiYears: row.high_record_years || [],
          recLoYears: row.low_record_years || []
        };
      });
    }catch(e){ /* ignore */ }
  }
  if(!Object.keys(byDoy).length) return null;
  store.set(cacheKey, { t: Date.now(), data: byDoy });
  return byDoy;
}
async function fetchClimoNormals(loc){
  const cacheKey = 'st_climo3_' + loc.lat.toFixed(1) + '_' + loc.lon.toFixed(1);
  const hit = store.get(cacheKey);
  if(hit && Date.now() - hit.t < 30 * 24 * 3600 * 1000) return hit.data;
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - 9;
  const url = 'https://archive-api.open-meteo.com/v1/archive'
    + '?latitude=' + Number(loc.lat).toFixed(4) + '&longitude=' + Number(loc.lon).toFixed(4)
    + '&start_date=' + startYear + '-01-01&end_date=' + endYear + '-12-31'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto';
  try{
    const r = await fetch(url);
    if(!r.ok) return null;
    const j = await r.json();
    const byDoy = {};
    (j.daily?.time || []).forEach((t, i) => {
      const doy = t.slice(5);
      if(!byDoy[doy]) byDoy[doy] = { hi: [], lo: [], precip: [] };
      const hi = j.daily.temperature_2m_max[i], lo = j.daily.temperature_2m_min[i];
      const pr = j.daily.precipitation_sum?.[i];
      const yr = t.slice(0, 4);
      if(hi != null){
        byDoy[doy].hi.push(hi);
        if(!byDoy[doy].recHi || hi > byDoy[doy].recHi.v) byDoy[doy].recHi = { v: hi, year: yr };
      }
      if(lo != null){
        byDoy[doy].lo.push(lo);
        if(!byDoy[doy].recLo || lo < byDoy[doy].recLo.v) byDoy[doy].recLo = { v: lo, year: yr };
      }
      if(pr != null && pr > 0) byDoy[doy].precip.push(pr);
    });
    const normals = {};
    Object.keys(byDoy).forEach(doy => {
      const b = byDoy[doy];
      const avg = arr => arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : null;
      normals[doy] = {
        hi: avg(b.hi), lo: avg(b.lo), precip: avg(b.precip),
        recHi: b.recHi || null, recLo: b.recLo || null
      };
    });
    store.set(cacheKey, { t: Date.now(), data: normals });
    return normals;
  }catch(e){ return null; }
}
async function loadClimoNormals(loc){
  const stationId = state.data?.metar?.id || state.data?.current?.station;
  const [normals, cli] = await Promise.all([
    fetchClimoNormals(loc),
    fetchNwsCliByDoy(stationId)
  ]);
  climoNormals = normals;
  nwsCliByDoy = cli;
  if(state.data) renderDaily(state.data);
}
