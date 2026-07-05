<?php
declare(strict_types=1);

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/cache.php';

function google_pollen_api_key(array $cfg): string
{
    $key = trim((string) ($cfg['google_pollen_api_key'] ?? ''));
    if ($key !== '') {
        return $key;
    }
    $env = getenv('GOOGLE_POLLEN_API_KEY');
    return $env !== false ? trim((string) $env) : '';
}

function fetch_google_pollen(float $lat, float $lon, string $apiKey, int $days = 3): array
{
    $days = max(1, min($days, 5));
    $allDaily = [];
    $regionCode = '';
    $pageToken = '';

    for ($page = 0; $page < 6; $page++) {
        $qs = [
            'key' => $apiKey,
            'location.latitude' => (string) $lat,
            'location.longitude' => (string) $lon,
            'days' => (string) $days,
            'pageSize' => (string) $days,
            'plantsDescription' => '0',
        ];
        if ($pageToken !== '') {
            $qs['pageToken'] = $pageToken;
        }
        $url = 'https://pollen.googleapis.com/v1/forecast:lookup?' . http_build_query($qs);
        $body = http_get($url, 20);
        $data = json_decode($body, true);
        if (!is_array($data)) {
            throw new RuntimeException('unexpected Google Pollen response');
        }
        if ($regionCode === '' && !empty($data['regionCode'])) {
            $regionCode = (string) $data['regionCode'];
        }
        foreach ($data['dailyInfo'] ?? [] as $day) {
            $allDaily[] = $day;
        }
        $pageToken = (string) ($data['nextPageToken'] ?? '');
        if ($pageToken === '' || count($allDaily) >= $days) {
            break;
        }
    }

    return slim_pollen_response($regionCode, $allDaily);
}

function slim_pollen_response(string $regionCode, array $dailyInfo): array
{
    $days = [];
    foreach ($dailyInfo as $day) {
        $date = $day['date'] ?? [];
        $dateStr = sprintf(
            '%04d-%02d-%02d',
            (int) ($date['year'] ?? 0),
            (int) ($date['month'] ?? 0),
            (int) ($date['day'] ?? 0)
        );
        $types = [];
        foreach ($day['pollenTypeInfo'] ?? [] as $type) {
            $idx = $type['indexInfo'] ?? null;
            if (!is_array($idx)) {
                continue;
            }
            $types[] = [
                'code' => (string) ($type['code'] ?? ''),
                'name' => (string) ($type['displayName'] ?? $type['code'] ?? ''),
                'inSeason' => (bool) ($type['inSeason'] ?? false),
                'index' => (int) ($idx['value'] ?? 0),
                'category' => (string) ($idx['category'] ?? ''),
            ];
        }
        $plants = [];
        foreach ($day['plantInfo'] ?? [] as $plant) {
            $idx = $plant['indexInfo'] ?? null;
            if (!is_array($idx) || empty($plant['inSeason'])) {
                continue;
            }
            $plants[] = [
                'code' => (string) ($plant['code'] ?? ''),
                'name' => (string) ($plant['displayName'] ?? $plant['code'] ?? ''),
                'type' => (string) ($plant['plantDescription']['type'] ?? ''),
                'index' => (int) ($idx['value'] ?? 0),
                'category' => (string) ($idx['category'] ?? ''),
            ];
        }
        usort($plants, fn($a, $b) => $b['index'] <=> $a['index']);
        $days[] = [
            'date' => $dateStr,
            'types' => $types,
            'plants' => array_slice($plants, 0, 8),
        ];
    }

    return [
        'region' => $regionCode,
        'days' => $days,
    ];
}

function trim_pollen_days(array $data, int $days): array
{
    if (isset($data['days']) && is_array($data['days'])) {
        $data['days'] = array_slice($data['days'], 0, max(1, min($days, 5)));
    }
    return $data;
}

function pollen_with_cache(float $lat, float $lon, array $cfg, int $days = 3): array
{
    $apiKey = google_pollen_api_key($cfg);
    if ($apiKey === '') {
        throw new RuntimeException('google_pollen_api_key not configured');
    }

    $days = max(1, min($days, 5));

    $ttl = (int) ($cfg['pollen_cache_ttl'] ?? 10800);
    $ttl = max(300, min($ttl, 86400));
    $decimals = (int) ($cfg['pollen_cache_grid'] ?? 1);
    $decimals = max(0, min($decimals, 2));
    $limit = pollen_daily_limit($cfg);
    $quota = pollen_read_quota();

    $gridKey = pollen_grid_key($lat, $lon, $decimals);
    $cached = read_pollen_cache($gridKey, $ttl);
    if ($cached !== null) {
        return pollen_payload(trim_pollen_days($cached['data'], $days), $cached['fetched'], $gridKey, true, false, $quota, $limit);
    }

    if (pollen_quota_reached($cfg)) {
        $stale = read_pollen_cache_stale($gridKey);
        if ($stale !== null) {
            return pollen_payload(trim_pollen_days($stale['data'], $days), $stale['fetched'], $gridKey, true, true, $quota, $limit);
        }
        throw new RuntimeException('pollen daily API limit reached and no cached data for this area');
    }

    $data = fetch_google_pollen($lat, $lon, $apiKey, $days);
    write_pollen_cache($gridKey, $lat, $lon, $data);
    $quota['count'] = pollen_increment_quota();

    return pollen_payload($data, time(), $gridKey, false, false, $quota, $limit);
}

function pollen_payload(
    array $data,
    int $fetchedAt,
    string $gridKey,
    bool $cached,
    bool $quotaPaused,
    array $quota,
    int $limit
): array {
    $data['cached'] = $cached;
    $data['cacheAgeSec'] = max(0, time() - $fetchedAt);
    $data['grid'] = $gridKey;
    $data['quotaPaused'] = $quotaPaused;
    $data['quotaCount'] = (int) ($quota['count'] ?? 0);
    $data['quotaLimit'] = $limit;
    return $data;
}
