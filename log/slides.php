<?php
/**
 * The Lakes Log — standing orders / guide deck
 */

require_once __DIR__ . '/../pooh/includes/weather.php';
require_once __DIR__ . '/../pooh/includes/preferences.php';
require_once __DIR__ . '/includes/levels.php';
require_once __DIR__ . '/includes/log.php';
require_once __DIR__ . '/includes/images.php';

$levels = getLakeLogLevels();
$characters = getLakeCharacterGuide();
$glossary = getLakeGlossary();
$echoFrom = isset($_GET['from']) && $_GET['from'] === 'echo';
$echoQs = $echoFrom ? '?from=echo' : '';
$echoReturnUrl = '../';
if (isset($_GET['lat'], $_GET['lon'])) {
    $echoReturnUrl = buildEchoWeatherUrl(
        (float) $_GET['lat'],
        (float) $_GET['lon'],
        trim((string) ($_GET['name'] ?? 'Your location'))
    );
}

$exampleLevel = 2;
$example = $levels[$exampleLevel];
$exampleQuotes = getLakeAdvisorQuotes();
$exampleAdvisor = pickLakeAdvisor($exampleLevel, ['Wind gusts above 25 mph']);
$sampleHourly = [
    ['time' => '2 PM', 'icon' => 'cloud', 'temp' => '52°', 'rain' => 10],
    ['time' => '3 PM', 'icon' => 'wind', 'temp' => '51°', 'rain' => 15],
    ['time' => '4 PM', 'icon' => 'wind', 'temp' => '50°', 'rain' => 20],
    ['time' => '5 PM', 'icon' => 'rain', 'temp' => '49°', 'rain' => 40],
    ['time' => '6 PM', 'icon' => 'rain', 'temp' => '48°', 'rain' => 45],
    ['time' => '7 PM', 'icon' => 'cloud', 'temp' => '47°', 'rain' => 25],
];
$sampleDaily = [
    ['day' => 'Sat', 'desc' => 'A lump off the mouth', 'high' => '54°', 'low' => '42°'],
    ['day' => 'Sun', 'desc' => 'Small craft weather', 'high' => '50°', 'low' => '39°'],
    ['day' => 'Mon', 'desc' => 'Gale easing', 'high' => '48°', 'low' => '37°'],
];
$slideCount = 15;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <?= renderLogHead([
        'title'       => 'The Lakes Log — Standing Orders',
        'description' => 'A fifteen-page guide to the Lakes Log: six marks on the glass, who keeps the book, and the talk of the lakes.',
        'css'         => 'assets/css/slides.css',
    ]) ?>
</head>
<body class="log-page">

<div class="slide-deck" id="deck">

    <section class="slide slide-title active" data-slide="1">
        <div class="slide-inner">
            <div class="title-illustration" style="color:#1e3a5f">
                <?= lighthouseSvg(120) ?>
            </div>
            <h1>Standing Orders for the Lakes Log</h1>
            <p class="subtitle">A ship&rsquo;s-log reading of Great Lakes weather</p>
            <p class="slide-note">The log translates the official forecast. It does not replace a warning, a GLF, or a harbor master who knows the bar.</p>
        </div>
    </section>

    <section class="slide" data-slide="2">
        <div class="slide-inner">
            <h2>Why keep the log in this talk?</h2>
            <ul class="slide-list">
                <li>Make marine weather <strong>memorable</strong> — fetch, glass, and small craft stick better than a wall of knots</li>
                <li>Translate NWS products into <strong>orders for this watch</strong></li>
                <li>Keep a <strong>calm deck</strong> without softening a gale</li>
                <li>Always send you back to <strong>official notices</strong> when they are posted</li>
            </ul>
        </div>
    </section>

    <section class="slide" data-slide="3">
        <div class="slide-inner">
            <h2>How the marks work</h2>
            <p class="intro">Six levels, the same science Echo and the woods use, written as a lake would keep them:</p>
            <div class="path-diagram">
                <?php foreach ($levels as $num => $lvl): ?>
                <div class="path-step level-<?= $num ?>">
                    <span class="path-num"><?= $num ?></span>
                    <span class="path-name"><?= htmlspecialchars($lvl['short']) ?></span>
                </div>
                <?php if ($num < 5): ?><span class="path-arrow">→</span><?php endif; ?>
                <?php endforeach; ?>
            </div>
            <p class="intro">Each mark carries a number, a name, a plate in the log, a remark from the keeper or captain, orders for the watch, and the official NWS language it stands in for.</p>
        </div>
    </section>

    <?php $slideNum = 4; foreach ($levels as $num => $lvl): ?>
    <section class="slide slide-level level-<?= $num ?>" data-slide="<?= $slideNum ?>">
        <div class="slide-inner">
            <div class="level-header">
                <span class="level-num">Level <?= $num ?></span>
                <h2><?= htmlspecialchars($lvl['name']) ?></h2>
            </div>
            <div class="level-intro">
                <div class="level-character-img">
                    <?= renderLakeLevelImage($num, 'slide-char-image') ?>
                </div>
                <p class="character-note"><em><?= htmlspecialchars($lvl['character']) ?></em> — <?= htmlspecialchars($lvl['character_role']) ?></p>
            </div>
            <div class="level-columns">
                <div>
                    <h3>On the water</h3>
                    <ul>
                        <?php foreach ($lvl['conditions'] as $cond): ?>
                        <li><?= htmlspecialchars($cond) ?></li>
                        <?php endforeach; ?>
                    </ul>
                </div>
                <div>
                    <h3>Orders for this watch</h3>
                    <p><?= htmlspecialchars($lvl['action']) ?></p>
                    <h3>Official equivalents</h3>
                    <ul class="official-list">
                        <?php foreach ($lvl['official'] as $off): ?>
                        <li><?= htmlspecialchars($off) ?></li>
                        <?php endforeach; ?>
                    </ul>
                </div>
            </div>
            <blockquote class="story-quote">&ldquo;<?= htmlspecialchars($lvl['story']) ?>&rdquo;</blockquote>
        </div>
    </section>
    <?php $slideNum++; endforeach; ?>

    <section class="slide" data-slide="10">
        <div class="slide-inner">
            <h2>Who keeps the book</h2>
            <p class="intro">The large remark and the illustration at the top of the live log follow the <strong>level</strong>. The quote under orders follows the weather itself — wind, rain, and notices on the board.</p>
            <div class="character-grid">
                <?php foreach ($characters as $name => $info): ?>
                <div class="character-card">
                    <strong><?= htmlspecialchars($name) ?></strong>
                    <span><?= htmlspecialchars($info['station']) ?>. Speaks when the forecast mentions <?= htmlspecialchars($info['notices']) ?>.</span>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>

    <section class="slide" data-slide="11">
        <div class="slide-inner">
            <h2>Watch versus Warning</h2>
            <div class="watch-warning-grid">
                <div class="ww-card">
                    <h3>Watch</h3>
                    <p class="analogy">Keep a weather eye. Trouble <em>may</em> make up on this fetch.</p>
                    <p class="official-term">Prepare. Stay informed. Small craft think twice.</p>
                </div>
                <div class="ww-card">
                    <h3>Warning</h3>
                    <p class="analogy">All hands below. The danger <em>is happening or standing in</em>.</p>
                    <p class="official-term">Take protective action now. Seek the harbor.</p>
                </div>
            </div>
            <p class="intro">The log will say it in lake talk. The badge still says Watch or Warning in the official tongue. Believe the badge.</p>
        </div>
    </section>

    <section class="slide" data-slide="12">
        <div class="slide-inner">
            <h2>Talk of the lakes</h2>
            <p class="intro">The log uses the old working words so a remark means something on the water. If a line is strange, this is the lexicon.</p>
            <table class="scene-table">
                <thead>
                    <tr><th>Word</th><th>What it means here</th></tr>
                </thead>
                <tbody>
                    <?php foreach ($glossary as $entry): ?>
                    <tr>
                        <td><?= htmlspecialchars($entry['term']) ?></td>
                        <td><?= htmlspecialchars($entry['sense']) ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </section>

    <section class="slide" data-slide="13">
        <div class="slide-inner">
            <h2>How the glass changes by level</h2>
            <table class="scene-table">
                <thead>
                    <tr><th>Level</th><th>Water</th><th>Sky</th><th>Who speaks</th><th>Tone</th></tr>
                </thead>
                <tbody>
                    <tr><td>0</td><td>Still fetch</td><td>Fair</td><td>The keeper</td><td>Lamp trimmed</td></tr>
                    <tr><td>1</td><td>A lump / chop</td><td>Making up</td><td>Deckhand or keeper</td><td>Weather eye</td></tr>
                    <tr><td>2</td><td>Whitecaps, bar muttering</td><td>Wind on the fetch</td><td>The captain</td><td>Small craft in</td></tr>
                    <tr><td>3</td><td>Gale building</td><td>Spray over the wall</td><td>The keeper</td><td>Firm hand in the book</td></tr>
                    <tr><td>4</td><td>Open lake a mistake</td><td>Storm-dark</td><td>The captain</td><td>All hands below</td></tr>
                    <tr><td>5</td><td>No second harbor</td><td>Destructive</td><td>The captain</td><td>An order, not a remark</td></tr>
                </tbody>
            </table>
        </div>
    </section>

    <section class="slide" data-slide="14">
        <div class="slide-inner slide-inner-wide">
            <h2>What the live log shows</h2>
            <p class="intro">The live page uses these cards, in this order. Numbers change with your station; this is a static example at Level <?= $exampleLevel ?>.</p>
            <div class="sample-live-forecast" aria-label="Example log layout">
                <section class="sample-card sample-hero-card">
                    <div class="sample-level-badge">Level <?= $exampleLevel ?></div>
                    <div class="sample-hero-grid">
                        <div class="sample-hero-text">
                            <p class="sample-location">Lake Michigan — Your station</p>
                            <h3 class="sample-level-name"><?= htmlspecialchars($example['name']) ?></h3>
                            <p class="sample-level-message"><?= htmlspecialchars($example['message']) ?></p>
                            <p class="sample-story-line"><em><?= htmlspecialchars($example['story']) ?></em></p>
                            <p class="sample-character-role"><?= htmlspecialchars($example['character']) ?> &mdash; <?= htmlspecialchars($example['character_role']) ?></p>
                        </div>
                        <div class="sample-hero-visual">
                            <?= weatherIconSvg($example['icon'], 56) ?>
                            <?= renderLakeLevelImage($exampleLevel, 'slide-char-image sample-hero-char') ?>
                        </div>
                    </div>
                </section>

                <section class="sample-card">
                    <h3>Watch bill</h3>
                    <div class="sample-day-story">
                        <p class="sample-day-story-beat">
                            <strong>This morning:</strong>
                            Begins as <em>Fine for the Breakwater</em> (Level 0).
                            <span class="sample-day-story-aside"><em>The keeper</em> &mdash; has the lamp trimmed and nothing particular to report.</span>
                        </p>
                        <p class="sample-day-story-beat">
                            <strong>This afternoon:</strong>
                            May become <em><?= htmlspecialchars($example['name']) ?></em> (Level <?= $exampleLevel ?>).
                            <span class="sample-day-story-aside"><em><?= htmlspecialchars($example['character']) ?></em> &mdash; <?= htmlspecialchars($example['character_role']) ?>.</span>
                        </p>
                    </div>
                </section>

                <section class="sample-card">
                    <h3>Orders for this watch</h3>
                    <p class="sample-action-text"><?= htmlspecialchars($example['action']) ?></p>
                    <blockquote class="sample-advisor-quote">
                        <span class="sample-advisor-name"><?= htmlspecialchars($exampleAdvisor['character']) ?></span>
                        <span class="sample-advisor-verb"><?= htmlspecialchars($exampleAdvisor['verb']) ?>:</span>
                        <span class="sample-advisor-text">&ldquo;<?= htmlspecialchars($exampleAdvisor['quote']) ?>&rdquo;</span>
                    </blockquote>
                </section>

                <section class="sample-card">
                    <h3>The next few hours</h3>
                    <div class="sample-hourly-track">
                        <div class="sample-hourly-track-inner">
                            <?php foreach ($sampleHourly as $hour): ?>
                            <div class="sample-hour-cell">
                                <span class="sample-hour-time"><?= htmlspecialchars($hour['time']) ?></span>
                                <?= weatherIconSvg($hour['icon'], 28) ?>
                                <span class="sample-hour-temp"><?= htmlspecialchars($hour['temp']) ?></span>
                                <?php if ($hour['rain'] > 0): ?>
                                <span class="sample-hour-rain"><?= (int) $hour['rain'] ?>%</span>
                                <?php endif; ?>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </section>
            </div>
            <p class="intro"><a href="index.php<?= $echoQs ?>">View the live log &rarr;</a></p>
        </div>
    </section>

    <section class="slide" data-slide="15">
        <div class="slide-inner">
            <h2>When the book is not enough</h2>
            <ul class="slide-list resources">
                <li><a href="https://www.weather.gov/" target="_blank" rel="noopener">National Weather Service</a> — watches, warnings, and the marine forecast</li>
                <li><a href="https://www.weather.gov/greatlakes/" target="_blank" rel="noopener">NWS Great Lakes</a> — GLF and lake-by-lake discussion</li>
                <li><a href="https://www.ndbc.noaa.gov/" target="_blank" rel="noopener">NDBC buoys</a> — the glass out on the water</li>
                <li>U.S. Coast Guard / local harbor master</li>
                <li>Echo Weather for radar, METAR, and the full marine panel</li>
            </ul>
            <p class="slide-note">Log the time. A remark without a time is a rumor.</p>
            <p class="intro"><a href="index.php<?= $echoQs ?>">← Back to the live log</a></p>
        </div>
    </section>

</div>

<nav class="slide-nav" aria-label="Guide navigation">
    <button id="prev-btn" aria-label="Previous page">←</button>
    <span id="slide-counter">1 / <?= $slideCount ?></span>
    <button id="next-btn" aria-label="Next page">→</button>
</nav>

<div class="top-nav">
    <a href="index.php<?= $echoQs ?>">Live Log</a>
    <a href="<?= htmlspecialchars($echoReturnUrl, ENT_QUOTES, 'UTF-8') ?>" class="echo-back">← Echo Weather</a>
</div>

<script src="assets/js/slides.js?v=<?= logAssetVersion('assets/js/slides.js') ?>"></script>
</body>
</html>
