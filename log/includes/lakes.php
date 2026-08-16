<?php
/**
 * Great Lakes name helper — same basins Echo uses in marine.js.
 */
function greatLakeName(float $lat, float $lon): ?string
{
    if ($lat >= 42.2 && $lat <= 42.7 && $lon >= -83.2 && $lon <= -82.2) {
        return 'Lake St. Clair';
    }
    if ($lat >= 46.35 && $lon >= -92.5 && $lon < -86.8) {
        return 'Lake Superior';
    }
    if ($lat >= 46.5 && $lon >= -86.8 && $lon <= -84.5) {
        return 'Lake Superior';
    }
    if ($lat >= 43 && $lat <= 46.55 && $lon >= -84.5 && $lon <= -79) {
        return 'Lake Huron';
    }
    if ($lat >= 41 && $lat <= 43 && $lon >= -83 && $lon <= -78) {
        return 'Lake Erie';
    }
    if ($lat >= 42.5 && $lat <= 44.5 && $lon >= -79.5 && $lon <= -76) {
        return 'Lake Ontario';
    }
    if ($lat >= 41 && $lat <= 46.35 && $lon >= -92 && $lon <= -84.3) {
        return 'Lake Michigan';
    }

    return null;
}

function lakeLogStationName(float $lat, float $lon, string $placeName): string
{
    $lake = greatLakeName($lat, $lon);
    if ($lake !== null) {
        return $lake . ' — ' . $placeName;
    }

    return $placeName;
}

function lakeLogLocationSourceLabel(string $source): string
{
    return match ($source) {
        'browser' => 'Fix from this vessel',
        'ip'      => 'Estimated from the shore',
        'cookie'  => 'Last station logged',
        'manual'  => 'Custom station',
        'search'  => 'Looked up by name',
        default   => 'Default station',
    };
}
