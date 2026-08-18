/**
 * Pure helpers mirrored from app.js / storm.js for unit tests.
 * Keep in sync when those functions change.
 */

export function sparklineDomain(nums, opts) {
  opts = opts || {};
  const dataMin = Math.min(...nums);
  const dataMax = Math.max(...nums);
  if (opts.domain) {
    return { min: opts.domain.min, max: opts.domain.max };
  }
  let min = dataMin;
  let max = dataMax;
  const minSpan = opts.minSpan ?? 0;
  if (minSpan && max - min < minSpan) {
    const mid = (min + max) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  return { min, max };
}

export function nwsToWmo(text) {
  const s = String(text || '').toLowerCase();
  if (/tornado|severe thunder/.test(s)) return 95;
  const isChance = /\b(chance|slight chance|isolated|scattered)\b/.test(s);
  if (/thunder/.test(s)) return isChance ? 80 : 95;
  if (/wintry mix|rain\/snow|snow\/rain|ice pellet/.test(s)) return 67;
  if (/freezing rain|sleet|wintry/.test(s)) return 67;
  if (/snow|blizzard|flurr/.test(s)) return s.includes('light') ? 71 : 73;
  if (/rain|shower|drizzle/.test(s)) return s.includes('light') || s.includes('chance') ? 61 : 63;
  if (/fog|mist|haze|smoke/.test(s)) return 45;
  if (/cloudy|overcast/.test(s)) return s.includes('part') ? 2 : 3;
  if (/mostly sunny|partly/.test(s)) return 2;
  if (/sunny|clear/.test(s)) return s.includes('mostly') ? 1 : 0;
  if (/wind/.test(s)) return 2;
  return 2;
}

export function nwsTempToDisp(t, unit, displayUnits) {
  if (t === null || t === undefined) return null;
  if (displayUnits === 'F') return unit === 'F' ? t : Math.round((t * 9) / 5 + 32);
  return unit === 'C' ? t : Math.round(((t - 32) * 5) / 9);
}

export function msToDisp(ms, displayUnits) {
  if (ms === null || ms === undefined) return null;
  return displayUnits === 'F' ? Math.round(ms * 2.237) : Math.round(ms * 3.6);
}

export function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isLikelyUS(loc) {
  if (loc.country === 'US') return true;
  if (loc.country && loc.country !== 'US') return false;
  return loc.lat >= 18 && loc.lat <= 72 && loc.lon >= -180 && loc.lon <= -60;
}
