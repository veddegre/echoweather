<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function http_get(string $url, int $timeout = 25): string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_USERAGENT => ECHO_USER_AGENT,
            CURLOPT_HTTPHEADER => ['Accept: */*'],
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        if ($body === false) {
            throw new RuntimeException($err !== '' ? $err : 'request failed');
        }
        if ($code >= 400) {
            throw new RuntimeException('HTTP ' . $code);
        }
        return (string) $body;
    }

    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => $timeout,
            'header' => "User-Agent: " . ECHO_USER_AGENT . "\r\nAccept: */*\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) {
        throw new RuntimeException('request failed');
    }
    if (function_exists('http_get_last_response_headers')) {
        $headers = http_get_last_response_headers();
    } else {
        $headers = $http_response_header ?? [];
    }
    if (isset($headers[0]) && preg_match('/\s(\d{3})\s/', $headers[0], $m)) {
        $code = (int) $m[1];
        if ($code >= 400) {
            throw new RuntimeException('HTTP ' . $code);
        }
    }
    return $body;
}

function fetch_ndbc_buoy(string $station): string
{
    $station = strtoupper($station);
    $url = 'https://www.ndbc.noaa.gov/data/realtime2/' . rawurlencode($station) . '.txt';
    return http_get($url, 25);
}

function fetch_airnow(float $lat, float $lon, int $distance, string $apiKey): array
{
    $url = 'https://www.airnowapi.org/aq/observation/latLong/current/'
        . '?format=application/json'
        . '&latitude=' . rawurlencode((string) $lat)
        . '&longitude=' . rawurlencode((string) $lon)
        . '&distance=' . rawurlencode((string) $distance)
        . '&API_KEY=' . rawurlencode($apiKey);

    if (!function_exists('curl_init')) {
        return parse_airnow_body(http_get($url, 15));
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => ECHO_USER_AGENT,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    if ($body === false) {
        throw new RuntimeException($err !== '' ? $err : 'AirNow request failed');
    }
    if ($code === 404) {
        return [];
    }
    if ($code === 401 || $code === 403) {
        throw new RuntimeException('AirNow API key invalid or not activated (HTTP ' . $code . ')');
    }
    if ($code >= 500) {
        return [];
    }
    if ($code >= 400) {
        throw new RuntimeException('AirNow upstream HTTP ' . $code);
    }

    return parse_airnow_body((string) $body);
}

function parse_airnow_body(string $body): array
{
    $data = json_decode($body, true);
    if (!is_array($data)) {
        throw new RuntimeException('unexpected AirNow response');
    }
    if ($data === []) {
        return [];
    }
    if (!array_is_list($data)) {
        $msg = (string) ($data['Message'] ?? $data['WebServiceError'][0]['Message'] ?? '');
        if ($msg !== '') {
            if (stripos($msg, 'no data') !== false || stripos($msg, 'not found') !== false) {
                return [];
            }
            throw new RuntimeException('AirNow: ' . $msg);
        }
        return [];
    }
    return $data;
}
