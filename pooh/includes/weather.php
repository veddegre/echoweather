<?php
/**
 * Weather fetching and Hundred Acre level determination
 */

require_once __DIR__ . '/levels.php';
require_once __DIR__ . '/alerts.php';

function fetchWeather(array $config, float $lat, float $lon): array
{
    $cacheKey = sprintf('weather_%.4f_%.4f', $lat, $lon);
    $cacheFile = rtrim($config['cache_dir'], '/') . '/' . md5($cacheKey) . '.json';
    $ttl = (int) ($config['cache_ttl'] ?? 0);

    if ($ttl > 0 && is_file($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
        $cached = json_decode(file_get_contents($cacheFile), true);
        if (is_array($cached)) {
            return $cached;
        }
    }

    $tempUnit = $config['temperature_unit'] === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    $windUnit = match ($config['wind_unit'] ?? 'mph') {
        'kmh' => 'kmh',
        'ms'  => 'ms',
        default => 'mph',
    };

    $params = http_build_query([
        'latitude'       => $lat,
        'longitude'      => $lon,
        'current'        => 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,is_day',
        'hourly'         => 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m',
        'daily'          => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset',
        'temperature_unit' => $tempUnit,
        'wind_speed_unit'  => $windUnit,
        'timezone'       => 'auto',
        'forecast_days'  => 3,
    ]);

    $url = 'https://api.open-meteo.com/v1/forecast?' . $params;
    $response = httpGet($url);

    if ($response === null) {
        throw new RuntimeException('Unable to fetch weather data. Check your network connection.');
    }

    $data = json_decode($response, true);
    if (!is_array($data) || !isset($data['current'])) {
        throw new RuntimeException('Weather API returned an unexpected response.');
    }

    $alerts = [];
    $nwsAvailable = !empty($config['nws_alerts']) && isUsLocation($lat, $lon);
    if ($nwsAvailable) {
        $alerts = fetchNwsAlerts($lat, $lon);
    }

    $levelResult = determineLevel($data, $alerts, $config);
    $levels = getWeatherLevels();

    $result = [
        'fetched_at'   => time(),
        'timezone'     => $data['timezone'] ?? 'UTC',
        'location'     => [
            'latitude'  => $lat,
            'longitude' => $lon,
            'name'      => $config['location_name'] ?? 'The Hundred Acre Wood',
        ],
        'current'      => $data['current'],
        'daily'        => formatDaily($data['daily'] ?? [], $config),
        'hourly'       => formatHourly($data['hourly'] ?? [], $config),
        'alerts'       => $alerts,
        'nws_available'=> $nwsAvailable,
        'nws_enabled'  => !empty($config['nws_alerts']),
        'level'        => $levelResult['level'],
        'level_info'   => $levels[$levelResult['level']],
        'level_reasons'=> formatWoodsReasons($levelResult['reasons']),
        'advisor'      => pickAdvisor($levelResult['level'], $levelResult['reasons']),
        'spot_character' => pickSpotCharacter($levelResult['level'], $levelResult['reasons']),
    ];

    if ($ttl > 0) {
        if (!is_dir($config['cache_dir'])) {
            @mkdir($config['cache_dir'], 0755, true);
        }
        file_put_contents($cacheFile, json_encode($result));
    }

    return $result;
}

function httpGet(string $url): ?string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_USERAGENT      => 'HundredAcreWeather/1.0',
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ($code >= 200 && $code < 300 && $body !== false) ? $body : null;
    }

    $ctx = stream_context_create([
        'http' => [
            'timeout' => 15,
            'header'  => "User-Agent: HundredAcreWeather/1.0\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    return $body !== false ? $body : null;
}

function isUsLocation(float $lat, float $lon): bool
{
    return $lat >= 24.0 && $lat <= 50.0 && $lon >= -125.0 && $lon <= -66.0;
}

function fetchNwsAlerts(float $lat, float $lon): array
{
    $url = sprintf(
        'https://api.weather.gov/alerts/active?point=%.4f,%.4f',
        $lat,
        $lon
    );

    if (!function_exists('curl_init')) {
        return [];
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => ['Accept: application/geo+json', 'User-Agent: HundredAcreWeather/1.0 (educational)'],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code !== 200 || $body === false) {
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

function determineLevel(array $data, array $alerts, array $config): array
{
    $current = $data['current'];
    $reasons = [];
    $candidates = [0];

    $code = (int) ($current['weather_code'] ?? 0);
    $codeLevel = weatherCodeLevel($code);
    if ($codeLevel > 0) {
        $candidates[] = $codeLevel;
        $reasons[] = weatherCodeDescription($code);
    }

    $wind = (float) ($current['wind_speed_10m'] ?? 0);
    $gusts = (float) ($current['wind_gusts_10m'] ?? $wind);
    $windLevel = windLevel($wind, $gusts, $config['wind_unit'] ?? 'mph');
    if ($windLevel > 0) {
        $candidates[] = $windLevel;
        $reasons[] = sprintf('Wind %s, gusts %s %s', formatNumber($wind), formatNumber($gusts), $config['wind_unit']);
    }

    $temp = (float) ($current['temperature_2m'] ?? 20);
    $tempLevel = temperatureLevel($temp, $config['temperature_unit']);
    if ($tempLevel > 0) {
        $candidates[] = $tempLevel;
        $unit = $config['temperature_unit'] === 'fahrenheit' ? '°F' : '°C';
        $reasons[] = sprintf('Temperature %s%s', formatNumber($temp), $unit);
    }

    $precip = (float) ($current['precipitation'] ?? 0);
    if ($precip > 0) {
        $precipLevel = $precip > 10 ? 3 : ($precip > 2 ? 2 : 1);
        $candidates[] = $precipLevel;
        $reasons[] = sprintf('Precipitation %.1f mm/h', $precip);
    }

    foreach ($alerts as $alert) {
        $alertLevel = alertLevel($alert);
        if ($alertLevel > 0) {
            $candidates[] = $alertLevel;
            $reasons[] = 'Active alert: ' . ($alert['event'] ?? 'Unknown');
        }
    }

    $level = max($candidates);
    $reasons = array_values(array_unique($reasons));

    return ['level' => $level, 'reasons' => $reasons];
}

function weatherCodeLevel(int $code): int
{
    return match (true) {
        in_array($code, [0, 1], true)                     => 0,
        in_array($code, [2, 3], true)                     => 1,
        in_array($code, [45, 48, 51, 53], true)           => 1,
        in_array($code, [55, 56, 57, 61, 71, 77, 80], true)=> 2,
        in_array($code, [63, 73, 81, 85], true)           => 2,
        in_array($code, [65, 67, 75, 82, 86, 95], true)    => 3,
        in_array($code, [96, 99], true)                     => 4,
        default                                             => 1,
    };
}

function weatherCodeDescription(int $code): string
{
    $map = [
        0 => 'Clear sky', 1 => 'Mainly clear', 2 => 'Partly cloudy', 3 => 'Overcast',
        45 => 'Fog', 48 => 'Depositing rime fog',
        51 => 'Light drizzle', 53 => 'Moderate drizzle', 55 => 'Dense drizzle',
        56 => 'Light freezing drizzle', 57 => 'Dense freezing drizzle',
        61 => 'Slight rain', 63 => 'Moderate rain', 65 => 'Heavy rain',
        66 => 'Light freezing rain', 67 => 'Heavy freezing rain',
        71 => 'Slight snow', 73 => 'Moderate snow', 75 => 'Heavy snow', 77 => 'Snow grains',
        80 => 'Slight rain showers', 81 => 'Moderate rain showers', 82 => 'Violent rain showers',
        85 => 'Slight snow showers', 86 => 'Heavy snow showers',
        95 => 'Thunderstorm', 96 => 'Thunderstorm with slight hail', 99 => 'Thunderstorm with heavy hail',
    ];
    return $map[$code] ?? 'Current conditions';
}

function windLevel(float $wind, float $gusts, string $unit): int
{
    // Normalize to mph for thresholds
    $toMph = match ($unit) {
        'kmh' => fn(float $v) => $v * 0.621371,
        'ms'  => fn(float $v) => $v * 2.23694,
        default => fn(float $v) => $v,
    };

    $g = $toMph($gusts);
    $w = $toMph($wind);

    return match (true) {
        $g >= 58 || $w >= 45 => 5,
        $g >= 45 || $w >= 35 => 4,
        $g >= 35 || $w >= 25 => 3,
        $g >= 25 || $w >= 18 => 2,
        $g >= 15 || $w >= 10 => 1,
        default => 0,
    };
}

function temperatureLevel(float $temp, string $unit): int
{
    // Work in Fahrenheit for thresholds
    $f = $unit === 'celsius' ? ($temp * 9 / 5 + 32) : $temp;

    return match (true) {
        $f <= -15 || $f >= 110 => 5,
        $f <= 0 || $f >= 100  => 4,
        $f <= 10 || $f >= 95   => 3,
        $f <= 20 || $f >= 92   => 2,
        $f <= 28 || $f >= 88   => 1,
        default                => 0,
    };
}

function alertLevel(array $alert): int
{
    $event = strtolower($alert['event'] ?? '');
    $severity = strtolower($alert['severity'] ?? '');

    if (str_contains($event, 'tornado warning')
        || str_contains($event, 'flash flood emergency')
        || str_contains($event, 'extreme wind warning')) {
        return 5;
    }

    if (str_contains($event, 'warning') && (
        str_contains($event, 'severe thunderstorm')
        || str_contains($event, 'hurricane')
        || str_contains($event, 'ice storm')
        || str_contains($event, 'blizzard')
        || str_contains($event, 'flash flood')
    )) {
        return 4;
    }

    if (str_contains($event, 'warning')) {
        return 3;
    }

    if (str_contains($event, 'watch') || $severity === 'severe') {
        return 2;
    }

    if (str_contains($event, 'advisory')) {
        return 2;
    }

    return 1;
}

function pickAdvisorCharacter(int $level, array $reasons): string
{
    $blob = strtolower(implode(' ', $reasons));

    if ($level >= 5) {
        return 'Christopher Robin';
    }
    if ($level >= 4) {
        return 'Christopher Robin';
    }

    if ($level >= 3) {
        if (str_contains($blob, 'alert') || str_contains($blob, 'watch') || str_contains($blob, 'warning')) {
            return 'Owl';
        }
        return 'Owl';
    }

    if ($level >= 2) {
        if (str_contains($blob, 'wind') || str_contains($blob, 'gust')) {
            return 'Piglet';
        }
        if (str_contains($blob, 'alert') || str_contains($blob, 'advisory')) {
            return 'Rabbit';
        }
        if (str_contains($blob, 'rain') || str_contains($blob, 'drizzle') || str_contains($blob, 'snow')) {
            return 'Eeyore';
        }
        return 'Piglet';
    }

    if ($level >= 1) {
        if (str_contains($blob, 'rain') || str_contains($blob, 'drizzle')
            || str_contains($blob, 'fog') || str_contains($blob, 'cloud')
            || str_contains($blob, 'overcast')) {
            return 'Eeyore';
        }
        if (str_contains($blob, 'wind') || str_contains($blob, 'gust')) {
            return 'Piglet';
        }
        return 'Pooh';
    }

    return 'Pooh';
}

function pickSpotCharacter(int $level, array $reasons): ?string
{
    if ($level >= 5) {
        return null;
    }

    $advisor = pickAdvisorCharacter($level, $reasons);
    $levels = getWeatherLevels();
    $default = $levels[$level]['character'] ?? null;

    // Prefer context-specific character when it adds flavor (Eeyore/Rabbit/Owl)
    if (in_array($advisor, ['Eeyore', 'Rabbit', 'Piglet'], true) && $advisor !== $default) {
        return $advisor;
    }

    return $default;
}

function pickAdvisor(int $level, array $reasons): array
{
    $character = pickAdvisorCharacter($level, $reasons);
    $quotes = getAdvisorQuotes();
    $pool = $quotes[$character][$level]
        ?? $quotes[$character]['any']
        ?? ['Stay aware of changing conditions.'];

    $seed = crc32($character . '|' . $level . '|' . implode(';', $reasons));
    $quote = $pool[$seed % count($pool)];

    $verbs = [
        'Pooh'              => 'says',
        'Piglet'            => 'adds, quietly',
        'Rabbit'            => 'insists',
        'Owl'               => 'declares',
        'Eeyore'            => 'mutters',
        'Christopher Robin' => 'calls out',
    ];

    $verb = $verbs[$character] ?? 'says';

    return [
        'character' => $character,
        'verb'      => $verb,
        'quote'     => $quote,
        'full'      => $character . ' ' . $verb . ': “' . $quote . '”',
    ];
}

function formatWoodsReasons(array $reasons): array
{
    $out = [];
    foreach ($reasons as $reason) {
        $r = $reason;
        if (str_starts_with($r, 'Active alert:')) {
            $event = trim(substr($r, strlen('Active alert:')));
            $out[] = 'Official word from beyond the woods: ' . $event;
            continue;
        }
        if (str_starts_with($r, 'Wind ')) {
            $out[] = 'The trees report ' . lcfirst($r);
            continue;
        }
        if (str_starts_with($r, 'Temperature ')) {
            $out[] = 'Thermometer reading: ' . substr($r, strlen('Temperature '));
            continue;
        }
        if (str_starts_with($r, 'Precipitation ')) {
            $out[] = 'Sky is dropping water at ' . substr($r, strlen('Precipitation '));
            continue;
        }
        $out[] = $r;
    }
    return $out;
}

function formatDaily(array $daily, array $config): array
{
    if (empty($daily['time'])) {
        return [];
    }

    $days = [];
    $count = count($daily['time']);
    $tempUnit = $config['temperature_unit'] === 'fahrenheit' ? '°F' : '°C';
    $windUnit = $config['wind_unit'] ?? 'mph';

    for ($i = 0; $i < $count; $i++) {
        $code = (int) ($daily['weather_code'][$i] ?? 0);
        $days[] = [
            'date'        => $daily['time'][$i],
            'high'        => $daily['temperature_2m_max'][$i] ?? null,
            'low'         => $daily['temperature_2m_min'][$i] ?? null,
            'precip_sum'  => $daily['precipitation_sum'][$i] ?? 0,
            'wind_max'    => $daily['wind_speed_10m_max'][$i] ?? null,
            'gust_max'    => $daily['wind_gusts_10m_max'][$i] ?? null,
            'weather_code'=> $code,
            'description' => weatherCodeDescription($code),
            'sunrise'     => $daily['sunrise'][$i] ?? null,
            'sunset'      => $daily['sunset'][$i] ?? null,
            'temp_unit'   => $tempUnit,
            'wind_unit'   => $windUnit,
        ];
    }

    return $days;
}

function formatHourly(array $hourly, array $config): array
{
    if (empty($hourly['time'])) {
        return [];
    }

    $hours = [];
    $limit = min(24, count($hourly['time']));

    for ($i = 0; $i < $limit; $i++) {
        $hours[] = [
            'time'        => $hourly['time'][$i],
            'temp'        => $hourly['temperature_2m'][$i] ?? null,
            'precip_prob' => $hourly['precipitation_probability'][$i] ?? null,
            'weather_code'=> (int) ($hourly['weather_code'][$i] ?? 0),
            'wind'        => $hourly['wind_speed_10m'][$i] ?? null,
            'gusts'       => $hourly['wind_gusts_10m'][$i] ?? null,
        ];
    }

    return $hours;
}

function formatNumber(float $n): string
{
    return rtrim(rtrim(number_format($n, 1, '.', ''), '0'), '.');
}

function weatherIconSvg(string $icon, int $size = 48): string
{
    $icons = [
        'sun' => '<circle cx="24" cy="24" r="10" fill="none" stroke="currentColor" stroke-width="2"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="24" y1="4" x2="24" y2="10"/><line x1="24" y1="38" x2="24" y2="44"/><line x1="4" y1="24" x2="10" y2="24"/><line x1="38" y1="24" x2="44" y2="24"/><line x1="10" y1="10" x2="14" y2="14"/><line x1="34" y1="34" x2="38" y2="38"/><line x1="10" y1="38" x2="14" y2="34"/><line x1="34" y1="10" x2="38" y2="14"/></g>',
        'cloud' => '<path d="M16 32h24a8 8 0 0 0 0-16 10 10 0 0 0-19.6 2.5A7 7 0 0 0 16 32z" fill="none" stroke="currentColor" stroke-width="2"/>',
        'wind' => '<path d="M8 20h28M8 28h20M8 36h24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M36 28c4 0 6-2 6-4s-2-4-6-4" fill="none" stroke="currentColor" stroke-width="2"/>',
        'rain' => '<path d="M14 18h28a6 6 0 0 0 0-12 8 8 0 0 0-15.5 2A5 5 0 0 0 14 18z" fill="none" stroke="currentColor" stroke-width="2"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="26" x2="16" y2="32"/><line x1="26" y1="26" x2="24" y2="34"/><line x1="34" y1="26" x2="32" y2="32"/></g>',
        'storm' => '<path d="M12 16h30a7 7 0 0 0 0-14 9 9 0 0 0-17 2.5A6 6 0 0 0 12 16z" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="26,22 20,34 25,34 22,44 32,30 27,30 30,22" fill="currentColor"/>',
        'emergency' => '<polygon points="24,6 42,40 6,40" fill="none" stroke="currentColor" stroke-width="2"/><line x1="24" y1="16" x2="24" y2="28" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="34" r="1.5" fill="currentColor"/>',
    ];

    $content = $icons[$icon] ?? $icons['cloud'];
    return sprintf(
        '<svg class="weather-icon" width="%d" height="%d" viewBox="0 0 48 48" aria-hidden="true">%s</svg>',
        $size,
        $size,
        $content
    );
}
