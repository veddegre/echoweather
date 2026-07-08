// ---------- aviation (METAR + TAF) ----------
// ---------- aviation TAF (nearest airport) ----------
async function resolveTafIcaos(loc){
  const out = [];
  const add = id => {
    const u = id && String(id).toUpperCase();
    if(u && /^K[A-Z0-9]{3}$/.test(u) && !out.includes(u)) out.push(u);
  };
  add(state.data?.metar?.id || state.data?.metarId);
  if(!isLikelyUS(loc)) return out.slice(0, 3);
  try{
    let stationsUrl = state.data?.nwsPoints?.observationStations;
    if(!stationsUrl){
      const r = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
      if(!r.ok) return out.slice(0, 3);
      stationsUrl = (await r.json()).properties?.observationStations;
    }
    if(!stationsUrl || typeof stationsUrl !== 'string') return out.slice(0, 3);
    const sr = await nwsFetch(stationsUrl);
    if(!sr.ok) return out.slice(0, 3);
    const stList = await sr.json();
    for(const station of (stList.features || []).slice(0, 12)){
      add(station.properties?.stationIdentifier || station.properties?.stationId);
      if(out.length >= 3) break;
    }
  }catch(e){
    console.warn('resolveTafIcaos', e);
  }
  return out.slice(0, 3);
}
let tafLoadGen = 0;
const TAF_WX_PHRASES = {
  VCSH:'Showers nearby', VCTS:'Thunderstorms nearby', VCFG:'Fog nearby',
  '-SHRA':'Light rain showers', SHRA:'Rain showers', '+SHRA':'Heavy rain showers',
  '-RA':'Light rain', RA:'Rain', '+RA':'Heavy rain',
  '-SN':'Light snow', SN:'Snow', '+SN':'Heavy snow',
  '-DZ':'Light drizzle', DZ:'Drizzle', BR:'Mist', FG:'Fog', HZ:'Haze', FU:'Smoke',
  TS:'Thunderstorm', TSRAGRA:'Thunderstorm with rain and hail',
  FZRA:'Freezing rain', FZDZ:'Freezing drizzle', PL:'Sleet / ice pellets',
  GR:'Hail', SQ:'Squalls', IC:'Ice crystals', SH:'Showers', VC:'Nearby'
};
const TAF_COVER = { FEW:'Few', SCT:'Scattered', BKN:'Broken', OVC:'Overcast', SKC:'Clear', CLR:'Clear' };
function tafTimeMs(t){
  if(t == null) return null;
  if(typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.getTime();
}
function fmtTafWhen(ms, opts){
  if(ms == null) return '';
  return new Date(ms).toLocaleString([], opts || { weekday:'short', hour:'numeric', minute:'2-digit' });
}
function decodeTafWx(s){
  if(!s) return '';
  const u = String(s).toUpperCase().trim();
  if(TAF_WX_PHRASES[u]) return TAF_WX_PHRASES[u];
  const parts = u.split(/\s+/).map(t => TAF_WX_PHRASES[t] || t);
  return parts.join(', ');
}
function decodeTafVis(v){
  if(v == null || v === '') return '';
  const s = String(v).trim();
  if(/^P6/i.test(s) || s === '6+') return 'More than 6 miles';
  const n = parseFloat(s);
  if(!isNaN(n)) return n + (n === 1 ? ' mile' : ' miles') + ' visibility';
  return s + ' visibility';
}
function decodeTafClouds(clouds){
  if(!clouds || !clouds.length) return 'Clear or not reported';
  return clouds.map(c => {
    const cov = TAF_COVER[c.cover] || c.cover;
    if(c.base == null) return cov;
    const ft = Number(c.base);
    const low = ft < 6000 ? ' (low clouds)' : '';
    return cov + ' at ' + ft.toLocaleString() + ' ft' + low;
  }).join('; ');
}
function decodeTafWind(wdir, wspd, wgst){
  if(wspd == null) return '';
  const kt = Number(wspd);
  const spdDisp = state.units === 'F'
    ? Math.round(kt * 1.15078) + ' mph'
    : Math.round(kt * 1.852) + ' km/h';
  let s = '';
  if(wdir != null && wdir !== 'VRB') s += compass(wdir) + ' (' + wdir + '\u00B0) at ';
  else if(String(wdir).toUpperCase() === 'VRB') s += 'Variable wind at ';
  s += spdDisp + ' (' + kt + ' kt)';
  if(wgst != null) s += ', gusts to ' + wgst + ' kt';
  return s;
}
function fmtTafPeriod(from, to){
  const a = tafTimeMs(from), b = tafTimeMs(to);
  if(a == null) return '';
  const opts = { weekday:'short', hour:'numeric', minute:'2-digit' };
  if(b == null) return 'From ' + fmtTafWhen(a, opts);
  return fmtTafWhen(a, opts) + ' \u2013 ' + fmtTafWhen(b, opts);
}
function tafVisMiles(v){
  if(v == null || v === '') return null;
  const s = String(v).trim();
  if(/^P6/i.test(s) || s === '6+') return 6.01;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function tafCeilingFt(clouds){
  if(!clouds || !clouds.length) return null;
  let low = null;
  clouds.forEach(c => {
    const cov = String(c.cover || '').toUpperCase();
    if(!/BKN|OVC|VV/.test(cov) || c.base == null) return;
    const ft = Number(c.base);
    if(!isNaN(ft) && (low == null || ft < low)) low = ft;
  });
  return low;
}
function tafFlightCategory(f){
  const visMi = tafVisMiles(f.visib);
  const ceilFt = tafCeilingFt(f.clouds);
  const wx = String(f.wxString || '').toUpperCase();
  if(/\+TS|TSRA|\+SN|FZRA|FG|FZFG/.test(wx) && (visMi == null || visMi < 3)) return 'lifr';
  if((ceilFt != null && ceilFt < 500) || (visMi != null && visMi < 1)) return 'lifr';
  if((ceilFt != null && ceilFt < 1000) || (visMi != null && visMi < 3)) return 'ifr';
  if((ceilFt != null && ceilFt < 3000) || (visMi != null && visMi < 5)) return 'mvfr';
  if(ceilFt != null || visMi != null) return 'vfr';
  return '';
}
const TAF_FLIGHT_LABEL = { vfr:'VFR', mvfr:'MVFR', ifr:'IFR', lifr:'LIFR' };
function metarFlightCategoryFromObs(p){
  if(!p) return '';
  const visM = nwsVal(p.visibility);
  const visMi = visM != null ? visM / 1609.34 : null;
  const ceilFt = nwsVal(p.cloudBase);
  if((ceilFt != null && ceilFt < 500) || (visMi != null && visMi < 1)) return 'lifr';
  if((ceilFt != null && ceilFt < 1000) || (visMi != null && visMi < 3)) return 'ifr';
  if((ceilFt != null && ceilFt < 3000) || (visMi != null && visMi < 5)) return 'mvfr';
  if(ceilFt != null || visMi != null) return 'vfr';
  return '';
}
function renderAviationMetarCard(icao, obs){
  const id = esc(icao || 'Field');
  if(!obs || !obs.props){
    return '<div class="aviation-card aviation-metar"><h3>METAR (observed)</h3>'
      + '<div class="av-icao">' + id + '</div>'
      + '<div class="av-meta">No recent observation from NWS.</div></div>';
  }
  const p = obs.props;
  const tempC = nwsVal(p.temperature);
  const wind = nwsWindToDisp(p.windSpeed);
  const gust = nwsWindToDisp(p.windGust);
  const visM = nwsVal(p.visibility);
  const temp = tempC != null ? (state.units === 'F' ? Math.round(tempC * 9/5 + 32) : Math.round(tempC)) + degSym() : '\u2014';
  const windStr = wind != null ? wind + ' ' + windUnit() : '\u2014';
  const gustStr = gust != null ? ', gusts ' + gust : '';
  const vis = visM != null
    ? (state.units === 'F' ? (visM / 1609.34).toFixed(1) + ' mi' : (visM / 1000).toFixed(1) + ' km')
    : '\u2014';
  const cat = metarFlightCategoryFromObs(p);
  const catBadge = cat ? ' <span class="lc-badge spc">' + TAF_FLIGHT_LABEL[cat] + '</span>' : '';
  const when = p.timestamp ? new Date(p.timestamp).toLocaleString([], { hour:'numeric', minute:'2-digit' }) : '';
  const raw = p.rawMessage || p.textDescription || '';
  return '<div class="aviation-card aviation-metar"><h3>METAR (observed)</h3>'
    + '<div class="av-icao">' + id + catBadge + '</div>'
    + '<div class="av-meta">' + esc(p.textDescription || 'Observation')
    + (when ? ' \u00B7 ' + when : '') + '</div>'
    + '<div class="av-meta">Temp ' + temp + ' \u00B7 Wind ' + windStr + gustStr + ' \u00B7 Vis ' + vis + '</div>'
    + (raw ? '<details class="av-raw"><summary>Raw METAR</summary><pre>' + esc(raw) + '</pre></details>' : '')
    + '</div>';
}
function renderAviationTafSummaryCard(taf){
  const icao = esc(taf.icaoId || taf.name || 'Airport');
  const fcsts = (taf.fcsts || []).filter(f => tafFlightCategory(f));
  const nowCat = fcsts.length ? tafFlightCategory(fcsts[0]) : '';
  const catBadge = nowCat ? ' <span class="lc-badge spc">' + TAF_FLIGHT_LABEL[nowCat] + '</span>' : '';
  const first = fcsts[0];
  const summary = first
    ? [decodeTafWind(first.wdir, first.wspd, first.wgst), decodeTafVis(first.visib)].filter(Boolean).join(' \u00B7 ')
    : 'Decoded forecast below';
  const issuedMs = tafTimeMs(taf.issueTime || taf.bulletinTime);
  return '<div class="aviation-card aviation-taf-sum"><h3>TAF (forecast)</h3>'
    + '<div class="av-icao">' + icao + catBadge + '</div>'
    + '<div class="av-meta">' + esc(summary) + '</div>'
    + (issuedMs ? '<div class="av-meta">Issued ' + esc(fmtTafWhen(issuedMs)) + '</div>' : '')
    + '</div>';
}
function renderAviationFlightStrip(taf){
  const wrap = $('aviationFlight'), bar = $('aviationFlightBar');
  if(!wrap || !bar) return;
  const fcsts = (taf.fcsts || []).slice(0, 12);
  if(!fcsts.length){ wrap.hidden = true; return; }
  const segments = fcsts.map(f => {
    const cat = tafFlightCategory(f) || 'vfr';
    const title = fmtTafPeriod(f.timeFrom, f.timeTo) + ' \u00B7 ' + (TAF_FLIGHT_LABEL[cat] || cat.toUpperCase())
      + (decodeTafVis(f.visib) ? ' \u00B7 ' + decodeTafVis(f.visib) : '');
    return '<span class="' + cat + '" title="' + esc(title) + '"></span>';
  });
  bar.innerHTML = segments.join('');
  wrap.hidden = false;
}
function renderTafHtml(taf){
  const raw = taf.rawTAF || '';
  const issuedMs = tafTimeMs(taf.issueTime || taf.bulletinTime);
  const validToMs = tafTimeMs(taf.validTimeTo);
  let html = '<div class="taf-head"><strong>' + esc(taf.name || taf.icaoId || 'Airport') + '</strong>'
    + ' <span class="radar-note">(' + esc(taf.icaoId || '') + ')</span>';
  const meta = [];
  if(issuedMs) meta.push('Issued ' + fmtTafWhen(issuedMs));
  if(validToMs) meta.push('valid through ' + fmtTafWhen(validToMs));
  if(meta.length) html += '<div class="taf-meta">' + esc(meta.join(' \u00B7 ')) + '</div>';
  html += '</div>';
  if(raw){
    html += '<details class="taf-raw-wrap"><summary>Raw aviation code</summary>'
      + '<div class="taf-raw">' + esc(raw) + '</div></details>';
  }
  const fcsts = taf.fcsts || [];
  if(fcsts.length){
    html += '<div class="taf-periods">' + fcsts.slice(0, 6).map(f => {
      const wind = decodeTafWind(f.wdir, f.wspd, f.wgst);
      const vis = decodeTafVis(f.visib);
      const wx = decodeTafWx(f.wxString);
      const clouds = decodeTafClouds(f.clouds);
      const rows = [
        ['Wind', wind],
        ['Visibility', vis],
        ['Weather', wx],
        ['Clouds', clouds]
      ].filter(r => r[1]);
      const change = f.fcstChange === 'FM' ? 'Change from ' : (f.fcstChange === 'TEMPO' ? 'Temporary ' : (f.fcstChange === 'BECMG' ? 'Becoming ' : ''));
      const title = change + fmtTafPeriod(f.timeFrom, f.timeTo);
      return '<div class="taf-period-card">'
        + '<div class="taf-period-time">' + esc(title) + '</div>'
        + '<dl class="taf-dl">' + rows.map(r => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') + '</dl>'
        + '</div>';
    }).join('') + '</div>';
  }
  return html;
}
async function loadTaf(loc){
  const gen = ++tafLoadGen;
  return panelTask('tafPanel', 'tafStatus', async () => {
    const box = $('tafText');
    const dual = $('aviationDual');
    const flight = $('aviationFlight');
    if(!box) return;
    if(gen !== tafLoadGen) return;
    if(!isLikelyUS(loc)){
      if(dual) dual.hidden = true;
      if(flight) flight.hidden = true;
      box.textContent = 'Aviation METAR/TAF is available for US airport locations.';
      return;
    }
    box.textContent = 'Loading aviation data\u2026';
    if(dual) dual.hidden = true;
    if(flight) flight.hidden = true;
    let icaos = [];
    try{
      icaos = await resolveTafIcaos(loc);
      if(gen !== tafLoadGen) return;
      if(!icaos.length){ box.innerHTML = panelUnavail('no_taf'); return; }
      const primary = icaos[0];
      const [tafRes, metarObs] = await Promise.all([
        fetchTimeout('/api/taf?ids=' + encodeURIComponent(icaos.join(',')), {}, 20000),
        fetchStationLatestObs(primary).then(props => props ? { id: primary, props } : null).catch(() => null)
      ]);
      if(gen !== tafLoadGen) return;
      if(!tafRes.ok){
        if(tafRes.status === 404) throw new Error('taf proxy missing');
        throw new Error('taf http ' + tafRes.status);
      }
      const arr = await tafRes.json();
      if(!Array.isArray(arr)) throw new Error('taf bad response');
      const taf = arr.find(t => t && (t.rawTAF || t.icaoId));
      if(!taf){
        box.innerHTML = panelUnavail('no_taf', 'No TAF issued for ' + icaos.join(', ') + '.');
        return;
      }
      if(dual){
        dual.hidden = false;
        dual.innerHTML = renderAviationMetarCard(primary, metarObs) + renderAviationTafSummaryCard(taf);
      }
      renderAviationFlightStrip(taf);
      box.innerHTML = renderTafHtml(taf);
    }catch(e){
      if(gen !== tafLoadGen) return;
      const msg = String(e.message || '');
      const icaoLabel = icaos.length ? icaos.join(', ') : '';
      const timedOut = e.name === 'AbortError' || e.name === 'TimeoutError';
      if(msg.includes('proxy')){
        box.innerHTML = panelUnavail('taf_proxy');
      }else if(timedOut){
        box.innerHTML = panelUnavail('taf_timeout');
      }else if(msg.startsWith('taf http ')){
        box.innerHTML = panelUnavail('no_taf', 'HTTP ' + msg.slice(9) + (icaoLabel ? ', ' + icaoLabel : '') + '.');
      }else{
        box.innerHTML = panelUnavail('no_taf', icaoLabel || '');
      }
      if(timedOut) console.warn('taf', e.message || e.name);
      else console.error('taf', e);
    }
  });
}
