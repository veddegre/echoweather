<?php
declare(strict_types=1);

/**
 * Proxy NHC CurrentStorms.json — no Access-Control-Allow-Origin on nhc.noaa.gov.
 */
require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/http.php';
require_once dirname(__DIR__) . '/lib/ratelimit.php';

handle_cors_preflight();

try {
    $cfg = load_config();
} catch (Throwable $e) {
    send_api_error(500, 'Service unavailable', $e, 'nhc-storms/config', cors: true);
}

try {
    enforce_rate_limit('nhc_storms', rate_limit_for($cfg, 'rate_limit_nhc_storms') ?: 60);
} catch (RateLimitExceeded $e) {
    send_api_error(429, 'Too many requests', $e, 'nhc-storms/rate-limit', cors: true);
}

$cacheDir = dirname(__DIR__) . '/cache/nhc';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}
$cacheFile = $cacheDir . '/current.json';
$ttl = 10 * 60;
$url = 'https://www.nhc.noaa.gov/CurrentStorms.json';

if (is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < $ttl) {
    $cached = file_get_contents($cacheFile);
    if ($cached !== false && $cached !== '') {
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Cache-Control: public, max-age=300');
        echo $cached;
        exit;
    }
}

try {
    $body = http_get($url, 25);
    $data = json_decode($body, true);
    if (!is_array($data)) {
        throw new RuntimeException('unexpected NHC payload');
    }
    $json = json_encode($data, JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('encode failed');
    }
    @file_put_contents($cacheFile, $json);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: public, max-age=300');
    echo $json;
} catch (Throwable $e) {
    if (is_file($cacheFile)) {
        $cached = file_get_contents($cacheFile);
        if ($cached !== false && $cached !== '') {
            header('Content-Type: application/json; charset=utf-8');
            header('Access-Control-Allow-Origin: *');
            header('Cache-Control: public, max-age=120');
            echo $cached;
            exit;
        }
    }
    send_api_error(502, 'Upstream NHC feed unavailable', $e, 'nhc-storms', cors: true);
}
