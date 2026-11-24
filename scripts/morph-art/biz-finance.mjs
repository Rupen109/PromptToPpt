// Finance Plan: premium dark-studio 3D objects in emerald, warm gold and a hint of blue, calm and trustworthy. No people, no text, no currency symbols.
export default ({ BLACK, MAGENTA, BLUE }) => {
  const look = 'Premium dark studio 3D render with soft rim lighting, polished emerald green glass and warm brushed gold, a very small touch of cool blue, calm, elegant and trustworthy, refined materials, shallow reflections. Nothing is cropped by the frame, the whole subject sits inside the frame with a clear margin. No text, no letters, no numbers, no currency symbols, no logo, no watermark.'
  const cut = (name, key, p) => ({ name: `finance-${name}`, key, ratio: '1:1', size: [900, 900], mode: 'trim', fill: 0.9, check: true, p: `${p} ${look} Floating with no shadow and no reflection, on ${key === 'blue' ? BLUE : MAGENTA}.` })
  return [
    cut('coins', 'blue', 'A neat tall stack of five thick round gold coins with plain smooth faces and fine reeded edges, and a second shorter stack of three polished emerald green glass coins leaning beside it, seen from a slight three-quarter angle above.'),
    cut('vault', 'magenta', 'An abstract round vault door in brushed dark steel with a gold ring and a gold central wheel with spokes, mounted in a thick rounded square frame, seen straight on at a very slight angle.'),
    cut('chart', 'magenta', 'A glass bar chart sculpture: five thick rounded translucent emerald glass bars on a thin dark glass base, rising in height from left to right, the tallest with a small gold cap, seen from a slight three-quarter angle.'),
    cut('leaf', 'magenta', 'A single young seedling with two broad glossy emerald green leaves growing out of a small stack of gold coins, seen from a slight three-quarter angle, a symbol of steady growth.'),
    { name: 'finance-glow', key: 'black', ratio: '16:9', size: [1920, 1080], mode: 'frame', p: `A vast, soft, out-of-focus field of deep emerald green light with a few tiny golden bokeh specks, very dim overall (never brighter than 30% grey), strongest toward the upper right and fading smoothly to black at every edge, on ${BLACK}. No text.` },
  ]
}
