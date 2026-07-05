<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/pollen.php';

$lat = filter_input(INPUT_GET, 'latitude', FILTER_VALIDATE_FLOAT);
$lon = filter_input(INPUT_GET, 'longitude', FILTER_VALIDATE_FLOAT);

if ($lat === false || $lat === null || $lon === false || $lon === null) {
    send_json(400, ['error' => 'latitude, longitude required'], cors: true);
}
if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
    send_json(400, ['error' => 'invalid coordinates'], cors: true);
}

try {
    $cfg = load_config();
    $days = filter_input(INPUT_GET, 'days', FILTER_VALIDATE_INT);
    if ($days === false || $days === null) {
        $days = 3;
    }
    $days = max(1, min((int) $days, 5));
    $payload = pollen_with_cache((float) $lat, (float) $lon, $cfg, $days);
    send_json(200, $payload, cors: true);
} catch (Throwable $e) {
    send_json(502, ['error' => $e->getMessage()], cors: true);
}
