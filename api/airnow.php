<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/http.php';

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
    send_json(500, ['error' => $e->getMessage()], cors: true);
}

$apiKey = trim((string) ($cfg['airnow_api_key'] ?? ''));
if ($apiKey === '') {
    send_json(503, ['error' => 'airnow_api_key not configured in config.local.php'], cors: true);
}

try {
    $data = fetch_airnow((float) $lat, (float) $lon, $distance, $apiKey);
    send_json(200, $data, cors: true);
} catch (Throwable $e) {
    $msg = $e->getMessage();
    if (str_contains($msg, 'API key invalid')) {
        send_json(503, ['error' => $msg], cors: true);
    }
    send_json(502, ['error' => $msg], cors: true);
}
