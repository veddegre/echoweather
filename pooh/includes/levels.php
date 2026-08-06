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
            'character_role' => 'notices comfort and temperature',
            'message'     => 'The weather is friendly today.',
            'story'       => 'The woods were quiet and the path was dry.',
            'action'      => 'Enjoy the outdoors. A stroll through the woods would be just the thing.',
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
            'character_role' => 'considers the sky thoughtfully',
            'message'     => 'A little weather, but nothing troublesome.',
            'story'       => 'A little weather, but nothing that spoiled a thoughtful walk.',
            'action'      => 'Dress appropriately and keep an eye on the sky.',
            'conditions'  => [
                'Clouds or overcast skies',
                'Light drizzle or flurries',
                'Minor heat or chill',
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
            'character_role' => 'holds onto a scarf in the wind',
            'message'     => 'Secure loose things and take care outdoors.',
            'story'       => 'Branches swayed and scarves were held a little tighter.',
            'action'      => 'Bring lightweight objects indoors. Allow extra travel time. Check the forecast before outdoor plans.',
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
            'character_role' => 'consults a map and the forecast',
            'message'     => 'Plans may need changing. Travel carefully.',
            'story'       => 'The paths grew muddy and plans deserved a second thought.',
            'action'      => 'Reconsider outdoor plans. Avoid flooded areas. Monitor official alerts closely.',
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
            'character_role' => 'calls everyone indoors',
            'message'     => 'Stay indoors and follow official guidance.',
            'story'       => 'It was a day for sturdy walls and good company indoors.',
            'action'      => 'Stay indoors. Secure property. Follow local emergency guidance.',
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
            'character'   => null,
            'character_role' => null,
            'message'     => 'Take shelter immediately.',
            'story'       => 'There was no time for anything but finding shelter.',
            'action'      => 'Take shelter immediately. Follow all official emergency instructions.',
            'conditions'  => [
                'Tornado warning',
                'Flash flood emergency',
                'Destructive storm in progress',
                'Life-threatening conditions',
            ],
            'official'    => ['Tornado Warning', 'Flash Flood Emergency', 'Hurricane Warning (landfall)', 'Life-threatening event'],
            'css_class'   => 'level-5',
            'icon'        => 'emergency',
        ],
    ];
}

function getCharacterGuide(): array
{
    return [
        'Pooh' => [
            'notices' => 'temperature and comfort',
            'icon'    => 'thermometer',
        ],
        'Piglet' => [
            'notices' => 'wind and thunder',
            'icon'    => 'wind',
        ],
        'Rabbit' => [
            'notices' => 'impacts on plans and property',
            'icon'    => 'calendar',
        ],
        'Owl' => [
            'notices' => 'forecasts, watches and warnings',
            'icon'    => 'document',
        ],
        'Eeyore' => [
            'notices' => 'prolonged rain, clouds and gloomy conditions',
            'icon'    => 'rain-cloud',
        ],
        'Christopher Robin' => [
            'notices' => 'whether everyone should seek shelter',
            'icon'    => 'house',
        ],
    ];
}
