<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/http.php';
require_once dirname(__DIR__) . '/lib/ratelimit.php';

handle_cors_preflight();

$lat = filter_var($_GET['lat'] ?? null, FILTER_VALIDATE_FLOAT);
$lon = filter_var($_GET['lon'] ?? null, FILTER_VALIDATE_FLOAT);

if ($lat === false || $lon === false || $lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
    send_json(400, ['error' => 'invalid coordinates'], cors: true);
}

try {
    $cfg = load_config();
    enforce_rate_limit('7timer', rate_limit_for($cfg, 'rate_limit_7timer') ?: 60);
    $url = sprintf(
        'http://www.7timer.info/bin/civil.php?lon=%s&lat=%s&ac=0&unit=metric&output=json&tzshift=0',
        rawurlencode((string) $lon),
        rawurlencode((string) $lat)
    );
    $body = http_get($url, 20);
    $data = json_decode($body, true);
    if (!is_array($data) || !isset($data['dataseries']) || !is_array($data['dataseries'])) {
        throw new RuntimeException('unexpected 7Timer response');
    }
    send_json(200, $data, cors: true);
} catch (RateLimitExceeded $e) {
    send_api_error(429, 'Too many requests', $e, '7timer/rate-limit', cors: true);
} catch (Throwable $e) {
    send_api_error(502, 'Upstream service unavailable', $e, '7timer', cors: true);
}
