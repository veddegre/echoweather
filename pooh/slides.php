<?php
/**
 * Hundred Acre Weather — slide deck / guide
 */

require_once __DIR__ . '/includes/levels.php';
require_once __DIR__ . '/includes/images.php';
require_once __DIR__ . '/includes/preferences.php';
require_once __DIR__ . '/includes/weather.php';

$levels = getWeatherLevels();
$characters = getCharacterGuide();
$echoFrom = isset($_GET['from']) && $_GET['from'] === 'echo';
$echoQs = $echoFrom ? '?from=echo' : '';

$exampleLevel = 2;
$example = $levels[$exampleLevel];
$exampleQuotes = getAdvisorQuotes();
$exampleAdvisor = pickAdvisor($exampleLevel, ['Wind gusts above 25 mph']);
$sampleHourly = [
    ['time' => '2 PM', 'icon' => 'cloud', 'temp' => '62°', 'rain' => 15],
    ['time' => '3 PM', 'icon' => 'cloud', 'temp' => '61°', 'rain' => 20],
    ['time' => '4 PM', 'icon' => 'rain', 'temp' => '59°', 'rain' => 45],
    ['time' => '5 PM', 'icon' => 'rain', 'temp' => '58°', 'rain' => 55],
    ['time' => '6 PM', 'icon' => 'rain', 'temp' => '57°', 'rain' => 60],
    ['time' => '7 PM', 'icon' => 'cloud', 'temp' => '56°', 'rain' => 30],
];
$sampleDaily = [
    ['day' => 'Sat', 'desc' => 'Partly cloudy', 'high' => '72°', 'low' => '54°', 'sunset' => '7:42 PM'],
    ['day' => 'Sun', 'desc' => 'Showers likely', 'high' => '68°', 'low' => '52°', 'sunset' => '7:40 PM'],
    ['day' => 'Mon', 'desc' => 'Breezy', 'high' => '65°', 'low' => '48°', 'sunset' => '7:38 PM'],
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <?= renderWoodsHead([
        'title'       => 'Hundred Acre Weather Guide',
        'description' => 'A fourteen-page guide to the Hundred Acre Weather scale — from a fine day for a walk to a Hundred Acre emergency.',
        'css'         => 'assets/css/slides.css',
    ]) ?>
</head>
<body class="woods-page">

<div class="slide-deck" id="deck">

    <!-- Slide 1 -->
    <section class="slide slide-title active" data-slide="1">
        <div class="slide-inner">
            <div class="title-illustration">
                <?= renderFramedImage(
                    'assets/images/characters/hundred-acre-wood.jpg',
                    'Map of the Hundred Acre Wood by E. H. Shepard (1926)',
                    'title-map',
                    'title-map-frame'
                ) ?>
            </div>
            <h1>Welcome to the Hundred Acre Weather</h1>
            <p class="subtitle">A friendly way to understand unfriendly weather</p>
            <p class="slide-note">Inspired by A. A. Milne&rsquo;s 1926 public-domain work.<br>Not affiliated with or endorsed by Disney.</p>
        </div>
    </section>

    <!-- Slide 2 -->
    <section class="slide" data-slide="2">
        <div class="slide-inner">
            <h2>Why a themed weather system?</h2>
            <ul class="slide-list">
                <li>Make weather information <strong>memorable</strong></li>
                <li>Translate technical alerts into <strong>understandable actions</strong></li>
                <li>Maintain a <strong>calm tone</strong> without minimizing serious danger</li>
                <li>Always encourage consulting <strong>official weather alerts</strong></li>
            </ul>
        </div>
    </section>

    <!-- Slide 3 -->
    <section class="slide" data-slide="3">
        <div class="slide-inner">
            <h2>How the system works</h2>
            <p class="intro">Six levels along a path through the woods:</p>
            <div class="path-diagram">
                <?php foreach ($levels as $num => $lvl): ?>
                <div class="path-step level-<?= $num ?>">
                    <span class="path-num"><?= $num ?></span>
                    <span class="path-name"><?= htmlspecialchars($lvl['short']) ?></span>
                </div>
                <?php if ($num < 5): ?><span class="path-arrow">→</span><?php endif; ?>
                <?php endforeach; ?>
            </div>
            <p class="intro">Each level shows a number, icon, plain-language summary, story, character note, recommended action, and official equivalents — plus live conditions, alerts, hourly outlook, and a three-day look ahead.</p>
        </div>
    </section>

    <!-- Slides 4-9: One per level -->
    <?php $slideNum = 4; foreach ($levels as $num => $lvl): ?>
    <section class="slide slide-level level-<?= $num ?>" data-slide="<?= $slideNum ?>">
        <div class="slide-inner">
            <div class="level-header">
                <span class="level-num">Level <?= $num ?></span>
                <h2><?= htmlspecialchars($lvl['name']) ?></h2>
            </div>
            <div class="level-intro">
                <?php if ($lvl['character']): ?>
                <div class="level-character-img">
                    <?= renderCharacterImage($lvl['character'], 'slide-char-image', $num) ?>
                </div>
                <p class="character-note"><em><?= htmlspecialchars($lvl['character']) ?></em> — <?= htmlspecialchars($lvl['character_role']) ?></p>
                <?php endif; ?>
            </div>
            <div class="level-columns">
                <div>
                    <h3>Possible conditions</h3>
                    <ul>
                        <?php foreach ($lvl['conditions'] as $cond): ?>
                        <li><?= htmlspecialchars($cond) ?></li>
                        <?php endforeach; ?>
                    </ul>
                </div>
                <div>
                    <h3>What to do</h3>
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

    <!-- Slide 10 -->
    <section class="slide" data-slide="10">
        <div class="slide-inner">
            <h2>Who speaks when</h2>
            <p class="intro">This is not the six levels. Each level has its own hero illustration (see the level slides and the live forecast). These characters are <strong>advisors</strong> — the woods picks one to quote based on what is actually happening: wind, rain, clouds, official alerts, and the like.</p>
            <div class="character-grid">
                <?php foreach ($characters as $name => $info): ?>
                <div class="character-card">
                    <?= renderCharacterImage($name, 'slide-char-image small') ?>
                    <strong><?= htmlspecialchars($name) ?></strong>
                    <span>may speak when the forecast mentions <?= htmlspecialchars($info['notices']) ?></span>
                </div>
                <?php endforeach; ?>
            </div>
            <p class="intro">The quote under &ldquo;What you should do&rdquo; follows these cues. The large illustration at the top follows the level.</p>
        </div>
    </section>

    <!-- Slide 11 -->
    <section class="slide" data-slide="11">
        <div class="slide-inner">
            <h2>Watch versus Warning</h2>
            <div class="watch-warning-grid">
                <div class="ww-card">
                    <h3>Watch</h3>
                    <p class="analogy">Rabbit is gathering supplies because troublesome weather <em>may</em> arrive.</p>
                    <p class="official-term">Prepare and stay informed.</p>
                </div>
                <div class="ww-card">
                    <h3>Warning</h3>
                    <p class="analogy">Christopher Robin is calling everyone inside because the danger <em>is happening or approaching</em>.</p>
                    <p class="official-term">Take protective action now.</p>
                </div>
            </div>
            <p class="intro">Official terminology remains prominent — the theme translates, never replaces, critical safety language.</p>
        </div>
    </section>

    <!-- Slide 12 -->
    <section class="slide" data-slide="12">
        <div class="slide-inner">
            <h2>How the scene changes by level</h2>
            <table class="scene-table">
                <thead>
                    <tr><th>Level</th><th>Sky</th><th>Motion</th><th>Characters</th><th>Tone</th></tr>
                </thead>
                <tbody>
                    <tr><td>0</td><td>Pale blue</td><td>Still leaves</td><td>Pooh walking</td><td>Warm, open</td></tr>
                    <tr><td>1</td><td>Soft gray clouds</td><td>Light drift</td><td>Pooh or Eeyore</td><td>Mild caution</td></tr>
                    <tr><td>2</td><td>Gray-blue</td><td>Swaying branches</td><td>Piglet with scarf</td><td>Active care</td></tr>
                    <tr><td>3</td><td>Dark clouds, rain</td><td>Rain on the paths</td><td>Owl</td><td>Serious, planned</td></tr>
                    <tr><td>4</td><td>Storm-dark sky</td><td>Rain and wind</td><td>Christopher Robin at the green door</td><td>Come to the house</td></tr>
                    <tr><td>5</td><td>Storm over the Wood</td><td>Heavy rain</td><td>Christopher Robin on the stairs</td><td>Inside, now</td></tr>
                </tbody>
            </table>
        </div>
    </section>

    <!-- Slide 13 -->
    <section class="slide" data-slide="13">
        <div class="slide-inner slide-inner-wide">
            <h2>What the live forecast shows</h2>
            <p class="intro">The live page uses the same cards and headings below, in this order. Illustrations and numbers change with your location; this is a static example at Level <?= $exampleLevel ?>.</p>
            <div class="sample-live-forecast" aria-label="Example forecast layout">
                <section class="sample-card sample-hero-card">
                    <div class="sample-level-badge">Level <?= $exampleLevel ?></div>
                    <div class="sample-hero-grid">
                        <div class="sample-hero-text">
                            <p class="sample-location">Hundred Acre Wood</p>
                            <h3 class="sample-level-name"><?= htmlspecialchars($example['name']) ?></h3>
                            <p class="sample-level-message"><?= htmlspecialchars($example['message']) ?></p>
                            <p class="sample-story-line"><em><?= htmlspecialchars($example['story']) ?></em></p>
                            <p class="sample-character-role"><?= htmlspecialchars($example['character']) ?> &mdash; <?= htmlspecialchars($example['character_role']) ?></p>
                        </div>
                        <div class="sample-hero-visual">
                            <?= weatherIconSvg($example['icon'], 56) ?>
                            <?= renderCharacterImage($example['character'], 'slide-char-image sample-hero-char', $exampleLevel) ?>
                        </div>
                    </div>
                </section>

                <section class="sample-card">
                    <h3>Today&rsquo;s story</h3>
                    <div class="sample-day-story">
                        <p class="sample-day-story-beat">
                            <strong>This morning:</strong>
                            Begins as a <em>Fine Day for a Walk</em> (Level 0).
                            <span class="sample-day-story-aside"><em>Pooh</em> &mdash; considers whether it is a good day for doing Nothing.</span>
                        </p>
                        <p class="sample-day-story-beat">
                            <strong>This afternoon:</strong>
                            May become a <em><?= htmlspecialchars($example['name']) ?></em> (Level <?= $exampleLevel ?>).
                            <span class="sample-day-story-aside"><em><?= htmlspecialchars($example['character']) ?></em> &mdash; <?= htmlspecialchars($example['character_role']) ?>.</span>
                        </p>
                    </div>
                    <p class="sample-day-story-footnote">
                        <strong>Rabbit insists:</strong>
                        <?= htmlspecialchars($exampleQuotes['Rabbit'][$exampleLevel][0] ?? 'Bring the garden chairs in.') ?>
                    </p>
                </section>

                <section class="sample-card sample-nws-card">
                    <h3>National Weather Service alerts</h3>
                    <p class="sample-nws-count">1 active</p>
                    <div class="sample-nws-chips">
                        <span class="sample-nws-chip">1 Advisory</span>
                    </div>
                    <article class="sample-nws-alert">
                        <span class="sample-nws-badge">ADVISORY</span>
                        <p class="sample-nws-event">Wind Advisory</p>
                        <p class="sample-nws-headline">Southwest winds 15 to 25 mph with gusts up to 35 mph this afternoon.</p>
                    </article>
                </section>

                <section class="sample-card">
                    <h3>What the woods report now</h3>
                    <div class="sample-stats-grid">
                        <div class="sample-stat">
                            <span class="sample-stat-value">58&deg;</span>
                            <span class="sample-stat-label">Temperature</span>
                        </div>
                        <div class="sample-stat">
                            <span class="sample-stat-value">12 mph</span>
                            <span class="sample-stat-label">Wind</span>
                        </div>
                        <div class="sample-stat">
                            <span class="sample-stat-value">28 mph</span>
                            <span class="sample-stat-label">Gusts</span>
                        </div>
                        <div class="sample-stat">
                            <span class="sample-stat-value">71%</span>
                            <span class="sample-stat-label">Humidity</span>
                        </div>
                    </div>
                    <p class="sample-condition-desc">Partly cloudy</p>
                    <ul class="sample-reasons-list">
                        <li>Wind gusts above 25 mph</li>
                    </ul>
                </section>

                <section class="sample-card">
                    <h3>What you should do</h3>
                    <p class="sample-action-text"><?= htmlspecialchars($example['action']) ?></p>
                    <blockquote class="sample-advisor-quote">
                        <span class="sample-advisor-name"><?= htmlspecialchars($exampleAdvisor['character']) ?></span>
                        <span class="sample-advisor-verb"><?= htmlspecialchars($exampleAdvisor['verb']) ?>:</span>
                        <span class="sample-advisor-text">&ldquo;<?= htmlspecialchars($exampleAdvisor['quote']) ?>&rdquo;</span>
                    </blockquote>
                </section>

                <section class="sample-card">
                    <h3>The path through the woods</h3>
                    <div class="sample-scale-path">
                        <?php foreach ($levels as $num => $lvl): ?>
                        <div class="sample-scale-step<?= $num === $exampleLevel ? ' is-active' : '' ?><?= $num <= $exampleLevel ? ' is-reached' : '' ?>">
                            <span class="sample-scale-num"><?= $num ?></span>
                            <span class="sample-scale-short"><?= htmlspecialchars($lvl['short']) ?></span>
                        </div>
                        <?php if ($num < 5): ?><span class="sample-scale-arrow">&rarr;</span><?php endif; ?>
                        <?php endforeach; ?>
                    </div>
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
                                <?php else: ?>
                                <span class="sample-hour-rain sample-hour-rain--dry">&nbsp;</span>
                                <?php endif; ?>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </section>

                <section class="sample-card">
                    <h3>Looking ahead</h3>
                    <div class="sample-daily-grid">
                        <?php foreach ($sampleDaily as $day): ?>
                        <article class="sample-day-card">
                            <p class="sample-day-name"><?= htmlspecialchars($day['day']) ?></p>
                            <p class="sample-day-desc"><?= htmlspecialchars($day['desc']) ?></p>
                            <p class="sample-day-temps"><?= htmlspecialchars($day['high']) ?> / <?= htmlspecialchars($day['low']) ?></p>
                            <p class="sample-day-sunset">Sunset <?= htmlspecialchars($day['sunset']) ?></p>
                        </article>
                        <?php endforeach; ?>
                    </div>
                </section>

                <section class="sample-card">
                    <h3>Official equivalents for this level</h3>
                    <ul class="sample-official-list">
                        <?php foreach ($example['official'] as $off): ?>
                        <li><?= htmlspecialchars($off) ?></li>
                        <?php endforeach; ?>
                    </ul>
                </section>
            </div>
            <p class="intro"><a href="index.php<?= $echoQs ?>">View the live forecast &rarr;</a></p>
        </div>
    </section>

    <!-- Slide 14 -->
    <section class="slide" data-slide="14">
        <div class="slide-inner">
            <h2>Weather safety resources</h2>
            <ul class="slide-list resources">
                <li><a href="https://www.weather.gov/" target="_blank" rel="noopener">National Weather Service</a></li>
                <li><a href="https://www.ready.gov/" target="_blank" rel="noopener">Ready.gov — emergency preparedness</a></li>
                <li>Local emergency management</li>
                <li>Campus or organizational emergency alerts</li>
                <li>Radar and lightning information</li>
            </ul>
            <p class="slide-note">Always note the date and time information was last updated.</p>
            <p class="intro"><a href="index.php<?= $echoQs ?>">← Back to live forecast</a></p>
        </div>
    </section>

</div>

<nav class="slide-nav" aria-label="Slide navigation">
    <button id="prev-btn" aria-label="Previous slide">←</button>
    <span id="slide-counter">1 / 14</span>
    <button id="next-btn" aria-label="Next slide">→</button>
</nav>

<div class="top-nav">
    <a href="index.php<?= $echoQs ?>">Live Forecast</a>
    <?php if ($echoFrom): ?>
    <a href="../" class="echo-back">← Echo Weather</a>
    <?php endif; ?>
</div>

<script src="assets/js/slides.js?v=<?= woodsAssetVersion('assets/js/slides.js') ?>"></script>
</body>
</html>
