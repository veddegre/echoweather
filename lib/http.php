<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function http_status_from_header_line(string $statusLine): ?int
{
    // RFC 7230: reason phrase is optional (e.g. "HTTP/1.1 404" with no text after).
    if (preg_match('/HTTP\/[\d.]+\s+(\d{3})\b/', $statusLine, $m)) {
        return (int) $m[1];
    }
    return null;
}

/**
 * @return array{body: string|false, code: int, err: string}
 */
function curl_request(string $url, array $opts, int $timeout): array
{
    $ch = curl_init($url);
    try {
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_USERAGENT => ECHO_USER_AGENT,
        ] + $opts);
        return [
            'body' => curl_exec($ch),
            'code' => (int) curl_getinfo($ch, CURLINFO_HTTP_CODE),
            'err' => curl_error($ch),
        ];
    } finally {
        unset($ch);
    }
}

function http_get(string $url, int $timeout = 25): string
{
    if (function_exists('curl_init')) {
        $res = curl_request($url, [
            CURLOPT_HTTPHEADER => ['Accept: */*'],
        ], $timeout);
        if ($res['body'] === false) {
            throw new RuntimeException($res['err'] !== '' ? $res['err'] : 'request failed');
        }
        if ($res['code'] >= 400) {
            throw new RuntimeException('HTTP ' . $res['code']);
        }
        return (string) $res['body'];
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
    $code = isset($headers[0]) ? http_status_from_header_line($headers[0]) : null;
    if ($code !== null && $code >= 400) {
        throw new RuntimeException('HTTP ' . $code);
    }
    return $body;
}

function fetch_ndbc_buoy(string $station): string
{
    $station = strtoupper($station);
    $url = 'https://www.ndbc.noaa.gov/data/realtime2/' . rawurlencode($station) . '.txt';
    return http_get($url, 25);
}

function fetch_aviation_taf(string $ids): array
{
    $ids = strtoupper(preg_replace('/[^A-Z0-9,]/', '', $ids));
    if ($ids === '') {
        throw new InvalidArgumentException('ids required');
    }
    $url = 'https://aviationweather.gov/api/data/taf?ids=' . rawurlencode($ids) . '&format=json';

    if (function_exists('curl_init')) {
        $res = curl_request($url, [
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ], 15);
        if ($res['body'] === false) {
            throw new RuntimeException($res['err'] !== '' ? $res['err'] : 'request failed');
        }
        if ($res['code'] === 204) {
            return [];
        }
        if ($res['code'] >= 400) {
            throw new RuntimeException('HTTP ' . $res['code']);
        }
        $body = (string) $res['body'];
    } else {
        $body = http_get($url, 15);
    }

    if (trim($body) === '') {
        return [];
    }
    $data = json_decode($body, true);
    if (!is_array($data)) {
        throw new RuntimeException('unexpected TAF response');
    }
    return $data;
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

    $res = curl_request($url, [
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ], 15);
    if ($res['body'] === false) {
        throw new RuntimeException($res['err'] !== '' ? $res['err'] : 'AirNow request failed');
    }
    if ($res['code'] === 404) {
        return [];
    }
    if ($res['code'] === 401 || $res['code'] === 403) {
        throw new RuntimeException('AirNow API key invalid or not activated (HTTP ' . $res['code'] . ')');
    }
    if ($res['code'] >= 500) {
        return [];
    }
    if ($res['code'] >= 400) {
        throw new RuntimeException('AirNow upstream HTTP ' . $res['code']);
    }

    return parse_airnow_body((string) $res['body']);
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
