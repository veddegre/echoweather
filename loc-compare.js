// ---------- saved location comparison ----------
let spcDay1GeoCache = null;
async function getSpcDay1Geo(){
  if(spcDay1GeoCache) return spcDay1GeoCache;
  try{
    const r = await fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson');
    if(r.ok) spcDay1GeoCache = await r.json();
  }catch(e){ /* ignore */ }
  return spcDay1GeoCache;
}
async function fetchLocAlerts(loc){
  if(!isLikelyUS(loc)) return [];
  try{
    const r = await nwsFetch('https://api.weather.gov/alerts/active?point=' + loc.lat + ',' + loc.lon);
    if(!r.ok) return [];
    return (await r.json()).features || [];
  }catch(e){ return []; }
}
function locCompareBadges(loc, alerts, spcGeo){
  const badges = [];
  if(isLikelyUS(loc) && alerts.length){
    const warns = alerts.filter(f => /warning/i.test(f.properties?.event || '')).length;
    const watches = alerts.filter(f => /watch/i.test(f.properties?.event || '')).length;
    if(warns) badges.push('<span class="lc-badge alert">' + warns + ' warning' + (warns > 1 ? 's' : '') + '</span>');
    if(watches) badges.push('<span class="lc-badge warn">' + watches + ' watch' + (watches > 1 ? 'es' : '') + '</span>');
    const adv = alerts.length - warns - watches;
    if(adv > 0) badges.push('<span class="lc-badge">' + adv + ' advisory' + (adv > 1 ? 'ies' : '') + '</span>');
  }
  if(isLikelyUS(loc) && spcGeo && typeof spcRiskAtPoint === 'function'){
    const risk = spcRiskAtPoint(loc.lon, loc.lat, spcGeo);
    if(risk && risk.dn >= 2){
      badges.push('<span class="lc-badge spc">SPC ' + esc(risk.label2 || risk.label || 'elevated') + '</span>');
    }
  }
  return badges.length ? '<div class="lc-storm">' + badges.join('') + '</div>' : '';
}
async function renderLocCompare(){
  const panel = $('locComparePanel'), box = $('locCompare');
  if(!panel || !box) return;
  if(state.locations.length < 2){ panel.hidden = true; return; }
  panel.hidden = false;
  box.innerHTML = '<div class="lc-status radar-note" style="grid-column:1/-1">Loading saved locations\u2026</div>';
  try{
    const spcGeo = await getSpcDay1Geo();
    const cards = await Promise.all(state.locations.map(async (loc, i) => {
    const alertsP = fetchLocAlerts(loc);
    if(i === state.active && state.data){
      const t = Math.round(state.data.current.temperature_2m);
      const w = Math.round(state.data.current.wind_speed_10m);
      const [, ic] = wmo(state.data.current.weather_code);
      const alerts = await alertsP;
      return { loc, i, temp: t, wind: w, icon: ic, active: true, badges: locCompareBadges(loc, alerts, spcGeo) };
    }
    try{
      const [wxRes, alerts] = await Promise.all([
        fetch('https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon
          + '&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit='
          + (state.units === 'F' ? 'fahrenheit' : 'celsius')
          + '&wind_speed_unit=' + (state.units === 'F' ? 'mph' : 'kmh') + '&timezone=auto'),
        alertsP
      ]);
      if(!wxRes.ok) throw new Error('wx');
      const j = await wxRes.json();
      const c = j.current || {};
      const [, ic] = wmo(c.weather_code ?? 0);
      return {
        loc, i,
        temp: Math.round(c.temperature_2m),
        wind: Math.round(c.wind_speed_10m),
        icon: ic,
        active: i === state.active,
        badges: locCompareBadges(loc, alerts, spcGeo)
      };
    }catch(e){
      const alerts = await alertsP;
      return { loc, i, temp: null, wind: null, icon: '', wxFailed: true, active: i === state.active, badges: locCompareBadges(loc, alerts, spcGeo) };
    }
  }));
    box.innerHTML = cards.map(c =>
      '<div class="lc-card"' + (c.active ? ' style="border-color:var(--accent)"' : '') + '>'
      + '<div class="lc-name">' + esc(c.loc.name) + (c.active ? ' \u00B7 active' : '') + '</div>'
      + '<div class="lc-temp">' + (c.icon ? '<span aria-hidden="true">' + c.icon + '</span> ' : '')
      + (c.temp != null ? c.temp + degSym() : (c.wxFailed ? '<span class="lc-wx-unavail">—</span>' : '\u2014')) + '</div>'
      + '<div class="lc-meta">' + (c.wind != null ? 'Wind ' + c.wind + ' ' + windUnit()
        : (c.wxFailed ? '<span class="lc-wx-unavail">' + esc(PANEL_UNAVAIL_MSG.loc_compare_wx) + '</span>' : 'Unavailable')) + '</div>'
      + (c.badges || '') + '</div>'
    ).join('');
  }catch(e){
    box.innerHTML = '<div class="lc-status" style="grid-column:1/-1">' + panelUnavail('loc_compare_api') + '</div>';
    console.warn('locCompare', e);
  }
}
