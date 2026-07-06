<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/cache.php';

function airnow_cache_dir(): string
{
    return dirname(__DIR__) . '/cache/airnow';
}

function airnow_cache_key(float $lat, float $lon, int $distance, int $grid): string
{
    return pollen_grid_key($lat, $lon, $grid) . '_d' . max(1, min($distance, 100));
}

function airnow_cache_path(string $key): string
{
    return airnow_cache_dir() . '/' . preg_replace('/[^A-Z0-9pdm_]/', '', $key) . '.json';
}

function airnow_cache_ttl(array $cfg): int
{
    $ttl = (int) ($cfg['airnow_cache_ttl'] ?? 1800);
    return max(300, min($ttl, 7200));
}

function airnow_cache_grid(array $cfg): int
{
    $grid = (int) ($cfg['airnow_cache_grid'] ?? 1);
    return max(0, min($grid, 2));
}

function read_airnow_cache(string $key, int $ttl): ?array
{
    $path = airnow_cache_path($key);
    if (!is_file($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    if ($raw === false) {
        return null;
    }
    $entry = json_decode($raw, true);
    if (!is_array($entry) || !isset($entry['fetched'], $entry['data']) || !is_array($entry['data'])) {
        return null;
    }
    if (time() - (int) $entry['fetched'] > $ttl) {
        return null;
    }
    return $entry;
}

function write_airnow_cache(string $key, array $data): void
{
    $dir = airnow_cache_dir();
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new RuntimeException('failed to create AirNow cache directory');
    }
    $entry = [
        'fetched' => time(),
        'key' => $key,
        'data' => $data,
    ];
    $path = airnow_cache_path($key);
    $tmp = $path . '.tmp';
    $json = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        throw new RuntimeException('failed to write AirNow cache');
    }
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('failed to save AirNow cache');
    }
}
