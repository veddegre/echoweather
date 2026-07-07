// ---------- METAR / NWS obs vs forecast ----------
function obsBiasBadge(obs, fc, kind, unit, dec){
  if(obs === null || fc === null || isNaN(obs) || isNaN(fc)) return { html: '\u2014', cls: 'obs-close' };
  const d = obs - fc;
  const close = Math.abs(d) < (dec ?? 1);
  if(close) return { html: 'On forecast', cls: 'obs-close' };
  const n = dec ? Math.abs(d).toFixed(dec) : Math.abs(Math.round(d));
  if(kind === 'wind'){
    return d > 0
      ? { html: n + unit + ' stronger', cls: 'obs-higher' }
      : { html: n + unit + ' lighter', cls: 'obs-lower' };
  }
  if(kind === 'pressure'){
    return d > 0
      ? { html: n + unit + ' higher', cls: 'obs-higher' }
      : { html: n + unit + ' lower', cls: 'obs-lower' };
  }
  return d > 0
    ? { html: n + unit + ' warmer', cls: 'obs-higher' }
    : { html: n + unit + ' cooler', cls: 'obs-lower' };
}
function obsCompareRow(label, obsDisp, fcDisp, bias){
  return '<div class="obs-row">'
    + '<div class="obs-label">' + label + '</div>'
    + '<div class="obs-val"><div class="n">' + (obsDisp ?? '\u2014') + '</div><div class="t">Observed</div></div>'
    + '<div class="obs-val"><div class="n">' + (fcDisp ?? '\u2014') + '</div><div class="t">NWS forecast</div></div>'
    + '<span class="obs-badge ' + bias.cls + '">' + bias.html + '</span>'
    + '</div>';
}
async function loadObs(loc){
  return panelTask('obsPanel', 'obsStatus', async () => {
    $('obsMetrics').innerHTML = '';
    $('obsStation').textContent = '';
    $('obsNote').textContent = '';
    if(!state.data){ $('obsNote').textContent = 'FORECAST REQUIRED FOR COMPARISON'; return; }
    try{
      const d = state.data;
      let obs = null, sid = null;
      if(d.metar){
        obs = d.metar.props;
        sid = d.metar.id;
      }else{
        const pr = await nwsFetch('https://api.weather.gov/points/' + loc.lat + ',' + loc.lon);
        if(!pr.ok) throw new Error('obs_points');
        const pts = await pr.json();
        const got = await fetchMetarObs(pts.properties);
        if(!got) throw new Error('no recent obs');
        obs = got.props; sid = got.id;
      }

      const i = nowIndex(d);
      const hp = d.nwsHourly && d.nwsHourly[i];
      const fcTemp = hp ? nwsTempToDisp(hp.temperature, hp.temperatureUnit === 'C' ? 'C' : 'F') : Math.round(d.hourly.temperature_2m[i]);
      const fcWind = hp ? parseNwsWindMph(hp.windSpeed) : Math.round(d.hourly.wind_speed_10m[i]);
      const fcDew = Math.round(d.hourly.dew_point_2m[i] ?? 0);
      const fcPres = d.hourly.pressure_msl[i] ?? d.current.pressure_msl;

      const obsTempC = nwsVal(obs.temperature);
      const obsDewC = nwsVal(obs.dewpoint);
      const obsWindMs = nwsVal(obs.windSpeed);
      const obsPresPa = nwsVal(obs.barometricPressure);
      const toDispTemp = c => state.units === 'F' ? Math.round(c * 9/5 + 32) : Math.round(c);
      const toDispWind = ms => state.units === 'F' ? Math.round(ms * 2.237) : Math.round(ms * 3.6);
      const obsTemp = obsTempC !== null && obsTempC !== undefined ? toDispTemp(obsTempC) : null;
      const obsDew = obsDewC !== null && obsDewC !== undefined ? toDispTemp(obsDewC) : null;
      const obsWind = obsWindMs !== null && obsWindMs !== undefined ? toDispWind(obsWindMs) : null;
      const obsPresHpa = obsPresPa !== null && obsPresPa !== undefined ? obsPresPa / 100 : null;
      const obsTime = obs.timestamp ? new Date(obs.timestamp).toLocaleString([], { hour:'numeric', minute:'2-digit' }) : '';
      $('obsStation').textContent = sid + ' \u00B7 observed ' + obsTime;
      const tempUnit = degSym();
      const wUnit = windUnit();
      const rows = [
        obsCompareRow('Temp',
          obsTemp !== null ? obsTemp + tempUnit : null,
          fcTemp + tempUnit,
          obsBiasBadge(obsTemp, fcTemp, 'temp', tempUnit)),
        obsCompareRow('Dew',
          obsDew !== null ? obsDew + tempUnit : null,
          fcDew + tempUnit,
          obsBiasBadge(obsDew, fcDew, 'temp', tempUnit)),
        obsCompareRow('Wind',
          obsWind !== null ? obsWind + ' ' + wUnit : null,
          fcWind + ' ' + wUnit,
          obsBiasBadge(obsWind, fcWind, 'wind', ' ' + wUnit)),
        obsCompareRow('Pressure',
          obsPresHpa !== null
            ? (state.units === 'F' ? (obsPresHpa * 0.02953).toFixed(2) + ' inHg' : Math.round(obsPresHpa) + ' hPa')
            : null,
          state.units === 'F' ? (fcPres * 0.02953).toFixed(2) + ' inHg' : Math.round(fcPres) + ' hPa',
          obsBiasBadge(obsPresHpa, fcPres, 'pressure', ' hPa', 1))
      ];
      $('obsMetrics').innerHTML = rows.join('');
      $('obsNote').textContent = 'Badge shows how the observation compares to the NWS forecast this hour (warmer/cooler, stronger/lighter wind, etc.).';
      await renderMetarTrace(sid);
    }catch(e){
      const code = String(e.message).includes('obs_points') ? 'obs_points' : 'no_obs';
      setPanelUnavail($('obsNote'), code, e.message && !String(e.message).includes('obs_points') ? e.message : '');
      $('metarTrace').hidden = true;
      console.error('obs', e);
    }
  });
}
async function renderMetarTrace(stationId){
  const wrap = $('metarTrace'), box = $('metarTrends'), summary = $('metarSummary');
  if(!wrap || !box || !stationId){ if(wrap) wrap.hidden = true; return; }
  try{
    const r = await nwsFetch('https://api.weather.gov/stations/' + encodeURIComponent(stationId) + '/observations?limit=168');
    if(!r.ok) throw new Error('obs list HTTP ' + r.status);
    const feats = ((await r.json()).features || []).slice().reverse();
    if(feats.length < 3){ wrap.hidden = true; return; }
    const temps = [], winds = [], pressures = [];
    const toDispTemp = c => state.units === 'F' ? Math.round(c * 9/5 + 32) : Math.round(c);
    const toDispWind = ms => state.units === 'F' ? Math.round(ms * 2.237) : Math.round(ms * 3.6);
    feats.forEach(f => {
      const p = f.properties || {};
      const t = nwsVal(p.temperature);
      const w = nwsVal(p.windSpeed);
      const pr = nwsVal(p.barometricPressure);
      if(t != null) temps.push(toDispTemp(t));
      if(w != null) winds.push(toDispWind(w));
      if(pr != null){
        const hpa = pr / 100;
        pressures.push(state.units === 'F' ? Math.round(hpa * 0.02953 * 100) / 100 : Math.round(hpa));
      }
    });
    if(summary){
      const sumHtml = metarHistorySummary(feats, temps, pressures);
      if(sumHtml){
        summary.hidden = false;
        summary.innerHTML = sumHtml;
      }else{
        summary.hidden = true;
        summary.innerHTML = '';
      }
    }
    const presLabel = state.units === 'F' ? 'Pressure (7d, inHg)' : 'Pressure (7d, hPa)';
    const presUnit = state.units === 'F' ? ' inHg' : ' hPa';
    const cards = [
      sparklineCard('Temperature (7d)', temps.slice(-168), 'temp', degSym(), {
        hint: 'Station METAR temperature trend',
        rightPrefix: 'Latest'
      }),
      sparklineCard('Wind speed (7d)', winds.slice(-168), 'wind', ' ' + windUnit(), {
        hint: 'Sustained wind from METAR',
        rightPrefix: 'Latest'
      })
    ];
    if(pressures.length >= 3){
      cards.push(sparklineCard(presLabel, pressures.slice(-168), 'pres', presUnit, {
        hint: 'Barometric pressure at the station',
        rightPrefix: 'Latest',
        fmt: v => state.units === 'F' ? Number(v).toFixed(2) : String(Math.round(v))
      }));
    }
    box.className = 'trends metar-trends' + (cards.length === 3 ? ' metar-trends-3' : '');
    box.innerHTML = cards.join('');
    const foot = $('metarTraceFoot');
    if(foot){
      if(feats.length >= 48){
        foot.hidden = false;
        foot.textContent = feats.length + ' hourly observations over the past 7 days.';
      }else{
        foot.hidden = true;
        foot.textContent = '';
      }
    }
    wrap.hidden = false;
  }catch(e){
    wrap.hidden = false;
    if(summary){ summary.hidden = true; summary.innerHTML = ''; }
    box.className = 'trends metar-trends';
    box.innerHTML = '';
    const foot = $('metarTraceFoot');
    if(foot){ foot.hidden = true; foot.textContent = ''; }
    setPanelUnavail(box, 'metar_history');
  }
}
function metarHistorySummary(feats, temps, pressures){
  if(!feats.length || temps.length < 2) return '';
  const latestT = temps[temps.length - 1];
  const dayAgoIdx = Math.max(0, temps.length - 25);
  const dayAgoT = temps[dayAgoIdx];
  const delta24 = latestT - dayAgoT;
  const weekAgoIdx = Math.max(0, temps.length - 168);
  const weekAgoT = temps[weekAgoIdx];
  const delta7d = latestT - weekAgoT;
  const u = degSym();
  const fmtDelta = d => {
    if(!d || Math.abs(d) < 1) return 'about steady';
    return (d > 0 ? 'up ' : 'down ') + Math.abs(Math.round(d)) + u;
  };
  let presLine = '';
  if(pressures.length >= 12){
    const pNow = pressures[pressures.length - 1];
    const p6 = pressures[Math.max(0, pressures.length - 7)];
    const pDelta = pNow - p6;
    const pu = state.units === 'F' ? ' inHg' : ' hPa';
    if(Math.abs(pDelta) >= (state.units === 'F' ? 0.03 : 1)){
      presLine = ' Pressure ' + (pDelta > 0 ? 'rising' : 'falling') + ' (~'
        + (state.units === 'F' ? Math.abs(pDelta).toFixed(2) : Math.abs(Math.round(pDelta))) + pu + ' in 6 h).';
    }
  }
  return '<div class="lbl">24 h &amp; 7 d trend</div>'
    + 'Temperature ' + fmtDelta(delta24) + ' vs ~24 h ago'
    + (temps.length >= 48 ? '; ' + fmtDelta(delta7d) + ' vs ~7 d ago' : '')
    + '.' + presLine;
}
