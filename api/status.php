<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/pollen.php';

handle_cors_preflight();

try {
    $cfg = load_config();
    send_json(200, [
        'airnow' => trim((string) ($cfg['airnow_api_key'] ?? '')) !== '',
        'buoy' => true,
        'pollen' => google_pollen_api_key($cfg) !== '',
    ], cors: true);
} catch (Throwable $e) {
    send_api_error(500, 'Service unavailable', $e, 'status', cors: true);
}
