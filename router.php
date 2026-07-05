<?php
declare(strict_types=1);

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = rtrim($uri, '/') ?: '/';

$routes = [
    '/api/status' => __DIR__ . '/api/status.php',
    '/api/airnow' => __DIR__ . '/api/airnow.php',
    '/api/pollen' => __DIR__ . '/api/pollen.php',
];

if (isset($routes[$path])) {
    require $routes[$path];
    return true;
}

if (preg_match('#^/api/buoy/([A-Za-z0-9]{4,8})$#', $path, $m)) {
    $_GET['station'] = $m[1];
    require __DIR__ . '/api/buoy.php';
    return true;
}

return false;
