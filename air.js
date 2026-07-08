// ---------- air (AQI, pollen, UV & exposure) ----------
function visibilityQuality(mi){
  if(mi < 1) return 'Very poor visibility';
  if(mi < 3) return 'Poor visibility';
  if(mi < 5) return 'Moderate visibility';
  if(mi <= 10) return 'Good visibility';
  return 'Excellent visibility';
}
function dewPointNote(temp, dew){
  const spread = temp - dew;
  if(spread <= 3) return 'Very muggy air';
  if(spread <= 8) return 'Humid \u2014 muggy feel likely';
  if(spread <= 15) return 'Comfortable humidity';
  return 'Dry air';
}
function uvVerdictCls(u){
  if(u < 3) return 'good';
  if(u < 6) return 'mid';
  if(u < 8) return 'mid';
  return 'warn';
}
function uvValCls(u){
  if(u < 3) return 'uv-low';
  if(u < 6) return 'uv-mid';
  if(u < 8) return 'uv-mid';
  return 'uv-high';
}
function uvExposureNote(u){
  if(u < 3) return 'Minimal sun protection needed.';
  if(u < 6) return 'Some protection if outside for long periods.';
  if(u < 8) return 'Seek shade midday \u00B7 sunscreen and hat advised.';
  if(u < 11) return 'Reduce sun exposure 10am\u20134pm \u00B7 protection essential.';
  return 'Avoid midday sun \u00B7 high burn risk in minutes.';
}
function uvDayChartHtml(h, nowIdx, todayKey){
  const pts = [];
  for(let j = 0; j < h.time.length; j++){
    if(h.time[j].slice(0, 10) !== todayKey) continue;
    pts.push({ idx: j, uv: h.uv_index?.[j] ?? 0, t: h.time[j] });
  }
  if(!pts.length) return '';
  const w = 300, height = 100, padL = 4, padR = 4, maxUv = 11;
  const chartW = w - padL - padR;
  const yOfNum = u => height - 6 - (Math.min(Math.max(u, 0), maxUv) / maxUv) * (height - 12);
  const yOf = u => yOfNum(u).toFixed(1);
  const xOf = k => (padL + (pts.length < 2 ? chartW / 2 : (k / (pts.length - 1)) * chartW)).toFixed(1);
  let bands = '';
  [3, 6, 8].forEach(v => {
    bands += '<line x1="' + padL + '" y1="' + yOf(v) + '" x2="' + (w - padR) + '" y2="' + yOf(v)
      + '" stroke="currentColor" stroke-opacity=".15" stroke-dasharray="2,3" vector-effect="non-scaling-stroke"/>';
  });
  const linePts = pts.map((p, k) => xOf(k) + ',' + yOf(p.uv));
  const area = padL + ',' + height + ' ' + linePts.join(' ') + ' ' + (w - padR) + ',' + height;
  const nowK = pts.findIndex(p => p.idx === nowIdx);
  let nowLine = '';
  if(nowK >= 0 && pts.length > 1){
    const nx = xOf(nowK);
    nowLine = '<line class="uv-day-now" x1="' + nx + '" y1="4" x2="' + nx + '" y2="' + (height - 4)
      + '" vector-effect="non-scaling-stroke"/>';
  }
  const tickStep = Math.max(1, Math.ceil(pts.length / 5));
  const tickIdx = [];
  for(let k = 0; k < pts.length; k += tickStep) tickIdx.push(k);
  if(tickIdx[tickIdx.length - 1] !== pts.length - 1) tickIdx.push(pts.length - 1);
  let xTicksSvg = '';
  tickIdx.forEach(k => {
    const x = xOf(k);
    xTicksSvg += '<line x1="' + x + '" y1="' + (height - 4) + '" x2="' + x + '" y2="' + (height - 10)
      + '" stroke="currentColor" stroke-opacity=".35" vector-effect="non-scaling-stroke"/>';
  });
  const peak = pts.reduce((a, p) => p.uv > a.uv ? p : a, pts[0]);
  const svg = '<svg viewBox="0 0 ' + w + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="UV index through today, peak '
    + peak.uv.toFixed(1) + '">'
    + bands + xTicksSvg
    + '<polygon points="' + area + '" fill="currentColor" opacity=".18"/>'
    + '<polyline points="' + linePts.join(' ') + '" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>'
    + nowLine + '</svg>';
  const tickHtml = '<div class="uv-day-ticks">' + tickIdx.map(k =>
    '<div class="uv-day-tick' + (pts[k].idx === nowIdx ? ' now' : '') + '">'
    + '<div class="uv-day-tick-t">' + (pts[k].idx === nowIdx ? 'Now' : hourLabelCompact(pts[k].t)) + '</div>'
    + '<div class="uv-day-tick-v">' + pts[k].uv.toFixed(1) + '</div>'
    + '</div>'
  ).join('') + '</div>';
  const yAxisHtml = '<div class="uv-y-axis" aria-hidden="true">'
    + [11, 8, 5, 0].map(v => '<span>' + v + '</span>').join('') + '</div>';
  return '<div class="uv-day-chart-inner">' + yAxisHtml
    + '<div class="uv-chart-body">' + svg + tickHtml + '</div></div>'
    + '<div class="uv-day-chart-note">Peak ' + peak.uv.toFixed(1) + ' near ' + hourLabelCompact(peak.t)
    + ' \u00B7 dashed lines at 3 / 6 / 8</div>';
}
function hourlyComfortNote(temp, dew){
  const spread = temp - dew;
  if(spread <= 3) return 'Muggy';
  if(spread <= 8) return 'Humid';
  if(spread <= 15) return 'Comfortable';
  return 'Dry air';
}
function exposureVisibility(d, c, i){
  const visUnit = (d.om && d.om.hourly_units && d.om.hourly_units.visibility) || 'm';
  let visMeters = c.visibility_m;
  if(visMeters == null && d.hourly.visibility) visMeters = d.hourly.visibility[i];
  if(visUnit === 'ft' && visMeters != null) visMeters = visMeters * 0.3048;
  const visMiNum = visMeters != null
    ? (state.units === 'F' ? visMeters / 1609.34 : visMeters / 1000)
    : null;
  const vis = visMiNum != null
    ? (state.units === 'F' ? visMiNum.toFixed(1) + '<small> mi</small>' : visMiNum.toFixed(1) + '<small> km</small>')
    : '\u2014';
  return { vis, visMiNum };
}
function renderExposure(d){
  if(!d || !d.hourly || !d.hourly.time || !d.hourly.time.length) return;
  const c = d.current || {};
  const i = nowIndex(d);
  const h = d.hourly;
  const uvSeries = h.uv_index || [];
  const uvNow = uvSeries[i] ?? 0;
  const todayKey = h.time[i].slice(0, 10);
  let peakIdx = i, peakUv = uvNow;
  for(let j = i; j < h.time.length && h.time[j].slice(0, 10) === todayKey; j++){
    const u = uvSeries[j] ?? 0;
    if(u > peakUv){ peakUv = u; peakIdx = j; }
  }
  const uvMax = (d.daily && d.daily.uv_index_max && d.daily.uv_index_max[0] != null)
    ? d.daily.uv_index_max[0]
    : peakUv;
  const uvV = $('uvVerdict');
  if(uvV){
    uvV.textContent = uvNow.toFixed(1) + ' \u2014 ' + uvCat(uvNow);
    uvV.className = 'verdict ' + uvVerdictCls(uvNow);
  }
  const peakStr = peakUv > 0.5
    ? 'Peak near ' + hourLabelCompact(h.time[peakIdx]) + ' (' + peakUv.toFixed(1) + ')'
    : 'Low sun angle today';
  const uvD = $('uvDetail');
  if(uvD) uvD.textContent = 'Today\u2019s max ' + Number(uvMax).toFixed(1) + ' \u00B7 ' + peakStr + ' \u00B7 ' + uvExposureNote(uvNow);

  const temp = c.temperature_2m ?? h.temperature_2m[i] ?? 0;
  const dewVal = c.dewpoint_c != null
    ? (state.units === 'F' ? Math.round(c.dewpoint_c * 9/5 + 32) : Math.round(c.dewpoint_c))
    : Math.round((h.dew_point_2m && h.dew_point_2m[i]) ?? 0);
  const rh = rhDisp(c.relative_humidity_2m ?? (h.relative_humidity_2m && h.relative_humidity_2m[i]));
  const { vis, visMiNum } = exposureVisibility(d, c, i);
  const wetRaw = h.wet_bulb_temperature_2m && h.wet_bulb_temperature_2m[i];
  const wetBulb = Math.round(wetRaw != null ? wetRaw : temp);
  const rows = [
    ['Humidity', rh + '<small>%</small>', dewPointNote(temp, dewVal)],
    ['Dew point', dewVal + '<small>' + degSym() + '</small>', dewPointNote(temp, dewVal)],
    ['Visibility', vis, visMiNum != null ? visibilityQuality(visMiNum) : ''],
    ['Wet bulb', wetBulb + '<small>' + degSym() + '</small>', 'Evaporative cooling / heat stress']
  ];
  const box = $('exposureMetrics');
  if(box){
    box.innerHTML = rows.map(r =>
      '<div class="metric"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div>'
      + (r[2] ? '<div class="s">' + esc(r[2]) + '</div>' : '') + '</div>'
    ).join('');
  }

  const uvChart = $('uvDayChart');
  const uvBlock = $('uvDayChartBlock');
  if(uvChart){
    const chartHtml = uvDayChartHtml(h, i, todayKey);
    if(chartHtml){
      uvChart.innerHTML = chartHtml;
      if(uvBlock) uvBlock.hidden = false;
    }else{
      uvChart.innerHTML = '';
      if(uvBlock) uvBlock.hidden = true;
    }
  }

  const strip = $('exposureUvStrip');
  if(!strip) return;
  const rhSeries = h.relative_humidity_2m || [];
  const tempSeries = h.temperature_2m || [];
  const dewSeries = h.dew_point_2m || [];
  const cells = [];
  for(let j = i; j < h.time.length && h.time[j].slice(0, 10) === todayKey; j++){
    const uv = uvSeries[j] ?? 0;
    const temp = Math.round(tempSeries[j] ?? 0);
    const dew = Math.round(dewSeries[j] ?? temp);
    const rh = rhDisp(rhSeries[j]);
    const comfort = hourlyComfortNote(temp, dew);
    cells.push('<div class="hour exposure-hour' + (j === i ? ' now-h' : '') + '">'
      + '<div class="t">' + (j === i ? 'Now' : hourLabelCompact(h.time[j])) + '</div>'
      + '<div class="ex-row"><span class="ex-k">UV</span><span class="ex-v ' + uvValCls(uv) + '">' + uv.toFixed(1) + '</span></div>'
      + '<div class="ex-row"><span class="ex-k">RH</span><span class="ex-v">' + rh + '%</span></div>'
      + '<div class="ex-note">' + comfort + (uv >= 3 ? ' \u00B7 ' + uvCat(uv) + ' sun' : '') + '</div>'
      + '</div>');
    if(cells.length >= 10) break;
  }
  strip.innerHTML = cells.length
    ? cells.join('')
    : '<div class="radar-note">Outdoor exposure stays low for the rest of today.</div>';
}

// ---------- air quality (AirNow US + Open-Meteo fallback) ----------
function fmtVal(v){
  return v == null || v === '' ? '\u2014' : v;
}
async function fetchAirNow(loc){
  if(!isLikelyUS(loc)) return null;
  try{
    const proxy = '/api/airnow?latitude=' + loc.lat + '&longitude=' + loc.lon + '&distance=50';
    const r = await fetchTimeout(proxy, {}, 8000);
    if(!r.ok) return null;
    const j = await r.json();
    if(!Array.isArray(j) || !j.length) return null;
    const site = j[0].ReportingArea || j[0].SiteName || 'Nearest monitor';
    const state = j[0].StateCode ? ', ' + j[0].StateCode : '';
    const params = j.map(rec => ({
      name: rec.ParameterName || '?',
      aqi: rec.AQI,
      category: rec.Category?.Name || '\u2014'
    })).filter(p => p.aqi != null);
    if(!params.length) return null;
    const maxAqi = Math.max(...params.map(p => p.aqi));
    const slat = parseFloat(j[0].Latitude), slon = parseFloat(j[0].Longitude);
    let distMi = null, dir = '';
    if(Number.isFinite(slat) && Number.isFinite(slon)){
      distMi = Math.round(haversineMi(loc.lat, loc.lon, slat, slon));
      dir = compass(bearingDeg(loc.lat, loc.lon, slat, slon));
    }
    return { site: site + state, params, aqi: maxAqi, distMi, dir };
  }catch(e){ return null; }
}
async function fetchPollen(loc){
  if(!serverIntegrations.pollen) return null;
  try{
    const proxy = '/api/pollen?latitude=' + loc.lat + '&longitude=' + loc.lon + '&days=3';
    const r = await fetchTimeout(proxy, {}, 8000);
    if(!r.ok) return null;
    const j = await r.json();
    if(!j.days || !j.days.length) return null;
    return j;
  }catch(e){ return null; }
}
function collectPollenTodayRows(pollen){
  const rows = [];
  renderPollenRows(pollen, rows);
  return rows;
}
function renderPollenTodayDetailHtml(rows){
  if(!rows || !rows.length) return '';
  return '<div class="pollen-today-detail">' + rows.map(r =>
    '<div class="pd-row"><span>' + r[0] + '</span><span class="pd-val">' + r[1] + '</span></div>'
  ).join('') + '</div>';
}
function collectMeteoPollenTodayRows(c){
  if(!c) return [];
  return [
    ['Grass', c.grass_pollen], ['Birch', c.birch_pollen], ['Alder', c.alder_pollen],
    ['Ragweed', c.ragweed_pollen], ['Mugwort', c.mugwort_pollen], ['Olive', c.olive_pollen]
  ].filter(p => p[1] !== null && p[1] !== undefined)
    .map(p => [p[0] + ' pollen', p[1] + '<small> gr/m\u00B3</small>']);
}
function renderPollenRows(pollen, rows){
  const today = pollen.days[0];
  if(!today || !Array.isArray(today.types)) return;
  today.types.forEach(t => {
    if(!t.inSeason && !t.index) return;
    rows.push([t.name + ' pollen', t.index + '<small> \u2014 ' + t.category + '</small>']);
  });
  today.plants.slice(0, 4).forEach(p => {
    if(p.index < 1) return;
    rows.push([p.name, p.index + '<small> UPI \u00B7 ' + p.category + '</small>']);
  });
}
function polShortName(name){
  const n = String(name || '').toUpperCase();
  if(n.includes('PM2.5') || n === 'PM25') return 'PM2.5';
  if(n.includes('PM10')) return 'PM10';
  if(n === 'O3' || n.includes('OZONE')) return 'O\u2083';
  if(n.includes('NO2')) return 'NO\u2082';
  return name;
}
function buildAirNowDetail(airNow){
  const worst = airNow.params.reduce((a, b) => (a.aqi > b.aqi ? a : b), airNow.params[0]);
  const readings = airNow.params.map(p => polShortName(p.name) + ' ' + p.aqi).join(', ');
  const dist = airNow.distMi != null && airNow.dir
    ? ' (' + airNow.distMi + ' mi ' + airNow.dir + ')'
    : '';
  return 'Nearest EPA monitor' + dist + ': ' + airNow.site + '. '
    + 'The US AQI above is the highest reading at that station right now ('
    + polShortName(worst.name) + ' ' + worst.aqi + '). '
    + 'Measured pollutants: ' + readings + '.';
}
function renderAirMetricSections(sections){
  if(!sections.length) return '';
  return sections.map((sec, i) => {
    if(!sec.rows.length) return '';
    return '<div class="air-metrics-section' + (i === 0 ? ' first' : '') + '">'
      + '<div class="metrics-lbl air-metrics-lbl">' + esc(sec.title) + '</div>'
      + '<div class="air-metrics-grid">' + sec.rows.map(r =>
        '<div class="metric"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>'
      ).join('') + '</div></div>';
  }).join('');
}
function pollenCatCls(cat){
  const c = (cat || '').toLowerCase();
  if(c.includes('very high')) return 'pl-very-high';
  if(c === 'high') return 'pl-high';
  if(c.includes('moderate')) return 'pl-mid';
  if(c.includes('low')) return 'pl-low';
  return 'pl-none';
}
function pollenIndexTier(index){
  const n = index == null || index <= 0 ? 0 : Math.round(index);
  if(n <= 24) return { label: 'Low', cls: 'pl-low', score: n };
  if(n <= 49) return { label: 'Moderate', cls: 'pl-mid', score: n };
  if(n <= 74) return { label: 'High', cls: 'pl-high', score: n };
  return { label: 'Very High', cls: 'pl-very-high', score: n };
}
function pollenRiskMessage(tier){
  if(tier.cls === 'pl-mid') return 'May cause symptoms in sensitive individuals.';
  if(tier.cls === 'pl-high') return 'Likely to cause symptoms in sensitive individuals.';
  if(tier.cls === 'pl-very-high') return 'Very likely to cause symptoms in sensitive individuals.';
  return 'Limited risk to pollen sensitive individuals.';
}
const POLLEN_TIPS = [
  { icon: '😷', text: 'Masks recommended if you are sensitive', min: 'pl-mid' },
  { icon: '🕶', text: 'Sunglasses recommended if you are sensitive', min: 'pl-mid' },
  { icon: '👕', text: 'Avoid woolen clothes outdoors if you are sensitive', min: 'pl-high' },
  { icon: '🚿', text: 'Take a shower after going out', min: 'pl-mid' },
  { icon: '🪟', text: 'Close windows and doors if you are sensitive', min: 'pl-mid' },
  { icon: '🚶', text: 'Reduce time outdoors if you are sensitive', min: 'pl-high' }
];
function pollenTipsHtml(){
  return '<div class="pollen-tips">' + POLLEN_TIPS.map(t =>
    '<div class="pollen-tip"><span class="pollen-tip-ico" aria-hidden="true">' + t.icon + '</span><span>' + esc(t.text) + '</span></div>'
  ).join('') + '</div>';
}
function pollenArcSvg(pct, strokeCls){
  const p = Math.min(1, Math.max(0, pct / 100));
  const r = 42, cx = 54, cy = 50;
  const start = Math.PI;
  const end = start - p * Math.PI;
  const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
  const large = p > 0.5 ? 1 : 0;
  const track = 'M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 1 1 ' + (cx + r) + ' ' + cy;
  const fill = p > 0
    ? 'M ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + large + ' 0 ' + x2 + ' ' + y2
    : '';
  const color = strokeCls === 'pl-mid' ? 'var(--warm)' : (strokeCls === 'pl-high' || strokeCls === 'pl-very-high' ? 'var(--warn)' : 'var(--good)');
  return '<svg viewBox="0 0 108 56" aria-hidden="true">'
    + '<path d="' + track + '" fill="none" stroke="var(--line)" stroke-width="7" stroke-linecap="round"/>'
    + (fill ? '<path d="' + fill + '" fill="none" stroke="' + color + '" stroke-width="7" stroke-linecap="round"/>' : '')
    + '</svg>';
}
function pollenRingSvg(pct, strokeCls){
  const p = Math.min(1, Math.max(0, pct / 100));
  const r = 22, c = 26;
  const circ = 2 * Math.PI * r;
  const dash = circ * p;
  const color = strokeCls === 'pl-mid' ? 'var(--warm)' : (strokeCls === 'pl-high' || strokeCls === 'pl-very-high' ? 'var(--warn)' : 'var(--good)');
  return '<svg viewBox="0 0 52 52" aria-hidden="true">'
    + '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="4"/>'
    + '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="4"'
    + ' stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '" transform="rotate(-90 ' + c + ' ' + c + ')"/>'
    + '</svg>';
}
function pollenTypeFromGoogle(types, code){
  if(!Array.isArray(types)) return { index: 0, label: 'Low', cls: 'pl-low', name: code === 'GRASS' ? 'Grass' : code === 'TREE' ? 'Tree' : 'Weed' };
  const t = types.find(x => x.code === code);
  const name = code === 'GRASS' ? 'Grass' : code === 'TREE' ? 'Tree' : 'Weed';
  if(!t || (!t.inSeason && !t.index)) return { index: 0, label: 'Low', cls: 'pl-low', name };
  const tier = pollenIndexTier(t.index);
  return { index: t.index, label: tier.label, cls: tier.cls, name };
}
function pollenOverallFromGoogle(day){
  if(!day || !Array.isArray(day.types)) return { index: 0, label: 'Low', cls: 'pl-low', main: '' };
  let max = 0, main = '';
  day.types.forEach(t => {
    if(!t.inSeason && !t.index) return;
    const idx = t.index || 0;
    if(idx >= max){
      max = idx;
      const code = (t.code || '').toUpperCase();
      main = code === 'GRASS' ? 'Grass' : code === 'TREE' ? 'Tree' : code === 'WEED' ? 'Weed' : (t.name || '');
    }
  });
  const tier = pollenIndexTier(max);
  return { index: max, label: tier.label, cls: tier.cls, main };
}
function meteoPollenIndex(v){
  if(v == null || v <= 0) return 0;
  if(v < 10) return Math.round(v * 2);
  if(v < 50) return Math.round(20 + v * 0.6);
  return Math.min(100, Math.round(50 + v));
}
function pollenOverallFromMeteo(daily, i){
  const grass = meteoPollenIndex(daily.grass_pollen?.[i]);
  const tree = meteoPollenIndex(Math.max(daily.birch_pollen?.[i] ?? 0, daily.alder_pollen?.[i] ?? 0, daily.olive_pollen?.[i] ?? 0));
  const weed = meteoPollenIndex(Math.max(daily.ragweed_pollen?.[i] ?? 0, daily.mugwort_pollen?.[i] ?? 0));
  const max = Math.max(grass, tree, weed);
  const tier = pollenIndexTier(max);
  const main = max === grass ? 'Grass' : max === tree ? 'Tree' : max === weed ? 'Weed' : '';
  return { index: max, label: tier.label, cls: tier.cls, main, grass, tree, weed };
}
function pollenRingHtml(ico, name, tier){
  const fill = tier.score > 0 ? tier.score : 0;
  return '<div class="pollen-ring">'
    + '<div class="pollen-ring-arc">' + pollenRingSvg(fill, tier.cls) + '</div>'
    + '<div class="pollen-ring-ico" aria-hidden="true">' + ico + '</div>'
    + '<div class="pollen-ring-name">' + esc(name) + '</div>'
    + '<div class="pollen-ring-cat ' + tier.cls + '">' + esc(tier.label) + '</div>'
    + '</div>';
}
function pollenDayPillHtml(label, tier, isToday){
  return '<div class="pollen-day-pill' + (isToday ? ' pd-today' : '') + '">'
    + '<div class="pdp-dn">' + esc(label) + '</div>'
    + '<div class="pdp-cat ' + tier.cls + '">' + esc(tier.label) + '</div>'
    + '</div>';
}
function renderPollenMsnHtml(todayOverall, grassTier, treeTier, weedTier, dayPills){
  const tier = pollenIndexTier(todayOverall.index);
  const mainLine = todayOverall.main
    ? '<div class="pollen-main-type">Main allergy: <strong>' + esc(todayOverall.main) + '</strong></div>'
    : '';
  let html = '<div class="pollen-msn">'
    + '<div class="pollen-msn-hero">'
    + '<div class="pollen-gauge">'
    + pollenArcSvg(tier.score || 8, tier.cls)
    + '<div class="pollen-gauge-lbl ' + tier.cls + '">' + esc(tier.label) + '</div>'
    + '<div class="pollen-gauge-val ' + tier.cls + '">' + (tier.score || 0) + '</div>'
    + '</div>'
    + '<div class="pollen-hero-copy">'
    + '<p class="pollen-risk-msg">' + esc(pollenRiskMessage(tier)) + '</p>'
    + mainLine
    + '</div>'
    + '<div class="pollen-type-rings">'
    + pollenRingHtml('🌿', 'Grass', grassTier)
    + pollenRingHtml('🌳', 'Tree', treeTier)
    + pollenRingHtml('🌱', 'Weed', weedTier)
    + '</div>'
    + '</div>'
    + pollenTipsHtml()
    + '<div class="pollen-days-row">' + dayPills.join('') + '</div>';
  return html + '</div>';
}
function meteoPollenLevel(v){
  if(v == null || v <= 0) return { text: 'Off', cls: 'pd-none' };
  if(v < 10) return { text: 'Low', cls: 'pd-low' };
  if(v < 50) return { text: 'Moderate', cls: 'pd-mid' };
  return { text: 'High', cls: 'pd-high' };
}
function meteoTreePollen(daily, i){
  const vals = [daily.birch_pollen[i], daily.alder_pollen[i], daily.olive_pollen[i]].filter(v => v != null);
  return meteoPollenLevel(vals.length ? Math.max(...vals) : 0);
}
function meteoWeedPollen(daily, i){
  const vals = [daily.ragweed_pollen[i], daily.mugwort_pollen[i]].filter(v => v != null);
  return meteoPollenLevel(vals.length ? Math.max(...vals) : 0);
}
function meteoPollenDailyFromHourly(h){
  if(!h || !h.time || !h.time.length) return null;
  const keys = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'olive_pollen', 'ragweed_pollen'];
  const byDay = new Map();
  h.time.forEach((t, i) => {
    const day = t.slice(0, 10);
    if(!byDay.has(day)) byDay.set(day, { time: day });
    const row = byDay.get(day);
    keys.forEach(k => {
      const v = h[k] && h[k][i];
      if(v != null) row[k] = Math.max(row[k] ?? 0, v);
    });
  });
  const days = [...byDay.values()].slice(0, 3);
  if(!days.length) return null;
  const out = { time: days.map(d => d.time) };
  keys.forEach(k => { out[k] = days.map(d => d[k] ?? 0); });
  return out;
}
function pollenDayLabel(dateStr, i){
  if(i === 0) return 'Today';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString([], { weekday: 'short' });
}
function renderPollenPlaceholder(){
  const box = $('pollenForecast'), block = $('pollenBlock');
  if(!box || !block) return;
  block.style.display = 'block';
  const off = pollenIndexTier(0);
  const pills = ['Today', 'Tomorrow', 'Day 3'].map((lbl, i) => pollenDayPillHtml(lbl, off, i === 0));
  box.innerHTML = renderPollenMsnHtml(
    { index: 0, main: '' }, off, off, off, pills
  );
}
function renderPollenFromMeteoDaily(daily){
  const box = $('pollenForecast'), block = $('pollenBlock');
  if(!box || !block || !daily || !daily.time || !daily.time.length) return false;
  block.style.display = 'block';
  const days = daily.time.slice(0, 3).map((dateStr, i) => {
    const o = pollenOverallFromMeteo(daily, i);
    return {
      label: pollenDayLabel(dateStr, i),
      overall: o,
      grass: pollenIndexTier(o.grass ?? 0),
      tree: pollenIndexTier(o.tree ?? 0),
      weed: pollenIndexTier(o.weed ?? 0),
      isToday: i === 0
    };
  });
  const today = days[0];
  box.innerHTML = renderPollenMsnHtml(
    today.overall,
    today.grass, today.tree, today.weed,
    days.map(d => pollenDayPillHtml(d.label, pollenIndexTier(d.overall.index), d.isToday))
  );
  return true;
}
function renderPollenForecast(pollen, meteoDaily){
  const box = $('pollenForecast'), block = $('pollenBlock');
  if(!box || !block) return;
  block.style.display = 'block';
  if(pollen && pollen.days && pollen.days.length){
    const days = pollen.days.slice(0, 3).map((day, i) => {
      const overall = pollenOverallFromGoogle(day);
      const grass = pollenTypeFromGoogle(day.types, 'GRASS');
      const tree = pollenTypeFromGoogle(day.types, 'TREE');
      const weed = pollenTypeFromGoogle(day.types, 'WEED');
      return {
        label: pollenDayLabel(day.date, i),
        overall,
        grass: pollenIndexTier(grass.index),
        tree: pollenIndexTier(tree.index),
        weed: pollenIndexTier(weed.index),
        isToday: i === 0
      };
    });
    const today = days[0];
    box.innerHTML = renderPollenMsnHtml(
      today.overall,
      today.grass, today.tree, today.weed,
      days.map(d => pollenDayPillHtml(d.label, pollenIndexTier(d.overall.index), d.isToday))
    );
    return;
  }
  if(meteoDaily && renderPollenFromMeteoDaily(meteoDaily)) return;
  renderPollenPlaceholder();
}
function renderPollenMeta(pollen){
  if(!pollen) return '';
  if(pollen.quotaPaused){
    return 'Showing last available forecast \u2014 daily pollen data limit reached.';
  }
  return '';
}
let airLoadGen = 0;
function renderAirnowKey(){
  const row = $('airnowRow');
  if(row){ row.style.display = 'none'; row.textContent = ''; }
}
async function loadAir(loc){
  const gen = ++airLoadGen;
  return panelTask('airPanel', 'airStatus', async () => {
    let meteoDaily = null;
    const pollenBox = $('pollenForecast');
    if(!pollenBox || !pollenBox.children.length) renderPollenPlaceholder();
    try{
      $('pollenNote').textContent = '';
      let aqi = null, source = '', detail = '', sections = [];
      const [airNow, pollen] = await Promise.all([fetchAirNow(loc), fetchPollen(loc)]);
      if(airLoadGen !== gen) return;
      if(airNow){
        aqi = airNow.aqi;
        source = 'EPA AirNow';
        sections.push({
          title: 'Pollutants at monitor (EPA AirNow)',
          rows: airNow.params.map(p =>
            [polShortName(p.name) + ' AQI', p.aqi + '<small> \u2014 ' + p.category + '</small>']
          )
        });
      }
      const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
        + '?latitude=' + Number(loc.lat).toFixed(4) + '&longitude=' + Number(loc.lon).toFixed(4)
        + '&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen'
        + '&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen'
        + '&forecast_days=3&timezone=auto';
      let j = null;
      if(!aqi || !pollen || !meteoDaily){
        try{
          const r = await fetch(url);
          if(r.ok) j = await r.json();
        }catch(e){ console.warn('meteo air', e); }
      }
      const c = j ? j.current : null;
      meteoDaily = j ? (meteoPollenDailyFromHourly(j.hourly) || j.daily) : meteoDaily;
      if(airLoadGen !== gen) return;
      if(!aqi && c && c.us_aqi != null){
        aqi = c.us_aqi;
        source = 'Open-Meteo modeled';
        detail = isLikelyUS(loc)
          ? (serverIntegrations.airnow
            ? 'Modeled US AQI \u2014 no EPA monitor within 50 mi.'
            : 'Modeled US AQI (Open-Meteo).')
          : 'Composite of PM, ozone, NO\u2082 and more (EPA scale).';
        sections.push({
          title: 'Modeled pollutants (Open-Meteo)',
          rows: [
            ['PM2.5', fmtVal(c.pm2_5) + '<small> \u00B5g/m\u00B3</small>'],
            ['PM10', fmtVal(c.pm10) + '<small> \u00B5g/m\u00B3</small>'],
            ['Ozone', fmtVal(c.ozone) + '<small> \u00B5g/m\u00B3</small>'],
            ['NO\u2082', fmtVal(c.nitrogen_dioxide) + '<small> \u00B5g/m\u00B3</small>']
          ]
        });
      } else if(!aqi && c){
        source = source || 'Open-Meteo modeled';
        detail = detail || 'Modeled pollutants (US AQI unavailable for this point).';
        if(!sections.length){
          sections.push({
            title: 'Modeled pollutants (Open-Meteo)',
            rows: [
              ['PM2.5', fmtVal(c.pm2_5) + '<small> \u00B5g/m\u00B3</small>'],
              ['PM10', fmtVal(c.pm10) + '<small> \u00B5g/m\u00B3</small>'],
              ['Ozone', fmtVal(c.ozone) + '<small> \u00B5g/m\u00B3</small>'],
              ['NO\u2082', fmtVal(c.nitrogen_dioxide) + '<small> \u00B5g/m\u00B3</small>']
            ]
          });
        }
      }
      if(pollen){
        renderPollenForecast(pollen, meteoDaily);
        $('pollenNote').textContent = renderPollenMeta(pollen);
      } else if(c){
        const pollenTodayDetail = collectMeteoPollenTodayRows(c);
        renderPollenForecast(null, meteoDaily);
        $('pollenNote').textContent = pollenTodayDetail.length
          ? '3-day forecast uses Open-Meteo modeled levels.'
          : 'Levels are low or off-season.';
      } else {
        renderPollenForecast(null, meteoDaily);
        $('pollenNote').textContent = 'Levels are low or off-season.';
      }
      if(airNow) detail = buildAirNowDetail(airNow);
      if(airLoadGen !== gen) return;
      const v = $('aqiVerdict');
      if(aqi == null){
        v.textContent = 'No data';
        v.className = 'verdict';
        $('aqiDetail').innerHTML = source
          ? esc(detail || source)
          : panelUnavail('air_api');
      }else{
        const cat = AQI_CATS.find(x => aqi <= x[0]) || AQI_CATS[AQI_CATS.length - 1];
        v.textContent = aqi + ' \u2014 ' + cat[1];
        v.className = 'verdict ' + cat[2];
        $('aqiDetail').textContent = detail || (source ? 'Source: ' + source + '.' : '');
      }
      if(aqi != null && c && c.pm2_5 != null && c.pm2_5 >= 35){
        const smokeRow = ['Smoke / haze', (c.pm2_5 >= 55 ? 'High' : 'Moderate') + ' PM2.5 — check local smoke advisories<small></small>'];
        const airSec = sections.find(s => /AirNow|Open-Meteo/i.test(s.title));
        if(airSec) airSec.rows.push(smokeRow);
        else sections.unshift({ title: 'Air quality notes', rows: [smokeRow] });
      }
      $('airMetrics').innerHTML = renderAirMetricSections(sections);
      renderAirnowKey();
      outdoorAir = { aqi: aqi ?? null, pm25: c?.pm2_5 ?? null };
      syncSmokeRadarHint(outdoorAir.pm25, outdoorAir.aqi);
      if(state.data) renderActivityPlanner(state.data);
    }catch(e){
      $('aqiVerdict').textContent = 'unavailable';
      $('aqiDetail').innerHTML = panelUnavail('air_api');
      const pollenBox = $('pollenForecast');
      if(pollenBox) pollenBox.innerHTML = panelUnavail('pollen_api');
      $('pollenNote').textContent = '';
      $('airMetrics').innerHTML = '';
      $('airnowRow').style.display = 'none';
      syncSmokeRadarHint(null, null);
      console.error('air', e);
    }
  });
}
