// Roadmap: seven soft-clay milestone objects (one shared light, palette and material) cut out on magenta, plus one calm sky field.
export default ({ MAGENTA }) => {
  const STYLE = 'A single 3D object in a "soft clay" style: smooth, rounded, chunky, slightly glossy matte-clay surfaces with gentle soft studio lighting from the upper left and soft shading, a limited palette of deep teal (#0E4D4A), warm coral orange-red (#FF6B4A), sand beige (#E9DFC9) and warm cream white, simple friendly toy-like proportions, premium 3D illustration, seen from a slightly raised three-quarter angle'
  const NOTE = 'The whole object is inside the frame with a clear margin on every side, nothing cropped, centred, no ground, no floor, no shadow on the ground, no text, no letters, no numbers, no logo, no watermark. Use none of the background colour anywhere in the object, and no pink or purple at all.'
  const obj = (name, what, extra = {}) => ({ name: `road-${name}`, key: 'magenta', ratio: '1:1', size: [900, 900], mode: 'trim', fill: 0.85, check: true, p: `${STYLE}: ${what}. ${NOTE} Background: ${MAGENTA}.`, ...extra })
  return [
    obj('bulb', 'a light bulb with a round cream-white glossy glass globe glowing softly warm, a chunky sand-coloured screw base with a coral tip and a small teal ring'),
    obj('gears', 'two interlocking chunky cogwheels, a large deep teal one and a smaller coral one, each with a cream centre hub'),
    obj('rocket', 'a small round-nosed rocket pointing up and to the right, cream-white body, a coral nose cone and fins, a round teal porthole window and a soft puff of sand-coloured smoke at the tail'),
    obj('mountain', 'a small mountain with two peaks, deep teal body with a cream-white snowcap and sand-coloured rocky base, and a tiny coral flag planted on the highest summit'),
    obj('key', 'a chunky classic key standing upright, a round coral head with a cream centre hole, a thick sand-coloured shaft and a teal toothed bit'),
    obj('trophy', 'a rounded trophy cup with two handles, glossy sand-gold and cream body, a deep teal base block, and a small coral star on the front'),
    obj('flag', 'a flag on a slim cream pole with a round sand-coloured base, the flag cloth a bold coral waving gently with a deep teal stripe along its edge', { anchor: 'bottom', fill: 0.92 }),
    { name: 'road-sky', key: null, ratio: '21:9', size: [2800, 1080], mode: 'cover', p: 'A clean, calm, minimal sky gradient background: warm off-white cream (#F7F4EE) at the top fading smoothly to a soft pale peach-sand at the bottom, completely smooth like a soft airbrushed gradient with fine paper grain, no clouds, no grey patches, no smudges, no sun, no objects, no horizon line, no text.' },
  ]
}
