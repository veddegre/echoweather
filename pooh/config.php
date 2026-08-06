<?php
/**
 * Hundred Acre Weather — configuration
 */

return [
    // Used only if IP geolocation and browser location both fail
    'fallback_latitude'  => 40.7128,
    'fallback_longitude' => -74.0060,
    'fallback_location_name' => 'The Hundred Acre Wood',

    // Temperature unit: 'celsius' or 'fahrenheit'
    'temperature_unit' => 'fahrenheit',

    // Wind unit: 'kmh', 'mph', or 'ms'
    'wind_unit' => 'mph',

    // Enable NWS active alerts for US coordinates (requires network)
    'nws_alerts' => true,

    // Try browser geolocation automatically when IP/default was used
    'auto_browser_location' => true,

    // Cache weather responses (seconds). 0 = no cache.
    'cache_ttl' => 600,

    // Path to cache directory (must be writable)
    'cache_dir' => __DIR__ . '/cache',
];
