<?php
/**
 * Hundred Acre Weather — main display
 */

$config = require __DIR__ . '/config.php';
require_once __DIR__ . '/includes/weather.php';
require_once __DIR__ . '/includes/images.php';
require_once __DIR__ . '/includes/location.php';
require_once __DIR__ . '/includes/alerts.php';

$location = resolveLocation($config);
$lat = $location['lat'];
$lon = $location['lon'];
$name = htmlspecialchars($location['name'], ENT_QUOTES, 'UTF-8');
$locationSource = $location['source'] ?? 'default';

$error = null;
$weather = null;

try {
    $config['location_name'] = $location['name'];
    $weather = fetchWeather($config, $lat, $lon);
} catch (Throwable $e) {
    $error = $e->getMessage();
}

$levels = getWeatherLevels();
$level = $weather['level'] ?? 0;
$info = $weather['level_info'] ?? $levels[0];
$current = $weather['current'] ?? [];
$tempUnit = $config['temperature_unit'] === 'fahrenheit' ? '°F' : '°C';
$windUnit = $config['wind_unit'] ?? 'mph';
$updated = isset($weather['fetched_at']) ? date('g:i A', $weather['fetched_at']) : '';
$echoFrom = isset($_GET['from']) && $_GET['from'] === 'echo';
$echoQs = $echoFrom ? '?from=echo' : '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hundred Acre Weather — <?= htmlspecialchars($info['name']) ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body class="<?= htmlspecialchars($info['css_class']) ?>" data-location-source="<?= htmlspecialchars($locationSource) ?>">

<div class="sky-layer" aria-hidden="true">
    <div class="cloud cloud-a"></div>
    <div class="cloud cloud-b"></div>
    <div class="cloud cloud-c"></div>
    <div class="rain-layer"></div>
    <div class="wind-layer"></div>
</div>

<div class="woodland-border top" aria-hidden="true"></div>

<header class="site-header">
    <div class="header-inner">
        <h1 class="site-title">The Hundred Acre Weather</h1>
        <nav>
            <a href="index.php<?= $echoQs ?>">Forecast</a>
            <a href="slides.php<?= $echoQs ?>">Guide</a>
            <?php if ($echoFrom): ?>
            <a href="../" class="echo-back">← Echo Weather</a>
            <?php endif; ?>
        </nav>
    </div>
</header>

<main class="main-content">

<?php if ($error): ?>
    <section class="card error-card">
        <h2>Owl could not read the sky</h2>
        <p><?= htmlspecialchars($error) ?></p>
        <p class="hint">Try again shortly, or check your location settings.</p>
    </section>
<?php else: ?>

    <section class="hero-card card">
        <div class="level-badge">Level <?= $level ?></div>
        <div class="hero-grid">
            <div class="hero-text">
                <p class="location"><?= $name ?></p>
                <p class="location-meta"><?= htmlspecialchars(locationSourceLabel($locationSource)) ?></p>
                <h2 class="level-name"><?= htmlspecialchars($info['name']) ?></h2>
                <p class="level-message"><?= htmlspecialchars($info['message']) ?></p>
                <p class="story-line"><em><?= htmlspecialchars($info['story']) ?></em></p>
            </div>
            <div class="hero-visual">
                <?= weatherIconSvg($info['icon'], 80) ?>
                <?php if ($info['character']): ?>
                <div class="character-spot" data-character="<?= htmlspecialchars(strtolower(str_replace(' ', '-', $info['character']))) ?>">
                    <?= renderCharacterImage($info['character']) ?>
                    <span class="character-label"><?= htmlspecialchars($info['character']) ?></span>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </section>

    <?= renderNwsAlertsSection(
        $weather['alerts'] ?? [],
        !empty($weather['nws_available']),
        !empty($weather['nws_enabled'])
    ) ?>

    <section class="card current-conditions">
        <h3>What the woods report now</h3>
        <div class="stats-grid">
            <div class="stat">
                <span class="stat-value"><?= formatNumber((float) ($current['temperature_2m'] ?? 0)) ?><?= $tempUnit ?></span>
                <span class="stat-label">Temperature</span>
            </div>
            <div class="stat">
                <span class="stat-value"><?= formatNumber((float) ($current['wind_speed_10m'] ?? 0)) ?> <?= $windUnit ?></span>
                <span class="stat-label">Wind</span>
            </div>
            <div class="stat">
                <span class="stat-value"><?= formatNumber((float) ($current['wind_gusts_10m'] ?? 0)) ?> <?= $windUnit ?></span>
                <span class="stat-label">Gusts</span>
            </div>
            <div class="stat">
                <span class="stat-value"><?= (int) ($current['relative_humidity_2m'] ?? 0) ?>%</span>
                <span class="stat-label">Humidity</span>
            </div>
        </div>
        <p class="condition-desc"><?= htmlspecialchars(weatherCodeDescription((int) ($current['weather_code'] ?? 0))) ?></p>
        <?php if (!empty($weather['level_reasons'])): ?>
        <ul class="reasons-list">
            <?php foreach ($weather['level_reasons'] as $reason): ?>
            <li><?= htmlspecialchars($reason) ?></li>
            <?php endforeach; ?>
        </ul>
        <?php endif; ?>
    </section>

    <section class="card action-card">
        <h3>What you should do</h3>
        <p><?= htmlspecialchars($info['action']) ?></p>
        <blockquote class="advisor-quote">
            <strong><?= htmlspecialchars(explode(' ', $weather['advisor'])[0]) ?></strong>
            <?= htmlspecialchars(substr($weather['advisor'], strlen(explode(' ', $weather['advisor'])[0]))) ?>
        </blockquote>
    </section>

    <section class="card scale-card">
        <h3>The path through the woods</h3>
        <div class="scale-path">
            <?php foreach ($levels as $num => $lvl): ?>
            <div class="scale-step <?= $num === $level ? 'active' : '' ?> <?= $num <= $level ? 'reached' : '' ?>">
                <span class="scale-num"><?= $num ?></span>
                <span class="scale-short"><?= htmlspecialchars($lvl['short']) ?></span>
            </div>
            <?php if ($num < 5): ?><span class="scale-arrow">→</span><?php endif; ?>
            <?php endforeach; ?>
        </div>
    </section>

    <?php if (!empty($weather['daily'])): ?>
    <section class="card forecast-card">
        <h3>Looking ahead</h3>
        <div class="daily-grid">
            <?php foreach ($weather['daily'] as $day): ?>
            <article class="day-card">
                <time datetime="<?= htmlspecialchars($day['date']) ?>">
                    <?= date('D', strtotime($day['date'])) ?>
                </time>
                <p class="day-desc"><?= htmlspecialchars($day['description']) ?></p>
                <p class="day-temps">
                    <?= formatNumber((float) $day['high']) ?> / <?= formatNumber((float) $day['low']) ?><?= $day['temp_unit'] ?>
                </p>
                <?php if ($day['sunset']): ?>
                <p class="day-sunset">Sunset <?= date('g:i A', strtotime($day['sunset'])) ?></p>
                <?php endif; ?>
            </article>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

    <section class="card official-card">
        <h3>Official equivalents for this level</h3>
        <ul>
            <?php foreach ($info['official'] as $equiv): ?>
            <li><?= htmlspecialchars($equiv) ?></li>
            <?php endforeach; ?>
        </ul>
        <p class="disclaimer">
            Data from <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>.
            <?php if (!empty($weather['alerts'])): ?>
            Alerts from <a href="https://www.weather.gov/" target="_blank" rel="noopener">National Weather Service</a>.
            <?php endif; ?>
            Updated <?= htmlspecialchars($updated) ?>.
        </p>
    </section>

<?php endif; ?>

</main>

<footer class="site-footer">
    <?= renderAttributionFooter() ?>
    <p class="footer-links">
        <a href="slides.php<?= $echoQs ?>">View the weather guide</a>
        &middot;
        <button type="button" class="link-button" id="use-my-location">Use my precise location</button>
    </p>
</footer>

<div class="woodland-border bottom" aria-hidden="true"></div>

<?php if (!empty($config['auto_browser_location'])): ?>
<script src="assets/js/location.js"></script>
<?php endif; ?>

</body>
</html>
