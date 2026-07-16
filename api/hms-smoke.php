<?php
declare(strict_types=1);

/**
 * Proxy NOAA HMS smoke polygons for the radar map.
 * The old mapservices MapServer endpoint is gone; NESDIS publishes daily KML.
 */
require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/http.php';
require_once dirname(__DIR__) . '/lib/ratelimit.php';

handle_cors_preflight();

try {
    $cfg = load_config();
} catch (Throwable $e) {
    send_api_error(500, 'Service unavailable', $e, 'hms-smoke/config', cors: true);
}

$cacheDir = dirname(__DIR__) . '/cache/hms';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}
$cacheFile = $cacheDir . '/latest.json';
$ttl = 30 * 60;

// Cached responses are cheap — do not count them against the hourly upstream limit.
if (is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < $ttl) {
    if (hms_smoke_try_send_cached($cacheFile, 900)) {
        exit;
    }
}

try {
    enforce_rate_limit('hms_smoke', rate_limit_for($cfg, 'rate_limit_hms_smoke') ?: 60);
} catch (RateLimitExceeded $e) {
    if (hms_smoke_try_send_cached($cacheFile, 7 * 24 * 3600)) {
        exit;
    }
    send_api_error(429, 'Too many requests', $e, 'hms-smoke/rate-limit', cors: true);
}

try {
    $geo = fetch_hms_smoke_geojson();
    $json = json_encode($geo, JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('encode failed');
    }
    @file_put_contents($cacheFile, $json);
    header('Content-Type: application/geo+json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: public, max-age=900');
    echo $json;
} catch (Throwable $e) {
    // Prefer any cached product (even stale) over a blank map.
    if (hms_smoke_try_send_cached($cacheFile, 300)) {
        exit;
    }
    send_api_error(502, 'Upstream smoke product unavailable', $e, 'hms-smoke', cors: true);
}

function hms_smoke_try_send_cached(string $cacheFile, int $maxAge): bool
{
    if (!is_file($cacheFile)) {
        return false;
    }
    $age = time() - (int) filemtime($cacheFile);
    // Fresh cache — honor maxAge; stale cache only when upstream is down (max 7 days).
    if ($age > $maxAge && $age > 7 * 24 * 3600) {
        return false;
    }
    $cached = file_get_contents($cacheFile);
    if ($cached === false || $cached === '') {
        return false;
    }
    header('Content-Type: application/geo+json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: public, max-age=' . $maxAge);
    echo $cached;
    return true;
}

/**
 * @return array{type: string, features: list<array>, properties?: array}
 */
function fetch_hms_smoke_geojson(): array
{
    $tz = new DateTimeZone('America/New_York');
    $dates = [];
    $now = new DateTimeImmutable('now', $tz);
    for ($i = 0; $i < 3; $i++) {
        $dates[] = $now->modify('-' . $i . ' day')->format('Ymd');
    }

    $lastErr = null;
    foreach ($dates as $ymd) {
        $y = substr($ymd, 0, 4);
        $m = substr($ymd, 4, 2);
        $url = 'https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/KML/'
            . $y . '/' . $m . '/hms_smoke' . $ymd . '.kml';
        try {
            $kml = hms_http_get($url, 40);
            $geo = hms_kml_to_geojson($kml, $ymd);
            if (!empty($geo['features'])) {
                $geo['properties'] = [
                    'source' => 'NOAA HMS',
                    'date' => $ymd,
                    'url' => $url,
                ];
                return $geo;
            }
            // Empty product (e.g. morning before analysis) — try prior day.
            $lastErr = new RuntimeException('HMS ' . $ymd . ' has no smoke polygons yet');
        } catch (Throwable $e) {
            $lastErr = $e;
        }
    }

    // Rolling "current analysis" KML (no ZipArchive required).
    try {
        $kmlUrl = 'https://ospo.noaa.gov/data/spl/kmlfiles/fire/smoke.kml';
        $kml = hms_http_get($kmlUrl, 40);
        $geo = hms_kml_to_geojson($kml, $now->format('Ymd'));
        if (!empty($geo['features'])) {
            $geo['properties'] = [
                'source' => 'NOAA HMS',
                'date' => $now->format('Ymd'),
                'url' => $kmlUrl,
            ];
            return $geo;
        }
        $lastErr = new RuntimeException('OSPO smoke.kml has no polygons');
    } catch (Throwable $e) {
        $lastErr = $e;
    }

    // Rolling KMZ fallback (needs ZipArchive).
    try {
        $kmzUrl = 'https://ospo.noaa.gov/data/spl/kmlfiles/fire/smoke.kmz';
        $kml = hms_kmz_to_kml(hms_http_get($kmzUrl, 40));
        $geo = hms_kml_to_geojson($kml, $now->format('Ymd'));
        if (!empty($geo['features'])) {
            $geo['properties'] = [
                'source' => 'NOAA HMS',
                'date' => $now->format('Ymd'),
                'url' => $kmzUrl,
            ];
            return $geo;
        }
        $lastErr = new RuntimeException('OSPO smoke.kmz has no polygons');
    } catch (Throwable $e) {
        $lastErr = $e;
    }

    throw $lastErr ?? new RuntimeException('No HMS smoke product available');
}

function hms_http_get(string $url, int $timeout = 40): string
{
    $last = null;
    for ($attempt = 0; $attempt < 3; $attempt++) {
        try {
            if (function_exists('curl_init')) {
                $res = curl_request($url, [
                    CURLOPT_HTTPHEADER => ['Accept: */*'],
                    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                    CURLOPT_ENCODING => '',
                ], $timeout);
                if ($res['body'] === false) {
                    throw new RuntimeException($res['err'] !== '' ? $res['err'] : 'request failed');
                }
                if ($res['code'] >= 400) {
                    throw new RuntimeException('HTTP ' . $res['code']);
                }
                return (string) $res['body'];
            }
            return http_get($url, $timeout);
        } catch (Throwable $e) {
            $last = $e;
            usleep(250000 * ($attempt + 1));
        }
    }
    throw $last ?? new RuntimeException('HMS fetch failed');
}

function hms_kmz_to_kml(string $kmz): string
{
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('ZipArchive unavailable for KMZ');
    }
    $tmp = tempnam(sys_get_temp_dir(), 'hmskmz');
    if ($tmp === false) {
        throw new RuntimeException('temp file failed');
    }
    try {
        if (file_put_contents($tmp, $kmz) === false) {
            throw new RuntimeException('KMZ write failed');
        }
        $zip = new ZipArchive();
        if ($zip->open($tmp) !== true) {
            throw new RuntimeException('KMZ open failed');
        }
        $kml = null;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if ($name !== false && preg_match('/\.kml$/i', $name)) {
                $kml = $zip->getFromIndex($i);
                if ($kml !== false && $kml !== '') {
                    break;
                }
            }
        }
        $zip->close();
        if ($kml === null || $kml === false || $kml === '') {
            throw new RuntimeException('KMZ missing KML');
        }
        return (string) $kml;
    } finally {
        @unlink($tmp);
    }
}

/**
 * @return array{type: string, features: list<array>}
 */
function hms_kml_to_geojson(string $kml, string $ymd): array
{
    $features = [];
    if (!preg_match_all('/<Placemark\b[^>]*>(.*?)<\/Placemark>/is', $kml, $marks)) {
        return ['type' => 'FeatureCollection', 'features' => []];
    }
    foreach ($marks[1] as $body) {
        $density = 'Smoke';
    if(preg_match('/Density:\s*(Light|Medium|Heavy)/i', $body, $m)){
      $density = ucfirst(strtolower($m[1]));
    }elseif(preg_match('/<SimpleData\s+name=["\']Density["\']\s*>([^<]+)<\/SimpleData>/i', $body, $m)
        || preg_match('/<Data\s+name=["\']Density["\']\s*>\s*<value>([^<]+)<\/value>/i', $body, $m)){
      $density = trim(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5));
    }elseif(preg_match('/styleUrl>#Smoke_(Light|Medium|Heavy)/i', $body, $m)){
      $density = ucfirst(strtolower($m[1]));
    }
        $name = null;
        if (preg_match('/<name>([^<]+)<\/name>/i', $body, $m)) {
            $name = trim(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5));
        }
        if (!preg_match_all('/<Polygon\b[^>]*>(.*?)<\/Polygon>/is', $body, $polys)) {
            continue;
        }
        $polygons = [];
        foreach ($polys[1] as $polyBody) {
            $rings = [];
            if (preg_match_all('/<(?:outer|inner)BoundaryIs>.*?<coordinates>([^<]+)<\/coordinates>/is', $polyBody, $coordBlocks)) {
                foreach ($coordBlocks[1] as $coordText) {
                    $ring = hms_parse_coords($coordText);
                    if (count($ring) >= 4) {
                        $rings[] = $ring;
                    }
                }
            } elseif (preg_match('/<coordinates>([^<]+)<\/coordinates>/is', $polyBody, $c)) {
                $ring = hms_parse_coords($c[1]);
                if (count($ring) >= 4) {
                    $rings[] = $ring;
                }
            }
            if ($rings) {
                $polygons[] = $rings;
            }
        }
        if (!$polygons) {
            continue;
        }
        $geometry = count($polygons) === 1
            ? ['type' => 'Polygon', 'coordinates' => $polygons[0]]
            : ['type' => 'MultiPolygon', 'coordinates' => $polygons];
        $features[] = [
            'type' => 'Feature',
            'properties' => [
                'Density' => $density,
                'Label' => $name ?: ('HMS ' . $density . ' smoke'),
                'date' => $ymd,
            ],
            'geometry' => $geometry,
        ];
    }
    return ['type' => 'FeatureCollection', 'features' => $features];
}

/**
 * @return list<list<float>>
 */
function hms_parse_coords(string $text): array
{
    $ring = [];
    foreach (preg_split('/\s+/', trim($text)) as $tok) {
        if ($tok === '') {
            continue;
        }
        $parts = explode(',', $tok);
        if (count($parts) < 2) {
            continue;
        }
        $lon = (float) $parts[0];
        $lat = (float) $parts[1];
        if (!is_finite($lon) || !is_finite($lat)) {
            continue;
        }
        $ring[] = [$lon, $lat];
    }
    if ($ring && ($ring[0][0] !== $ring[count($ring) - 1][0] || $ring[0][1] !== $ring[count($ring) - 1][1])) {
        $ring[] = $ring[0];
    }
    return $ring;
}
