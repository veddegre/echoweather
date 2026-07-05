<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/http.php';
require_once dirname(__DIR__) . '/lib/ratelimit.php';

handle_cors_preflight();

$station = (string) ($_GET['station'] ?? '');
$station = trim($station);
if (str_ends_with(strtolower($station), '.txt')) {
    $station = substr($station, 0, -4);
}

if (!preg_match('/^[A-Za-z0-9]{4,8}$/', $station)) {
    send_json(400, ['error' => 'invalid station id'], cors: true);
}

try {
    $cfg = load_config();
    enforce_rate_limit('buoy', rate_limit_for($cfg, 'rate_limit_buoy'));
    $text = fetch_ndbc_buoy($station);
    send_json(200, ['station' => strtoupper($station), 'text' => $text], cors: true);
} catch (RateLimitExceeded $e) {
    send_api_error(429, 'Too many requests', $e, 'buoy/rate-limit', cors: true);
} catch (Throwable $e) {
    send_api_error(502, 'Upstream service unavailable', $e, 'buoy', cors: true);
}
