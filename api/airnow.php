<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/http.php';
require_once dirname(__DIR__) . '/lib/ratelimit.php';
require_once dirname(__DIR__) . '/lib/airnow_cache.php';

handle_cors_preflight();

$lat = filter_input(INPUT_GET, 'latitude', FILTER_VALIDATE_FLOAT);
$lon = filter_input(INPUT_GET, 'longitude', FILTER_VALIDATE_FLOAT);
$distance = filter_input(INPUT_GET, 'distance', FILTER_VALIDATE_INT);
if ($distance === false || $distance === null) {
    $distance = 50;
}

if ($lat === false || $lat === null || $lon === false || $lon === null) {
    send_json(400, ['error' => 'latitude, longitude required'], cors: true);
}
if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
    send_json(400, ['error' => 'invalid coordinates'], cors: true);
}
$distance = max(1, min($distance, 100));

try {
    $cfg = load_config();
} catch (Throwable $e) {
    send_api_error(500, 'Service unavailable', $e, 'airnow/config', cors: true);
}

$apiKey = trim((string) ($cfg['airnow_api_key'] ?? ''));
if ($apiKey === '') {
    send_json(503, ['error' => 'AirNow integration not configured'], cors: true);
}

try {
    enforce_rate_limit('airnow', rate_limit_for($cfg, 'rate_limit_airnow'));
    $ttl = airnow_cache_ttl($cfg);
    $grid = airnow_cache_grid($cfg);
    $cacheKey = airnow_cache_key((float) $lat, (float) $lon, $distance, $grid);
    $cached = read_airnow_cache($cacheKey, $ttl);
    if ($cached !== null) {
        send_json(200, $cached['data'], cors: true);
    }
    $data = fetch_airnow((float) $lat, (float) $lon, $distance, $apiKey);
    write_airnow_cache($cacheKey, $data);
    send_json(200, $data, cors: true);
} catch (RateLimitExceeded $e) {
    send_api_error(429, 'Too many requests', $e, 'airnow/rate-limit', cors: true);
} catch (Throwable $e) {
    $msg = $e->getMessage();
    if (str_contains($msg, 'API key invalid')) {
        send_api_error(503, 'AirNow integration unavailable', $e, 'airnow/auth', cors: true);
    }
    send_api_error(502, 'Upstream service unavailable', $e, 'airnow', cors: true);
}
