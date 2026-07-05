<?php
declare(strict_types=1);

const ECHO_USER_AGENT = 'echo-weather/1.0 (self-hosted)';

function default_config(): array
{
    return [
        'airnow_api_key' => '',
        'google_pollen_api_key' => '',
        'pollen_cache_ttl' => 10800,
        'pollen_cache_grid' => 1,
        'pollen_daily_limit' => 7500,
        'rate_limit_airnow' => 120,
        'rate_limit_pollen' => 60,
        'rate_limit_buoy' => 120,
        'cors_origins' => [
            'https://example.com',
            'http://127.0.0.1:8080',
            'http://localhost:8080',
        ],
    ];
}

function config_path(): string
{
    return dirname(__DIR__) . '/config.local.php';
}

function load_config(): array
{
    $path = config_path();
    if (!is_file($path)) {
        throw new RuntimeException('config.local.php missing — copy from config.example.php');
    }
    $cfg = require $path;
    if (!is_array($cfg)) {
        throw new RuntimeException('config.local.php must return an array');
    }
    return array_merge(default_config(), $cfg);
}

function cors_origins_list(): array
{
    try {
        return load_config()['cors_origins'];
    } catch (Throwable) {
        return default_config()['cors_origins'];
    }
}

function match_cors_origin(?string $origin, array $allowed): ?string
{
    if ($origin === null || $origin === '') {
        return null;
    }
    $norm = rtrim($origin, '/');
    foreach ($allowed as $entry) {
        if ($norm === rtrim((string) $entry, '/')) {
            return $origin;
        }
    }
    return null;
}

function handle_cors_preflight(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'OPTIONS') {
        return;
    }

    $origin = match_cors_origin($_SERVER['HTTP_ORIGIN'] ?? null, cors_origins_list());
    if ($origin !== null) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 86400');
        http_response_code(204);
    } else {
        http_response_code(405);
    }
    exit;
}

function log_api_error(string $context, Throwable $e): void
{
    error_log('[echo-weather] ' . $context . ': ' . $e->getMessage());
}

function send_api_error(int $code, string $publicMessage, ?Throwable $e = null, string $context = '', bool $cors = false): void
{
    if ($e !== null) {
        log_api_error($context !== '' ? $context : 'api', $e);
    }
    send_json($code, ['error' => $publicMessage], $cors);
}

function send_json(int $code, mixed $data, bool $cors = false): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');

    if ($cors) {
        $origin = match_cors_origin($_SERVER['HTTP_ORIGIN'] ?? null, cors_origins_list());
        if ($origin !== null) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
        }
        header('Cache-Control: public, max-age=300');
    } else {
        header('Cache-Control: no-store');
    }

    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
