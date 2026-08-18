<?php
declare(strict_types=1);

/**
 * Open-Meteo geocoding proxy for browser search (CORS-safe fallback).
 */

require_once dirname(__DIR__, 2) . '/lib/bootstrap.php';
require_once dirname(__DIR__, 2) . '/lib/ratelimit.php';
require_once dirname(__DIR__) . '/includes/location.php';

handle_cors_preflight();

header('Content-Type: application/json; charset=utf-8');
apply_cors_header();
header('Access-Control-Allow-Methods: GET, OPTIONS');

try {
    $cfg = load_config();
} catch (Throwable) {
    $cfg = default_config();
}

try {
    enforce_rate_limit('geocode', rate_limit_for($cfg, 'rate_limit_geocode') ?: 60);
} catch (RateLimitExceeded $e) {
    http_response_code(429);
    echo json_encode(['error' => 'Too many requests']);
    exit;
}

$q = trim((string) ($_GET['q'] ?? $_GET['name'] ?? ''));
if (strlen($q) < 2) {
    http_response_code(400);
    echo json_encode(['error' => 'Query too short']);
    exit;
}

$url = 'https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name='
    . rawurlencode($q);

$body = httpGetSimple($url);
if ($body === null) {
    http_response_code(502);
    echo json_encode(['error' => 'Geocoding unavailable']);
    exit;
}

echo $body;
