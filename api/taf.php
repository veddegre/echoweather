<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/http.php';
require_once dirname(__DIR__) . '/lib/ratelimit.php';
require_once dirname(__DIR__) . '/lib/taf_cache.php';

handle_cors_preflight();

$ids = strtoupper(trim((string) ($_GET['ids'] ?? '')));
if (!preg_match('/^[A-Z0-9]{4}(?:,[A-Z0-9]{4}){0,2}$/', $ids)) {
    send_json(400, ['error' => 'ids required (1–3 ICAO codes, e.g. KGRR)'], cors: true);
}

try {
    $cfg = load_config();
    enforce_rate_limit('taf', rate_limit_for($cfg, 'rate_limit_taf'));
    $ttl = taf_cache_ttl($cfg);
    $cached = read_taf_cache($ids, $ttl);
    if ($cached !== null) {
        send_json(200, $cached['data'], cors: true);
    }
    $data = fetch_aviation_taf($ids);
    write_taf_cache($ids, $data);
    send_json(200, $data, cors: true);
} catch (RateLimitExceeded $e) {
    send_api_error(429, 'Too many requests', $e, 'taf/rate-limit', cors: true);
} catch (Throwable $e) {
    send_api_error(502, 'Upstream service unavailable', $e, 'taf', cors: true);
}
