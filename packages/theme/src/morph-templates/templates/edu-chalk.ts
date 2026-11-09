import { authored, at, rect, W, H } from '../author'
import type { ObjDef, Place } from '../author'

/**
 * Chalkboard: a classroom lesson on the water cycle, written on a slate-green board. Chalk doodles (one set of drawn pictures) hop from scene to scene: the topic icon, a margin row,
 * bullets, icons on sticky notes. Four sticky notes become the goals, the vocabulary cards (which flip by squashing one card while its back widens), the steps of an experiment,
 * the cells of a table, the quiz options (the right one grows) and the homework list. A wooden duster sweeps across the board twice while the content changes behind it, a ruler
 * draws the table, and a chalk ring jumps from item to item. Original choreography for SlidesDone.
 */
const C = { ink: '#F4F1E8', mute: '#C9D2C6', yellow: '#FFE27A', pink: '#FF9DB1', blue: '#8FD3FF', green: '#A8E6A1', wood: '#8B5E3C', dark: '#1F3A33', paper: '#F4F1E8' }
const NOTE = [C.yellow, C.pink, C.blue, C.green, C.yellow, C.pink]
const FOLD = ['#E0BA3E', '#E37B94', '#62B0DE', '#78C26F', '#E0BA3E', '#E37B94']
const GRAD = { from: '#1F3A33', to: '#16302A', angle: 160 }
const rad = (d: number) => (d * Math.PI) / 180
const dd = (cx: number, cy: number, s: number, rot = 0, extra: Partial<Place> = {}): Place => ({ x: cx - s / 2, y: cy - s / 2, w: s, h: s, rot, ...extra })
const N = (cx: number, cy: number, w: number, h: number, rot = 0, extra: Partial<Place> = {}): Place => ({ x: cx - w / 2, y: cy - h / 2, w, h, rot, ...extra })
/** a box whose centre sits (dx, dy) from the centre of a (possibly tilted) note, tilted with it */
const on = (n: Place, dx: number, dy: number, w: number, h: number, extra: Partial<Place> = {}): Place => {
  const r = rad(n.rot ?? 0), cx = n.x + n.w / 2, cy = n.y + n.h / 2
  return { x: cx + dx * Math.cos(r) - dy * Math.sin(r) - w / 2, y: cy + dx * Math.sin(r) + dy * Math.cos(r) - h / 2, w, h, rot: n.rot ?? 0, ...extra }
}
const ghost = (p: Place): Place => at(p, { a: 0 })
/** the notes n<i> and their folded corners f<i> */
const notes = (ns: Place[], from = 1): Record<string, Place> => Object.fromEntries(ns.flatMap((p, i) => [[`n${from + i}`, p], [`f${from + i}`, p]]))
/** a flipped-away card: squashed to a sliver at its centre line and invisible */
const sliver = (p: Place): Place => at(p, { x: p.x + p.w / 2 - 30, w: 60, a: 0 })
const arrow = (k: string, x1: number, y1: number, x2: number, y2: number, head = 40): Record<string, Place> => {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ang = (Math.atan2(dy, dx) * 180) / Math.PI, ux = dx / len, uy = dy / len
  const sl = len - head * 0.7, hw = head * 0.95
  return { [`${k}s`]: { x: x1 + (ux * sl) / 2 - sl / 2, y: y1 + (uy * sl) / 2 - 3.5, w: sl, h: 7, rot: ang }, [`${k}h`]: { x: x2 - (ux * head) / 2 - hw / 2, y: y2 - (uy * head) / 2 - head / 2, w: hw, h: head, rot: ang + 90 } }
}
const ROW = (i: number): Place => dd(170 + i * 130, 960, 110, i % 2 ? 5 : -5)
const chip = (n: Place, dx: number, dy: number, s: number): Place => on(n, dx, dy, s, s, { rot: 0 })
const HEAD = { brand: rect(80, 46, 700, 32), page: rect(1140, 46, 700, 32) }
const FRAME = { fT: rect(0, 0, W, 24), fB: rect(0, 1036, W, 44), fL: rect(0, 0, 24, H), fR: rect(W - 24, 0, 24, H), cs1: rect(1480, 1016, 96, 16, { rot: -5 }), cs2: rect(1600, 1018, 70, 16, { rot: 4 }), cs3: rect(1698, 1014, 110, 18, { rot: -2 }) }

// scene by scene geometry
const G3 = [N(420, 590, 500, 500, -2), N(960, 590, 500, 500, 1.5), N(1500, 590, 500, 500, -1)]
const G4 = [N(420, 620, 500, 480, -1), N(960, 620, 500, 480, 1), N(1500, 620, 500, 480, -0.5)]
const G7 = [N(370, 640, 460, 430, -1.5), N(960, 640, 460, 430, 1), N(1550, 640, 460, 430, -1)]
const G8 = [N(710, 505, 420, 200, -1), N(1150, 505, 420, 200, 1), N(1590, 505, 420, 200, -0.5), N(710, 735, 420, 200, 0.8), N(1150, 735, 420, 200, -0.8), N(1590, 735, 420, 200, 0.6)]
const G9 = [N(520, 480, 780, 200, -0.8), N(1400, 480, 780, 200, 0.8), N(520, 720, 780, 200, 0.6), N(1400, 720, 780, 200, -0.6)]
const G10 = [N(1550, 360, 500, 150, 1, { a: 0.7 }), N(660, 570, 1000, 540, -1), N(1550, 560, 500, 150, -1, { a: 0.7 }), N(1550, 760, 500, 150, 1, { a: 0.7 })]
const G12 = [N(620, 375, 1000, 170, -0.8), N(620, 575, 1000, 170, 0.8), N(620, 775, 1000, 170, -0.6), N(1560, 520, 430, 420, 4)]
const N1_COVER = N(1690, 800, 250, 200, 7)
const N1_S2 = N(1450, 445, 560, 430, 3)
const N1_S6 = N(1590, 540, 420, 470, 2)


// geometry of things that fade in and out in place (the diagram, the ruled lines, the agenda lines, the chalk ring)
const AR = { ...arrow('ar1', 310, 758, 650, 548), ...arrow('ar3', 900, 590, 995, 722), ...arrow('ar4', 855, 850, 690, 850) }
const PA = { ...arrow('pa1', 618, 640, 714, 640, 36), ...arrow('pa2', 1206, 640, 1302, 640, 36) }
const UL = (yc: number, i: number): Place => rect(260, yc + 44, i === 0 ? 700 : 700, 3, { a: 0.4 })
const AGY = (i: number) => 320 + i * 135
const SUMY = (i: number) => 300 + i * 150
const HIDE: Record<string, Place> = {
  sea: rect(110, 770, 560, 130, { radius: 40 }), mt: rect(880, 640, 380, 250), gr: rect(840, 888, 460, 22, { radius: 11 }),
  ...AR, ...PA, ...Object.fromEntries(Object.keys(AR).concat(Object.keys(PA)).map((k) => [k, at((AR as Record<string, Place>)[k] ?? (PA as Record<string, Place>)[k]!, {})])),
  tl1: rect(470, 362, 1350, 5), tv1: rect(478, 236, 5, 600),
  hl: rect(92, 596, 330, 72, { radius: 36 }),
  lb1: rect(110, 612, 340, 44), lb2: rect(980, 400, 360, 44), lb3: rect(560, 652, 330, 44), lb4: rect(140, 814, 330, 44),
  ht1: rect(500, 236, 420, 56), ht2: rect(940, 236, 420, 56), ht3: rect(1380, 236, 420, 56), rl1: rect(120, 470, 350, 70), rl2: rect(120, 700, 350, 70),
  q: rect(120, 196, 1680, 70), ex: on(G10[1]!, 0, 70, 860, 220), thanks: rect(120, 290, 1680, 260, { px: 100 }), subC: rect(260, 590, 1400, 60), k: rect(120, 232, 1000, 34), sub: rect(120, 196, 1400, 44),
  ...Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`ag${i + 1}`, rect(260, AGY(i) - 34, 820, 70)])),
  c1: chip(G3[0]!, 0, -160, 150), c2: chip(G3[1]!, 0, -160, 150), c3: chip(G3[2]!, 0, -160, 150),
  ...Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`ul${i + 1}`, UL(AGY(i), i)])),
}
const SHIFT = [0, -50, 40, -30, 50, -40, 20, -60, 30, -20, 45, -35, 0]
const sc = (n: number, title: string, purpose: string, place: Record<string, Place>) => ({
  id: `s${n}`, title, purpose, grad: GRAD,
  place: { dust: rect(-90 + SHIFT[n - 1]!, -50, 2100, 1181, { a: 0.8 }), ...FRAME, ...HEAD, ...Object.fromEntries(Object.entries(HIDE).filter(([k]) => !(k in place)).map(([k, g]) => [k, ghost(g)])), ...place },
})

const T = (text: string, px: number, o: Partial<ObjDef> & Record<string, unknown> = {}): ObjDef => ({ kind: 'text', text, px, weight: 400, color: C.ink, ...o }) as ObjDef
const doodle = (art: string, alt: string, park: 'b' | 't' | 'l' | 'r' = 'b'): ObjDef => ({ kind: 'image', art, alt, park })
const noteObjs = (): Record<string, ObjDef> => Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((i) => [
  [`n${i}`, { kind: 'shape', radius: 12, fill: NOTE[i - 1]!, park: i > 3 ? 'b' : 'b' } as ObjDef],
  [`f${i}`, { kind: 'shape', fill: FOLD[i - 1]!, poly: [[0.84, 1], [1, 0.84], [1, 1]], park: 'b' } as ObjDef],
  [`nt${i}`, T('', 46, { weight: 700, color: C.dark, face: 'heading', lh: 1.1, align: 'ctr', anchor: 'ctr' })],
  [`nb${i}`, T('', 31, { weight: 600, color: C.dark, lh: 1.35, align: 'ctr', anchor: 'ctr' })],
]))

const ICON3 = ['book', 'bulb', 'flask'] as const

export const EDU_CHALK = authored(
  {
    id: 'edu-chalk', category: 'education', name: 'Chalkboard', tagline: 'A lesson written on the board, one note at a time',
    description: 'A warm classroom chalkboard for a whole lesson: chalk doodles hop across the board, sticky notes become goals, vocabulary cards, experiment steps, a table and a quiz, and a wooden duster wipes the board clean between parts.',
    audience: 'The Chalkboard template suits school lessons and science classes, teacher training, workshops and tutorials, study guides, parent evenings, kids learning clubs and any talk that explains one topic step by step in a friendly, hand-made way.',
    topics: ['lesson', 'lesson plan', 'classroom', 'school', 'teaching', 'teacher', 'science lesson', 'science', 'education', 'learning', 'worksheet', 'study', 'students', 'workshop', 'training', 'tutorial', 'primary school', 'middle school', 'chalkboard', 'quiz', 'homework'],
    fonts: { heading: 'Fraunces', body: 'Nunito Sans' },
    colors: { background: '#1F3A33', surface: '#2A4A41', textPrimary: '#F4F1E8', textSecondary: '#C9D2C6', primary: '#FFE27A', secondary: '#8FD3FF', accent: '#FF9DB1', onPrimary: '#1F3A33' },
    background: '#1F3A33',
  },
  {
    objects: {
      dust: { kind: 'image', art: 'chalk-dust.webp', alt: 'Faint smears of chalk dust on a board' },
      fT: { kind: 'shape', radius: 0, gradient: { from: '#9C6C45', to: '#7A5233', angle: 180 } }, fB: { kind: 'shape', gradient: { from: '#B07F55', to: '#6E4A2E', angle: 180 } },
      fL: { kind: 'shape', gradient: { from: '#9C6C45', to: '#7A5233', angle: 90 } }, fR: { kind: 'shape', gradient: { from: '#7A5233', to: '#9C6C45', angle: 90 } },
      cs1: { kind: 'shape', radius: 7, fill: C.yellow }, cs2: { kind: 'shape', radius: 7, fill: C.pink }, cs3: { kind: 'shape', radius: 8, fill: C.ink },
      sea: { kind: 'shape', radius: 40, fill: '#27535C', stroke: C.blue, strokeW: 5 }, mt: { kind: 'shape', fill: '#3C6354', stroke: C.ink, strokeW: 5, poly: [[0.5, 0.02], [0.98, 0.98], [0.02, 0.98]] }, gr: { kind: 'shape', radius: 13, stroke: C.green, strokeW: 5 },
      ...Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`ul${i}`, { kind: 'shape', radius: 2, fill: C.ink } as ObjDef])),
      tl1: { kind: 'shape', radius: 2, fill: C.ink }, tv1: { kind: 'shape', radius: 2, fill: C.ink },
      ...Object.fromEntries([['ar1', C.blue], ['ar3', C.blue], ['ar4', C.green], ['pa1', C.ink], ['pa2', C.ink]].flatMap(([k, col]) => [
        [`${k}s`, { kind: 'shape', radius: 3, fill: col } as ObjDef], [`${k}h`, { kind: 'shape', fill: col, poly: [[0.5, 0], [1, 1], [0, 1]] } as ObjDef],
      ])),
      ...noteObjs(),
      c1: { kind: 'shape', shape: 'ellipse', fill: '#1F3A33', stroke: C.ink, strokeW: 3 }, c2: { kind: 'shape', shape: 'ellipse', fill: '#1F3A33', stroke: C.ink, strokeW: 3 }, c3: { kind: 'shape', shape: 'ellipse', fill: '#1F3A33', stroke: C.ink, strokeW: 3 },
      g1: { kind: 'shape', fill: '#D2CBB4', poly: [[0.84, 1], [1, 0.84], [1, 1]], park: 'b' }, g2: { kind: 'shape', fill: '#D2CBB4', poly: [[0.84, 1], [1, 0.84], [1, 1]], park: 'b' }, g3: { kind: 'shape', fill: '#D2CBB4', poly: [[0.84, 1], [1, 0.84], [1, 1]], park: 'b' },
      b1: { kind: 'shape', radius: 12, fill: C.paper, park: 'b' }, b2: { kind: 'shape', radius: 12, fill: C.paper, park: 'b' }, b3: { kind: 'shape', radius: 12, fill: C.paper, park: 'b' },
      apple: doodle('chalk-apple.webp', 'A chalk drawing of an apple'), book: doodle('chalk-book.webp', 'A chalk drawing of an open book'), globe: doodle('chalk-globe.webp', 'A chalk drawing of a globe'),
      bulb: doodle('chalk-bulb.webp', 'A chalk drawing of a light bulb'), rocket: doodle('chalk-rocket.webp', 'A chalk drawing of a rocket'), flask: doodle('chalk-flask.webp', 'A chalk drawing of a science flask'),
      sun: doodle('chalk-sun.webp', 'A chalk drawing of the sun', 't'), cloud: doodle('chalk-cloud.webp', 'A chalk drawing of a rain cloud', 't'), drop: doodle('chalk-drop.webp', 'A chalk drawing of a water drop'),
      star: doodle('chalk-star.webp', 'A chalk drawing of a star', 't'), st2: doodle('chalk-star.webp', 'A chalk drawing of a star', 't'), st3: doodle('chalk-star.webp', 'A chalk drawing of a star', 't'), st4: doodle('chalk-star.webp', 'A chalk drawing of a star', 't'),
      hl: { kind: 'shape', radius: 36, stroke: C.yellow, strokeW: 5 },
      ruler: { kind: 'shape', radius: 8, gradient: { from: '#E7C48E', to: '#C79B63', angle: 180 }, stroke: '#8B5E3C', strokeW: 2, park: 't' },
      brand: T('Ms. Rao  ·  Science 5', 22, { weight: 700, color: C.mute, caps: true, spc: 4 }),
      page: T('The Water Cycle  ·  Lesson 4', 22, { weight: 600, color: C.mute, align: 'r' }),
      k: T('', 26, { weight: 700, color: C.yellow, caps: true, spc: 5 }),
      title: T('', 72, { weight: 700, face: 'heading', lh: 1.05, spc: -1.5 }),
      sub: T('', 32, { color: C.mute, lh: 1.35 }),
      q: T('', 52, { weight: 600, face: 'heading', lh: 1.1, color: C.yellow }),
      ...Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`ag${i}`, T('', 46, { weight: 600, face: 'heading', lh: 1.15 })])),
      lb1: T('', 32, { weight: 700, color: C.blue }), lb2: T('', 32, { weight: 700, color: C.ink }), lb3: T('', 32, { weight: 700, color: C.blue }), lb4: T('', 32, { weight: 700, color: C.green }),
      ht1: T('', 40, { weight: 700, face: 'heading', color: C.yellow, align: 'ctr' }), ht2: T('', 40, { weight: 700, face: 'heading', color: C.blue, align: 'ctr' }), ht3: T('', 40, { weight: 700, face: 'heading', color: C.pink, align: 'ctr' }),
      rl1: T('', 36, { weight: 600, face: 'heading', color: C.ink }), rl2: T('', 36, { weight: 600, face: 'heading', color: C.ink }),
      dt1: T('', 40, { weight: 700, face: 'heading', color: C.dark, align: 'ctr' }), dt2: T('', 40, { weight: 700, face: 'heading', color: C.dark, align: 'ctr' }), dt3: T('', 40, { weight: 700, face: 'heading', color: C.dark, align: 'ctr' }),
      df1: T('', 29, { weight: 600, color: '#2B3A33', lh: 1.4, align: 'ctr', anchor: 'ctr' }), df2: T('', 29, { weight: 600, color: '#2B3A33', lh: 1.4, align: 'ctr', anchor: 'ctr' }), df3: T('', 29, { weight: 600, color: '#2B3A33', lh: 1.4, align: 'ctr', anchor: 'ctr' }),
      ex: T('', 36, { weight: 700, color: C.dark, lh: 1.4, align: 'ctr', anchor: 'ctr' }),
      thanks: T('', 230, { weight: 700, face: 'heading', color: C.yellow, lh: 1, spc: -4, align: 'ctr' }),
      subC: T('', 44, { weight: 600, color: C.ink, align: 'ctr', lh: 1.3 }),
      du1: { kind: 'shape', radius: 28, gradient: { from: '#A06E47', to: '#7A5233', angle: 90 }, stroke: '#5C3D25', strokeW: 3, park: 'l' },
      du2: { kind: 'shape', radius: 18, fill: '#E9E4D2', park: 'l' },
    },
    order: ['dust', 'fT', 'fB', 'fL', 'fR', 'cs1', 'cs2', 'cs3', 'sea', 'mt', 'gr', 'ul1', 'ul2', 'ul3', 'ul4', 'ul5', 'tl1', 'tv1', 'ar1s', 'ar1h', 'ar3s', 'ar3h', 'ar4s', 'ar4h', 'pa1s', 'pa1h', 'pa2s', 'pa2h',
      'n1', 'b1', 'f1', 'g1', 'n2', 'b2', 'f2', 'g2', 'n3', 'b3', 'f3', 'g3', 'n4', 'f4', 'n5', 'f5', 'n6', 'f6', 'c1', 'c2', 'c3',
      'apple', 'book', 'globe', 'bulb', 'rocket', 'flask', 'sun', 'cloud', 'drop', 'star', 'st2', 'st3', 'st4', 'hl', 'ruler',
      'brand', 'page', 'k', 'title', 'sub', 'q', 'ag1', 'ag2', 'ag3', 'ag4', 'ag5', 'lb1', 'lb2', 'lb3', 'lb4', 'ht1', 'ht2', 'ht3', 'rl1', 'rl2',
      'nt1', 'nb1', 'nt2', 'nb2', 'nt3', 'nb3', 'nt4', 'nb4', 'nt5', 'nb5', 'nt6', 'nb6', 'dt1', 'df1', 'dt2', 'df2', 'dt3', 'df3', 'ex', 'thanks', 'subC', 'du1', 'du2'],
    scenes: [
      sc(1, 'Cover', 'The topic doodle fills the right of the board, with the lesson title written large and a row of small doodles along the bottom.', {
        drop: dd(1470, 640, 560, 10), cloud: dd(1400, 260, 340, -5), sun: dd(1730, 200, 190),
        apple: dd(170, 900, 124, -8), book: dd(320, 900, 124, 5), globe: dd(470, 900, 124, -4), bulb: dd(620, 900, 124, 6), rocket: dd(770, 900, 124, -6), flask: dd(920, 900, 124, 4), star: dd(1070, 900, 124, -10),
        ...notes([N1_COVER]), nt1: { ...on(N1_COVER, 0, -22, 220, 56), text: 'Lesson 4', px: 40 }, nb1: { ...on(N1_COVER, 0, 38, 220, 40), text: 'with Ms. Rao', px: 26 },
        k: { ...rect(120, 232, 1000, 34), text: 'Science  ·  Grade 5  ·  Lesson 4' }, title: { ...rect(120, 284, 1040, 330), text: 'The Water\nCycle', px: 150 },
        sub: { ...rect(120, 650, 960, 110), text: 'Where does rain come from, and where does it go?', px: 38 },
        du1: rect(-420, -20, 300, 1120), du2: rect(-345, 60, 150, 960),
      }),
      sc(2, 'Agenda', 'The topic doodles shrink down to a corner while the lesson plan is written as a list, each line with a doodle for a bullet.', {
        drop: dd(1290, 830, 200, -10), cloud: dd(1540, 820, 240, 4), sun: dd(1750, 830, 150),
        bulb: dd(180, AGY(0), 96, -6), book: dd(180, AGY(1), 96, 5), globe: dd(180, AGY(2), 96, -4), flask: dd(180, AGY(3), 96, 6), rocket: dd(180, AGY(4), 96, -6),
        ...notes([N1_S2]), nt1: { ...on(N1_S2, 0, -130, 480, 64), text: 'Big question', px: 46 }, nb1: { ...on(N1_S2, 0, 40, 470, 250), text: 'How does water travel from the sea to the sky and back again?', px: 32 },
        title: { ...rect(120, 96, 1680, 92), text: 'Today’s plan' },
        ag1: { ...rect(260, AGY(0) - 34, 820, 70), text: 'Learning goals' }, ag2: { ...rect(260, AGY(1) - 34, 820, 70), text: 'New words' }, ag3: { ...rect(260, AGY(2) - 34, 820, 70), text: 'The big picture' },
        ag4: { ...rect(260, AGY(3) - 34, 820, 70), text: 'Try it yourself' }, ag5: { ...rect(260, AGY(4) - 34, 820, 70), text: 'Quick quiz' },
        ul1: UL(AGY(0), 0), ul2: UL(AGY(1), 1), ul3: UL(AGY(2), 2), ul4: UL(AGY(3), 3), ul5: UL(AGY(4), 4),
        du1: rect(-420, -20, 300, 1120), du2: rect(-345, 60, 150, 960),
      }),
      sc(3, 'Learning goals', 'The big note splits into three, each carrying the doodle that led its line in the agenda; the sun, cloud and drop wait in the margin row.', {
        ...notes(G3), sun: ROW(0), cloud: ROW(1), drop: ROW(2),
        book: on(G3[0]!, 0, -160, 116, 116, { rot: -6 }), bulb: on(G3[1]!, 0, -160, 116, 116, { rot: 5 }), flask: on(G3[2]!, 0, -160, 116, 116, { rot: -4 }),
        c1: chip(G3[0]!, 0, -160, 150), c2: chip(G3[1]!, 0, -160, 150), c3: chip(G3[2]!, 0, -160, 150),
        title: { ...rect(120, 96, 1680, 92), text: 'By the end, you will be able to…' },
        ...Object.fromEntries(G3.flatMap((g, i) => [[`nt${i + 1}`, { ...on(g, 0, -50, 440, 64), text: ['Explain', 'Name', 'Show'][i]! }], [`nb${i + 1}`, { ...on(g, 0, 100, 420, 200), text: ['Describe how water moves between the ocean, the air and the land.', 'Use the words evaporation, condensation and precipitation correctly.', 'Draw and label the water cycle, then explain it to a friend.'][i]! }]])),
        du1: rect(-420, -20, 300, 1120), du2: rect(-345, 60, 150, 960),
      }),
      sc(4, 'Vocabulary', 'The sun, cloud and drop leap up onto the three notes as the topic icons, and the book, bulb and flask drop into the margin row.', {
        ...notes(G4), sun: on(G4[0]!, 0, -100, 176, 176, { rot: -5 }), cloud: on(G4[1]!, 0, -100, 176, 176, { rot: 4 }), drop: on(G4[2]!, 0, -100, 176, 176, { rot: -3 }),
        c1: chip(G4[0]!, 0, -100, 232), c2: chip(G4[1]!, 0, -100, 232), c3: chip(G4[2]!, 0, -100, 232),
        book: ROW(0), bulb: ROW(1), flask: ROW(2),
        b1: sliver(G4[0]!), b2: sliver(G4[1]!), b3: sliver(G4[2]!), g1: sliver(G4[0]!), g2: sliver(G4[1]!), g3: sliver(G4[2]!),
        title: { ...rect(120, 96, 1680, 92), text: 'Three new words' }, sub: { ...rect(120, 196, 1400, 44), text: 'Say each word out loud, then guess what it means.' },
        ...Object.fromEntries(G4.flatMap((g, i) => [
          [`nt${i + 1}`, { ...on(g, 0, 58, 440, 64), text: ['Evaporation', 'Condensation', 'Precipitation'][i]! }], [`nb${i + 1}`, { ...on(g, 0, 132, 440, 50), text: ['liquid to gas', 'gas to liquid', 'water falls down'][i]! }],
          [`dt${i + 1}`, ghost({ ...on(G4[i]!, 0, -60, 440, 56), text: ['Evaporation', 'Condensation', 'Precipitation'][i]! })], [`df${i + 1}`, ghost({ ...on(G4[i]!, 0, 78, 430, 230), text: '' })],
        ])),
        du1: rect(-420, -20, 300, 1120), du2: rect(-345, 60, 150, 960),
      }),
      sc(5, 'Meanings', 'The note fronts squash flat while paper backs widen in the same spot, so each card flips to its meaning.', {
        ...notes(G4), n1: sliver(G4[0]!), n2: sliver(G4[1]!), n3: sliver(G4[2]!),
        b1: G4[0]!, b2: G4[1]!, b3: G4[2]!, g1: G4[0]!, g2: G4[1]!, g3: G4[2]!, f1: sliver(G4[0]!), f2: sliver(G4[1]!), f3: sliver(G4[2]!),
        sun: on(G4[0]!, 0, -168, 100, 100, { rot: -5 }), cloud: on(G4[1]!, 0, -168, 100, 100, { rot: 4 }), drop: on(G4[2]!, 0, -168, 100, 100, { rot: -3 }),
        c1: chip(G4[0]!, 0, -168, 138), c2: chip(G4[1]!, 0, -168, 138), c3: chip(G4[2]!, 0, -168, 138),
        book: ROW(0), bulb: ROW(1), flask: ROW(2),
        title: { ...rect(120, 96, 1680, 92), text: 'What the words mean' }, sub: { ...rect(120, 196, 1400, 44), text: 'Read each card, then say it in your own words.' },
        ...Object.fromEntries(G4.flatMap((g, i) => [
          [`nt${i + 1}`, ghost({ ...on(g, 0, 58, 440, 64), text: ['Evaporation', 'Condensation', 'Precipitation'][i]! })], [`nb${i + 1}`, ghost({ ...on(g, 0, 132, 440, 50), text: ['liquid to gas', 'gas to liquid', 'water falls down'][i]! })],
          [`dt${i + 1}`, { ...on(g, 0, -60, 440, 56), text: ['Evaporation', 'Condensation', 'Precipitation'][i]! }],
          [`df${i + 1}`, { ...on(g, 0, 78, 430, 230), text: ['The sun warms water, and it rises into the air as an invisible gas called water vapour.', 'High in the cold air, vapour cools and turns back into tiny drops that gather into clouds.', 'When cloud drops grow heavy they fall as rain, snow, sleet or hail.'][i]! }],
        ])),
        du1: rect(-420, -20, 300, 1120), du2: rect(-345, 60, 150, 960),
      }),
      sc(6, 'The big picture', 'The duster wipes the board and a diagram appears: the sun, a cloud, a hill and the sea joined by chalk arrows, with a ring on the first step.', {
        sun: dd(210, 380, 200), cloud: dd(800, 420, 300, -3), drop: dd(610, 838, 104, 8), book: ROW(0), bulb: ROW(1), flask: ROW(2),
        sea: HIDE['sea']!, mt: HIDE['mt']!, gr: HIDE['gr']!, ...AR, hl: HIDE['hl']!,
        ...notes([N1_S6]), nt1: { ...on(N1_S6, 0, -150, 360, 64), text: 'Notice', px: 46 }, nb1: { ...on(N1_S6, 0, 30, 350, 300), text: 'Water is never used up. It keeps travelling around the same loop, powered by the sun.', px: 31 },
        title: { ...rect(120, 96, 1680, 92), text: 'The big picture' }, sub: { ...rect(120, 196, 1100, 44), text: 'Follow one drop of water around the cycle.' },
        lb1: { ...rect(110, 612, 340, 44), text: '1  Evaporation' }, lb2: { ...rect(980, 400, 360, 44), text: '2  Condensation' }, lb3: { ...rect(560, 652, 330, 44), text: '3  Precipitation' }, lb4: { ...rect(140, 814, 330, 44), text: '4  Collection' },
        du1: rect(2000, -20, 300, 1120), du2: rect(2075, 60, 150, 960),
      }),
      sc(7, 'Try it', 'The diagram clears; three notes pinned in a row become the steps of a bag experiment, joined by two arrows, and the ring jumps to the first.', {
        ...notes(G7), ...PA, hl: rect(118, 395, 504, 490, { radius: 34 }),
        drop: on(G7[0]!, 0, -128, 120, 120, { rot: -5 }), sun: on(G7[1]!, 0, -128, 120, 120, { rot: 4 }), cloud: on(G7[2]!, 0, -128, 120, 120, { rot: -3 }),
        c1: chip(G7[0]!, 0, -128, 162), c2: chip(G7[1]!, 0, -128, 162), c3: chip(G7[2]!, 0, -128, 162), book: ROW(0), bulb: ROW(1), flask: ROW(2),
        title: { ...rect(120, 96, 1680, 92), text: 'Try it: a water cycle in a bag' }, sub: { ...rect(120, 196, 1400, 44), text: 'You need a zip bag, a little water and a sunny window.' },
        ...Object.fromEntries(G7.flatMap((g, i) => [[`nt${i + 1}`, { ...on(g, 0, 6, 420, 64), text: ['1.  Fill', '2.  Seal and stick', '3.  Watch'][i]! }], [`nb${i + 1}`, { ...on(g, 0, 115, 380, 150), text: ['Put a little blue water in a zip bag.', 'Close the bag and tape it to a sunny window.', 'After a few hours, look for drops on the inside.'][i]! }]])),
        du1: rect(2000, -20, 300, 1120), du2: rect(2075, 60, 150, 960),
      }),
      sc(8, 'Table', 'The ruler slides down to draw the line under the headings, the three cards become the first row of a table and three more notes fill the second row.', {
        ...notes(G8), hl: rect(1362, 387, 456, 236, { radius: 30 }),
        ruler: rect(440, 298, 1400, 52), tl1: rect(470, 362, 1350, 5), tv1: rect(478, 236, 5, 600),
        book: ROW(0), bulb: ROW(1), flask: ROW(2),
        title: { ...rect(120, 96, 1680, 92), text: 'States of water' },
        ht1: { ...rect(500, 236, 420, 56), text: 'Ice (solid)' }, ht2: { ...rect(940, 236, 420, 56), text: 'Water (liquid)' }, ht3: { ...rect(1380, 236, 420, 56), text: 'Vapour (gas)' },
        rl1: { ...rect(120, 470, 350, 70), text: 'In the cycle' }, rl2: { ...rect(120, 700, 350, 70), text: 'Particles' },
        ...Object.fromEntries(G8.map((g, i) => [`nb${i + 1}`, { ...on(g, 0, 0, 370, 150), text: ['Snow and hail', 'Rain, rivers and oceans', 'Invisible, in the air', 'Packed tightly, fixed in place', 'Close together, free to slide', 'Far apart, moving fast'][i]!, px: 30 }])),
        du1: rect(2000, -20, 300, 1120), du2: rect(2075, 60, 150, 960),
      }),
      sc(9, 'Quiz', 'The ruler lifts away and the table notes regroup as four answer options in a grid under the question.', {
        ...notes(G9), hl: ghost(at(G9[1]!, {})), book: ROW(0), bulb: ROW(1), flask: ROW(2),
        title: { ...rect(120, 96, 1680, 92), text: 'Quick quiz' }, q: { ...rect(120, 196, 1680, 70), text: 'What gives water the energy to evaporate?' },
        ...Object.fromEntries(G9.flatMap((g, i) => [[`nt${i + 1}`, { ...on(g, -300, 0, 110, 110), text: ['A', 'B', 'C', 'D'][i]!, px: 80 }], [`nb${i + 1}`, { ...on(g, 50, 0, 560, 90), text: ['Gravity', 'Heat from the sun', 'The moon’s pull', 'Cold air'][i]!, px: 38 }]])),
        du1: rect(2000, -20, 300, 1120), du2: rect(2075, 60, 150, 960),
      }),
      sc(10, 'Answer', 'The right answer grows into a big note with the ring around it and a star on its corner while the other options shrink into a faded column.', {
        ...notes(G10), n1: G10[0]!, n2: G10[1]!, n3: G10[2]!, n4: G10[3]!, f1: G10[0]!, f2: G10[1]!, f3: G10[2]!, f4: G10[3]!, hl: rect(140, 282, 1040, 576, { radius: 40 }), star: dd(1170, 352, 170, 14),
        title: { ...rect(120, 96, 1680, 92), text: 'And the answer is…' }, q: { ...rect(120, 196, 1680, 70), text: 'What gives water the energy to evaporate?' },
        nt2: { ...on(G10[1]!, -370, -170, 160, 150), text: 'B', px: 130 }, nb2: { ...on(G10[1]!, 100, -170, 700, 90), text: 'Heat from the sun', px: 64 },
        ex: { ...on(G10[1]!, 0, 70, 860, 220), text: 'Right! The sun warms the ocean, and the water rises into the air as vapour. Without the sun, the cycle would stop.' },
        nt1: { ...on(G10[0]!, -190, 0, 90, 90), text: 'A', px: 56 }, nb1: { ...on(G10[0]!, 40, 0, 340, 70), text: 'Gravity', px: 30 },
        nt3: { ...on(G10[2]!, -190, 0, 90, 90), text: 'C', px: 56 }, nb3: { ...on(G10[2]!, 40, 0, 340, 70), text: 'The moon’s pull', px: 30 },
        nt4: { ...on(G10[3]!, -190, 0, 90, 90), text: 'D', px: 56 }, nb4: { ...on(G10[3]!, 40, 0, 340, 70), text: 'Cold air', px: 30 },
        du1: rect(2000, -20, 300, 1120), du2: rect(2075, 60, 150, 960),
      }),
      sc(11, 'Summary', 'The duster sweeps back across the board; the cleared space is written with four key points, each bulleted by a star, beside the big drop again.', {
        drop: dd(1560, 640, 480, -8), cloud: dd(1490, 260, 300, -4), sun: dd(1750, 230, 170),
        star: dd(180, SUMY(0), 104, -10), st2: dd(180, SUMY(1), 104, 8), st3: dd(180, SUMY(2), 104, -6), st4: dd(180, SUMY(3), 104, 12),
        title: { ...rect(120, 96, 1680, 92), text: 'What we learned' },
        ...Object.fromEntries(['The sun heats water and it evaporates.', 'Vapour cools and condenses into clouds.', 'Water falls as rain, snow, sleet or hail.', 'It collects, and the cycle starts again.'].map((t, i) => [`ag${i + 1}`, { ...rect(260, SUMY(i) - 48, 900, 100), text: t, px: 38 }])),
        ul1: rect(260, SUMY(0) + 56, 880, 3, { a: 0.4 }), ul2: rect(260, SUMY(1) + 56, 880, 3, { a: 0.4 }), ul3: rect(260, SUMY(2) + 56, 880, 3, { a: 0.4 }), ul4: rect(260, SUMY(3) + 56, 880, 3, { a: 0.4 }),
        du1: rect(-420, -20, 300, 1120), du2: rect(-345, 60, 150, 960),
      }),
      sc(12, 'Homework', 'Three long notes stack on the left as the homework tasks, each with a doodle, a pink note says when it is due and the ring marks the bonus.', {
        ...notes(G12), hl: rect(98, 678, 1044, 194, { radius: 40 }),
        book: on(G12[0]!, -420, 0, 100, 100, { rot: -6 }), globe: on(G12[1]!, -420, 0, 100, 100, { rot: 5 }), rocket: on(G12[2]!, -420, 0, 100, 100, { rot: -4 }),
        c1: chip(G12[0]!, -420, 0, 140), c2: chip(G12[1]!, -420, 0, 140), c3: chip(G12[2]!, -420, 0, 140),
        title: { ...rect(120, 96, 1680, 92), text: 'Homework' },
        ...Object.fromEntries(['Draw and label the water cycle on one page.', 'Write each new word in a sentence of your own.', 'Bonus: find out where your tap water comes from.'].map((t, i) => [`nb${i + 1}`, { ...on(G12[i]!, 60, 0, 760, 120), text: t, px: 36 }])),
        nt4: { ...on(G12[3]!, 0, -50, 380, 110), text: 'Friday', px: 80 }, nb4: { ...on(G12[3]!, 0, 90, 350, 160), text: 'Hand it in at the start of class.', px: 32 },
        du1: rect(-420, -20, 300, 1120), du2: rect(-345, 60, 150, 960),
      }),
      sc(13, 'Thank you', 'The notes peel away; a big thank-you is written across the board with stars in the corners and the doodles lined up along the bottom.', {
        thanks: { ...rect(120, 290, 1680, 260), text: 'Thank you!' }, subC: { ...rect(260, 590, 1400, 60), text: 'See you next lesson. Keep asking questions!' },
        star: dd(220, 190, 190, -12), st2: dd(1700, 200, 220, 14), st3: dd(190, 640, 130, 18), st4: dd(1740, 650, 150, -10),
        book: dd(360, 850, 120, -5), bulb: dd(600, 850, 120, 6), apple: dd(840, 850, 120, -6), globe: dd(1080, 850, 120, 4), rocket: dd(1320, 850, 120, -6), flask: dd(1560, 850, 120, 5),
        du1: rect(-420, -20, 300, 1120), du2: rect(-345, 60, 150, 960),
      }),
    ],
  },
)
void H
