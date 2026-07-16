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

try {
    enforce_rate_limit('hms_smoke', rate_limit_for($cfg, 'rate_limit_hms_smoke') ?: 30);
} catch (RateLimitExceeded $e) {
    send_api_error(429, 'Too many requests', $e, 'hms-smoke/rate-limit', cors: true);
}

$cacheDir = dirname(__DIR__) . '/cache/hms';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}
$cacheFile = $cacheDir . '/latest.json';
$ttl = 30 * 60;

if (is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < $ttl) {
    $cached = file_get_contents($cacheFile);
    if ($cached !== false && $cached !== '') {
        header('Content-Type: application/geo+json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Cache-Control: public, max-age=900');
        echo $cached;
        exit;
    }
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
    if (is_file($cacheFile)) {
        $cached = file_get_contents($cacheFile);
        if ($cached !== false && $cached !== '') {
            header('Content-Type: application/geo+json; charset=utf-8');
            header('Access-Control-Allow-Origin: *');
            header('Cache-Control: public, max-age=300');
            echo $cached;
            exit;
        }
    }
    send_api_error(502, 'Upstream smoke product unavailable', $e, 'hms-smoke', cors: true);
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
            $kml = http_get($url, 40);
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
    throw $lastErr ?? new RuntimeException('No HMS smoke product available');
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
