<?php
/**
 * Location detection — browser cookie, IP geolocation, and reverse geocoding.
 */

function resolveLocation(array $config): array
{
    if (isset($_GET['lat'], $_GET['lon'])) {
        if (isset($_GET['from']) && $_GET['from'] === 'echo') {
            $source = 'echo';
        } elseif (isset($_GET['detected']) && $_GET['detected'] === 'browser') {
            $source = 'browser';
        } elseif (isset($_GET['source']) && $_GET['source'] === 'search') {
            $source = 'search';
        } else {
            $source = 'manual';
        }
        $location = normalizeLocation(
            (float) $_GET['lat'],
            (float) $_GET['lon'],
            isset($_GET['name']) ? trim((string) $_GET['name']) : null,
            $source
        );
        saveLocationCookie($location);
        return $location;
    }

    $cookie = readLocationCookie();
    if ($cookie !== null) {
        return $cookie;
    }

    $ipLocation = geolocateFromIp();
    if ($ipLocation !== null) {
        saveLocationCookie($ipLocation);
        return $ipLocation;
    }

    return [
        'lat'  => (float) ($config['fallback_latitude'] ?? 40.7128),
        'lon'  => (float) ($config['fallback_longitude'] ?? -74.0060),
        'name' => $config['fallback_location_name'] ?? 'The Hundred Acre Wood',
        'source' => 'default',
    ];
}

function normalizeLocation(float $lat, float $lon, ?string $name = null, string $source = 'manual'): array
{
    $lat = max(-90, min(90, $lat));
    $lon = max(-180, min(180, $lon));

    if ($name === null || $name === '') {
        $name = reverseGeocode($lat, $lon) ?? 'Your location';
    }

    return [
        'lat'  => $lat,
        'lon'  => $lon,
        'name' => $name,
        'source' => $source,
    ];
}

function reverseGeocode(float $lat, float $lon): ?string
{
    $url = sprintf(
        'https://nominatim.openstreetmap.org/reverse?lat=%F&lon=%F&format=json&zoom=10&addressdetails=1',
        $lat,
        $lon
    );

    $body = httpGetSimple($url, 'HundredAcreWeather/1.0 (weather display; contact: local)');
    if ($body === null) {
        return null;
    }

    $data = json_decode($body, true);
    if (!is_array($data)) {
        return null;
    }

    $address = $data['address'] ?? [];
    $parts = array_filter([
        $address['city'] ?? $address['town'] ?? $address['village'] ?? $address['hamlet'] ?? null,
        $address['state'] ?? $address['region'] ?? null,
        $address['country'] ?? null,
    ]);

    if ($parts) {
        return implode(', ', $parts);
    }

    return isset($data['display_name']) ? shortenDisplayName((string) $data['display_name']) : null;
}

function shortenDisplayName(string $displayName): string
{
    $parts = array_map('trim', explode(',', $displayName));
    return implode(', ', array_slice($parts, 0, 3));
}

function geolocateFromIp(): ?array
{
    $data = fetchJson('http://ip-api.com/json/?fields=status,message,lat,lon,city,regionName,country');
    if ($data === null || ($data['status'] ?? '') !== 'success') {
        return null;
    }

    $parts = array_filter([
        $data['city'] ?? null,
        $data['regionName'] ?? null,
        $data['country'] ?? null,
    ]);

    return [
        'lat'  => (float) $data['lat'],
        'lon'  => (float) $data['lon'],
        'name' => $parts ? implode(', ', $parts) : 'Nearby',
        'source' => 'ip',
    ];
}

function fetchJson(string $url): ?array
{
    $body = httpGetSimple($url);
    if ($body === null) {
        return null;
    }

    $data = json_decode($body, true);
    return is_array($data) ? $data : null;
}

function httpGetSimple(string $url, string $userAgent = 'HundredAcreWeather/1.0'): ?string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_USERAGENT      => $userAgent,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        return ($code >= 200 && $code < 300 && $body !== false) ? $body : null;
    }

    $ctx = stream_context_create([
        'http' => [
            'timeout' => 8,
            'header'  => "User-Agent: {$userAgent}\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    return $body !== false ? $body : null;
}

function saveLocationCookie(array $location): void
{
    if (headers_sent()) {
        return;
    }

    $payload = json_encode([
        'lat'  => $location['lat'],
        'lon'  => $location['lon'],
        'name' => $location['name'],
        'source' => $location['source'] ?? 'saved',
    ]);

    setcookie('hundred_acre_location', $payload, [
        'expires'  => time() + 60 * 60 * 24 * 30,
        'path'     => '/',
        'httponly' => false,
        'samesite' => 'Lax',
    ]);
}

function readLocationCookie(): ?array
{
    if (empty($_COOKIE['hundred_acre_location'])) {
        return null;
    }

    $data = json_decode($_COOKIE['hundred_acre_location'], true);
    if (!is_array($data) || !isset($data['lat'], $data['lon'], $data['name'])) {
        return null;
    }

    return [
        'lat'  => (float) $data['lat'],
        'lon'  => (float) $data['lon'],
        'name' => (string) $data['name'],
        'source' => (string) ($data['source'] ?? 'cookie'),
    ];
}

function locationSourceLabel(string $source): string
{
    return match ($source) {
        'browser' => 'Using your device location',
        'ip'      => 'Estimated from your network',
        'cookie'  => 'Remembered location',
        'manual'  => 'Custom location',
        'search'  => 'Searched location',
        default   => 'Default location',
    };
}
