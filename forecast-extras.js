// ---------- forecast extras (CPC, USDM, NBM grid on More) ----------
async function fetchLatestAfdText(loc){
  if(!isLikelyUS(loc)) throw new Error('non_us');
  const r = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
  if(!r.ok) throw new Error('points');
  const j = await r.json();
  const cwa = j.properties && j.properties.cwa;
  if(!cwa) throw new Error('no cwa');
  const link = 'https://forecast.weather.gov/product.php?site=' + cwa + '&issuedby=' + cwa + '&product=AFD&format=CI&version=1&glossary=1';
  const lr = await nwsFetch('https://api.weather.gov/products/types/AFD/locations/' + cwa);
  if(!lr.ok) throw new Error('afd list');
  const list = await lr.json();
  const latest = (list['@graph'] || list.features || [])[0];
  const pid = latest && (latest.id || (latest['@id'] || '').split('/').pop());
  if(!pid) throw new Error('no afd');
  const pr = await nwsFetch('https://api.weather.gov/products/' + pid);
  if(!pr.ok) throw new Error('afd product');
  const prod = await pr.json();
  return {
    cwa,
    text: prod.productText || '',
    issued: prod.issuanceTime || prod.productTimestamp || '',
    link
  };
}
const CPC_OUTLOOK_BASE = {
  d610: 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/cpc_6_10_day_outlk/MapServer',
  d814: 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/cpc_8_14_day_outlk/MapServer'
};
async function cpcOutlookAtPoint(loc, baseUrl){
  const geom = loc.lon + ',' + loc.lat;
  const q = baseUrl + '/{layer}/query?geometry=' + geom
    + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects'
    + '&outFields=cat,prob&returnGeometry=false&f=json';
  const [tR, pR] = await Promise.all([fetch(q.replace('{layer}', '0')), fetch(q.replace('{layer}', '1'))]);
  const pick = async r => {
    if(!r.ok) return null;
    const j = await r.json();
    const a = j.features?.[0]?.attributes;
    if(!a?.cat) return null;
    return { cat: a.cat, prob: a.prob };
  };
  return { temp: await pick(tR), precip: await pick(pR) };
}
function cpcOutlookLine(label, temp, precip){
  const parts = [];
  if(temp?.cat) parts.push('temp ' + String(temp.cat).toLowerCase() + (temp.prob != null ? ' ' + Math.round(temp.prob) + '%' : ''));
  if(precip?.cat) parts.push('precip ' + String(precip.cat).toLowerCase() + (precip.prob != null ? ' ' + Math.round(precip.prob) + '%' : ''));
  if(!parts.length) return '';
  return '<div class="cpc-row"><span class="cpc-lbl">' + esc(label) + '</span><span class="cpc-val">' + esc(parts.join(' \u00B7 ')) + '</span></div>';
}
let forecastCpcGen = 0;
async function loadForecastCpcTeaser(loc){
  const box = $('forecastCpcTeaser');
  if(!box) return;
  if(!isLikelyUS(loc)){ box.hidden = true; box.innerHTML = ''; return; }
  const gen = ++forecastCpcGen;
  box.hidden = false;
  box.innerHTML = '<div class="forecast-cpc-lbl">CPC extended outlook</div><div class="radar-note">Loading\u2026</div>';
  try{
    const [d610, d814] = await Promise.all([
      cpcOutlookAtPoint(loc, CPC_OUTLOOK_BASE.d610),
      cpcOutlookAtPoint(loc, CPC_OUTLOOK_BASE.d814)
    ]);
    if(gen !== forecastCpcGen) return;
    const rows = cpcOutlookLine('Days 6\u201310', d610.temp, d610.precip)
      + cpcOutlookLine('Days 8\u201314', d814.temp, d814.precip);
    if(!rows){
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = '<div class="forecast-cpc-lbl">CPC extended outlook at your location</div>'
      + '<div class="cpc-rows">' + rows + '</div>'
      + '<p class="radar-note" style="margin-top:8px"><a href="https://www.cpc.ncep.noaa.gov/products/predictions/long_range/" target="_blank" rel="noopener">Full CPC outlook maps \u2192</a></p>';
  }catch(e){
    if(gen !== forecastCpcGen) return;
    box.hidden = false;
    box.innerHTML = '<div class="forecast-cpc-lbl">CPC extended outlook</div>' + panelUnavail('cpc_api');
    console.warn('cpcTeaser', e);
  }
}
const USDM_QUERY = 'https://services5.arcgis.com/0OTVzJS4K09zlixn/arcgis/rest/services/USDM_current/FeatureServer/0/query';
const USDM_LABELS = ['', 'Abnormally dry (D0)', 'Moderate drought (D1)', 'Severe drought (D2)', 'Extreme drought (D3)', 'Exceptional drought (D4)'];
async function usdmAtPoint(loc){
  const cacheKey = 'st_usdm_' + loc.lat.toFixed(1) + '_' + loc.lon.toFixed(1);
  const hit = store.get(cacheKey);
  if(hit && Date.now() - hit.t < 7 * 24 * 3600 * 1000) return hit.data;
  const geom = loc.lon + ',' + loc.lat;
  const url = USDM_QUERY + '?geometry=' + geom
    + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects'
    + '&outFields=DM,MapDate&returnGeometry=false&f=json';
  const r = await fetch(url);
  if(!r.ok) return null;
  const j = await r.json();
  const a = j.features?.[0]?.attributes;
  if(!a || a.DM == null || a.DM < 1){
    store.set(cacheKey, { t: Date.now(), data: null });
    return null;
  }
  const data = {
    dm: a.DM,
    label: USDM_LABELS[a.DM] || ('Drought level D' + (a.DM - 1)),
    mapDate: a.MapDate ? new Date(a.MapDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  };
  store.set(cacheKey, { t: Date.now(), data });
  return data;
}
let forecastUsdmGen = 0;
async function loadForecastUsdmTeaser(loc){
  const box = $('forecastUsdmTeaser');
  if(!box) return;
  if(!isLikelyUS(loc)){ box.hidden = true; box.innerHTML = ''; return; }
  const gen = ++forecastUsdmGen;
  box.hidden = false;
  box.innerHTML = '<div class="forecast-usdm-lbl">U.S. Drought Monitor</div><div class="radar-note">Loading\u2026</div>';
  try{
    const usdm = await usdmAtPoint(loc);
    if(gen !== forecastUsdmGen) return;
    if(!usdm){
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const warn = usdm.dm >= 3;
    box.className = 'forecast-usdm-teaser' + (warn ? ' drought-warn' : '');
    box.innerHTML = '<div class="forecast-usdm-lbl">U.S. Drought Monitor at your location</div>'
      + '<div class="forecast-usdm-val">' + esc(usdm.label)
      + (usdm.mapDate ? ' <span class="radar-note">(map ' + esc(usdm.mapDate) + ')</span>' : '')
      + '</div>'
      + '<p class="radar-note" style="margin-top:6px"><a href="https://droughtmonitor.unl.edu/" target="_blank" rel="noopener">Full drought map \u2192</a></p>';
  }catch(e){
    if(gen !== forecastUsdmGen) return;
    box.hidden = false;
    box.className = 'forecast-usdm-teaser';
    box.innerHTML = '<div class="forecast-usdm-lbl">U.S. Drought Monitor</div>' + panelUnavail('usdm_api');
    console.warn('usdmTeaser', e);
  }
}

async function loadAFD(loc){
  return panelTask('afdPanel', 'afdStatus', async () => {
    const a = $('afdLink');
    a.style.display = 'none';
    $('afdText').textContent = 'Loading discussion\u2026';
    $('afdMeta').textContent = '';
    try{
      const afd = await fetchLatestAfdText(loc);
      a.href = afd.link;
      a.textContent = 'Full AFD on forecast.weather.gov \u2192';
      a.style.display = 'inline';
      const fullText = afd.text || '(empty)';
      const highlight = afdHighlightText(fullText);
      const hlBox = $('afdHighlight');
      if(hlBox){
        if(highlight){
          hlBox.hidden = false;
          hlBox.innerHTML = '<div class="lbl">Forecast highlight</div>' + esc(highlight);
        }else{
          hlBox.hidden = true;
          hlBox.innerHTML = '';
        }
      }
      $('afdText').textContent = fullText;
      $('afdMeta').textContent = 'NWS ' + afd.cwa + (afd.issued
        ? ' \u00B7 issued ' + new Date(afd.issued).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' })
        : '');
    }catch(e){
      $('afdText').innerHTML = panelUnavail('no_discussion');
      console.error('afd', e);
    }
  });
}

// ---------- NWS hourly grid (More tab) ----------
async function fetchNwsGridHourlyPeriods(loc, limit){
  if(!isLikelyUS(loc)) return [];
  const pr = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
  if(!pr.ok) throw new Error('points');
  const pts = (await pr.json()).properties;
  const wfo = pts.gridId || pts.cwa;
  const gx = pts.gridX, gy = pts.gridY;
  if(!wfo || gx == null || gy == null) throw new Error('grid');
  const r = await nwsFetch('https://api.weather.gov/gridpoints/' + wfo + '/' + gx + ',' + gy + '/forecast/hourly');
  if(!r.ok) throw new Error('hourly http ' + r.status);
  const j = await r.json();
  return (j.properties?.periods || []).slice(0, limit || 18);
}
async function fetchNbmHourlyPeriods(loc, limit){
  const periods = await fetchNwsGridHourlyPeriods(loc, 18);
  const max = limit || 8;
  return periods.filter(p =>
    (p.probabilityOfPrecipitation?.value ?? 0) > 0 || /rain|shower|storm|snow|drizzle|sleet|freezing/i.test(p.shortForecast || '')
  ).slice(0, max);
}
function nwsHourlyTemp(p){
  if(p.temperature == null) return '\u2014';
  const u = p.temperatureUnit === 'C' ? 'C' : 'F';
  return nwsTempToDisp(p.temperature, u) + '\u00B0';
}
function nwsHourlyWind(p){
  const parts = [p.windSpeed, p.windDirection].filter(Boolean);
  return parts.length ? parts.join(' ') : '';
}
function nwsHourlySky(p){
  const t = (p.shortForecast || '').toLowerCase();
  if(/thunder/.test(t)) return 'Storm';
  if(/snow|flurr/.test(t)) return 'Snow';
  if(/rain|shower|drizzle|sleet/.test(t)) return 'Rain';
  if(/fog/.test(t)) return 'Fog';
  if(/cloud|overcast/.test(t)) return 'Cloudy';
  if(/partly/.test(t)) return 'Partly';
  if(/clear|sunny/.test(t)) return 'Clear';
  const words = (p.shortForecast || '').split(/\s+/).slice(0, 2).join(' ');
  return words || '\u2014';
}
function renderNbmPeriodsHtml(periods, compact){
  return periods.map(p => {
    const prob = p.probabilityOfPrecipitation?.value;
    const start = p.startTime ? new Date(p.startTime).toLocaleString([], { weekday: compact ? 'short' : 'short', hour: 'numeric' }) : '';
    const high = prob != null && prob >= 50;
    if(compact){
      return '<div class="forecast-nbm-hour' + (high ? ' high' : '') + '"><span class="k">' + esc(start) + '</span>'
        + '<span class="v">' + nwsHourlyTemp(p) + '</span>'
        + (nwsHourlyWind(p) ? '<span class="nbm-sub">' + esc(nwsHourlyWind(p)) + '</span>' : '')
        + '<span class="nbm-sub">' + esc(nwsHourlySky(p)) + '</span>'
        + '<span class="nbm-pop">' + (prob != null ? prob + '%' : '\u2014') + '</span></div>';
    }
    return '<div class="metric"><div class="k">' + esc(start) + '</div><div class="v">'
      + nwsHourlyTemp(p) + '<small> \u00B7 ' + esc(nwsHourlyWind(p) || '\u2014') + ' \u00B7 ' + esc(nwsHourlySky(p))
      + (prob != null ? ' \u00B7 ' + prob + '% precip' : '') + '</small></div></div>';
  }).join('');
}
function renderNbmGridPanel(periods){
  const precip = periods.filter(p =>
    (p.probabilityOfPrecipitation?.value ?? 0) > 0 || /rain|shower|storm|snow|drizzle|sleet|freezing/i.test(p.shortForecast || '')
  ).slice(0, 8);
  const grid = periods.slice(0, 12);
  let html = '';
  if(precip.length){
    html += '<div class="nbm-section"><div class="forecast-nbm-lbl">Precip probability</div>'
      + '<div class="forecast-nbm-hours">' + renderNbmPeriodsHtml(precip, true) + '</div></div>';
  }
  if(grid.length){
    html += '<div class="nbm-section"><div class="forecast-nbm-lbl">Hourly grid (temp \u00B7 wind \u00B7 sky)</div>'
      + '<div class="forecast-nbm-hours">' + renderNbmPeriodsHtml(grid, true) + '</div></div>';
  }
  return html || panelUnavail('no_precip_prob');
}
async function loadNbm(loc){
  const panel = $('nbmPanel'), body = $('nbmBody');
  if(!panel || !body) return;
  if(!isLikelyUS(loc)){ panel.hidden = true; return; }
  return panelTask('nbmPanel', 'nbmStatus', async () => {
    panel.hidden = false;
    body.textContent = 'Loading NWS grid forecast\u2026';
    try{
      const periods = await fetchNwsGridHourlyPeriods(loc, 18);
      if(!periods.length){
        body.innerHTML = panelUnavail('no_precip_prob');
        return;
      }
      body.innerHTML = renderNbmGridPanel(periods)
        + '<p class="radar-note" style="margin-top:10px">From NWS grid hourly forecast at your location.</p>';
    }catch(e){
      panel.hidden = false;
      setPanelUnavail(body, 'nbm_api');
      console.warn('nbm', e);
    }
  });
}
