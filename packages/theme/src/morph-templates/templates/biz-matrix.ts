import { authored, at, full, rect } from '../author'
import type { ObjDef, Place } from '../author'

/**
 * Strategy Matrix: a light, Bauhaus-minded strategy deck built on one 2 x 2 matrix of four colour tiles (Grow red, Optimise blue, Explore yellow, Protect ink), each with a
 * geometric mark. The cover assembles the tiles into the title block; every quadrant then gets its own scene by ZOOM-THROUGH (its tile grows until it IS the slide and its
 * big words sit on it, the next tile rises behind it); the tiles shrink into a treemap of the investment mix, into dots on impact and effort axes, into bars on a roadmap,
 * into a stripe under the decision, and back into the cover's block for the close. Original choreography for SlidesDone.
 */
const C = { cream: '#F3EEE4', ink: '#121212', ink2: '#3A362F', mute: '#6A655B', red: '#E4372B', blue: '#1E4FD6', yellow: '#FFC42E' }
type K = 'R' | 'B' | 'Y' | 'K'
const KEYS: K[] = ['R', 'B', 'Y', 'K']
const FILL: Record<K, string> = { R: C.red, B: C.blue, Y: C.yellow, K: C.ink }
const MARK: Record<K, string> = { R: C.cream, B: C.yellow, Y: C.ink, K: C.red }
/** colour of the words that sit ON a tile of this colour */
const ONTILE: Record<K, string> = { R: C.cream, B: C.cream, Y: C.ink, K: C.cream }

/** a half circle (flat side down) as a polygon in a box twice as wide as high */
const HALF = Array.from({ length: 16 }, (_, i) => { const t = Math.PI + (Math.PI * i) / 15; return [Math.round((0.5 + 0.5 * Math.cos(t)) * 1000) / 1000, Math.round((1 + Math.sin(t)) * 1000) / 1000] })

const sq = (x: number, y: number, s: number, extra: Partial<Place> = {}): Place => rect(x, y, s, s, extra)
/** the mark of a tile in a square cell (the half circle sits on the floor of its cell) */
const mk = (k: K, x: number, y: number, s: number, extra: Partial<Place> = {}): Place => (k === 'K' ? rect(x, y + s / 2, s, s / 2, extra) : sq(x, y, s, extra))
const inset = (p: Place, g = 3): Place => rect(p.x + g, p.y + g, p.w - 2 * g, p.h - 2 * g)
/** the label box of a tile: bottom-left inside it */
const lab = (t: Place, px: number, pad: number, extra: Partial<Place> = {}): Place => rect(t.x + pad, t.y + t.h - pad - px * 1.2, t.w - 2 * pad, px * 1.2, extra)

/** the four quadrants of the matrix overview, and of the cover / closing blocks */
const Q: Record<K, Place> = { R: sq(1000, 190, 360), B: sq(1360, 190, 360), Y: sq(1000, 550, 360), K: sq(1360, 550, 360) }
const block = (x: number, y: number, s: number): Record<K, Place> => ({ R: sq(x, y, s), B: sq(x + s, y, s), Y: sq(x, y + s, s), K: sq(x + s, y + s, s) })
const CV = block(1100, 100, 300)
const CL = block(100, 100, 300)
/** the treemap of the investment mix */
const TM: Record<K, Place> = { R: inset(rect(100, 270, 440, 710)), B: inset(rect(540, 270, 660, 355)), Y: inset(rect(540, 625, 330, 355)), K: inset(rect(870, 625, 330, 355)) }
/** the impact / effort dots: centre and size */
const DOT: Record<K, [number, number, number]> = { R: [700, 360, 100], B: [440, 500, 84], Y: [1100, 390, 72], K: [600, 730, 72] }
const dot = (k: K): Place => { const [cx, cy, s] = DOT[k]; return sq(cx - s / 2, cy - s / 2, s) }
/** the roadmap bars */
const ROW_Y: Record<K, number> = { R: 320, B: 480, Y: 640, K: 800 }
const BAR: Record<K, Place> = { R: rect(620, ROW_Y.R, 860, 100), B: rect(545, ROW_Y.B, 650, 100), Y: rect(1170, ROW_Y.Y, 625, 100), K: rect(545, ROW_Y.K, 1250, 100) }
/** the agenda rows */
const AG: Record<K, Place> = { R: sq(900, 125, 160), B: sq(900, 340, 160), Y: sq(900, 555, 160), K: sq(900, 770, 160) }
/** the decision stripe */
const ST: Record<K, Place> = { R: rect(0, 880, 480, 200), B: rect(480, 880, 480, 200), Y: rect(960, 880, 480, 200), K: rect(1440, 880, 480, 200) }

const tx = (px: number, weight: number, color: string, o: Partial<Extract<ObjDef, { kind: 'text' }>> = {}): ObjDef => ({ kind: 'text', text: '', px, weight, color, ...o })
const NAME: Record<K, string> = { R: 'Grow', B: 'Optimise', Y: 'Explore', K: 'Protect' }
const NAME_PX: Record<K, number> = { R: 310, B: 200, Y: 225, K: 225 }

// the words of the four zoom-through scenes
const ZOOM: Record<K, { k: string; s: string; v: string; l: string; i: [string, string][] }> = {
  R: { k: '01  ·  TODAY  ·  OFFENCE', s: 'Win more of the customers and markets we already serve.', v: '+12%', l: 'Revenue growth target for the year (sample figure)',
    i: [['Open two new regions', 'Singapore and Toronto, each with a local partner, live by the third quarter.'], ['Raise the average deal', 'Bundle onboarding and support into one annual plan.'], ['Win back lapsed accounts', 'A named owner and a clear offer for every account lost in 2025.']] },
  B: { k: '02  ·  TODAY  ·  DEFENCE', s: 'Make what we already do faster, cheaper and more reliable.', v: '18%', l: 'Target cut in cost to serve each customer (sample figure)',
    i: [['Shorten order to cash', 'From 21 days to 14 by automating invoicing and approvals.'], ['Consolidate suppliers', 'Move from forty vendors to a preferred list of twelve.'], ['Standardise the playbook', 'One way to onboard, support and renew in every market.']] },
  Y: { k: '03  ·  TOMORROW  ·  OFFENCE', s: 'Place a few small, fast bets on where the next business could come from.', v: '3', l: 'Pilots at any one time, each with a 90 day scale or stop review',
    i: [['A partner marketplace', 'Let other firms sell on our platform and share the revenue.'], ['A service assistant', 'Test a self-service assistant with ten friendly customers.'], ['A neighbouring segment', 'Interview thirty buyers in a nearby industry before we build.']] },
  K: { k: '04  ·  TOMORROW  ·  DEFENCE', s: 'Guard the base against the risks that could undo the other three.', v: '0', l: 'Critical incidents or audit findings left open (the target)',
    i: [['Security and privacy', 'An annual penetration test and one named data owner per system.'], ['Supplier resilience', 'A back-up source for every critical input we buy.'], ['Key-person cover', 'Two trained deputies for each critical role.']] },
}
const BAR_TEXT: Record<K, string> = { R: 'Launch in Singapore and Toronto', B: 'Cut order to cash to 14 days', Y: 'Run three 90 day pilots', K: 'Security, supplier and key-person reviews, all year' }
const PCT: Record<K, string> = { R: '40%', B: '30%', Y: '15%', K: '15%' }

/** the zoom-through scene of one quadrant: its tile is the slide, its words and a big mark sit on it */
function zoomPlace(k: K, ink: boolean): Record<string, Place> {
  const z = ZOOM[k], p = ink ? 'y' : 'z', out: Record<string, Place> = {}
  out[`${p}k`] = { ...rect(100, 100, 900, 36), text: z.k }
  out[`n${k}`] = { ...rect(100, 150, 1000, 380), text: NAME[k], px: NAME_PX[k] }
  out[`${p}s`] = { ...rect(100, 580, 900, 170), text: z.s }
  out[`${p}v`] = { ...rect(100, 800, 380, 130), text: z.v }
  out[`${p}l`] = { ...rect(500, 818, 520, 100), text: z.l }
  z.i.forEach(([h, t], i) => {
    const y = 130 + i * 210
    out[`r${i + 1}`] = { ...rect(1160, y, 660, 3), a: 0.55, fill: ink ? C.ink : C.cream }
    out[`${p}h${i + 1}`] = { ...rect(1160, y + 28, 660, 48), text: h }
    out[`${p}t${i + 1}`] = { ...rect(1160, y + 86, 660, 90), text: t }
  })
  out[`m${k}`] = k === 'K' ? mk(k, 1610, 770, 210) : mk(k, 1610, 770, 210)
  return out
}

const objects: Record<string, ObjDef> = {
  grain: { kind: 'image', art: 'matrix-grain.webp', alt: 'Warm cream paper with a fine grain' },
  wash: { kind: 'shape', fill: C.cream },
  // guide lines (impact / effort axes, then the roadmap's quarter lines)
  ln1: { kind: 'shape', fill: C.ink }, hz: { kind: 'shape', fill: C.ink }, ln2: { kind: 'shape', fill: C.ink }, mh: { kind: 'shape', fill: C.ink },
  ln3: { kind: 'shape', fill: C.ink }, ln4: { kind: 'shape', fill: C.ink }, ln5: { kind: 'shape', fill: C.ink },
  // the four tiles (back to front: a tile that grows covers the one before it)
  tK: { kind: 'shape', fill: C.ink }, tB: { kind: 'shape', fill: C.blue, park: 'r' }, tR: { kind: 'shape', fill: C.red, park: 'l' }, tY: { kind: 'shape', fill: C.yellow, park: 'b' },
  r1: { kind: 'shape', fill: C.cream }, r2: { kind: 'shape', fill: C.cream }, r3: { kind: 'shape', fill: C.cream },
  solids: { kind: 'image', art: 'matrix-solids.webp', alt: 'A still life of a red sphere, blue cube, yellow cone and black cylinder', park: 'b' },
  mK: { kind: 'shape', shape: 'rect', poly: HALF, fill: C.red, park: 'r' }, mB: { kind: 'shape', fill: C.yellow, park: 'r' }, mR: { kind: 'shape', shape: 'ellipse', fill: C.cream, park: 'r' }, mY: { kind: 'shape', shape: 'triangle', fill: C.ink, park: 'r' },
  // general words on cream
  k: tx(26, 700, C.red, { caps: true, spc: 5 }),
  title: tx(176, 800, C.ink, { face: 'heading', lh: 1, spc: -3 }),
  body: tx(32, 400, C.ink2, { lh: 1.4 }),
  foot: tx(24, 500, C.mute),
  ch1: tx(24, 700, C.mute, { caps: true, spc: 5, align: 'ctr' }), ch2: tx(24, 700, C.mute, { caps: true, spc: 5, align: 'ctr' }),
  rh1: tx(24, 700, C.mute, { caps: true, spc: 5, align: 'ctr' }), rh2: tx(24, 700, C.mute, { caps: true, spc: 5, align: 'ctr' }),
  stat: tx(150, 800, C.ink, { face: 'heading', lh: 1, spc: -4 }), statLabel: tx(28, 400, C.ink2, { lh: 1.4 }),
  q1: tx(22, 700, C.mute, { caps: true, spc: 4 }), q2: tx(22, 700, C.mute, { caps: true, spc: 4, align: 'r' }), q3: tx(22, 700, C.mute, { caps: true, spc: 4 }), q4: tx(22, 700, C.mute, { caps: true, spc: 4, align: 'r' }),
  ax1: tx(22, 700, C.mute, { caps: true, spc: 4 }), ax2: tx(22, 700, C.mute, { caps: true, spc: 4, align: 'r' }), ax3: tx(22, 700, C.mute, { caps: true, spc: 4, align: 'ctr' }), ax4: tx(22, 700, C.mute, { caps: true, spc: 4, align: 'ctr' }),
  qh1: tx(24, 700, C.mute, { caps: true, spc: 5, align: 'ctr' }), qh2: tx(24, 700, C.mute, { caps: true, spc: 5, align: 'ctr' }), qh3: tx(24, 700, C.mute, { caps: true, spc: 5, align: 'ctr' }), qh4: tx(24, 700, C.mute, { caps: true, spc: 5, align: 'ctr' }),
}
for (const k of KEYS) {
  objects[`n${k}`] = tx(48, 800, ONTILE[k], { face: 'heading', lh: 1, spc: -2, anchor: 'b', park: 'r' })
  objects[`l${k}`] = tx(40, 800, C.ink, { face: 'heading', lh: 1, spc: -1 })
  objects[`d${k}`] = tx(28, 400, C.ink2, { lh: 1.35 })
  objects[`p${k}`] = tx(80, 800, ONTILE[k], { face: 'heading', lh: 1, spc: -2 })
  objects[`b${k}`] = tx(28, 600, ONTILE[k], { anchor: 'ctr' })
}
for (const [p, col] of [['z', C.cream], ['y', C.ink]] as const) {
  objects[`${p}k`] = tx(26, 700, col, { caps: true, spc: 5 })
  objects[`${p}s`] = tx(44, 600, col, { lh: 1.3 })
  objects[`${p}v`] = tx(110, 800, col, { face: 'heading', lh: 1, spc: -3 })
  objects[`${p}l`] = tx(28, 500, col, { lh: 1.35 })
  for (let i = 1; i <= 3; i++) {
    objects[`${p}h${i}`] = tx(34, 800, col, { face: 'heading', lh: 1.1 })
    objects[`${p}t${i}`] = tx(28, 400, col, { lh: 1.4 })
  }
}

const order = ['grain', 'wash', 'ln1', 'hz', 'ln2', 'mh', 'ln3', 'ln4', 'ln5', 'tK', 'tB', 'tR', 'tY', 'r1', 'r2', 'r3', 'solids', 'mK', 'mB', 'mR', 'mY',
  'k', 'title', 'body', 'foot', 'ch1', 'ch2', 'rh1', 'rh2', 'stat', 'statLabel', 'q1', 'q2', 'q3', 'q4', 'ax1', 'ax2', 'ax3', 'ax4', 'qh1', 'qh2', 'qh3', 'qh4',
  ...KEYS.flatMap((k) => [`n${k}`, `l${k}`, `d${k}`, `p${k}`, `b${k}`]),
  ...['z', 'y'].flatMap((p) => [`${p}k`, `${p}s`, `${p}v`, `${p}l`, ...[1, 2, 3].flatMap((i) => [`${p}h${i}`, `${p}t${i}`])]),
]

/** a tile with its mark and its name inside it (cover, overview, treemap, closing, stripe) */
function tiles(set: Record<K, Place>, o: { markS: number; pad: number; px: number; names?: boolean }): Record<string, Place> {
  const out: Record<string, Place> = {}
  for (const k of KEYS) {
    const t = set[k]
    out[`t${k}`] = t
    out[`m${k}`] = mk(k, t.x + o.pad, t.y + o.pad, o.markS)
    if (o.names !== false) out[`n${k}`] = { ...lab(t, o.px, o.pad), text: NAME[k], px: o.px }
  }
  return out
}
/** the same tiles with nothing in them but the mark, for the small sizes */
const AGENDA_COPY: Record<K, string> = { R: 'Win more of the customers we already serve', B: 'Run what we do faster, cheaper and safer', Y: 'Test a few small bets on what comes next', K: 'Guard the base against the big risks' }

export const BIZ_MATRIX = authored(
  {
    id: 'biz-matrix', category: 'business', name: 'Strategy Matrix', tagline: 'Four bets on one page, each one zoomed through',
    description: 'A light, Bauhaus-minded strategy deck built on a 2 x 2 matrix of colour tiles. The cover assembles the tiles; every quadrant (grow, optimise, explore, protect) then fills the whole slide in its own colour before handing over to the next; the tiles shrink into a budget treemap, dots on impact and effort axes, roadmap bars, a decision stripe and the close.',
    audience: 'The Strategy Matrix template suits strategy reviews, annual and quarterly business planning, consulting readouts, OKR and portfolio reviews, SWOT-style workshops, management and board updates and any talk that sorts a lot of work into a few clear themes.',
    topics: ['strategy', 'business strategy', 'strategic plan', 'strategic planning', 'business plan', 'business planning', 'annual plan', 'annual review', 'quarterly review', 'consulting', 'consultant', 'management', 'leadership', 'executive', 'board', 'okr', 'okrs', 'objectives', 'key results', 'swot', 'matrix', '2x2', 'portfolio', 'prioritisation', 'prioritization', 'roadmap', 'growth', 'operations', 'innovation', 'risk', 'investment', 'budget', 'transformation', 'planning', 'workshop'],
    fonts: { heading: 'Poppins', body: 'DM Sans' },
    colors: { background: '#F3EEE4', surface: '#FFFFFF', textPrimary: '#121212', textSecondary: '#3A362F', primary: '#E4372B', secondary: '#1E4FD6', accent: '#FFC42E', onPrimary: '#F3EEE4' },
    background: '#F3EEE4',
  },
  {
    objects, order,
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The four tiles sit together as a block beside the title, with the still life of solids standing under them.', bg: C.cream,
        place: {
          grain: full(), wash: full({ a: 0.6 }), ...tiles(CV, { markS: 110, pad: 28, px: 40 }), solids: rect(1140, 800, 560, 280),
          k: { ...rect(100, 200, 900, 36), text: 'ANNUAL STRATEGY REVIEW  ·  SAMPLE DECK' },
          title: { ...rect(100, 262, 960, 380), text: 'Strategy\nMatrix', px: 176 },
          body: { ...rect(100, 690, 860, 110), text: 'Four bets, one page: where we grow, optimise, explore and protect.', px: 34 },
          foot: { ...rect(100, 960, 700, 30), text: 'Prepared for the leadership team  ·  FY2027' },
        },
      },
      {
        id: 's2', title: 'Agenda', purpose: 'The tiles stack into a column of four rows, one per theme, with a line saying what each one is for.', bg: C.cream,
        place: {
          grain: full(), wash: full({ a: 0.6 }), ...Object.fromEntries(KEYS.flatMap((k) => [[`t${k}`, AG[k]], [`m${k}`, mk(k, AG[k].x + 50, AG[k].y + 50, 60)], [`l${k}`, { ...rect(1100, AG[k].y + 8, 720, 64), text: NAME[k], px: 52 }], [`d${k}`, { ...rect(1100, AG[k].y + 84, 700, 76), text: AGENDA_COPY[k] }]])),
          k: { ...rect(100, 270, 700, 36), text: 'AGENDA  ·  40 MINUTES' },
          title: { ...rect(100, 320, 760, 200), text: 'Four themes,\none decision', px: 84 },
          body: { ...rect(100, 560, 640, 200), text: 'We look at each theme in turn, rank the bets by impact and effort, then agree the roadmap and the one decision we need today.', px: 30 },
        },
      },
      {
        id: 's3', title: 'The matrix', purpose: 'The four tiles form the 2 x 2 matrix on the right, with its two axes named: offence or defence, today or tomorrow.', bg: C.cream,
        place: {
          grain: full(), wash: full({ a: 0.6 }), ...tiles(Q, { markS: 120, pad: 36, px: 48 }),
          k: { ...rect(100, 300, 800, 36), text: 'THE MATRIX' },
          title: { ...rect(100, 350, 820, 190), text: 'One page,\nfour bets', px: 84 },
          body: { ...rect(100, 570, 700, 220), text: 'Every initiative we run lives in one of four boxes. Each box has an owner, a budget and a single question to answer.', px: 30 },
          ch1: { ...rect(1000, 130, 360, 32), text: 'OFFENCE' }, ch2: { ...rect(1360, 130, 360, 32), text: 'DEFENCE' },
          rh1: { ...rect(952 - 180, 370 - 16, 360, 32, { rot: -90 }), text: 'TODAY' }, rh2: { ...rect(952 - 180, 730 - 16, 360, 32, { rot: -90 }), text: 'TOMORROW' },
        },
      },
      {
        id: 's4', title: 'Grow', purpose: 'The red tile grows until it is the whole slide; Grow, its three moves and a target sit on it.', bg: C.red,
        place: { tR: full(), tB: Q.B, tK: Q.K, ...zoomPlace('R', false) },
      },
      {
        id: 's5', title: 'Optimise', purpose: 'The red tile shrinks away and fades as the blue tile rises behind it and fills the slide.', bg: C.blue,
        place: { tB: full(), tR: at(Q.R, { a: 0 }), tK: Q.K, ...zoomPlace('B', false) },
      },
      {
        id: 's6', title: 'Investment mix', purpose: 'The blue tile shrinks into a treemap: four tiles whose areas show how the budget is split (sample split).', bg: C.cream,
        place: {
          grain: full(), wash: full({ a: 0.6 }), ...tiles(TM, { markS: 80, pad: 28, px: 44 }),
          ...Object.fromEntries(KEYS.map((k) => [`p${k}`, { ...rect(TM[k].x + 28, TM[k].y + 24, 200, 90), text: PCT[k] }])),
          mR: mk('R', TM.R.x + TM.R.w - 108, TM.R.y + 28, 80), mB: mk('B', TM.B.x + TM.B.w - 108, TM.B.y + 28, 80), mY: mk('Y', TM.Y.x + TM.Y.w - 108, TM.Y.y + 28, 80), mK: mk('K', TM.K.x + TM.K.w - 108, TM.K.y + 28, 80),
          k: { ...rect(100, 74, 1100, 34), text: 'INVESTMENT MIX  ·  SAMPLE SPLIT' },
          title: { ...rect(100, 132, 1150, 110), text: 'Where the money goes', px: 76 },
          body: { ...rect(1300, 270, 520, 260), text: 'Growth keeps the biggest share. Explore is a fixed pot, so a failed pilot never drains the core business.', px: 30 },
          stat: { ...rect(1300, 590, 520, 170), text: '70%', px: 150 },
          statLabel: { ...rect(1300, 780, 520, 130), text: 'of spend backs today\'s business: Grow and Optimise together (sample split).' },
        },
      },
      {
        id: 's7', title: 'Explore', purpose: 'The yellow treemap tile grows over the others until it fills the slide: Explore and its three small bets.', bg: C.yellow,
        place: { tY: full(), tK: TM.K, ...zoomPlace('Y', true) },
      },
      {
        id: 's8', title: 'Protect', purpose: 'The yellow tile shrinks and fades as the ink tile grows beneath it into the last quadrant, Protect.', bg: C.ink,
        place: { tK: full(), tY: at(TM.Y, { a: 0 }), ...zoomPlace('K', false) },
      },
      {
        id: 's9', title: 'Prioritise', purpose: 'The tiles shrink into dots on impact and effort axes (axes are thin bars); dot size is budget, and the chart ranks the four themes.', bg: C.cream,
        place: {
          grain: full(), wash: full({ a: 0.6 }), ln1: rect(262, 250, 4, 650), hz: rect(262, 898, 1004, 4), ln2: rect(763, 250, 2, 650, { a: 0.22 }), mh: rect(264, 574, 1000, 2, { a: 0.22 }),
          ...Object.fromEntries(KEYS.flatMap((k) => { const [cx, cy, s] = DOT[k]; return [[`t${k}`, dot(k)], [`m${k}`, mk(k, cx - s * 0.2, cy - s * 0.2, s * 0.4)], [`l${k}`, { ...rect(cx + s / 2 + 18, cy - 22, 230, 46), text: NAME[k], px: 34 }]] })),
          k: { ...rect(100, 74, 1100, 34), text: 'PRIORITISATION  ·  SAMPLE SCORES' },
          title: { ...rect(100, 132, 1250, 90), text: 'Rank by impact and effort', px: 64 },
          q1: { ...rect(290, 268, 300, 30), text: 'QUICK WINS' }, q2: { ...rect(940, 268, 300, 30), text: 'BIG BETS' }, q3: { ...rect(290, 850, 300, 30), text: 'MUST-DOS' }, q4: { ...rect(940, 850, 300, 30), text: 'RETHINK' },
          ax1: { ...rect(264, 924, 300, 30), text: 'LOW EFFORT' }, ax2: { ...rect(966, 924, 300, 30), text: 'HIGH EFFORT' },
          ax3: { ...rect(222 - 150, 400 - 15, 300, 30, { rot: -90 }), text: 'HIGH IMPACT' }, ax4: { ...rect(222 - 150, 760 - 15, 300, 30, { rot: -90 }), text: 'LOW IMPACT' },
          body: { ...rect(1440, 270, 380, 460), text: 'Grow and Optimise return the most for the least effort, so they are funded first. Explore has the biggest upside but needs patience, so it gets a capped pot. Protect is a must-do.', px: 30 },
        },
      },
      {
        id: 's10', title: 'Roadmap', purpose: 'The dots stretch into bars across four quarters: one track per theme, with what each delivers.', bg: C.cream,
        place: {
          grain: full(), wash: full({ a: 0.6 }), ln1: rect(519, 290, 2, 640, { a: 0.35 }), hz: rect(520, 930, 1300, 3, { a: 0.55 }), ln2: rect(844, 290, 2, 640, { a: 0.35 }), mh: rect(520, 288, 1300, 3, { a: 0.55 }),
          ln3: rect(1169, 290, 2, 640, { a: 0.35 }), ln4: rect(1494, 290, 2, 640, { a: 0.35 }), ln5: rect(1817, 290, 2, 640, { a: 0.35 }),
          ...Object.fromEntries(KEYS.flatMap((k) => [[`t${k}`, BAR[k]], [`m${k}`, mk(k, BAR[k].x + 30, ROW_Y[k] + 26, 48)], [`b${k}`, { ...rect(BAR[k].x + 110, ROW_Y[k] + 30, BAR[k].w - 130, 40), text: BAR_TEXT[k] }], [`l${k}`, { ...rect(100, ROW_Y[k] + 24, 400, 52), text: NAME[k], px: 40 }]])),
          k: { ...rect(100, 74, 1100, 34), text: 'ROADMAP  ·  FY2027' },
          title: { ...rect(100, 132, 1500, 90), text: 'Twelve months, four tracks', px: 64 },
          qh1: { ...rect(520, 242, 325, 32), text: 'Q1' }, qh2: { ...rect(845, 242, 325, 32), text: 'Q2' }, qh3: { ...rect(1170, 242, 325, 32), text: 'Q3' }, qh4: { ...rect(1495, 242, 325, 32), text: 'Q4' },
        },
      },
      {
        id: 's11', title: 'Decision', purpose: 'The four bars become a full-width stripe at the bottom; the still life stands on it beside the one decision we ask for.', bg: C.cream,
        place: {
          grain: full(), wash: full({ a: 0.6 }), ...Object.fromEntries(KEYS.flatMap((k) => [[`t${k}`, ST[k]], [`m${k}`, mk(k, ST[k].x + 40, 880 + 55, 90)], [`n${k}`, { ...rect(ST[k].x + 150, 880 + 70, 300, 60), text: NAME[k], px: 48 }]])),
          solids: rect(1120, 520, 720, 360),
          k: { ...rect(100, 110, 1000, 36), text: 'THE DECISION  ·  FOR APPROVAL TODAY' },
          title: { ...rect(100, 170, 1100, 340), text: 'Fund the core.\nCap the bets.\nGuard the base.', px: 100 },
          body: { ...rect(100, 570, 1000, 190), text: 'Approve the FY27 split: 40 / 30 / 15 / 15.\nName one accountable owner for each theme.\nReview the scorecard together every quarter.', px: 32 },
        },
      },
      {
        id: 's12', title: 'Close', purpose: 'The four tiles gather into the cover\'s block, now on the left, with the still life under it; thanks and contact details on the right.', bg: C.cream,
        place: {
          grain: full(), wash: full({ a: 0.6 }), ...tiles(CL, { markS: 110, pad: 28, px: 40 }), solids: rect(100, 800, 560, 280),
          k: { ...rect(860, 200, 900, 36), text: 'NEXT STEP  ·  ONE DECISION' },
          title: { ...rect(860, 262, 960, 190), text: 'Thank you.', px: 150 },
          body: { ...rect(860, 520, 900, 180), text: 'strategy@yourcompany.com\n+00 000 000 0000\nyourcompany.com/strategy', px: 36 },
          foot: { ...rect(860, 960, 800, 30), text: 'Questions and challenges are welcome' },
        },
      },
    ],
  },
)
