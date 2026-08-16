<?php
/**
 * The Hundred Acre Weather Scale — level definitions
 */

function getWeatherLevels(): array
{
    return [
        0 => [
            'name'        => 'A Fine Day for a Walk',
            'short'       => 'Fine Day',
            'character'   => 'Pooh',
            'character_role' => 'considers whether it is a good day for doing Nothing',
            'message'     => 'The sky is behaving itself. So far.',
            'story'       => 'It was the sort of morning when even the bees seemed in no hurry, and a small smackerel of something seemed entirely reasonable.',
            'action'      => 'Walk, sit, or wander. If you meet a Heffalump, do not worry — they are probably imaginary.',
            'conditions'  => [
                'Clear or mostly clear skies',
                'Comfortable temperatures',
                'Light breeze or calm air',
            ],
            'official'    => ['No active alerts'],
            'css_class'   => 'level-0',
            'icon'        => 'sun',
        ],
        1 => [
            'name'        => 'A Slightly Bothersome Day',
            'short'       => 'Bothersome',
            'character'   => 'Pooh',
            'character_role' => 'looks at the sky with quiet suspicion',
            'message'     => 'The weather has opinions, but they are small ones.',
            'story'       => 'Clouds gathered politely, as if unsure whether they intended to stay.',
            'action'      => 'A light coat, sensible shoes, and no adventures that require heroic optimism.',
            'conditions'  => [
                'Clouds or overcast skies',
                'Light drizzle or flurries',
                'Mild heat or chill',
                'Light fog',
            ],
            'official'    => ['No alert', 'Special Weather Statement (minor)'],
            'css_class'   => 'level-1',
            'icon'        => 'cloud',
        ],
        2 => [
            'name'        => 'A Rather Blustery Day',
            'short'       => 'Blustery',
            'character'   => 'Piglet',
            'character_role' => 'holds onto a scarf and tries to look brave',
            'message'     => 'The wind has found things to push about.',
            'story'       => 'Branches swayed. Scarves were consulted. Umbrellas were treated with deep mistrust.',
            'action'      => 'Hold onto hats. Bring small things indoors. Allow extra time — blustery days are never in a hurry.',
            'conditions'  => [
                'Wind advisory conditions',
                'Gusts affecting outdoor objects',
                'Steady rain or moderate snowfall',
                'Isolated thunderstorms possible',
            ],
            'official'    => ['Wind Advisory', 'Winter Weather Advisory (light)', 'Special Weather Statement'],
            'css_class'   => 'level-2',
            'icon'        => 'wind',
        ],
        3 => [
            'name'        => 'A Very Wet and Worrisome Day',
            'short'       => 'Worrisome',
            'character'   => 'Owl',
            'character_role' => 'consults the map, the forecast, and his own dignity',
            'message'     => 'The paths are thinking about becoming rivers.',
            'story'       => 'Owl spread the map on the table. The map did not look entirely pleased with the afternoon.',
            'action'      => 'Postpone picnics. Avoid puddles deeper than your boots. Check again after tea.',
            'conditions'  => [
                'Heavy rain or prolonged storms',
                'Flooding risk',
                'Thunderstorms',
                'Difficult travel conditions',
            ],
            'official'    => ['Flood Watch', 'Severe Thunderstorm Watch', 'Winter Storm Warning (moderate)', 'Heat Advisory'],
            'css_class'   => 'level-3',
            'icon'        => 'rain',
        ],
        4 => [
            'name'        => 'Everyone to Christopher Robin\'s House',
            'short'       => 'Shelter',
            'character'   => 'Christopher Robin',
            'character_role' => 'opens the door and means it',
            'message'     => 'This is not a day for the middle of the woods.',
            'story'       => 'Christopher Robin\'s house had the right sort of walls for a day like this, and the right sort of company.',
            'action'      => 'Indoors, together, until someone official says otherwise. Official counts as sensible.',
            'conditions'  => [
                'Severe thunderstorms',
                'Damaging wind or ice storm',
                'Extreme heat or cold',
                'Dangerous travel',
            ],
            'official'    => ['Severe Thunderstorm Warning', 'Winter Storm Warning', 'Ice Storm Warning', 'Extreme Heat/Cold Warning'],
            'css_class'   => 'level-4',
            'icon'        => 'storm',
        ],
        5 => [
            'name'        => 'The Hundred Acre Emergency',
            'short'       => 'Emergency',
            'character'   => 'Christopher Robin',
            'character_role' => 'leads the way down the stairs — bump, bump, bump — and will not wait',
            'message'     => 'Christopher Robin is calling everyone inside. At once.',
            'story'       => 'There was no time for stories, or honey, or even a small smackerel — only for the sturdiest walls in the Wood, and staying exactly where you were told.',
            'action'      => 'Come to the lowest floor, the innermost room, far from windows. Do precisely what the officials say — as Christopher Robin would insist, without argument.',
            'conditions'  => [
                'Tornado warning',
                'Flash flood emergency',
                'Destructive storm in progress',
                'Life-threatening conditions',
            ],
            'official'    => ['Tornado Warning', 'Flash Flood Emergency', 'Hurricane Warning (landfall)', 'Life-threatening event'],
            'css_class'   => 'level-5',
            'icon'        => 'house',
        ],
    ];
}

function getCharacterGuide(): array
{
    return [
        'Pooh' => [
            'notices' => 'comfort, temperature, and whether a walk is worth the effort',
            'icon'    => 'thermometer',
        ],
        'Piglet' => [
            'notices' => 'wind, thunder, and anything that rustles ominously',
            'icon'    => 'wind',
        ],
        'Rabbit' => [
            'notices' => 'garden furniture, schedules, and things that ought to be tied down',
            'icon'    => 'calendar',
        ],
        'Owl' => [
            'notices' => 'forecasts, watches, warnings, and the general seriousness of things',
            'icon'    => 'document',
        ],
        'Eeyore' => [
            'notices' => 'prolonged rain, gray skies, and the feeling that the day has given up',
            'icon'    => 'rain-cloud',
        ],
        'Christopher Robin' => [
            'notices' => 'when everyone should stop exploring and come inside',
            'icon'    => 'house',
        ],
    ];
}

/**
 * Alternate literary lines for the live forecast.
 * The first entry of each pool matches the canonical text in getWeatherLevels().
 * Slides keep the canonical line; the live page rotates through the rest.
 */
function getLevelSayingPools(): array
{
    return [
        0 => [
            'message' => [
                'The sky is behaving itself. So far.',
                'A day with no particular opinions, which is a kindness.',
                'Nothing urgent is happening, and that is the point.',
                'The weather appears to have taken the morning off.',
            ],
            'story' => [
                'It was the sort of morning when even the bees seemed in no hurry, and a small smackerel of something seemed entirely reasonable.',
                'The sun came through the trees in a thoughtful way, as if it had all the time in the world.',
                'It was a day for wandering without a destination, which is the best sort of wandering.',
                'Nobody had made any plans, and the weather approved of this arrangement.',
            ],
            'character_role' => [
                'considers whether it is a good day for doing Nothing',
                'wonders if a small smackerel might improve an already excellent morning',
                'approves of the sky, which is being unusually cooperative',
                'thinks a walk would be just the thing, or a sit, which is also a kind of walk',
            ],
        ],
        1 => [
            'message' => [
                'The weather has opinions, but they are small ones.',
                'Not a crisis. Merely a suggestion from the clouds.',
                'The sky is thinking, which is not the same as deciding.',
                'Slightly bothersome, in the way that a pebble in a shoe is bothersome.',
            ],
            'story' => [
                'Clouds gathered politely, as if unsure whether they intended to stay.',
                'The sky put on its considering face, which is not quite rain and not quite not.',
                'A grey thought crossed the woods, then sat down to see what would happen.',
                'It was the sort of weather that makes one glance up, then continue anyway.',
            ],
            'character_role' => [
                'looks at the sky with quiet suspicion',
                'is not entirely sure the clouds have made up their minds',
                [
                    'text' => 'thinks a coat would be wise, but hopes it will not be necessary',
                    'when' => ['cool'],
                ],
                'regards the weather as mildly opinionated',
                'considers a short walk, provided nobody expects him to hurry',
            ],
            'action' => [
                [
                    'text' => 'A light coat, sensible shoes, and no adventures that require heroic optimism.',
                    'when' => ['cool'],
                ],
                'Sensible shoes, and no adventures that require heroic optimism.',
                'A glance at the sky now and then, and no adventures that require heroic optimism.',
            ],
        ],
        2 => [
            'message' => [
                'The wind has found things to push about.',
                'Hats are having a difficult morning.',
                'The trees have begun to argue with the air.',
                'Blustery, as anyone with ears can tell you.',
            ],
            'story' => [
                [
                    'text' => 'Branches swayed. Scarves were consulted. Umbrellas were treated with deep mistrust.',
                    'when' => ['cool'],
                ],
                'The wind arrived without knocking, which is typical of wind.',
                'Leaves went on important errands of their own, and did not come back.',
                'It was a day for holding onto things, including one\'s courage.',
            ],
            'character_role' => [
                [
                    'text' => 'holds onto a scarf and tries to look brave',
                    'when' => ['cool'],
                ],
                'hopes the wind will notice someone else instead',
                'keeps very close to something sturdy',
                'finds it rather blustery, and does not mind saying so',
            ],
        ],
        3 => [
            'message' => [
                'The paths are thinking about becoming rivers.',
                'This is weather that requires a plan, and possibly a second plan.',
                [
                    'text' => 'The woods are wet, and not in a poetic way.',
                    'when' => ['wet'],
                ],
                [
                    'text' => 'Dignity is difficult to maintain in this sort of rain.',
                    'when' => ['wet'],
                ],
            ],
            'story' => [
                'Owl spread the map on the table. The map did not look entirely pleased with the afternoon.',
                [
                    'text' => 'The rain had opinions, and they were not small ones.',
                    'when' => ['wet'],
                ],
                [
                    'text' => 'Puddles conferred with one another and agreed to become larger.',
                    'when' => ['wet'],
                ],
                'It was the sort of day that makes indoor chairs look particularly intelligent.',
            ],
            'character_role' => [
                'consults the map, the forecast, and his own dignity',
                'considers this weather a matter for serious discussion',
                [
                    'text' => 'has several thoughts, all of them damp',
                    'when' => ['wet'],
                ],
                'regards the afternoon as officially inconvenient',
            ],
        ],
        4 => [
            'message' => [
                'This is not a day for the middle of the woods.',
                'The house is the correct answer.',
                'Adventures can wait. Walls cannot.',
                'Come in. The weather will not be reasoned with.',
            ],
            'story' => [
                'Christopher Robin\'s house had the right sort of walls for a day like this, and the right sort of company.',
                'The woods were doing something they ought not to, and the house knew it.',
                'There was a knocking of shutters, and a gathering of everyone who mattered.',
                'It was a day for being together, which is the sensible sort of bravery.',
            ],
            'character_role' => [
                'opens the door and means it',
                'would like everyone nearer the house',
                'is counting heads, not adventures',
                'has decided that indoors is the only proper place',
            ],
        ],
        5 => [
            'message' => [
                'Christopher Robin is calling everyone inside. At once.',
                'This is not a story. This is an instruction.',
                'The woods are not safe. The house is.',
                'Do not wait for a better moment. There isn\'t one.',
            ],
            'story' => [
                'There was no time for stories, or honey, or even a small smackerel — only for the sturdiest walls in the Wood, and staying exactly where you were told.',
                'The stairs went bump, bump, bump, and that was the only journey anyone was taking.',
                'Nobody argued. Even the weather, for once, was not the most important thing in the room.',
                'It was the sort of hour when being together, and being low, and being still, was the whole of the plan.',
            ],
            'character_role' => [
                'leads the way down the stairs — bump, bump, bump — and will not wait',
                'has opened the door and will not take no for an answer',
                'is not asking, and is not repeating himself more than twice',
                'means the lowest room, and he means now',
            ],
        ],
    ];
}

/**
 * Extra asides for characters who are commenting on a level that is not "theirs".
 */
function getCharacterAsidePools(): array
{
    $roles = getLevelSayingPools();

    return [
        'Pooh' => [
            0 => $roles[0]['character_role'],
            1 => $roles[1]['character_role'],
        ],
        'Piglet' => [
            2 => [
                'finds it rather blustery',
                'would prefer to be smaller and less noticeable',
                'is holding on, which seems the main thing',
                [
                    'text' => 'hopes very much that the scarf will stay put',
                    'when' => ['cool'],
                ],
            ],
            3 => [
                'wishes he were somewhere smaller and drier',
                'does not like the sound of that rumble at all',
                'has decided that bravery can wait indoors',
            ],
        ],
        'Rabbit' => [
            2 => [
                'is already thinking about the garden chairs',
                'has a list, and the list has begun to worry',
                'would like everyone to put things away now, please',
            ],
            3 => [
                'has begun reorganizing the afternoon',
                'considers the schedule officially cancelled',
                'is checking the shed, the gate, and then the plans',
            ],
        ],
        'Owl' => [
            3 => [
                'consults the map with growing seriousness',
                'has several observations, all of them damp',
                'considers this a matter for official attention',
            ],
            4 => [
                'considers this beneath his dignity and the clouds\'',
                'agrees, for once, that the house is the wiser subject',
                'has closed the book. The weather has made its point.',
            ],
        ],
        'Eeyore' => [
            1 => [
                'is not surprised',
                'expected the sky to take this tone, sooner or later',
                'finds the grey rather typical, really',
            ],
            2 => [
                'suspected the wind would get ideas',
                'is already pessimistic about the afternoon',
                'notes that everything is damp, persistently',
            ],
        ],
        'Christopher Robin' => [
            4 => [
                'would like everyone nearer the house',
                'opens the door and means it',
                'is counting heads, not adventures',
            ],
            5 => [
                'has opened the door and will not take no for an answer',
                'leads the way down the stairs — bump, bump, bump — and will not wait',
                'means the lowest room, and he means now',
            ],
        ],
    ];
}

function woodsCopyDay(?string $timezone = null): string
{
    try {
        $tz = new DateTimeZone($timezone ?: date_default_timezone_get());
    } catch (Exception $e) {
        $tz = new DateTimeZone('UTC');
    }

    return (new DateTimeImmutable('now', $tz))->format('Y-m-d');
}

function woodsCopySeed(int $level, string $kind, array $context = []): string
{
    return implode('|', [
        woodsCopyDay($context['timezone'] ?? null),
        (string) $level,
        $kind,
        (string) ($context['location'] ?? ''),
        (string) ($context['weather_code'] ?? ''),
        implode(';', $context['reasons'] ?? []),
    ]);
}

function woodsSayingText(mixed $entry): string
{
    if (is_string($entry)) {
        return $entry;
    }
    if (is_array($entry)) {
        return (string) ($entry['text'] ?? '');
    }

    return '';
}

function woodsTempF(array $context): ?float
{
    if (!array_key_exists('temperature', $context)) {
        return null;
    }

    $temp = (float) $context['temperature'];
    $unit = $context['temperature_unit'] ?? 'fahrenheit';

    return $unit === 'celsius' ? ($temp * 9 / 5 + 32) : $temp;
}

function woodsWindMph(array $context): float
{
    $speed = (float) ($context['gusts'] ?? $context['wind'] ?? 0);
    $unit = $context['wind_unit'] ?? 'mph';

    return match ($unit) {
        'kmh' => $speed * 0.621371,
        'ms'  => $speed * 2.23694,
        default => $speed,
    };
}

function woodsWeatherFlags(array $context): array
{
    $tempF = woodsTempF($context);
    $code = (int) ($context['weather_code'] ?? 0);
    $blob = strtolower(implode(' ', $context['reasons'] ?? []));
    $windMph = woodsWindMph($context);

    $wetCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
    $wet = in_array($code, $wetCodes, true)
        || str_contains($blob, 'rain')
        || str_contains($blob, 'drizzle')
        || str_contains($blob, 'snow')
        || str_contains($blob, 'shower')
        || str_contains($blob, 'precipitation');

    $windy = $windMph >= 15
        || str_contains($blob, 'wind')
        || str_contains($blob, 'gust');

    // Light-coat weather: 65°F or cooler, or up to 70°F if the wind is already up.
    $cool = $tempF !== null && ($tempF <= 65 || ($tempF <= 70 && $windy));

    return [
        'cool' => $cool,
        'wet'  => $wet,
        'dry'  => !$wet,
        'wind' => $windy,
    ];
}

function woodsSayingAllowed(mixed $entry, array $context): bool
{
    $text = woodsSayingText($entry);
    if ($text === '') {
        return false;
    }
    if (is_string($entry)) {
        return true;
    }

    $when = $entry['when'] ?? [];
    if ($when === [] || $when === null) {
        return true;
    }
    if (is_string($when)) {
        $when = [$when];
    }

    $flags = woodsWeatherFlags($context);
    foreach ($when as $tag) {
        if (empty($flags[$tag])) {
            return false;
        }
    }

    return true;
}

function woodsPoolHasText(array $pool, string $text): bool
{
    foreach ($pool as $entry) {
        if (woodsSayingText($entry) === $text) {
            return true;
        }
    }

    return false;
}

function pickWoodsSaying(array $pool, string $seed, string $fallback = '', array $context = []): string
{
    $allowed = [];
    foreach ($pool as $entry) {
        if (!woodsSayingAllowed($entry, $context)) {
            continue;
        }
        $text = woodsSayingText($entry);
        if ($text !== '') {
            $allowed[] = $text;
        }
    }

    if ($allowed === []) {
        return $fallback;
    }

    $index = (int) (((int) sprintf('%u', crc32($seed))) % count($allowed));

    return $allowed[$index];
}

function applyLevelSayings(array $info, int $level, array $context = []): array
{
    $pools = getLevelSayingPools()[$level] ?? [];

    foreach (['message', 'story', 'character_role', 'action'] as $field) {
        $canonical = (string) ($info[$field] ?? '');
        $pool = $pools[$field] ?? [];
        if ($pool === []) {
            continue;
        }
        if ($canonical !== '' && !woodsPoolHasText($pool, $canonical)) {
            array_unshift($pool, $canonical);
        }
        $info[$field] = pickWoodsSaying(
            $pool,
            woodsCopySeed($level, $field, $context),
            $canonical,
            $context
        );
    }

    return $info;
}

/**
 * Character-specific advice lines — keyed by character, then level (or 'any').
 */
function getAdvisorQuotes(): array
{
    return [
        'Pooh' => [
            0 => [
                'A walk would be just the thing. Or a sit. Both are excellent.',
                'The sky is being helpful today. One could almost trust it.',
                'Nothing urgent. Perhaps a little something for elevenses.',
                'If the weather stays like this, I shall have no complaints. And possibly a second helping.',
            ],
            1 => [
                [
                    'text' => 'It might rain, or it might not. Best to bring a coat and hope for the best.',
                    'when' => ['cool'],
                ],
                'It might rain, or it might not. The sky has not yet made a speech.',
                'The sky looks thoughtful. Thoughtful skies sometimes change their minds.',
                'Not quite perfect, but quite good enough for a short walk if you are careful.',
                'I have looked at the clouds, and the clouds have looked at me. We remain undecided.',
            ],
            'any' => [
                'I shall think about the weather. Thinking usually helps.',
            ],
        ],
        'Piglet' => [
            2 => [
                [
                    'text' => 'Hold onto your scarf. And perhaps something larger than yourself.',
                    'when' => ['cool'],
                ],
                'It is rather blustery. I do not mind saying I find it blustery.',
                'Small things should come indoors. Large things too, if they are polite about it.',
                'If you must go out, do try not to be blown anywhere interesting.',
            ],
            'any' => [
                'If you hear a rumble, I recommend not being the tallest thing in the field.',
            ],
        ],
        'Rabbit' => [
            2 => [
                'My carrots can wait, but the garden chairs cannot. Bring them in.',
                'Organize your afternoon now, before the weather organizes it for you.',
                'Tie down what can be tied. The rest should come inside and sit quietly.',
            ],
            3 => [
                'Cancel what can be cancelled. The rest can wait until the sky apologizes.',
                'Check the shed, the gate, and your plans — in that order.',
                'This is not the moment for improvising. It is the moment for lists.',
            ],
            'any' => [
                'Preparedness is simply good housekeeping, elevated.',
            ],
        ],
        'Owl' => [
            3 => [
                'The forecast warrants attention. As do I, generally speaking.',
                'Travel plans should be reconsidered. Maps are no match for a determined storm.',
                'Monitor official alerts. They are less poetic than I, but more precise.',
                'One does not argue with a sky in this mood. One consults it, then stays in.',
            ],
            'any' => [
                'One consults the data, then one acts accordingly. That is wisdom.',
            ],
        ],
        'Eeyore' => [
            1 => [
                'Gray skies. Expected, really. The clouds were never going to be cheerful.',
                [
                    'text' => 'A little drizzle. It will probably get worse, but that is Tuesdays for you.',
                    'when' => ['wet'],
                ],
                [
                    'text' => 'Not raining yet. That is the sort of detail people get excited about.',
                    'when' => ['dry'],
                ],
            ],
            2 => [
                [
                    'text' => 'Wet and windy. My tail is already pessimistic about the afternoon.',
                    'when' => ['wet'],
                ],
                [
                    'text' => 'Everything is damp. Not dramatically, but persistently.',
                    'when' => ['wet'],
                ],
                'The wind has ideas. They are not good ones.',
            ],
            3 => [
                [
                    'text' => 'Very wet. The puddles are winning. They usually do.',
                    'when' => ['wet'],
                ],
                [
                    'text' => 'If you must go out, expect mud. Expect regret. Expect both.',
                    'when' => ['wet'],
                ],
                'I wouldn\'t call it a disaster. I would call it consistent.',
            ],
            'any' => [
                [
                    'text' => 'Not the sort of day that improves with optimism. Umbrellas help slightly.',
                    'when' => ['wet'],
                ],
                'Not the sort of day that improves with optimism.',
            ],
        ],
        'Christopher Robin' => [
            4 => [
                'Everyone inside, please. That means now, not after one more adventure.',
                'The woods can wait. You cannot. Come to the house.',
                'Leave the exploring. Bring yourselves. That is the whole of it.',
            ],
            5 => [
                'The house. Now. I shall count to three, and I do not intend to reach four.',
                'Everyone inside — Pooh, Piglet, all of you. The officials know what they are talking about.',
                'This is not a day for the middle of the woods. Come where the walls are.',
                'Lowest floor, innermost room, away from the windows. Then stay there.',
            ],
            'any' => [
                'Stay where it is safe until someone sensible gives the all-clear.',
            ],
        ],
    ];
}
