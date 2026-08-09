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
$displayCharacter = $weather['spot_character'] ?? $info['character'];
$advisor = $weather['advisor'] ?? ['character' => 'Owl', 'verb' => 'says', 'quote' => 'Stay aware.', 'full' => 'Owl says: “Stay aware.”'];
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

<section class="location-bar card" aria-label="Choose location">
    <div class="location-bar-row">
        <div class="location-current">
            <span class="location-current-label">Forecast for</span>
            <strong class="location-current-name"><?= $name ?></strong>
            <span class="location-meta"><?= htmlspecialchars(locationSourceLabel($locationSource)) ?></span>
        </div>
        <div class="location-actions">
            <button type="button" class="loc-btn loc-btn-primary" id="use-my-location">Where I am</button>
        </div>
    </div>
    <form class="location-search" id="location-search-form" role="search">
        <label for="location-search-input" class="visually-hidden">Search another place</label>
        <input type="search" id="location-search-input" name="q" placeholder="Search another place…" autocomplete="off" spellcheck="false">
        <div class="location-search-results" id="location-search-results" hidden></div>
    </form>
</section>

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
                <h2 class="level-name"><?= htmlspecialchars($info['name']) ?></h2>
                <p class="level-message"><?= htmlspecialchars($info['message']) ?></p>
                <p class="story-line"><em><?= htmlspecialchars($info['story']) ?></em></p>
                <?php if ($displayCharacter && ($info['character_role'] || ($advisor['character'] ?? '') === $displayCharacter)): ?>
                <p class="character-role">
                    <?php if (($advisor['character'] ?? '') === $displayCharacter && $displayCharacter !== ($info['character'] ?? null)): ?>
                    <?= htmlspecialchars($displayCharacter) ?> — <?= htmlspecialchars(getCharacterGuide()[$displayCharacter]['notices'] ?? 'has thoughts about today') ?>
                    <?php else: ?>
                    <?= htmlspecialchars($displayCharacter) ?> — <?= htmlspecialchars($info['character_role']) ?>
                    <?php endif; ?>
                </p>
                <?php endif; ?>
            </div>
            <div class="hero-visual">
                <?= weatherIconSvg($info['icon'], 80) ?>
                <?php if ($displayCharacter): ?>
                <div class="character-spot" data-character="<?= htmlspecialchars(strtolower(str_replace(' ', '-', $displayCharacter))) ?>">
                    <?= renderCharacterImage($displayCharacter) ?>
                    <span class="character-label"><?= htmlspecialchars($displayCharacter) ?></span>
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
        <p class="action-text"><?= htmlspecialchars($info['action']) ?></p>
        <blockquote class="advisor-quote" cite="">
            <span class="advisor-name"><?= htmlspecialchars($advisor['character']) ?></span>
            <span class="advisor-verb"><?= htmlspecialchars($advisor['verb']) ?>:</span>
            <span class="advisor-text">&ldquo;<?= htmlspecialchars($advisor['quote']) ?>&rdquo;</span>
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

    <?php if (!empty($weather['hourly'])): ?>
    <section class="card hourly-card">
        <h3>The next few hours</h3>
        <div class="hourly-scroll">
            <?php foreach ($weather['hourly'] as $hour): ?>
            <article class="hour-pill">
                <time datetime="<?= htmlspecialchars($hour['time']) ?>">
                    <?= date('g A', strtotime($hour['time'])) ?>
                </time>
                <span class="hour-temp"><?= formatNumber((float) ($hour['temp'] ?? 0)) ?><?= $tempUnit ?></span>
                <?php if ($hour['precip_prob'] !== null): ?>
                <span class="hour-rain"><?= (int) $hour['precip_prob'] ?>%</span>
                <?php endif; ?>
            </article>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

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
        <?php if ($echoFrom): ?>
        &middot; <a href="../">← Back to Echo Weather</a>
        <?php endif; ?>
    </p>
</footer>

<div class="woodland-border bottom" aria-hidden="true"></div>

<script src="assets/js/location.js"></script>

</body>
</html>
