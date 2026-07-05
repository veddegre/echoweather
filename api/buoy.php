<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/http.php';

$station = (string) ($_GET['station'] ?? '');
$station = trim($station);
if (str_ends_with(strtolower($station), '.txt')) {
    $station = substr($station, 0, -4);
}

if (!preg_match('/^[A-Za-z0-9]{4,8}$/', $station)) {
    send_json(400, ['error' => 'invalid station id'], cors: true);
}

try {
    $text = fetch_ndbc_buoy($station);
    send_json(200, ['station' => strtoupper($station), 'text' => $text], cors: true);
} catch (Throwable $e) {
    send_json(502, ['error' => $e->getMessage()], cors: true);
}
