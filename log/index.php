<?php
/**
 * The Lakes Log — Great Lakes ship’s-log weather display.
 */

$config = require __DIR__ . '/../pooh/config.php';
$config['fallback_location_name'] = 'The open lake';

require_once __DIR__ . '/../pooh/includes/weather.php';
require_once __DIR__ . '/../pooh/includes/location.php';
require_once __DIR__ . '/../pooh/includes/alerts.php';
require_once __DIR__ . '/../pooh/includes/preferences.php';
require_once __DIR__ . '/includes/lakes.php';
require_once __DIR__ . '/includes/levels.php';
require_once __DIR__ . '/includes/log.php';

$config = applyUnitPreferences($config);

$location = resolveLocation($config);
$lat = $location['lat'];
$lon = $location['lon'];
$placeName = $location['name'];
$station = lakeLogStationName($lat, $lon, $placeName);
$name = htmlspecialchars($station, ENT_QUOTES, 'UTF-8');
$locationSource = $location['source'] ?? 'default';
$lake = greatLakeName($lat, $lon);

$error = null;
$weather = null;

try {
    $config['location_name'] = $placeName;
    $weather = fetchWeather($config, $lat, $lon);
} catch (Throwable $e) {
    $error = $e->getMessage();
}

$levels = getLakeLogLevels();
$level = 0;
$info = $levels[0];
$advisor = [
    'character' => 'The keeper',
    'verb'      => 'notes',
    'quote'     => 'Keep a weather eye.',
];
$current = [];
$forecastSource = 'open-meteo';
$currentSource = 'open-meteo';
$usingNwsForecast = false;
if ($weather) {
    $copyContext = woodsCopyContextFromWeather($weather, $config);
    $copyContext['visit'] = resolveLogSayingVisit($copyContext['timezone'] ?? null);
    $weather = applyLakePageCopy($weather, $copyContext);
    $level = $weather['level'] ?? 0;
    $info = $weather['level_info'] ?? $levels[0];
    $advisor = $weather['advisor'] ?? $advisor;
    $current = $weather['current'] ?? [];
    $forecastSource = $weather['forecast_source'] ?? 'open-meteo';
    $currentSource = $weather['current_source'] ?? 'open-meteo';
    $usingNwsForecast = ($forecastSource === 'nws') && !empty($weather['nws_available']);
}
$windUnit = $config['wind_unit'] ?? 'mph';
$updated = (is_array($weather) && isset($weather['fetched_at'])) ? date('g:i A', $weather['fetched_at']) : '';
$echoFrom = isset($_GET['from']) && $_GET['from'] === 'echo';
$echoQs = $echoFrom ? '?from=echo' : '';
$isFahrenheit = ($config['temperature_unit'] ?? 'fahrenheit') === 'fahrenheit';
$echoSyncUrl = buildEchoWeatherUrl($lat, $lon, $placeName);
$logDate = date('j M Y');
$pageDescription = htmlspecialchars($info['message'] ?? 'A Great Lakes reading of the sky.', ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <?= renderLogHead([
        'title'       => 'The Lakes Log — ' . $info['name'],
        'description' => $pageDescription,
    ]) ?>
</head>
<body class="<?= htmlspecialchars($info['css_class']) ?> log-page">

<div class="wave-layer" aria-hidden="true"></div>

<header class="site-header">
    <div class="header-inner">
        <h1 class="site-title">The Lakes Log</h1>
        <nav>
            <a href="index.php<?= $echoQs ?>">Log</a>
            <a href="<?= htmlspecialchars($echoSyncUrl, ENT_QUOTES, 'UTF-8') ?>" class="echo-back">← Echo Weather</a>
        </nav>
    </div>
</header>

<section class="log-location" aria-label="Station">
    <div class="log-location-inner">
        <div class="log-location-text">
            <span class="log-location-name"><?= $name ?></span>
            <span class="log-location-meta">Log date <?= htmlspecialchars($logDate) ?></span>
        </div>
        <div class="woods-unit-toggle" id="woods-unit-toggle" role="group" aria-label="Temperature units">
            <button type="button" class="woods-unit<?= $isFahrenheit ? ' is-on' : '' ?>" data-units="f" aria-pressed="<?= $isFahrenheit ? 'true' : 'false' ?>">°F</button>
            <button type="button" class="woods-unit<?= !$isFahrenheit ? ' is-on' : '' ?>" data-units="c" aria-pressed="<?= !$isFahrenheit ? 'true' : 'false' ?>">°C</button>
        </div>
    </div>
</section>

<main class="main-content">

<?php if ($error): ?>
    <section class="card error-card">
        <h2>The glass could not be read</h2>
        <p><?= htmlspecialchars($error) ?></p>
        <p class="hint">Try again on the next watch.</p>
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
                <p class="character-role">
                    <?= htmlspecialchars($info['character']) ?> — <?= htmlspecialchars($info['character_role']) ?>
                </p>
            </div>
            <div class="hero-visual">
                <?= weatherIconSvg($info['icon'], 72) ?>
                <?= lighthouseSvg(88) ?>
            </div>
        </div>
    </section>

    <?= renderLogWatchSection($weather['day_story'] ?? ['beats' => [], 'footnote' => null]) ?>

    <?= renderLogAlertsSection(
        $weather['alerts'] ?? [],
        !empty($weather['nws_available']),
        !empty($weather['nws_enabled'])
    ) ?>

    <section class="card current-conditions">
        <h3>From the glass</h3>
        <div class="stats-grid">
            <div class="stat">
                <span class="stat-value"><?= formatTempDisplay((float) ($current['temperature_2m'] ?? 0), $config['temperature_unit']) ?></span>
                <span class="stat-label">Air</span>
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
        <h3>Orders for this watch</h3>
        <p class="action-text"><?= htmlspecialchars($info['action']) ?></p>
        <blockquote class="advisor-quote">
            <span class="advisor-name"><?= htmlspecialchars($advisor['character']) ?></span>
            <span class="advisor-verb"><?= htmlspecialchars($advisor['verb']) ?>:</span>
            <span class="advisor-text">&ldquo;<?= htmlspecialchars($advisor['quote']) ?>&rdquo;</span>
        </blockquote>
    </section>

    <section class="card scale-card">
        <h3>The marks on the glass</h3>
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
        <div class="hourly-track" role="list">
            <div class="hourly-track-inner">
            <?php foreach (array_slice($weather['hourly'], 0, 12) as $hour):
                $code = (int) ($hour['weather_code'] ?? 0);
                $rain = $hour['precip_prob'] !== null ? (int) $hour['precip_prob'] : null;
            ?>
            <div class="hour-cell" role="listitem">
                <span class="hour-cell-time"><?= date('g A', strtotime($hour['time'])) ?></span>
                <?= weatherIconSvg(weatherCodeIconKey($code), 28) ?>
                <span class="hour-cell-temp"><?= formatTempDisplay((float) ($hour['temp'] ?? 0), $config['temperature_unit']) ?></span>
                <?php if ($rain !== null && $rain > 0): ?>
                <span class="hour-cell-rain"><?= $rain ?>%</span>
                <?php else: ?>
                <span class="hour-cell-rain hour-cell-rain--dry">&nbsp;</span>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
            </div>
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
                    <?= formatTempDisplay((float) $day['high'], $config['temperature_unit']) ?>
                    / <?= formatTempDisplay((float) $day['low'], $config['temperature_unit']) ?>
                </p>
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
            <?php if ($usingNwsForecast): ?>
            Forecast from <a href="<?= htmlspecialchars(nwsPublicUrl(), ENT_QUOTES, 'UTF-8') ?>" target="_blank" rel="noopener">National Weather Service</a><?php if ($currentSource === 'metar'): ?>; current conditions from the nearest weather station<?php endif; ?>.
            <?php else: ?>
            Data from <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a><?php if (!empty($weather['nws_available'])): ?>; alerts from <a href="<?= htmlspecialchars(nwsPublicUrl(), ENT_QUOTES, 'UTF-8') ?>" target="_blank" rel="noopener">National Weather Service</a><?php endif; ?>.
            <?php endif; ?>
            Logged <?= htmlspecialchars($updated) ?>.
        </p>
        <?php if ($lake): ?>
        <p class="woods-accuracy"><?= htmlspecialchars($lake) ?> is on the book. Echo still has buoys, GLF, and radar when precision matters.</p>
        <?php else: ?>
        <p class="woods-accuracy">This station is inland of the charted lakes. The log will still read the sky; the marine products live in <a href="<?= htmlspecialchars($echoSyncUrl, ENT_QUOTES, 'UTF-8') ?>">Echo Weather</a> when you are on the water.</p>
        <?php endif; ?>
    </section>

<?php endif; ?>

</main>

<footer class="site-footer">
    <p>A Great Lakes reading of the same official weather Echo uses. Not affiliated with NOAA or the National Weather Service.</p>
    <p class="footer-links">
        <a href="<?= htmlspecialchars($echoSyncUrl, ENT_QUOTES, 'UTF-8') ?>">Use this place in Echo Weather</a>
        <?php if ($echoFrom): ?>
        &middot; <a href="../" class="echo-back">← Back to Echo Weather</a>
        <?php endif; ?>
    </p>
</footer>

<script src="../pooh/assets/js/woods.js?v=<?= woodsAssetVersion('assets/js/woods.js') ?>"></script>

</body>
</html>
