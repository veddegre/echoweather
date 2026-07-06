<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function taf_cache_dir(): string
{
    return dirname(__DIR__) . '/cache/taf';
}

function taf_cache_key(string $ids): string
{
    $parts = array_filter(explode(',', strtoupper($ids)));
    sort($parts);
    return implode('_', $parts);
}

function taf_cache_path(string $key): string
{
    return taf_cache_dir() . '/' . preg_replace('/[^A-Z0-9_]/', '', $key) . '.json';
}

function taf_cache_ttl(array $cfg): int
{
    $ttl = (int) ($cfg['taf_cache_ttl'] ?? 900);
    return max(60, min($ttl, 3600));
}

function read_taf_cache(string $ids, int $ttl): ?array
{
    $key = taf_cache_key($ids);
    $path = taf_cache_path($key);
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

function write_taf_cache(string $ids, array $data): void
{
    $dir = taf_cache_dir();
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new RuntimeException('failed to create TAF cache directory');
    }
    $entry = [
        'fetched' => time(),
        'ids' => taf_cache_key($ids),
        'data' => $data,
    ];
    $path = taf_cache_path(taf_cache_key($ids));
    $tmp = $path . '.tmp';
    $json = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        throw new RuntimeException('failed to write TAF cache');
    }
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('failed to save TAF cache');
    }
}
