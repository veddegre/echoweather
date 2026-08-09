<?php
/**
 * Public-domain E. H. Shepard illustrations from Winnie-the-Pooh (1926).
 *
 * Images sourced from Project Gutenberg eBook #67098 (1926 McClelland & Stewart edition).
 * Public domain in the United States. Shepard's works may remain under copyright
 * in other jurisdictions — verify locally.
 *
 * @see https://www.gutenberg.org/ebooks/67098
 */

define('GUTENBERG_IMAGES_BASE', 'https://www.gutenberg.org/cache/epub/67098/images/');

function getCharacterImages(): array
{
    return [
        'Pooh' => [
            'file'       => 'pooh.jpg',
            'alt'        => 'Winnie-the-Pooh sitting by his campfire, illustration by E. H. Shepard (1926)',
            'gutenberg'  => 'illus3.jpg',
            'scene'      => 'Pooh at the door of Mr. Sanders, Chapter I',
            'variants'   => [
                1 => [
                    'file'      => 'pooh-bothersome.jpg',
                    'alt'       => 'Winnie-the-Pooh peering up at the sky, illustration by E. H. Shepard (1926)',
                    'gutenberg' => 'illus4.jpg',
                    'scene'     => 'Pooh and the bees, Chapter I',
                ],
            ],
        ],
        'Piglet' => [
            'file'       => 'piglet.jpg',
            'alt'        => 'Piglet getting ready for the party, illustration by E. H. Shepard (1926)',
            'gutenberg'  => null,
            'wikimedia'  => 'Piglet EHShepard.jpg',
            'source_url' => 'https://commons.wikimedia.org/wiki/File:Piglet_EHShepard.jpg',
            'scene'      => 'Piglet gets ready for the party, Chapter X',
        ],
        'Rabbit' => [
            'file'       => 'rabbit.jpg',
            'alt'        => 'Rabbit with his plans, illustration by E. H. Shepard (1926)',
            'gutenberg'  => 'illus69.jpg',
            'scene'      => 'Rabbit, Piglet and Pooh discuss Kanga, Chapter VII',
        ],
        'Owl' => [
            'file'       => 'owl.jpg',
            'alt'        => 'Owl writing at his desk, illustration by E. H. Shepard (1926)',
            'gutenberg'  => 'illus63.jpg',
            'scene'      => 'Owl composing Eeyore\'s birthday message, Chapter VI',
        ],
        'Eeyore' => [
            'file'       => 'eeyore.png',
            'alt'        => 'Eeyore with a bow on his tail, illustration by E. H. Shepard (1926)',
            'gutenberg'  => 'illus106.jpg',
            'wikimedia'  => 'Winnie-the-Pooh 166-1.png',
            'source_url' => 'https://commons.wikimedia.org/wiki/File:Winnie-the-Pooh_166-1.png',
            'scene'      => 'Eeyore at the party, Chapter X',
        ],
        'Christopher Robin' => [
            'file'       => 'christopher-robin.jpg',
            'alt'        => 'Christopher Robin and Winnie-the-Pooh on the stairs, illustration by E. H. Shepard (1926)',
            'gutenberg'  => 'illus2.jpg',
            'scene'      => 'Coming downstairs, Chapter I',
        ],
    ];
}

function getDecorativeImages(): array
{
    return [
        'hundred_acre_wood' => [
            'file'      => 'hundred-acre-wood.jpg',
            'alt'       => 'Map of the Hundred Acre Wood by E. H. Shepard (1926)',
            'gutenberg' => 'map.jpg',
        ],
    ];
}

function resolveCharacterImageMeta(string $character, ?int $level = null): ?array
{
    $images = getCharacterImages();
    if (!isset($images[$character])) {
        return null;
    }

    $meta = $images[$character];
    if ($level !== null && isset($meta['variants'][$level])) {
        $meta = array_merge($meta, $meta['variants'][$level]);
    }

    unset($meta['variants']);

    return $meta;
}

function characterImagePath(string $character, ?int $level = null): ?string
{
    $meta = resolveCharacterImageMeta($character, $level);
    if ($meta === null) {
        return null;
    }

    $relative = 'assets/images/characters/' . $meta['file'];
    $absolute = __DIR__ . '/../' . $relative;

    return is_file($absolute) ? $relative : null;
}

function renderCharacterImage(string $character, string $class = 'char-image', ?int $level = null): string
{
    $meta = resolveCharacterImageMeta($character, $level);
    if ($meta === null) {
        return '';
    }

    $path = characterImagePath($character, $level);

    if ($path === null) {
        return '';
    }

    return renderFramedImage($path, $meta['alt'], $class);
}

function renderFramedImage(string $path, string $alt, string $class = 'char-image', string $frameClass = 'char-image-frame'): string
{
    return sprintf(
        '<div class="%s"><img src="%s" alt="%s" class="%s" loading="lazy"></div>',
        htmlspecialchars($frameClass, ENT_QUOTES, 'UTF-8'),
        htmlspecialchars($path, ENT_QUOTES, 'UTF-8'),
        htmlspecialchars($alt, ENT_QUOTES, 'UTF-8'),
        htmlspecialchars($class, ENT_QUOTES, 'UTF-8')
    );
}

function renderAttributionFooter(): string
{
    return '<p class="attribution">Illustrations by E.&nbsp;H. Shepard from '
        . '<cite>Winnie-the-Pooh</cite> (1926, public domain in the United States). '
        . 'Sourced from <a href="https://www.gutenberg.org/ebooks/67098" '
        . 'target="_blank" rel="noopener">Project Gutenberg #67098</a>. '
        . 'Not affiliated with or endorsed by Disney.</p>';
}
