<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

class RateLimitExceeded extends RuntimeException
{
}

function rate_limit_dir(): string
{
    return dirname(__DIR__) . '/cache/ratelimit';
}

function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function rate_limit_path(string $bucket): string
{
    $ip = preg_replace('/[^a-zA-Z0-9._-]/', '_', client_ip()) ?: 'unknown';
    return rate_limit_dir() . '/' . $bucket . '_' . $ip . '.json';
}

function enforce_rate_limit(string $bucket, int $limitPerHour): void
{
    if ($limitPerHour <= 0) {
        return;
    }

    $dir = rate_limit_dir();
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new RuntimeException('failed to create rate limit directory');
    }

    $path = rate_limit_path($bucket);
    $hour = date('Y-m-d-H');
    $fp = fopen($path, 'c+');
    if ($fp === false) {
        throw new RuntimeException('failed to open rate limit file');
    }

    try {
        if (!flock($fp, LOCK_EX)) {
            throw new RuntimeException('failed to lock rate limit file');
        }
        $raw = stream_get_contents($fp);
        $data = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        $count = 0;
        if (is_array($data) && ($data['hour'] ?? '') === $hour) {
            $count = max(0, (int) ($data['count'] ?? 0));
        }
        if ($count >= $limitPerHour) {
            throw new RateLimitExceeded('rate limit exceeded');
        }
        $count++;
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode(['hour' => $hour, 'count' => $count], JSON_UNESCAPED_SLASHES));
        fflush($fp);
        flock($fp, LOCK_UN);
    } finally {
        fclose($fp);
    }
}

function rate_limit_for(array $cfg, string $key): int
{
    return max(0, (int) ($cfg[$key] ?? 0));
}
