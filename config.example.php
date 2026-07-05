<?php
/**
 * Echo Weather — configuration template
 *
 * SET UP ON THE SERVER (not synced from your laptop):
 *
 *   sudo cp config.example.php config.local.php
 *   sudo nano /var/www/echoweather/config.local.php
 *
 * Never commit or rsync config.local.php — it holds API keys and may differ
 * per machine. When new keys are added here, merge them into the server's
 * existing config.local.php by hand.
 *
 * All keys are optional. Without them the app still works — it falls back to
 * Open-Meteo modeled air quality and skips Google Pollen for US locations.
 */

return [

    // -------------------------------------------------------------------------
    // AirNow (US EPA monitor observations)
    // -------------------------------------------------------------------------
    // Free key: https://docs.airnow.gov/
    // Proxied at /api/airnow — keeps the key off the browser.
    'airnow_api_key' => '',

    // -------------------------------------------------------------------------
    // Google Pollen API (tree / grass / weed forecast)
    // -------------------------------------------------------------------------
    // Google Maps Platform → Pollen API (billing required).
    // Docs: https://developers.google.com/maps/documentation/pollen/overview
    //
    // Same Cloud project + API key as other Maps services (e.g. digital signage).
    // If empty, PHP also checks the GOOGLE_POLLEN_API_KEY environment variable.
    'google_pollen_api_key' => '',

    // -------------------------------------------------------------------------
    // Pollen cache — reduces Google API usage
    // -------------------------------------------------------------------------
    // Cached on disk in cache/pollen/ (one file per grid cell).
    //
    // pollen_cache_ttl — seconds before a cached cell expires.
    //   10800 (3h)  default
    //   21600 (6h)  fewer API calls
    //
    // pollen_cache_grid — decimal places when rounding lat/lon to a cell:
    //   0 → ~70 mi   fewest API calls
    //   1 → ~10 mi   default
    //   2 → ~1 mi    finest resolution
    'pollen_cache_ttl' => 10800,
    'pollen_cache_grid' => 1,

    // -------------------------------------------------------------------------
    // Pollen daily cap — hard stop on Google API calls
    // -------------------------------------------------------------------------
    // Max billable Pollen API requests per calendar day (server timezone).
    // Counter in cache/pollen/_quota.json; resets at midnight.
    //
    //   7500  default — headroom under Google's 10,000/day free tier
    //   5000  more conservative
    //   0     unlimited (not recommended for public sites)
    //
    // When the limit is hit: serve stale cache if available; otherwise 502.
    'pollen_daily_limit' => 7500,

    // -------------------------------------------------------------------------
    // CORS — browser access to /api/*
    // -------------------------------------------------------------------------
    'cors_origins' => [
        'https://echoweather.com',
        'http://127.0.0.1:8080',
        'http://localhost:8080',
    ],
];
