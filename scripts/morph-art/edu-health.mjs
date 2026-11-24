// Health & Wellness: calm botanical and still-life illustrations, one soft palette (mint, leaf green, sky blue, coral). Props are cut out on a flat key colour; the garden room is a finished picture.
export default ({ MAGENTA, GREEN }) => {
  const STYLE = 'Calm modern flat vector-style illustration with soft rounded shapes, gentle subtle shading and no outlines, in a soft palette of leaf green (#1F9D74), pale mint (#CFEEDD), sky blue (#3A86FF) and coral pink-red (#FF7A8A) with white highlights, caring and serene. No people, no faces, no text, no letters, no numbers, no logo, no watermark.'
  const prop = (name, key, ratio, size, what) => ({ name: `health-${name}`, key, ratio, size, mode: 'trim', fill: 0.9, anchor: 'bottom', check: true, ground: true, p: `${STYLE} ${what}, shown straight on, the whole object inside the frame with a clear margin and nothing cropped, on ${key === 'green' ? GREEN : MAGENTA}.` })
  return [
    prop('leaf', 'magenta', '2:3', [700, 1050], 'One tall sprig of a monstera-style plant: a thin curved stem carrying three large glossy split leaves in two shades of green with pale veins'),
    prop('heart', 'green', '1:1', [900, 900], 'One plump, soft, smooth coral-red heart shape with a gentle highlight, and a thin white heartbeat line crossing its middle'),
    prop('glass', 'magenta', '1:1', [900, 900], 'A tall clear drinking glass of water with a round lemon slice and a small mint sprig on the rim, light blue water with soft highlights'),
    prop('stetho', 'green', '1:1', [900, 900], 'A stethoscope lying in a loose round loop, with soft blue tubing and a silver chest piece, simple and friendly'),
    prop('fruit', 'magenta', '1:1', [900, 900], 'A shallow wooden bowl heaped with fresh fruit: an orange, a green apple, a yellow banana and a few blueberries, with one green leaf'),
    prop('mat', 'magenta', '1:1', [900, 900], 'A rolled-up teal yoga mat standing beside a small round pale-yellow cushion and a reusable water bottle in pale blue'),
    { name: 'health-garden', key: null, ratio: '4:3', size: [1400, 1050], mode: 'cover', p: `${STYLE} A serene wellness room with no people: a big round window onto a green garden, a rolled yoga mat, a wooden stool with a glass of water and a small plant, hanging leafy plants, pale mint walls, light wooden floor, soft morning light, composition balanced with calm empty space.` },
  ]
}
