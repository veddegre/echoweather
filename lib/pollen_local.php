<?php
declare(strict_types=1);

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/cache.php';

/** NWS weather cache for pollen modifiers (seconds). */
function pollen_nws_cache_ttl(array $cfg): int
{
    $ttl = (int) ($cfg['pollen_nws_cache_ttl'] ?? 3600);
    return max(300, min($ttl, 21600));
}

/** Soft USA-NPN phenology cache (seconds). */
function pollen_npn_cache_ttl(array $cfg): int
{
    $ttl = (int) ($cfg['pollen_npn_cache_ttl'] ?? 43200);
    return max(3600, min($ttl, 86400));
}

/**
 * Fetch NWS hourly periods for a point (cached).
 * @return list<array>|null
 */
function fetch_nws_hourly_for_pollen(float $lat, float $lon, array $cfg): ?array
{
    $decimals = (int) ($cfg['pollen_cache_grid'] ?? 1);
    $decimals = max(0, min($decimals, 2));
    $gridKey = 'nws_' . pollen_grid_key($lat, $lon, $decimals);
    $ttl = pollen_nws_cache_ttl($cfg);
    $cached = read_pollen_cache($gridKey, $ttl);
    if ($cached !== null && isset($cached['data']['periods']) && is_array($cached['data']['periods'])) {
        return $cached['data']['periods'];
    }

    try {
        $pointsUrl = sprintf(
            'https://api.weather.gov/points/%.4f,%.4f',
            $lat,
            $lon
        );
        $pointsBody = http_get($pointsUrl, 12, ['Accept: application/geo+json']);
        $points = json_decode($pointsBody, true);
        $hourlyUrl = $points['properties']['forecastHourly'] ?? null;
        if (!is_string($hourlyUrl) || $hourlyUrl === '') {
            return null;
        }
        $hourlyBody = http_get($hourlyUrl, 15, ['Accept: application/geo+json']);
        $hourly = json_decode($hourlyBody, true);
        $periods = $hourly['properties']['periods'] ?? null;
        if (!is_array($periods) || !$periods) {
            return null;
        }
        write_pollen_cache($gridKey, $lat, $lon, ['periods' => $periods]);
        return $periods;
    } catch (Throwable $e) {
        log_api_error('pollen/nws', $e);
        $stale = read_pollen_cache_stale($gridKey);
        if ($stale !== null && isset($stale['data']['periods']) && is_array($stale['data']['periods'])) {
            return $stale['data']['periods'];
        }
        return null;
    }
}

/**
 * Aggregate NWS hourly into a simple day weather summary.
 * @param list<array> $periods
 * @return array{precipProb:float,humidity:float|null,windMph:float|null,tempF:float|null,sampleCount:int}|null
 */
function nws_day_weather_summary(array $periods, string $dateStr): ?array
{
    $precip = [];
    $humidity = [];
    $wind = [];
    $temp = [];
    foreach ($periods as $p) {
        $start = (string) ($p['startTime'] ?? '');
        if (strlen($start) < 10 || substr($start, 0, 10) !== $dateStr) {
            continue;
        }
        $prob = $p['probabilityOfPrecipitation']['value'] ?? null;
        if ($prob !== null) {
            $precip[] = (float) $prob;
        }
        $rh = $p['relativeHumidity']['value'] ?? null;
        if ($rh !== null) {
            $humidity[] = (float) $rh;
        }
        $w = parse_nws_wind_mph_string((string) ($p['windSpeed'] ?? ''));
        if ($w !== null) {
            $wind[] = $w;
        }
        $t = $p['temperature'] ?? null;
        $unit = strtoupper((string) ($p['temperatureUnit'] ?? 'F'));
        if ($t !== null) {
            $tf = $unit === 'C' ? ((float) $t * 9 / 5 + 32) : (float) $t;
            $temp[] = $tf;
        }
    }
    $n = max(count($precip), count($humidity), count($wind), count($temp));
    if ($n === 0) {
        return null;
    }
    return [
        'precipProb' => $precip ? array_sum($precip) / count($precip) : 0.0,
        'humidity' => $humidity ? array_sum($humidity) / count($humidity) : null,
        'windMph' => $wind ? array_sum($wind) / count($wind) : null,
        'tempF' => $temp ? array_sum($temp) / count($temp) : null,
        'sampleCount' => $n,
    ];
}

function parse_nws_wind_mph_string(string $s): ?float
{
    if (preg_match('/(\d+)\s*to\s*(\d+)/i', $s, $m)) {
        return ((float) $m[1] + (float) $m[2]) / 2;
    }
    if (preg_match('/(\d+)/', $s, $m)) {
        return (float) $m[1];
    }
    return null;
}

/**
 * Weather modifier in UPI units (−0.8 … +0.5).
 * Rain / high humidity suppress airborne pollen; dry + moderate wind favors it.
 */
function pollen_weather_upi_delta(?array $wx): float
{
    if ($wx === null) {
        return 0.0;
    }
    $delta = 0.0;
    $precip = (float) ($wx['precipProb'] ?? 0);
    if ($precip >= 60) {
        $delta -= 0.8;
    } elseif ($precip >= 40) {
        $delta -= 0.5;
    } elseif ($precip >= 25) {
        $delta -= 0.25;
    }

    $rh = $wx['humidity'];
    if ($rh !== null) {
        if ($rh >= 80) {
            $delta -= 0.25;
        } elseif ($rh <= 45) {
            $delta += 0.15;
        }
    }

    $wind = $wx['windMph'];
    if ($wind !== null) {
        if ($wind >= 8 && $wind <= 20 && $precip < 30) {
            $delta += 0.3;
        } elseif ($wind > 30) {
            $delta -= 0.15;
        }
    }

    return max(-0.8, min(0.5, $delta));
}

/**
 * Soft USA-NPN phenology: only boost when nearby YES pollen-release exists.
 * Absence of observations → unknown (no negative modifier).
 *
 * @return array{modifier:float,confidenceBoost:float,nearbyYes:int,nearbyObs:int,species:list<string>}
 */
function fetch_npn_pollen_signal(float $lat, float $lon, array $cfg): array
{
    $empty = [
        'modifier' => 0.0,
        'confidenceBoost' => 0.0,
        'nearbyYes' => 0,
        'nearbyObs' => 0,
        'species' => [],
    ];
    if (!(bool) ($cfg['pollen_npn_enabled'] ?? true)) {
        return $empty;
    }

    $decimals = (int) ($cfg['pollen_cache_grid'] ?? 1);
    $decimals = max(0, min($decimals, 2));
    $gridKey = 'npn_' . pollen_grid_key($lat, $lon, $decimals);
    $ttl = pollen_npn_cache_ttl($cfg);
    $cached = read_pollen_cache($gridKey, $ttl);
    if ($cached !== null && isset($cached['data']['signal']) && is_array($cached['data']['signal'])) {
        return $cached['data']['signal'];
    }

    try {
        $end = new DateTimeImmutable('today');
        $start = $end->modify('-21 days');
        // Annual ragweed 145, red maple 3, sugar maple 61 — pollen release 502/503
        $params = [
            'request_src=EchoWeather',
            'climate_data=0',
            'species_id[1]=145',
            'species_id[2]=3',
            'species_id[3]=61',
            'phenophase_id[1]=502',
            'phenophase_id[2]=503',
            'start_date=' . rawurlencode($start->format('Y-m-d')),
            'end_date=' . rawurlencode($end->format('Y-m-d')),
        ];
        $url = 'https://services.usanpn.org/npn_portal/observations/getObservations.json?' . implode('&', $params);
        $body = http_get($url, 12);
        $rows = json_decode($body, true);
        if (!is_array($rows)) {
            write_pollen_cache($gridKey, $lat, $lon, ['signal' => $empty]);
            return $empty;
        }

        $radiusMi = (float) ($cfg['pollen_npn_radius_mi'] ?? 75);
        $nearby = 0;
        $yes = 0;
        $species = [];
        foreach ($rows as $r) {
            if (!is_array($r)) {
                continue;
            }
            $olat = isset($r['latitude']) ? (float) $r['latitude'] : null;
            $olon = isset($r['longitude']) ? (float) $r['longitude'] : null;
            if ($olat === null || $olon === null) {
                continue;
            }
            $dist = haversine_mi($lat, $lon, $olat, $olon);
            if ($dist > $radiusMi) {
                continue;
            }
            $nearby++;
            if ((string) ($r['phenophase_status'] ?? '') === '1') {
                $yes++;
                $name = (string) ($r['common_name'] ?? $r['species'] ?? 'plant');
                if ($name !== '' && !in_array($name, $species, true)) {
                    $species[] = $name;
                }
            }
        }

        $signal = $empty;
        $signal['nearbyObs'] = $nearby;
        $signal['nearbyYes'] = $yes;
        $signal['species'] = array_slice($species, 0, 6);
        if ($yes >= 1) {
            $signal['modifier'] = min(0.4, 0.15 + 0.05 * min($yes, 5));
            $signal['confidenceBoost'] = min(0.25, 0.1 + 0.03 * min($yes, 5));
        }
        write_pollen_cache($gridKey, $lat, $lon, ['signal' => $signal]);
        return $signal;
    } catch (Throwable $e) {
        log_api_error('pollen/npn', $e);
        $stale = read_pollen_cache_stale($gridKey);
        if ($stale !== null && isset($stale['data']['signal']) && is_array($stale['data']['signal'])) {
            return $stale['data']['signal'];
        }
        return $empty;
    }
}

function haversine_mi(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $r = 3958.8;
    $p1 = deg2rad($lat1);
    $p2 = deg2rad($lat2);
    $dp = deg2rad($lat2 - $lat1);
    $dl = deg2rad($lon2 - $lon1);
    $a = sin($dp / 2) ** 2 + cos($p1) * cos($p2) * sin($dl / 2) ** 2;
    return 2 * $r * asin(min(1, sqrt($a)));
}

function pollen_upi_category(float $upi): string
{
    if ($upi <= 0) {
        return 'None';
    }
    if ($upi < 1.5) {
        return 'Very Low';
    }
    if ($upi < 2.5) {
        return 'Low';
    }
    if ($upi < 3.5) {
        return 'Moderate';
    }
    if ($upi < 4.5) {
        return 'High';
    }
    return 'Very High';
}

/**
 * Attach local risk (Google baseline + NWS weather + soft NPN) to Google days.
 */
function apply_local_pollen_model(array $payload, float $lat, float $lon, array $cfg): array
{
    $periods = fetch_nws_hourly_for_pollen($lat, $lon, $cfg);
    $npn = fetch_npn_pollen_signal($lat, $lon, $cfg);
    $days = $payload['days'] ?? [];
    if (!is_array($days)) {
        return $payload;
    }

    $localDays = [];
    foreach ($days as $day) {
        if (!is_array($day)) {
            continue;
        }
        $date = (string) ($day['date'] ?? '');
        $wx = ($periods && $date !== '') ? nws_day_weather_summary($periods, $date) : null;
        $weatherDelta = pollen_weather_upi_delta($wx);
        $phenoDelta = (float) ($npn['modifier'] ?? 0);

        $typesOut = [];
        $maxLocal = 0.0;
        foreach ($day['types'] ?? [] as $type) {
            if (!is_array($type)) {
                continue;
            }
            $g = (float) ($type['index'] ?? 0);
            $local = max(0, min(5, $g + $weatherDelta + $phenoDelta));
            if ($local > $maxLocal) {
                $maxLocal = $local;
            }
            $typesOut[] = [
                'code' => (string) ($type['code'] ?? ''),
                'name' => (string) ($type['name'] ?? ''),
                'googleIndex' => (int) round($g),
                'index' => round($local, 1),
                'category' => pollen_upi_category($local),
                'inSeason' => (bool) ($type['inSeason'] ?? false),
            ];
        }

        $confidence = 0.55;
        if ($wx !== null) {
            $confidence += 0.2;
        }
        $confidence += (float) ($npn['confidenceBoost'] ?? 0);
        if ((int) ($npn['nearbyObs'] ?? 0) === 0) {
            // No NPN coverage — unknown, not absence
            $confidence = min($confidence, 0.75);
        }
        $confidence = max(0.4, min(0.95, $confidence));

        $localDays[] = [
            'date' => $date,
            'types' => $typesOut,
            'weather' => $wx ? [
                'precipProb' => round((float) $wx['precipProb']),
                'humidity' => $wx['humidity'] !== null ? round((float) $wx['humidity']) : null,
                'windMph' => $wx['windMph'] !== null ? round((float) $wx['windMph']) : null,
                'modifier' => round($weatherDelta, 2),
            ] : null,
            'phenology' => [
                'modifier' => round($phenoDelta, 2),
                'nearbyYes' => (int) ($npn['nearbyYes'] ?? 0),
                'nearbyObs' => (int) ($npn['nearbyObs'] ?? 0),
                'species' => $npn['species'] ?? [],
                'status' => ((int) ($npn['nearbyYes'] ?? 0) > 0)
                    ? 'active'
                    : (((int) ($npn['nearbyObs'] ?? 0) > 0) ? 'quiet' : 'unknown'),
            ],
            'localIndex' => round($maxLocal, 1),
            'confidence' => (int) round($confidence * 100),
        ];
    }

    // Trend from first → second local day
    $trend = 'steady';
    if (count($localDays) >= 2) {
        $a = (float) ($localDays[0]['localIndex'] ?? 0);
        $b = (float) ($localDays[1]['localIndex'] ?? 0);
        if ($b - $a >= 0.4) {
            $trend = 'rising';
        } elseif ($a - $b >= 0.4) {
            $trend = 'falling';
        }
    }

    $payload['local'] = [
        'days' => $localDays,
        'trend' => $trend,
        'sources' => array_values(array_filter([
            'google',
            $periods ? 'nws' : null,
            ((int) ($npn['nearbyObs'] ?? 0) > 0 || (int) ($npn['nearbyYes'] ?? 0) > 0) ? 'npn' : null,
        ])),
    ];
    return $payload;
}
