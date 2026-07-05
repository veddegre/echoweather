<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/pollen.php';
require_once dirname(__DIR__) . '/lib/ratelimit.php';

handle_cors_preflight();

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
} catch (Throwable $e) {
    send_api_error(500, 'Service unavailable', $e, 'pollen/config', cors: true);
}

if (google_pollen_api_key($cfg) === '') {
    send_json(503, ['error' => 'Pollen integration not configured'], cors: true);
}

try {
    $days = filter_input(INPUT_GET, 'days', FILTER_VALIDATE_INT);
    if ($days === false || $days === null) {
        $days = 3;
    }
    $days = max(1, min((int) $days, 5));
    enforce_rate_limit('pollen', rate_limit_for($cfg, 'rate_limit_pollen'));
    $payload = pollen_with_cache((float) $lat, (float) $lon, $cfg, $days);
    send_json(200, $payload, cors: true);
} catch (RateLimitExceeded $e) {
    send_api_error(429, 'Too many requests', $e, 'pollen/rate-limit', cors: true);
} catch (Throwable $e) {
    $msg = $e->getMessage();
    if (str_contains($msg, 'daily API limit reached')) {
        send_api_error(502, 'Pollen service temporarily unavailable', $e, 'pollen/quota', cors: true);
    }
    send_api_error(502, 'Upstream service unavailable', $e, 'pollen', cors: true);
}
