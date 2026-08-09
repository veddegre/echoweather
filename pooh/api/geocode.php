<?php
declare(strict_types=1);

/**
 * Open-Meteo geocoding proxy for browser search (CORS-safe fallback).
 */

require_once dirname(__DIR__) . '/includes/location.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$q = trim((string) ($_GET['q'] ?? $_GET['name'] ?? ''));
if (mb_strlen($q) < 2) {
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
