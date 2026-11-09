import { authored, at, rect, full, grid, W } from '../author'
import type { ObjDef, Place } from '../author'

/**
 * Brand Moodboard: a brand-identity book for a lifestyle brand, told as a photo shuffle. Nine photographs sit on a loose collage; on every scene they REARRANGE: one tile zooms to full-bleed and
 * becomes the slide (the others shrink into a thumbnail strip), then returns to the collage; the tiles line up as a film strip, become a 3 x 3 grid, then three tall application tiles. Six colour
 * swatches slide into a palette row and then become the dots of the type-scale specimen, a giant serif letter changes behind the collage, and an aubergine iris opens for the tone-of-voice quote.
 * Captions and thin rules travel with their tiles. Original choreography for SlidesDone.
 */
const C = { paper: '#F2EBDD', ink: '#1F1B16', terra: '#C65A3A', terraD: '#A9482B', olive: '#6B7240', rose: '#D9A5A0', aub: '#3A2433', mute: '#6E6457', pale: '#E8DDC8', paleD: '#4C3246', onDark: '#E8DECD' }

type Box = [number, number, number, number, number?]
const bx = (b: Box, extra: Partial<Place> = {}): Place => ({ x: b[0], y: b[1], w: b[2], h: b[3], ...(b[4] ? { rot: b[4] } : {}), ...extra })
const mir = (b: Box): Box => [W - b[0] - b[2], b[1], b[2], b[3], b[4] ? -b[4] : 0]
const tiles = (m: Record<string, Box>): Record<string, Place> => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, bx(v)]))
const mirrored = (m: Record<string, Box>): Record<string, Box> => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, mir(v)]))

/** the collage on the cover (right half): tiles of different shapes, a few turned, a few overlapping a neighbour */
const COV: Record<string, Box> = {
  t1: [810, 150, 260, 325, -2], t6: [1040, 110, 280, 280, 3], t2: [1350, 130, 300, 400], t4: [1620, 200, 200, 265, 2],
  t3: [1100, 370, 300, 375, -3], t5: [1380, 600, 440, 330], t7: [815, 520, 260, 195, 2], t9: [830, 745, 200, 265], t8: [1100, 800, 240, 192, 2],
}
/** contents: a taller, tighter collage with two tiles waiting off the slide */
const CON: Record<string, Box> = {
  t6: [1010, 140, 270, 270, 3], t1: [1300, 110, 250, 312, -2], t9: [1580, 150, 240, 320, 2], t3: [1030, 440, 300, 375, -3],
  t5: [1340, 470, 330, 248], t4: [1590, 520, 230, 306, 2], t7: [1360, 780, 300, 225, -2], t8: [1050, 840, 240, 180, 2],
}
/** thumbnails stacked along the right edge, or along the bottom edge */
const thumbsR = (ids: string[]): Record<string, Box> => Object.fromEntries(ids.map((id, i) => [id, [1752, 110 + i * 112, 128, 100, 0] as Box]))
const thumbsB = (ids: string[]): Record<string, Box> => Object.fromEntries(ids.map((id, i) => [id, [956 + i * 112, 950, 100, 80, 0] as Box]))
/** a film strip across the bottom */
const STRIP: Record<string, Box> = Object.fromEntries(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9'].map((id, i) => [id, [88 + i * 196, i % 2 ? 806 : 790, 176, 220, i % 2 ? 1.5 : -1.5] as Box]))
const GRID: Record<string, Box> = Object.fromEntries(grid(3, 3, 820, 100, 1020, 880, 16).map((p, i) => [`t${i + 1}`, [p.x, p.y, p.w, p.h, 0] as Box]))
const PER: Record<string, Box> = { t1: [90, 170, 300, 375, -2], t8: [440, 200, 320, 256, 3], t5: [130, 650, 360, 270, 2], t9: [550, 580, 260, 347, -2] }
const APP: Record<string, Box> = { t2: [100, 280, 390, 520, -1], t7: [586, 280, 693, 520], t3: [1375, 280, 416, 520, 1] }

const CAPS: Record<string, string> = { t1: 'Matte stoneware', t2: 'Candle and linen', t3: 'Morning pour', t4: 'Dried stems', t5: 'Figs and pears', t6: 'Woven stack', t7: 'Corner cafe', t8: 'Notes and swatches', t9: 'Terracotta and green' }
const cap = (m: Record<string, Box>, ids: string[], color = C.mute): Record<string, Place> => Object.fromEntries(ids.map((id) => {
  const b = m[id]!
  return [`cp${id.slice(1)}`, { x: b[0], y: b[1] + b[3] + 14, w: Math.max(b[2], 280), h: 30, color }]
}))
const dots = (x: number, y: number, d: number, gap: number): Record<string, Place> => Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`sw${i + 1}`, rect(x + i * (d + gap), y, d, d)]))
const HEAD = { brand: rect(80, 50, 500, 30), page: rect(1240, 50, 600, 30) }
const rule = (n: number, x: number, y: number, w: number, extra: Partial<Place> = {}): Record<string, Place> => ({ [`ru${n}`]: rect(x, y, w, 2, { a: 0.35, ...extra }) })

const tile = (art: string, alt: string, park: 'l' | 'r' | 't' | 'b'): ObjDef => ({ kind: 'image', art, alt, fit: 'cover', radius: 4, park })
const T = (id: string, text: string, px: number, o: Partial<Extract<ObjDef, { kind: 'text' }>> = {}): [string, ObjDef] => [id, { kind: 'text', text, px, weight: 400, color: C.mute, ...o }]
const swatch = (fill: string, stroke?: string): ObjDef => ({ kind: 'shape', shape: 'ellipse', fill, ...(stroke ? { stroke, strokeW: 2 } : {}) })

const PARKS: ('l' | 'r' | 't' | 'b')[] = ['l', 'r', 'b', 't', 'b', 'l', 'r', 'b', 'l']
const TILE_ART: [string, string][] = [
  ['mood-ceramics.webp', 'Speckled stoneware bowls and a vase on a wooden shelf'], ['mood-candle.webp', 'A lit candle in a terracotta jar on folded linen'], ['mood-coffee.webp', 'A hand pouring coffee into a handmade cup'],
  ['mood-flowers.webp', 'Dried flowers in a ceramic vase'], ['mood-fruit.webp', 'Figs, pears and a pomegranate on a wooden table'], ['mood-textile.webp', 'A stack of folded woven textiles'],
  ['mood-cafe.webp', 'A quiet street cafe corner in golden light'], ['mood-notebook.webp', 'A notebook, pencil and fabric swatches on a desk'], ['mood-plant.webp', 'A plant in a terracotta pot on a windowsill'],
]

const objects: Record<string, ObjDef> = {
  iris: { kind: 'shape', shape: 'ellipse', fill: C.aub },
  big: { kind: 'text', text: '&', px: 600, weight: 400, color: C.pale, face: 'heading', lh: 1, align: 'ctr' },
  ...Object.fromEntries(['t2', 't7', 't1', 't3', 't4', 't5', 't6', 't8', 't9'].map((id) => [id, tile(TILE_ART[Number(id.slice(1)) - 1]![0], TILE_ART[Number(id.slice(1)) - 1]![1], PARKS[Number(id.slice(1)) - 1]!)])),
  t10: { kind: 'image', art: 'mood-shelf.webp', alt: 'A long shelf of candles and ceramics', fit: 'cover', radius: 4 },
  veil: { kind: 'shape', fill: C.aub, park: 'l' },
  card: { kind: 'shape', fill: C.paper, radius: 4, park: 'l' },
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => T(`cp${i + 1}`, CAPS[`t${i + 1}`]!, 22, { weight: 500, color: C.mute, spc: 0.5, park: PARKS[i]! }))),
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`ru${i + 1}`, { kind: 'shape', fill: C.ink, park: 'l' } as ObjDef])),
  sw1: swatch(C.paper, C.ink), sw2: swatch(C.ink, C.paper), sw3: swatch(C.terra), sw4: swatch(C.olive), sw5: swatch(C.rose), sw6: swatch(C.aub, '#7A5A6E'),
  ...Object.fromEntries([T('brand', 'HEARTH & CLAY', 22, { weight: 600, color: C.ink, caps: true, spc: 6 }), T('page', 'Brand book  ·  Sample deck', 22, { weight: 500, color: C.mute, align: 'r' })]),
  ...Object.fromEntries([
    T('kick', '', 24, { weight: 600, color: C.terraD, caps: true, spc: 5 }),
    T('title', '', 76, { color: C.ink, face: 'heading', lh: 1.04, spc: -1 }),
    T('body', '', 30, { lh: 1.5 }),
    ...Array.from({ length: 8 }, (_, i) => T(`n${i + 1}`, '', 22, { weight: 600, color: C.terraD, caps: true, spc: 4 })),
    T('toc', '', 44, { color: C.ink, face: 'heading', lh: 84 / 44 }),
    ...[1, 2, 3].flatMap((i) => [
      T(`nu${i}`, '', 112, { color: C.terra, face: 'heading', lh: 1 }),
      T(`k${i}`, '', 22, { weight: 600, color: C.terraD, caps: true, spc: 4 }),
      T(`h${i}`, '', 40, { color: C.ink, face: 'heading', lh: 1.1 }),
      T(`d${i}`, '', 28, { lh: 1.45 }),
    ]),
    ...[1, 2, 3, 4, 5, 6].flatMap((i) => [
      T(`sn${i}`, '', 34, { color: C.ink, face: 'heading', align: 'ctr', lh: 1.1 }),
      T(`sx${i}`, '', 24, { weight: 500, align: 'ctr', lh: 1.45, spc: 1 }),
    ]),
    ...[1, 2, 3, 4, 5].flatMap((i) => [
      T(`sp${i}`, '', 44, { color: C.ink, face: 'heading', lh: 1 }),
      T(`lb${i}`, '', 22, { weight: 600, caps: true, spc: 3 }),
    ]),
  ]),
}

const order = ['iris', 'big', 't2', 't7', 't1', 't3', 't4', 't5', 't6', 't8', 't9', 't10', 'veil', 'card',
  ...Array.from({ length: 8 }, (_, i) => `ru${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `cp${i + 1}`), 'sw1', 'sw2', 'sw3', 'sw4', 'sw5', 'sw6', 'brand', 'page', 'kick', 'title', 'body', ...Array.from({ length: 8 }, (_, i) => `n${i + 1}`), 'toc',
  ...[1, 2, 3].flatMap((i) => [`nu${i}`, `k${i}`, `h${i}`, `d${i}`]), ...[1, 2, 3, 4, 5, 6].flatMap((i) => [`sn${i}`, `sx${i}`]), ...[1, 2, 3, 4, 5].flatMap((i) => [`sp${i}`, `lb${i}`])]

const PAL = [
  { n: 'Paper', hex: '#F2EBDD', r: 'Ground' }, { n: 'Ink', hex: '#1F1B16', r: 'Text' }, { n: 'Terracotta', hex: '#C65A3A', r: 'Signal' },
  { n: 'Olive', hex: '#6B7240', r: 'Calm' }, { n: 'Rose clay', hex: '#D9A5A0', r: 'Soft' }, { n: 'Aubergine', hex: '#3A2433', r: 'Depth' },
]
const DARK = { color: C.onDark }
const palette: Record<string, Place> = {}
PAL.forEach((p, i) => {
  const x = 140 + i * 280
  palette[`sw${i + 1}`] = rect(x, 360, 240, 240)
  palette[`sn${i + 1}`] = { ...rect(x - 20, 630, 280, 44), text: p.n }
  palette[`sx${i + 1}`] = { ...rect(x - 20, 682, 280, 72), text: `${p.hex}\n${p.r}` }
})
const SIZES = [72, 52, 38, 28, 20]
const SAMPLE: { y: number; h: number; text: string; px: number; lbl: string; o?: Partial<Place> }[] = [
  { y: 170, h: 118, text: 'Slow light', px: 104, lbl: 'Display  ·  DM Serif 104' },
  { y: 350, h: 74, text: 'Made by hand', px: 64, lbl: 'Headline  ·  DM Serif 64' },
  { y: 500, h: 56, text: 'Small batches, warm rooms', px: 44, lbl: 'Title  ·  DM Serif 44' },
  { y: 640, h: 44, text: 'Poured, cured and wrapped by hand.', px: 30, lbl: 'Body  ·  Inter 30' },
  { y: 770, h: 40, text: 'NEW  ·  REFILL  ·  LIMITED', px: 24, lbl: 'Label  ·  Inter 24, wide tracking' },
]
const specimen: Record<string, Place> = {}
SAMPLE.forEach((s, i) => {
  const mid = s.y + s.h / 2, d = SIZES[i]!
  specimen[`sw${i + 1}`] = rect(980 - d / 2, mid - d / 2, d, d)
  specimen[`sp${i + 1}`] = { ...rect(1080, s.y, 760, s.h), text: s.text, px: s.px, ...(i === 3 ? { color: C.ink } : {}), ...(i === 4 ? { color: C.terraD } : {}) }
  specimen[`lb${i + 1}`] = { ...rect(1080, s.y + s.h + 14, 760, 30), text: s.lbl }
})

export const MKT_MOODBOARD = authored(
  {
    id: 'mkt-moodboard', category: 'marketing', name: 'Brand Moodboard', tagline: 'A brand book told as a photo shuffle',
    description: 'A warm, editorial brand-identity deck where nine photographs shuffle on a loose collage: one tile zooms to full-bleed for the brand story, the tiles line up as a film strip, become a three by three photography grid and three application tiles, while colour swatches regroup into a palette and then the dots of a type scale.',
    audience: 'The Brand Moodboard template suits brand identity and brand guidelines presentations, rebrand pitches, moodboards and visual direction decks, lookbooks, creative portfolios and agency credentials for fashion, lifestyle, interiors, food and craft brands.',
    topics: ['brand identity', 'brand guidelines', 'brand book', 'moodboard', 'mood board', 'brand strategy', 'lookbook', 'creative portfolio', 'rebrand', 'visual identity', 'fashion', 'lifestyle', 'photography', 'interiors', 'candles', 'ceramics', 'coffee', 'packaging', 'tone of voice', 'colour palette', 'typography', 'creative brief', 'marketing', 'branding agency', 'art direction'],
    fonts: { heading: 'DM Serif Display', body: 'Inter' },
    colors: { background: C.paper, surface: '#E9DFCB', textPrimary: C.ink, textSecondary: C.mute, primary: C.terra, secondary: C.olive, accent: C.rose, onPrimary: '#FFFFFF' },
    background: C.paper,
  },
  {
    objects, order,
    scenes: [
      {
        id: 's1', title: 'Cover', bg: C.paper, purpose: 'The opening: nine photographs on a loose collage on the right, the brand name large on the left, six swatches underneath.',
        place: {
          big: { ...rect(860, 150, 900, 800), text: '&', px: 600 }, ...tiles(COV), ...HEAD, ...rule(1, 80, 226, 120, { a: 1, fill: C.terra }), ...dots(80, 866, 44, 18),
          kick: { ...rect(80, 248, 720, 34), text: 'BRAND BOOK  ·  VOL. 01' }, title: { ...rect(80, 300, 740, 380), text: 'Hearth\n& Clay', px: 190 },
          body: { ...rect(80, 712, 700, 100), text: 'Candles and ceramics for slow, warm rooms.', px: 30 },
        },
      },
      {
        id: 's2', title: 'Contents', bg: C.paper, purpose: 'The collage regroups into a tighter cluster on the right while eight chapters line up on the left between thin rules.',
        place: {
          big: { ...rect(700, 200, 600, 700), text: 'A', px: 600 }, ...tiles(CON), ...HEAD, ...dots(80, 985, 32, 16),
          ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`ru${i + 1}`, rect(80, 262 + i * 84, 800, 2, { a: 0.3 })])),
          kick: { ...rect(80, 108, 600, 34), text: 'CONTENTS' }, title: { ...rect(80, 146, 900, 90), text: 'Inside the book', px: 76 },
          ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`n${i + 1}`, { ...rect(80, 262 + i * 84 + 26, 100, 32), text: `0${i + 1}` }])), toc: { ...rect(190, 262, 700, 672), text: 'Our story\nThree promises\nThe audience\nTone of voice\nColour\nType\nPhotography\nIn the world', px: 44 },
        },
      },
      {
        id: 's3', title: 'Brand story', bg: C.paper, purpose: 'The candle tile zooms to full-bleed and becomes the slide; the other tiles shrink into a thumbnail strip on the right edge and a plum panel carries the story.',
        place: {
          big: { ...rect(850, 150, 900, 800), text: '01', px: 600 },
          ...tiles({ t2: [0, 0, 1920, 1080, 0], ...thumbsR(['t1', 't3', 't4', 't5', 't6', 't7', 't8', 't9']) }), t2: full({ radius: 0 }),
          veil: rect(0, 0, 990, 1080, { a: 0.9 }), ...cap({ t2: [1100, 0, 600, 996] }, ['t2'], '#FFFFFF'), ...dots(120, 950, 40, 16), ...rule(1, 120, 492, 120, { fill: C.rose, a: 1 }),
          brand: { ...HEAD.brand, color: C.onDark }, page: { ...HEAD.page, a: 0 },
          kick: { ...rect(120, 196, 700, 34), text: '01  ·  OUR STORY', color: C.rose }, title: { ...rect(120, 250, 860, 200), text: 'Made slowly,\nlit warmly.', px: 84, ...DARK },
          body: { ...rect(120, 524, 760, 340), text: 'Hearth & Clay began on a shared kitchen table: one potter, one chandler and a belief that a room feels finished when something in it was made by hand. We pour small batches of soy candles into our own stoneware, so nothing is thrown away and every jar can be refilled.', ...DARK },
        },
      },
      {
        id: 's4', title: 'Three promises', bg: C.paper, purpose: 'The tiles leave the full-bleed image and line up as a film strip along the bottom while three numbered promises sit above it.',
        place: {
          big: { ...rect(1240, -20, 640, 700), text: '3', px: 600 }, ...tiles(STRIP), ...HEAD, ...dots(80, 252, 36, 16),
          ...rule(1, 80, 470, 520), ...rule(2, 700, 470, 520), ...rule(3, 1320, 470, 520),
          kick: { ...rect(80, 104, 800, 34), text: '02  ·  THREE PROMISES' }, title: { ...rect(80, 142, 1300, 100), text: 'What we never trade away', px: 76 },
          nu1: { ...rect(80, 320, 300, 130), text: '01' }, nu2: { ...rect(700, 320, 300, 130), text: '02' }, nu3: { ...rect(1320, 320, 300, 130), text: '03' },
          h1: { ...rect(80, 492, 520, 52), text: 'Made by hand' }, h2: { ...rect(700, 492, 520, 52), text: 'Made to be kept' }, h3: { ...rect(1320, 492, 520, 52), text: 'Made honestly' },
          d1: { ...rect(80, 558, 520, 130), text: 'Every piece is poured, thrown or finished by a person we can name.' }, d2: { ...rect(700, 558, 520, 130), text: 'Refillable jars, repairable ceramics and packaging worth reusing.' }, d3: { ...rect(1320, 558, 520, 130), text: 'Plain ingredients, fair prices and a clear account of where things come from.' },
        },
      },
      {
        id: 's5', title: 'Audience', bg: C.paper, purpose: 'Four tiles of her shelf, desk, table and windowsill gather on the left, each with a caption, while the persona and three facts line up on the right.',
        place: {
          big: { ...rect(340, 120, 700, 800), text: 'a', px: 600 }, ...tiles(PER), ...cap(PER, ['t1', 't8', 't5', 't9']), ...HEAD, ...dots(960, 968, 32, 16),
          ...rule(1, 960, 604, 880), ...rule(2, 960, 716, 880), ...rule(3, 960, 828, 880),
          kick: { ...rect(960, 140, 800, 34), text: '03  ·  THE AUDIENCE' }, title: { ...rect(960, 186, 880, 170), text: 'Meet Maya,\nthirty-four.', px: 72 },
          body: { ...rect(960, 382, 860, 190), text: 'A designer who rents a small flat and keeps it like a studio. She buys fewer, better things and tells friends about the ones that last.' },
          k1: { ...rect(960, 620, 300, 30), text: 'Home' }, d1: { ...rect(960, 654, 880, 44), text: 'A rented flat she keeps like a studio', color: C.ink, px: 30 },
          k2: { ...rect(960, 732, 300, 30), text: 'Spends' }, d2: { ...rect(960, 766, 880, 44), text: 'About 35 to 80 pounds on things she keeps for years', color: C.ink, px: 30 },
          k3: { ...rect(960, 844, 300, 30), text: 'Follows' }, d3: { ...rect(960, 878, 880, 44), text: 'Makers, interiors and slow-living journals', color: C.ink, px: 30 },
        },
      },
      {
        id: 's6', title: 'Tone of voice', bg: C.paper, purpose: 'A plum iris opens from the centre and fills the slide; one tile slips to the right and a giant quotation mark holds the brand voice.',
        place: {
          iris: rect(960 - 1500, 540 - 1500, 3000, 3000), big: { ...rect(40, 10, 700, 1000), text: '“', px: 600, color: C.paleD },
          t3: bx([1470, 150, 330, 412, 3]), ...cap({ t3: [1470, 150, 330, 412] }, ['t3'], C.onDark), ...dots(1470, 880, 40, 16),
          ...rule(1, 200, 730, 380, { fill: C.rose, a: 0.6 }), ...rule(2, 620, 730, 380, { fill: C.rose, a: 0.6 }), ...rule(3, 1040, 730, 380, { fill: C.rose, a: 0.6 }),
          brand: { ...HEAD.brand, color: C.onDark }, page: { ...HEAD.page, color: '#BFAF9D' },
          kick: { ...rect(200, 250, 800, 34), text: '04  ·  TONE OF VOICE', color: C.rose }, title: { ...rect(200, 304, 1180, 260), text: 'We speak the way we make: plainly, warmly, and never in a hurry.', px: 76, color: C.paper },
          body: { ...rect(200, 590, 900, 40), text: 'Our promise to every customer, in one sentence.', px: 28, color: C.rose },
          h1: { ...rect(200, 752, 380, 50), text: 'Warm, not cosy', px: 38, ...DARK }, h2: { ...rect(620, 752, 380, 50), text: 'Plain, not blunt', px: 38, ...DARK }, h3: { ...rect(1040, 752, 380, 50), text: 'Quiet, not silent', px: 38, ...DARK },
          d1: { ...rect(200, 806, 380, 90), text: 'We welcome people; we never gush.', color: '#CBBFAE' }, d2: { ...rect(620, 806, 380, 90), text: 'Short words, clear facts, no jargon.', color: '#CBBFAE' }, d3: { ...rect(1040, 806, 380, 90), text: 'We speak when we have something to add.', color: '#CBBFAE' },
        },
      },
      {
        id: 's7', title: 'Palette', bg: C.paper, purpose: 'The iris closes and the tiles are gone; the six swatches grow into a palette row with names, codes and roles.',
        place: {
          big: { ...rect(560, 100, 800, 860), text: 'C', px: 600 }, ...HEAD, ...palette, ...rule(1, 120, 820, 1680),
          kick: { ...rect(80, 104, 800, 34), text: '05  ·  COLOUR' }, title: { ...rect(80, 142, 1500, 100), text: 'A palette from the studio floor', px: 76 },
          body: { ...rect(120, 850, 1560, 100), text: 'Paper and ink carry most of every layout. Terracotta is the single loud note: one use per slide.' },
        },
      },
      {
        id: 's8', title: 'Typography', bg: C.paper, purpose: 'Five swatches shrink into the dots of a type scale, each beside its sample; a giant Aa and the font names sit on the left.',
        place: {
          big: { ...rect(60, 150, 840, 660), text: 'Aa', px: 600 }, ...HEAD, ...specimen, sw6: rect(80, 866, 28, 28),
          kick: { ...rect(80, 104, 700, 34), text: '06  ·  TYPOGRAPHY' }, title: { ...rect(126, 850, 760, 110), text: 'DM Serif Display\nwith Inter', px: 44 },
        },
      },
      {
        id: 's9', title: 'Photography direction', bg: C.paper, purpose: 'Every tile glides in from its edge and snaps into a three by three grid; three principles sit on the left.',
        place: {
          big: { ...rect(-40, 140, 900, 700), text: 'f/2', px: 520, color: '#EEE5D2' }, ...tiles(GRID), ...HEAD, ...dots(80, 975, 32, 16),
          ...rule(1, 80, 440, 660), ...rule(2, 80, 600, 660), ...rule(3, 80, 760, 660),
          kick: { ...rect(80, 104, 700, 34), text: '07  ·  PHOTOGRAPHY' }, title: { ...rect(80, 150, 700, 190), text: 'Warm light,\nquiet frames.', px: 76 },
          h1: { ...rect(80, 460, 660, 46), text: 'Light first', px: 36 }, h2: { ...rect(80, 620, 660, 46), text: 'Hands, not faces', px: 36 }, h3: { ...rect(80, 780, 660, 46), text: 'Quiet crops', px: 36 },
          d1: { ...rect(80, 512, 660, 84), text: 'Shoot beside a window; let shadows stay soft.', px: 26 }, d2: { ...rect(80, 672, 660, 84), text: 'Show the maker’s hands and objects in use.', px: 26 }, d3: { ...rect(80, 832, 660, 84), text: 'Leave a third of every frame empty.', px: 26 },
        },
      },
      {
        id: 's10', title: 'In the world', bg: C.paper, purpose: 'The cafe corner tile zooms to full-bleed and becomes the slide; the grid collapses into a thumbnail row along the bottom edge and a paper card carries the text.',
        place: {
          big: { ...rect(860, 150, 900, 800), text: '08', px: 600 },
          ...tiles({ t7: [0, 0, 1920, 1080, 0], ...thumbsB(['t1', 't2', 't3', 't4', 't5', 't6', 't8', 't9']) }), t7: full({ radius: 0 }),
          card: rect(80, 460, 820, 520, { a: 1 }), ...dots(130, 900, 36, 16), ...rule(1, 130, 712, 120, { fill: C.terra, a: 1 }),
          brand: { ...HEAD.brand, color: C.onDark }, page: { ...HEAD.page, a: 0 },
          kick: { ...rect(130, 506, 700, 34), text: '08  ·  IN THE WORLD' }, title: { ...rect(130, 552, 720, 140), text: 'A corner that feels\nlike home', px: 64 },
          body: { ...rect(130, 738, 720, 130), text: 'Stores, pop-ups and cafe partners borrow the same ingredients: warm light, natural materials and one terracotta accent.' },
        },
      },
      {
        id: 's11', title: 'Applications', bg: C.paper, purpose: 'Three tall tiles for packaging, the store and social slide into place, each with a thin rule, a label and a one-line brief.',
        place: {
          big: { ...rect(1150, -80, 800, 700), text: '09', px: 600 }, ...tiles(APP), ...HEAD, ...dots(1440, 160, 40, 16),
          ...rule(1, 100, 828, 390), ...rule(2, 586, 828, 693), ...rule(3, 1375, 828, 416),
          kick: { ...rect(100, 104, 800, 34), text: '09  ·  APPLICATIONS' }, title: { ...rect(100, 146, 1200, 100), text: 'One look, three places', px: 76 },
          k1: { ...rect(100, 848, 390, 30), text: '01  ·  Packaging' }, k2: { ...rect(586, 848, 693, 30), text: '02  ·  Store' }, k3: { ...rect(1375, 848, 416, 30), text: '03  ·  Social' },
          d1: { ...rect(100, 886, 390, 90), text: 'Terracotta jars and linen wraps.' }, d2: { ...rect(586, 886, 693, 90), text: 'Warm light, wood and a plant by every window.' }, d3: { ...rect(1375, 886, 416, 90), text: 'Square crops and a quiet caption.' },
        },
      },
      {
        id: 's12', title: 'Thank you', bg: C.paper, purpose: 'The collage returns, mirrored to the left, and the closing words and contact details take the right side, echoing the cover.',
        place: {
          big: { ...rect(160, 150, 900, 800), text: '&', px: 600 }, ...tiles(mirrored(COV)), ...HEAD, ...rule(1, 1180, 596, 120), ...dots(1180, 782, 36, 16),
          t10: bx([1180, 840, 450, 193]),
          kick: { ...rect(1180, 108, 660, 34), text: 'LET’S MAKE SOMETHING WARM' }, title: { ...rect(1180, 150, 660, 380), text: 'Thank\nyou.', px: 190 },
          body: { ...rect(1180, 620, 660, 140), text: 'studio@hearthandclay.example\n@hearthandclay\nhearthandclay.example', px: 30 },
        },
      },
    ],
  },
)
void at
