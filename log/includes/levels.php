<?php
/**
 * The Lakes Log — six-level marine reading of the same Echo/Pooh weather scale.
 */

function getLakeLogLevels(): array
{
    return [
        0 => [
            'name'        => 'Fine for the Breakwater',
            'short'       => 'Fine',
            'character'   => 'The keeper',
            'character_role' => 'has the lamp trimmed and nothing particular to report',
            'message'     => 'The lake is keeping its own counsel, and the counsel is kind.',
            'story'       => 'A still fetch. The breakwater took the morning without complaint.',
            'action'      => 'Walk the pier if you like. Mind the spray anyway — habit is cheaper than regret.',
            'conditions'  => [
                'Light airs or a calm fetch',
                'Harbor and breakwater easy',
                'No marine alerts on the board',
            ],
            'official'    => ['No marine alerts', 'Light winds'],
            'css_class'   => 'level-0',
            'icon'        => 'sun',
        ],
        1 => [
            'name'        => 'A Bit of a Lump',
            'short'       => 'Lump',
            'character'   => 'The deckhand',
            'character_role' => 'watches the chop and pretends not to',
            'message'     => 'The lake has opinions. They are not yet orders.',
            'story'       => 'A short steep lump off the harbor mouth. Nothing a sensible boat cannot abide.',
            'action'      => 'Small boats keep an eye on the sky. Hats stay on. Plans may still proceed.',
            'conditions'  => [
                'A short steep lump or chop',
                'Clouds making up, or a light drizzle',
                'The bar beginning to mutter',
            ],
            'official'    => ['No alert', 'Elevated nearshore chop'],
            'css_class'   => 'level-1',
            'icon'        => 'cloud',
        ],
        2 => [
            'name'        => 'Small Craft, If You Please',
            'short'       => 'Small craft',
            'character'   => 'The captain',
            'character_role' => 'has already looked twice at the glass',
            'message'     => 'The wind has found the fetch, and the fetch is answering.',
            'story'       => 'Whitecaps in the open. The harbor looks more intelligent than it did at breakfast.',
            'action'      => 'Small craft stay in, or go with someone who knows the bar. Allow extra time along the shore.',
            'conditions'  => [
                'Whitecaps in the open',
                'Small Craft Advisory weather',
                'Wind finding the fetch',
            ],
            'official'    => ['Small Craft Advisory', 'Wind Advisory', 'Beach hazards'],
            'css_class'   => 'level-2',
            'icon'        => 'wind',
        ],
        3 => [
            'name'        => 'Gale Building',
            'short'       => 'Gale',
            'character'   => 'The keeper',
            'character_role' => 'keeps the log in a firmer hand',
            'message'     => 'This is weather that writes itself into the book.',
            'story'       => 'The lake has dropped the pretense of manners. The light is for more than courtesy now.',
            'action'      => 'Stay off the open water. Secure what can blow. Check again after the next watch.',
            'conditions'  => [
                'Gale building, or a determined sea',
                'Thunder, heavy rain, or a flooding risk',
                'Spray over the wall',
            ],
            'official'    => ['Gale Warning', 'Flood Watch', 'Severe Thunderstorm Watch'],
            'css_class'   => 'level-3',
            'icon'        => 'rain',
        ],
        4 => [
            'name'        => 'All Hands Below',
            'short'       => 'Below',
            'character'   => 'The captain',
            'character_role' => 'means the harbor, and does not mean later',
            'message'     => 'The open lake is not a place. It is a mistake.',
            'story'       => 'No one argues with a sea like this. The walls that matter are the ones already around you.',
            'action'      => 'Ashore. Inland of the spray. Follow official instruction without debate.',
            'conditions'  => [
                'Storm-force wind or a damaging sea',
                'Severe thunderstorms or ice',
                'Travel along the shore becoming dangerous',
            ],
            'official'    => ['Storm Warning', 'Severe Thunderstorm Warning', 'Winter Storm Warning'],
            'css_class'   => 'level-4',
            'icon'        => 'storm',
        ],
        5 => [
            'name'        => 'Seek the Nearest Harbor',
            'short'       => 'Harbor',
            'character'   => 'The captain',
            'character_role' => 'will not take the next watch as an answer',
            'message'     => 'This is not a log entry. This is an order.',
            'story'       => 'There is only the nearest solid ground, the lowest room, and staying put until someone official says otherwise.',
            'action'      => 'Get off the water and off the open shore. Innermost room, away from windows. Do exactly what the officials say.',
            'conditions'  => [
                'Hurricane-force wind, tornado, or a flash flood emergency',
                'A destructive storm in progress',
                'Life-threatening conditions on the water or the open shore',
            ],
            'official'    => ['Hurricane Force Wind Warning', 'Tornado Warning', 'Flash Flood Emergency'],
            'css_class'   => 'level-5',
            'icon'        => 'house',
        ],
    ];
}

function getLakeSayingPools(): array
{
    return [
        0 => [
            'message' => [
                'The lake is keeping its own counsel, and the counsel is kind.',
                'A working day, if you have work that likes fair water.',
                'Nothing on the glass that a keeper would underline.',
                'Fair along the lee. A day for painting, not for reefing.',
            ],
            'story' => [
                'A still fetch. The breakwater took the morning without complaint.',
                'The harbor looked pleased with itself, which is rare and should be enjoyed.',
                'Smoke from the stacks went straight up, as if it had an appointment ashore.',
                'The fetch was short and honest. No sea to speak of beyond the pier.',
            ],
            'character_role' => [
                'has the lamp trimmed and nothing particular to report',
                'considers this a morning for mending, not for worrying',
                'notes fair water and leaves the rest to the birds',
            ],
        ],
        1 => [
            'message' => [
                'The lake has opinions. They are not yet orders.',
                'A bit of a lump. The sort that makes a green hand thoughtful.',
                'Not a warning. A suggestion, delivered by the chop.',
                'A weather eye is enough. A gale warning is not yet required.',
            ],
            'story' => [
                'A short steep lump off the harbor mouth. Nothing a sensible boat cannot abide.',
                'The lake fidgeted. The pier pretended not to notice.',
                'A grey thought crossed the water, then sat down to see what would happen.',
            ],
            'character_role' => [
                'watches the chop and pretends not to',
                'has decided the extra line was not, after all, superstition',
                'keeps one eye on the bar and one on the sky',
            ],
        ],
        2 => [
            'message' => [
                'The wind has found the fetch, and the fetch is answering.',
                'Small craft would do well to remember they are small.',
                'Hats, canvas, and optimism are all under review.',
                'The Small Craft Advisory is the lake speaking plainly.',
            ],
            'story' => [
                'Whitecaps in the open. The harbor looks more intelligent than it did at breakfast.',
                'The wind arrived without knocking, which is typical of wind on a Great Lake.',
                'Along the shore, the trees have begun to file reports.',
            ],
            'character_role' => [
                'has already looked twice at the glass',
                'would rather be wrong in the harbor than right outside it',
                'is not shouting yet, and that is the point',
            ],
        ],
        3 => [
            'message' => [
                'This is weather that writes itself into the book.',
                'Gale building. The lake has dropped the pretense of manners.',
                'Dignity is difficult to maintain on a deck like this.',
            ],
            'story' => [
                'The lake has dropped the pretense of manners. The light is for more than courtesy now.',
                'Spray over the wall. The log takes a firmer hand.',
                'It was the sort of afternoon that makes a harbor look like wisdom.',
            ],
            'character_role' => [
                'keeps the log in a firmer hand',
                'has no poetry left for this stretch of water',
                'considers the next watch already spoken for',
            ],
        ],
        4 => [
            'message' => [
                'The open lake is not a place. It is a mistake.',
                'All hands below. The rest is for the officials.',
                'Come in. The weather will not be reasoned with.',
            ],
            'story' => [
                'No one argues with a sea like this. The walls that matter are the ones already around you.',
                'The light is still burning. That is not an invitation to go and see.',
                'It was a day for being ashore, which is the sensible sort of bravery.',
            ],
            'character_role' => [
                'means the harbor, and does not mean later',
                'is counting heads, not headings',
                'has decided that indoors is the only proper station',
            ],
        ],
        5 => [
            'message' => [
                'This is not a log entry. This is an order.',
                'Seek the nearest harbor. There is not a second nearest.',
                'Do not wait for a better moment. There is not one.',
            ],
            'story' => [
                'There is only the nearest solid ground, the lowest room, and staying put until someone official says otherwise.',
                'The book can wait. The people cannot.',
                'Nobody argued. Even the lake, for once, was not the most important thing in the room.',
            ],
            'character_role' => [
                'will not take the next watch as an answer',
                'means the lowest room, and means now',
                'is not asking, and is not repeating himself more than twice',
            ],
        ],
    ];
}

function getLakeAdvisorQuotes(): array
{
    return [
        'The keeper' => [
            0 => [
                'Lamp trimmed. Nothing to add. That is a kind of luck.',
                'Fair water. I shall put it in the book before it changes its mind.',
            ],
            1 => [
                'A lump off the mouth. Not a story yet. Keep looking.',
                'The glass is not alarmed. I am not either. I am watching.',
            ],
            3 => [
                'Gale building. The light is not decorative today.',
                'Stay off the open water. I have seen this fetch before.',
            ],
            'any' => [
                'The light stays lit. That is the whole of my advice.',
            ],
        ],
        'The deckhand' => [
            1 => [
                'It is a bit lumpy. I do not mind saying I find it lumpy.',
                'Hold onto your hat. And perhaps something larger than yourself.',
            ],
            2 => [
                'Small things should come ashore. Large things too, if they are polite about it.',
                'If you must go out, do try not to be blown anywhere interesting.',
            ],
            'any' => [
                'If you hear the lake get loud, I recommend not being the smallest thing on it.',
            ],
        ],
        'The captain' => [
            2 => [
                'Small craft, if you please. The lake is not taking requests.',
                'The harbor is still there. Use it.',
            ],
            4 => [
                'All hands below. That means now, not after one more look at the bar.',
                'The lake can wait. You cannot. Come in.',
            ],
            5 => [
                'Nearest harbor. I shall count to three, and I do not intend to reach four.',
                'The officials know what they are talking about. So do I. Get off the water.',
            ],
            'any' => [
                'Stay where it is safe until someone sensible gives the all-clear.',
            ],
        ],
    ];
}

function pickLakeAdvisorCharacter(int $level, array $reasons): string
{
    $blob = strtolower(implode(' ', $reasons));

    if ($level >= 4) {
        return 'The captain';
    }
    if ($level >= 3) {
        return 'The keeper';
    }
    if ($level >= 2) {
        if (str_contains($blob, 'wind') || str_contains($blob, 'gust')) {
            return 'The captain';
        }
        return 'The deckhand';
    }
    if ($level >= 1) {
        if (str_contains($blob, 'wind') || str_contains($blob, 'gust')) {
            return 'The deckhand';
        }
        return 'The keeper';
    }

    return 'The keeper';
}

function pickLakeAdvisor(int $level, array $reasons, array $context = []): array
{
    $character = pickLakeAdvisorCharacter($level, $reasons);
    $quotes = getLakeAdvisorQuotes();
    $pool = $quotes[$character][$level]
        ?? $quotes[$character]['any']
        ?? ['Keep a weather eye, and a harbor in mind.'];

    $ctx = $context + ['reasons' => $reasons];
    $quote = pickWoodsSaying(
        $pool,
        woodsCopySeed($level, 'lake:advisor:' . $character, $ctx),
        'Keep a weather eye, and a harbor in mind.',
        $ctx
    );

    $verbs = [
        'The keeper'   => 'notes',
        'The deckhand' => 'mutters',
        'The captain'  => 'logs',
    ];

    $verb = $verbs[$character] ?? 'notes';

    return [
        'character' => $character,
        'verb'      => $verb,
        'quote'     => $quote,
        'full'      => $character . ' ' . $verb . ': “' . $quote . '”',
    ];
}

function applyLakeLogCopy(array $info, int $level, array $context = []): array
{
    $pools = getLakeSayingPools()[$level] ?? [];

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
            woodsCopySeed($level, 'lake:' . $field, $context),
            $canonical,
            $context
        );
    }

    return $info;
}

function getLakeCharacterGuide(): array
{
    return [
        'The keeper' => [
            'notices' => 'the light, the glass, and whether the fetch is still honest',
            'station' => 'The lighthouse',
        ],
        'The deckhand' => [
            'notices' => 'chop, spray, and anything that wants to come adrift',
            'station' => 'On deck',
        ],
        'The captain' => [
            'notices' => 'when small craft should stay in, and when all hands come below',
            'station' => 'The wheelhouse',
        ],
    ];
}

function getLakeGlossary(): array
{
    return [
        ['term' => 'The glass', 'sense' => 'The barometer. A falling glass means trouble is making up.'],
        ['term' => 'Fetch', 'sense' => 'How far the wind has to work on the water. A long fetch builds a larger sea.'],
        ['term' => 'The bar', 'sense' => 'The shallow water at a harbor mouth, where a short steep sea can stand up.'],
        ['term' => 'Lump / chop', 'sense' => 'A short, steep sea. Uncomfortable, not yet a gale.'],
        ['term' => 'Small craft', 'sense' => 'Boats that feel a Small Craft Advisory first — open boats, daysailers, tenders.'],
        ['term' => 'Watch', 'sense' => 'A four-hour trick of duty, and also NWS language: conditions may become hazardous.'],
        ['term' => 'Weather eye', 'sense' => 'Keep looking. The lake changes its mind without asking.'],
        ['term' => 'Lee', 'sense' => 'The sheltered side. Seek the lee of the land, not the open fetch.'],
        ['term' => 'All hands below', 'sense' => 'Off the deck. Ashore. The lake is no longer a place of work.'],
        ['term' => 'GLF', 'sense' => 'The NWS Great Lakes forecast. Echo still has the full product when you need the fine print.'],
    ];
}

function formatLakeReasons(array $reasons): array
{
    $out = [];
    foreach ($reasons as $reason) {
        $r = $reason;
        if (str_starts_with($r, 'Official word from beyond the woods:')) {
            $out[] = 'Notice posted: ' . trim(substr($r, strlen('Official word from beyond the woods:')));
            continue;
        }
        if (str_starts_with($r, 'Active alert:')) {
            $out[] = 'Notice posted: ' . trim(substr($r, strlen('Active alert:')));
            continue;
        }
        if (str_starts_with($r, 'The trees report ')) {
            $out[] = 'The glass and the anemometer report ' . substr($r, strlen('The trees report '));
            continue;
        }
        if (str_starts_with($r, 'Wind ')) {
            $out[] = 'Wind on the fetch: ' . lcfirst($r);
            continue;
        }
        if (str_starts_with($r, 'Thermometer reading:')) {
            $out[] = 'Air on deck: ' . trim(substr($r, strlen('Thermometer reading:')));
            continue;
        }
        if (str_starts_with($r, 'Temperature ')) {
            $out[] = 'Air on deck: ' . substr($r, strlen('Temperature '));
            continue;
        }
        if (str_starts_with($r, 'Sky is dropping water at ')) {
            $out[] = 'Rain on deck at ' . substr($r, strlen('Sky is dropping water at '));
            continue;
        }
        if (str_starts_with($r, 'Precipitation ')) {
            $out[] = 'Rain on deck: ' . substr($r, strlen('Precipitation '));
            continue;
        }
        $out[] = $r;
    }
    return $out;
}
