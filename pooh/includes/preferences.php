<?php
/**
 * Unit preferences — cookie / query overrides for config defaults.
 */

function resolveUnitPreferences(array $config): array
{
    $temp = $config['temperature_unit'] ?? 'fahrenheit';
    $wind = $config['wind_unit'] ?? 'mph';

    if (isset($_GET['units'])) {
        $u = strtolower((string) $_GET['units']);
        if ($u === 'c' || $u === 'celsius') {
            $temp = 'celsius';
            $wind = 'kmh';
        } elseif ($u === 'f' || $u === 'fahrenheit') {
            $temp = 'fahrenheit';
            $wind = 'mph';
        }
        saveUnitCookie($temp);
    } elseif (!empty($_COOKIE['hundred_acre_units'])) {
        $stored = strtolower((string) $_COOKIE['hundred_acre_units']);
        if ($stored === 'c') {
            $temp = 'celsius';
            $wind = 'kmh';
        } elseif ($stored === 'f') {
            $temp = 'fahrenheit';
            $wind = 'mph';
        }
    }

    return [
        'temperature_unit' => $temp,
        'wind_unit'        => $wind,
        'units_label'      => $temp === 'celsius' ? 'C' : 'F',
    ];
}

function saveUnitCookie(string $temperatureUnit): void
{
    if (headers_sent()) {
        return;
    }

    $value = $temperatureUnit === 'celsius' ? 'c' : 'f';
    setcookie('hundred_acre_units', $value, [
        'expires'  => time() + 60 * 60 * 24 * 365,
        'path'     => '/',
        'httponly' => false,
        'samesite' => 'Lax',
    ]);
}

function applyUnitPreferences(array $config): array
{
    $units = resolveUnitPreferences($config);
    $config['temperature_unit'] = $units['temperature_unit'];
    $config['wind_unit'] = $units['wind_unit'];

    return $config;
}

function woodsAssetVersion(string $relativeFromPoohRoot): int
{
    $path = __DIR__ . '/../' . ltrim($relativeFromPoohRoot, '/');

    return (int) (@filemtime($path) ?: 1);
}

function woodsBaseUrl(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $script = $_SERVER['SCRIPT_NAME'] ?? '/pooh/index.php';
    $dir = str_replace('\\', '/', dirname($script));
    $dir = rtrim($dir, '/');

    return $scheme . '://' . $host . ($dir === '.' ? '' : $dir);
}

function buildEchoWeatherUrl(float $lat, float $lon, string $name): string
{
    $url = '../?' . http_build_query([
        'lat'  => number_format($lat, 4, '.', ''),
        'lon'  => number_format($lon, 4, '.', ''),
        'name' => $name,
    ]);

    return $url;
}

function renderWoodsHead(array $opts): string
{
    $title = $opts['title'] ?? 'Hundred Acre Weather';
    $description = $opts['description'] ?? 'A storybook reading of the sky — six gentle levels from a fine day for a walk to a Hundred Acre emergency.';
    $level = (int) ($opts['level'] ?? 0);
    $cssFile = $opts['css'] ?? 'assets/css/style.css';
    $base = woodsBaseUrl();
    $ogImage = $base . '/assets/images/characters/hundred-acre-wood.jpg';
    $cssVer = woodsAssetVersion($cssFile);

    ob_start();
    ?>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
    <meta name="description" content="<?= htmlspecialchars($description, ENT_QUOTES, 'UTF-8') ?>">
    <meta property="og:type" content="website">
    <meta property="og:title" content="<?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?>">
    <meta property="og:description" content="<?= htmlspecialchars($description, ENT_QUOTES, 'UTF-8') ?>">
    <meta property="og:image" content="<?= htmlspecialchars($ogImage, ENT_QUOTES, 'UTF-8') ?>">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" href="assets/favicon.svg?v=<?= woodsAssetVersion('assets/favicon.svg') ?>" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= htmlspecialchars($cssFile, ENT_QUOTES, 'UTF-8') ?>?v=<?= $cssVer ?>">
    <?php

    return ob_get_clean();
}
