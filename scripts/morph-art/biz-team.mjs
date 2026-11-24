// Team Welcome: friendly flat illustrations with soft shading, one warm palette (orange, teal, golden yellow on cream). Props are cut out on magenta; scenes are finished pictures.
export default ({ MAGENTA }) => {
  const STYLE = 'Friendly modern flat vector-style illustration with soft rounded shapes, gentle subtle shading and no outlines, in a warm palette of terracotta orange (#F26B3A), teal (#2E8B7A), golden yellow (#F5B82E) and cream, welcoming and calm. No people, no faces, no text, no letters, no numbers, no logo, no watermark.'
  const prop = (name, ratio, size, what) => ({ name: `team-${name}`, key: 'magenta', ratio, size, mode: 'trim', fill: 0.9, anchor: 'bottom', check: true, ground: true, p: `${STYLE} ${what}, shown straight on, the whole object inside the frame with a clear margin and nothing cropped, on ${MAGENTA}.` })
  return [
    prop('mug', '1:1', [1000, 1000], 'One large cheerful ceramic coffee mug with a rounded handle, glossy terracotta-orange glaze with a thin cream band, a few soft wisps of steam rising from it'),
    prop('plant', '2:3', [700, 1050], 'One potted leafy green houseplant in a round teal ceramic pot, with about seven broad rounded leaves in two shades of green'),
    prop('notebook', '1:1', [1000, 1000], 'A closed teal hardcover notebook with a golden elastic band, lying slightly angled, with a yellow pencil resting diagonally across its cover'),
    { name: 'team-desk', key: null, ratio: '3:2', size: [1200, 800], mode: 'cover', p: `${STYLE} A top-down view of a tidy welcome desk on a cream surface: a closed laptop, an open notebook, a mug, a small potted plant, a lanyard badge holder with a blank badge and a bunch of colourful sticky notes with no writing, arranged neatly and balanced with generous empty space.` },
    { name: 'team-office', key: null, ratio: '4:3', size: [1400, 1050], mode: 'cover', p: `${STYLE} A bright open-plan office interior with no people: big windows with a soft sunny sky, a row of desks with monitors and chairs, hanging pendant lamps, tall plants, a cosy sofa corner with cushions, warm wooden floor, cream walls.` },
    { name: 'team-kitchen', key: null, ratio: '1:1', size: [900, 900], mode: 'cover', p: `${STYLE} A cosy shared office kitchen with no people: a long wooden table with colourful mugs, a bowl of fruit and a teapot, open shelves with plates, a plant on the counter, a round window, warm light, composition centred.` },
  ]
}
