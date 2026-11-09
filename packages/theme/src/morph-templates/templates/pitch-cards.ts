import { authored, at, rect, W } from '../author'
import type { Place } from '../author'

/**
 * Story Cards: a founder-story pitch told with a deck of oversized playing cards. The cover is the whole deck, stacked and fanned. Every scene the top card flies off (it moves, turns,
 * grows toward you and parks off the slide) and the next card comes forward and grows until its colour IS the slide. The deck fans into a row for the contents, six cards become a 2x3
 * grid of proof points, and the cards shrink into tabs along the bottom as a progress rail while one card stays large. A card carries its photograph and its words with it wherever it goes
 * (the words are laid out in the card's own frame and turn and scale with it). The cover card returns for the ask and the deck collects back into a stack at the end.
 * Original choreography for SlidesDone.
 */
const C = { bg: '#171412', cream: '#FFF6EA', ink: '#171412', body: '#2A211B', mute: '#CDBFAE', tangerine: '#FF7A2F', sunflower: '#FFC93C', mint: '#3DDC97', sky: '#4DA3FF', blush: '#FF8FA3' }
/** the seven cards: 1 is the cover (and the ask), 2 why, 3 problem, 4 solution, 5 product, 6 business model, 7 team */
const CARD: Record<number, string> = { 1: C.tangerine, 2: C.sunflower, 3: C.mint, 4: C.sky, 5: C.blush, 6: C.cream, 7: C.mint }
const ART: Record<number, [string, string]> = {
  1: ['cards-bench.webp', "A founder's workbench covered in hand-made prototypes"], 2: ['cards-sketch.webp', 'Hands sketching a product idea on paper'], 3: ['cards-stall.webp', 'A packed local makers market stall'],
  4: ['cards-proto.webp', 'A phone, a parcel and a mug on a wooden table'], 5: ['cards-product.webp', 'A hand-glazed mint ceramic mug wrapped in kraft paper'], 6: ['cards-bikes.webp', 'Couriers on cargo bikes in a warm city street'], 7: ['cards-team.webp', 'A team at a whiteboard seen as silhouettes'],
}
const IDS = [1, 2, 3, 4, 5, 6, 7]
/** the order the cards sit in a row and in the tab rail */
const SLOT = [2, 3, 4, 5, 6, 7, 1]
const NAME: Record<number, string> = { 1: 'The ask', 2: 'Why', 3: 'Problem', 4: 'Solution', 5: 'Product', 6: 'Model', 7: 'Team' }
const NUM: Record<number, string> = { 1: '07', 2: '01', 3: '02', 4: '03', 5: '04', 6: '05', 7: '06' }

// ── a card, its picture and its words, laid out in the card's own frame ──
type Box = [number, number, number, number]
interface Item { b: Box; px?: number; text?: string; hide?: boolean }
interface Spec { ref: [number, number]; ph: Item; n: Item; t: Item; b: Item }
/** a place from its centre, size and turn */
const pc = (cx: number, cy: number, w: number, h: number, rot = 0): Place => ({ x: cx - w / 2, y: cy - h / 2, w, h, rot })
/** the card, its picture, its label, title and body in a pose; everything in the spec turns and scales with the card */
const kit = (i: number, pose: Place, s: Spec, vis = true): Record<string, Place> => {
  const k = pose.w / s.ref[0], r = ((pose.rot ?? 0) * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r)
  const cx = pose.x + pose.w / 2, cy = pose.y + pose.h / 2
  const child = (it: Item, withText: boolean): Place => {
    const [lx, ly, w, h] = it.b.map((v) => v * k) as Box
    const dx = lx + w / 2 - pose.w / 2, dy = ly + h / 2 - pose.h / 2
    const ccx = cx + dx * c - dy * sn, ccy = cy + dx * sn + dy * c
    return { x: ccx - w / 2, y: ccy - h / 2, w, h, rot: pose.rot ?? 0, a: vis && !it.hide ? 1 : 0, ...(withText && it.text !== undefined && vis && !it.hide ? { text: it.text } : {}), ...(withText && it.px ? { px: it.px * k } : {}) }
  }
  return { [`k${i}`]: { ...pose, a: 1 }, [`ph${i}`]: child(s.ph, false), [`n${i}`]: child(s.n, true), [`t${i}`]: child(s.t, true), [`b${i}`]: child(s.b, true) }
}
/** a spec written in slide coordinates for a card whose top-left corner is at (ax, ay) */
const fromSlide = (ref: [number, number], ax: number, ay: number, s: { ph: Item; n: Item; t: Item; b: Item }): Spec => {
  const mv = (it: Item): Item => ({ ...it, b: [it.b[0] - ax, it.b[1] - ay, it.b[2], it.b[3]] })
  return { ref, ph: mv(s.ph), n: mv(s.n), t: mv(s.t), b: mv(s.b) }
}
const hideAll = (s: Spec): Spec => ({ ...s, ph: { ...s.ph, hide: true }, n: { ...s.n, hide: true }, t: { ...s.t, hide: true }, b: { ...s.b, hide: true } })

// ── the words of every card in every state ──
const FULL_REF: [number, number] = [2000, 1160]
const FULL: Record<number, Spec> = {
  2: fromSlide(FULL_REF, -40, -40, {
    ph: { b: [1160, 150, 660, 810] }, n: { b: [120, 170, 980, 34], px: 26, text: '01  ·  WHY WE STARTED' }, t: { b: [120, 230, 880, 370], px: 116, text: 'Great makers were hiding in plain sight' },
    b: { b: [120, 640, 940, 160], px: 32, text: 'For two years our founder bought from local potters, bakers and woodworkers, then watched them vanish into weekend markets that nobody could find.' },
  }),
  3: fromSlide(FULL_REF, -40, -40, {
    ph: { b: [100, 150, 660, 810] }, n: { b: [820, 170, 980, 34], px: 26, text: '02  ·  THE PROBLEM' }, t: { b: [820, 230, 990, 200], px: 88, text: 'Local is loved but hard to find' },
    b: { b: [820, 450, 980, 170], px: 32, text: 'Shoppers want to buy from the baker, the potter and the woodworker down the road. But makers sell in five different places, and nobody can see them all.' },
  }),
  4: fromSlide(FULL_REF, -40, -40, {
    ph: { b: [1160, 150, 660, 810] }, n: { b: [120, 170, 980, 34], px: 26, text: '03  ·  THE SOLUTION' }, t: { b: [120, 230, 880, 370], px: 116, text: 'One street market, open every day' },
    b: { b: [120, 640, 940, 160], px: 32, text: 'Stallo puts every local maker on one street in your phone, and a rider brings your order to the door the same day.' },
  }),
  5: fromSlide(FULL_REF, -40, -40, {
    ph: { b: [100, 150, 660, 810] }, n: { b: [820, 170, 980, 34], px: 26, text: '04  ·  THE PRODUCT' }, t: { b: [820, 230, 990, 200], px: 88, text: 'Made for makers, loved by locals' },
    b: { b: [820, 440, 980, 40], px: 32, text: '', hide: true },
  }),
  1: fromSlide(FULL_REF, -40, -40, {
    ph: { b: [1160, 150, 660, 810] }, n: { b: [120, 170, 980, 34], px: 26, text: '07  ·  THE ASK' }, t: { b: [120, 250, 990, 230], px: 200, text: '$1.5M' },
    b: { b: [120, 520, 940, 120], px: 32, text: 'A sample seed round. It funds two new cities, a fair-pay rider network and a product team of ten.' },
  }),
  6: fromSlide([1800, 770], 60, 120, {
    ph: { b: [1260, 150, 570, 710] }, n: { b: [120, 160, 1060, 34], px: 26, text: '05  ·  BUSINESS MODEL' }, t: { b: [120, 215, 1070, 190], px: 80, text: 'We earn when makers earn' },
    b: { b: [120, 420, 1060, 110], px: 32, text: 'A 12% fee on every order, plus a small delivery fee that goes straight to the rider.' },
  }),
  7: fromSlide([1800, 770], 60, 120, {
    ph: { b: [1260, 150, 570, 710] }, n: { b: [120, 160, 1060, 34], px: 26, text: '06  ·  THE TEAM  ·  SAMPLE NAMES' }, t: { b: [120, 215, 1070, 100], px: 80, text: 'Meet the crew' },
    b: { b: [120, 330, 1060, 40], px: 32, text: '', hide: true },
  }),
}
const fullOf = (i: number): Spec => FULL[i]!
const STACK_WORDS: Spec = {
  ref: [600, 780], ph: { b: [24, 24, 552, 420] }, n: { b: [40, 468, 520, 32], px: 26, text: 'OUR STORY' }, t: { b: [40, 512, 520, 170], px: 58, text: 'Stallo, told in seven cards' }, b: { b: [40, 690, 520, 50], px: 28, text: '', hide: true },
}
const ROW: Spec = { ref: [240, 600], ph: { b: [12, 12, 216, 380] }, n: { b: [22, 408, 196, 34], px: 26 }, t: { b: [22, 450, 204, 56], px: 36 }, b: { b: [22, 520, 196, 40], px: 24, hide: true } }
const rowOf = (i: number): Spec => ({ ...ROW, n: { ...ROW.n, text: NUM[i]! }, t: { ...ROW.t, text: NAME[i]! } })
const TAB: Spec = { ref: [243, 120], ph: { b: [8, 8, 60, 60], hide: true }, n: { b: [14, 10, 200, 30], px: 24, hide: true }, t: { b: [22, 36, 214, 48], px: 28 }, b: { b: [14, 80, 200, 30], px: 24, hide: true } }
const tabOf = (i: number): Spec => ({ ...TAB, t: { ...TAB.t, text: `${NUM[i]!} ${NAME[i]!}` } })
const GRID_ITEMS: Record<number, [string, string, string]> = {
  2: ['MAKERS', '1,840', 'local makers selling on Stallo'], 3: ['ORDERS', '62k', 'orders delivered to a door'], 4: ['GROWTH', '38%', 'month-on-month order growth'],
  5: ['RATING', '4.8/5', 'average delivery rating from buyers'], 6: ['REPEAT', '71%', 'of buyers order again within 30 days'], 7: ['SPEED', '2.1 hrs', 'median time from workbench to doorstep'],
}
const gridOf = (i: number): Spec => ({
  ref: [549, 330], ph: { b: [18, 18, 200, 150], hide: true }, n: { b: [36, 32, 480, 30], px: 24, text: GRID_ITEMS[i]![0] }, t: { b: [36, 76, 480, 112], px: 96, text: GRID_ITEMS[i]![1] }, b: { b: [36, 206, 480, 100], px: 28, text: GRID_ITEMS[i]![2] },
})
const ROAD_ITEMS: Record<number, [string, string, string]> = {
  2: ['Q1', 'Open a second city', 'Onboard 400 more makers and open delivery zones in the next city.'], 3: ['Q2', 'Launch Stallo Plus', 'A membership with free delivery for regular local buyers.'],
  4: ['Q3', 'Tools for makers', 'Stock, pricing and pickup tools built into the maker app.'], 5: ['Q4', 'Stallo gift boxes', 'Curated boxes that turn local shopping into a gift.'],
}
const roadOf = (i: number): Spec => ({
  ref: [400, 680], ph: { b: [16, 16, 368, 210] }, n: { b: [28, 250, 344, 30], px: 24, text: ROAD_ITEMS[i]![0] }, t: { b: [28, 292, 344, 100], px: 42, text: ROAD_ITEMS[i]![1] }, b: { b: [28, 402, 344, 200], px: 26, text: ROAD_ITEMS[i]![2] },
})

// ── poses ──
const FULLP = rect(-40, -40, 2000, 1160)
const RAILP = rect(60, 120, 1800, 770)
const STACKP: Record<number, Place> = {
  1: pc(1370, 560, 600, 780, -3), 2: pc(1395, 548, 600, 780, 5), 3: pc(1345, 566, 600, 780, -9), 4: pc(1410, 545, 600, 780, 11), 5: pc(1328, 572, 600, 780, -14), 6: pc(1425, 540, 600, 780, 16), 7: pc(1350, 560, 600, 780, -19),
}
const rowPose = (i: number): Place => { const d = SLOT.indexOf(i) - 3; return pc(960 + d * 250, 640 + d * d * 10, 240, 600, d * 4.5) }
const tabPose = (i: number): Place => rect(60 + SLOT.indexOf(i) * 259, 916, 243, 120)
const GRIDP = (i: number): Place => { const n = i - 2, col = n % 3, r = Math.floor(n / 3); return rect(96 + col * 589.5, 310 + r * 370, 549, 330) }
const ROADP: Record<number, Place> = { 2: rect(96, 420, 400, 680, { rot: -2 }), 3: rect(530, 350, 400, 680, { rot: 1.5 }), 4: rect(964, 280, 400, 680, { rot: -1.5 }), 5: rect(1398, 210, 400, 680, { rot: 2 }) }
/** where a card waits after it flew off: far off the slide, turned, bigger (it came toward you) or smaller; its words are laid out for the pose it left in */
const FLY: Record<number, { pose: Place; spec: Spec }> = {
  1: { pose: pc(-1000, -520, 900, 1170, -34), spec: STACK_WORDS },
  2: { pose: pc(2850, -250, 1300, 754, 28), spec: fullOf(2) },
  3: { pose: pc(-950, 1450, 1200, 696, -24), spec: fullOf(3) },
  4: { pose: pc(500, -1000, 1200, 696, -20), spec: fullOf(4) },
}
const DROP: Record<number, Place> = { 2: pc(500, 1560, 600, 780, -12), 3: pc(850, 1580, 600, 780, 9), 4: pc(1200, 1560, 600, 780, -6), 5: pc(1550, 1580, 600, 780, 14), 6: pc(700, 1620, 600, 780, 5), 7: pc(1300, 1620, 600, 780, -10) }

/** the whole deck as a stack, only the card on top showing its words */
const stack = (top: number, from = 1, sp: (i: number) => Place = (i) => STACKP[i]!): Record<string, Place> =>
  Object.assign({}, ...IDS.filter((i) => i >= from).map((i) => kit(i, sp(i), i === top ? STACK_WORDS : hideAll(STACK_WORDS), i === top)))
const flown = (i: number, vis = false): Record<string, Place> => kit(i, FLY[i]!.pose, FLY[i]!.spec, vis)
const parked = (ids: number[]): Record<string, Place> => Object.assign({}, ...ids.map((i) => flown(i)))
const dropped = (ids: number[]): Record<string, Place> => Object.assign({}, ...ids.map((i) => kit(i, DROP[i]!, hideAll(STACK_WORDS), false)))
const hiddenStack = (ids: number[]): Record<string, Place> => Object.assign({}, ...ids.map((i) => kit(i, STACKP[i]!, hideAll(STACK_WORDS), false)))
const tabs = (ids: number[]): Record<string, Place> => Object.assign({}, ...ids.map((i) => kit(i, tabPose(i), tabOf(i))))

const HEAD = {
  brandP: rect(80, 44, 190, 56), brand: rect(80, 44, 190, 56), pageP: rect(1566, 44, 274, 56), page: rect(1566, 44, 274, 56),
}
const chip = (n: number, x: number, y: number, w: number, text: string): Record<string, Place> => ({ [`c${n}`]: rect(x, y, w, 64), [`ct${n}`]: { ...rect(x, y, w, 64), text } })
const dot = (n: number, x: number, y: number, text: string, px = 34): Record<string, Place> => ({ [`c${n}`]: rect(x, y, 88, 88), [`ct${n}`]: { ...rect(x, y, 88, 88), text, px } })
const stat = (n: number, x: number, y: number, w: number, big: string, label: string): Record<string, Place> => ({ [`sa${n}`]: { ...rect(x, y, w, 100), text: big }, [`sl${n}`]: { ...rect(x, y + 105, w, 110), text: label } })
const feat = (n: number, x: number, y: number, w: number, head: string, text: string, lines = 1): Record<string, Place> => ({ [`ft${n}`]: { ...rect(x, y, w, 48), text: head }, [`fb${n}`]: { ...rect(x, y + 52, w, 38 * lines + 6), text } })
const slotBox = (i: number): Place => at(tabPose(i), { a: 0.6 })

const txt = (px: number, extra: object = {}) => ({ kind: 'text' as const, text: '', px, ...extra })
const cardText = (i: number) => ({
  [`n${i}`]: txt(26, { weight: 700, color: C.body, caps: true, spc: 5, text: `${NUM[i]!}  ·  ${NAME[i]!.toUpperCase()}` }),
  [`t${i}`]: txt(88, { weight: 700, color: C.ink, face: 'heading', lh: 1.04, spc: -2, text: NAME[i] }),
  [`b${i}`]: txt(32, { weight: 500, color: C.body, lh: 1.45 }),
})

const cardObjects = Object.assign({}, ...IDS.map((i) => ({
  [`k${i}`]: { kind: 'shape' as const, radius: 56, fill: CARD[i], stroke: C.bg, strokeW: 5 },
  [`ph${i}`]: { kind: 'image' as const, art: ART[i]![0], alt: ART[i]![1], fit: 'cover' as const, radius: 40 },
  ...cardText(i),
})))
/** back to front: card 7 at the bottom of the deck, card 1 on top; each card is followed by its own picture and words */
const cardOrder = [7, 6, 5, 4, 3, 2, 1].flatMap((i) => [`k${i}`, `ph${i}`, `n${i}`, `t${i}`, `b${i}`])

const T = (x: number) => x
void W

export const PITCH_CARDS = authored(
  {
    id: 'pitch-cards', category: 'pitch', name: 'Story Cards', tagline: 'Tell your founder story one card at a time',
    description: 'A founder-story pitch told with a deck of oversized, colourful cards: the top card flies off to reveal the next, the deck fans out for the contents, six cards become a grid of proof points and a rail of tabs tracks the story from why to the ask.',
    audience: 'The Story Cards template suits founder stories, seed and pre-seed pitch decks, investor updates, demo days, consumer and marketplace startups, and any talk that is easier to follow as a short sequence of chapters.',
    topics: ['pitch', 'pitch deck', 'founder story', 'startup', 'investor', 'investors', 'fundraising', 'seed', 'seed round', 'pre-seed', 'marketplace', 'consumer', 'consumer app', 'storytelling', 'our story', 'demo day', 'venture', 'brand story', 'e-commerce', 'local business'],
    fonts: { heading: 'Sora', body: 'Inter' },
    colors: { background: '#171412', surface: '#2A211B', textPrimary: '#FFF6EA', textSecondary: '#CDBFAE', primary: '#FF7A2F', secondary: '#4DA3FF', accent: '#FFC93C', onPrimary: '#171412' },
    background: '#171412',
  },
  {
    objects: {
      ...cardObjects,
      kick: txt(26, { weight: 700, color: C.tangerine, caps: true, spc: 6, park: 't' }),
      title: txt(84, { weight: 700, color: C.cream, face: 'heading', lh: 1.04, spc: -3, park: 't' }),
      sub: txt(40, { weight: 400, color: C.mute, lh: 1.4, park: 't' }),
      gh: { kind: 'shape', radius: 56, stroke: C.cream, strokeW: 3, park: 'b' },
      c1: { kind: 'shape', radius: 44, fill: C.ink, park: 'b' }, c2: { kind: 'shape', radius: 44, fill: C.ink, park: 'b' }, c3: { kind: 'shape', radius: 44, fill: C.ink, park: 'b' }, c4: { kind: 'shape', radius: 44, fill: C.ink, park: 'b' },
      ct1: txt(26, { weight: 700, color: C.cream, align: 'ctr', anchor: 'ctr', face: 'heading', park: 'b' }), ct2: txt(26, { weight: 700, color: C.cream, align: 'ctr', anchor: 'ctr', face: 'heading', park: 'b' }),
      ct3: txt(26, { weight: 700, color: C.cream, align: 'ctr', anchor: 'ctr', face: 'heading', park: 'b' }), ct4: txt(26, { weight: 700, color: C.cream, align: 'ctr', anchor: 'ctr', face: 'heading', park: 'b' }),
      sa1: txt(84, { weight: 700, color: C.ink, face: 'heading', lh: 1, spc: -2, park: 'b' }), sa2: txt(84, { weight: 700, color: C.ink, face: 'heading', lh: 1, spc: -2, park: 'b' }), sa3: txt(84, { weight: 700, color: C.ink, face: 'heading', lh: 1, spc: -2, park: 'b' }),
      sl1: txt(26, { weight: 500, color: C.body, lh: 1.35, park: 'b' }), sl2: txt(26, { weight: 500, color: C.body, lh: 1.35, park: 'b' }), sl3: txt(26, { weight: 500, color: C.body, lh: 1.35, park: 'b' }),
      ft1: txt(38, { weight: 700, color: C.ink, face: 'heading', lh: 1.1, park: 'b' }), ft2: txt(38, { weight: 700, color: C.ink, face: 'heading', lh: 1.1, park: 'b' }),
      ft3: txt(38, { weight: 700, color: C.ink, face: 'heading', lh: 1.1, park: 'b' }), ft4: txt(38, { weight: 700, color: C.ink, face: 'heading', lh: 1.1, park: 'b' }),
      fb1: txt(28, { weight: 500, color: C.body, lh: 1.35, park: 'b' }), fb2: txt(28, { weight: 500, color: C.body, lh: 1.35, park: 'b' }), fb3: txt(28, { weight: 500, color: C.body, lh: 1.35, park: 'b' }), fb4: txt(28, { weight: 500, color: C.body, lh: 1.35, park: 'b' }),
      brandP: { kind: 'shape', radius: 28, fill: C.bg }, brand: txt(22, { text: 'STALLO', weight: 700, color: C.cream, caps: true, spc: 5, align: 'ctr', anchor: 'ctr' }),
      pageP: { kind: 'shape', radius: 28, fill: C.bg }, page: txt(22, { text: 'Seed deck  ·  2026', weight: 600, color: C.cream, align: 'ctr', anchor: 'ctr' }),
    },
    order: [...cardOrder, 'kick', 'title', 'sub', 'gh', 'c1', 'c2', 'c3', 'c4', 'ct1', 'ct2', 'ct3', 'ct4', 'sa1', 'sa2', 'sa3', 'sl1', 'sl2', 'sl3', 'ft1', 'ft2', 'ft3', 'ft4', 'fb1', 'fb2', 'fb3', 'fb4', 'brandP', 'brand', 'pageP', 'page'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The whole deck of seven colourful cards stacked and fanned on the right, the cover card with a photograph on top, the name large on the left.', bg: C.bg,
        place: {
          ...stack(1), ...HEAD,
          kick: { ...rect(96, 235, 800, 34), text: "A FOUNDER'S STORY" }, title: { ...rect(96, 285, 900, 250), text: 'Stallo', px: 210 }, sub: { ...rect(96, 590, 740, 120), text: 'Local makers, delivered to your door the same day.' },
        },
      },
      {
        id: 's2', title: 'Contents', purpose: 'The deck fans out into a row of seven cards, one per chapter, with a photograph and a number on each.', bg: C.bg,
        place: {
          ...Object.assign({}, ...SLOT.map((i) => kit(i, rowPose(i), rowOf(i)))), ...HEAD,
          kick: { ...rect(96, 128, 900, 34), text: 'THE STORY IN SEVEN CARDS' }, title: { ...rect(96, 170, 1500, 110), text: 'Pick a card, any card', px: 84 }, sub: at(rect(96, 590, 740, 120), { a: 0 }),
        },
      },
      {
        id: 's3', title: 'Why', purpose: 'The cover card flies off to the top left and the sunflower card grows into the slide: why the founder started.', bg: C.bg,
        place: {
          ...hiddenStack([3, 4, 5, 6, 7]), ...kit(2, FULLP, fullOf(2)), ...flown(1, true), ...HEAD,
          ...chip(1, 120, 830, 310, '2 years of stalls'), ...chip(2, 450, 830, 360, '212 makers (sample)'), ...chip(3, 830, 830, 300, '1 big question'),
        },
      },
      {
        id: 's4', title: 'Problem', purpose: 'The sunflower card sweeps off to the right and the mint card fills the slide with the problem and three sample facts.', bg: C.bg,
        place: {
          ...hiddenStack([4, 5, 6, 7]), ...kit(3, FULLP, fullOf(3)), ...flown(2, true), ...parked([1]), ...HEAD,
          ...stat(1, 820, 690, 300, '71%', 'of shoppers want to buy local (sample)'), ...stat(2, 1150, 690, 300, '4 apps', 'a maker juggles to sell and ship (sample)'), ...stat(3, 1480, 690, 300, '9 days', 'a small order takes by post (sample)'),
        },
      },
      {
        id: 's5', title: 'Solution', purpose: 'The mint card drops away to the bottom left and the sky-blue card grows full with the solution and a photograph of the prototype.', bg: C.bg,
        place: {
          ...hiddenStack([5, 6, 7]), ...kit(4, FULLP, fullOf(4)), ...flown(3, true), ...parked([1, 2]), ...HEAD,
          ...chip(1, 120, 830, 300, 'Browse by street'), ...chip(2, 440, 830, 300, 'Rider in 2 hours'), ...chip(3, 760, 830, 280, 'Paid next day'),
        },
      },
      {
        id: 's6', title: 'Product', purpose: 'The sky-blue card flies up and away and the blush card fills the slide with the product and its three key features; the chips become numbered dots.', bg: C.bg,
        place: {
          ...hiddenStack([6, 7]), ...kit(5, FULLP, fullOf(5)), ...flown(4, true), ...parked([1, 2, 3]), ...HEAD,
          ...dot(1, 820, 480, '1'), ...dot(2, 820, 630, '2'), ...dot(3, 820, 780, '3'),
          ...feat(1, 930, 482, 870, 'Shop in a tap', 'See what is made within 5 km of you.'), ...feat(2, 930, 632, 870, 'One checkout, many stalls', 'Pay once and every maker is paid next day.'), ...feat(3, 930, 782, 870, 'Follow your rider', 'A live map from the workbench to your door.'),
        },
      },
      {
        id: 's7', title: 'Traction', purpose: 'The cards shrink into a 2 by 3 grid on charcoal, each one a big sample proof point such as makers, orders, growth and repeat buyers.', bg: C.bg,
        place: {
          ...Object.assign({}, ...[2, 3, 4, 5, 6, 7].map((i) => kit(i, GRIDP(i), gridOf(i)))), ...parked([1]), ...HEAD,
          kick: { ...rect(96, 120, 900, 34), text: 'TRACTION  ·  SAMPLE FIGURES' }, title: { ...rect(96, 160, 1500, 110), text: 'Proof, not promises', px: 84 }, sub: at(rect(96, 590, 740, 120), { a: 0 }),
        },
      },
      {
        id: 's8', title: 'Business model', purpose: 'The grid collapses into tabs along the bottom as a progress rail while the cream card stays large with the business model and three sample numbers.', bg: C.bg,
        place: {
          ...kit(6, RAILP, fullOf(6)), ...tabs([2, 3, 4, 5, 7, 1]), gh: slotBox(6), ...HEAD,
          ...stat(1, 120, 570, 330, '12%', 'fee on each order (sample)'), ...stat(2, 480, 570, 330, '$3', 'delivery fee, paid to the rider (sample)'), ...stat(3, 840, 570, 330, '68%', 'target gross margin at scale (sample)'),
        },
      },
      {
        id: 's9', title: 'Team', purpose: 'The cream card shrinks back into the rail and the mint card takes its place as the large card, with four team members and a whiteboard photograph.', bg: C.bg,
        place: {
          ...kit(7, RAILP, fullOf(7)), ...tabs([2, 3, 4, 5, 6, 1]), gh: slotBox(7), ...HEAD,
          ...dot(1, 120, 380, 'MO'), ...dot(2, 700, 380, 'DR'), ...dot(3, 120, 610, 'LF'), ...dot(4, 700, 610, 'SO'),
          ...feat(1, 230, 380, 390, 'Maya Okafor', 'CEO. Six years running a market stall.', 2), ...feat(2, 810, 380, 400, 'Dev Rao', 'CTO. Built routing at a delivery startup.', 2),
          ...feat(3, 230, 610, 390, 'Lena Fischer', 'Design. Shipped three consumer apps.', 2), ...feat(4, 810, 610, 400, 'Sam Ortega', 'Ops. Ran 200 riders across two cities.', 2),
        },
      },
      {
        id: 's10', title: 'Roadmap', purpose: 'Four cards climb like stairs, one per quarter of the next year, each with a photograph and a milestone.', bg: C.bg,
        place: {
          ...Object.assign({}, ...[2, 3, 4, 5].map((i) => kit(i, ROADP[i]!, roadOf(i)))), ...dropped([6, 7]), ...parked([1]), ...HEAD,
          kick: { ...rect(96, 140, 900, 34), text: 'THE ROAD AHEAD' }, title: { ...rect(96, 182, 760, 190), text: 'Next twelve months', px: 84 }, sub: at(rect(96, 590, 740, 120), { a: 0 }),
        },
      },
      {
        id: 's11', title: 'The ask', purpose: 'The cover card flies back in from the top left and fills the slide in tangerine with one large number: the sample raise and where it goes.', bg: C.bg,
        place: {
          ...dropped([2, 3, 4, 5, 6, 7]), ...kit(1, FULLP, fullOf(1)), ...HEAD,
          ...chip(1, 120, 740, 340, '40%  two new cities'), ...chip(2, 484, 740, 320, '35%  rider network'), ...chip(3, 828, 740, 310, '25%  product team'),
        },
      },
      {
        id: 's12', title: 'Contact', purpose: 'The deck collects back into a stack on the right, rhyming with the cover, and the contact details sit on the left.', bg: C.bg,
        place: {
          ...stack(1), ...HEAD,
          kick: { ...rect(96, 200, 800, 34), text: "LET'S TALK" }, title: { ...rect(96, 250, 900, 200), text: 'Thank you', px: 150 }, sub: { ...rect(96, 500, 780, 200), text: 'hello@stallo.example\nstallo.example\n@stallo.makers', px: 38 },
        },
      },
    ],
  },
)
void T
