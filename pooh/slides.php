<?php
/**
 * Hundred Acre Weather — slide deck / guide
 */

require_once __DIR__ . '/includes/levels.php';
require_once __DIR__ . '/includes/images.php';
require_once __DIR__ . '/includes/preferences.php';

$levels = getWeatherLevels();
$characters = getCharacterGuide();
$echoFrom = isset($_GET['from']) && $_GET['from'] === 'echo';
$echoQs = $echoFrom ? '?from=echo' : '';

$exampleLevel = 2;
$example = $levels[$exampleLevel];
$exampleQuotes = getAdvisorQuotes();
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
        <div class="slide-inner">
            <h2>What the live forecast shows</h2>
            <p class="intro">The forecast opens with the current level, then <strong>Today&rsquo;s story</strong> narrates how the day may unfold — morning, afternoon, evening — with character asides when official alerts apply.</p>
            <div class="sample-forecast">
                <div class="sample-section">
                    <p class="sample-label">Today&rsquo;s story</p>
                    <p><strong>This morning:</strong> Begins as a <em>Fine Day for a Walk</em> (Level 0). <em>Pooh</em> &mdash; considers whether it is a good day for doing Nothing.</p>
                    <p><strong>This afternoon:</strong> May become a <em><?= htmlspecialchars($example['name']) ?></em> (Level <?= $exampleLevel ?>). <em><?= htmlspecialchars($example['character']) ?></em> &mdash; <?= htmlspecialchars($example['character_role']) ?>.</p>
                    <p class="sample-quote"><strong>Rabbit insists:</strong> <?= htmlspecialchars($exampleQuotes['Rabbit'][2][0] ?? 'Bring the garden chairs in.') ?></p>
                </div>
                <div class="sample-section">
                    <p class="sample-label">Level summary (right now)</p>
                    <p><span class="sample-badge">Level <?= $exampleLevel ?></span></p>
                    <p class="sample-level-name"><?= htmlspecialchars($example['name']) ?></p>
                    <p><?= htmlspecialchars($example['message']) ?></p>
                </div>
                <div class="sample-section">
                    <p class="sample-label">National Weather Service alerts</p>
                    <p>Active watches, warnings, and advisories when they apply — grouped by type with full details and links.</p>
                </div>
                <div class="sample-section">
                    <p class="sample-label">What the woods report now</p>
                    <div class="sample-data">
                        <span>Now 58&deg;</span>
                        <span>Wind 12 mph</span>
                        <span>Gusts 28 mph</span>
                        <span>Humidity 71%</span>
                    </div>
                </div>
                <div class="sample-section">
                    <p class="sample-label">The next few hours &amp; looking ahead</p>
                    <p>An hourly strip (time, icon, temperature, rain chance) and three daily cards with high/low, sky description, and sunset.</p>
                </div>
            </div>
            <div class="sample-data sample-data-foot">
                <span>Example: Wind Advisory</span>
                <span>High 72&deg; / Low 54&deg;</span>
                <span>Sunset 7:42 p.m.</span>
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
