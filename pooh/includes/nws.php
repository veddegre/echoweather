<?php
/**
 * NWS API — forecasts, METAR observations, and alerts (US locations).
 */

require_once __DIR__ . '/alerts.php';

define('NWS_USER_AGENT', 'HundredAcreWeather/1.0 (https://echoweather.com/pooh/; educational)');

function nwsHttpGet(string $url, string $accept = 'application/json'): ?string
{
    if (!function_exists('curl_init')) {
        return null;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_HTTPHEADER     => [
            'Accept: ' . $accept,
            'User-Agent: ' . NWS_USER_AGENT,
        ],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

    return ($code >= 200 && $code < 300 && $body !== false) ? $body : null;
}

function nwsVal(mixed $obj): mixed
{
    if (!is_array($obj)) {
        return $obj;
    }

    return array_key_exists('value', $obj) ? $obj['value'] : $obj;
}

function nwsWindToMs(?array $obj): ?float
{
    if ($obj === null) {
        return null;
    }

    $v = nwsVal($obj);
    if ($v === null) {
        return null;
    }

    $uc = (string) ($obj['unitCode'] ?? '');
    if (str_contains($uc, 'km_h')) {
        return (float) $v / 3.6;
    }
    if (str_contains($uc, 'kn')) {
        return (float) $v * 0.514444;
    }

    return (float) $v;
}

function nwsWindToUnit(?array $obj, string $windUnit): ?float
{
    $ms = nwsWindToMs($obj);
    if ($ms === null) {
        return null;
    }

    return match ($windUnit) {
        'kmh'   => round($ms * 3.6, 1),
        'ms'    => round($ms, 1),
        default => round($ms * 2.23694, 1),
    };
}

function nwsPeriodTempToUnit(float $temp, string $periodUnit, string $targetUnit): float
{
    $f = strtoupper($periodUnit) === 'F' ? $temp : ($temp * 9 / 5 + 32);

    if ($targetUnit === 'fahrenheit') {
        return round($f, 1);
    }

    return round(($f - 32) * 5 / 9, 1);
}

function celsiusToTempUnit(float $c, string $targetUnit): float
{
    if ($targetUnit === 'fahrenheit') {
        return round($c * 9 / 5 + 32, 1);
    }

    return round($c, 1);
}

function parseNwsWindMph(string $s): float
{
    if (preg_match('/(\d+)\s*to\s*(\d+)/i', $s, $m)) {
        return round(((int) $m[1] + (int) $m[2]) / 2, 1);
    }
    if (preg_match('/(\d+)/', $s, $m)) {
        return (float) $m[1];
    }

    return 0.0;
}

function nwsWindStringToUnit(string $s, string $windUnit): float
{
    $mph = parseNwsWindMph($s);

    return match ($windUnit) {
        'kmh'   => round($mph * 1.60934, 1),
        'ms'    => round($mph * 0.44704, 1),
        default => $mph,
    };
}

function nwsShortForecastToWmo(string $text): int
{
    $s = strtolower($text);

    if (preg_match('/tornado|severe thunder/', $s)) {
        return 95;
    }

    $isChance = (bool) preg_match('/\b(chance|slight chance|isolated|scattered)\b/', $s);

    if (str_contains($s, 'thunder')) {
        return $isChance ? 80 : 95;
    }
    if (preg_match('/wintry mix|rain\/snow|snow\/rain|ice pellet|freezing rain|sleet|wintry/', $s)) {
        return 67;
    }
    if (preg_match('/snow|blizzard|flurr/', $s)) {
        return str_contains($s, 'light') ? 71 : 73;
    }
    if (preg_match('/rain|shower|drizzle/', $s)) {
        return (str_contains($s, 'light') || str_contains($s, 'chance')) ? 61 : 63;
    }
    if (preg_match('/fog|mist|haze|smoke/', $s)) {
        return 45;
    }
    if (str_contains($s, 'cloudy') || str_contains($s, 'overcast')) {
        return str_contains($s, 'part') ? 2 : 3;
    }
    if (str_contains($s, 'mostly sunny') || str_contains($s, 'partly')) {
        return 2;
    }
    if (str_contains($s, 'sunny') || str_contains($s, 'clear')) {
        return str_contains($s, 'mostly') ? 1 : 0;
    }
    if (str_contains($s, 'wind')) {
        return 2;
    }

    return 2;
}

function closestTimeIndex(string $iso, array $times): int
{
    $target = strtotime($iso);
    $best = 0;
    $diff = PHP_INT_MAX;

    foreach ($times as $i => $time) {
        $d = abs(strtotime((string) $time) - $target);
        if ($d < $diff) {
            $diff = $d;
            $best = $i;
        }
    }

    return $best;
}

function nowHourlyIndex(array $hourly): int
{
    if (empty($hourly['time'])) {
        return 0;
    }

    $now = strtotime(date('Y-m-d H:00:00'));
    foreach ($hourly['time'] as $i => $time) {
        if (strtotime((string) $time) >= $now) {
            return (int) $i;
        }
    }

    return 0;
}

function nwsPeriodForOmIndex(array $periods, array $omTimes, int $index): ?array
{
    foreach ($periods as $period) {
        if (closestTimeIndex($period['startTime'] ?? '', $omTimes) === $index) {
            return $period;
        }
    }

    return null;
}

function backfillNwsObsFields(array $latest, array $older): array
{
    $out = $latest;
    foreach (['windSpeed', 'windDirection', 'windGust'] as $field) {
        if (nwsVal($out[$field] ?? null) !== null) {
            continue;
        }
        foreach ($older as $row) {
            if (nwsVal($row[$field] ?? null) !== null) {
                $out[$field] = $row[$field];
                break;
            }
        }
    }

    return $out;
}

function fetchStationLatestObs(string $stationId): ?array
{
    $url = 'https://api.weather.gov/stations/' . rawurlencode($stationId) . '/observations?limit=12';
    $body = nwsHttpGet($url);
    if ($body === null) {
        return null;
    }

    $data = json_decode($body, true);
    $props = [];
    foreach ($data['features'] ?? [] as $feature) {
        $p = $feature['properties'] ?? null;
        if (is_array($p) && !empty($p['timestamp'])) {
            $props[] = $p;
        }
    }

    if (empty($props)) {
        return null;
    }

    return backfillNwsObsFields($props[0], array_slice($props, 1));
}

function fetchMetarObs(array $pointsProps): ?array
{
    $stationsUrl = $pointsProps['observationStations'] ?? null;
    if (!$stationsUrl) {
        return null;
    }

    $body = nwsHttpGet($stationsUrl);
    if ($body === null) {
        return null;
    }

    $stList = json_decode($body, true);
    foreach (array_slice($stList['features'] ?? [], 0, 4) as $station) {
        $sp = $station['properties'] ?? [];
        $id = $sp['stationIdentifier'] ?? $sp['stationId'] ?? null;
        if (!$id) {
            continue;
        }
        $obs = fetchStationLatestObs($id);
        if ($obs) {
            return ['id' => $id, 'props' => $obs];
        }
    }

    return null;
}

function fetchNwsForecasts(float $lat, float $lon, bool $includeMetar = true): ?array
{
    $pointsBody = nwsHttpGet(sprintf('https://api.weather.gov/points/%.4f,%.4f', $lat, $lon));
    if ($pointsBody === null) {
        return null;
    }

    $points = json_decode($pointsBody, true);
    $props = $points['properties'] ?? null;
    if (!is_array($props)) {
        return null;
    }

    $hourlyUrl = $props['forecastHourly'] ?? null;
    $dailyUrl = $props['forecast'] ?? null;

    $hourlyPeriods = [];
    $dailyPeriods = [];

    if ($hourlyUrl) {
        $hrBody = nwsHttpGet($hourlyUrl);
        if ($hrBody !== null) {
            $hr = json_decode($hrBody, true);
            $hourlyPeriods = $hr['properties']['periods'] ?? [];
        }
    }

    if ($dailyUrl) {
        $fcBody = nwsHttpGet($dailyUrl);
        if ($fcBody !== null) {
            $fc = json_decode($fcBody, true);
            $dailyPeriods = $fc['properties']['periods'] ?? [];
        }
    }

    if (empty($hourlyPeriods) && empty($dailyPeriods)) {
        return null;
    }

    $metar = $includeMetar ? fetchMetarObs($props) : null;

    return [
        'points'        => $props,
        'hourlyPeriods' => $hourlyPeriods,
        'dailyPeriods'  => $dailyPeriods,
        'metar'         => $metar,
    ];
}

function fetchNwsAlerts(float $lat, float $lon): array
{
    $url = sprintf('https://api.weather.gov/alerts/active?point=%.4f,%.4f', $lat, $lon);
    $body = nwsHttpGet($url, 'application/geo+json');
    if ($body === null) {
        return [];
    }

    $data = json_decode($body, true);
    if (!isset($data['features']) || !is_array($data['features'])) {
        return [];
    }

    $alerts = [];
    foreach ($data['features'] as $feature) {
        $props = $feature['properties'] ?? [];
        $event = $props['event'] ?? 'Alert';
        $alerts[] = [
            'event'       => $event,
            'type'        => classifyAlertType($event),
            'headline'    => $props['headline'] ?? '',
            'severity'    => $props['severity'] ?? '',
            'urgency'     => $props['urgency'] ?? '',
            'certainty'   => $props['certainty'] ?? '',
            'description' => $props['description'] ?? '',
            'instruction' => $props['instruction'] ?? '',
            'effective'   => $props['effective'] ?? '',
            'expires'     => $props['expires'] ?? '',
            'onset'       => $props['onset'] ?? '',
            'ends'        => $props['ends'] ?? '',
            'areaDesc'    => $props['areaDesc'] ?? '',
            'senderName'  => $props['senderName'] ?? '',
            'url'         => $props['@id'] ?? ($feature['id'] ?? ''),
        ];
    }

    return $alerts;
}

function buildHourlyFromNws(array $periods, array $omHourly, array $config): array
{
    $omTimes = $omHourly['time'] ?? [];
    if (empty($omTimes)) {
        return $omHourly;
    }

    $start = nowHourlyIndex($omHourly);
    $limit = min(24, count($omTimes) - $start);
    $tempUnit = $config['temperature_unit'] ?? 'fahrenheit';
    $windUnit = $config['wind_unit'] ?? 'mph';

    $hourly = [
        'time'                     => [],
        'temperature_2m'           => [],
        'precipitation_probability'=> [],
        'weather_code'             => [],
        'wind_speed_10m'           => [],
        'wind_gusts_10m'           => [],
    ];

    for ($n = 0; $n < $limit; $n++) {
        $i = $start + $n;
        $period = nwsPeriodForOmIndex($periods, $omTimes, $i);
        $hourly['time'][] = $omTimes[$i];
        $hourly['temperature_2m'][] = $period
            ? nwsPeriodTempToUnit(
                (float) $period['temperature'],
                $period['temperatureUnit'] ?? 'F',
                $tempUnit
            )
            : ($omHourly['temperature_2m'][$i] ?? null);
        $hourly['precipitation_probability'][] = $period
            ? (int) (nwsVal($period['probabilityOfPrecipitation'] ?? null) ?? 0)
            : (int) ($omHourly['precipitation_probability'][$i] ?? 0);
        $hourly['weather_code'][] = $period
            ? nwsShortForecastToWmo($period['shortForecast'] ?? '')
            : (int) ($omHourly['weather_code'][$i] ?? 0);
        $hourly['wind_speed_10m'][] = $period
            ? nwsWindStringToUnit($period['windSpeed'] ?? '', $windUnit)
            : ($omHourly['wind_speed_10m'][$i] ?? null);
        $hourly['wind_gusts_10m'][] = $omHourly['wind_gusts_10m'][$i] ?? null;
    }

    return $hourly;
}

function buildDailyFromNws(array $periods, array $omDaily, array $config): array
{
    $tempUnit = $config['temperature_unit'] ?? 'fahrenheit';
    $omTimes = $omDaily['time'] ?? [];
    $daily = [
        'time'                  => [],
        'temperature_2m_max'    => [],
        'temperature_2m_min'    => [],
        'weather_code'          => [],
        'precipitation_sum'     => [],
        'wind_speed_10m_max'    => [],
        'wind_gusts_10m_max'    => [],
        'sunrise'               => [],
        'sunset'                => [],
    ];

    for ($i = 0; $i < count($periods) && count($daily['time']) < 3; $i++) {
        $period = $periods[$i];
        if (empty($period['isDaytime'])) {
            continue;
        }

        $night = $periods[$i + 1] ?? null;
        $date = substr($period['startTime'] ?? '', 0, 10);
        $omIdx = array_search($date, $omTimes, true);

        $daily['time'][] = $date;
        $daily['temperature_2m_max'][] = nwsPeriodTempToUnit(
            (float) $period['temperature'],
            $period['temperatureUnit'] ?? 'F',
            $tempUnit
        );
        $daily['temperature_2m_min'][] = ($night && empty($night['isDaytime']))
            ? nwsPeriodTempToUnit(
                (float) $night['temperature'],
                $night['temperatureUnit'] ?? 'F',
                $tempUnit
            )
            : ($omIdx !== false ? ($omDaily['temperature_2m_min'][$omIdx] ?? null) : null);
        $daily['weather_code'][] = nwsShortForecastToWmo($period['shortForecast'] ?? '');
        $daily['precipitation_sum'][] = $omIdx !== false
            ? ($omDaily['precipitation_sum'][$omIdx] ?? 0)
            : 0;
        $daily['wind_speed_10m_max'][] = $omIdx !== false
            ? ($omDaily['wind_speed_10m_max'][$omIdx] ?? null)
            : null;
        $daily['wind_gusts_10m_max'][] = $omIdx !== false
            ? ($omDaily['wind_gusts_10m_max'][$omIdx] ?? null)
            : null;
        $daily['sunrise'][] = $omIdx !== false ? ($omDaily['sunrise'][$omIdx] ?? null) : null;
        $daily['sunset'][] = $omIdx !== false ? ($omDaily['sunset'][$omIdx] ?? null) : null;
    }

    return $daily;
}

function buildCurrentFromMetar(array $metar, array $omData, array $hourlyPeriods, array $config): array
{
    $p = $metar['props'];
    $omCurrent = $omData['current'] ?? [];
    $tempUnit = $config['temperature_unit'] ?? 'fahrenheit';
    $windUnit = $config['wind_unit'] ?? 'mph';

    $tempC = nwsVal($p['temperature'] ?? null);
    $wind = nwsWindToUnit(is_array($p['windSpeed'] ?? null) ? $p['windSpeed'] : null, $windUnit);
    $gusts = nwsWindToUnit(is_array($p['windGust'] ?? null) ? $p['windGust'] : null, $windUnit);

    $hp = $hourlyPeriods[0] ?? null;
    $nwsShort = $hp['shortForecast'] ?? '';
    $skyText = $p['textDescription'] ?? $nwsShort;
    $code = nwsShortForecastToWmo($skyText !== '' ? $skyText : $nwsShort);

    $current = $omCurrent;
    if ($tempC !== null) {
        $current['temperature_2m'] = celsiusToTempUnit((float) $tempC, $tempUnit);
    }
    if ($wind !== null) {
        $current['wind_speed_10m'] = $wind;
    }
    if ($gusts !== null) {
        $current['wind_gusts_10m'] = $gusts;
    } elseif ($wind !== null) {
        $current['wind_gusts_10m'] = $wind;
    }

    $rh = nwsVal($p['relativeHumidity'] ?? null);
    if ($rh !== null) {
        $current['relative_humidity_2m'] = (int) round((float) $rh);
    }

    $current['weather_code'] = $code;
    $current['precipitation'] = $omCurrent['precipitation'] ?? 0;
    $current['is_day'] = $omCurrent['is_day'] ?? 1;

    return $current;
}

function buildCurrentFromNwsHourly(?array $period, array $omCurrent, array $config): array
{
    if ($period === null) {
        return $omCurrent;
    }

    $tempUnit = $config['temperature_unit'] ?? 'fahrenheit';
    $windUnit = $config['wind_unit'] ?? 'mph';
    $current = $omCurrent;

    $current['temperature_2m'] = nwsPeriodTempToUnit(
        (float) $period['temperature'],
        $period['temperatureUnit'] ?? 'F',
        $tempUnit
    );
    $current['wind_speed_10m'] = nwsWindStringToUnit($period['windSpeed'] ?? '', $windUnit);
    $current['wind_gusts_10m'] = $current['wind_gusts_10m'] ?? $current['wind_speed_10m'];
    $current['weather_code'] = nwsShortForecastToWmo($period['shortForecast'] ?? '');
    $current['precipitation'] = $omCurrent['precipitation'] ?? 0;

    return $current;
}

function applyNwsForecastToOpenMeteo(array $omData, array $nws, array $config): array
{
    $forecastSource = 'open-meteo';
    $currentSource = 'open-meteo';

    if (!empty($nws['hourlyPeriods'])) {
        $omData['hourly'] = buildHourlyFromNws(
            $nws['hourlyPeriods'],
            $omData['hourly'] ?? [],
            $config
        );
        $forecastSource = 'nws';
    }

    if (!empty($nws['dailyPeriods'])) {
        $omData['daily'] = buildDailyFromNws(
            $nws['dailyPeriods'],
            $omData['daily'] ?? [],
            $config
        );
        $forecastSource = 'nws';
    }

    if (!empty($nws['metar'])) {
        $omData['current'] = buildCurrentFromMetar(
            $nws['metar'],
            $omData,
            $nws['hourlyPeriods'] ?? [],
            $config
        );
        $currentSource = 'metar';
    } elseif (!empty($nws['hourlyPeriods'])) {
        $omTimes = $omData['hourly']['time'] ?? [];
        $nowIdx = nowHourlyIndex($omData['hourly'] ?? []);
        $period = nwsPeriodForOmIndex($nws['hourlyPeriods'], $omTimes, $nowIdx);
        $omData['current'] = buildCurrentFromNwsHourly(
            $period,
            $omData['current'] ?? [],
            $config
        );
        $currentSource = 'nws';
    }

    return [
        'data'            => $omData,
        'forecast_source' => $forecastSource,
        'current_source'  => $currentSource,
    ];
}
