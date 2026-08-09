<?php
/**
 * NWS alert parsing, grouping, and rendering.
 */

function classifyAlertType(string $event): string
{
    $event = strtolower($event);

    if (str_contains($event, 'warning')) {
        return 'warning';
    }
    if (str_contains($event, 'watch')) {
        return 'watch';
    }
    if (str_contains($event, 'advisory')) {
        return 'advisory';
    }
    if (str_contains($event, 'statement')) {
        return 'statement';
    }

    return 'other';
}

function alertTypeLabel(string $type): string
{
    return match ($type) {
        'warning'   => 'Warnings',
        'watch'     => 'Watches',
        'advisory'  => 'Advisories',
        'statement' => 'Statements',
        default     => 'Other alerts',
    };
}

function alertTypeWoodlandNote(string $type): string
{
    return match ($type) {
        'warning'   => 'Christopher Robin is calling everyone inside — take protective action now.',
        'watch'     => 'Rabbit is gathering supplies — conditions may become hazardous.',
        'advisory'  => 'Owl advises paying close attention — weather may cause inconvenience or harm.',
        'statement' => 'The woods have something worth noting.',
        default     => 'Stay informed and check official sources.',
    };
}

function groupAlertsByType(array $alerts): array
{
    $groups = [
        'warning'   => [],
        'watch'     => [],
        'advisory'  => [],
        'statement' => [],
        'other'     => [],
    ];

    foreach ($alerts as $alert) {
        $type = $alert['type'] ?? classifyAlertType($alert['event'] ?? '');
        $groups[$type][] = $alert;
    }

    return array_filter($groups);
}

function sortAlertsForDisplay(array $alerts): array
{
    $priority = ['warning' => 0, 'watch' => 1, 'advisory' => 2, 'statement' => 3, 'other' => 4];

    usort($alerts, function ($a, $b) use ($priority) {
        $ta = $priority[$a['type'] ?? 'other'] ?? 5;
        $tb = $priority[$b['type'] ?? 'other'] ?? 5;
        if ($ta !== $tb) {
            return $ta <=> $tb;
        }
        return strcmp($b['expires'] ?? '', $a['expires'] ?? '');
    });

    return $alerts;
}

function formatAlertTime(?string $iso): ?string
{
    if ($iso === null || $iso === '') {
        return null;
    }

    try {
        $dt = new DateTime($iso);
        return $dt->format('M j, g:i A T');
    } catch (Exception) {
        return null;
    }
}

function trimAlertText(string $text, int $max = 600): string
{
    $text = trim(preg_replace("/\n{3,}/", "\n\n", $text));
    if (strlen($text) <= $max) {
        return $text;
    }

    return rtrim(substr($text, 0, $max)) . '…';
}

function nwsPublicUrl(): string
{
    return 'https://www.weather.gov/';
}

function renderNwsSourceLine(): string
{
    return '<p class="nws-source">Source: <a href="' . htmlspecialchars(nwsPublicUrl(), ENT_QUOTES, 'UTF-8')
        . '" target="_blank" rel="noopener">National Weather Service</a></p>';
}

function renderNwsAlertsSection(array $alerts, bool $nwsAvailable, bool $nwsEnabled): string
{
    ob_start();

    if (!$nwsEnabled) {
        return '';
    }

    if (!$nwsAvailable) {
        ?>
        <section class="card nws-card nws-unavailable" aria-labelledby="nws-heading">
            <h3 id="nws-heading">National Weather Service alerts</h3>
            <p class="nws-intro">NWS watches, warnings, and advisories are available for locations in the United States.</p>
        </section>
        <?php
        return ob_get_clean();
    }

    if (empty($alerts)) {
        ?>
        <section class="card nws-card nws-clear" aria-labelledby="nws-heading">
            <h3 id="nws-heading">National Weather Service alerts</h3>
            <p class="nws-status nws-status-clear">No active watches, warnings, or advisories for your area.</p>
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
            <h3 id="nws-heading">National Weather Service alerts</h3>
            <p class="nws-count"><?= (int) $counts ?> active</p>
        </div>
        <p class="nws-intro">Official watches, warnings, and advisories for your location. The Hundred Acre scale translates these — it does not replace them.</p>

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
            <p class="nws-group-note"><?= htmlspecialchars(alertTypeWoodlandNote($type)) ?></p>

            <?php foreach ($items as $alert): ?>
            <article class="nws-alert nws-alert-<?= htmlspecialchars($alert['type']) ?>">
                <div class="nws-alert-head">
                    <span class="nws-alert-badge"><?= htmlspecialchars(strtoupper($alert['type'])) ?></span>
                    <h5 class="nws-alert-event"><?= htmlspecialchars($alert['event']) ?></h5>
                </div>

                <?php if (!empty($alert['headline'])): ?>
                <p class="nws-alert-headline"><?= htmlspecialchars($alert['headline']) ?></p>
                <?php endif; ?>

                <dl class="nws-alert-meta">
                    <?php if (!empty($alert['areaDesc'])): ?>
                    <div><dt>Area</dt><dd><?= htmlspecialchars($alert['areaDesc']) ?></dd></div>
                    <?php endif; ?>
                    <?php if ($effective = formatAlertTime($alert['effective'] ?? null)): ?>
                    <div><dt>Effective</dt><dd><?= htmlspecialchars($effective) ?></dd></div>
                    <?php endif; ?>
                    <?php if ($expires = formatAlertTime($alert['expires'] ?? null)): ?>
                    <div><dt>Expires</dt><dd><?= htmlspecialchars($expires) ?></dd></div>
                    <?php endif; ?>
                    <?php if (!empty($alert['severity'])): ?>
                    <div><dt>Severity</dt><dd><?= htmlspecialchars($alert['severity']) ?></dd></div>
                    <?php endif; ?>
                    <?php if (!empty($alert['urgency'])): ?>
                    <div><dt>Urgency</dt><dd><?= htmlspecialchars($alert['urgency']) ?></dd></div>
                    <?php endif; ?>
                </dl>

                <?php if (!empty($alert['instruction'])): ?>
                <details class="nws-alert-details"<?= ($alert['type'] ?? '') === 'warning' ? ' open' : '' ?>>
                    <summary>What to do</summary>
                    <p><?= nl2br(htmlspecialchars(trimAlertText($alert['instruction'], 1200))) ?></p>
                </details>
                <?php endif; ?>

                <?php if (!empty($alert['description'])): ?>
                <details class="nws-alert-details">
                    <summary>Details</summary>
                    <p><?= nl2br(htmlspecialchars(trimAlertText($alert['description'], 1200))) ?></p>
                </details>
                <?php endif; ?>

                <?php if (!empty($alert['url'])): ?>
                <p class="nws-alert-link">
                    <a href="<?= htmlspecialchars($alert['url']) ?>" target="_blank" rel="noopener">Read full alert at the National Weather Service</a>
                </p>
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
