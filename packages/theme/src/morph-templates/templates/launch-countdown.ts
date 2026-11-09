import { authored, at, rect, W, H } from '../author'
import type { ObjDef, Place } from '../author'

/**
 * Countdown: a launch event deck where one giant numeral is the star. It counts 5, 4, 3, 2, 1 (the same text object: it changes its words, moves, turns and re-colours on every scene) and leaves
 * fading numerals behind as a trail. Thirty-two pieces of confetti are one set of shapes that burst out from the numeral and tumble to new places on every scene, and twelve light rays turn slowly
 * around whatever is the centre of the scene. At zero the numeral shrinks into the product name, a ring shockwave grows from a dot, and the hero shoe bursts in from the centre; the
 * rest of the deck (date, highlights, offer, call to action) is built from the same shapes: the white card becomes a calendar, then a row of cards, then the shadow of the ticker band.
 * Original choreography for SlidesDone.
 */
const C = { violet: '#5B21FF', magenta: '#FF2DAA', orange: '#FF8A1F', yellow: '#FFD21F', blue: '#1237E0', cyan: '#19D3FF', night: '#0B0714', gold: '#FFC83D', ink: '#24093F', soft: '#4A3F6B', white: '#FFFFFF' }
type Rect4 = [number, number, number, number]

// ── the numeral: a box of 520 x 700 around a centre ──
const numBox = (cx: number, cy: number, extra: Partial<Place> = {}): Place => ({ x: cx - 260, y: cy - 350, w: 520, h: 700, ...extra })
const ghost = (cx: number, cy: number, px: number, a: number, color = C.white, extra: Partial<Place> = {}): Place => numBox(cx, cy, { px, a, color, ...extra })

// ── light rays: six double beams through the centre of the scene, 30 degrees apart, all turning by 14 degrees per scene ──
const RAY_E = [0.022, 0.034, 0.026, 0.04, 0.03, 0.024]
const BOW = (e: number) => [[0, 0.5 - e], [0.5, 0.5], [1, 0.5 - e], [1, 0.5 + e], [0.5, 0.5], [0, 0.5 + e]]
const RAY = 2800
const rays = (cx: number, cy: number, scene: number, a: number, fill = C.white): Record<string, Place> =>
  Object.fromEntries(RAY_E.map((_, i) => [`ray${i + 1}`, { x: cx - RAY / 2, y: cy - RAY / 2, w: RAY, h: RAY, rot: i * 30 + 14 * scene, a: a * (i % 2 ? 0.7 : 1), fill }]))

// ── confetti: thirty-two small shapes, placed by a seeded scatter that keeps clear of the text ──
const N_CONF = 32
const rng = (seed: number) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296 } }
const KIND = (i: number) => i % 4 // 0 triangle, 1 circle, 2 rounded rect, 3 ribbon
const SIZE = (i: number): [number, number] => { const k = KIND(i), v = 0.85 + ((i * 7) % 5) * 0.1; return k === 0 ? [40 * v, 36 * v] : k === 1 ? [30 * v, 30 * v] : k === 2 ? [38 * v, 24 * v] : [13 * v, 70 * v] }
const PALETTE = {
  hot: [C.yellow, C.cyan, C.white, C.orange], warm: [C.white, C.violet, C.magenta, C.blue], cool: [C.yellow, C.white, C.magenta, C.orange], night: [C.gold, C.magenta, C.cyan, C.white, C.violet],
}
interface Scatter { seed: number; palette: keyof typeof PALETTE; avoid: Rect4[]; ring?: { cx: number; cy: number; r0: number; r1: number }; k?: number; region?: Rect4 }
const hit = (x: number, y: number, w: number, h: number, r: Rect4, pad = 36) => x < r[0] + r[2] + pad && x + w > r[0] - pad && y < r[1] + r[3] + pad && y + h > r[1] - pad
function confetti(s: Scatter): Record<string, Place> {
  const rnd = rng(s.seed), out: Record<string, Place> = {}, pal = PALETTE[s.palette], k = s.k ?? 1
  for (let i = 0; i < N_CONF; i++) {
    const [bw, bh] = SIZE(i), w = bw * k, h = bh * k
    let pos: { x: number; y: number } | null = null
    for (let t = 0; t < 120 && !pos; t++) {
      let cx: number, cy: number
      if (s.ring) { const ang = (i * 137.5 + rnd() * 70) * Math.PI / 180, r = s.ring.r0 + (((i * 0.618) % 1) * 0.7 + rnd() * 0.3) * (s.ring.r1 - s.ring.r0); cx = s.ring.cx + r * Math.cos(ang); cy = s.ring.cy + r * Math.sin(ang) * 0.82 }
      else { const g = s.region ?? [40, 40, W - 80, H - 80]; cx = g[0] + rnd() * g[2]; cy = g[1] + rnd() * g[3] }
      const x = cx - w / 2, y = cy - h / 2
      if (x < 24 || y < 24 || x + w > W - 24 || y + h > H - 24) continue
      if (s.avoid.some((r) => hit(x, y, Math.max(w, h), Math.max(w, h), r))) continue
      pos = { x, y }
    }
    // no room: wait just below the slide, invisible
    out[`cf${i + 1}`] = pos ? { x: pos.x, y: pos.y, w, h, rot: Math.round(rnd() * 360 - 180), fill: pal[(i * 3 + s.seed) % pal.length]! } : { x: 100 + i * 52, y: H + 120, w, h, rot: 0, a: 0, fill: pal[i % pal.length]! }
  }
  return out
}

// ── the objects ──
const HEAD = (text: string, px: number, color: string, extra: Partial<Extract<ObjDef, { kind: 'text' }>> = {}): ObjDef => ({ kind: 'text', text, px, weight: 700, color, face: 'heading', caps: true, spc: 2, lh: 1, ...extra })
const BODY = (px: number, color: string, extra: Partial<Extract<ObjDef, { kind: 'text' }>> = {}): ObjDef => ({ kind: 'text', text: '', px, weight: 500, color, lh: 1.45, ...extra })
const conf: Record<string, ObjDef> = Object.fromEntries(Array.from({ length: N_CONF }, (_, i): [string, ObjDef] => {
  const k = KIND(i)
  return [`cf${i + 1}`, k === 0 ? { kind: 'shape', shape: 'triangle', fill: C.white, park: 'b' } : k === 1 ? { kind: 'shape', shape: 'ellipse', fill: C.white, park: 'b' } : k === 2 ? { kind: 'shape', radius: 5, fill: C.white, park: 'b' } : { kind: 'shape', radius: 6, fill: C.white, park: 'b' }]
}))
const rayObjs: Record<string, ObjDef> = Object.fromEntries(RAY_E.map((e, i): [string, ObjDef] => [`ray${i + 1}`, { kind: 'shape', poly: BOW(e), fill: C.white }]))
const NUM = (text: string, px = 600): ObjDef => ({ kind: 'text', text, px, weight: 700, color: C.white, face: 'heading', lh: 1, spc: 0, align: 'ctr', anchor: 'ctr', park: 'b' })
const GH = (text: string): ObjDef => ({ kind: 'text', text, px: 600, weight: 700, color: C.white, face: 'heading', lh: 1, spc: 0, align: 'ctr', anchor: 'ctr' })

const GRAD = [
  { from: C.violet, to: C.magenta, angle: 135 }, { from: C.violet, to: C.magenta, angle: 200 }, { from: C.magenta, to: C.orange, angle: 135 }, { from: C.orange, to: C.yellow, angle: 160 },
  { from: C.blue, to: C.cyan, angle: 135 }, { from: C.blue, to: C.violet, angle: 200 }, { from: C.night, to: '#2A0F52', angle: 180 }, { from: '#14072E', to: C.night, angle: 180 },
  { from: C.violet, to: C.magenta, angle: 120 }, { from: C.blue, to: C.cyan, angle: 160 }, { from: C.orange, to: C.yellow, angle: 135 }, { from: C.night, to: '#1A0B3B', angle: 180 },
]
/** text colours of a scene: [kicker, title, body] and the colour of the chrome */
const TX: [string, string, string][] = [
  [C.yellow, C.white, C.white], [C.yellow, C.white, C.white], [C.white, C.white, C.white], [C.ink, C.ink, C.ink], [C.magenta, C.ink, C.soft], [C.yellow, C.white, C.white],
  [C.gold, C.white, C.white], [C.gold, C.white, C.white], [C.white, C.white, C.white], [C.white, C.white, C.white], [C.ink, C.ink, C.ink], [C.gold, C.white, C.white],
]
const chrome = (s: number): Record<string, Place> => ({ brand: rect(100, 52, 700, 34, { color: s === 4 || s === 11 ? C.ink : C.white }), page: rect(1020, 52, 800, 34, { color: s === 4 || s === 11 ? C.ink : C.white }) })
const txt = (s: number, kick: Place, title: Place, body: Place): Record<string, Place> => ({ kick: { ...kick, color: TX[s - 1]![0] }, title: { ...title, color: TX[s - 1]![1] }, body: { ...body, color: TX[s - 1]![2] } })

const SHOE = { hero: 'count-hero.webp', blue: 'count-blue.webp', violet: 'count-violet.webp' }

export const LAUNCH_COUNTDOWN = authored(
  {
    id: 'launch-countdown', category: 'launch', name: 'Countdown', tagline: 'Five, four, three, two, one: launch',
    description: 'A product launch event deck built around one giant numeral. It counts down from five to one with confetti bursting and falling around it, then breaks into the product name with a shockwave and a hero shoe, and goes on to the date and place, three highlights, a pre-order offer on a sliding ticker band and a closing call to action.',
    audience: 'The Countdown template suits product launches and launch events, product announcements and coming-soon teasers, pre-order and new-release campaigns, grand openings, festival and event presentations, launch-week plans and any talk that builds up to one big reveal.',
    topics: ['product launch', 'launch', 'launch event', 'countdown', 'product announcement', 'announcement', 'coming soon', 'new release', 'release', 'pre-order', 'preorder', 'grand opening', 'opening', 'event', 'event presentation', 'reveal', 'teaser', 'festival', 'drop', 'sneaker', 'fashion', 'retail', 'marketing', 'campaign', 'unveiling'],
    fonts: { heading: 'Oswald', body: 'DM Sans' },
    colors: { background: '#0B0714', surface: '#24093F', textPrimary: '#FFFFFF', textSecondary: '#E7DDFF', primary: '#FF2DAA', secondary: '#5B21FF', accent: '#FFD21F', onPrimary: '#FFFFFF' },
    background: '#0B0714',
  },
  {
    objects: {
      burst: { kind: 'image', art: 'count-burst.webp', alt: 'A burst of golden light', park: 'b' },
      glow: { kind: 'image', art: 'count-glow.webp', alt: 'A soft magenta and violet glow', park: 'b' },
      ...rayObjs,
      g5: GH('5'), g4: GH('4'), g3: GH('3'), g2: GH('2'), g1: GH('1'),
      c1: { kind: 'shape', radius: 40, fill: '#FFFFFF', park: 'b' }, calBand: { kind: 'shape', radius: 36, fill: C.magenta, park: 'l' }, calCover: { kind: 'shape', fill: '#FFFFFF', park: 'l' },
      bind1: { kind: 'shape', radius: 14, fill: C.ink, park: 't' }, bind2: { kind: 'shape', radius: 14, fill: C.ink, park: 't' },
      c2: { kind: 'shape', radius: 40, fill: '#FFFFFF', park: 'r' }, c3: { kind: 'shape', radius: 40, fill: '#FFFFFF', park: 'l' },
      dot1: { kind: 'shape', shape: 'ellipse', gradient: { from: C.magenta, to: C.orange, angle: 135 }, park: 'l' }, dot2: { kind: 'shape', shape: 'ellipse', gradient: { from: C.violet, to: C.magenta, angle: 135 }, park: 'r' }, dot3: { kind: 'shape', shape: 'ellipse', gradient: { from: C.blue, to: C.cyan, angle: 135 }, park: 'l' },
      num: NUM('5'),
      shock1: { kind: 'shape', shape: 'ellipse', stroke: C.white, strokeW: 8 }, shock2: { kind: 'shape', shape: 'ellipse', stroke: C.gold, strokeW: 6 },
      foil: { kind: 'image', art: 'count-foil.webp', alt: 'Crumpled gold foil', fit: 'cover', park: 'r' },
      ticker: HEAD('PRE-ORDER NOW  ·  FREE COLOUR SWAP  ·  PRIORITY SHIPPING  ·  PRE-ORDER NOW  ·  FREE COLOUR SWAP  ·  PRIORITY SHIPPING  ·  PRE-ORDER NOW  ·  FREE COLOUR SWAP', 120, C.ink, { park: 'r', anchor: 'ctr', spc: 3 }),
      ...conf,
      pic2: { kind: 'image', art: SHOE.blue, alt: 'A blue and cyan chunky sneaker', park: 'l' }, pic3: { kind: 'image', art: SHOE.violet, alt: 'A violet and pink chunky sneaker', park: 'r' },
      hero: { kind: 'image', art: SHOE.hero, alt: 'A pair of orange and yellow chunky sneakers' },
      badge: { kind: 'shape', radius: 105, fill: C.gold, park: 'r' },
      badgeT: HEAD('FROM\n$129', 52, C.ink, { align: 'ctr', anchor: 'ctr', lh: 1.05, park: 'r' }),
      brand: HEAD('VOLT RUNNER', 26, C.white, { weight: 600, spc: 6 }),
      page: BODY(24, C.white, { weight: 700, align: 'r' }),
      kick: HEAD('', 30, C.yellow, { weight: 600, spc: 6 }), kickC: HEAD('', 30, C.gold, { weight: 600, spc: 6, align: 'ctr' }),
      title: HEAD('', 130, C.white), titleC: HEAD('', 130, C.white, { align: 'ctr' }),
      body: BODY(38, C.white), bodyC: BODY(36, C.white, { align: 'ctr' }), list: HEAD('', 44, C.white, { weight: 600, lh: 1.7, spc: 2 }),
      calMonth: HEAD('FEBRUARY 2027', 50, C.white, { align: 'ctr', anchor: 'ctr', spc: 4, park: 'l' }), calDay: HEAD('FRIDAY', 56, C.magenta, { align: 'ctr', anchor: 'ctr', spc: 6, park: 'l' }),
      n1: HEAD('01', 44, C.white, { align: 'ctr', anchor: 'ctr', park: 'l' }), n2: HEAD('02', 44, C.white, { align: 'ctr', anchor: 'ctr', park: 'r' }), n3: HEAD('03', 44, C.white, { align: 'ctr', anchor: 'ctr', park: 'l' }),
      h1: HEAD('Feather-light build', 50, C.ink, { park: 'l', caps: false, spc: 0, weight: 600 }), t1: BODY(30, C.soft, { park: 'l', weight: 500 }),
      h2: HEAD('Cushion that rebounds', 50, C.ink, { park: 'r', caps: false, spc: 0, weight: 600 }), t2: BODY(30, C.soft, { park: 'r', weight: 500 }),
      h3: HEAD('Five launch colourways', 50, C.ink, { park: 'l', caps: false, spc: 0, weight: 600 }), t3: BODY(30, C.soft, { park: 'l', weight: 500 }),
    },
    order: ['burst', 'glow', 'ray1', 'ray2', 'ray3', 'ray4', 'ray5', 'ray6', 'g5', 'g4', 'g3', 'g2', 'g1', 'c1', 'calBand', 'calCover', 'bind1', 'bind2', 'c2', 'c3', 'dot1', 'dot2', 'dot3', 'num', 'shock1', 'shock2', 'foil', 'ticker',
      ...Array.from({ length: N_CONF }, (_, i) => `cf${i + 1}`), 'pic2', 'pic3', 'hero', 'badge', 'badgeT', 'brand', 'page', 'kick', 'kickC', 'title', 'titleC', 'body', 'bodyC', 'list', 'calMonth', 'calDay', 'n1', 'n2', 'n3', 'h1', 't1', 'h2', 't2', 'h3', 't3'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The opening: the product name over a violet-to-magenta gradient, a faint five rising behind it and light rays turning around it.', grad: GRAD[0]!,
        place: {
          ...chrome(1), ...rays(1420, 540, 0, 0.13), num: numBox(1420, 540, { a: 0.24 }),
          ...confetti({ seed: 11, palette: 'hot', avoid: [[100, 230, 1150, 760], [0, 40, W, 60]], ring: { cx: 1420, cy: 540, r0: 330, r1: 700 } }),
          ...txt(1, { ...rect(120, 250, 1000, 40), text: 'T MINUS 5 DAYS  ·  LIVE LAUNCH EVENT' }, { ...rect(120, 310, 1100, 520), text: 'VOLT\nRUNNER', px: 250 }, { ...rect(120, 850, 1000, 110), text: 'The sneaker launch event: five days to go, then we go live.' }),
        },
      },
      {
        id: 's2', title: 'Five', purpose: 'The five arrives at full size on the left while confetti bursts from it and the rays turn; the first launch task sits on the right.', grad: GRAD[1]!,
        place: {
          ...chrome(2), ...rays(520, 540, 1, 0.15), num: numBox(520, 540, { color: C.white }), g5: numBox(520, 540, { a: 0 }),
          ...confetti({ seed: 23, palette: 'hot', avoid: [[1020, 230, 820, 720], [0, 40, W, 60]], ring: { cx: 520, cy: 540, r0: 330, r1: 560 } }),
          ...txt(2, { ...rect(1040, 250, 760, 40), text: '5 DAYS TO GO' }, { ...rect(1040, 305, 780, 280), text: 'TEASE\nTHE DROP', px: 130 }, { ...rect(1040, 620, 760, 260), text: 'Show the silhouette, not the whole shoe. Post the date to your list and socials, and open the waitlist.', px: 40 }),
        },
      },
      {
        id: 's3', title: 'Four', purpose: 'The numeral crosses to the right as a four, tilted and gold, leaving the five behind as a ghost; the text drops to the bottom left.', grad: GRAD[2]!,
        place: {
          ...chrome(3), ...rays(1400, 470, 2, 0.16), num: numBox(1400, 470, { text: '4', color: '#FFE45C', rot: -7 }), g5: ghost(310, 250, 340, 0.17), g4: numBox(1400, 470, { a: 0, rot: -7 }),
          ...confetti({ seed: 37, palette: 'hot', avoid: [[100, 500, 980, 520], [0, 40, W, 60]], ring: { cx: 1400, cy: 470, r0: 330, r1: 620 } }),
          ...txt(3, { ...rect(120, 520, 800, 40), text: '4 DAYS TO GO' }, { ...rect(120, 570, 900, 270), text: 'EARLY\nACCESS', px: 130 }, { ...rect(120, 860, 1000, 130), text: 'Let subscribers and the waitlist in first, with a private link 24 hours before everyone else.', px: 36 }),
        },
      },
      {
        id: 's4', title: 'Three', purpose: 'On an orange-to-yellow field the three stands tall at the top centre, ghosts flanking it, with one centred line of advice beneath.', grad: GRAD[3]!,
        place: {
          ...chrome(4), ...rays(960, 340, 3, 0.26), num: numBox(960, 340, { text: '3', color: C.ink }), g5: ghost(190, 330, 300, 0.13, C.white), g4: ghost(1650, 300, 330, 0.17, C.white), g3: numBox(960, 340, { a: 0 }),
          ...confetti({ seed: 41, palette: 'warm', avoid: [[240, 690, 1440, 330], [0, 40, W, 60]], ring: { cx: 960, cy: 340, r0: 300, r1: 780 } }),
          kickC: { ...rect(360, 700, 1200, 40), text: '3 DAYS TO GO', color: TX[3]![0] }, titleC: { ...rect(260, 745, 1400, 120), text: 'SEED THE CREATORS', px: 104, color: C.ink },
          bodyC: { ...rect(460, 885, 1000, 110), text: 'Send pairs to twenty creators under one shared embargo, so every post lands at the same moment.', px: 34, color: C.ink },
        },
      },
      {
        id: 's5', title: 'Two', purpose: 'A white card slides in from the left with the press briefing while the two turns on the right over a blue-to-cyan field.', grad: GRAD[4]!,
        place: {
          ...chrome(5), ...rays(1450, 540, 4, 0.16), num: numBox(1450, 540, { text: '2', color: C.white, rot: 7 }), g5: ghost(300, 330, 300, 0.1), g4: ghost(1720, 200, 260, 0.16), g3: ghost(1210, 180, 300, 0.18), g2: numBox(1450, 540, { a: 0, rot: 7 }),
          c1: rect(100, 200, 900, 680, { radius: 48 }),
          ...confetti({ seed: 53, palette: 'cool', avoid: [[100, 200, 900, 680], [0, 40, W, 60]], ring: { cx: 1450, cy: 540, r0: 300, r1: 520 } }),
          ...txt(5, { ...rect(170, 270, 760, 40), text: '2 DAYS TO GO' }, { ...rect(170, 325, 780, 270), text: 'BRIEF THE\nPRESS', px: 120 }, { ...rect(170, 630, 760, 210), text: 'Send the fact sheet, the price and the embargo time to media and shop partners, with pairs for review.', px: 36 }),
        },
      },
      {
        id: 's6', title: 'One', purpose: 'A single gold one stands in the middle of a blue-to-violet field with the final checks on each side, and a dot of light appears at its heart.', grad: GRAD[5]!,
        place: {
          ...chrome(6), ...rays(960, 520, 5, 0.15), num: numBox(960, 520, { text: '1', color: C.yellow }), g5: ghost(250, 190, 240, 0.15), g4: ghost(1680, 190, 240, 0.15), g3: ghost(720, 890, 220, 0.15), g2: ghost(1220, 890, 220, 0.15), g1: numBox(960, 520, { a: 0 }),
          shock1: { x: 830, y: 390, w: 260, h: 260, a: 0 }, burst: rect(0, 0, W, H, { a: 0 }),
          ...confetti({ seed: 67, palette: 'hot', avoid: [[100, 280, 620, 700], [1230, 360, 640, 380], [0, 40, W, 60]], ring: { cx: 960, cy: 520, r0: 250, r1: 780 }, k: 0.85 }),
          ...txt(6, { ...rect(120, 300, 560, 40), text: '1 DAY TO GO' }, { ...rect(120, 355, 580, 230), text: 'FINAL\nCHECKS', px: 110 }, { ...rect(120, 620, 540, 340), text: 'Count the stock, load-test the checkout and brief everyone who will be on the floor tomorrow.', px: 34 }),
          list: { ...rect(1260, 400, 560, 300), text: '01  Stock counted\n02  Site load-tested\n03  Team briefed' },
        },
      },
      {
        id: 's7', title: 'Zero', purpose: 'The zero explodes in gold: a light burst fills the slide, a shockwave ring grows, and all five earlier numerals hang around it.', grad: GRAD[6]!,
        place: {
          ...chrome(7), ...rays(960, 520, 6, 0.12, C.gold), burst: rect(0, 0, W, H, { a: 0.62 }),
          num: numBox(960, 500, { text: '0', color: C.gold }), g5: ghost(250, 310, 260, 0.2, C.gold), g4: ghost(560, 760, 260, 0.2, C.magenta), g3: ghost(1390, 280, 260, 0.2, C.cyan), g2: ghost(1680, 740, 260, 0.2, C.white), g1: ghost(1120, 760, 200, 0.2, C.gold, { rot: 8 }),
          shock1: { x: 310, y: -130, w: 1300, h: 1300, a: 0.7 }, shock2: { x: 900, y: 460, w: 120, h: 120, a: 0.9 },
          hero: { x: 930, y: 490, w: 60, h: 60, rot: -90, a: 0 },
          ...confetti({ seed: 79, palette: 'night', avoid: [[460, 120, 1000, 80], [260, 820, 1400, 170], [0, 40, W, 60]], ring: { cx: 960, cy: 520, r0: 330, r1: 900 }, k: 1.1 }),
          kickC: { ...rect(460, 130, 1000, 40), text: 'T MINUS ZERO', color: C.white }, titleC: { ...rect(260, 850, 1400, 150), text: 'WE ARE LIVE', px: 140, color: C.white },
        },
      },
      {
        id: 's8', title: 'The reveal', purpose: 'The zero shrinks into the product name at the top, a shockwave ring spreads, and the hero pair of shoes bursts in from the centre with two more colourways beside it.', grad: GRAD[7]!,
        place: {
          ...chrome(8), ...rays(960, 700, 7, 0.1, C.gold), burst: rect(-200, 90, 2320, 1300, { a: 0.55 }), glow: rect(-200, 90, 2320, 1300, { a: 0.7 }),
          num: rect(160, 140, 1600, 220, { text: 'VOLT RUNNER', px: 190, color: C.white }), g5: ghost(-90, 250, 300, 0), g4: ghost(560, 1200, 300, 0), g3: ghost(1500, -250, 300, 0), g2: ghost(2000, 740, 300, 0), g1: ghost(1120, 1250, 200, 0),
          shock1: { x: -340, y: -440, w: 2600, h: 2600, a: 0 }, shock2: { x: 410, y: 160, w: 1100, h: 1100, a: 0.6 },
          hero: rect(600, 330, 720, 720), pic2: rect(110, 590, 440, 440, { rot: -8 }), pic3: rect(1370, 590, 440, 440, { rot: 8 }),
          badge: rect(1380, 380, 210, 210, { rot: -10 }), badgeT: rect(1380, 380, 210, 210, { rot: -10 }),
          ...confetti({ seed: 83, palette: 'night', avoid: [[560, 310, 800, 740], [150, 90, 1620, 290], [100, 360, 500, 170], [100, 570, 470, 480], [1350, 360, 280, 260], [1340, 570, 500, 480], [0, 40, W, 60]], k: 0.9 }),
          kickC: { ...rect(460, 108, 1000, 40), text: 'INTRODUCING', color: C.gold },
          body: { ...rect(110, 380, 470, 170), text: 'Five colourways, 280 g a shoe and a midsole that bounces back. Sample price shown.', px: 30, color: C.white },
        },
      },
      {
        id: 's9', title: 'Date and place', purpose: 'The white card turns into a calendar page for the launch date, the zero becomes the day of the month, and the shoe leans on its corner.', grad: GRAD[8]!,
        place: {
          ...chrome(9), ...rays(400, 540, 8, 0.1), shock2: { x: -440, y: -460, w: 2200, h: 2200, a: 0 },
          c1: rect(110, 190, 600, 700, { radius: 36 }), calBand: rect(110, 190, 600, 150), calCover: rect(110, 298, 600, 50), bind1: rect(250, 150, 28, 76), bind2: rect(542, 150, 28, 76),
          calMonth: rect(110, 190, 600, 110), num: rect(110, 330, 600, 420, { text: '12', px: 380, color: C.magenta }), calDay: rect(110, 740, 600, 100),
          hero: rect(550, 640, 420, 420, { rot: -14 }), glow: rect(-200, -100, 2320, 1300, { a: 0 }),
          ...confetti({ seed: 97, palette: 'hot', avoid: [[100, 140, 620, 760], [540, 630, 440, 440], [1000, 220, 840, 700], [0, 40, W, 60]], k: 0.9 }),
          ...txt(9, { ...rect(1010, 230, 820, 40), text: 'THE LAUNCH EVENT  ·  SAMPLE DETAILS' }, { ...rect(1010, 285, 820, 290), text: 'SAVE\nTHE DATE', px: 140 }, { ...rect(1010, 610, 820, 280), text: '7:00 PM  doors open\nPier 9 Warehouse, 21 Harbour Street\nLive on the website and app', px: 38 }),
        },
      },
      {
        id: 's10', title: 'Highlights', purpose: 'The calendar splits into three white cards that slide in from alternating sides, each with a headline, a line of detail and one of the shoes.', grad: GRAD[9]!,
        place: {
          ...chrome(10), ...rays(960, 540, 9, 0.07),
          c1: rect(120, 330, 1380, 190, { radius: 40 }), c2: rect(420, 546, 1380, 190, { radius: 40 }), c3: rect(120, 762, 1380, 190, { radius: 40 }),
          dot1: rect(160, 381, 88, 88), dot2: rect(1692, 597, 88, 88), dot3: rect(160, 813, 88, 88),
          n1: rect(160, 381, 88, 88), n2: rect(1692, 597, 88, 88), n3: rect(160, 813, 88, 88),
          h1: rect(290, 362, 960, 60), t1: { ...rect(290, 430, 960, 50), text: '280 g per shoe, with a knit upper that breathes.' },
          h2: { ...rect(690, 578, 960, 60), text: 'Cushion that rebounds' }, t2: { ...rect(690, 646, 960, 50), text: 'A dual-density midsole built for city miles.' },
          h3: rect(290, 794, 960, 60), t3: { ...rect(290, 862, 960, 50), text: 'Orange Burst, Electric Blue, Violet Pop and two more.' },
          hero: rect(1260, 288, 270, 270, { rot: -10 }), pic2: rect(390, 506, 270, 270, { rot: 8 }), pic3: rect(1260, 720, 270, 270, { rot: -8 }),
          ...confetti({ seed: 101, palette: 'cool', avoid: [[100, 290, 1720, 700], [100, 90, 1300, 190], [0, 40, W, 60]], k: 0.8 }),
          kick: { ...rect(120, 100, 800, 40), text: 'SAMPLE SPECS', color: C.yellow }, title: { ...rect(120, 160, 1500, 130), text: 'THREE THINGS TO KNOW', px: 100, color: C.white },
        },
      },
      {
        id: 's11', title: 'Offer', purpose: 'A band of gold foil with a ticker of offers sliding through it crosses the middle of the slide, with the pre-order terms above and below and the hero shoe in front.', grad: GRAD[10]!,
        place: {
          ...chrome(11), ...rays(1500, 600, 10, 0.3),
          c1: rect(0, 470, W, 190, { radius: 0, fill: C.ink }), foil: rect(0, 470, W, 190, { a: 0.3 }), ticker: rect(60, 470, 9200, 190, { color: C.yellow }),
          c2: rect(420, 546, 1380, 190, { a: 0, rot: 0 }), c3: rect(120, 762, 1380, 190, { a: 0 }),
          hero: rect(1290, 270, 580, 580, { rot: 12 }),
          badge: rect(960, 720, 210, 210, { rot: -8, fill: C.ink }), badgeT: rect(960, 720, 210, 210, { rot: -8, color: C.yellow, text: 'FROM\n$129' }),
          ...confetti({ seed: 113, palette: 'warm', avoid: [[100, 100, 1500, 400], [100, 700, 1100, 270], [1270, 250, 620, 640], [0, 440, W, 260], [0, 40, W, 60]], k: 0.85 }),
          ...txt(11, { ...rect(120, 130, 1000, 40), text: 'LAUNCH OFFER  ·  SAMPLE TERMS' }, { ...rect(120, 190, 1400, 160), text: 'PRE-ORDER FROM 8 PM', px: 120 }, { ...rect(120, 740, 800, 250), text: 'Reserve a pair before the doors close: a free colour swap, priority shipping and a numbered launch card for the first 48 hours.', px: 36 }),
        },
      },
      {
        id: 's12', title: 'Call to action', purpose: 'The slide goes back to near-black with a gold glow: the hero shoe on the right, the invitation on the left and the offer badge stretched into the button.', grad: GRAD[11]!,
        place: {
          ...chrome(12), ...rays(1400, 540, 11, 0.12, C.gold), burst: rect(440, 0, W, H, { a: 0.8 }), glow: rect(440, 0, W, H, { a: 0.6 }),
          num: numBox(1400, 540, { text: '12', color: C.gold, a: 0.14 }), ticker: rect(-3800, 470, 9200, 190, { a: 0 }), foil: rect(-1920, 470, W, 190, { a: 0 }),
          hero: rect(1000, 190, 820, 820, { rot: -10 }), pic2: rect(900, 640, 360, 360, { rot: 10 }),
          badge: rect(120, 860, 580, 110, { radius: 55, fill: C.gold }), badgeT: rect(120, 860, 580, 110, { text: 'RESERVE MY SPOT', px: 44 }),
          ...confetti({ seed: 127, palette: 'night', avoid: [[100, 210, 860, 780], [1000, 190, 820, 840], [0, 40, W, 60]], k: 1 }),
          ...txt(12, { ...rect(120, 220, 800, 40), text: 'SEE YOU THERE' }, { ...rect(120, 275, 860, 420), text: 'BE THERE\nWHEN IT\nLANDS', px: 140 }, { ...rect(120, 720, 800, 110), text: 'Free entry, doors at 7 PM. RSVP at voltrunner.example (sample).', px: 34 }),
        },
      },
    ],
  },
)
void at
