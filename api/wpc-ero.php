<?php
declare(strict_types=1);

/**
 * Proxy WPC Day-1 excessive rainfall outlook GeoJSON.
 * mapservices.weather.noaa.gov does not send Access-Control-Allow-Origin.
 */
require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/http.php';
require_once dirname(__DIR__) . '/lib/ratelimit.php';

handle_cors_preflight();

try {
    $cfg = load_config();
} catch (Throwable $e) {
    send_api_error(500, 'Service unavailable', $e, 'wpc-ero/config', cors: true);
}

try {
    enforce_rate_limit('wpc_ero', rate_limit_for($cfg, 'rate_limit_wpc_ero') ?: 60);
} catch (RateLimitExceeded $e) {
    send_api_error(429, 'Too many requests', $e, 'wpc-ero/rate-limit', cors: true);
}

$cacheDir = dirname(__DIR__) . '/cache/wpc';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}
$cacheFile = $cacheDir . '/ero-day1.json';
$ttl = 20 * 60;
$url = 'https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0/query'
    . '?where=1%3D1&outFields=outlook,valid_time&returnGeometry=true&f=geojson';

if (is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < $ttl) {
    $cached = file_get_contents($cacheFile);
    if ($cached !== false && $cached !== '') {
        header('Content-Type: application/geo+json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Cache-Control: public, max-age=600');
        echo $cached;
        exit;
    }
}

try {
    $body = http_get($url, 35);
    $data = json_decode($body, true);
    if (!is_array($data) || ($data['type'] ?? '') !== 'FeatureCollection') {
        throw new RuntimeException('unexpected WPC ERO payload');
    }
    $json = json_encode($data, JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('encode failed');
    }
    @file_put_contents($cacheFile, $json);
    header('Content-Type: application/geo+json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: public, max-age=600');
    echo $json;
} catch (Throwable $e) {
    if (is_file($cacheFile)) {
        $cached = file_get_contents($cacheFile);
        if ($cached !== false && $cached !== '') {
            header('Content-Type: application/geo+json; charset=utf-8');
            header('Access-Control-Allow-Origin: *');
            header('Cache-Control: public, max-age=300');
            echo $cached;
            exit;
        }
    }
    send_api_error(502, 'Upstream WPC outlook unavailable', $e, 'wpc-ero', cors: true);
}
