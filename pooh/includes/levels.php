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
            ],
            1 => [
                'It might rain, or it might not. Best to bring a coat and hope for the best.',
                'The sky looks thoughtful. Thoughtful skies sometimes change their minds.',
                'Not quite perfect, but quite good enough for a short walk if you are careful.',
            ],
            'any' => [
                'I shall think about the weather. Thinking usually helps.',
            ],
        ],
        'Piglet' => [
            2 => [
                'Hold onto your scarf. And perhaps something larger than yourself.',
                'It is rather blustery. I do not mind saying I find it blustery.',
                'Small things should come indoors. Large things too, if they are polite about it.',
            ],
            'any' => [
                'If you hear a rumble, I recommend not being the tallest thing in the field.',
            ],
        ],
        'Rabbit' => [
            2 => [
                'My carrots can wait, but the garden chairs cannot. Bring them in.',
                'Organize your afternoon now, before the weather organizes it for you.',
            ],
            3 => [
                'Cancel what can be cancelled. The rest can wait until the sky apologizes.',
                'Check the shed, the gate, and your plans — in that order.',
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
            ],
            'any' => [
                'One consults the data, then one acts accordingly. That is wisdom.',
            ],
        ],
        'Eeyore' => [
            1 => [
                'Gray skies. Expected, really. The clouds were never going to be cheerful.',
                'A little drizzle. It will probably get worse, but that is Tuesdays for you.',
            ],
            2 => [
                'Wet and windy. My tail is already pessimistic about the afternoon.',
                'Everything is damp. Not dramatically, but persistently.',
            ],
            3 => [
                'Very wet. The puddles are winning. They usually do.',
                'If you must go out, expect mud. Expect regret. Expect both.',
            ],
            'any' => [
                'Not the sort of day that improves with optimism. Umbrellas help slightly.',
            ],
        ],
        'Christopher Robin' => [
            4 => [
                'Everyone inside, please. That means now, not after one more adventure.',
                'The woods can wait. You cannot. Come to the house.',
            ],
            5 => [
                'The house. Now. I shall count to three, and I do not intend to reach four.',
                'Everyone inside — Pooh, Piglet, all of you. The officials know what they are talking about.',
                'This is not a day for the middle of the woods. Come where the walls are.',
            ],
            'any' => [
                'Stay where it is safe until someone sensible gives the all-clear.',
            ],
        ],
    ];
}
