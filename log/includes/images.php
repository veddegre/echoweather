<?php
/**
 * Lakes Log — original level plates for the live forecast and standing orders.
 */

function getLakeLevelImages(): array
{
    return [
        0 => [
            'file'  => 'level-0-breakwater.jpg',
            'alt'   => 'A lighthouse keeper trimming a lantern on a calm Great Lakes breakwater',
            'scene' => 'Fine for the Breakwater',
        ],
        1 => [
            'file'  => 'level-1-lump.jpg',
            'alt'   => 'A deckhand on a working deck watching a short steep chop off the harbor mouth',
            'scene' => 'A Bit of a Lump',
        ],
        2 => [
            'file'  => 'level-2-small-craft.jpg',
            'alt'   => 'A captain looking twice at the barometer while whitecaps build beyond the wheelhouse',
            'scene' => 'Small Craft, If You Please',
        ],
        3 => [
            'file'  => 'level-3-gale.jpg',
            'alt'   => 'A keeper on a lighthouse gallery as spray sheets over the wall in a building gale',
            'scene' => 'Gale Building',
        ],
        4 => [
            'file'  => 'level-4-below.jpg',
            'alt'   => 'A Great Lakes freighter in a damaging sea, hands going below as the captain points for harbor',
            'scene' => 'All Hands Below',
        ],
        5 => [
            'file'  => 'level-5-harbor.jpg',
            'alt'   => 'A vessel running for a harbor mouth under a lighthouse beam in a black storm',
            'scene' => 'Seek the Nearest Harbor',
        ],
    ];
}

function lakeLevelImageMeta(int $level): array
{
    $images = getLakeLevelImages();

    return $images[$level] ?? $images[0];
}

function lakeLevelImagePath(int $level): ?string
{
    $meta = lakeLevelImageMeta($level);
    $relative = 'assets/images/levels/' . $meta['file'];
    $absolute = __DIR__ . '/../' . $relative;

    return is_file($absolute) ? $relative : null;
}

function renderLakeLevelImage(int $level, string $class = 'char-image'): string
{
    $path = lakeLevelImagePath($level);
    if ($path === null) {
        return '';
    }

    $meta = lakeLevelImageMeta($level);
    $absolute = __DIR__ . '/../' . $path;
    $src = $path . '?v=' . (int) (@filemtime($absolute) ?: 1);

    return sprintf(
        '<div class="char-image-frame"><img src="%s" alt="%s" class="%s" loading="lazy"></div>',
        htmlspecialchars($src, ENT_QUOTES, 'UTF-8'),
        htmlspecialchars($meta['alt'], ENT_QUOTES, 'UTF-8'),
        htmlspecialchars($class, ENT_QUOTES, 'UTF-8')
    );
}
