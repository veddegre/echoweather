<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/pollen.php';

try {
    $cfg = load_config();
    send_json(200, [
        'airnow' => trim((string) ($cfg['airnow_api_key'] ?? '')) !== '',
        'buoy' => true,
        'pollen' => google_pollen_api_key($cfg) !== '',
    ], cors: true);
} catch (Throwable $e) {
    send_json(500, ['error' => $e->getMessage()], cors: true);
}
