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

    $result['day_story'] = buildDayStory($result['hourly'], $alerts, $config, $levelResult['level']);

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

    $levels = getWeatherLevels();
    $default = $levels[$level]['character'] ?? null;

    // Levels 0–1 keep Pooh in the hero (level-specific art); advisors speak elsewhere.
    if ($level <= 1) {
        return $default;
    }

    $advisor = pickAdvisorCharacter($level, $reasons);

    // Prefer context-specific character when it adds flavor (Eeyore/Rabbit/Piglet)
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

function hourOfDay(string $iso): int
{
    return (int) date('G', strtotime($iso));
}

function storyPeriodKey(int $hour): ?string
{
    return match (true) {
        $hour >= 6 && $hour < 12  => 'morning',
        $hour >= 12 && $hour < 17 => 'afternoon',
        $hour >= 17 && $hour < 21 => 'evening',
        $hour >= 21 || $hour < 6  => 'tonight',
        default => null,
    };
}

function storyPeriodLabel(string $key): string
{
    return match ($key) {
        'morning'   => 'This morning',
        'afternoon' => 'This afternoon',
        'evening'   => 'This evening',
        'tonight'   => 'Tonight',
        default     => 'Later today',
    };
}

function determineHourLevel(array $hour, array $config): int
{
    $candidates = [0];

    $codeLevel = weatherCodeLevel((int) ($hour['weather_code'] ?? 0));
    if ($codeLevel > 0) {
        $candidates[] = $codeLevel;
    }

    $wind = (float) ($hour['wind'] ?? 0);
    $gusts = (float) ($hour['gusts'] ?? $wind);
    $windLevel = windLevel($wind, $gusts, $config['wind_unit'] ?? 'mph');
    if ($windLevel > 0) {
        $candidates[] = $windLevel;
    }

    $tempLevel = temperatureLevel((float) ($hour['temp'] ?? 20), $config['temperature_unit']);
    if ($tempLevel > 0) {
        $candidates[] = $tempLevel;
    }

    $pop = (int) ($hour['precip_prob'] ?? 0);
    if ($pop >= 70) {
        $candidates[] = 2;
    } elseif ($pop >= 40) {
        $candidates[] = 1;
    }

    return max($candidates);
}

function mergeStoryPeriodLabels(array $labels): string
{
    if (count($labels) === 1) {
        return $labels[0];
    }

    if (count($labels) >= 3) {
        return 'The rest of the day';
    }

    if (count($labels) === 2) {
        $second = lcfirst(str_replace('This ', 'this ', $labels[1]));
        return $labels[0] . ' and ' . $second;
    }

    $last = array_pop($labels);
    $last = lcfirst(str_replace('This ', 'this ', $last));

    return implode(', ', $labels) . ', and ' . $last;
}

function storyBeatPeriodLabel(array $periodKeys, array $periodLabels, ?string $nowPeriod, bool $isFirst): string
{
    if ($isFirst && $nowPeriod !== null && count($periodKeys) === 1 && $periodKeys[0] === $nowPeriod) {
        return 'Right now';
    }

    return mergeStoryPeriodLabels($periodLabels);
}

function storyTransitionPhrase(int $previousLevel, int $level, bool $isFirst, bool $soloBeat): string
{
    if ($soloBeat && $isFirst) {
        return 'Remains';
    }
    if ($isFirst) {
        return 'Begins as';
    }
    if ($level > $previousLevel) {
        return 'May become';
    }
    if ($level < $previousLevel) {
        return 'Eases into';
    }

    return 'Continues as';
}

function storyCharacterAside(string $character, int $level): string
{
    $levels = getWeatherLevels();
    $info = $levels[$level] ?? $levels[0];

    if (($info['character'] ?? '') === $character && !empty($info['character_role'])) {
        return $info['character_role'];
    }

    $short = [
        'Pooh'              => [0 => 'approves wholeheartedly', 1 => 'looks at the sky with quiet suspicion'],
        'Piglet'            => [2 => 'finds it rather blustery', 3 => 'wishes he were somewhere smaller and drier'],
        'Rabbit'            => [2 => 'is already thinking about the garden chairs', 3 => 'has begun reorganizing the afternoon'],
        'Owl'               => [3 => 'consults the map with growing seriousness', 4 => 'considers this beneath his dignity and the clouds\''],
        'Eeyore'            => [1 => 'is not surprised', 2 => 'suspected the wind would get ideas'],
        'Christopher Robin' => [4 => 'would like everyone nearer the house', 5 => ' means now, not after one more adventure'],
    ];

    return $short[$character][$level]
        ?? ($info['character_role'] ?? 'has thoughts about the weather');
}

function pickStoryFootnote(array $alerts): ?array
{
    if (empty($alerts)) {
        return null;
    }

    $sorted = sortAlertsForDisplay($alerts);
    $top = $sorted[0];
    $event = strtolower($top['event'] ?? '');
    $quotes = getAdvisorQuotes();

    if (str_contains($event, 'warning')) {
        $pool = $quotes['Christopher Robin'][4]
            ?? $quotes['Christopher Robin']['any']
            ?? ['Come inside, please.'];
        return [
            'character' => 'Christopher Robin',
            'verb'      => 'calls out',
            'text'      => $pool[0],
        ];
    }

    if (str_contains($event, 'wind')) {
        $pool = $quotes['Rabbit'][2]
            ?? $quotes['Rabbit']['any']
            ?? ['Bring the garden chairs in.'];
        return [
            'character' => 'Rabbit',
            'verb'      => 'insists',
            'text'      => $pool[0],
        ];
    }

    if (str_contains($event, 'watch') || str_contains($event, 'advisory')) {
        $pool = $quotes['Rabbit']['any']
            ?? $quotes['Owl']['any']
            ?? ['Stay informed and prepare accordingly.'];
        return [
            'character' => 'Rabbit',
            'verb'      => 'insists',
            'text'      => $pool[0],
        ];
    }

    $pool = $quotes['Owl']['any'] ?? ['Monitor official alerts.'];
    return [
        'character' => 'Owl',
        'verb'      => 'declares',
        'text'      => $pool[0],
    ];
}

function buildDayStory(array $hourly, array $alerts, array $config, int $currentLevel = 0): array
{
    if (empty($hourly)) {
        return ['beats' => [], 'footnote' => null];
    }

    $today = date('Y-m-d');
    $hourCutoff = strtotime(date('Y-m-d H:00:00'));
    $todayHours = array_values(array_filter(
        $hourly,
        static fn(array $hour): bool => str_starts_with($hour['time'], $today)
            && strtotime($hour['time']) >= $hourCutoff
    ));

    if (empty($todayHours)) {
        $todayHours = array_slice($hourly, 0, 18);
    }

    $periodOrder = ['morning', 'afternoon', 'evening', 'tonight'];
    $nowPeriod = storyPeriodKey((int) date('G'));
    $startIndex = $nowPeriod !== null
        ? (int) array_search($nowPeriod, $periodOrder, true)
        : 0;

    $levels = getWeatherLevels();
    $periodLevels = [];

    foreach ($periodOrder as $key) {
        $periodLevels[$key] = null;
    }

    foreach ($todayHours as $hour) {
        $key = storyPeriodKey(hourOfDay($hour['time']));
        if ($key === null) {
            continue;
        }
        $keyIndex = array_search($key, $periodOrder, true);
        if ($keyIndex === false || $keyIndex < $startIndex) {
            continue;
        }
        $hourLevel = determineHourLevel($hour, $config);
        $periodLevels[$key] = max($periodLevels[$key] ?? 0, $hourLevel);
    }

    if ($nowPeriod !== null && $periodLevels[$nowPeriod] !== null) {
        $periodLevels[$nowPeriod] = $currentLevel;
    }

    $rawBeats = [];
    foreach ($periodOrder as $index => $key) {
        if ($index < $startIndex || $periodLevels[$key] === null) {
            continue;
        }
        $rawBeats[] = [
            'period_key'   => $key,
            'period_label' => storyPeriodLabel($key),
            'level'        => $periodLevels[$key],
        ];
    }

    if (empty($rawBeats)) {
        return ['beats' => [], 'footnote' => pickStoryFootnote($alerts)];
    }

    $merged = [];
    foreach ($rawBeats as $beat) {
        $lastIndex = count($merged) - 1;
        if ($lastIndex >= 0 && $merged[$lastIndex]['level'] === $beat['level']) {
            $merged[$lastIndex]['period_keys'][] = $beat['period_key'];
            $merged[$lastIndex]['period_labels'][] = $beat['period_label'];
            continue;
        }

        $merged[] = [
            'period_keys'   => [$beat['period_key']],
            'period_labels' => [$beat['period_label']],
            'level'         => $beat['level'],
        ];
    }

    $soloBeat = count($merged) === 1;
    $beats = [];
    $previousLevel = null;
    foreach ($merged as $index => $chunk) {
        $level = $chunk['level'];
        $info = $levels[$level] ?? $levels[0];
        $character = $info['character'] ?? 'Owl';
        if ($character === null) {
            $character = 'Owl';
        }

        $beats[] = [
            'period_label' => storyBeatPeriodLabel(
                $chunk['period_keys'],
                $chunk['period_labels'],
                $nowPeriod,
                $index === 0
            ),
            'transition'   => storyTransitionPhrase(
                $previousLevel ?? $level,
                $level,
                $index === 0,
                $soloBeat
            ),
            'level'        => $level,
            'level_name'   => $info['name'],
            'character'    => $character,
            'aside'        => storyCharacterAside($character, $level),
        ];
        $previousLevel = $level;
    }

    return [
        'beats'    => $beats,
        'footnote' => pickStoryFootnote($alerts),
    ];
}

function renderDayStorySection(array $story): string
{
    if (empty($story['beats'])) {
        return '';
    }

    ob_start();
    ?>
    <section class="card day-story-card" aria-labelledby="day-story-heading">
        <h3 id="day-story-heading">Today&rsquo;s story</h3>
        <div class="day-story">
            <?php foreach ($story['beats'] as $beat): ?>
            <p class="day-story-beat">
                <strong><?= htmlspecialchars($beat['period_label']) ?>:</strong>
                <?= htmlspecialchars($beat['transition']) ?>
                <em><?= htmlspecialchars($beat['level_name']) ?></em>
                (Level <?= (int) $beat['level'] ?>).
                <span class="day-story-aside"><em><?= htmlspecialchars($beat['character']) ?></em>
                &mdash; <?= htmlspecialchars($beat['aside']) ?>.</span>
            </p>
            <?php endforeach; ?>
        </div>
        <?php if (!empty($story['footnote'])): ?>
        <p class="day-story-footnote">
            <strong><?= htmlspecialchars($story['footnote']['character']) ?>
            <?= htmlspecialchars($story['footnote']['verb']) ?>:</strong>
            <?= htmlspecialchars($story['footnote']['text']) ?>
        </p>
        <?php endif; ?>
    </section>
    <?php

    return ob_get_clean();
}

function formatNumber(float $n): string
{
    return rtrim(rtrim(number_format($n, 1, '.', ''), '0'), '.');
}

function formatTempDisplay(float $temp, string $unit): string
{
    $suffix = $unit === 'fahrenheit' ? '°' : '°';
    if ($unit === 'fahrenheit') {
        return (string) (int) round($temp) . $suffix;
    }
    return (string) (int) round($temp) . '°C';
}

function weatherCodeIconKey(int $code): string
{
    return match (true) {
        in_array($code, [0, 1], true) => 'sun',
        in_array($code, [2, 3, 45, 48], true) => 'cloud',
        in_array($code, [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], true) => 'rain',
        in_array($code, [71, 73, 75, 77, 85, 86], true) => 'rain',
        in_array($code, [95, 96, 99], true) => 'storm',
        default => 'cloud',
    };
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
