<?php
/**
 * Hundred Acre Weather — main display
 */

$config = require __DIR__ . '/config.php';
require_once __DIR__ . '/includes/weather.php';
require_once __DIR__ . '/includes/images.php';
require_once __DIR__ . '/includes/location.php';
require_once __DIR__ . '/includes/alerts.php';
require_once __DIR__ . '/includes/preferences.php';

$config = applyUnitPreferences($config);

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
$windUnit = $config['wind_unit'] ?? 'mph';
$updated = isset($weather['fetched_at']) ? date('g:i A', $weather['fetched_at']) : '';
$echoFrom = isset($_GET['from']) && $_GET['from'] === 'echo';
$echoQs = $echoFrom ? '?from=echo' : '';
$isFahrenheit = ($config['temperature_unit'] ?? 'fahrenheit') === 'fahrenheit';
$echoSyncUrl = buildEchoWeatherUrl($lat, $lon, $location['name']);
$charContext = [
    'reasons'      => $weather['level_reasons'] ?? [],
    'weather_code' => (int) ($current['weather_code'] ?? 0),
];
$forecastSource = $weather['forecast_source'] ?? 'open-meteo';
$currentSource = $weather['current_source'] ?? 'open-meteo';
$usingNwsForecast = ($forecastSource === 'nws') && !empty($weather['nws_available']);
$pageDescription = htmlspecialchars($info['message'] ?? 'A storybook reading of the sky.', ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <?= renderWoodsHead([
        'title'       => 'Hundred Acre Weather — ' . $info['name'],
        'description' => $pageDescription,
        'level'       => $level,
    ]) ?>
</head>
<body class="<?= htmlspecialchars($info['css_class']) ?> woods-page" data-location-source="<?= htmlspecialchars($locationSource) ?>">

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
            <a href="<?= htmlspecialchars($echoSyncUrl, ENT_QUOTES, 'UTF-8') ?>" class="echo-back">← Echo Weather</a>
        </nav>
    </div>
</header>

<section class="woods-location" aria-label="Choose location">
    <div class="woods-location-inner">
        <div class="woods-location-text">
            <span class="woods-location-name"><?= $name ?></span>
            <?php if ($locationSource !== 'echo'): ?>
            <span class="woods-location-note"><?= htmlspecialchars(locationSourceLabel($locationSource)) ?></span>
            <?php endif; ?>
        </div>
        <div class="woods-location-controls">
            <div class="woods-location-actions">
                <div class="woods-unit-toggle" id="woods-unit-toggle" role="group" aria-label="Temperature units">
                    <button type="button" class="woods-unit<?= $isFahrenheit ? ' is-on' : '' ?>" data-units="f" aria-pressed="<?= $isFahrenheit ? 'true' : 'false' ?>">°F</button>
                    <button type="button" class="woods-unit<?= !$isFahrenheit ? ' is-on' : '' ?>" data-units="c" aria-pressed="<?= !$isFahrenheit ? 'true' : 'false' ?>">°C</button>
                </div>
                <button type="button" class="woods-btn" id="use-my-location">Where I am</button>
            </div>
            <form class="woods-search" id="location-search-form" role="search">
                <label for="location-search-input" class="visually-hidden">Search another place</label>
                <input type="search" id="location-search-input" name="q" placeholder="Search elsewhere…" autocomplete="off" spellcheck="false">
                <div class="woods-search-results" id="location-search-results" hidden></div>
            </form>
        </div>
    </div>

    <aside class="woods-guide-nudge" id="woods-guide-nudge" hidden aria-live="polite">
        <p class="woods-guide-nudge-text"><strong>First time in the woods?</strong> The <a href="slides.php<?= $echoQs ?>">weather guide</a> explains the six levels and what the characters notice.</p>
        <button type="button" class="woods-btn woods-btn-quiet" id="woods-guide-dismiss">Very well then</button>
    </aside>
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
                    <?= renderCharacterImage($displayCharacter, 'char-image', $level, $charContext) ?>
                    <span class="character-label"><?= htmlspecialchars($displayCharacter) ?></span>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </section>

    <?= renderDayStorySection($weather['day_story'] ?? ['beats' => [], 'footnote' => null]) ?>

    <?= renderNwsAlertsSection(
        $weather['alerts'] ?? [],
        !empty($weather['nws_available']),
        !empty($weather['nws_enabled'])
    ) ?>

    <section class="card current-conditions">
        <h3>What the woods report now</h3>
        <div class="stats-grid">
            <div class="stat">
                <span class="stat-value"><?= formatTempDisplay((float) ($current['temperature_2m'] ?? 0), $config['temperature_unit']) ?></span>
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
            <?php if ($usingNwsForecast): ?>
            Forecast from <a href="<?= htmlspecialchars(nwsPublicUrl(), ENT_QUOTES, 'UTF-8') ?>" target="_blank" rel="noopener">National Weather Service</a><?php if ($currentSource === 'metar'): ?>; current conditions from the nearest weather station<?php endif; ?>.
            <?php else: ?>
            Data from <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a><?php if (!empty($weather['nws_available'])): ?>; alerts from <a href="<?= htmlspecialchars(nwsPublicUrl(), ENT_QUOTES, 'UTF-8') ?>" target="_blank" rel="noopener">National Weather Service</a><?php endif; ?>.
            <?php endif; ?>
            Updated <?= htmlspecialchars($updated) ?>.
        </p>
        <?php if ($usingNwsForecast): ?>
        <p class="woods-accuracy">For US locations the woods read the same official NWS forecast Echo Weather uses for its text outlook<?= $currentSource === 'metar' ? ', with live station observations when available' : '' ?>. Echo still has radar, METAR history, and the rest of the toolkit — worth a visit when precision matters.</p>
        <?php else: ?>
        <p class="woods-accuracy">Outside the United States the woods rely on Open-Meteo model data. For the full precision stack — METAR, radar, NWS — try <a href="<?= htmlspecialchars($echoSyncUrl, ENT_QUOTES, 'UTF-8') ?>">Echo Weather</a>.</p>
        <?php endif; ?>
    </section>

<?php endif; ?>

</main>

<footer class="site-footer">
    <?= renderAttributionFooter() ?>
    <p class="footer-links">
        <a href="slides.php<?= $echoQs ?>">View the weather guide</a>
        &middot; <a href="<?= htmlspecialchars($echoSyncUrl, ENT_QUOTES, 'UTF-8') ?>">Use this place in Echo Weather</a>
        <?php if ($echoFrom): ?>
        &middot; <a href="../" class="echo-back">← Back to Echo Weather</a>
        <?php endif; ?>
    </p>
</footer>

<div class="woodland-border bottom" aria-hidden="true"></div>

<script src="assets/js/location.js?v=<?= woodsAssetVersion('assets/js/location.js') ?>"></script>
<script src="assets/js/woods.js?v=<?= woodsAssetVersion('assets/js/woods.js') ?>"></script>

</body>
</html>
