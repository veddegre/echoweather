<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function cache_dir(): string
{
    return dirname(__DIR__) . '/cache/pollen';
}

function pollen_grid_key(float $lat, float $lon, int $decimals): string
{
    $factor = 10 ** max(0, min($decimals, 3));
    $rLat = round($lat * $factor) / $factor;
    $rLon = round($lon * $factor) / $factor;
    return sprintf('%.' . $decimals . 'f_%.' . $decimals . 'f', $rLat, $rLon);
}

function pollen_cache_path(string $gridKey): string
{
    return cache_dir() . '/' . str_replace(['.', '-'], ['p', 'm'], $gridKey) . '.json';
}

function read_pollen_cache(string $gridKey, int $ttl): ?array
{
    $entry = read_pollen_cache_entry($gridKey);
    if ($entry === null) {
        return null;
    }
    if (time() - (int) $entry['fetched'] > $ttl) {
        return null;
    }
    return $entry;
}

function read_pollen_cache_stale(string $gridKey): ?array
{
    return read_pollen_cache_entry($gridKey);
}

function read_pollen_cache_entry(string $gridKey): ?array
{
    $path = pollen_cache_path($gridKey);
    if (!is_file($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    if ($raw === false) {
        return null;
    }
    $entry = json_decode($raw, true);
    if (!is_array($entry) || !isset($entry['fetched'], $entry['data'])) {
        return null;
    }
    return $entry;
}

function pollen_quota_path(): string
{
    return cache_dir() . '/_quota.json';
}

function pollen_quota_today(): string
{
    return date('Y-m-d');
}

function pollen_daily_limit(array $cfg): int
{
    $limit = (int) ($cfg['pollen_daily_limit'] ?? 7500);
    return max(0, $limit);
}

function pollen_read_quota(): array
{
    $path = pollen_quota_path();
    $today = pollen_quota_today();
    if (!is_file($path)) {
        return ['date' => $today, 'count' => 0];
    }
    $raw = @file_get_contents($path);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data) || ($data['date'] ?? '') !== $today) {
        return ['date' => $today, 'count' => 0];
    }
    return ['date' => $today, 'count' => max(0, (int) ($data['count'] ?? 0))];
}

function pollen_quota_reached(array $cfg): bool
{
    $limit = pollen_daily_limit($cfg);
    if ($limit === 0) {
        return false;
    }
    $quota = pollen_read_quota();
    return $quota['count'] >= $limit;
}

function pollen_increment_quota(): int
{
    $dir = cache_dir();
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new RuntimeException('failed to create cache directory');
    }
    $path = pollen_quota_path();
    $fp = fopen($path, 'c+');
    if ($fp === false) {
        throw new RuntimeException('failed to open quota file');
    }
    try {
        if (!flock($fp, LOCK_EX)) {
            throw new RuntimeException('failed to lock quota file');
        }
        $today = pollen_quota_today();
        $raw = stream_get_contents($fp);
        $data = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        $count = 0;
        if (is_array($data) && ($data['date'] ?? '') === $today) {
            $count = max(0, (int) ($data['count'] ?? 0));
        }
        $count++;
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode(['date' => $today, 'count' => $count], JSON_UNESCAPED_SLASHES));
        fflush($fp);
        flock($fp, LOCK_UN);
        return $count;
    } finally {
        fclose($fp);
    }
}

function write_pollen_cache(string $gridKey, float $lat, float $lon, array $data): void
{
    $dir = cache_dir();
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new RuntimeException('failed to create cache directory');
    }
    $entry = [
        'fetched' => time(),
        'grid' => $gridKey,
        'lat' => $lat,
        'lon' => $lon,
        'data' => $data,
    ];
    $path = pollen_cache_path($gridKey);
    $tmp = $path . '.tmp';
    $json = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        throw new RuntimeException('failed to write cache');
    }
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('failed to save cache');
    }
}
