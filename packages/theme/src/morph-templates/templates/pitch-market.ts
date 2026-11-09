import { authored, at, off, rect, scale, W, H } from '../author'
import type { Place } from '../author'

/**
 * Market Pitch: a bright, precise fintech/SaaS investor deck that tells the story in shapes that become other shapes. Three nested circles size the market and the innermost one zooms
 * through until it fills the slide in indigo; it then shrinks into the open corner of a 2x2 positioning chart, where our hero sphere glides while the competitors shrink and drift away.
 * Five pill shapes are a funnel, then the columns of a bar chart, then the points of a rising line, then the steps of the go-to-market, the markers of the unit economics and the
 * bars of the use of funds. A laptop slides in and out as a hero. Key numbers are one scale-morphing object. Original choreography for SlidesDone.
 */
const C = { ink: '#14122B', mute: '#5B5780', indigo: '#4B3FE0', magenta: '#E040A0', mint: '#2BD9A4', kick: '#C9288A', pale: '#E7E3FF', mid: '#CFC8FF', line: '#E3DEFB', grey: '#B8B3D6', white: '#FFFFFF', soft: '#E9E6FF' }
const GRAD = { from: '#F9F8FF', to: '#EDE9FF', angle: 160 }
const HEAD = { brand: rect(96, 50, 400, 32), page: rect(1240, 50, 584, 32) }

/** a place that is there but not visible yet (or any more): the object fades in/out where it stands */
const ghost = (p: Place): Place => at(p, { a: 0 })
/** a place that is a small invisible version of itself: the object grows in from nothing */
const pop = (p: Place, k = 0.25): Place => at(scale(p, k), { a: 0 })
const box = (cx: number, cy: number, size: number, extra: Partial<Place> = {}): Place => ({ x: cx - size / 2, y: cy - size / 2, w: size, h: size, ...extra })
const ring = (cx: number, cy: number, r: number, extra: Partial<Place> = {}): Place => box(cx, cy, 2 * r, extra)
const sw = (p: Place, text: string, px?: number): Place => ({ ...p, text, ...(px ? { px } : {}) })

// ── the funnel: five pills, narrowing; each is later a column, a point on the line, a step and a bar ──
const FW = [940, 760, 600, 460, 340]
const FCX = 1290, FH = 116, FY = (i: number) => 260 + i * 140
const funnel = (i: number): Place => rect(FCX - FW[i]! / 2, FY(i), FW[i]!, FH)
const connPoly = (i: number): number[][] => { const wt = FW[i]! - 100, wb = FW[i + 1]! - 100, d = (1 - wb / wt) / 2; return [[0, 0], [1, 0], [1 - d, 1], [d, 1]] }
const conn = (i: number): Place => { const wt = FW[i]! - 100; return rect(FCX - wt / 2, FY(i) + FH - 4, wt, 32) }
const FILL = ['#4B3FE0', '#5C4EE8', '#6F60EE', '#C9288A', '#14122B'] as [string, string, string, string, string]
// columns: ARR by quarter (sample figures)
const COLW = 170
const colX = (i: number) => 800 + i * 206
const colH = [236, 306, 418, 572, 754]
const column = (i: number): Place => rect(colX(i), 940 - colH[i]!, COLW, colH[i]!)
// points of the rising line
const PTS: [number, number, number][] = [[860, 820, 118], [1085, 735, 118], [1310, 610, 128], [1530, 470, 140], [1735, 315, 160]]
const point = (i: number): Place => box(PTS[i]![0], PTS[i]![1], PTS[i]![2])
const seg = (i: number): Place => {
  const [x1, y1] = PTS[i]!, [x2, y2] = PTS[i + 1]!
  const L = Math.hypot(x2 - x1, y2 - y1)
  return { x: (x1 + x2) / 2 - L / 2, y: (y1 + y2) / 2 - 5, w: L, h: 10, rot: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI }
}
const PVPX = [28, 28, 30, 32, 36]

// ── the positioning chart ──
const ZONE = ring(1560, 340, 210)
const AX = rect(800, 540, 1020, 4), AY = rect(1300, 150, 4, 790)
const COMP: { dot: Place; label: Place; text: string }[] = [
  { dot: box(905, 770, 72), label: rect(959, 755, 280, 32), text: 'Spreadsheets' },
  { dot: box(985, 290, 92), label: rect(1045, 275, 240, 32), text: 'BI suites' },
  { dot: box(1500, 810, 84), label: rect(1556, 795, 270, 32), text: 'Light dashboards' },
  { dot: box(1060, 650, 58), label: rect(1103, 635, 190, 32), text: 'Point tools' },
  { dot: box(1570, 650, 64), label: rect(1616, 635, 200, 32), text: 'Add-ons' },
]
const drift = (p: Place, dx: number, dy: number): Place => at(scale(p, 0.3), { x: p.x + p.w * 0.35 + dx, y: p.y + p.h * 0.35 + dy, a: 0 })

// ── texts of a left-hand column ──
const K = (text: string, y = 140): Place => ({ ...rect(96, y, 700, 32), text })
const row3 = (i: number, y: number) => ({ y, i })
void row3

export const PITCH_MARKET = authored(
  {
    id: 'pitch-market', category: 'pitch', name: 'Market Pitch', tagline: 'Market size, positioning and growth told in moving shapes',
    description: 'A bright investor deck that makes the numbers move: nested circles size the market and zoom into the next slide, a positioning map where competitors drift away, a funnel that turns into bars and then a rising line, a product mockup that slides in, unit economics and the ask.',
    audience: 'The Market Pitch template suits startup and SaaS investor decks, seed and Series A fundraising, market-opportunity and competitive-positioning talks, go-to-market plans, board updates and any pitch that has to prove the size of the opportunity with numbers.',
    topics: ['pitch', 'pitch deck', 'investor', 'investors', 'investor deck', 'market size', 'market opportunity', 'tam sam som', 'total addressable market', 'competition', 'competitive landscape', 'positioning', 'go to market', 'go-to-market', 'fundraising', 'series a', 'seed', 'startup', 'saas', 'b2b software', 'unit economics', 'traction', 'funnel', 'business plan', 'venture capital'],
    fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
    colors: { background: '#F5F3FF', surface: '#FFFFFF', textPrimary: '#14122B', textSecondary: '#5B5780', primary: '#4B3FE0', secondary: '#E040A0', accent: '#2BD9A4', onPrimary: '#FFFFFF' },
    background: '#F5F3FF',
  },
  {
    objects: {
      // market circles (m3 is also the open corner of the chart)
      m1: { kind: 'shape', shape: 'ellipse', fill: C.pale },
      m2: { kind: 'shape', shape: 'ellipse', fill: C.mid },
      m3: { kind: 'shape', shape: 'ellipse', fill: C.indigo },
      // chart axes (later the baseline and the axis of the bars)
      ax: { kind: 'shape', radius: 2, fill: C.ink },
      ay: { kind: 'shape', radius: 2, fill: C.ink },
      c1: { kind: 'shape', radius: 28, fill: C.white, stroke: C.line, strokeW: 2, park: 'b' },
      c2: { kind: 'shape', radius: 28, fill: C.white, stroke: C.line, strokeW: 2, park: 'b' },
      c3: { kind: 'shape', radius: 28, fill: C.white, stroke: C.line, strokeW: 2, park: 'b' },
      tz1: { kind: 'shape', fill: '#DAD4FF', poly: connPoly(0) }, tz2: { kind: 'shape', fill: '#DAD4FF', poly: connPoly(1) },
      tz3: { kind: 'shape', fill: '#DAD4FF', poly: connPoly(2) }, tz4: { kind: 'shape', fill: '#DAD4FF', poly: connPoly(3) },
      ln1: { kind: 'shape', radius: 5, fill: C.mint }, ln2: { kind: 'shape', radius: 5, fill: C.mint }, ln3: { kind: 'shape', radius: 5, fill: C.mint }, ln4: { kind: 'shape', radius: 5, fill: C.mint },
      mk1: { kind: 'shape', shape: 'ellipse', fill: C.mid, park: 'r' }, mk2: { kind: 'shape', shape: 'ellipse', fill: '#9A8FF2', park: 'r' }, mk3: { kind: 'shape', shape: 'ellipse', fill: C.indigo, park: 'r' },
      f1: { kind: 'shape', radius: 120, fill: FILL[0] }, f2: { kind: 'shape', radius: 120, fill: FILL[1] }, f3: { kind: 'shape', radius: 120, fill: FILL[2] },
      f4: { kind: 'shape', radius: 120, fill: FILL[3] }, f5: { kind: 'shape', radius: 120, fill: FILL[4] },
      cd1: { kind: 'shape', shape: 'ellipse', fill: C.grey }, cd2: { kind: 'shape', shape: 'ellipse', fill: C.grey }, cd3: { kind: 'shape', shape: 'ellipse', fill: C.grey },
      cd4: { kind: 'shape', shape: 'ellipse', fill: C.grey }, cd5: { kind: 'shape', shape: 'ellipse', fill: C.grey },
      // pictures
      laptop: { kind: 'image', art: 'market-laptop.webp', alt: 'A thin silver laptop showing a bright analytics dashboard', park: 'r' },
      torus: { kind: 'image', art: 'market-torus.webp', alt: 'A glossy mint-green torus', park: 't' },
      cube: { kind: 'image', art: 'market-cube.webp', alt: 'A glossy magenta rounded cube', park: 'b' },
      gem: { kind: 'image', art: 'market-gem.webp', alt: 'A glossy mint-green sphere', park: 'r' },
      orb: { kind: 'image', art: 'market-orb.webp', alt: 'A glossy sphere shading from indigo to magenta' },
      // text
      brand: { kind: 'text', text: 'FLOWBASE', px: 22, weight: 800, color: C.ink, caps: true, spc: 5, face: 'heading' },
      page: { kind: 'text', text: 'Series A  ·  Sample deck', px: 22, weight: 500, color: C.mute, align: 'r' },
      k: { kind: 'text', text: '', px: 24, weight: 700, color: C.kick, caps: true, spc: 4 },
      title: { kind: 'text', text: '', px: 60, weight: 800, color: C.ink, face: 'heading', lh: 1.07, spc: -1.5 },
      body: { kind: 'text', text: '', px: 30, weight: 400, color: C.mute, lh: 1.45 },
      note: { kind: 'text', text: '', px: 24, weight: 500, color: C.mute },
      stat: { kind: 'text', text: '', px: 240, weight: 800, color: C.indigo, face: 'heading', lh: 1, spc: -8, park: 'l' },
      // market circles labels
      tagT: { kind: 'text', text: '', px: 24, weight: 700, color: C.indigo, caps: true, spc: 5, align: 'ctr' }, numT: { kind: 'text', text: '', px: 64, weight: 800, color: C.ink, face: 'heading', lh: 1, spc: -2, align: 'ctr' },
      tagS: { kind: 'text', text: '', px: 24, weight: 700, color: C.indigo, caps: true, spc: 5, align: 'ctr' }, numS: { kind: 'text', text: '', px: 56, weight: 800, color: C.ink, face: 'heading', lh: 1, spc: -2, align: 'ctr' },
      tagO: { kind: 'text', text: '', px: 24, weight: 700, color: '#CFC8FF', caps: true, spc: 5, align: 'ctr' }, numO: { kind: 'text', text: '', px: 52, weight: 800, color: C.white, face: 'heading', lh: 1, spc: -2, align: 'ctr' },
      bodyW: { kind: 'text', text: '', px: 36, weight: 400, color: '#E6E3FF', lh: 1.45, align: 'ctr' },
      // rows and cards
      h1: { kind: 'text', text: '', px: 36, weight: 800, color: C.ink, face: 'heading', lh: 1.1, spc: -0.5 }, t1: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 },
      h2: { kind: 'text', text: '', px: 36, weight: 800, color: C.ink, face: 'heading', lh: 1.1, spc: -0.5 }, t2: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 },
      h3: { kind: 'text', text: '', px: 36, weight: 800, color: C.ink, face: 'heading', lh: 1.1, spc: -0.5 }, t3: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 },
      // inside the pills / columns / points
      lab1: { kind: 'text', text: '', px: 22, weight: 700, color: C.white, caps: true, spc: 3, align: 'ctr' }, lab2: { kind: 'text', text: '', px: 22, weight: 700, color: C.white, caps: true, spc: 3, align: 'ctr' },
      lab3: { kind: 'text', text: '', px: 22, weight: 700, color: C.white, caps: true, spc: 3, align: 'ctr' }, lab4: { kind: 'text', text: '', px: 22, weight: 700, color: C.white, caps: true, spc: 3, align: 'ctr' },
      lab5: { kind: 'text', text: '', px: 22, weight: 700, color: C.white, caps: true, spc: 3, align: 'ctr' },
      val1: { kind: 'text', text: '', px: 44, weight: 800, color: C.white, face: 'heading', lh: 1.1, spc: -1, align: 'ctr' }, val2: { kind: 'text', text: '', px: 44, weight: 800, color: C.white, face: 'heading', lh: 1.1, spc: -1, align: 'ctr' },
      val3: { kind: 'text', text: '', px: 44, weight: 800, color: C.white, face: 'heading', lh: 1.1, spc: -1, align: 'ctr' }, val4: { kind: 'text', text: '', px: 44, weight: 800, color: C.white, face: 'heading', lh: 1.1, spc: -1, align: 'ctr' },
      val5: { kind: 'text', text: '', px: 44, weight: 800, color: C.white, face: 'heading', lh: 1.1, spc: -1, align: 'ctr' },
      // chart labels
      cn1: { kind: 'text', text: '', px: 24, weight: 600, color: C.mute }, cn2: { kind: 'text', text: '', px: 24, weight: 600, color: C.mute }, cn3: { kind: 'text', text: '', px: 24, weight: 600, color: C.mute },
      cn4: { kind: 'text', text: '', px: 24, weight: 600, color: C.mute }, cn5: { kind: 'text', text: '', px: 24, weight: 600, color: C.mute },
      axX: { kind: 'text', text: '', px: 22, weight: 700, color: C.mute, caps: true, spc: 3, align: 'r' }, axY: { kind: 'text', text: '', px: 22, weight: 700, color: C.mute, caps: true, spc: 3, align: 'r' },
      usLab: { kind: 'text', text: '', px: 22, weight: 800, color: C.indigo, caps: true, spc: 4, align: 'ctr', face: 'heading' },
      callout: { kind: 'text', text: '', px: 34, weight: 800, color: C.ink, face: 'heading', lh: 1.15, spc: -0.5, align: 'ctr' },
    },
    order: ['m1', 'm2', 'm3', 'ax', 'ay', 'c1', 'c2', 'c3', 'tz1', 'tz2', 'tz3', 'tz4', 'ln1', 'ln2', 'ln3', 'ln4', 'mk1', 'mk2', 'mk3', 'f1', 'f2', 'f3', 'f4', 'f5', 'cd1', 'cd2', 'cd3', 'cd4', 'cd5',
      'laptop', 'torus', 'cube', 'gem', 'orb',
      'brand', 'page', 'k', 'title', 'body', 'note', 'stat', 'tagT', 'numT', 'tagS', 'numS', 'tagO', 'numO', 'bodyW', 'h1', 't1', 'h2', 't2', 'h3', 't3',
      'lab1', 'lab2', 'lab3', 'lab4', 'lab5', 'val1', 'val2', 'val3', 'val4', 'val5', 'cn1', 'cn2', 'cn3', 'cn4', 'cn5', 'axX', 'axY', 'usLab', 'callout'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The opening: one bold promise on the left and the hero sphere with its floating shapes on the right.', grad: GRAD,
        place: {
          ...HEAD, orb: rect(1070, 150, 760, 760), torus: rect(1500, 100, 300, 300, { rot: 20 }), cube: rect(880, 770, 210, 210, { rot: -14 }), gem: rect(1700, 820, 140, 140),
          k: sw(K('', 290), 'SERIES A  ·  SAMPLE DECK'), title: { ...rect(96, 340, 980, 340), text: 'Make every\nsoftware dollar\naccountable.', px: 100 },
          body: { ...rect(96, 710, 740, 150), text: 'Flowbase connects spend, usage and outcomes for finance teams. Illustrative figures throughout.', px: 32 },
        },
      },
      {
        id: 's2', title: 'Problem', purpose: 'The title shrinks to a header and a giant 63% states the problem; three cards on the right list what goes wrong.', grad: GRAD,
        place: {
          ...HEAD, orb: rect(1640, 735, 240, 240, { rot: 40 }),
          k: sw(K('THE PROBLEM'), 'THE PROBLEM'), title: { ...rect(96, 190, 760, 210), text: 'Teams pay for software they cannot measure' },
          stat: { ...rect(96, 400, 760, 250), text: '63%' }, body: { ...rect(96, 660, 700, 130), text: 'of finance and operations leaders cannot link software spend to results. Sample figure.', px: 28 },
          c1: rect(920, 170, 780, 200), c2: rect(920, 400, 780, 200), c3: rect(920, 630, 780, 200),
          h1: { ...rect(980, 204, 660, 44), text: 'Tools multiply' }, t1: { ...rect(980, 256, 660, 100), text: 'A mid-sized company runs dozens of apps, and nobody owns the full bill.' },
          h2: { ...rect(980, 434, 660, 44), text: 'Data stays siloed' }, t2: { ...rect(980, 486, 660, 100), text: 'Spend sits in finance, usage in IT and results in the business unit.' },
          h3: { ...rect(980, 664, 660, 44), text: 'Answers arrive late' }, t3: { ...rect(980, 716, 660, 100), text: 'Quarterly reviews find waste months after the renewal date has passed.' },
        },
      },
      {
        id: 's3', title: 'Market size', purpose: 'The giant number leaves and three nested circles size the market: total, serviceable and obtainable.', grad: GRAD,
        place: {
          ...HEAD, orb: rect(800, 800, 180, 180, { rot: 90 }),
          m1: ring(560, 560, 400), m2: ring(560, 690, 270), m3: ring(560, 820, 140),
          tagT: { ...rect(410, 196, 300, 30), text: 'TAM' }, numT: { ...rect(410, 232, 300, 76), text: '$24B' }, tagS: { ...rect(410, 458, 300, 30), text: 'SAM' }, numS: { ...rect(410, 494, 300, 66), text: '$6B' },
          tagO: { ...rect(460, 730, 200, 28), text: 'SOM' }, numO: { ...rect(440, 762, 240, 64), text: '$180M' },
          k: { ...rect(1040, 140, 780, 32), text: 'MARKET SIZE  ·  SAMPLE FIGURES' }, title: { ...rect(1040, 190, 780, 210), text: 'A $24B market, and we start with $180M of it' }, body: ghost({ ...rect(96, 450, 600, 100), text: '' }),
          mk1: box(1054, 492, 28), mk2: box(1054, 652, 28), mk3: box(1054, 812, 28),
          h1: { ...rect(1100, 470, 740, 44), text: 'Total addressable market' }, t1: { ...rect(1100, 520, 740, 84), text: 'All spend-management software bought by mid-sized companies worldwide.' },
          h2: { ...rect(1100, 630, 740, 44), text: 'Serviceable market' }, t2: { ...rect(1100, 680, 740, 84), text: 'The teams in our three launch regions that fit today’s product.' },
          h3: { ...rect(1100, 790, 740, 44), text: 'Obtainable market' }, t3: { ...rect(1100, 840, 740, 84), text: 'The share our sales motion can realistically win within three years.' },
        },
      },
      {
        id: 's4', title: 'Market zoom', purpose: 'The innermost circle, our obtainable share, grows until it fills the slide in indigo and becomes the background for its own number.', grad: GRAD,
        place: {
          ...HEAD, brand: at(HEAD.brand, { a: 0 }), page: at(HEAD.page, { a: 0 }),
          m1: at(ring(960, 540, 1500), { a: 0 }), m2: at(ring(960, 540, 1300), { a: 0 }), m3: ring(960, 540, 1160),
          tagT: ghost(rect(410, 196, 300, 30)), numT: ghost(rect(410, 232, 300, 76)), tagS: ghost(rect(410, 458, 300, 30)), numS: ghost(rect(410, 494, 300, 66)),
          tagO: { ...rect(360, 215, 1200, 34), text: 'SOM  ·  OUR FIRST THREE YEARS' }, numO: { ...rect(160, 280, 1600, 300), text: '$180M', px: 280 },
          bodyW: { ...rect(460, 640, 1000, 170), text: 'The mid-sized finance and operations teams our sales motion can reach with today’s product. Sample figure.' },
          orb: rect(200, 130, 210, 210, { rot: 140 }), torus: rect(110, 640, 330, 330, { rot: -18 }), cube: rect(1480, 630, 320, 320, { rot: 12 }), gem: rect(1530, 150, 130, 130),
          k: ghost({ ...rect(1040, 140, 780, 32), text: 'MARKET SIZE  ·  SAMPLE FIGURES' }), title: ghost({ ...rect(1040, 190, 780, 210), text: 'A $24B market, and we start with $180M of it' }), body: ghost({ ...rect(96, 450, 600, 100), text: '' }),
          mk1: ghost(box(1054, 492, 28)), mk2: ghost(box(1054, 652, 28)), mk3: ghost(box(1054, 812, 28)),
          h1: ghost({ ...rect(1100, 470, 740, 44), text: 'Total addressable market' }), t1: ghost({ ...rect(1100, 520, 740, 84), text: 'All spend-management software bought by mid-sized companies worldwide.' }),
          h2: ghost({ ...rect(1100, 630, 740, 44), text: 'Serviceable market' }), t2: ghost({ ...rect(1100, 680, 740, 84), text: 'The teams in our three launch regions that fit today’s product.' }),
          h3: ghost({ ...rect(1100, 790, 740, 44), text: 'Obtainable market' }), t3: ghost({ ...rect(1100, 840, 740, 84), text: 'The share our sales motion can realistically win within three years.' }),
          ax: ghost(scale(AX, 0.05)), ay: ghost(scale(AY, 0.05)),
          ...Object.fromEntries(COMP.flatMap((c, i) => [[`cd${i + 1}`, pop(c.dot)], [`cn${i + 1}`, ghost({ ...c.label, text: c.text })]])),
        },
      },
      {
        id: 's5', title: 'Competition map', purpose: 'The circle shrinks into the open top-right corner of a two-axis map where five competitors cluster at the edges.', grad: GRAD,
        place: {
          ...HEAD, m3: at(ZONE, { fill: C.soft }), ax: AX, ay: AY, orb: box(1180, 830, 130, { rot: 0 }),
          k: sw(K('COMPETITION  ·  SAMPLE MAP'), 'COMPETITION  ·  SAMPLE MAP'), title: { ...rect(96, 190, 660, 215), text: 'Crowded at the edges, empty in the corner' },
          body: { ...rect(96, 440, 620, 200), text: 'Spreadsheets are easy but shallow. BI suites are deep but slow to adopt. Nobody serves finance teams on both axes.', px: 30 },
          note: { ...rect(96, 930, 700, 30), text: 'Sample positioning, for illustration only.' },
          ...Object.fromEntries(COMP.flatMap((c, i) => [[`cd${i + 1}`, c.dot], [`cn${i + 1}`, { ...c.label, text: c.text }]])),
          axX: { ...rect(1380, 950, 440, 30), text: 'Easier to adopt  →' }, axY: { ...rect(1062, 315, 420, 30, { rot: -90 }), text: 'Deeper analytics  →' },
          usLab: { ...rect(1030, 902, 300, 30), text: 'FLOWBASE' }, callout: ghost({ ...rect(1330, 606, 460, 100), text: 'Easy to adopt and deep enough to trust' }),
          tagO: ghost({ ...rect(360, 215, 1200, 34), text: 'SOM  ·  OUR FIRST THREE YEARS' }), numO: ghost({ ...rect(160, 280, 1600, 300), text: '$180M', px: 280 }), bodyW: ghost({ ...rect(460, 640, 1000, 170), text: 'The mid-sized finance and operations teams our sales motion can reach with today’s product. Sample figure.' }),
        },
      },
      {
        id: 's6', title: 'Positioning', purpose: 'Our sphere glides to the open corner and grows while the competitors shrink and drift away.', grad: GRAD,
        place: {
          ...HEAD, m3: at(ZONE, { fill: C.mid }), ax: AX, ay: AY, orb: box(1560, 340, 300, { rot: 300 }),
          k: sw(K('POSITIONING'), 'POSITIONING'), title: { ...rect(96, 190, 660, 150), text: 'We own the open corner' },
          body: { ...rect(96, 370, 620, 200), text: 'Easy to connect in minutes, deep enough for the CFO. That pairing is what mid-sized teams cannot buy today.', px: 30 },
          note: { ...rect(96, 930, 700, 30), text: 'Sample positioning, for illustration only.' },
          ...Object.fromEntries(COMP.flatMap((c, i) => [[`cd${i + 1}`, drift(c.dot, i % 2 ? 90 : -110, i < 2 ? -60 : 80)], [`cn${i + 1}`, ghost({ ...c.label, text: c.text })]])),
          axX: { ...rect(1380, 950, 440, 30), text: 'Easier to adopt  →' }, axY: { ...rect(1062, 315, 420, 30, { rot: -90 }), text: 'Deeper analytics  →' },
          usLab: { ...rect(1410, 566, 300, 30), text: 'FLOWBASE' }, callout: { ...rect(1330, 606, 460, 100), text: 'Easy to adopt and deep enough to trust' },
          ...Object.fromEntries(FW.map((_, i) => [`f${i + 1}`, pop(funnel(i))])),
        },
      },
      {
        id: 's7', title: 'Funnel', purpose: 'The map clears and five pills stack into a funnel that narrows from visitors to expanding customers.', grad: GRAD,
        place: {
          ...HEAD, orb: box(1790, 180, 140, { rot: 20 }), ax: ghost(rect(780, 944, 1050, 4)), ay: ghost(rect(776, 230, 4, 714)), m3: at(scale(ZONE, 0.3), { x: 1650, y: 100, a: 0 }),
          k: sw(K('ACQUISITION TO REVENUE  ·  SAMPLE'), 'ACQUISITION TO REVENUE  ·  SAMPLE'), title: { ...rect(96, 190, 700, 215), text: 'Every step narrows,\nevery step is\nmeasured', px: 58 },
          body: { ...rect(96, 440, 620, 200), text: 'From first visit to expansion revenue, each stage converts steadily. Sample figures for a typical B2B trial.', px: 30 },
          ...Object.fromEntries(FW.flatMap((_, i) => [[`f${i + 1}`, funnel(i)],
            [`lab${i + 1}`, { ...rect(FCX - FW[i]! / 2, FY(i) + 14, FW[i]!, 28), text: ['VISITORS', 'TRIALS', 'ACTIVATED', 'PAYING', 'EXPANDING'][i]! }],
            [`val${i + 1}`, { ...rect(FCX - FW[i]! / 2, FY(i) + 44, FW[i]!, 54), text: ['48,000', '4,800', '2,100', '640', '310'][i]!, px: 44 }]])),
          ...Object.fromEntries([0, 1, 2, 3].map((i) => [`tz${i + 1}`, conn(i)])),
          usLab: ghost({ ...rect(1410, 566, 300, 30), text: 'FLOWBASE' }), callout: ghost({ ...rect(1330, 606, 460, 100), text: 'Easy to adopt and deep enough to trust' }),
          axX: ghost({ ...rect(1380, 950, 440, 30), text: 'Easier to adopt  →' }), axY: ghost({ ...rect(1062, 135, 420, 30, { rot: -90 }), text: 'Deeper analytics  →' }),
        },
      },
      {
        id: 's8', title: 'Funnel to bars', purpose: 'The same five pills stand up as the columns of a bar chart: annual recurring revenue by quarter.', grad: GRAD,
        place: {
          ...HEAD, orb: rect(110, 790, 200, 200, { rot: 60 }), ax: rect(780, 944, 1050, 4), ay: rect(776, 230, 4, 714),
          k: sw(K('REVENUE  ·  SAMPLE FIGURES'), 'REVENUE  ·  SAMPLE FIGURES'), title: { ...rect(96, 190, 660, 150), text: 'Revenue compounds as cohorts expand', px: 60 },
          body: { ...rect(96, 370, 620, 200), text: 'Annual recurring revenue by quarter. Each cohort pays more after its first year as teams add seats and modules.', px: 30 },
          ...Object.fromEntries(FW.flatMap((_, i) => [[`f${i + 1}`, column(i)],
            [`lab${i + 1}`, { ...rect(colX(i), 898, COLW, 28), text: `Q${i + 1}` }],
            [`val${i + 1}`, { ...rect(colX(i), 940 - colH[i]! + 42, COLW, 50), text: ['$0.4M', '$0.9M', '$1.7M', '$2.8M', '$4.1M'][i]!, px: 40 }]])),
          ...Object.fromEntries([0, 1, 2, 3].map((i) => [`ln${i + 1}`, ghost(scale(seg(i), 0.3))])),
        },
      },
      {
        id: 's9', title: 'Traction line', purpose: 'The columns shrink to points and a mint line draws through them as the number 10x slides in.', grad: GRAD,
        place: {
          ...HEAD, orb: rect(330, 810, 170, 170, { rot: 120 }), ax: rect(780, 944, 1050, 4), ay: rect(776, 230, 4, 714),
          k: sw(K('TRACTION  ·  SAMPLE FIGURES'), 'TRACTION  ·  SAMPLE FIGURES'), title: { ...rect(96, 190, 660, 150), text: 'Growth that keeps compounding', px: 60 },
          stat: { ...rect(96, 380, 660, 240), text: '10×' }, body: { ...rect(96, 630, 620, 130), text: 'ARR growth in five quarters, from $0.4M to $4.1M. Sample figures.', px: 30 },
          c1: rect(96, 1160, 740, 170), c2: rect(96, 1350, 740, 170), c3: rect(96, 1540, 740, 170),
          h1: ({ ...rect(244, 1180, 560, 42), text: 'Product-led trial', px: 34 }), t1: ({ ...rect(244, 1228, 560, 76), text: 'A free trial that connects in minutes and proves its value fast.', px: 26 }),
          h2: ({ ...rect(244, 1370, 560, 42), text: 'Sales-assist', px: 34 }), t2: ({ ...rect(244, 1418, 560, 76), text: 'A small team joins once usage passes a seat threshold.', px: 26 }),
          h3: ({ ...rect(244, 1560, 560, 42), text: 'Partners', px: 34 }), t3: ({ ...rect(244, 1608, 560, 76), text: 'Accounting firms and resellers bring whole portfolios.', px: 26 }),
          ...Object.fromEntries(FW.flatMap((_, i) => [[`f${i + 1}`, point(i)],
            [`lab${i + 1}`, ghost({ ...rect(PTS[i]![0] - 80, PTS[i]![1] + 10, 160, 28), text: `Q${i + 1}` })],
            [`val${i + 1}`, { ...rect(PTS[i]![0] - PTS[i]![2] / 2, PTS[i]![1] - PVPX[i]! * 0.6, PTS[i]![2], PVPX[i]! * 1.2), text: ['$0.4M', '$0.9M', '$1.7M', '$2.8M', '$4.1M'][i]!, px: PVPX[i]! }]])),
          ...Object.fromEntries([0, 1, 2, 3].map((i) => [`ln${i + 1}`, seg(i)])),
        },
      },
      {
        id: 's10', title: 'Go-to-market', purpose: 'The line breaks into three numbered steps while a laptop slides in from the right to show the product.', grad: GRAD,
        place: {
          ...HEAD, orb: rect(1700, 100, 150, 150, { rot: 200 }), laptop: rect(880, 250, 960, 640), cube: rect(1690, 800, 170, 170, { rot: 15 }), gem: rect(900, 170, 90, 90),
          ax: ghost(rect(780, 944, 1050, 4)), ay: ghost(rect(776, 230, 4, 714)),
          k: sw(K('GO-TO-MARKET'), 'GO-TO-MARKET'), title: { ...rect(96, 190, 760, 150), text: 'Product-led first,\nsales-assisted next', px: 60 },
          body: ghost({ ...rect(96, 630, 620, 130), text: 'ARR growth in five quarters, from $0.4M to $4.1M. Sample figures.' }),
          c1: rect(96, 380, 740, 170), c2: rect(96, 570, 740, 170), c3: rect(96, 760, 740, 170),
          f1: box(172, 465, 84), f2: box(172, 655, 84), f3: box(172, 845, 84), f4: at(box(172, 845, 20), { a: 0 }), f5: at(box(172, 845, 20), { a: 0 }),
          val1: { ...rect(130, 441, 84, 48), text: '1', px: 40 }, val2: { ...rect(130, 631, 84, 48), text: '2', px: 40 }, val3: { ...rect(130, 821, 84, 48), text: '3', px: 40 },
          h1: { ...rect(244, 404, 560, 42), text: 'Product-led trial', px: 34 }, t1: { ...rect(244, 452, 560, 76), text: 'A free trial that connects in minutes and proves its value fast.', px: 26 },
          h2: { ...rect(244, 594, 560, 42), text: 'Sales-assist', px: 34 }, t2: { ...rect(244, 642, 560, 76), text: 'A small team joins once usage passes a seat threshold.', px: 26 },
          h3: { ...rect(244, 784, 560, 42), text: 'Partners', px: 34 }, t3: { ...rect(244, 832, 560, 76), text: 'Accounting firms and resellers bring whole portfolios.', px: 26 },
          ...Object.fromEntries([0, 1, 2, 3].map((i) => [`ln${i + 1}`, ghost(scale(seg(i), 0.3))])),
        },
      },
      {
        id: 's11', title: 'Unit economics', purpose: 'The laptop slides out; the steps become coloured markers beside three unit-economics cards and a new giant number.', grad: GRAD,
        place: {
          ...HEAD, orb: rect(110, 830, 160, 160, { rot: 280 }), laptop: off(rect(880, 250, 960, 640), 'r'),
          k: sw(K('UNIT ECONOMICS  ·  SAMPLE'), 'UNIT ECONOMICS  ·  SAMPLE'), title: { ...rect(96, 190, 760, 150), text: 'Unit economics\nthat compound', px: 60 },
          stat: { ...rect(96, 380, 760, 260), text: '5.2×' }, body: { ...rect(96, 650, 640, 140), text: 'Lifetime value to acquisition cost, with payback in under a year. Sample figures.', px: 30 },
          c1: rect(960, 190, 880, 200), c2: rect(960, 420, 880, 200), c3: rect(960, 650, 880, 200),
          f1: at(box(1018, 290, 40), { fill: C.indigo }), f2: at(box(1018, 520, 40), { fill: C.magenta }), f3: at(box(1018, 750, 40), { fill: C.mint }), f4: at(box(1018, 750, 20), { a: 0 }), f5: at(box(1018, 750, 20), { a: 0 }),
          val1: ghost({ ...rect(130, 441, 84, 48), text: '1', px: 40 }), val2: ghost({ ...rect(130, 631, 84, 48), text: '2', px: 40 }), val3: ghost({ ...rect(130, 821, 84, 48), text: '3', px: 40 }),
          h1: { ...rect(1090, 256, 320, 80), text: '118%', px: 68 }, t1: { ...rect(1430, 252, 380, 80), text: 'Net revenue\nretention', px: 28 },
          h2: { ...rect(1090, 486, 320, 80), text: '11 mo', px: 68 }, t2: { ...rect(1430, 482, 380, 80), text: 'Payback on\nacquisition cost', px: 28 },
          h3: { ...rect(1090, 716, 320, 80), text: '82%', px: 68 }, t3: { ...rect(1430, 712, 380, 80), text: 'Gross margin on\nsubscriptions', px: 28 },
        },
      },
      {
        id: 's12', title: 'The ask', purpose: 'The cards drop away; a giant $12M states the raise and the markers stretch into the three bars of its use of funds.', grad: GRAD,
        place: {
          ...HEAD, orb: rect(110, 810, 180, 180, { rot: 20 }),
          k: sw(K('THE ASK'), 'THE ASK'), title: { ...rect(960, 215, 880, 70), text: 'Where the money goes', px: 52 }, note: { ...rect(960, 810, 880, 30), text: 'Illustrative allocation. Sample figures.' },
          stat: { ...rect(96, 190, 860, 330), text: '$12M', px: 300 }, body: { ...rect(96, 560, 760, 210), text: 'Series A to put go-to-market on rails: a sales team of six, the integrations trial users ask for most and eighteen months of runway.', px: 32 },
          c1: off(rect(960, 190, 880, 200), 'b'), c2: off(rect(960, 420, 880, 200), 'b'), c3: off(rect(960, 650, 880, 200), 'b'),
          f1: rect(1340, 340, 495, 100, { fill: C.indigo }), f2: rect(1340, 490, 385, 100, { fill: C.magenta }), f3: rect(1340, 640, 220, 100, { fill: C.mint }), f4: at(rect(1340, 640, 20, 20), { a: 0 }), f5: at(rect(1340, 640, 20, 20), { a: 0 }),
          val1: { ...rect(1340, 366, 495, 52), text: '45%', px: 40 }, val2: { ...rect(1340, 516, 385, 52), text: '35%', px: 40 }, val3: { ...rect(1340, 666, 220, 52), text: '20%', px: 40 },
          h1: { ...rect(960, 368, 360, 44), text: 'Product and data', px: 32 }, h2: { ...rect(960, 518, 360, 44), text: 'Sales and partners', px: 32 }, h3: { ...rect(960, 668, 360, 44), text: 'Operations', px: 32 },
          t1: ghost({ ...rect(1430, 252, 380, 80), text: 'Net revenue\nretention' }), t2: ghost({ ...rect(1430, 482, 380, 80), text: 'Payback on\nacquisition cost' }), t3: ghost({ ...rect(1430, 712, 380, 80), text: 'Gross margin on\nsubscriptions' }),
        },
      },
      {
        id: 's13', title: 'Closing', purpose: 'The cover comes back: the hero sphere returns to the right with its floating shapes and the contact details on the left.', grad: GRAD,
        place: {
          ...HEAD, orb: rect(1070, 150, 760, 760, { rot: 200 }), torus: rect(1500, 100, 300, 300, { rot: -20 }), cube: rect(880, 770, 210, 210, { rot: 16 }), gem: rect(1700, 820, 140, 140),
          k: sw(K('', 290), 'THANK YOU'), title: { ...rect(96, 340, 980, 240), text: 'Let’s make every\ndollar count.', px: 100 },
          body: { ...rect(96, 630, 740, 170), text: 'hello@flowbase.example\nflowbase.example\n+00 000 000 0000', px: 36 },
          ...Object.fromEntries(FW.map((_, i) => [`f${i + 1}`, at(rect(1000 + i * 100, 1160, 90, 90), { a: 1 })])),
          c1: off(rect(960, 190, 880, 200), 'b'), c2: off(rect(960, 420, 880, 200), 'b'), c3: off(rect(960, 650, 880, 200), 'b'),
          stat: ghost({ ...rect(96, 190, 860, 330), text: '$12M', px: 300 }), note: ghost({ ...rect(960, 810, 880, 30), text: 'Illustrative allocation. Sample figures.' }),
        },
      },
    ],
  },
)
void W
void H
