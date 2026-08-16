<?php
/**
 * Lakes Log — page helpers.
 */

function resolveLogSayingVisit(?string $timezone = null): string
{
    $ttl = 30 * 60;
    $now = time();
    $cookie = (string) ($_COOKIE['lake_log_saying'] ?? '');
    $salt = null;
    $issued = 0;

    if (preg_match('/^([a-f0-9]{8})\.(\d+)$/', $cookie, $match)) {
        $salt = $match[1];
        $issued = (int) $match[2];
    }

    $stale = $salt === null || ($now - $issued) >= $ttl;
    if (!$stale && $timezone) {
        try {
            $tz = new DateTimeZone($timezone);
            $issuedDay = (new DateTimeImmutable('@' . $issued))->setTimezone($tz)->format('Y-m-d');
            $today = (new DateTimeImmutable('now', $tz))->format('Y-m-d');
            $stale = $issuedDay !== $today;
        } catch (Exception $e) {
            // Keep the current salt if timezone parsing fails.
        }
    }

    if ($stale) {
        $salt = bin2hex(random_bytes(4));
        $issued = $now;
        if (!headers_sent()) {
            setcookie('lake_log_saying', $salt . '.' . $issued, [
                'expires'  => $now + 60 * 60 * 24,
                'path'     => '/',
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
        $_COOKIE['lake_log_saying'] = $salt . '.' . $issued;
    }

    return $salt;
}

function logAssetVersion(string $relativeFromLogRoot): int
{
    $path = __DIR__ . '/../' . ltrim($relativeFromLogRoot, '/');

    return (int) (@filemtime($path) ?: 1);
}

function renderLogHead(array $opts): string
{
    $title = $opts['title'] ?? 'The Lakes Log';
    $description = $opts['description'] ?? 'A Great Lakes ship’s-log reading of the sky.';
    $cssFile = $opts['css'] ?? 'assets/css/style.css';
    $base = woodsBaseUrl();
    $cssVer = logAssetVersion($cssFile);

    ob_start();
    ?>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
    <meta name="description" content="<?= htmlspecialchars($description, ENT_QUOTES, 'UTF-8') ?>">
    <meta property="og:type" content="website">
    <meta property="og:title" content="<?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?>">
    <meta property="og:description" content="<?= htmlspecialchars($description, ENT_QUOTES, 'UTF-8') ?>">
    <link rel="icon" href="assets/favicon.svg?v=<?= logAssetVersion('assets/favicon.svg') ?>" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= htmlspecialchars($cssFile, ENT_QUOTES, 'UTF-8') ?>?v=<?= $cssVer ?>">
    <?php

    return ob_get_clean();
}

function lighthouseSvg(int $size = 96): string
{
    return sprintf(
        '<svg class="lighthouse" width="%d" height="%d" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 L36 22 H28 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><rect x="29" y="22" width="6" height="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M26 26 L38 26 L42 56 H22 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><line x1="32" y1="30" x2="32" y2="52" stroke="currentColor" stroke-width="1.6"/><path d="M8 58 H56" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 58 C18 50, 24 50, 32 58 C40 50, 46 50, 52 58" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
        $size,
        $size
    );
}

function applyLakePageCopy(array $weather, array $copyContext): array
{
    $levels = getLakeLogLevels();
    $level = (int) ($weather['level'] ?? 0);
    $canonical = $levels[$level] ?? $levels[0];
    $weather['level_info'] = applyLakeLogCopy($canonical, $level, $copyContext);

    $rawReasons = $weather['level_reasons_raw']
        ?? $copyContext['reasons']
        ?? [];
    $weather['advisor'] = pickLakeAdvisor($level, $rawReasons, $copyContext);
    $weather['level_reasons'] = formatLakeReasons($weather['level_reasons'] ?? $rawReasons);

    if (!empty($weather['day_story']['beats']) && is_array($weather['day_story']['beats'])) {
        foreach ($weather['day_story']['beats'] as $index => $beat) {
            $beatLevel = (int) ($beat['level'] ?? $level);
            $info = $levels[$beatLevel] ?? $levels[0];
            $pool = getLakeSayingPools()[$beatLevel]['character_role'] ?? [$info['character_role']];
            $weather['day_story']['beats'][$index]['level_name'] = $info['name'];
            $weather['day_story']['beats'][$index]['character'] = $info['character'];
            $weather['day_story']['beats'][$index]['aside'] = pickWoodsSaying(
                $pool,
                woodsCopySeed($beatLevel, 'lake:aside', $copyContext),
                $info['character_role'],
                $copyContext
            );
        }
    }

    if (!empty($weather['day_story']['footnote'])) {
        $weather['day_story']['footnote']['character'] = 'The captain';
        $weather['day_story']['footnote']['verb'] = 'logs';
    }

    return $weather;
}

function renderLogWatchSection(array $story): string
{
    if (empty($story['beats'])) {
        return '';
    }

    ob_start();
    ?>
    <section class="card day-story-card" aria-labelledby="day-story-heading">
        <h3 id="day-story-heading">Watch bill</h3>
        <div class="day-story">
            <?php foreach ($story['beats'] as $beat): ?>
            <p class="day-story-beat">
                <strong><?= htmlspecialchars($beat['period_label']) ?>:</strong>
                <?= htmlspecialchars($beat['transition']) ?>
                <em><?= htmlspecialchars($beat['level_name']) ?></em>
                (Level <?= (int) $beat['level'] ?>).
                <span class="day-story-aside"><em><?= htmlspecialchars($beat['character']) ?></em>
                &mdash; <?= htmlspecialchars($beat['aside']) ?>.</span>
            </p>
            <?php endforeach; ?>
        </div>
        <?php if (!empty($story['footnote'])): ?>
        <p class="day-story-footnote">
            <strong><?= htmlspecialchars($story['footnote']['character']) ?>
            <?= htmlspecialchars($story['footnote']['verb']) ?>:</strong>
            <?= htmlspecialchars($story['footnote']['text']) ?>
        </p>
        <?php endif; ?>
    </section>
    <?php

    return ob_get_clean();
}

function lakeAlertNote(string $type): string
{
    return match ($type) {
        'warning'   => 'The captain is calling everyone in — take protective action now.',
        'watch'     => 'Conditions may become hazardous. Prepare, and stay off the open water.',
        'advisory'  => 'Pay close attention. Weather may cause inconvenience or harm.',
        'statement' => 'Noted in the log. Worth reading.',
        default     => 'Stay informed and check official sources.',
    };
}

function renderLogAlertsSection(array $alerts, bool $nwsAvailable, bool $nwsEnabled): string
{
    if (!$nwsEnabled) {
        return '';
    }

    ob_start();

    if (!$nwsAvailable) {
        ?>
        <section class="card nws-card nws-unavailable" aria-labelledby="nws-heading">
            <h3 id="nws-heading">Official notices</h3>
            <p class="nws-intro">NWS watches, warnings, and advisories are available for locations in the United States.</p>
        </section>
        <?php
        return ob_get_clean();
    }

    if (empty($alerts)) {
        ?>
        <section class="card nws-card nws-clear" aria-labelledby="nws-heading">
            <h3 id="nws-heading">Official notices</h3>
            <p class="nws-status nws-status-clear">No active watches, warnings, or advisories on this stretch.</p>
            <?= renderNwsSourceLine() ?>
        </section>
        <?php
        return ob_get_clean();
    }

    $alerts = sortAlertsForDisplay($alerts);
    $groups = groupAlertsByType($alerts);
    $counts = array_sum(array_map('count', $groups));
    ?>
    <section class="card nws-card" aria-labelledby="nws-heading">
        <div class="nws-header">
            <h3 id="nws-heading">Official notices</h3>
            <p class="nws-count"><?= (int) $counts ?> active</p>
        </div>
        <p class="nws-intro">The log translates the weather. It does not replace a warning.</p>

        <div class="nws-summary-chips" aria-label="Alert summary">
            <?php foreach ($groups as $type => $items): ?>
            <span class="nws-chip nws-chip-<?= htmlspecialchars($type) ?>">
                <?= count($items) ?> <?= htmlspecialchars(alertTypeLabel($type)) ?>
            </span>
            <?php endforeach; ?>
        </div>

        <?php foreach ($groups as $type => $items): ?>
        <div class="nws-group nws-group-<?= htmlspecialchars($type) ?>">
            <h4 class="nws-group-title"><?= htmlspecialchars(alertTypeLabel($type)) ?></h4>
            <p class="nws-group-note"><?= htmlspecialchars(lakeAlertNote($type)) ?></p>
            <?php foreach ($items as $alert): ?>
            <article class="nws-alert">
                <h5 class="nws-alert-event"><?= htmlspecialchars($alert['event'] ?? 'Alert') ?></h5>
                <?php if (!empty($alert['headline'])): ?>
                <p class="nws-alert-headline"><?= htmlspecialchars($alert['headline']) ?></p>
                <?php endif; ?>
                <?php if (!empty($alert['instruction'])): ?>
                <details class="nws-alert-details"<?= ($alert['type'] ?? '') === 'warning' ? ' open' : '' ?>>
                    <summary>What to do</summary>
                    <p><?= nl2br(htmlspecialchars(trimAlertText($alert['instruction'], 1200))) ?></p>
                </details>
                <?php endif; ?>
            </article>
            <?php endforeach; ?>
        </div>
        <?php endforeach; ?>

        <?= renderNwsSourceLine() ?>
    </section>
    <?php

    return ob_get_clean();
}
