import { authored, at, rect } from '../author'
import type { Place } from '../author'

/**
 * Finance Plan: a calm dark-green money deck in which six rounded shapes do all the charting. They are two stacked columns (income and spending), one budget bar that splits into
 * four jobs, four coins on a ring, a savings track with its milestones, three accents, rising bars that shrink into the dots of a growth line, safeguard accents, and the bar
 * graph that closes the deck. A halo disc follows the coin hero from slide to slide, then grows until it fills the slide and becomes the background of the risks scene (zoom-through),
 * and shrinks back behind the coins. The title scales between sizes and the cards rise from below and settle into rows, columns and a bento. Original choreography for SlidesDone.
 */
const C = { ink: '#EAF6EF', mute: '#8FB5A2', em: '#34D399', emSoft: '#7BE5BC', gold: '#F5C542', blue: '#60A5FA', blueSoft: '#9CC6FB', dark: '#07140F', card: '#0D2219', edge: '#1E4733', track: '#12301F', dim: '#2A5A44' }
const HEAD = { brand: rect(80, 48, 520, 30), page: rect(1240, 48, 600, 30) }
const GRAD = { from: '#0A1D15', to: '#06100B', angle: 160 }
const GLOW = (dx = 0, dy = 0, k = 1.1) => rect(-((k - 1) * 1920) / 2 + dx, -((k - 1) * 1080) / 2 + dy, 1920 * k, 1080 * k, { a: 0.55 })
/** the halo disc behind a coin hero: same centre, bigger */
const halo = (p: Place, k = 1.5, a = 0.5): Place => ({ x: p.x + p.w / 2 - (p.w * k) / 2, y: p.y + p.h / 2 - (p.h * k) / 2, w: p.w * k, h: p.h * k, a })
const gone = (cx: number, cy: number): Place => rect(cx - 5, cy - 5, 10, 10, { a: 0 })
/** a thin rotated rect joining two points */
const seg = (x0: number, y0: number, x1: number, y1: number, a = 0.9, t = 6): Place => {
  const L = Math.hypot(x1 - x0, y1 - y0)
  return { x: (x0 + x1) / 2 - L / 2, y: (y0 + y1) / 2 - t / 2, w: L, h: t, rot: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI, a }
}

interface Words { n: string; h: string; t: string }
interface Look { fill?: string; nPx?: number; hPx?: number; tPx?: number; n?: string; h?: string; t?: string }
/** one card with its three texts: a figure, a heading and a note, laid out as a row (figure on the left) or a column */
const card = (i: number, p: Place, mode: 'row' | 'col', w: Words, o: Look = {}): Record<string, Place> => {
  const n = mode === 'row' ? rect(p.x + 36, p.y + (p.h - 64) / 2, 250, 64) : rect(p.x + 44, p.y + 76, p.w - 88, 76)
  const h = mode === 'row' ? rect(p.x + 310, p.y + 24, p.w - 340, 46) : rect(p.x + 44, p.y + 176, p.w - 88, 48)
  const t = mode === 'row' ? rect(p.x + 310, p.y + 78, p.w - 340, p.h - 94) : rect(p.x + 44, p.y + 244, p.w - 88, p.h - 270)
  return {
    [`c${i}`]: o.fill ? at(p, { fill: o.fill, stroke: undefined } as Partial<Place>) : p,
    [`n${i}`]: { ...n, text: w.n, ...(o.nPx ? { px: o.nPx } : {}), ...(o.n ? { color: o.n } : {}) },
    [`h${i}`]: { ...h, text: w.h, ...(o.hPx ? { px: o.hPx } : {}), ...(o.h ? { color: o.h } : {}) },
    [`t${i}`]: { ...t, text: w.t, ...(o.tPx ? { px: o.tPx } : {}), ...(o.t ? { color: o.t } : {}) },
  }
}

// the six shapes as bars of the growth chart (scene 8) and as the dots of the line (scene 9)
const BX = [140, 290, 440, 590, 740, 890], BH = [140, 210, 290, 380, 490, 620], BASE = 900
const bar = (i: number): Place => rect(BX[i]!, BASE - BH[i]!, 110, BH[i]!, { radius: 16 })
const dot = (i: number, d = 40): Place => rect(BX[i]! + 55 - d / 2, BASE - BH[i]! - d / 2, d, d, { radius: d / 2 })
const lines = (a: number): Record<string, Place> => Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`ln${i + 1}`, seg(BX[i]! + 55, BASE - BH[i]!, BX[i + 1]! + 55, BASE - BH[i + 1]!, a)]))
const labels = (): Record<string, Place> => Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [`lb${i + 1}`, { ...rect(BX[i]! - 15, 930, 140, 30), text: `Year ${i + 1}` }]))

// scene 4: the budget bar (35, 20, 25, 20 percent of 1696 px)
const SEG = [{ x: 100, w: 593.6 }, { x: 701.6, w: 339.2 }, { x: 1048.8, w: 424 }, { x: 1480.8, w: 339.2 }]
const PCT = ['35%', '20%', '25%', '20%']
// scene 5: the ring of four coins (centre 560, 590, radius 300)
const COIN = [{ cx: 560, cy: 290, d: 190 }, { cx: 860, cy: 590, d: 140 }, { cx: 560, cy: 890, d: 160 }, { cx: 260, cy: 590, d: 140 }]
const SLICE: [string, string, string, string] = [C.em, C.gold, C.blue, '#9AB8AA']

export const BIZ_FINANCE = authored(
  {
    id: 'biz-finance', category: 'business', fillPictures: ['coins', 'chart', 'leaf', 'vault'], fillRadius: 40, name: 'Finance Plan', tagline: 'Money, made clear: budgets, savings and growth in motion',
    description: 'A calm dark-green finance deck in thirteen scenes: where you stand, income against spending, a budget bar that splits into a ring of coins, a savings dial that fills, a three-step plan, growth bars that become a rising line, safeguards, costs and taxes, and the recommendations.',
    audience: 'The Finance Plan template suits budgets and financial plans, tax and savings guides, investing and wealth talks, banking and insurance briefings, personal-finance workshops, cost reviews and funding requests, and any talk that makes money topics clear, calm and trustworthy.',
    topics: ['finance', 'financial plan', 'financial planning', 'budget', 'budgeting', 'tax', 'taxes', 'tax planning', 'savings', 'saving money', 'investing', 'investment', 'wealth', 'wealth management', 'banking', 'loan', 'mortgage', 'insurance', 'retirement', 'personal finance', 'cost reduction', 'cash flow', 'funding', 'fundraising plan', 'expenses', 'profit', 'accounting'],
    fonts: { heading: 'Sora', body: 'Inter' },
    colors: { background: '#07140F', surface: '#0D2219', textPrimary: '#EAF6EF', textSecondary: '#8FB5A2', primary: '#34D399', secondary: '#F5C542', accent: '#60A5FA', onPrimary: '#07140F' },
    background: '#07140F',
  },
  {
    objects: {
      glow: { kind: 'image', art: 'finance-glow.webp', alt: 'A soft emerald glow with a few golden specks' },
      iris: { kind: 'shape', shape: 'ellipse', gradient: { from: '#1B5A3E', to: '#0B2A1D', angle: 135 } },
      base: { kind: 'shape', radius: 2, fill: C.dim, park: 'l' },
      ringT: { kind: 'shape', shape: 'ellipse', stroke: C.dim, strokeW: 3, park: 'l' },
      track: { kind: 'shape', radius: 36, fill: C.track, park: 'l' },
      ...Object.fromEntries([1, 2, 3, 4].map((i) => [`c${i}`, { kind: 'shape', radius: 36, fill: C.card, stroke: C.edge, strokeW: 2, park: 'b' }])),
      ...Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`ln${i}`, { kind: 'shape', radius: 3, fill: C.em, park: 'l' }])),
      k1: { kind: 'shape', radius: 18, fill: C.em, park: 'b' }, k2: { kind: 'shape', radius: 18, fill: C.emSoft, park: 'b' }, k3: { kind: 'shape', radius: 18, fill: C.gold, park: 'b' },
      k4: { kind: 'shape', radius: 18, fill: C.blue, park: 'b' }, k5: { kind: 'shape', radius: 18, fill: C.blueSoft, park: 'b' }, k6: { kind: 'shape', radius: 18, fill: '#3B6FB6', park: 'b' },
      chart: { kind: 'image', art: 'finance-chart.webp', alt: 'A sculpture of five rising emerald glass bars', park: 'r' },
      vault: { kind: 'image', art: 'finance-vault.webp', alt: 'A round brushed-steel vault door with a gold wheel', park: 'r' },
      leaf: { kind: 'image', art: 'finance-leaf.webp', alt: 'A green seedling growing out of a stack of gold coins', park: 'r' },
      coins: { kind: 'image', art: 'finance-coins.webp', alt: 'A stack of gold coins beside a shorter stack of emerald glass coins' },
      brand: { kind: 'text', text: 'Evergreen Finance', px: 24, weight: 700, color: C.mute },
      page: { kind: 'text', text: 'Sample plan  ·  FY 2027', px: 24, weight: 500, color: C.mute, align: 'r' },
      k: { kind: 'text', text: '', px: 24, weight: 700, color: C.em, caps: true, spc: 4 },
      title: { kind: 'text', text: '', px: 72, weight: 800, color: C.ink, face: 'heading', lh: 1.06, spc: -1.5 },
      body: { kind: 'text', text: '', px: 30, weight: 400, color: C.mute, lh: 1.45 },
      stat: { kind: 'text', text: '', px: 120, weight: 800, color: C.em, face: 'heading', lh: 1, spc: -3 },
      statLabel: { kind: 'text', text: '', px: 26, weight: 500, color: C.mute, lh: 1.35 },
      lab1: { kind: 'text', text: '', px: 24, weight: 700, color: C.mute, caps: true, spc: 3, align: 'ctr', park: 'b' }, lab2: { kind: 'text', text: '', px: 24, weight: 700, color: C.mute, caps: true, spc: 3, align: 'ctr', park: 'b' },
      ...Object.fromEntries([1, 2, 3, 4].flatMap((i) => [
        [`p${i}`, { kind: 'text', text: '', px: 52, weight: 800, color: C.dark, face: 'heading', align: 'ctr' }],
        [`d${i}`, { kind: 'text', text: '', px: 30, weight: 700, color: C.ink, lh: 1.25 }],
        [`n${i}`, { kind: 'text', text: '', px: 64, weight: 800, color: C.em, face: 'heading', lh: 1, spc: -1, park: 'b' }],
        [`h${i}`, { kind: 'text', text: '', px: 36, weight: 700, color: C.ink, face: 'heading', lh: 1.15, park: 'b' }],
        [`t${i}`, { kind: 'text', text: '', px: 27, weight: 400, color: C.mute, lh: 1.4, park: 'b' }],
      ])),
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`lb${i}`, { kind: 'text', text: '', px: 24, weight: 600, color: C.mute, align: 'ctr', park: 'l' }])),
    },
    order: ['glow', 'iris', 'base', 'ringT', 'track', 'c1', 'c2', 'c3', 'c4', 'ln1', 'ln2', 'ln3', 'ln4', 'ln5', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'chart', 'vault', 'leaf', 'coins',
      'brand', 'page', 'k', 'title', 'body', 'stat', 'statLabel', 'lab1', 'lab2', 'p1', 'p2', 'p3', 'p4', 'd1', 'd2', 'd3', 'd4', 'lb1', 'lb2', 'lb3', 'lb4', 'lb5', 'lb6',
      'n1', 'h1', 't1', 'n2', 'h2', 't2', 'n3', 'h3', 't3', 'n4', 'h4', 't4'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The opening: the plan title on the left, a stack of coins on the right with a soft halo behind it.', grad: GRAD,
        place: {
          glow: GLOW(200, -60, 1.1), coins: rect(1010, 150, 760, 760), iris: halo(rect(1010, 150, 760, 760), 1.16, 0.55), ...HEAD,
          k: { ...rect(100, 300, 900, 34), text: 'FINANCIAL PLAN  ·  FY 2027' },
          title: { ...rect(100, 360, 920, 250), px: 96, text: 'A clear plan\nfor your money' },
          body: { ...rect(100, 650, 880, 110), px: 30, text: 'Prepared for Alex and Sam Rivera\nNovember 2026  ·  sample figures' },
        },
      },
      {
        id: 's2', title: 'Where you stand', purpose: 'The coins shrink to the corner of three stat rows that rise from below; a glass bar chart glides in from the right.', grad: GRAD,
        place: {
          glow: GLOW(-120, 40, 1.1), coins: rect(1030, 760, 200, 200, { rot: 12 }), iris: halo(rect(1030, 760, 200, 200), 1.5, 0.5), chart: rect(1110, 190, 700, 700), ...HEAD,
          k: { ...rect(100, 130, 900, 34), text: 'WHERE YOU STAND  ·  SAMPLE FIGURES' },
          title: { ...rect(100, 175, 1000, 80), px: 64, text: 'A solid base to build on' },
          body: { ...rect(100, 270, 900, 100), text: 'Here is the picture today: what you own, what you owe and what is left each month.' },
          ...card(1, rect(100, 395, 900, 180), 'row', { n: '$84k', h: 'What you own', t: 'Savings, investments and home equity (sample).' }, { nPx: 56 }),
          ...card(2, rect(100, 590, 900, 180), 'row', { n: '$31k', h: 'What you owe', t: 'Car loan and card balances (sample).' }, { nPx: 56, n: C.gold }),
          ...card(3, rect(100, 785, 900, 180), 'row', { n: '$1,450', h: 'Left each month', t: 'Income minus spending, before saving (sample).' }, { nPx: 56, n: C.blue }),
        },
      },
      {
        id: 's3', title: 'Income vs spending', purpose: 'The rows drop away and six shapes stack into two columns, income and spending; the gap between them is the surplus.', grad: GRAD,
        place: {
          glow: GLOW(100, 0, 1.12), coins: rect(195, 205, 190, 190, { rot: -8 }), iris: halo(rect(195, 205, 190, 190), 1.5, 0.5), ...HEAD, base: rect(120, 912, 640, 4),
          k1: rect(170, 710, 240, 190), k2: at(rect(170, 542, 240, 160), {}), k3: rect(170, 414, 240, 120),
          k4: rect(470, 730, 240, 170), k5: rect(470, 592, 240, 130), k6: rect(470, 484, 240, 100),
          lab1: { ...rect(170, 930, 240, 30), text: 'INCOME' }, lab2: { ...rect(470, 930, 240, 30), text: 'SPENDING' },
          k: { ...rect(900, 200, 900, 34), text: 'INCOME VS SPENDING' },
          title: { ...rect(900, 250, 920, 170), px: 64, text: 'What comes in, and\nwhat goes out' },
          body: { ...rect(900, 440, 860, 110), text: 'Income is the fuel of the plan. Keep spending below it and the gap is what grows your savings.' },
          stat: { ...rect(900, 630, 860, 130), text: '+$420' }, statLabel: { ...rect(900, 780, 800, 70), text: 'Sample monthly surplus left after all spending.' },
        },
      },
      {
        id: 's4', title: 'The budget split', purpose: 'The two columns lie down and join into one wide bar that is split into four jobs, with the share inside each part.', grad: GRAD,
        place: {
          glow: GLOW(-100, 20, 1.12), coins: rect(1560, 150, 230, 230, { rot: 8 }), iris: halo(rect(1560, 150, 230, 230), 1.45, 0.5), ...HEAD,
          k1: at(rect(SEG[0]!.x, 480, SEG[0]!.w, 220), { radius: 28, fill: SLICE[0] }), k2: at(rect(SEG[1]!.x, 480, SEG[1]!.w, 220), { radius: 28, fill: SLICE[1] }),
          k3: at(rect(SEG[2]!.x, 480, SEG[2]!.w, 220), { radius: 28, fill: SLICE[2] }), k4: at(rect(SEG[3]!.x, 480, SEG[3]!.w, 220), { radius: 28, fill: SLICE[3] }),
          k5: rect(1816, 480, 4, 220, { a: 0 }), k6: rect(1816, 480, 4, 220, { a: 0 }),
          ...Object.fromEntries(SEG.flatMap((s, i) => [[`p${i + 1}`, { ...rect(s.x, 555, s.w, 70), text: PCT[i]! }], [`d${i + 1}`, { ...rect(s.x + 8, 730, s.w - 8, 44), text: ['Housing', 'Daily living', 'Savings', 'Everything else'][i]!, color: SLICE[i]! }]])),
          k: { ...rect(100, 130, 1000, 34), text: 'THE BUDGET SPLIT  ·  SAMPLE SHARES' },
          title: { ...rect(100, 175, 1300, 80), px: 64, text: 'Give every dollar a job' },
          body: { ...rect(100, 270, 1000, 100), text: 'One bar holds the whole month. Split it into four jobs, and decide the shares before the month begins.' },
          statLabel: { ...rect(100, 850, 1300, 40), px: 28, text: 'Tip: pay the savings slice first, the moment your income arrives.' },
        },
      },
      {
        id: 's5', title: 'The ring view', purpose: 'The four parts of the bar become four coins, sized by share, that slide onto a ring around the coin stack.', grad: GRAD,
        place: {
          glow: GLOW(-60, 0, 1.12), coins: rect(395, 425, 330, 330, { rot: 0 }), iris: rect(310, 340, 500, 500, { a: 0.55 }), ringT: rect(260, 290, 600, 600), ...HEAD,
          ...Object.fromEntries(COIN.flatMap((c, i) => [
            [`k${i + 1}`, at(rect(c.cx - c.d / 2, c.cy - c.d / 2, c.d, c.d), { radius: c.d / 2, fill: SLICE[i]! })],
            [`p${i + 1}`, { ...rect(c.cx - 70, c.cy - 26, 140, 52), text: PCT[i]!, px: 40 }],
            [`d${i + 1}`, { ...rect(1080, 560 + i * 92, 740, 44), px: 34, text: [`Housing and bills  ·  35%`, 'Daily living  ·  20%', 'Savings  ·  25%', 'Everything else  ·  20%'][i]!, color: SLICE[i]! }],
          ])),
          k5: gone(560, 590), k6: gone(560, 590),
          k: { ...rect(1080, 170, 740, 34), text: 'THE RING VIEW' },
          title: { ...rect(1080, 215, 740, 150), px: 64, text: 'Four jobs, one\nwhole month' },
          body: { ...rect(1080, 390, 740, 100), text: 'Each coin is one slice of the budget, sized by its share.' },
        },
      },
      {
        id: 's6', title: 'The savings goal', purpose: 'The coins become the milestones of a long savings track; one shape grows into the bar that fills it.', grad: GRAD,
        place: {
          glow: GLOW(60, -30, 1.12), coins: rect(1500, 150, 260, 260, { rot: 10 }), iris: halo(rect(1500, 150, 260, 260), 1.45, 0.5), track: rect(160, 660, 1500, 72), ...HEAD,
          k1: at(rect(160, 660, 930, 72), { radius: 36, fill: C.em }),
          k2: at(rect(505, 666, 60, 60), { radius: 30, fill: C.gold }), k3: at(rect(880, 666, 60, 60), { radius: 30, fill: C.gold }),
          k4: at(rect(1255, 666, 60, 60), { radius: 30, fill: C.dim }), k5: at(rect(1630, 666, 60, 60), { radius: 30, fill: C.dim }),
          k6: at(rect(1046, 652, 88, 88), { radius: 44, fill: C.ink }),
          d1: { ...rect(505, 760, 300, 76), text: '1.5 months\ncovered', color: C.ink }, d2: { ...rect(880, 760, 300, 76), text: '3 months\ncovered', color: C.ink },
          d3: { ...rect(1255, 760, 300, 76), text: '4.5 months\ncovered', color: C.mute }, d4: { ...rect(1630, 760, 190, 76), text: '6 months\nGoal', color: C.mute },
          k: { ...rect(100, 130, 1000, 34), text: 'THE SAVINGS GOAL  ·  SAMPLE' },
          title: { ...rect(100, 175, 1300, 80), px: 64, text: 'A six-month safety net' },
          body: { ...rect(100, 270, 1000, 100), text: 'Set one target, track it every month and let the habit do the work. Sample goal: six months of costs.' },
          stat: { ...rect(100, 420, 340, 130), text: '62%' }, statLabel: { ...rect(470, 456, 800, 70), text: 'of the goal reached so far (sample).' },
        },
      },
      {
        id: 's7', title: 'The plan in three steps', purpose: 'The track leaves; three cards rise from below, each with a coloured accent bar, a number, a heading and a note.', grad: GRAD,
        place: {
          glow: GLOW(0, 30, 1.1), coins: rect(1560, 150, 200, 200, { rot: -8 }), iris: halo(rect(1560, 150, 200, 200), 1.5, 0.5), ...HEAD,
          k1: at(rect(144, 464, 96, 10), { radius: 5, fill: C.em }), k2: at(rect(744, 464, 96, 10), { radius: 5, fill: C.gold }), k3: at(rect(1344, 464, 96, 10), { radius: 5, fill: C.blue }),
          k4: gone(240, 600), k5: gone(840, 600), k6: gone(1440, 600),
          k: { ...rect(100, 130, 900, 34), text: 'THE PLAN IN THREE STEPS' },
          title: { ...rect(100, 175, 1350, 80), px: 64, text: 'Three steps to a steadier year' },
          body: { ...rect(100, 270, 1000, 100), text: 'Small, repeatable moves beat big, rare ones. Each step takes less than an hour to set up.' },
          ...card(1, rect(100, 420, 560, 500), 'col', { n: '01', h: 'Track', t: 'Write down every income and every cost for one month. Seeing the numbers is the first step.' }),
          ...card(2, rect(700, 420, 560, 500), 'col', { n: '02', h: 'Automate', t: 'Set a standing transfer to savings on payday, so saving never depends on willpower.', }, { n: C.gold }),
          ...card(3, rect(1300, 420, 560, 500), 'col', { n: '03', h: 'Review', t: 'Check the plan once a quarter and adjust the shares when life changes.' }, { n: C.blue }),
        },
      },
      {
        id: 's8', title: 'Growth over time', purpose: 'The cards drop away and the six shapes rise as bars of a growth chart on a baseline.', grad: GRAD,
        place: {
          glow: GLOW(-40, 0, 1.12), coins: rect(1560, 760, 230, 230, { rot: 6 }), iris: halo(rect(1560, 760, 230, 230), 1.45, 0.5), ...HEAD, base: rect(120, 912, 900, 4),
          k1: bar(0), k2: bar(1), k3: bar(2), k4: bar(3), k5: bar(4), k6: at(bar(5), { fill: C.gold }), ...lines(0), ...labels(),
          k: { ...rect(1120, 130, 700, 34), text: 'GROWTH OVER TIME  ·  SAMPLE' },
          title: { ...rect(1120, 180, 700, 150), px: 64, text: 'Time does\nthe heavy lifting' },
          body: { ...rect(1120, 380, 700, 260), text: 'Saving a steady amount each month lets growth build on earlier growth. Sample illustration only: real returns vary and can fall as well as rise.' },
        },
      },
      {
        id: 's9', title: 'Compounding', purpose: 'The bars shrink to dots, a line joins them into a climb, and a seedling grows from coins on the right.', grad: GRAD,
        place: {
          glow: GLOW(40, 20, 1.12), coins: rect(860, 95, 170, 170, { rot: -10 }), iris: rect(1330, 510, 520, 520, { a: 0.6 }), leaf: rect(1380, 560, 420, 420), ...HEAD, base: rect(120, 912, 900, 4),
          k1: at(dot(0), { fill: C.em }), k2: at(dot(1), { fill: C.em }), k3: at(dot(2), { fill: C.em }), k4: at(dot(3), { fill: C.em }), k5: at(dot(4), { fill: C.em }), k6: at(dot(5, 56), { fill: C.gold }),
          ...lines(0.9), ...labels(),
          k: { ...rect(1120, 130, 700, 34), text: 'COMPOUNDING' },
          title: { ...rect(1120, 180, 700, 150), px: 64, text: 'Growth builds on\ngrowth' },
          body: { ...rect(1120, 350, 700, 150), text: 'Each year earns on your savings and on the earlier gains. That is why starting early matters more than starting big.' },
        },
      },
      {
        id: 's10', title: 'Risks and safeguards', purpose: 'The halo behind the seedling grows until it fills the slide and becomes the new background; a vault glides in and three safeguards line up.', grad: GRAD,
        place: {
          glow: GLOW(0, 0, 1.1), coins: rect(1000, 810, 170, 170, { rot: 10 }), iris: rect(-340, -760, 2600, 2600, { a: 1 }), vault: rect(1060, 190, 720, 720), ...HEAD,
          k1: at(rect(100, 400, 10, 140), { radius: 5, fill: C.em }), k2: at(rect(100, 590, 10, 140), { radius: 5, fill: C.gold }), k3: at(rect(100, 780, 10, 140), { radius: 5, fill: C.blue }),
          k4: gone(105, 600), k5: gone(105, 600), k6: gone(105, 600),
          k: { ...rect(100, 130, 900, 34), text: 'RISKS AND SAFEGUARDS' },
          title: { ...rect(100, 175, 900, 150), px: 64, text: 'Protect the plan\nbefore you grow it' },
          h1: { ...rect(140, 400, 820, 46), text: 'Emergency fund' }, t1: { ...rect(140, 452, 820, 90), text: 'Keep three to six months of costs in an easy-access account, apart from daily spending.' },
          h2: { ...rect(140, 590, 820, 46), text: 'Insurance cover' }, t2: { ...rect(140, 642, 820, 90), text: 'Review health, home and income cover each year so one bad event cannot undo the plan.' },
          h3: { ...rect(140, 780, 820, 46), text: 'Spread your savings' }, t3: { ...rect(140, 832, 820, 90), text: 'Hold a mix of accounts and assets so no single risk can hurt everything at once.' },
        },
      },
      {
        id: 's11', title: 'Costs and taxes', purpose: 'The halo shrinks back behind the coins and four rounded rows rise as a table of costs and taxes to watch.', grad: GRAD,
        place: {
          glow: GLOW(-60, 20, 1.12), coins: rect(1420, 280, 360, 360, { rot: -6 }), iris: rect(1340, 200, 520, 520, { a: 0.5 }), ...HEAD,
          k: { ...rect(100, 130, 900, 34), text: 'COSTS AND TAXES TO WATCH  ·  SAMPLE RATES' },
          title: { ...rect(100, 175, 1200, 80), px: 64, text: 'Small costs add up' },
          ...card(1, rect(100, 280, 1160, 160), 'row', { n: '18%', h: 'Income tax', t: 'Sample effective rate. Claim every deduction you qualify for and keep your receipts.' }, { nPx: 48 }),
          ...card(2, rect(100, 452, 1160, 160), 'row', { n: '1.2%', h: 'Fund fees', t: 'Sample yearly fee on an investment fund. Small percentages add up over decades.' }, { nPx: 48, n: C.gold }),
          ...card(3, rect(100, 624, 1160, 160), 'row', { n: '5.5%', h: 'Loan interest', t: 'Sample rate on a personal loan. Paying it down early cuts the total cost.' }, { nPx: 48, n: C.blue }),
          ...card(4, rect(100, 796, 1160, 160), 'row', { n: '2.0%', h: 'Inflation', t: 'Sample yearly rise in prices. Savings should grow at least as fast.' }, { nPx: 48, n: C.emSoft }),
          stat: { ...rect(1340, 700, 520, 110), px: 88, text: '$7,200' }, statLabel: { ...rect(1340, 820, 480, 100), text: 'Sample yearly total of fees and interest to plan for.' },
        },
      },
      {
        id: 's12', title: 'Recommendations', purpose: 'The rows re-flow into a bento: one large emerald card and two stacked cards, each with its accent bar.', grad: GRAD,
        place: {
          glow: GLOW(30, 0, 1.1), coins: rect(1620, 120, 150, 150, { rot: 12 }), iris: halo(rect(1620, 120, 150, 150), 1.5, 0.5), ...HEAD,
          k1: at(rect(144, 300, 96, 10), { radius: 5, fill: C.dark }), k2: at(rect(1004, 296, 96, 10), { radius: 5, fill: C.gold }), k3: at(rect(1004, 666, 96, 10), { radius: 5, fill: C.blue }),
          k4: gone(500, 700), k5: gone(500, 700), k6: gone(500, 700),
          k: { ...rect(100, 130, 900, 34), text: 'RECOMMENDATIONS' },
          title: { ...rect(100, 175, 1450, 80), px: 64, text: 'Three moves that matter most' },
          c1: at(rect(100, 285, 820, 675), { fill: C.em }),
          n1: { ...rect(144, 340, 732, 170), text: '20%', px: 150, color: C.dark },
          h1: { ...rect(144, 530, 732, 110), text: 'Pay yourself\nfirst', px: 48, color: C.dark },
          t1: { ...rect(144, 680, 732, 220), text: 'Move one-fifth of every payday into savings before anything else is spent. Start smaller if you must, then raise it each year.', px: 30, color: '#0B3524' },
          c2: rect(960, 285, 860, 325), n2: { ...rect(1004, 320, 772, 60), text: 'Within 3 months', px: 46, color: C.gold }, h2: { ...rect(1004, 392, 772, 46), text: 'Build the buffer', px: 34 }, t2: { ...rect(1004, 444, 772, 110), text: 'Reach one month of costs in an easy-access account.', px: 27 },
          c3: rect(960, 635, 860, 325), n3: { ...rect(1004, 690, 772, 60), text: 'Within 12 months', px: 46, color: C.blue }, h3: { ...rect(1004, 762, 772, 46), text: 'Review and grow', px: 34 }, t3: { ...rect(1004, 814, 772, 110), text: 'Hold a yearly review, raise the savings share and cut one cost you no longer need.', px: 27 },
        },
      },
      {
        id: 's13', title: 'Contact', purpose: 'The coins return to their cover position and the six shapes become a small rising bar chart that closes the deck.', grad: GRAD,
        place: {
          glow: GLOW(200, -60, 1.1), coins: rect(1010, 150, 760, 760), iris: halo(rect(1010, 150, 760, 760), 1.16, 0.55), ...HEAD,
          ...Object.fromEntries([50, 80, 115, 150, 190, 235].map((h, i) => [`k${i + 1}`, at(rect(100 + i * 78, 960 - h, 52, h), { radius: 14, fill: [C.em, C.emSoft, C.em, C.gold, C.emSoft, C.gold][i]! })])),
          k: { ...rect(100, 210, 900, 34), text: "LET'S MAKE IT HAPPEN" },
          title: { ...rect(100, 265, 900, 140), px: 104, text: 'Thank you' },
          body: { ...rect(100, 440, 880, 220), px: 34, text: 'Jordan Ellis, Financial Planner\njordan@evergreenfinance.example\n+00 000 000 0000\nevergreenfinance.example' },
        },
      },
    ],
  },
)
