// Brand Moodboard: ten photographs in one art direction (warm natural light, muted earthy grade, film grain). No people, no text.
export default () => {
  const LOOK = 'Warm natural window light, a muted earthy film grade (terracotta, olive, cream, dusty rose, deep aubergine shadows), soft visible film grain, gentle shallow depth of field, editorial lifestyle still-life photography, calm airy composition with generous negative space. No text, no letters, no logo, no watermark, no faces.'
  const ph = (name, ratio, size, what) => ({ name: `mood-${name}`, key: null, ratio, size, mode: 'cover', p: `${what} ${LOOK}` })
  return [
    ph('ceramics', '4:5', [1200, 1500], 'A stack of handmade speckled stoneware bowls beside a tall rounded vase on a simple wooden shelf, in front of a cream lime-plaster wall, the group centred in the frame.'),
    ph('candle', '3:2', [1920, 1280], 'A lit candle in a terracotta-coloured ceramic jar with a small steady flame, resting on folded natural linen on a wooden table beside a window, the candle centred in the frame with plenty of empty soft space to its left and right so the picture can be cropped to portrait or landscape.'),
    ph('coffee', '4:5', [1200, 1500], 'Close view of a hand and forearm (no face, no other body) pouring coffee from a small ceramic pot into a handmade cream cup on a wooden table, a thin stream of coffee, morning side light.'),
    ph('flowers', '3:4', [1200, 1600], 'Dried flowers and grasses (pampas, bunny tails, eucalyptus, dried roses in dusty pink) in a matte ceramic vase, against a warm plaster wall with a soft window shadow.'),
    ph('fruit', '4:3', [1600, 1200], 'A rustic wooden table with ripe figs, pears and a halved pomegranate on a crumpled linen napkin and a stoneware plate, seen from slightly above.'),
    ph('textile', '1:1', [1400, 1400], 'A neat stack of folded woven textiles and linen in terracotta, olive, cream and dusty rose, seen from the front, with a soft tactile weave.'),
    ph('cafe', '3:2', [1920, 1280], 'A quiet street cafe corner with two small round tables, bentwood chairs, potted plants and a warm painted wall, golden late-afternoon light, no people, the scene centred with space around it so it can be cropped to portrait or landscape.'),
    ph('notebook', '5:4', [1500, 1200], 'An open notebook with blank cream pages, a sharpened pencil, a few small fabric swatches and a dried leaf beside a ceramic cup on a wooden desk, seen from above.'),
    ph('plant', '3:4', [1200, 1600], 'A leafy green plant in a plain terracotta pot on a wooden windowsill, soft light through a sheer curtain, plaster wall behind.'),
    ph('shelf', '21:9', [2100, 900], 'A wide, low view of a long wooden shelf with a row of pillar candles, small ceramic cups and vases, evenly spaced, in front of a warm plaster wall.'),
  ]
}
