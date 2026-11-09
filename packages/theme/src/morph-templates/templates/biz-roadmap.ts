import { authored, rect, at, W } from '../author'
import type { ObjDef, Place } from '../author'

/**
 * Roadmap: a business roadmap told as a camera pan along one long road. Every stage (card, clay icon, stem, node, date) sits in a single strip; each scene pans the whole strip left by one
 * step, so the next stage arrives at the centre and grows while the one just passed shrinks, fades and its node turns coral. Behind it a giant year numeral changes and scale-morphs, and three
 * background layers (sky, clouds and two rows of hills) travel at different speeds for parallax. The agenda cards are the same cards in a grid, the overview is the whole road zoomed out,
 * and the teal decision panel grows out of the last node. Original choreography for SlidesDone.
 */
const C = { bg: '#F7F4EE', teal: '#0E4D4A', coral: '#FF6B4A', coralD: '#C03A1E', sand: '#E9DFC9', ink: '#16201F', mute: '#506360', cream: '#FFF8EC', light: '#FF9C84', hillFar: '#DCE9E2', hillNear: '#BFD7CD' }
const STEP = 740
const ROAD = 860

const stages = [
  { name: 'Discover', art: 'road-bulb.webp', alt: 'A soft clay light bulb', year: '2026', st: 'STAGE 01', desc: 'Interview customers, size the opportunity and pick the one problem worth solving first.', goal: 'Goal: 30 customer interviews' },
  { name: 'Prototype', art: 'road-gears.webp', alt: 'Two interlocking soft clay cogwheels', year: '2027', st: 'STAGE 02', desc: 'Build the smallest version that proves the idea and test it with ten real users.', goal: 'Goal: a working pilot' },
  { name: 'Launch', art: 'road-rocket.webp', alt: 'A soft clay rocket lifting off', year: '2028', st: 'STAGE 03', desc: 'Open the doors to the first customers, support them closely and learn from every call.', goal: 'Goal: the first 100 customers' },
  { name: 'Grow', art: 'road-mountain.webp', alt: 'A soft clay mountain with a flag on its summit', year: '2029', st: 'STAGE 04', desc: 'Double down on the channels that work and turn early fans into repeat buyers.', goal: 'Goal: repeatable growth' },
  { name: 'Scale', art: 'road-key.webp', alt: 'A soft clay key', year: '2030', st: 'STAGE 05', desc: 'Hire ahead of demand, automate delivery and open the next market with a proven playbook.', goal: 'Goal: a second market' },
  { name: 'Lead', art: 'road-trophy.webp', alt: 'A soft clay trophy', year: '2031', st: 'STAGE 06', desc: 'Set the standard in the category with partners, a trusted brand and a product others build on.', goal: 'Goal: category leader' },
]
const N = stages.length
const ids = (p: string) => stages.map((_, i) => `${p}${i}`)

type Mode = { t: 'pan'; k: number } | { t: 'grid' } | { t: 'over'; hide?: boolean }

/** where every part of stage i is in a given arrangement of the strip */
function stage(i: number, m: Mode): Record<string, Place> {
  const put = (o: Record<string, Place>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k + i, v]))
  if (m.t === 'grid') {
    const x = 120 + (i % 3) * 580, y = 305 + Math.floor(i / 3) * 290
    return put({
      c: rect(x, y, 540, 260), ic: rect(x + 22, y + 45, 170, 170), st: rect(x + 214, y + 48, 310, 30), nm: rect(x + 214, y + 84, 310, 60, { px: 48 }),
      ds: rect(x + 214, y + 150, 300, 90, { a: 0 }), gl: rect(x + 214, y + 158, 300, 70, { px: 26 }),
      sm: rect(200 + i * 270 - 2, 990, 4, 4, { a: 0 }), dt: rect(200 + i * 270 - 12, 969, 24, 24, { fill: C.coral }), dy: rect(x + 170, 1010, 200, 40, { a: 0 }),
    })
  }
  if (m.t === 'over') {
    const cx = 200 + i * 270, a = m.hide ? 0 : 1
    return put({
      c: rect(cx - 115, 430, 230, 250, { a }), ic: rect(cx - 90, 452, 130, 130, { a }), st: rect(cx - 90, 385, 560, 30, { a: 0 }), nm: rect(cx - 90, 610, 200, 44, { px: 34, a }),
      ds: rect(cx - 90, 530, 570, 140, { a: 0 }), gl: rect(cx - 90, 695, 570, 40, { px: 26, a: 0 }),
      sm: rect(cx - 2, 680, 4, 165, { a }), dt: rect(cx - 20, ROAD - 20, 40, 40, { fill: C.coral, a: m.hide ? 0 : 1 }), dy: rect(cx - 100, 912, 200, 44, { px: 26, a }),
    })
  }
  const d = i - m.k, cx = 960 + d * STEP, focus = Math.abs(d) < 0.5, sa = d < 0 ? 0.4 : 0.65
  const reached = i <= m.k + 0.01, fill = reached ? C.coral : '#FFFFFF'
  if (focus) {
    return put({
      c: rect(cx - 490, 330, 980, 430), ic: rect(cx - 560, 300, 440, 440), st: rect(cx - 120, 385, 560, 30), nm: rect(cx - 120, 425, 560, 88, { px: 72 }),
      ds: rect(cx - 120, 530, 570, 140), gl: rect(cx - 120, 695, 570, 40, { px: 26 }),
      sm: rect(cx - 2, 760, 4, 100), dt: rect(cx - 32, ROAD - 32, 64, 64, { fill }), dy: rect(cx - 130, 912, 260, 44, { px: 34 }),
    })
  }
  return put({
    c: rect(cx - 145, 410, 290, 300, { a: sa }), ic: rect(cx - 120, 430, 130, 130, { a: sa }), st: rect(cx - 120, 385, 560, 30, { a: 0 }), nm: rect(cx - 120, 585, 250, 44, { px: 32, a: sa }),
    ds: rect(cx - 120, 530, 570, 140, { a: 0 }), gl: rect(cx - 120, 695, 570, 40, { px: 26, a: 0 }),
    sm: rect(cx - 2, 710, 4, 150, { a: sa }), dt: rect(cx - 20, ROAD - 20, 40, 40, { fill }), dy: rect(cx - 130, 912, 260, 44, { px: 26, a: sa }),
  })
}
const strip = (m: Mode) => Object.assign({}, ...stages.map((_, i) => stage(i, m)))

// ── background layers: they travel at different speeds, `k` is where the camera is along the road ──
const FAR = [[-300, 730, 1100, 360], [500, 760, 900, 320], [1200, 720, 1200, 380], [2100, 750, 1000, 340], [2900, 725, 1100, 370], [3700, 755, 950, 330], [4500, 740, 1000, 350]]
const NEAR = [[-600, 800, 1000, 380], [100, 830, 900, 340], [800, 790, 1100, 400], [1600, 835, 950, 340], [2400, 800, 1050, 390], [3200, 830, 900, 350], [3950, 795, 1100, 390], [4800, 825, 950, 350], [5500, 800, 1000, 380]]
const CLOUD = [[-100, 150, 380], [700, 235, 340], [1300, 130, 400], [1900, 210, 360], [2500, 160, 380]]
const SHIFT = { sky: 89, cloud: 148, far: 259, near: 481 }
function world(k: number): Record<string, Place> {
  const o: Record<string, Place> = { sky: rect(-100 - (k + 1) * SHIFT.sky, 0, 2800, 1080) }
  CLOUD.forEach(([x, y, w], j) => {
    o[`cla${j}`] = rect(x! - k * SHIFT.cloud, y!, w!, 80)
    o[`clb${j}`] = rect(x! + w! * 0.14 - k * SHIFT.cloud, y! - 40, w! * 0.42, 90)
    o[`clc${j}`] = rect(x! + w! * 0.46 - k * SHIFT.cloud, y! - 26, w! * 0.34, 70)
  })
  FAR.forEach(([x, y, w, h], j) => { o[`hf${j}`] = rect(x! - k * SHIFT.far, y!, w!, h!) })
  NEAR.forEach(([x, y, w, h], j) => { o[`hn${j}`] = rect(x! - k * SHIFT.near, y!, w!, h!) })
  return o
}
/** the road itself: it always runs in from beyond the left edge; the coral part is the way travelled so far */
const roadAt = (startX: number, endX: number, travelTo: number | null): Record<string, Place> => ({
  bed: rect(startX, ROAD - 22, endX - startX, 44), travel: rect(startX, ROAD - 6, Math.max(8, (travelTo ?? startX) - startX), 12, { a: travelTo === null ? 0 : 1 }),
})
const panRoad = (k: number) => roadAt(960 - k * STEP - 2200, 960 + (N - k) * STEP + 300, 960)
const HEAD = (label: string, frac: number) => ({
  brand: rect(80, 46, 300, 32), ptrack: rect(460, 56, 720, 12), pfill: rect(460, 56, Math.max(12, frac * 720), 12), plabel: { ...rect(1210, 46, 260, 32), text: label }, page: rect(1500, 46, 340, 32),
})
const yearAt = (text: string, p: Place): Place => ({ ...p, text })
const flagAt = (k: number) => rect(960 + (N - k) * STEP - 120, 630, 240, 240)

const textBase = { kind: 'text' } as const
const objects: Record<string, ObjDef> = {
  sky: { kind: 'image', art: 'road-sky.webp', alt: 'A soft cream and peach sky' },
  year: { ...textBase, text: '2026', px: 560, weight: 800, color: '#EDE4CF', face: 'heading', lh: 1, spc: -12, align: 'ctr' },
  ...Object.fromEntries(CLOUD.flatMap((_, j) => [[`cla${j}`, { kind: 'shape', shape: 'ellipse', fill: '#FFFCF6' }], [`clb${j}`, { kind: 'shape', shape: 'ellipse', fill: '#FFFCF6' }], [`clc${j}`, { kind: 'shape', shape: 'ellipse', fill: '#FFFCF6' }]])),
  ...Object.fromEntries(FAR.map((_, j) => [`hf${j}`, { kind: 'shape', shape: 'ellipse', fill: C.hillFar }])),
  gf: { kind: 'shape', fill: C.hillFar },
  ...Object.fromEntries(NEAR.map((_, j) => [`hn${j}`, { kind: 'shape', shape: 'ellipse', fill: C.hillNear }])),
  gn: { kind: 'shape', fill: C.hillNear },
  bed: { kind: 'shape', radius: 22, fill: '#FFFDF7', stroke: C.sand, strokeW: 3 },
  travel: { kind: 'shape', radius: 6, fill: C.coral },
  ...Object.fromEntries(stages.flatMap((s, i) => [
    [`sm${i}`, { kind: 'shape', fill: '#CDBF9E' }],
    [`dt${i}`, { kind: 'shape', shape: 'ellipse', fill: '#FFFFFF', stroke: C.teal, strokeW: 6 }],
    [`c${i}`, { kind: 'shape', radius: 40, fill: '#FFFFFF', stroke: C.sand, strokeW: 3 }],
  ])),
  panel: { kind: 'shape', radius: 56, fill: C.teal },
  ...Object.fromEntries(stages.map((s, i) => [`ic${i}`, { kind: 'image', art: s.art, alt: s.alt }])),
  flag: { kind: 'image', art: 'road-flag.webp', alt: 'A soft clay flag on a pole' },
  ptrack: { kind: 'shape', radius: 6, fill: C.sand }, pfill: { kind: 'shape', radius: 6, fill: C.coral },
  brand: { ...textBase, text: 'NORTHWAY', px: 24, weight: 800, color: C.teal, face: 'heading', caps: true, spc: 5 },
  plabel: { ...textBase, text: '', px: 22, weight: 600, color: C.coralD, caps: true, spc: 2 },
  page: { ...textBase, text: 'Product roadmap  ·  sample', px: 22, weight: 500, color: C.mute, align: 'r' },
  k: { ...textBase, text: '', px: 24, weight: 700, color: C.coralD, caps: true, spc: 5 },
  title: { ...textBase, text: '', px: 80, weight: 800, color: C.ink, face: 'heading', lh: 1.05, spc: -1.5 },
  body: { ...textBase, text: '', px: 34, weight: 400, color: C.mute, lh: 1.45 },
  qk: { ...textBase, text: '', px: 24, weight: 700, color: C.light, caps: true, spc: 5 },
  q: { ...textBase, text: '', px: 76, weight: 700, color: C.cream, face: 'heading', lh: 1.15, spc: -1 },
  qby: { ...textBase, text: '', px: 32, weight: 400, color: C.sand, lh: 1.4 },
  dk: { ...textBase, text: '', px: 24, weight: 700, color: C.light, caps: true, spc: 5 },
  dq: { ...textBase, text: '', px: 48, weight: 700, color: C.cream, face: 'heading', lh: 1.15, spc: -0.5 },
  dby: { ...textBase, text: '', px: 26, weight: 400, color: C.sand, lh: 1.4 },
  fin: { ...textBase, text: '', px: 150, weight: 800, color: C.ink, face: 'heading', lh: 1.0, spc: -3 },
  ...Object.fromEntries([1, 2, 3].flatMap((n) => [
    [`n${n}`, { ...textBase, text: '', px: 44, weight: 800, color: C.coralD, face: 'heading' }],
    [`h${n}`, { ...textBase, text: '', px: 40, weight: 700, color: C.ink, face: 'heading', lh: 1.1 }],
    [`t${n}`, { ...textBase, text: '', px: 28, weight: 400, color: C.mute, lh: 1.45 }],
  ])),
  ...Object.fromEntries(stages.flatMap((s, i) => [
    [`st${i}`, { ...textBase, text: s.st, px: 24, weight: 700, color: C.coralD, caps: true, spc: 4 }],
    [`nm${i}`, { ...textBase, text: s.name, px: 72, weight: 800, color: C.ink, face: 'heading', lh: 1.05, spc: -1 }],
    [`ds${i}`, { ...textBase, text: s.desc, px: 30, weight: 400, color: C.mute, lh: 1.42 }],
    [`gl${i}`, { ...textBase, text: s.goal, px: 26, weight: 700, color: C.teal }],
    [`dy${i}`, { ...textBase, text: `Year ${i + 1}`, px: 34, weight: 700, color: '#2B3A38', align: 'ctr' }],
  ])),
}

const order = [
  'sky', 'year', ...CLOUD.flatMap((_, j) => [`cla${j}`, `clb${j}`, `clc${j}`]), ...FAR.map((_, j) => `hf${j}`), 'gf', ...NEAR.map((_, j) => `hn${j}`), 'gn', 'bed', 'travel',
  ...ids('sm'), ...ids('dt'), ...ids('c'), 'panel', ...ids('ic'), 'flag', 'ptrack', 'pfill', 'brand', 'plabel', 'page', 'k', 'title', 'body', 'qk', 'q', 'qby', 'dk', 'dq', 'dby', 'fin', 'n1', 'h1', 't1', 'n2', 'h2', 't2', 'n3', 'h3', 't3',
  ...stages.flatMap((_, i) => [`st${i}`, `nm${i}`, `ds${i}`, `gl${i}`]), ...ids('dy'),
]
const STATIC = { gf: rect(0, 900, W, 200), gn: rect(0, 872, W, 220) }
const panelDot = rect(1530, ROAD - 20, 40, 40, { a: 0 })

const panScene = (n: number, k: number, purpose: string) => ({
  id: `s${n}`, title: stages[k]!.name, purpose,
  place: {
    ...STATIC, ...world(k), ...panRoad(k), ...strip({ t: 'pan', k }), ...HEAD(`Stage ${k + 1} of ${N}`, (k + 1) / N), flag: flagAt(k),
    year: yearAt(stages[k]!.year, rect(110 + (k % 2 ? 100 : -100), 20, 1700, 640, { px: k % 2 ? 600 : 560 })),
  },
})

export const BIZ_ROADMAP = authored(
  {
    id: 'biz-roadmap', category: 'business', name: 'Roadmap', tagline: 'One long road, one stage at a time',
    description: 'A calm, premium business roadmap told as a camera pan along a single road: discover, prototype, launch, grow, scale and lead, each stage arriving under a giant year while the hills drift past, then the whole road zoomed out and a decision to take.',
    audience: 'The Roadmap template suits product and business roadmaps, strategy and growth plans, project plans and milestone reviews, board and steering-committee updates, consulting proposals and any talk that walks an audience through stages over time.',
    topics: ['roadmap', 'product roadmap', 'timeline', 'plan', 'project plan', 'milestones', 'strategy', 'strategic plan', 'growth plan', 'business plan', 'stages', 'phases', 'journey', 'vision', 'five year plan', 'go to market', 'launch plan', 'consulting', 'business', 'planning'],
    fonts: { heading: 'Outfit', body: 'Inter' },
    colors: { background: C.bg, surface: '#FFFFFF', textPrimary: C.ink, textSecondary: C.mute, primary: C.teal, secondary: C.sand, accent: C.coral, onPrimary: C.cream },
    background: C.bg,
  },
  {
    objects, order,
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The road enters from the left edge and runs toward the first stage peeking in at the right, with a flag and the title.',
        place: {
          ...STATIC, ...world(-1), ...roadAt(-300, 960 + (N + 1) * STEP + 300, null), ...strip({ t: 'pan', k: -1 }), ...HEAD('Start', 0), flag: rect(1060, 490, 380, 380),
          year: yearAt('2026', rect(560, 60, 1360, 560, { px: 500 })),
          k: { ...rect(100, 250, 900, 32), text: 'PRODUCT ROADMAP  ·  2026 TO 2031' }, fin: { ...rect(100, 300, 980, 320), text: 'The road\nahead' }, title: { ...rect(120, 172, 980, 100), text: 'Six stages, one road', a: 0 },
          body: { ...rect(100, 650, 860, 110), text: 'Six stages from first discovery to category leadership.' },
        },
      },
      {
        id: 's2', title: 'Agenda', purpose: 'The stage cards drop into a grid of six, the road thins to the bottom edge and the flag waits at its end.',
        place: {
          ...STATIC, ...world(-0.5), ...roadAt(-300, 2100, null), bed: rect(-60, 962, 2100, 32), ...strip({ t: 'grid' }), ...HEAD('Overview', 0), flag: rect(1730, 872, 120, 120),
          year: yearAt('2026', rect(560, 60, 1360, 560, { px: 500, a: 0 })),
          fin: { ...rect(100, 300, 980, 320), text: 'The road\nahead', a: 0 }, k: { ...rect(120, 130, 900, 32), text: 'THE PLAN' }, title: { ...rect(120, 172, 980, 100), text: 'Six stages, one road' },
        },
      },
      panScene(3, 0, 'The camera pans so Discover arrives at the centre as a large card with its year behind it, while the next stage waits at the right.'),
      panScene(4, 1, 'The whole strip shifts left by one step: Discover shrinks and fades behind us, the node turns coral and Prototype takes the centre.'),
      panScene(5, 2, 'Another step along the road: the year numeral changes and Launch grows into the centre card.'),
      panScene(6, 3, 'The hills drift more slowly than the road while Grow arrives, one more node lit.'),
      panScene(7, 4, 'Scale arrives; the destination flag appears at the right edge for the first time.'),
      panScene(8, 5, 'The last stage, Lead, reaches the centre with the flag standing just beyond it.'),
      {
        id: 's9', title: 'The whole road', purpose: 'The camera zooms out: all six stages shrink onto one line along the road, every node lit, with the flag at the end.',
        place: {
          ...STATIC, ...world(2.5), ...roadAt(-60, 1960, 1770), ...strip({ t: 'over' }), ...HEAD('Complete', 1), flag: rect(1690, 700, 170, 170), panel: panelDot,
          year: yearAt('2026 – 2031', rect(60, 215, 1800, 300, { px: 260 })),
          k: { ...rect(120, 130, 900, 32), text: 'THE WHOLE ROAD' }, title: { ...rect(120, 172, 980, 100), text: 'Six years at a glance' },
          qk: { ...rect(180, 260, 900, 32), text: 'A PLANNING PRINCIPLE', a: 0 }, q: { ...rect(180, 322, 1020, 360), text: 'A roadmap is a promise about direction, not a guarantee about dates.', a: 0 }, qby: { ...rect(180, 720, 1000, 100), text: 'Our rule: review the dates every quarter, never lose sight of the destination.', a: 0 },
        },
      },
      {
        id: 's10', title: 'Principle', purpose: 'A teal panel grows out of the last node and fills the slide with one planning principle and the flag.',
        place: {
          ...STATIC, ...world(4), ...roadAt(-60, 1960, 1770), ...strip({ t: 'over', hide: true }), ...HEAD('Principle', 1), flag: rect(1260, 380, 520, 520), panel: rect(80, 130, 1760, 830),
          year: yearAt('2026 – 2031', rect(60, 215, 1800, 300, { px: 260, a: 0 })),
          dk: { ...rect(1170, 650, 580, 32), text: 'THE DECISION', a: 0 }, dq: { ...rect(1170, 692, 580, 130), text: 'Approve the Discover budget', a: 0 }, dby: { ...rect(1170, 842, 580, 40), text: 'Needed by 31 January (sample)', a: 0 },
          qk: { ...rect(180, 260, 900, 32), text: 'A PLANNING PRINCIPLE' }, q: { ...rect(180, 322, 1020, 360), text: 'A roadmap is a promise about direction, not a guarantee about dates.' },
          qby: { ...rect(180, 720, 1000, 100), text: 'Our rule: review the dates every quarter, never lose sight of the destination.' },
          k: { ...rect(120, 140, 700, 32), text: 'NEXT 90 DAYS', a: 0 }, title: { ...rect(120, 182, 940, 100), text: 'Three moves to start', a: 0 },
          n1: { ...rect(120, 310, 100, 56), text: '01', a: 0 }, h1: { ...rect(240, 310, 760, 52), text: 'Confirm the owners', a: 0 }, t1: { ...rect(240, 370, 760, 82), text: 'Name one lead for every stage and agree how progress is reported.', a: 0 },
          n2: { ...rect(120, 490, 100, 56), text: '02', a: 0 }, h2: { ...rect(240, 490, 760, 52), text: 'Lock the first milestone', a: 0 }, t2: { ...rect(240, 550, 760, 82), text: 'Set the scope, the date and the measure of success for Discover.', a: 0 },
          n3: { ...rect(120, 670, 100, 56), text: '03', a: 0 }, h3: { ...rect(240, 670, 760, 52), text: 'Book the review rhythm', a: 0 }, t3: { ...rect(240, 730, 760, 82), text: 'Hold a short roadmap review each quarter and adjust dates openly.', a: 0 },
        },
      },
      {
        id: 's11', title: 'Next steps', purpose: 'The panel shrinks to the right with the flag on it as the decision; three numbered next steps take the left side.',
        place: {
          ...STATIC, ...world(5), ...roadAt(-60, 1960, 1770), ...strip({ t: 'over', hide: true }), ...HEAD('Next steps', 1), flag: rect(1260, 210, 400, 400), panel: rect(1100, 170, 720, 740),
          year: yearAt('2026 – 2031', rect(60, 215, 1800, 300, { px: 260, a: 0 })),
          k: { ...rect(120, 140, 700, 32), text: 'NEXT 90 DAYS' }, title: { ...rect(120, 182, 940, 100), text: 'Three moves to start' },
          n1: { ...rect(120, 310, 100, 56), text: '01' }, h1: { ...rect(240, 310, 760, 52), text: 'Confirm the owners' }, t1: { ...rect(240, 370, 760, 82), text: 'Name one lead for every stage and agree how progress is reported.' },
          n2: { ...rect(120, 490, 100, 56), text: '02' }, h2: { ...rect(240, 490, 760, 52), text: 'Lock the first milestone' }, t2: { ...rect(240, 550, 760, 82), text: 'Set the scope, the date and the measure of success for Discover.' },
          n3: { ...rect(120, 670, 100, 56), text: '03' }, h3: { ...rect(240, 670, 760, 52), text: 'Book the review rhythm' }, t3: { ...rect(240, 730, 760, 82), text: 'Hold a short roadmap review each quarter and adjust dates openly.' },
          qk: { ...rect(1170, 650, 580, 32), text: 'A PLANNING PRINCIPLE', a: 0 }, q: { ...rect(1170, 692, 580, 130), text: 'A roadmap is a promise about direction, not a guarantee about dates.', px: 48, a: 0 }, qby: { ...rect(1170, 842, 580, 40), text: 'Our rule: review the dates every quarter.', px: 26, a: 0 },
          dk: { ...rect(1170, 650, 580, 32), text: 'THE DECISION' }, dq: { ...rect(1170, 692, 580, 130), text: 'Approve the Discover budget' }, dby: { ...rect(1170, 842, 580, 40), text: 'Needed by 31 January (sample)' },
          fin: { ...rect(100, 300, 1200, 320), text: 'Thank you', a: 0 },
          body: { ...rect(100, 650, 1100, 110), text: 'hello@yourcompany.com\nyourcompany.com  ·  +00 000 000 0000', a: 0 },
        },
      },
      {
        id: 's12', title: 'Closing', purpose: 'The cover again, with the road completed: every node lit, the flag standing at its end and a thank you with contact details.',
        place: {
          ...STATIC, ...world(6.5), ...roadAt(-300, 2100, 1590), ...strip({ t: 'over', hide: true }), ...Object.fromEntries(stages.map((_, i) => [`dt${i}`, rect(160 + i * 230 - 20, ROAD - 20, 40, 40, { fill: C.coral })])),
          ...HEAD('Thank you', 1), flag: rect(1400, 490, 380, 380), panel: at(rect(1400, 490, 380, 380), { a: 0 }),
          year: yearAt('2031', rect(560, 60, 1360, 560, { px: 500 })),
          k: { ...rect(100, 250, 900, 32), text: 'LET US WALK IT TOGETHER' }, fin: { ...rect(100, 300, 1200, 320), text: 'Thank you' },
          body: { ...rect(100, 650, 1100, 110), text: 'hello@yourcompany.com\nyourcompany.com  ·  +00 000 000 0000' },
        },
      },
    ],
  },
)
