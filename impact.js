// ---------- impact (planners, aurora, section nav) ----------
// ---------- activity planner ----------
let outdoorAir = { aqi: null, pm25: null };
function syncSmokeRadarHint(pm25, aqi){
  const box = $('smokeRadarHint'), text = $('smokeRadarHintText');
  if(!box || !text) return;
  const loc = state.locations[state.active];
  if(!loc || !isLikelyUS(loc)){
    box.hidden = true;
    return;
  }
  const elevated = (pm25 != null && pm25 >= 35) || (aqi != null && aqi >= 101);
  if(!elevated){
    box.hidden = true;
    return;
  }
  const high = (pm25 != null && pm25 >= 55) || (aqi != null && aqi >= 151);
  text.textContent = high
    ? 'High fine particles detected — wildfire smoke may be affecting air quality. View the NOAA HMS smoke analysis on radar.'
    : 'Elevated fine particles — smoke or haze may be nearby. View the NOAA HMS smoke analysis on radar.';
  box.hidden = false;
  if(threatLayerOpts.hmsSmoke){
    const btn = $('smokeRadarBtn');
    if(btn) btn.textContent = 'Smoke layer on — open radar';
  }
}
function isRainWxCode(c){
  return (c >= 51 && c <= 67) || (c >= 80 && c <= 82);
}
function isStormWxCode(c){ return c >= 95; }
function isSnowWxCode(c){ return (c >= 71 && c <= 77) || c === 85 || c === 86; }
function isIceWxCode(c){ return c === 56 || c === 57 || c === 66 || c === 67; }
function activityLocalMonth(d){
  const i0 = nowIndex(d);
  const t = d?.hourly?.time?.[i0];
  return t ? new Date(t).getMonth() : new Date().getMonth();
}
function getActivitySeason(loc, d){
  const month = activityLocalMonth(d);
  const lat = loc?.lat ?? 42;
  const nh = lat >= 0;
  const warmHigh = state.units === 'F' ? 62 : 17;
  const coldHigh = state.units === 'F' ? 45 : 7;
  const coldLow = state.units === 'F' ? 28 : -2;
  const mildHigh = state.units === 'F' ? 55 : 13;
  let avgHigh = null, avgLow = null;
  if(d?.daily?.temperature_2m_max?.length){
    const highs = d.daily.temperature_2m_max.slice(0, 5);
    const lows = d.daily.temperature_2m_min?.slice(0, 5) || [];
    avgHigh = highs.reduce((a, b) => a + b, 0) / highs.length;
    avgLow = lows.length ? lows.reduce((a, b) => a + b, 0) / lows.length : avgHigh;
  }
  const i0 = d?.hourly?.time?.length ? nowIndex(d) : 0;
  const snowDepth = d?.hourly?.snow_depth?.[i0] ?? d?.om?.hourly?.snow_depth?.[i0] ?? 0;
  const snowfallToday = d?.daily?.snowfall_sum?.[0] ?? 0;
  const hasSnow = snowDepth > 0.02 || snowfallToday > (state.units === 'F' ? 0.1 : 0.3);
  let warm = false, cold = false;

  if(avgHigh != null){
    warm = avgHigh >= warmHigh || (avgHigh >= mildHigh && avgLow >= (state.units === 'F' ? 38 : 3));
    cold = avgHigh < coldHigh || avgLow < coldLow;
    if(hasSnow) cold = true;
    // Trust the local forecast: mild/warm locations stay warm-season even in winter months.
    if(avgHigh >= mildHigh && avgLow >= (state.units === 'F' ? 40 : 4)) cold = false;
    if(avgHigh >= warmHigh) warm = true;
  }else{
    const winterMonth = nh ? [11, 0, 1, 2].includes(month) : [5, 6, 7, 8].includes(month);
    const summerMonth = nh ? [5, 6, 7, 8].includes(month) : [11, 0, 1, 2].includes(month);
    if(Math.abs(lat) < 32 && winterMonth) warm = true;
    else if(Math.abs(lat) > 40 && winterMonth) cold = true;
    else if(summerMonth) warm = true;
    else if(winterMonth) cold = true;
  }

  const shoulder = !warm && !cold;
  let note = 'Based on the forecast at this location. ';
  if(cold && !warm) note += 'Winter conditions here — skiing and shoveling replace golf, yard work, and beach/pool.';
  else if(warm && !cold) note += 'Warm conditions here — winter-only activities hidden.';
  else note += 'Mild shoulder season at this location.';
  return { warm, cold, shoulder, note };
}
function activitiesForSeason(season){
  return ACTIVITY_DEFS.filter(def => {
    if(def.season === 'warm') return !season.cold;
    if(def.season === 'cold') return season.cold;
    return true;
  });
}
function sortActivitiesForDisplay(defs, pins){
  if(!pins.length) return defs.slice();
  const pinSet = new Set(pins);
  const pinned = defs.filter(d => pinSet.has(d.id));
  const rest = defs.filter(d => !pinSet.has(d.id));
  return pinned.length ? pinned.concat(rest) : defs.slice();
}
function togglePlannerPin(id, pins, storeKey){
  const i = pins.indexOf(id);
  if(i >= 0) pins.splice(i, 1);
  else{
    if(pins.length >= 4) pins.shift();
    pins.push(id);
  }
  store.set(storeKey, pins);
  if(state.data) renderActivityPlanner(state.data);
}
function toggleActivityPin(id){ togglePlannerPin(id, activityPins, 'st_activity_pins'); }
function toggleImpactPin(id){ togglePlannerPin(id, impactPins, 'st_impact_pins'); }
function renderActivityPinBar(bar, defs, pins, onPin){
  if(!bar || defs.length < 2){ if(bar) bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = defs.map(def => {
    const on = pins.includes(def.id);
    return '<button type="button" class="act-pin-chip' + (on ? ' on' : '') + '" data-act-pin="' + def.id + '" aria-pressed="' + on + '">'
      + '<span class="pin-ico" aria-hidden="true">\u2605</span> ' + esc(def.name) + '</button>';
  }).join('');
  bar.querySelectorAll('[data-act-pin]').forEach(btn => {
    btn.addEventListener('click', () => onPin(btn.getAttribute('data-act-pin')));
  });
}
function activityPlannerTargets(defs, pins){
  if(!pins.length) return defs;
  const pinSet = new Set(pins);
  const pinned = defs.filter(d => pinSet.has(d.id));
  return pinned.length ? pinned : defs;
}
function buildActivityWindowSummary(d, defs, extra, impact){
  const pins = impact ? impactPins : activityPins;
  const targets = activityPlannerTargets(defs, pins);
  const windowSort = (a, b) => {
    const nowIso = d.hourly.time[nowIndex(d)];
    const aNow = nowIso && a.start <= nowIso && a.end >= nowIso;
    const bNow = nowIso && b.start <= nowIso && b.end >= nowIso;
    if(aNow !== bNow) return aNow ? -1 : 1;
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  };
  let bestGood = null, bestFair = null, worstPoor = null, worstFair = null;
  for(const def of targets){
    const hours = buildActivityHours(d, def, extra);
    const windows = mergeActivityWindows(hours);
    const good = windows.filter(w => w.grade === 'good').sort(windowSort);
    const fair = windows.filter(w => w.grade === 'fair').sort(windowSort);
    const poor = windows.filter(w => w.grade === 'poor').sort(windowSort);
    if(impact && poor.length){
      const w = poor[0];
      const sample = sampleHourInWindow(w, hours, def);
      const score = sample?.score ?? 0;
      if(!worstPoor || score < worstPoor.score) worstPoor = { def, window: w, score };
    }
    if(impact && fair.length){
      const w = fair[0];
      const sample = sampleHourInWindow(w, hours, def);
      const score = sample?.score ?? 100;
      if(!worstFair || score < worstFair.score) worstFair = { def, window: w, score };
    }
    if(good.length){
      const w = good[0];
      const sample = sampleHourInWindow(w, hours, def);
      const score = sample?.score ?? 0;
      if(!bestGood || score > bestGood.score) bestGood = { def, window: w, score };
    }
    if(fair.length){
      const w = fair[0];
      const sample = sampleHourInWindow(w, hours, def);
      const score = sample?.score ?? 0;
      if(!bestFair || score > bestFair.score) bestFair = { def, window: w, score };
    }
  }
  if(impact && worstPoor){
    return { cls: 'warn', html: 'Peak hazard: <strong>' + esc(worstPoor.def.name)
      + '</strong> <strong>' + esc(fmtActWindow(worstPoor.window)) + '</strong>.' };
  }
  if(impact && worstFair){
    return { cls: 'muted', html: 'Moderate hazard: <strong>' + esc(worstFair.def.name)
      + '</strong> <strong>' + esc(fmtActWindow(worstFair.window)) + '</strong>.' };
  }
  if(bestGood){
    const names = targets.filter(def => {
      const hours = buildActivityHours(d, def, extra);
      return mergeActivityWindows(hours).some(w => w.grade === 'good'
        && w.start === bestGood.window.start && w.end === bestGood.window.end);
    }).map(d => d.name);
    const nameTxt = names.length > 1 ? names.slice(0, 3).join(', ') : bestGood.def.name;
    if(impact){
      return { cls: '', html: 'Lowest impact window: <strong>' + esc(nameTxt)
        + '</strong> <strong>' + esc(fmtActWindow(bestGood.window)) + '</strong>.' };
    }
    return { cls: '', html: 'Best outdoor window: <strong>Good</strong> for ' + esc(nameTxt)
      + ' <strong>' + esc(fmtActWindow(bestGood.window)) + '</strong>.' };
  }
  if(bestFair){
    if(impact){
      return { cls: 'muted', html: 'Moderate impact for '
        + esc(bestFair.def.name) + ' <strong>' + esc(fmtActWindow(bestFair.window)) + '</strong>.' };
    }
    return { cls: 'muted', html: 'No good window soon — best <strong>fair</strong> stretch for '
      + esc(bestFair.def.name) + ' <strong>' + esc(fmtActWindow(bestFair.window)) + '</strong>.' };
  }
  return { cls: 'muted', html: impact
    ? 'Elevated impact across pinned hazards in the next 24 hours.'
    : 'No good or fair outdoor windows in the next 24 hours for pinned activities.' };
}
function activityWindChillF(ctx){
  if(state.units !== 'F') return null;
  const temp = ctx.temp, wind = ctx.wind;
  if(temp == null || wind < 3 || temp >= 50) return null;
  return Math.round(35.74 + 0.6215 * temp - 35.75 * Math.pow(wind, 0.16) + 0.4275 * temp * Math.pow(wind, 0.16));
}
function activityGrade(score){
  if(score >= 70) return 'good';
  if(score >= 45) return 'fair';
  return 'poor';
}
function activityOverallGrade(def, eligible, d){
  if(!eligible.length) return 'poor';
  const tz = d.timezone;
  const nowIso = d.hourly.time[nowIndex(d)];
  const nowH = eligible.find(h => h.time.slice(0, 13) === nowIso.slice(0, 13))
    || eligible.find(h => h.time >= nowIso && !h.ineligible)
    || eligible.find(h => !h.ineligible)
    || eligible[0];
  const nowAlert = activityAlertImpact(def, nowH.time, tz);
  if(nowAlert.notes.length){
    return activityGrade(nowH.score);
  }
  const alertHours = eligible.filter(h => {
    const imp = activityAlertImpact(def, h.time, tz);
    return imp.notes.length && imp.cap < 70;
  });
  if(alertHours.length){
    const peak = Math.max(...eligible.map(h => h.score));
    const alertPeak = Math.max(...alertHours.map(h => h.score));
    if(def.id === 'beach'){
      return activityGrade(Math.min(peak, Math.max(alertPeak, 55)));
    }
    return activityGrade(Math.min(peak, alertPeak));
  }
  if(isImpactDef(def)){
    return activityGrade(Math.min(...eligible.map(h => h.score)));
  }
  return activityGrade(Math.max(...eligible.map(h => h.score)));
}
function isImpactDef(def){ return !!def?.impact; }
function activityGradeLabel(g, def){
  if(isImpactDef(def)) return g === 'good' ? 'Low' : g === 'fair' ? 'Moderate' : 'High';
  return g === 'good' ? 'Good' : g === 'fair' ? 'Fair' : 'Poor';
}
function activityImpactSummaryLabel(g){
  return g === 'good' ? 'Low impact' : g === 'fair' ? 'Moderate impact' : 'High impact';
}
function clampActScore(s){ return Math.max(0, Math.min(100, Math.round(s))); }
function activityCloudCover(h, i){
  let cloud = h.cloud_cover?.[i];
  if(cloud == null){
    cloud = Math.max(
      h.cloud_cover_low?.[i] ?? 0,
      h.cloud_cover_mid?.[i] ?? 0,
      h.cloud_cover_high?.[i] ?? 0
    );
  }
  const sf = (h.shortForecast?.[i] || '').toLowerCase();
  if(/overcast/.test(sf)) cloud = Math.max(cloud ?? 0, 88);
  else if(/mostly cloudy/.test(sf)) cloud = Math.max(cloud ?? 0, 75);
  else if(/\bcloudy\b/.test(sf)) cloud = Math.max(cloud ?? 0, 70);
  else if(/partly cloudy|partly sunny/.test(sf)) cloud = Math.max(cloud ?? 0, 45);
  if(cloud == null || cloud === 0){
    const code = h.weather_code?.[i] ?? 0;
    if(code === 3) cloud = 88;
    else if(code === 2) cloud = 50;
    else if(code === 1) cloud = 25;
    else if(code === 45 || code === 48) cloud = 95;
  }
  return cloud ?? 0;
}
function activityHourContext(d, i){
  return activityHourContextFromHourly(d, d.hourly, i);
}
function activityHourContextFromHourly(d, h, i){
  if(!h?.time?.length || i < 0 || i >= h.time.length) return null;
  return {
    time: h.time[i],
    temp: h.temperature_2m[i] ?? 0,
    dew: h.dew_point_2m[i] ?? h.temperature_2m[i],
    pop: h.precipitation_probability?.[i] ?? 0,
    precip: h.precipitation?.[i] ?? 0,
    wind: h.wind_speed_10m?.[i] ?? 0,
    gust: h.wind_gusts_10m?.[i] ?? 0,
    windDir: h.wind_direction_10m?.[i] ?? null,
    uv: h.uv_index?.[i] ?? 0,
    code: h.weather_code?.[i] ?? 0,
    isDay: Number(h.is_day?.[i] ?? 1) !== 0,
    cloud: activityCloudCover(h, i),
    wetBulb: h.wet_bulb_temperature_2m?.[i] ?? h.temperature_2m[i] ?? 0,
    snowDepth: h.snow_depth?.[i] ?? d.om?.hourly?.snow_depth?.[i] ?? 0,
    snowfall: h.snowfall?.[i] ?? 0,
    visibility: h.visibility?.[i] != null
      ? (state.units === 'F' ? h.visibility[i] / 1609.34 : h.visibility[i] / 1000)
      : null,
    cape: h.cape?.[i] ?? 0
  };
}
function plannerHourly(d){
  const om = d.om && d.om.hourly;
  return (om && om.time && om.time.length) ? om : d.hourly;
}
function resolveHourContext(d, timeIso){
  if(!timeIso) return null;
  const key = timeIso.slice(0, 13);
  const dh = d.hourly;
  if(dh?.time){
    const i = dh.time.findIndex(t => t.slice(0, 13) === key);
    if(i >= 0) return activityHourContextFromHourly(d, dh, i);
  }
  const ph = plannerHourly(d);
  if(ph?.time){
    const i = ph.time.findIndex(t => t.slice(0, 13) === key);
    if(i >= 0) return activityHourContextFromHourly(d, ph, i);
  }
  return null;
}
function alertEndIso(p){
  return p.ends || p.parameters?.eventEndingTime?.[0] || p.expires;
}
function alertStartIso(p){
  return p.onset || p.effective || p.sent;
}
function alertInEffectStartIso(p){
  return p.effective || p.sent || p.onset;
}
function formatAlertUntil(p){
  const end = alertEndIso(p);
  if(!end) return '';
  return ' \u00B7 until ' + new Date(end).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
function formatAlertWindow(p){
  const end = alertEndIso(p);
  if(!end) return '';
  const now = Date.now();
  const endMs = Date.parse(end);
  const liveStart = alertInEffectStartIso(p);
  const liveMs = liveStart ? Date.parse(liveStart) : NaN;
  if(!isNaN(liveMs) && liveMs <= now && endMs > now){
    return formatAlertUntil(p);
  }
  const hazardStart = alertStartIso(p);
  if(hazardStart){
    const fmt = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
    return ' \u00B7 ' + new Date(hazardStart).toLocaleString([], fmt) + '\u2013' + new Date(end).toLocaleString([], fmt);
  }
  return formatAlertUntil(p);
}
function alertEndMs(p){
  const end = alertEndIso(p);
  if(!end) return NaN;
  const ms = Date.parse(end);
  return isNaN(ms) ? NaN : ms;
}
function formatAlertExpiresLabel(p){
  const endMs = alertEndMs(p);
  if(isNaN(endMs)) return '';
  const delta = endMs - Date.now();
  if(delta <= 0) return 'Expired';
  if(delta < 45 * 60 * 1000) return 'Expires in ' + Math.max(1, Math.round(delta / 60000)) + ' min';
  if(delta < 36 * 60 * 60 * 1000){
    return 'Until ' + new Date(endMs).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  return 'Until ' + new Date(endMs).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function formatAlertSummaryTiming(p){
  const end = alertEndIso(p);
  if(!end) return '';
  const now = Date.now();
  const endMs = Date.parse(end);
  const liveStart = alertInEffectStartIso(p);
  const liveMs = liveStart ? Date.parse(liveStart) : NaN;
  if(!isNaN(liveMs) && liveMs <= now && endMs > now){
    const exp = formatAlertExpiresLabel(p);
    return exp ? ' \u00B7 ' + exp : formatAlertUntil(p);
  }
  return formatAlertWindow(p);
}
function wallPartsFromForecastIso(iso){
  if(!iso || iso.length < 13) return null;
  return {
    y: +iso.slice(0, 4), mo: +iso.slice(5, 7), d: +iso.slice(8, 10),
    hr: +iso.slice(11, 13), mi: +(iso.slice(14, 16) || 0)
  };
}
function wallPartsInTz(iso, timezone){
  if(!iso) return null;
  const t = Date.parse(iso);
  if(isNaN(t)) return null;
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(t));
  const get = type => parts.find(p => p.type === type)?.value;
  return {
    y: +get('year'), mo: +get('month'), d: +get('day'),
    hr: +get('hour'), mi: +get('minute')
  };
}
function wallPartsCmp(a, b){
  if(!a || !b) return 0;
  for(const k of ['y', 'mo', 'd', 'hr', 'mi']){
    if(a[k] < b[k]) return -1;
    if(a[k] > b[k]) return 1;
  }
  return 0;
}
function alertActiveAtHour(feature, hourIso, timezone){
  const p = feature.properties || {};
  const hour = wallPartsFromForecastIso(hourIso);
  if(!hour) return true;
  const startIso = alertInEffectStartIso(p);
  if(startIso){
    const start = wallPartsInTz(startIso, timezone);
    if(start && wallPartsCmp(hour, start) < 0) return false;
  }
  // NWS `expires` is often the message expiry (can equal onset); `ends` is when the hazard ends.
  const endIso = alertEndIso(p);
  if(endIso){
    const end = wallPartsInTz(endIso, timezone);
    if(end && wallPartsCmp(hour, end) >= 0) return false;
  }
  return true;
}
function activityAlertImpact(def, hourIso, timezone){
  const actId = def?.id || '';
  const feats = (stormState.alertFeatures || []).filter(f => alertActiveAtHour(f, hourIso, timezone));
  let cap = 100;
  const notes = [];
  const apply = (newCap, note) => {
    if(newCap < cap){
      cap = newCap;
      if(note) notes.unshift(note);
    }else if(newCap === cap && note && !notes.includes(note)){
      notes.push(note);
    }
  };
  feats.forEach(f => {
    const ev = f.properties?.event || '';
    const evL = ev.toLowerCase();
    if(actId === 'beach' && /beach hazards|beach hazard|lakeshore hazard|rip current|high surf|rough surf|swim advisory|surf zone|dangerous rip/i.test(evL)){
      apply(40, ev);
      return;
    }
    if((actId === 'beach' || actId === 'hiking') && /coastal flood|high surf|lakeshore flood/i.test(evL)){
      apply(55, ev);
      return;
    }
    if(['running', 'hiking', 'cycling', 'dog'].includes(actId) && /air quality|ozone|particle pollution|smoke|dust/i.test(evL)){
      apply(55, ev);
      return;
    }
    if(['golf', 'yard', 'beach'].includes(actId) && /air quality|ozone|particle pollution|smoke|dust/i.test(evL)){
      apply(60, ev);
      return;
    }
    if(['running', 'hiking', 'cycling', 'golf', 'beach', 'dog'].includes(actId) && /dense fog|freezing fog|fog advisory|low visibility/i.test(evL)){
      apply(52, ev);
      return;
    }
    if(['running', 'hiking', 'cycling', 'golf', 'beach', 'dog'].includes(actId) && /wind advisory|high wind|strong wind|lake wind|gale/i.test(evL)){
      apply(58, ev);
      return;
    }
    if(['running', 'yard', 'dog', 'hiking', 'golf', 'cycling'].includes(actId) && /heat advisory|excessive heat/i.test(evL)){
      apply(58, ev);
      return;
    }
    if(actId === 'beach' && /heat advisory|excessive heat/i.test(evL)){
      apply(65, ev);
      return;
    }
    if(actId === 'dog' && /heat advisory|excessive heat/i.test(evL)){
      apply(50, ev);
      return;
    }
    if(['hiking', 'yard', 'cycling'].includes(actId) && /red flag|fire weather/i.test(evL)){
      apply(55, ev);
      return;
    }
    if(actId === 'heat' && /heat advisory|excessive heat/i.test(evL)){
      apply(40, ev);
      return;
    }
    if(actId === 'wind' && /wind advisory|high wind|strong wind|lake wind|gale/i.test(evL)){
      apply(45, ev);
      return;
    }
    if(actId === 'air' && /air quality|ozone|particle pollution|smoke|dust/i.test(evL)){
      apply(45, ev);
      return;
    }
    if(actId === 'storms' && /severe thunderstorm|tornado watch|tornado warning|severe weather/i.test(evL)){
      apply(35, ev);
      return;
    }
    if(actId === 'cold' && /wind chill|extreme cold|freeze warning|frost advisory|winter storm|blizzard|ice storm|cold advisory/i.test(evL)){
      apply(40, ev);
      return;
    }
    if(/tornado|severe thunderstorm|flash flood|hurricane|blizzard|ice storm|winter storm/.test(evL)){
      apply(30, ev);
    }else if(/warning/.test(evL)){
      apply(45, ev);
    }
  });
  return { cap, notes: notes.slice(0, 3) };
}
function activityAlertCap(def, timezone, hours){
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sample = (hours || []).filter(h => !h.ineligible).map(h => h.time);
  if(!sample.length) sample.push(null);
  let cap = 100;
  const notes = [];
  sample.forEach(hourIso => {
    const hit = activityAlertImpact(def, hourIso, tz);
    if(hit.cap < cap) cap = hit.cap;
    hit.notes.forEach(n => { if(!notes.includes(n)) notes.push(n); });
  });
  return { cap, notes: notes.slice(0, 3) };
}
function penalizeAfternoonHeat(ctx, reasons, opts){
  opts = opts || {};
  if(!ctx.isDay) return 0;
  const hr = new Date(ctx.time).getHours();
  const start = opts.start ?? 13, end = opts.end ?? 18;
  if(hr < start || hr >= end) return 0;
  const hot = opts.hot ?? (state.units === 'F' ? 84 : 29);
  const extreme = opts.extreme ?? (state.units === 'F' ? 90 : 32);
  let s = 0;
  if(ctx.temp >= extreme || ctx.wetBulb >= (opts.wetBulbExtreme ?? 80)){
    s += opts.extremePenalty ?? 18;
    reasons.push(opts.extremeNote || 'Afternoon heat peak');
  }else if(ctx.temp >= hot){
    s += opts.hotPenalty ?? 10;
    reasons.push(opts.hotNote || 'Warm afternoon');
  }
  return s;
}
function penalizeRain(ctx, reasons, heavy, light){
  let s = 0;
  if(ctx.pop >= 60){ s += heavy; reasons.push(ctx.pop + '% chance of rain'); }
  else if(ctx.pop >= 30){ s += light; reasons.push('Rain possible (' + ctx.pop + '%)'); }
  if(isStormWxCode(ctx.code)){ s += heavy + 20; reasons.push('Storms forecast'); }
  else if(isRainWxCode(ctx.code)){ s += light + 10; reasons.push('Wet weather'); }
  else if(isSnowWxCode(ctx.code)){ s += heavy; reasons.push('Snow or wintry mix'); }
  if(ctx.precip > 0.05) reasons.push('Recent or ongoing precip');
  return s;
}
function penalizeWind(ctx, reasons, mphStrong, mphBreeze){
  let s = 0;
  const w = Math.round(ctx.wind), wu = windUnit();
  if(ctx.wind >= mphStrong){ s += 35; reasons.push('Strong wind (' + w + ' ' + wu + ')'); }
  else if(ctx.wind >= mphBreeze){ s += 18; reasons.push('Breezy (' + w + ' ' + wu + ')'); }
  if(ctx.gust >= mphStrong + 8) reasons.push('Gusty winds');
  return s;
}
function penalizeHeat(ctx, reasons, hot, extreme, opts){
  opts = opts || {};
  let s = 0;
  if(ctx.wetBulb >= 82 || ctx.temp >= 95){ s += 35; reasons.push('Extreme heat stress'); }
  else if(ctx.wetBulb >= 78 || ctx.temp >= 88){ s += 20; reasons.push('Very hot and humid'); }
  else if(ctx.temp >= hot){ s += 10; reasons.push('Quite warm'); }
  if(!opts.heatOnly){
    if(ctx.temp <= 25){ s += 30; reasons.push('Very cold'); }
    else if(ctx.temp <= 38){ s += 15; reasons.push('Cold'); }
  }
  return s;
}
function penalizeAqi(extra, reasons, strict){
  const aqi = extra.aqi;
  const pm25 = extra.pm25;
  let s = 0;
  if(pm25 != null && pm25 >= 55){
    reasons.push('High smoke / PM2.5 (' + Math.round(pm25) + ' \u00B5g/m\u00B3)');
    s += strict ? 40 : 30;
  }else if(pm25 != null && pm25 >= 35){
    reasons.push('Elevated PM2.5 — smoke or haze');
    s += strict ? 18 : 12;
  }
  if(aqi == null) return s;
  if(aqi > 150){ reasons.push('Unhealthy air (AQI ' + aqi + ')'); return s + (strict ? 45 : 35); }
  if(aqi > 100){ reasons.push('Moderate AQI (' + aqi + ')'); return s + (strict ? 20 : 12); }
  if(aqi > 75 && strict) reasons.push('Sensitive groups: elevated AQI');
  return s + (aqi > 75 && strict ? 8 : 0);
}
function coldImpactThresholds(){
  if(state.units === 'F'){
    return { mild: 55, cool: 50, chilly: 40, freezing: 32, veryCold: 20, bitter: 10 };
  }
  return { mild: 13, cool: 10, chilly: 4, freezing: 0, veryCold: -7, bitter: -12 };
}
function penalizeWinter(ctx, reasons){
  let s = 0;
  if(isIceWxCode(ctx.code)){ s += 45; reasons.push('Freezing rain or ice'); }
  const wc = activityWindChillF(ctx);
  if(wc != null && wc <= 0){ s += 35; reasons.push('Bitter wind chill (' + wc + '\u00B0F)'); }
  else if(wc != null && wc <= 15){ s += 18; reasons.push('Wind chill ' + wc + '\u00B0F'); }
  if(ctx.snowDepth > 0.05) reasons.push('Snow on the ground');
  if(ctx.snowfall > (state.units === 'F' ? 0.02 : 0.05)) reasons.push('Snow falling');
  if(ctx.visibility != null && ctx.visibility < 2){ s += 12; reasons.push('Low visibility'); }
  return s;
}
const ACTIVITY_SCORERS = {
  golf(ctx, extra){
    let s = 100;
    const reasons = [];
    s -= penalizeRain(ctx, reasons, 55, 28);
    s -= penalizeWind(ctx, reasons, 18, 10);
    s -= penalizeHeat(ctx, reasons, 85, 92);
    s -= penalizeAfternoonHeat(ctx, reasons, { hot: 84, extreme: 90 });
    s -= penalizeWinter(ctx, reasons);
    if(ctx.uv >= 8 && ctx.isDay) reasons.push('High UV — seek shade');
    return { score: clampActScore(s), reasons };
  },
  hiking(ctx, extra){
    let s = 100;
    const reasons = [];
    s -= penalizeRain(ctx, reasons, 50, 25);
    s -= penalizeWind(ctx, reasons, 28, 16);
    s -= penalizeHeat(ctx, reasons, 86, 94);
    s -= penalizeAfternoonHeat(ctx, reasons, { hot: 86, extreme: 92 });
    s -= penalizeWinter(ctx, reasons);
    s -= penalizeAqi(extra, reasons, true);
    if(ctx.uv >= 9 && ctx.isDay){ s -= 12; reasons.push('Very high UV'); }
    if(ctx.cloud > 85 && ctx.isDay) reasons.push('Overcast');
    return { score: clampActScore(s), reasons };
  },
  yard(ctx, extra){
    let s = 100;
    const reasons = [];
    s -= penalizeRain(ctx, reasons, 60, 35);
    if(ctx.precip > 0.02) s -= 25;
    s -= penalizeWind(ctx, reasons, 22, 14);
    s -= penalizeHeat(ctx, reasons, 88, 96);
    s -= penalizeAfternoonHeat(ctx, reasons, { hot: 88, extreme: 94, extremePenalty: 22 });
    s -= penalizeWinter(ctx, reasons);
    if(ctx.wetBulb >= 80) reasons.push('Heavy work in heat — hydrate');
    return { score: clampActScore(s), reasons };
  },
  running(ctx, extra){
    let s = 100;
    const reasons = [];
    s -= penalizeRain(ctx, reasons, 45, 22);
    s -= penalizeWind(ctx, reasons, 24, 14);
    const heat = penalizeHeat(ctx, reasons, 82, 90);
    s -= heat + (heat > 0 ? 5 : 0);
    s -= penalizeAfternoonHeat(ctx, reasons, { hot: 82, extreme: 88, hotPenalty: 12, extremePenalty: 20 });
    s -= penalizeWinter(ctx, reasons);
    s -= penalizeAqi(extra, reasons, true);
    if(ctx.temp >= 40 && ctx.temp <= 75 && ctx.pop < 25) reasons.push('Comfortable running temps');
    return { score: clampActScore(s), reasons };
  },
  beach(ctx, extra){
    let s = 100;
    const reasons = [];
    if(ctx.temp < 68){ s -= 40; reasons.push('Cool for swimming (' + Math.round(ctx.temp) + degSym() + ')'); }
    else if(ctx.temp < 75){ s -= 15; reasons.push('Water may feel cool'); }
    s -= penalizeAfternoonHeat(ctx, reasons, {
      hot: 88, extreme: 94, hotPenalty: 12, extremePenalty: 22,
      hotNote: 'Warm afternoon sun', extremeNote: 'Afternoon heat — seek shade'
    });
    s -= penalizeRain(ctx, reasons, 55, 30);
    s -= penalizeWind(ctx, reasons, 20, 12);
    if(ctx.uv >= 8 && ctx.isDay) reasons.push('High sun — sunscreen');
    if(extra.coastal) reasons.push('Near coast — check rip currents');
    return { score: clampActScore(s), reasons };
  },
  cycling(ctx, extra){
    let s = 100;
    const reasons = [];
    s -= penalizeRain(ctx, reasons, 50, 25);
    s -= penalizeWind(ctx, reasons, 16, 9);
    s -= penalizeHeat(ctx, reasons, 84, 92);
    s -= penalizeAfternoonHeat(ctx, reasons, { hot: 86, extreme: 92 });
    s -= penalizeWinter(ctx, reasons);
    s -= penalizeAqi(extra, reasons, false);
    if(ctx.wind >= 20) s -= 15;
    return { score: clampActScore(s), reasons };
  },
  dog(ctx, extra){
    let s = 100;
    const reasons = [];
    s -= penalizeRain(ctx, reasons, 40, 20);
    const hr = new Date(ctx.time).getHours();
    const warmAfternoon = ctx.isDay && hr >= 12 && hr < 19;
    if(ctx.temp >= 90 || (ctx.temp >= 88 && warmAfternoon)){
      s -= 32;
      reasons.push('Very hot — avoid hot pavement, walk early or on grass');
    }else if(ctx.temp >= 85){
      s -= warmAfternoon ? 18 : 10;
      reasons.push(warmAfternoon ? 'Hot afternoon — short walks on grass' : 'Warm — shorter walks');
    }else if(ctx.temp >= 78 && warmAfternoon){
      s -= 10;
      reasons.push('Warm afternoon — keep walks brief');
    }else if(ctx.temp >= 78){
      s -= 5;
      reasons.push('Warm — short walks');
    }
    if(ctx.temp <= 15){ s -= 25; reasons.push('Very cold for pets'); }
    s -= penalizeWinter(ctx, reasons);
    s -= penalizeAqi(extra, reasons, true);
    return { score: clampActScore(s), reasons };
  },
  ski(ctx, extra){
    let s = 55;
    const reasons = [];
    if(isSnowWxCode(ctx.code) || ctx.snowfall > (state.units === 'F' ? 0.02 : 0.05)){
      s += 30; reasons.push('Snow in the forecast');
    }
    if(ctx.snowDepth > 0.05) s += 20;
    else if(ctx.snowDepth > 0.02) s += 10;
    else { s -= 20; reasons.push('Thin or no snow cover'); }
    if(state.units === 'F' && ctx.temp > 38) { s -= 25; reasons.push('Too warm — snow may be slushy'); }
    else if(state.units === 'F' && ctx.temp <= 38 && ctx.temp >= 20) reasons.push('Cold enough to preserve snow');
    s -= penalizeRain(ctx, reasons, 30, 15);
    s -= penalizeWind(ctx, reasons, 30, 18);
    s -= penalizeWinter(ctx, reasons);
    if(ctx.wind >= 25) s -= 15;
    return { score: clampActScore(s), reasons };
  },
  shovel(ctx, extra){
    let s = 45;
    const reasons = [];
    if(isSnowWxCode(ctx.code) || ctx.snowfall > (state.units === 'F' ? 0.02 : 0.05)){
      s += 35; reasons.push('Snow to clear');
    }else if(ctx.snowDepth > 0.05){
      s += 20; reasons.push('Snow on the ground');
    }else{
      s -= 30; reasons.push('Little snow expected');
    }
    s -= penalizeWind(ctx, reasons, 28, 16);
    s -= penalizeWinter(ctx, reasons);
    const wc = activityWindChillF(ctx);
    if(wc != null && wc <= 5) s -= 20;
    if(ctx.temp <= (state.units === 'F' ? 15 : -9)) reasons.push('Extreme cold for extended shoveling');
    return { score: clampActScore(s), reasons };
  },
  stars(ctx, extra){
    let s = 100;
    const reasons = [];
    if(ctx.isDay){ s -= 80; reasons.push('Daylight'); }
    s -= penalizeRain(ctx, reasons, 55, 30);
    if(ctx.cloud >= 70){ s -= 40; reasons.push('Cloudy skies'); }
    else if(ctx.cloud >= 40){ s -= 18; reasons.push('Some cloud cover'); }
    if(ctx.code === 3 && ctx.cloud < 70){ s -= 25; reasons.push('Overcast forecast'); }
    else if(ctx.code === 2 && ctx.cloud < 40){ s -= 12; reasons.push('Partly cloudy'); }
    s -= penalizeWind(ctx, reasons, 26, 18);
    if(ctx.isDay === 0 && ctx.cloud < 30) reasons.push('Clear night expected');
    return { score: clampActScore(s), reasons };
  },
  heat(ctx, extra){
    let s = 100;
    const reasons = [];
    if(ctx.wetBulb < 65 && ctx.temp < 75){
      return { score: 92, reasons: ['Cool conditions — minimal heat stress'] };
    }
    s -= penalizeHeat(ctx, reasons, 80, 88, { heatOnly: true });
    s -= penalizeAfternoonHeat(ctx, reasons, { hot: 82, extreme: 90, hotPenalty: 16, extremePenalty: 32 });
    if(ctx.wetBulb >= 82){ s -= 22; reasons.push('Extreme wet-bulb heat stress'); }
    else if(ctx.wetBulb >= 78){ s -= 12; reasons.push('Humid heat stress'); }
    if(ctx.temp >= 85 && ctx.isDay){ s -= 10; reasons.push('Hot afternoon'); }
    if(ctx.temp >= 95 && ctx.isDay){ s -= 12; reasons.push('Afternoon heat peak'); }
    return { score: clampActScore(s), reasons };
  },
  wind(ctx, extra){
    let s = 100;
    const reasons = [];
    s -= penalizeWind(ctx, reasons, 22, 12);
    if(ctx.gust >= 28){ s -= 15; reasons.push('Damaging gust potential'); }
    return { score: clampActScore(s), reasons };
  },
  air(ctx, extra){
    let s = 100;
    const reasons = [];
    s -= penalizeAqi(extra, reasons, true);
    if(extra.pm25 != null && extra.pm25 >= 35){
      s -= extra.pm25 >= 55 ? 30 : 15;
      reasons.push('Elevated PM2.5');
    }
    if(ctx.visibility != null && ctx.visibility < 3){ s -= 20; reasons.push('Reduced visibility'); }
    return { score: clampActScore(s), reasons };
  },
  storms(ctx, extra){
    let s = 100;
    const reasons = [];
    if(isStormWxCode(ctx.code)){ s -= 65; reasons.push('Thunderstorms in forecast'); }
    s -= penalizeRain(ctx, reasons, 45, 22);
    if(ctx.cape >= 1500){ s -= 25; reasons.push('Strong instability (CAPE)'); }
    else if(ctx.cape >= 800){ s -= 12; reasons.push('Elevated CAPE'); }
    if(ctx.pop >= 70 && ctx.isDay) reasons.push('High rain chance');
    return { score: clampActScore(s), reasons };
  },
  cold(ctx, extra){
    let s = 100;
    const reasons = [];
    const t = coldImpactThresholds();
    const wc = activityWindChillF(ctx);
    if(ctx.temp >= t.mild && (wc == null || wc > 28)){
      return { score: 92, reasons: ['Mild conditions — limited cold stress'] };
    }
    if(isIceWxCode(ctx.code)){
      s -= 38; reasons.push('Freezing rain or ice');
    }
    if(ctx.temp <= t.bitter || (wc != null && wc <= 0)){
      s -= 32; reasons.push('Bitter cold');
    }else if(ctx.temp <= t.veryCold || (wc != null && wc <= 10)){
      s -= 24; reasons.push('Very cold');
    }else if(ctx.temp <= t.freezing || (wc != null && wc <= 20)){
      s -= 16; reasons.push('Below freezing');
    }else if(ctx.temp <= t.chilly || (wc != null && wc <= 28)){
      s -= 10; reasons.push('Chilly');
    }else if(ctx.temp <= t.cool){
      s -= 5; reasons.push('Cool');
    }
    if(wc != null && wc <= 10 && ctx.temp > t.veryCold){
      s -= 12; reasons.push('Dangerous wind chill (' + wc + '\u00B0F)');
    }
    if(ctx.snowfall > (state.units === 'F' ? 0.02 : 0.05)){
      s -= 12; reasons.push('Snow falling');
    }else if(ctx.snowDepth > 0.05){
      s -= 6; reasons.push('Snow on the ground');
    }
    if(ctx.visibility != null && ctx.visibility < 2){
      s -= 10; reasons.push('Low visibility');
    }
    return { score: clampActScore(s), reasons };
  },
  uv(ctx, extra){
    let s = 100;
    const reasons = [];
    let uv = ctx.uv;
    if(ctx.cloud >= 85) uv *= 0.35;
    else if(ctx.cloud >= 70) uv *= 0.5;
    else if(ctx.cloud >= 50) uv *= 0.72;
    else if(ctx.cloud >= 30) uv *= 0.88;
    if(uv >= 11){ s -= 72; reasons.push('Extreme UV (' + Math.round(uv) + ')'); }
    else if(uv >= 8){ s -= 52; reasons.push('Very high UV (' + Math.round(uv) + ')'); }
    else if(uv >= 6){ s -= 38; reasons.push('High UV (' + Math.round(uv) + ')'); }
    else if(uv >= 3){ s -= 20; reasons.push('UV index ' + Math.round(uv)); }
    else if(uv >= 1){ s -= 6; reasons.push('Low UV'); }
    if(ctx.cloud >= 70 && ctx.uv >= 3 && uv < ctx.uv - 0.5){
      reasons.push('Cloud cover reduces surface UV');
    }
    return { score: clampActScore(s), reasons };
  }
};
const ACTIVITY_DEFS = [
  { id: 'golf', name: 'Golf', icon: '\u26F3', season: 'warm', dayOnly: true },
  { id: 'hiking', name: 'Hiking', icon: '\uD83E\uDDF7', season: 'all', dayOnly: true },
  { id: 'yard', name: 'Yard work', icon: '\uD83C\uDF3F', season: 'warm', dayOnly: true },
  { id: 'running', name: 'Running', icon: '\uD83C\uDFC3', season: 'all', daylight: true },
  { id: 'beach', name: 'Beach / pool', icon: '\uD83C\uDFD6\uFE0F', season: 'warm', dayOnly: true, hourMin: 9, hourMax: 20 },
  { id: 'cycling', name: 'Cycling', icon: '\uD83D\uDEB4', season: 'all', daylight: true },
  { id: 'dog', name: 'Dog walk', icon: '\uD83D\uDC36', season: 'all', daylight: true },
  { id: 'ski', name: 'Skiing / sledding', icon: '\u26F7', season: 'cold', dayOnly: true },
  { id: 'shovel', name: 'Snow shoveling', icon: '\u2744\uFE0F', season: 'cold', dayOnly: true },
  { id: 'stars', name: 'Stargazing', icon: '\uD83C\uDF19', season: 'all', nightOnly: true }
];
const IMPACT_DEFS = [
  { id: 'heat', name: 'Heat stress', icon: '\uD83C\uDF21', season: 'all', impact: true },
  { id: 'wind', name: 'Wind exposure', icon: '\uD83C\uDF2C\uFE0F', season: 'all', impact: true },
  { id: 'air', name: 'Smoke & air', icon: '\uD83D\uDE37', season: 'all', impact: true },
  { id: 'storms', name: 'Lightning & storms', icon: '\u26A1', season: 'all', impact: true },
  { id: 'cold', name: 'Cold exposure', icon: '\uD83E\uDD76', season: 'all', impact: true },
  { id: 'uv', name: 'UV exposure', icon: '\u2600\uFE0F', season: 'all', dayOnly: true, impact: true }
];
function normalizePlannerPins(){
  const impactIds = new Set(IMPACT_DEFS.map(d => d.id));
  const migrated = activityPins.filter(id => impactIds.has(id));
  if(migrated.length){
    migrated.forEach(id => { if(!impactPins.includes(id)) impactPins.push(id); });
    if(impactPins.length > 4) impactPins.splice(0, impactPins.length - 4);
    activityPins = activityPins.filter(id => !impactIds.has(id));
    store.set('st_activity_pins', activityPins);
    store.set('st_impact_pins', impactPins);
  }
}
function activityHourEligible(def, ctx){
  if(def.nightOnly) return !ctx.isDay;
  if(def.dayOnly) return !!ctx.isDay;
  if(def.daylight && !ctx.isDay) return false;
  if(def.hourMin != null || def.hourMax != null){
    const hr = new Date(ctx.time).getHours();
    const min = def.hourMin ?? 0, max = def.hourMax ?? 24;
    if(hr < min || hr >= max) return false;
  }
  return true;
}
function activityIneligibleNote(def){
  if(def.nightOnly) return 'Daylight';
  if(def.dayOnly){
    if(def.id === 'uv') return 'Nighttime';
    return 'After dark';
  }
  if(def.daylight) return 'After dark';
  if(def.hourMin != null) return 'Outside usual hours';
  return 'Not applicable';
}
function buildActivityHours(d, def, extra){
  const scorer = ACTIVITY_SCORERS[def.id];
  if(!scorer || !d?.hourly?.time?.length) return [];
  const tz = d.timezone;
  const i0 = nowIndex(d);
  const hours = [];
  for(let j = i0; j < d.hourly.time.length && hours.length < HOURLY_HOURS; j++){
    hours.push(scoreActivityHour(d, def, extra, j, scorer, tz));
  }
  return hours;
}
const PLANNER_DAY_COUNT = 2;
function scoreActivityFromContext(d, def, extra, ctx, scorer, tz){
  scorer = scorer || ACTIVITY_SCORERS[def.id];
  tz = tz ?? d.timezone;
  if(!ctx){
    return { time: '', score: 0, grade: 'na', ineligible: true, reasons: ['No data'] };
  }
  if(!activityHourEligible(def, ctx)){
    return {
      time: ctx.time, score: 0, grade: 'na', ineligible: true,
      reasons: [activityIneligibleNote(def)]
    };
  }
  let { score, reasons } = scorer(ctx, extra);
  const alert = activityAlertImpact(def, ctx.time, tz);
  score = Math.min(score, alert.cap);
  if(alert.notes.length && score <= alert.cap){
    const note = alert.notes[0];
    if(!reasons.includes(note)) reasons.unshift(note);
  }
  return { time: ctx.time, score, grade: activityGrade(score), reasons: reasons.slice(0, 5), ineligible: false };
}
function scoreActivityHour(d, def, extra, j, scorer, tz){
  return scoreActivityFromContext(d, def, extra, activityHourContext(d, j), scorer, tz);
}
function buildActivityHoursForDate(d, def, extra, dayIndex){
  const dateStr = d.daily?.time?.[dayIndex];
  if(!dateStr || !d?.hourly?.time?.length) return { dateStr: null, dayIndex, hours: [] };
  const ph = plannerHourly(d);
  if(!ph?.time?.length) return { dateStr, dayIndex, hours: [] };
  const indices = dayHourlyIndices(ph, dateStr);
  if(!indices.length) return { dateStr, dayIndex, hours: [] };
  const scorer = ACTIVITY_SCORERS[def.id];
  if(!scorer) return { dateStr, dayIndex, hours: [] };
  const tz = d.timezone;
  const dateKey = String(dateStr).slice(0, 10);
  const slots = new Array(24).fill(null);
  indices.forEach(j => {
    const iso = ph.time[j];
    const hr = +iso.slice(11, 13);
    if(hr < 0 || hr > 23) return;
    const ctx = resolveHourContext(d, iso);
    slots[hr] = scoreActivityFromContext(d, def, extra, ctx, scorer, tz);
  });
  const hours = slots.map((slot, hr) => {
    if(slot) return slot;
    const hPad = hr < 10 ? '0' + hr : String(hr);
    return {
      time: dateKey + 'T' + hPad + ':00',
      score: 0, grade: 'na', ineligible: true,
      reasons: ['No data']
    };
  });
  return { dateStr, dayIndex, hours };
}
function plannerDayTitle(dayIndex, dateStr){
  if(dayIndex === 0) return 'Today';
  if(dayIndex === 1) return 'Tomorrow';
  return fmtDayWeekday(dateStr);
}
function activityBarDayTimeLabels(hours, dateStr, d){
  if(!hours.length) return { html: '', nowPct: null };
  const nowIso = d.hourly.time[nowIndex(d)];
  const isToday = dateStr && nowIso.slice(0, 10) === String(dateStr).slice(0, 10);
  const nowPct = isToday ? (nowMinsInTz(d.timezone) / 1440) * 100 : null;
  const anchors = [
    { pct: 0, lbl: '12a', edge: 'edge-start' },
    { pct: 25, lbl: '6a' },
    { pct: 50, lbl: '12p' },
    { pct: 75, lbl: '6p', edge: 'edge-end' }
  ];
  let html = anchors.map(a => {
    const edge = a.edge ? ' ' + a.edge : '';
    const style = a.edge ? '' : ' style="left:' + a.pct + '%"';
    return '<span class="' + edge.trim() + '"' + style + '>' + esc(a.lbl) + '</span>';
  }).join('');
  if(isToday && nowPct != null){
    html += '<span class="is-now" style="left:' + nowPct.toFixed(1) + '%">Now</span>';
  }
  return { html, nowPct };
}
function renderPlannerDayBar(day, d, def){
  const { dateStr, dayIndex, hours } = day;
  if(!hours.length) return '';
  const nowIso = d.hourly.time[nowIndex(d)];
  const isToday = dateStr && nowIso.slice(0, 10) === String(dateStr).slice(0, 10);
  const nowMins = isToday ? nowMinsInTz(d.timezone) : null;
  const bar = hours.map((h, hr) => {
    const cls = h.ineligible ? 'na' : (h.grade === 'good' ? 'g' : h.grade === 'fair' ? 'f' : 'p');
    const past = isToday && (hr + 1) * 60 <= nowMins ? ' past' : '';
    let tip = hourLabelCompact(h.time) + ': ' + (h.ineligible ? activityIneligibleNote(def) : activityGradeLabel(h.grade, def));
    if(!h.ineligible && h.reasons[0]) tip += ' \u2014 ' + h.reasons[0];
    return '<span class="' + cls + past + '" title="' + esc(tip) + '"></span>';
  }).join('');
  const { html: timeLbl, nowPct } = activityBarDayTimeLabels(hours, dateStr, d);
  const nowMark = nowPct != null
    ? '<div class="activity-now" style="left:' + nowPct.toFixed(1) + '%" title="Current time">'
      + '<span class="activity-now-lbl">Now</span>'
      + '<span class="activity-now-mark" aria-hidden="true"></span></div>'
    : '';
  return '<div class="activity-day-block">'
    + '<div class="activity-day-lbl">' + esc(plannerDayTitle(dayIndex, dateStr)) + '</div>'
    + '<div class="activity-bar-wrap">' + nowMark
    + '<div class="activity-bar" role="img" aria-label="Hourly levels for ' + esc(plannerDayTitle(dayIndex, dateStr)) + '">'
    + bar + '</div></div>'
    + '<div class="activity-bar-times">' + timeLbl + '</div></div>';
}
function buildPlannerDayBars(d, def, extra){
  const days = [];
  for(let i = 0; i < PLANNER_DAY_COUNT; i++){
    const day = buildActivityHoursForDate(d, def, extra, i);
    if(day.hours.length) days.push(day);
  }
  return days;
}
function activityBarTimeLabels(hours){
  if(!hours.length) return '';
  const n = hours.length;
  const slots = n <= 8 ? 3 : n <= 16 ? 4 : 5;
  const picks = [];
  for(let s = 0; s < slots; s++){
    const i = slots === 1 ? 0 : Math.round(s * (n - 1) / (slots - 1));
    if(picks.some(p => p.i === i)) continue;
    picks.push({ i, lbl: i === 0 ? 'Now' : hourLabelCompact(hours[i].time) });
  }
  return picks.map((p, idx) => {
    const pct = n < 2 ? 0 : (p.i / (n - 1)) * 100;
    const edge = idx === 0 ? ' edge-start' : idx === picks.length - 1 ? ' edge-end' : '';
    const style = edge ? '' : ' style="left:' + pct.toFixed(1) + '%"';
    return '<span class="' + edge.trim() + '"' + style + '>' + esc(p.lbl) + '</span>';
  }).join('');
}
function mergeActivityWindows(hours){
  if(!hours.length) return [];
  const out = [];
  let cur = null;
  for(let i = 0; i < hours.length; i++){
    const h = hours[i];
    if(h.ineligible){
      if(cur){ out.push(cur); cur = null; }
      continue;
    }
    const prev = i > 0 ? hours[i - 1] : null;
    if(!cur){
      cur = { start: h.time, end: h.time, grade: h.grade, reasons: h.reasons.slice() };
    }else if(h.grade === cur.grade && prev && !prev.ineligible){
      cur.end = h.time;
      h.reasons.forEach(r => { if(cur.reasons.length < 4 && !cur.reasons.includes(r)) cur.reasons.push(r); });
    }else{
      out.push(cur);
      cur = { start: h.time, end: h.time, grade: h.grade, reasons: h.reasons.slice() };
    }
  }
  if(cur) out.push(cur);
  return out;
}
function fmtActWindow(w){
  const a = hourLabelCompact(w.start), b = hourLabelCompact(w.end);
  return a === b ? a : a + '\u2013' + b;
}
function windowEligibleHours(w, hours){
  return hours.filter(h => !h.ineligible && h.time >= w.start && h.time <= w.end).length;
}
function eligibleHourCount(hours){
  return hours.filter(h => !h.ineligible).length;
}
function isFullSpanWindow(w, hours){
  const total = eligibleHourCount(hours);
  if(total < 2) return false;
  return windowEligibleHours(w, hours) >= total - 1;
}
function fmtImpactWindowLabel(w, hours){
  if(isFullSpanWindow(w, hours)) return 'next 24 hours';
  return fmtActWindow(w);
}
function impactLowDefault(def, ctx){
  switch(def.id){
    case 'wind':
      return ctx && ctx.wind >= 8
        ? 'Breezy at times, but below strong-wind thresholds.'
        : 'Light winds — limited wind exposure.';
    case 'air':
      return 'Air quality acceptable for time outside.';
    case 'storms':
      return 'Limited thunderstorm or lightning risk in the forecast window.';
    case 'heat':
      return 'Heat stress remains within comfortable limits.';
    case 'cold':
      return 'Cold exposure remains low.';
    case 'uv':
      return 'UV remains low for the hours shown.';
    default:
      return 'Minimal ' + def.name.toLowerCase() + ' concern.';
  }
}
function summarizeActivityWindows(windows, hours, def){
  const eligible = hours.filter(h => !h.ineligible);
  if(!eligible.length){
    if(def.nightOnly) return 'Waiting for darkness in the forecast window';
    if(def.dayOnly || def.daylight) return 'Best during daylight — check again tomorrow morning';
    return 'No suitable hours in the forecast window';
  }
  const nowIso = hours[0]?.time;
  const windowSort = (a, b) => {
    const aNow = nowIso && a.start <= nowIso && a.end >= nowIso;
    const bNow = nowIso && b.start <= nowIso && b.end >= nowIso;
    if(aNow !== bNow) return aNow ? -1 : 1;
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  };
  const good = windows.filter(w => w.grade === 'good').sort(windowSort);
  const fair = windows.filter(w => w.grade === 'fair').sort(windowSort);
  const poor = windows.filter(w => w.grade === 'poor').sort(windowSort);
  const parts = [];
  if(isImpactDef(def)){
    if(poor.length) parts.push('High ' + poor.slice(0, 2).map(w => fmtImpactWindowLabel(w, hours)).join(', '));
    if(fair.length) parts.push('Moderate ' + fair.slice(0, 2).map(w => fmtImpactWindowLabel(w, hours)).join(', '));
    if(good.length){
      if(good.length === 1 && isFullSpanWindow(good[0], hours) && !fair.length && !poor.length){
        parts.push('Low throughout the next 24 hours');
      }else{
        parts.push('Low ' + good.slice(0, 2).map(w => fmtImpactWindowLabel(w, hours)).join(', '));
      }
    }
  }else{
    if(good.length) parts.push('Best ' + good.slice(0, 2).map(fmtActWindow).join(', '));
    if(fair.length) parts.push('Fair ' + fair.slice(0, 2).map(fmtActWindow).join(', '));
    if(poor.length) parts.push('Poor ' + poor.slice(0, 2).map(fmtActWindow).join(', '));
  }
  if(!parts.length) return isImpactDef(def) ? 'High impact throughout the forecast window' : 'Poor conditions during recommended hours';
  return parts.join(' \u00B7 ');
}
function activityWxLabel(ctx){
  return wmo(ctx.code, ctx.isDay)[0];
}
function sampleHourInWindow(w, hours, def){
  const inWin = hours.filter(h => !h.ineligible && h.time >= w.start && h.time <= w.end);
  if(!inWin.length) return null;
  if(w.grade === 'poor' || (isImpactDef(def) && w.grade === 'fair')){
    return inWin.reduce((a, h) => (h.score < a.score ? h : a), inWin[0]);
  }
  if(w.grade === 'good' && isImpactDef(def)){
    return inWin.reduce((a, h) => (h.score < a.score ? h : a), inWin[0]);
  }
  if(w.grade === 'good'){
    return inWin.reduce((a, h) => (h.score > a.score ? h : a), inWin[0]);
  }
  return inWin[Math.floor(inWin.length / 2)];
}
function weatherSnapshotPhrase(ctx){
  if(!ctx) return '';
  const temp = Math.round(ctx.temp);
  const wx = activityWxLabel(ctx).toLowerCase();
  const pop = Math.round(ctx.pop);
  const wind = Math.round(ctx.wind);
  const wu = windUnit();
  let line = wx + ', about ' + temp + degSym();
  if(pop >= 40) line += ', rain likely';
  else if(pop >= 20) line += ', some rain risk';
  if(wind >= 16) line += ', windy (' + wind + ' ' + wu + ')';
  else if(wind >= 8) line += ', breezy';
  return line;
}
function describeActivityWindow(def, w, hours, d, extra){
  const sample = sampleHourInWindow(w, hours, def);
  if(!sample) return 'Outside the hours we usually score for this activity.';
  const idx = d.hourly.time.indexOf(sample.time);
  const ctx = idx >= 0 ? activityHourContext(d, idx) : null;
  const snap = weatherSnapshotPhrase(ctx);
  const alert = activityAlertImpact(def, sample.time, d.timezone);
  const reasons = [...new Set(sample.reasons.length ? sample.reasons : w.reasons)];
  const sentences = [];

  if(w.grade === 'good'){
    if(reasons.length){
      sentences.push(reasons.slice(0, 2).join('; ').replace(/;$/, '') + '.');
    }else if(isImpactDef(def)){
      sentences.push(impactLowDefault(def, ctx));
    }else if(snap){
      sentences.push('Comfortable stretch — ' + snap + '.');
    }else{
      sentences.push(isImpactDef(def)
        ? 'Minimal ' + def.name.toLowerCase() + ' concern.'
        : 'Weather lines up well for ' + def.name.toLowerCase() + '.');
    }
  }else if(w.grade === 'fair'){
    if(reasons.length){
      sentences.push(reasons.slice(0, 2).join('; ').replace(/;$/, '') + '.');
    }
    if(isImpactDef(def)){
      if(!sentences.length) sentences.push('Moderate hazard — limit exposure or use protection.');
    }else if(snap){
      sentences.push('Still workable then (' + snap + ').');
    }else if(!sentences.length) sentences.push('Mixed signals — doable if you adjust timing or pace.');
  }else{
    if(alert.notes.length && alert.cap < 70){
      sentences.push(alert.notes[0] + ' in effect — wait until it ends.');
    }
    if(reasons.length){
      sentences.push(reasons.slice(0, 3).join('; ').replace(/;$/, '') + '.');
    }else if(snap){
      sentences.push(isImpactDef(def) ? 'High impact — ' + snap + '.' : 'Tough stretch — ' + snap + '.');
    }else{
      sentences.push(isImpactDef(def)
        ? 'High impact — limit time outside.'
        : 'Several factors stack up against going out then.');
    }
  }
  return sentences.join(' ');
}
function buildWhyItemsForWindows(def, windows, hours, d, extra, nowIso){
  const items = [];
  const gradeOrder = isImpactDef(def) ? ['poor', 'fair', 'good'] : ['good', 'fair', 'poor'];
  const windowSort = (a, b) => {
    const aNow = nowIso && a.start <= nowIso && a.end >= nowIso;
    const bNow = nowIso && b.start <= nowIso && b.end >= nowIso;
    if(aNow !== bNow) return aNow ? -1 : 1;
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  };
  for(const grade of gradeOrder){
    const wins = windows.filter(w => w.grade === grade).sort(windowSort);
    for(const w of wins.slice(0, 2)){
      items.push({
        grade,
        label: isImpactDef(def) ? activityImpactSummaryLabel(grade) : activityGradeLabel(grade, def),
        time: isImpactDef(def) ? fmtImpactWindowLabel(w, hours) : fmtActWindow(w),
        text: describeActivityWindow(def, w, hours, d, extra)
      });
    }
  }
  return items;
}
function renderWhyListItems(items){
  return items.map(item => {
    const cls = item.grade === 'good' ? 'why-good' : item.grade === 'fair' ? 'why-fair' : item.grade === 'poor' ? 'why-poor' : '';
    const head = item.time
      ? '<strong>' + esc(item.label) + ' (' + esc(item.time) + '):</strong> '
      : '';
    return '<li class="' + cls + '">' + head + esc(item.text) + '</li>';
  }).join('');
}
function buildActivityWhyList(def, hours, windows, d, extra, dayBars){
  const eligible = hours.filter(h => !h.ineligible);
  const intro = isImpactDef(def)
    ? 'Each note matches a colored stretch on the bars above (green = low impact, amber = moderate, red = high).'
    : 'Each note matches a colored stretch on the bars above (green = good, amber = fair, red = poor).';
  if(!eligible.length){
    return {
      intro: '',
      sections: [{
        title: '',
        items: [{
          grade: 'na',
          label: '',
          time: '',
          text: def.nightOnly
            ? 'Needs darkness — none left in this 24-hour window.'
            : 'Best in daylight; remaining hours are after dark.'
        }]
      }]
    };
  }
  if(dayBars && dayBars.length){
    const nowIso = d.hourly.time[nowIndex(d)];
    const sections = [];
    for(const day of dayBars){
      const dayEligible = day.hours.filter(h => !h.ineligible);
      if(!dayEligible.length) continue;
      const dayWindows = mergeActivityWindows(day.hours);
      const isToday = day.dateStr && nowIso.slice(0, 10) === String(day.dateStr).slice(0, 10);
      let items = buildWhyItemsForWindows(def, dayWindows, day.hours, d, extra, isToday ? nowIso : null);
      if(!items.length){
        items = [{
          grade: 'poor',
          label: isImpactDef(def) ? activityImpactSummaryLabel('poor') : activityGradeLabel('poor', def),
          time: '',
          text: 'No notable stretches for this day.'
        }];
      }
      sections.push({ title: plannerDayTitle(day.dayIndex, day.dateStr), items });
    }
    if(!sections.length){
      sections.push({
        title: '',
        items: [{
          grade: 'poor',
          label: 'Poor',
          time: '',
          text: 'No stretch rated good or fair in the next 24 hours.'
        }]
      });
    }
    return { intro, sections };
  }
  const nowIso = hours[0]?.time;
  const items = buildWhyItemsForWindows(def, windows, hours, d, extra, nowIso);
  if(!items.length){
    items.push({
      grade: 'poor',
      label: 'Poor',
      time: '',
      text: 'No stretch rated good or fair in the next 24 hours.'
    });
  }
  return { intro, sections: [{ title: '', items }] };
}
function plannerCompactUnpinned(pins){
  return isMobileTabLayout() && pins.length > 0;
}
function renderActivityCard(def, hours, d, extra, pins){
  pins = pins || activityPins;
  const dayBars = buildPlannerDayBars(d, def, extra);
  const todayHours = dayBars[0]?.hours || hours;
  if(!todayHours.length && !dayBars.length){
    return '<article class="activity-card"><div class="activity-head"><span class="activity-ico" aria-hidden="true">' + def.icon
      + '</span><span class="activity-name">' + esc(def.name) + '</span><span class="activity-grade poor">'
      + esc(activityGradeLabel('poor', def)) + '</span></div>'
      + '<div class="activity-window">No forecast hours available.</div></article>';
  }
  const eligible = todayHours.filter(h => !h.ineligible);
  const overall = activityOverallGrade(def, eligible, d);
  const windows = mergeActivityWindows(buildActivityHours(d, def, extra));
  const barHtml = dayBars.map(day => renderPlannerDayBar(day, d, def)).join('');
  const why = buildActivityWhyList(def, buildActivityHours(d, def, extra), windows, d, extra, dayBars);
  const whyIntro = why.intro ? '<p class="activity-why-lede">' + esc(why.intro) + '</p>' : '';
  const whyBody = why.sections.map(sec => {
    const list = renderWhyListItems(sec.items);
    if(sec.title){
      return '<div class="activity-why-day"><div class="activity-why-day-lbl">' + esc(sec.title) + '</div>'
        + '<ul class="activity-why-list">' + list + '</ul></div>';
    }
    return '<ul class="activity-why-list">' + list + '</ul>';
  }).join('');
  const isPinned = pins.includes(def.id);
  const head = '<div class="activity-head"><button type="button" class="activity-pin' + (isPinned ? ' on' : '')
    + '" data-act-pin="' + def.id + '" aria-label="' + (isPinned ? 'Unpin' : 'Pin') + ' ' + esc(def.name) + '" aria-pressed="'
    + isPinned + '">\u2605</button><span class="activity-ico" aria-hidden="true">' + def.icon + '</span>'
    + '<span class="activity-name">' + esc(def.name) + '</span>'
    + '<span class="activity-grade ' + overall + '">' + activityGradeLabel(overall, def) + '</span></div>';
  const windowLine = '<div class="activity-window">' + esc(summarizeActivityWindows(windows, buildActivityHours(d, def, extra), def)) + '</div>';
  const detailBody = barHtml
    + '<details class="activity-why"><summary>Why</summary>' + whyIntro
    + whyBody + '</details>';
  if(plannerCompactUnpinned(pins) && !isPinned){
    return '<article class="activity-card activity-card-compact">'
      + '<details class="activity-compact-details"><summary class="activity-compact-summary">' + head + windowLine
      + '</summary><div class="activity-compact-body">' + detailBody + '</div></details></article>';
  }
  return '<article class="activity-card' + (isPinned ? ' pinned' : '') + '">' + head + windowLine + detailBody + '</article>';
}
function renderPlannerSection(opts){
  const { box, summary, pinBar, lede, defs, pins, onPin, d, extra, impact, emptyMsg } = opts;
  if(!box) return;
  if(!defs.length){
    box.classList.remove('is-loading');
    box.textContent = emptyMsg;
    if(summary) summary.hidden = true;
    if(pinBar) pinBar.hidden = true;
    return;
  }
  renderActivityPinBar(pinBar, defs, pins, onPin);
  const displayDefs = sortActivitiesForDisplay(defs, pins);
  const sum = buildActivityWindowSummary(d, defs, extra, impact);
  if(summary){
    summary.hidden = false;
    summary.className = 'activity-summary' + (sum.cls ? ' ' + sum.cls : '');
    const compactNote = plannerCompactUnpinned(pins)
      ? '<p class="activity-compact-hint">Unpinned ' + (impact ? 'hazards' : 'activities')
        + ' collapsed — tap to expand. Pin \u2605 to keep on top.</p>' : '';
    summary.innerHTML = compactNote + sum.html;
  }
  box.classList.toggle('planner-list-compact', plannerCompactUnpinned(pins));
  box.classList.remove('is-loading');
  box.innerHTML = displayDefs.map(def =>
    renderActivityCard(def, buildActivityHours(d, def, extra), d, extra, pins)
  ).join('');
  box.querySelectorAll('.activity-pin').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      onPin(btn.getAttribute('data-act-pin'));
    });
  });
}
function renderActivityPlanner(d){
  const box = $('activityList');
  const impactBox = $('impactList');
  const lede = $('activityLede');
  const impactLede = $('impactLede');
  const summary = $('activitySummary');
  const impactSummary = $('impactSummary');
  if(!box && !impactBox) return;
  if(!d || !d.hourly || !d.hourly.time || !d.hourly.time.length){
    if(box){
      box.classList.remove('is-loading');
      box.innerHTML = panelUnavail('planner_forecast');
    }
    if(impactBox){
      impactBox.classList.remove('is-loading');
      impactBox.innerHTML = panelUnavail('planner_forecast');
    }
    if(summary) summary.hidden = true;
    if(impactSummary) impactSummary.hidden = true;
    return;
  }
  normalizePlannerPins();
  const loc = state.locations[state.active];
  const season = getActivitySeason(loc, d);
  const actDefs = activitiesForSeason(season);
  const extra = {
    aqi: outdoorAir.aqi,
    pm25: outdoorAir.pm25,
    coastal: loc && isCoastalLoc(loc)
  };
  renderPlannerSection({
    box, summary, pinBar: $('activityPinBar'), lede, defs: actDefs, pins: activityPins,
    onPin: toggleActivityPin, d, extra, impact: false,
    emptyMsg: 'No activities match the current season.'
  });
  renderPlannerSection({
    box: impactBox, summary: impactSummary, pinBar: $('impactPinBar'), lede: impactLede,
    defs: IMPACT_DEFS, pins: impactPins, onPin: toggleImpactPin, d, extra, impact: true,
    emptyMsg: 'Impact hours unavailable.'
  });
}
function todayOutlook(d){
  const periods = d.nwsDaily;
  if(periods && periods.length){
    const day = periods.find(p => p.isDaytime) || periods[0];
    let text = day.detailedForecast || day.shortForecast || '';
    if(day.temperature != null && !/high|low|near/i.test(text)){
      text += (text ? ' ' : '') + (day.isDaytime ? 'High near ' : 'Low around ') + day.temperature + '\u00B0.';
    }
    return text;
  }
  const hi = d.daily.temperature_2m_max && d.daily.temperature_2m_max[0];
  const sf = d.daily.shortForecast && d.daily.shortForecast[0];
  if(sf) return sf + (hi != null ? ' High near ' + Math.round(hi) + '\u00B0.' : '');
  const [cond] = wmo(d.daily.weather_code[0] ?? 0);
  return hi != null
    ? 'Expect ' + cond.toLowerCase() + ' conditions. High near ' + Math.round(hi) + '\u00B0.'
    : '';
}
function renderConditionsGlance(d, c, vis, visMiNum, dewVal, inHg){
  const air = d.air;
  const wind = Math.round(c.wind_speed_10m ?? 0);
  const windUnitLbl = windUnit();
  const windMph = state.units === 'F' ? wind : Math.round(wind * 0.621371);
  const items = [];
  if(air){
    items.push({
      k: 'Air quality',
      v: air.category + ' <small>(' + air.aqi + ')</small>',
      s: air.pm25 != null ? 'PM2.5 ' + air.pm25 + ' \u00B5g/m\u00B3 \u00B7 ' + air.source : air.source,
      cls: air.cls
    });
  }
  items.push({
    k: 'Wind',
    v: '<span class="dir-row">' + windCompassHtml(c.wind_direction_10m, 30) + '<span>' + wind + '<small> ' + windUnitLbl + ' ' + compass(c.wind_direction_10m) + '</small></span></span>',
    s: beaufortDesc(windMph) + (c.wind_gusts_10m ? ' \u00B7 gusts ' + Math.round(c.wind_gusts_10m) + ' ' + windUnitLbl : '')
  });
  items.push({
    k: 'Humidity',
    v: rhDisp(c.relative_humidity_2m) + '<small>%</small>',
    s: 'Relative humidity at the surface'
  });
  if(vis !== '\u2014' && visMiNum != null){
    items.push({ k: 'Visibility', v: vis, s: visibilityQuality(visMiNum) });
  }
  if(inHg !== '\u2014'){
    items.push({
      k: 'Pressure',
      v: (state.units === 'F' ? inHg + '<small> inHg</small>' : Math.round(c.pressure_msl) + '<small> hPa</small>'),
      s: 'Barometric pressure'
    });
  }
  items.push({
    k: 'Dew point',
    v: dewVal + '<small>' + degSym() + '</small>',
    s: dewPointNote(c.temperature_2m, dewVal)
  });
  $('conditionsGlance').innerHTML = items.map(it =>
    '<div class="g"><div class="gk">' + it.k + '</div><div class="gv' + (it.cls ? ' ' + it.cls : '') + '">' + it.v + '</div>'
    + (it.s ? '<div class="gs">' + it.s + '</div>' : '') + '</div>'
  ).join('');
}
function renderCurrent(d){
  const c = d.current, i = nowIndex(d);
  const cond = c.condition || wmo(c.weather_code)[0];
  const icon = c.icon || wmo(c.weather_code)[1];
  $('bigTemp').innerHTML = Math.round(c.temperature_2m) + '<sup>' + degSym() + '</sup>';
  $('nowIcon').textContent = icon;
  $('nowCond').textContent = c.textDescription || cond;
  const feels = c.apparent_temperature != null ? Math.round(c.apparent_temperature) : Math.round(c.temperature_2m);
  const src = c.source === 'metar'
    ? 'METAR ' + (c.station || '') + ' \u00B7 as of ' + new Date(c.time).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})
    : 'Open-Meteo model \u00B7 as of ' + hm(c.time);
  const feelsLine = feels !== Math.round(c.temperature_2m)
    ? 'Feels like <strong>' + feels + '\u00B0' + degSym() + '</strong> \u00B7 '
    : '';
  $('nowFeels').innerHTML = feelsLine + (c.source === 'metar' ? 'Observed \u00B7 ' : 'Modeled \u00B7 ') + src;
  $('nowOutlook').textContent = todayOutlook(d) || '';
  const loc = state.locations[state.active];
  $('nowTitle').textContent = loc.name + ' \u2014 now';

  const pNow = c.pressure_msl;
  const pPast = d.hourly.pressure_msl?.[Math.max(0, i - 3)];
  const dp = (pNow != null && pPast != null) ? pNow - pPast : 0;
  let trend, cls;
  if(dp > 0.8){ trend = '\u25B2 rising'; cls = 'up'; }
  else if(dp < -0.8){ trend = '\u25BC falling'; cls = 'dn'; }
  else { trend = '\u25AC steady'; cls = 'st'; }
  const inHg = pNow != null ? (pNow * 0.02953).toFixed(2) : '\u2014';
  const pressVal = state.units === 'F'
    ? inHg + ' <small>inHg</small>'
    : (pNow != null ? Math.round(pNow) : '\u2014') + ' <small>hPa</small>';
  const pressAlt = state.units === 'F' ? (pNow != null ? Math.round(pNow) + ' hPa' : '') : (pNow != null ? inHg + ' inHg' : '');

  const visUnit = (d.om && d.om.hourly_units && d.om.hourly_units.visibility) || 'm';
  let visMeters = c.visibility_m;
  if(visMeters == null) visMeters = d.hourly.visibility?.[i];
  if(visUnit === 'ft' && visMeters != null) visMeters = visMeters * 0.3048;
  const visMiNum = visMeters != null
    ? (state.units === 'F' ? visMeters / 1609.34 : visMeters / 1000)
    : null;
  const vis = visMiNum != null
    ? (state.units === 'F' ? visMiNum.toFixed(1) + ' <small>mi</small>' : visMiNum.toFixed(1) + ' <small>km</small>')
    : '\u2014';

  const dewVal = c.dewpoint_c != null
    ? (state.units === 'F' ? Math.round(c.dewpoint_c * 9/5 + 32) : Math.round(c.dewpoint_c))
    : Math.round(d.hourly.dew_point_2m?.[i] ?? 0);

  renderConditionsGlance(d, c, vis, visMiNum, dewVal, inHg);

  const rows = [
    ['Dew point', dewVal + '<small>' + degSym() + '</small>'],
    ['Pressure', pressVal + (pNow != null ? ' <span class="' + cls + '">' + trend + '</span><br><small>' + pressAlt + '</small>' : '')],
    ['Wind', windCompassHtml(c.wind_direction_10m, 22) + ' ' + Math.round(c.wind_speed_10m) + '<small> ' + windUnit() + ' ' + compass(c.wind_direction_10m) + '</small>'],
    ['Gusts', Math.round(c.wind_gusts_10m ?? 0) + '<small> ' + windUnit() + '</small>'],
    ['Visibility', vis],
    ['Cloud L/M/H', (d.hourly.cloud_cover_low?.[i] ?? 0) + '/' + (d.hourly.cloud_cover_mid?.[i] ?? 0) + '/' + (d.hourly.cloud_cover_high?.[i] ?? 0) + '<small>%</small> <small>(HRRR/model)</small>'],
    ['UV index', (d.hourly.uv_index?.[i] ?? 0).toFixed(1) + ' <small>' + uvCat(d.hourly.uv_index?.[i] ?? 0) + '</small>'],
    ['CAPE', Math.round(d.hourly.cape?.[i] ?? 0) + '<small> J/kg \u00B7 ' + capeCat(d.hourly.cape?.[i] ?? 0) + ' (HRRR)</small>'],
    ['Freezing lvl', state.units === 'F'
        ? (Math.round((d.hourly.freezing_level_height?.[i] ?? 0) * 3.281 / 100) * 100).toLocaleString() + '<small> ft</small>'
        : Math.round(d.hourly.freezing_level_height?.[i] ?? 0).toLocaleString() + '<small> m</small>'],
    ['Precip (1h)', (d.hourly.precipitation?.[i] ?? 0) + '<small> ' + (state.units === 'F' ? 'in' : 'mm') + ' (model)</small>']
  ];
  $('metrics').innerHTML = rows.map(r =>
    '<div class="metric"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>'
  ).join('');
  if(stormState.loaded) renderStormSetup(d);
}

function syncImpactSkyGroup(){
  const grp = $('impactSkyGroup');
  const panel = $('auroraPanel');
  if(grp && panel) grp.hidden = panel.hidden;
}
const IMPACT_PANEL_SECTION = {
  activityPanel: 'plan',
  impactPanel: 'plan',
  airPanel: 'air',
  exposurePanel: 'air',
  waterVerdictPanel: 'water',
  coastalPanel: 'water',
  marinePanel: 'water',
  streamPanel: 'water',
  auroraPanel: 'sky'
};
function impactSectionForPanel(panelId){
  return IMPACT_PANEL_SECTION[panelId] || null;
}
const IMPACT_SECTION_MAP = {
  plan: 'impactGroupPlan',
  air: 'impactGroupAir',
  water: 'impactWaterGroup',
  sky: 'impactSkyGroup'
};
let impactSectionObs = null;
function impactGroupVisible(id){
  const el = $(id);
  return !!(el && getComputedStyle(el).display !== 'none' && !el.hidden);
}
function setImpactSectionActive(key){
  const nav = $('impactSectionNav');
  if(!nav) return;
  nav.querySelectorAll('[data-impact-section]').forEach(btn => {
    btn.classList.toggle('on', btn.getAttribute('data-impact-section') === key);
  });
}
function scrollToImpactSection(key){
  const id = IMPACT_SECTION_MAP[key];
  const el = id && $(id);
  if(!el || !impactGroupVisible(id)) return;
  setImpactSectionActive(key);
  const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-h')) || 128;
  const nav = $('impactSectionNav');
  const navH = nav && !nav.hidden ? nav.offsetHeight : 0;
  const top = el.getBoundingClientRect().top + window.scrollY - chrome - navH - 6;
  window.scrollTo({ top: Math.max(0, top), behavior: isMobileTabLayout() ? 'auto' : 'smooth' });
}
function bindImpactSectionNav(){
  const nav = $('impactSectionNav');
  if(!nav || nav.dataset.bound) return;
  nav.dataset.bound = '1';
  nav.querySelectorAll('[data-impact-section]').forEach(btn => {
    btn.addEventListener('click', () => scrollToImpactSection(btn.getAttribute('data-impact-section')));
  });
}
function restartImpactSectionObserver(){
  if(impactSectionObs){
    impactSectionObs.disconnect();
    impactSectionObs = null;
  }
  if(!isMobileTabLayout() || getAppTab() !== 'impact' || typeof IntersectionObserver === 'undefined') return;
  const nav = $('impactSectionNav');
  if(!nav || nav.hidden) return;
  const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-h')) || 128;
  const navH = nav.offsetHeight || 44;
  impactSectionObs = new IntersectionObserver(entries => {
    const vis = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if(!vis.length) return;
    const key = Object.entries(IMPACT_SECTION_MAP).find(([, id]) => id === vis[0].target.id)?.[0];
    if(key) setImpactSectionActive(key);
  }, { root: null, rootMargin: '-' + (chrome + navH + 8) + 'px 0px -58% 0px', threshold: [0, 0.08, 0.2, 0.35] });
  Object.values(IMPACT_SECTION_MAP).forEach(id => {
    const el = $(id);
    if(el && impactGroupVisible(id)) impactSectionObs.observe(el);
  });
}
function syncImpactSectionNav(){
  const nav = $('impactSectionNav');
  if(!nav) return;
  const show = isMobileTabLayout() && getAppTab() === 'impact';
  nav.hidden = !show;
  if(!show){
    if(impactSectionObs){
      impactSectionObs.disconnect();
      impactSectionObs = null;
    }
    return;
  }
  Object.entries(IMPACT_SECTION_MAP).forEach(([key, id]) => {
    const btn = nav.querySelector('[data-impact-section="' + key + '"]');
    if(btn) btn.hidden = !impactGroupVisible(id);
  });
  const firstVisible = Object.keys(IMPACT_SECTION_MAP).find(key => {
    const btn = nav.querySelector('[data-impact-section="' + key + '"]');
    return btn && !btn.hidden;
  });
  if(firstVisible){
    const on = nav.querySelector('[data-impact-section].on:not([hidden])');
    if(!on) setImpactSectionActive(firstVisible);
  }
  requestAnimationFrame(() => restartImpactSectionObserver());
}
function syncImpactTabChrome(){
  syncImpactSkyGroup();
  syncImpactSectionNav();
}
async function renderAuroraHint(loc, d){
  const box = $('auroraImpactHint');
  const ovationBox = $('auroraOvation');
  const panel = $('auroraPanel');
  const hide = () => {
    if(box){ box.hidden = true; box.innerHTML = ''; }
    if(ovationBox){ ovationBox.hidden = true; ovationBox.innerHTML = ''; }
    if(panel) panel.hidden = true;
    syncImpactTabChrome();
  };
  if(!box || !panel || !loc || !d){ hide(); return; }
  if(loc.lat < 40){ hide(); return; }
  try{
    const [kpRes, ovationRes] = await Promise.all([
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'),
      fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json')
    ]);
    if(!kpRes.ok) throw new Error('kp');
    const rows = await kpRes.json();
    const last = rows[rows.length - 1];
    const kp = parseFloat(last && last[1]);
    let ovationScore = 0;
    let ovationCoords = null;
    if(ovationRes.ok){
      const ov = await ovationRes.json();
      ovationCoords = ov.coordinates || ov;
      if(Array.isArray(ovationCoords)){
        const near = ovationCoords.filter(c => Array.isArray(c) && c.length >= 3
          && Math.abs(c[1] - loc.lat) < 4 && Math.abs(c[0] - loc.lon) < 8);
        if(near.length) ovationScore = Math.max(...near.map(c => c[2] || 0));
      }
    }
    if((isNaN(kp) || kp < 4) && ovationScore < 25){ hide(); return; }
    const i0 = nowIndex(d);
    let nightCloud = 100;
    for(let j = i0; j < Math.min(i0 + 12, d.hourly.time.length); j++){
      const h = new Date(d.hourly.time[j]).getHours();
      if(h >= 20 || h <= 5) nightCloud = Math.min(nightCloud, activityCloudCover(d.hourly, j));
    }
    if(nightCloud > 65){ hide(); return; }
    panel.hidden = false;
    box.hidden = false;
    const ovationNote = ovationScore >= 25 ? ' OVATION model shows aurora potential at your latitude.' : '';
    box.innerHTML = '<div class="lbl">Northern lights</div>'
      + '<div class="verdict good">Possible tonight</div>'
      + '<div class="detail">Planetary Kp ' + (isNaN(kp) ? '\u2014' : kp.toFixed(1)) + ' with relatively clear skies tonight (cloud ~'
      + Math.round(nightCloud) + '%).' + ovationNote + ' Best away from city lights, facing north.</div>';
    if(ovationBox){
      ovationBox.hidden = false;
      ovationBox.innerHTML = renderOvationStrip(loc, kp, ovationScore, ovationCoords);
    }
    syncImpactTabChrome();
  }catch(e){
    if(panel) panel.hidden = false;
    if(ovationBox){ ovationBox.hidden = true; ovationBox.innerHTML = ''; }
    if(box){
      box.hidden = false;
      setPanelUnavail(box, 'aurora_api');
    }
    syncImpactTabChrome();
  }
}
function renderOvationStrip(loc, kp, ovationScore, coords){
  const pct = Math.min(100, Math.round(ovationScore));
  let bars = '';
  if(Array.isArray(coords)){
    const lats = [loc.lat + 6, loc.lat + 3, loc.lat, loc.lat - 3, loc.lat - 6];
    const scores = lats.map(lat => {
      const near = coords.filter(c => Array.isArray(c) && c.length >= 3
        && Math.abs(c[1] - lat) < 2 && Math.abs(c[0] - loc.lon) < 8);
      return near.length ? Math.max(...near.map(c => c[2] || 0)) : 0;
    });
    bars = '<div class="aurora-ov-bars" aria-hidden="true">' + scores.map((s, i) => {
      const h = Math.max(4, Math.round(s / 100 * 36));
      return '<span class="aurora-ov-bar" style="height:' + h + 'px" title="'
        + esc(lats[i].toFixed(0) + '\u00B0N \u00B7 ' + Math.round(s) + '%') + '"></span>';
    }).join('') + '</div>'
      + '<div class="aurora-ov-lbls"><span>North</span><span>Your lat</span><span>South</span></div>';
  }
  const kpNote = !isNaN(kp) && kp >= 5 ? ' \u00B7 Kp elevated' : '';
  return '<div class="lbl">OVATION aurora probability</div>'
    + '<div class="aurora-ov-main">' + pct + '<small>% at your latitude</small></div>'
    + bars
    + '<div class="detail" style="margin-top:8px">NOAA OVATION model snapshot \u00B7 planetary Kp '
    + (isNaN(kp) ? '\u2014' : kp.toFixed(1)) + kpNote + '</div>';
}
