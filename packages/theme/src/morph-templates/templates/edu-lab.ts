import { authored, at, rect, W, H } from '../author'
import type { Place, ObjDef } from '../author'

/**
 * Science Lab: a bright school-science deck where twenty element tiles are the stage. The same tiles are a loose periodic-table frame on the cover, particles in the states of matter,
 * the electrons and nucleus of an atom, a periodic table, the bars of an atomic-mass chart, a colour legend, one tile that zooms to fill the slide (element of the day), the atoms of
 * a water molecule, the reactants and products of a reaction, number badges for the method, and safety icons. Around them a beaker fills and changes colour, a thermometer rises, and
 * bubbles settle into the dots of a graph. Original choreography for SlidesDone.
 */
const INK = '#0F172A', MUTE = '#475569', LINE = '#9FB3CC', GLASS = '#BBD3F2', PALE = '#EEF6FF', WHITE = '#FFFFFF'
const BLUE = '#3B82F6', RED = '#EF4444', GRAPH = '#374151', VIOLET = '#8B5CF6', YEL = '#FACC15', GREEN = '#22C55E', ORANGE = '#F97316'
const LIGHT_TEXT = new Set([YEL, GREEN, ORANGE])

/** symbol, name, atomic number, family colour, relative atomic mass label */
const EL: [string, string, number, string, string][] = [
  ['H', 'Hydrogen', 1, BLUE, '1.0'], ['He', 'Helium', 2, BLUE, '4.0'], ['Li', 'Lithium', 3, ORANGE, '6.9'], ['C', 'Carbon', 6, GRAPH, '12.0'], ['N', 'Nitrogen', 7, VIOLET, '14.0'],
  ['O', 'Oxygen', 8, RED, '16.0'], ['F', 'Fluorine', 9, GREEN, '19.0'], ['Ne', 'Neon', 10, BLUE, '20.2'], ['Na', 'Sodium', 11, ORANGE, '23.0'], ['Mg', 'Magnesium', 12, ORANGE, '24.3'],
  ['Al', 'Aluminium', 13, GRAPH, '27.0'], ['Si', 'Silicon', 14, GRAPH, '28.1'], ['P', 'Phosphorus', 15, VIOLET, '31.0'], ['S', 'Sulphur', 16, YEL, '32.1'], ['Cl', 'Chlorine', 17, GREEN, '35.5'],
  ['Ar', 'Argon', 18, BLUE, '39.9'], ['K', 'Potassium', 19, ORANGE, '39.1'], ['Ca', 'Calcium', 20, ORANGE, '40.1'], ['Fe', 'Iron', 26, GRAPH, '55.8'], ['Cu', 'Copper', 29, GRAPH, '63.5'],
]
const MASS = [1.008, 4.0026, 6.94, 12.011, 14.007, 15.999, 18.998, 20.18, 22.99, 24.305]
const tcol = (i: number) => (LIGHT_TEXT.has(EL[i]![3]) ? INK : WHITE)
const N = EL.length
const R = (n: number) => Math.round(n * 10) / 10

type P = Record<string, Place>
/** a whole element tile with symbol, number and name (or just the symbol) */
const sq = (i: number, x: number, y: number, s: number, o: { names?: boolean; px?: number; radius?: number; fill?: string; text?: string; color?: string } = {}): P => {
  const names = o.names ?? true
  const px = o.px ?? Math.round(s * (names ? 0.42 : 0.5))
  return {
    ['t' + i]: { x, y, w: s, h: s, radius: o.radius ?? Math.round(s * 0.16), ...(o.fill ? { fill: o.fill } : {}) },
    ['y' + i]: rect(x, y + s / 2 - px * 0.6 + (names ? s * 0.02 : 0), s, px * 1.2, { px, ...(o.text ? { text: o.text } : {}), ...(o.color ? { color: o.color } : {}) }),
    ['u' + i]: rect(x + 10, y + 9, s * 0.6, 30, { px: 22, ...(names ? {} : { a: 0 }) }),
    ['m' + i]: rect(x + 4, y + s - 38, s - 8, 32, { px: 22, ...(names ? {} : { a: 0 }) }),
  }
}
/** a tile that has become a circle (a particle, an electron, an atom) with an optional letter */
const dot = (i: number, cx: number, cy: number, d: number, o: { fill?: string; text?: string; px?: number; color?: string } = {}): P => {
  const px = o.px ?? Math.round(d * 0.46)
  return {
    ['t' + i]: { x: cx - d / 2, y: cy - d / 2, w: d, h: d, radius: d / 2, ...(o.fill ? { fill: o.fill } : {}) },
    ['y' + i]: rect(cx - d / 2, cy - px * 0.6, d, px * 1.2, { px, ...(o.text ? { text: o.text, color: o.color ?? WHITE } : { a: 0 }) }),
    ['u' + i]: rect(cx - d / 2 + 6, cy - d / 2 + 6, d * 0.6, 30, { px: 22, a: 0 }),
    ['m' + i]: rect(cx - d / 2, cy + d / 2 - 30, d, 30, { px: 22, a: 0 }),
  }
}
/** a tile that has become a bar: its symbol under the baseline, its mass over the bar */
const bar = (i: number, x: number, base: number, h: number, w: number): P => ({
  ['t' + i]: { x, y: base - h, w, h, radius: Math.min(16, h / 2) },
  ['y' + i]: rect(x - 12, base + 14, w + 24, 52, { px: 44, color: INK }),
  ['u' + i]: rect(x, base - h + 4, w, 30, { px: 22, a: 0 }),
  ['m' + i]: rect(x - 16, base - h - 46, w + 32, 38, { px: 28, text: EL[i]![4], color: INK }),
})
const pt = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)] as const
const ring = (cx: number, cy: number, r: number, o: Partial<Place> = {}): Place => ({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, ...o })
const disc = (cx: number, cy: number, d: number, o: Partial<Place> = {}): Place => ({ x: cx - d / 2, y: cy - d / 2, w: d, h: d, ...o })
/** a rod joining two centres: a fixed-geometry thin rect (every rod belongs to one scene only) */
const rod = (x1: number, y1: number, x2: number, y2: number, t: number): Place => {
  const len = Math.hypot(x2 - x1, y2 - y1)
  return { x: (x1 + x2) / 2 - len / 2, y: (y1 + y2) / 2 - t / 2, w: len, h: t, rot: R((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI) }
}
const beaker = (x: number, y: number, w: number, h: number, level: number, fill: string): P => ({
  glass: rect(x, y, w, h), liq: { x: x + 0.08 * w, y: y + 0.9 * h - level * 0.9 * h, w: 0.84 * w, h: level * 0.9 * h, fill },
})
const thermo = (m: number): P => ({
  tubeO: rect(1690, 220, 64, 700, { radius: 32 }), bulbO: disc(1722, 910, 130), tubeI: rect(1704, 234, 36, 636, { radius: 18 }), merc: rect(1711, 905 - m, 22, m, { radius: 11 }), bulbI: disc(1722, 910, 90),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((k) => ['tk' + (k + 1), rect(1766, 300 + k * 90, 26, 4)])),
})
const T = (x: number, y: number, w: number, h: number, text: string, o: Partial<Place> = {}): Place => rect(x, y, w, h, { text, ...o })

const tileObjs = (): Record<string, ObjDef> => {
  const out: Record<string, ObjDef> = {}
  EL.forEach(([sym, name, num, col], i) => {
    const park = i < 10 ? 't' : 'b'
    out['t' + i] = { kind: 'shape', radius: 24, fill: col, park }
    out['y' + i] = { kind: 'text', text: sym, px: 64, weight: 800, color: tcol(i), face: 'heading', lh: 1, align: 'ctr', park }
    out['u' + i] = { kind: 'text', text: String(num), px: 22, weight: 700, color: tcol(i), align: 'l', park }
    out['m' + i] = { kind: 'text', text: name, px: 22, weight: 600, color: tcol(i), align: 'ctr', park }
  })
  return out
}
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const body = (px: number, extra: Partial<ObjDef> = {}): ObjDef => ({ kind: 'text', text: '', px, weight: 400, color: MUTE, lh: 1.4, ...extra } as ObjDef)
const head = (px: number, extra: Partial<ObjDef> = {}): ObjDef => ({ kind: 'text', text: '', px, weight: 700, color: INK, face: 'heading', lh: 1.1, ...extra } as ObjDef)

/** the cover/closing frame: two rows of ten tiles with the title between them */
const JT = [0, 16, 6, 22, 2, 14, 0, 20, 8, 12], JB = [10, 0, 18, 6, 0, 14, 4, 16, 0, 8]
const frame = (swap: boolean): P => {
  const out: P = {}
  range(N).forEach((i) => {
    const top = swap ? i >= 10 : i < 10
    const k = i % 10
    Object.assign(out, sq(i, 134 + k * 168, top ? 80 + (swap ? JB[k]! : JT[k]!) : 846 + (swap ? JT[k]! * 0.5 : JB[k]! * 0.9), 140))
  })
  return out
}
const FIELD = (dx = 0, dy = 0, k = 1) => rect(-(k - 1) * 960 + dx, -(k - 1) * 540 + dy, W * k, H * k)
const cardX = (k: number) => 120 + k * 426

// matter: particle centres (relative to the card centre) for solid / liquid / gas
const SOLID = [[-105, 800], [-35, 800], [35, 800], [105, 800], [-105, 870], [-35, 870], [35, 870], [105, 870]]
const LIQUID = [[-120, 850], [-45, 868], [35, 850], [115, 866], [-80, 792], [80, 796]]
const GAS = [[-125, 650], [60, 625], [130, 740], [-50, 745], [110, 880], [-130, 850]]
// the atom
const EL1 = [1, 2], EL2 = [6, 7, 8, 9, 10, 11]
// the bubbles
const BUB_B8 = [[1560, 700, 26], [1620, 620, 34], [1690, 730, 22], [1650, 540, 18], [1590, 780, 16], [1700, 640, 14]]
const BUB_B10 = [[1650, 320, 18], [1700, 280, 22], [1625, 262, 14], [1735, 322, 12], [1675, 236, 14], [1720, 226, 12]]
const GX = range(6).map((i) => 300 + i * 166), GT = [90, 64, 45, 30, 20, 12], GY = GT.map((t) => 810 - t * 4.6)

export const EDU_LAB = authored(
  {
    id: 'edu-lab', category: 'education', name: 'Science Lab', tagline: 'Element tiles that regroup into atoms, molecules and charts',
    description: 'A bright, clean science-lesson deck where twenty element tiles are the stage: a periodic-table frame on the cover that regroups into states of matter, an atom, a mass chart, a molecule, a reaction and the steps of an experiment, with a beaker, a thermometer and rising bubbles in between.',
    audience: 'The Science Lab template suits secondary-school chemistry and physics lessons, STEM clubs, science fairs and museum talks, lab inductions, revision sessions and any talk that explains atoms, matter or an experiment to students.',
    topics: ['science', 'science lesson', 'chemistry', 'physics', 'periodic table', 'elements', 'atoms and molecules', 'atom', 'molecule', 'matter', 'states of matter', 'laboratory', 'lab safety', 'experiment', 'scientific method', 'STEM', 'school science', 'secondary school', 'reaction', 'water', 'oxygen', 'education', 'biology', 'student', 'teacher', 'lesson plan'],
    fonts: { heading: 'Outfit', body: 'Nunito Sans' },
    colors: { background: '#FFFFFF', surface: '#EEF6FF', textPrimary: '#0F172A', textSecondary: '#475569', primary: '#3B82F6', secondary: '#8B5CF6', accent: '#F97316', onPrimary: '#FFFFFF' },
    background: '#FFFFFF',
  },
  {
    objects: {
      field: { kind: 'image', art: 'lab-field.webp', alt: 'A soft pale blue gradient' },
      bubbles: { kind: 'image', art: 'lab-bubbles.webp', alt: 'Glossy bubbles and tiny glowing particles' },
      flashB: { kind: 'shape', shape: 'ellipse', fill: '#FDE68A' }, flashA: { kind: 'shape', shape: 'ellipse', fill: YEL },
      c1: { kind: 'shape', radius: 36, fill: WHITE, stroke: '#D6E4F7', strokeW: 2, park: 'b' }, c2: { kind: 'shape', radius: 36, fill: WHITE, stroke: '#D6E4F7', strokeW: 2, park: 'b' },
      c3: { kind: 'shape', radius: 36, fill: WHITE, stroke: '#D6E4F7', strokeW: 2, park: 'b' }, c4: { kind: 'shape', radius: 36, fill: WHITE, stroke: '#D6E4F7', strokeW: 2, park: 'b' },
      axX: { kind: 'shape', radius: 2, fill: LINE }, axY: { kind: 'shape', radius: 2, fill: LINE },
      tubeO: { kind: 'shape', radius: 32, fill: GLASS, park: 'r' }, bulbO: { kind: 'shape', shape: 'ellipse', fill: GLASS, park: 'r' }, tubeI: { kind: 'shape', radius: 18, fill: WHITE, park: 'r' },
      merc: { kind: 'shape', radius: 11, fill: RED, park: 'r' }, bulbI: { kind: 'shape', shape: 'ellipse', fill: RED, park: 'r' },
      ...Object.fromEntries(range(6).map((k) => ['tk' + (k + 1), { kind: 'shape', radius: 2, fill: LINE, park: 'r' } as ObjDef])),
      liq: { kind: 'shape', fill: BLUE, park: 'r' },
      glass: { kind: 'shape', poly: [[0, 0], [0.08, 0], [0.08, 0.9], [0.92, 0.9], [0.92, 0], [1, 0], [1, 1], [0, 1]], fill: GLASS, park: 'r' },
      ...Object.fromEntries(range(5).map((k) => ['g' + (k + 1), { kind: 'shape', radius: 4, fill: BLUE } as ObjDef])),
      rw1: { kind: 'shape', radius: 12, fill: LINE }, rw2: { kind: 'shape', radius: 12, fill: LINE },
      rr1: { kind: 'shape', radius: 9, fill: LINE }, rr2: { kind: 'shape', radius: 9, fill: LINE }, ro1: { kind: 'shape', radius: 6, fill: LINE }, ro2: { kind: 'shape', radius: 6, fill: LINE },
      ...Object.fromEntries(range(4).map((k) => ['rp' + (k + 1), { kind: 'shape', radius: 8, fill: LINE } as ObjDef])),
      ash: { kind: 'shape', radius: 10, fill: INK }, ahd: { kind: 'shape', shape: 'triangle', fill: INK },
      ...Object.fromEntries(range(6).map((k) => ['bu' + (k + 1), { kind: 'shape', shape: 'ellipse', fill: WHITE } as ObjDef])),
      // tiles: the red one first (it can zoom over everything), the rings above it, then the others
      t5: { kind: 'shape', radius: 24, fill: RED, park: 't' },
      r1: { kind: 'shape', shape: 'ellipse', stroke: LINE, strokeW: 3 }, r2: { kind: 'shape', shape: 'ellipse', stroke: LINE, strokeW: 3 },
      ...Object.fromEntries(Object.entries(tileObjs()).filter(([id]) => id !== 't5')),
      // safety icons
      gg1: { kind: 'shape', shape: 'ellipse', stroke: WHITE, strokeW: 8 }, gg2: { kind: 'shape', shape: 'ellipse', stroke: WHITE, strokeW: 8 },
      gg3: { kind: 'shape', radius: 4, fill: WHITE }, gg4: { kind: 'shape', radius: 4, fill: WHITE }, gg5: { kind: 'shape', radius: 4, fill: WHITE },
      coat: { kind: 'shape', poly: [[0.28, 0], [0.42, 0.14], [0.58, 0.14], [0.72, 0], [1, 0.22], [0.86, 0.46], [0.74, 0.38], [0.74, 1], [0.26, 1], [0.26, 0.38], [0.14, 0.46], [0, 0.22]], fill: WHITE },
      drop: { kind: 'shape', poly: [[0.5, 0], [0.78, 0.4], [0.9, 0.65], [0.8, 0.88], [0.5, 1], [0.2, 0.88], [0.1, 0.65], [0.22, 0.4]], fill: WHITE },
      warnT: { kind: 'shape', shape: 'triangle', fill: INK },
      flasks: { kind: 'image', art: 'lab-flasks.webp', alt: 'Three glass flasks and a beaker with blue, green and yellow liquids', park: 'r' },
      scope: { kind: 'image', art: 'lab-microscope.webp', alt: 'A school laboratory microscope', park: 'r' },
      rack: { kind: 'image', art: 'lab-rack.webp', alt: 'A test-tube rack with colourful liquids', park: 'b' },
      k: { kind: 'text', text: '', px: 26, weight: 700, color: BLUE, caps: true, spc: 5 },
      title: { kind: 'text', text: '', px: 80, weight: 800, color: INK, face: 'heading', lh: 1.05, spc: -1 },
      body: body(30),
      ...Object.fromEntries(range(5).flatMap((k) => [['h' + (k + 1), head(38)], ['b' + (k + 1), body(26)]] as [string, ObjDef][])),
      ...Object.fromEntries(range(7).map((k) => ['lg' + (k + 1), body(26, { color: INK, weight: 600 })] as [string, ObjDef])),
      cap1: body(24, { weight: 700, caps: true, spc: 4, align: 'ctr' }), cap2: body(24, { weight: 700, caps: true, spc: 4, align: 'ctr' }),
      eq1: head(46, { align: 'ctr', weight: 700 }), eq2: head(46, { align: 'ctr', weight: 700 }),
      fH: head(150, { weight: 800, color: BLUE, align: 'r', lh: 1 }), f2: head(80, { weight: 800, color: BLUE, lh: 1 }), fO: head(150, { weight: 800, color: RED, lh: 1 }),
      stat: head(120, { weight: 800, color: BLUE, lh: 1 }),
      ...Object.fromEntries(range(6).map((k) => ['xl' + (k + 1), body(24, { weight: 600, align: 'ctr' })] as [string, ObjDef])),
      yl: body(24, { weight: 600 }), xt: body(24, { weight: 600, align: 'ctr' }),
      warn: head(54, { weight: 800, color: YEL, align: 'ctr', lh: 1 }),
    },
    order: ['field', 'bubbles', 'flashB', 'flashA', 'c1', 'c2', 'c3', 'c4', 'axX', 'axY', 'tubeO', 'bulbO', 'tubeI', 'merc', 'bulbI', 'tk1', 'tk2', 'tk3', 'tk4', 'tk5', 'tk6', 'liq', 'glass',
      'g1', 'g2', 'g3', 'g4', 'g5', 'rw1', 'rw2', 'rr1', 'rr2', 'ro1', 'ro2', 'rp1', 'rp2', 'rp3', 'rp4', 'ash', 'ahd', 'bu1', 'bu2', 'bu3', 'bu4', 'bu5', 'bu6', 't5', 'r1', 'r2',
      ...range(N).filter((i) => i !== 5).map((i) => 't' + i), ...range(N).flatMap((i) => ['y' + i, 'u' + i, 'm' + i]),
      'gg1', 'gg2', 'gg3', 'gg4', 'gg5', 'coat', 'drop', 'warnT', 'flasks', 'scope', 'rack',
      'k', 'title', 'body', 'h1', 'b1', 'h2', 'b2', 'h3', 'b3', 'h4', 'b4', 'h5', 'b5', 'lg1', 'lg2', 'lg3', 'lg4', 'lg5', 'lg6', 'lg7', 'cap1', 'cap2', 'eq1', 'eq2', 'fH', 'f2', 'fO', 'stat',
      'xl1', 'xl2', 'xl3', 'xl4', 'xl5', 'xl6', 'yl', 'xt', 'warn'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The opening: twenty element tiles in a loose periodic-table frame with the title cut out between the rows and a set of flasks beside it.', bg: WHITE,
        place: {
          field: FIELD(), ...frame(false), flasks: rect(1190, 280, 600, 500),
          k: T(120, 296, 900, 40, 'SECONDARY SCIENCE  ·  UNIT 1'), title: T(116, 346, 1020, 372, 'Science\nLab', { px: 176 }), body: T(120, 736, 900, 60, 'A first tour of atoms and elements.', { px: 38 }),
        },
      },
      {
        id: 's2', title: 'Agenda', purpose: 'Five tiles drop into a column as number badges for the lesson plan; the rest shrink into a small block and a microscope slides in.', bg: PALE,
        place: {
          field: FIELD(-30, 0, 1.04), scope: rect(1200, 390, 560, 620),
          ...Object.fromEntries([0, 3, 4, 5, 13].flatMap((i, r) => Object.entries(sq(i, 120, 390 + r * 118, 92, { names: false, px: 46, radius: 24 })))),
          ...Object.fromEntries([1, 2, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19].flatMap((i, n) => Object.entries(sq(i, 1150 + (n % 5) * 74, 110 + Math.floor(n / 5) * 74, 64, { names: false, px: 28, radius: 16 })))),
          k: T(120, 100, 700, 40, 'AGENDA'), title: T(120, 146, 900, 196, 'Today\nin the lab', { px: 88 }),
          h1: T(250, 396, 820, 46, 'What is matter?'), b1: T(250, 440, 820, 34, 'Solids, liquids and gases', { px: 28 }),
          h2: T(250, 514, 820, 46, 'The atom'), b2: T(250, 558, 820, 34, 'Protons, neutrons and electrons', { px: 28 }),
          h3: T(250, 632, 820, 46, 'The periodic table'), b3: T(250, 676, 820, 34, 'Families, mass and the element of the day', { px: 28 }),
          h4: T(250, 750, 820, 46, 'Molecules and reactions'), b4: T(250, 794, 820, 34, 'How atoms join and rearrange', { px: 28 }),
          h5: T(250, 868, 820, 46, 'Experiments and safety'), b5: T(250, 912, 820, 34, 'Method, results and lab rules', { px: 28 }),
        },
      },
      {
        id: 's3', title: 'States of matter', purpose: 'The tiles shrink into round particles and regroup into three panels: packed in a solid, loose in a liquid, far apart in a gas, with a thermometer beside them.', bg: WHITE,
        place: {
          field: FIELD(20, 0, 1.04),
          c1: rect(120, 370, 450, 580), c2: rect(606, 370, 450, 580), c3: rect(1092, 370, 450, 580), ...thermo(300),
          ...Object.fromEntries(range(8).flatMap((i) => Object.entries(dot(i, 345 + SOLID[i]![0]!, SOLID[i]![1]!, 64, { fill: BLUE })))),
          ...Object.fromEntries(range(6).flatMap((n) => Object.entries(dot(8 + n, 831 + LIQUID[n]![0]!, LIQUID[n]![1]!, 64, { fill: VIOLET })))),
          ...Object.fromEntries(range(6).flatMap((n) => Object.entries(dot(14 + n, 1317 + GAS[n]![0]!, GAS[n]![1]!, 64, { fill: ORANGE })))),
          k: T(120, 96, 700, 40, 'WHAT IS MATTER?'), title: T(120, 138, 1400, 100, 'Three states of matter'),
          body: T(120, 246, 1400, 92, 'Matter is anything that has mass and takes up space. Heating or cooling it changes how its particles move.'),
          h1: T(156, 400, 380, 56, 'Solid', { px: 44 }), b1: T(156, 462, 380, 96, 'Particles locked in place: fixed shape and volume.', { px: 27 }),
          h2: T(642, 400, 380, 56, 'Liquid', { px: 44 }), b2: T(642, 462, 380, 96, 'Particles slide past each other: fixed volume, no fixed shape.', { px: 27 }),
          h3: T(1128, 400, 380, 56, 'Gas', { px: 44 }), b3: T(1128, 462, 380, 96, 'Particles far apart: it fills any container.', { px: 27 }),
        },
      },
      {
        id: 's4', title: 'The atom', purpose: 'The panels drop away; one tile becomes the nucleus of a carbon atom and six more become electrons that settle into two shells.', bg: PALE,
        place: {
          field: FIELD(0, 0, 1.0), r1: ring(1330, 540, 150), r2: ring(1330, 540, 270),
          ...dot(3, 1330, 540, 190, { fill: GRAPH, text: '6+', px: 54 }),
          ...Object.fromEntries(EL1.flatMap((i, n) => { const [x, y] = pt(1330, 540, 150, -60 + n * 180); return Object.entries(dot(i, x, y, 46, { fill: BLUE })) })),
          ...Object.fromEntries(EL2.slice(0, 4).flatMap((i, n) => { const [x, y] = pt(1330, 540, 270, 45 + n * 90); return Object.entries(dot(i, x, y, 46, { fill: BLUE })) })),
          k: T(120, 150, 700, 40, 'THE ATOM'), title: T(120, 196, 820, 170, 'A tiny nucleus with electrons around it', { px: 72 }),
          body: T(120, 400, 780, 190, 'Every atom has a nucleus of protons and neutrons. Electrons travel around it in shells. Carbon has 6 protons and 6 electrons: 2 in the first shell and 4 in the second.'),
          h1: T(120, 700, 250, 44, 'Protons', { px: 34 }), b1: T(120, 748, 250, 110, 'Positive charge, in the nucleus.', { px: 25 }),
          h2: T(400, 700, 250, 44, 'Neutrons', { px: 34 }), b2: T(400, 748, 250, 110, 'No charge, in the nucleus.', { px: 25 }),
          h3: T(680, 700, 250, 44, 'Electrons', { px: 34 }), b3: T(680, 748, 250, 110, 'Negative charge, in shells.', { px: 25 }),
        },
      },
      {
        id: 's5', title: 'Periodic table', purpose: 'The atom dissolves and all twenty tiles line up as a small periodic table, in order of atomic number, each with symbol, number and name.', bg: WHITE,
        place: {
          field: FIELD(-20, 0, 1.04),
          ...Object.fromEntries(range(N).flatMap((i) => Object.entries(sq(i, 117 + (i % 10) * 170, 420 + Math.floor(i / 10) * 170, 156)))),
          k: T(120, 150, 700, 40, 'THE PERIODIC TABLE'), title: T(120, 196, 1600, 100, 'Elements, in order of atomic number', { px: 76 }),
          body: T(120, 800, 1680, 50, 'A sample of 20 of the 118 known elements. Colour shows the family; the small number counts the protons.'),
        },
      },
      {
        id: 's6', title: 'Atomic mass', purpose: 'Ten tiles stretch into a bar chart of atomic mass while seven others shrink into a colour key.', bg: PALE,
        place: {
          field: FIELD(0, 0, 1.0), axX: rect(100, 930, 1180, 4),
          ...Object.fromEntries(range(10).flatMap((i) => Object.entries(bar(i, 120 + i * 114, 930, Math.max(20, R(MASS[i]! * 17)), 92)))),
          ...Object.fromEntries([[15, BLUE], [16, ORANGE], [10, GRAPH], [12, VIOLET], [13, YEL], [14, GREEN], [17, RED]].flatMap(([i, c], r) => Object.entries(sq(i as number, 1380, 396 + r * 72, 44, { names: false, px: 22, radius: 12, fill: c as string })))),
          k: T(120, 96, 700, 40, 'ATOMIC MASS'), title: T(120, 138, 1200, 100, 'Heavier atoms, taller bars', { px: 76 }),
          body: T(120, 246, 1150, 50, 'Relative atomic mass of the first ten elements we met.'),
          h1: T(1380, 316, 420, 50, 'Colour key', { px: 36 }),
          lg1: T(1444, 400, 380, 38, 'Hydrogen, noble gases'), lg2: T(1444, 472, 380, 38, 'Reactive metals'), lg3: T(1444, 544, 380, 38, 'Carbon and metals'), lg4: T(1444, 616, 380, 38, 'Nitrogen group'),
          lg5: T(1444, 688, 380, 38, 'Sulphur'), lg6: T(1444, 760, 380, 38, 'Halogens'), lg7: T(1444, 832, 380, 38, 'Oxygen'),
        },
      },
      {
        id: 's7', title: 'Element of the day', purpose: 'The oxygen bar swells until it fills the slide in red, and an oxygen atom with eight electrons turns on the left beside the facts.', bg: PALE,
        place: {
          t5: at(rect(0, 0, W, H), { radius: 0 }), bubbles: at(rect(0, 0, W, H), { a: 0.5 }), r1: ring(520, 540, 150, { a: 0.9 }), r2: ring(520, 540, 270, { a: 0.9 }),
          ...dot(3, 520, 540, 190, { fill: WHITE, text: '8+', px: 54, color: RED }),
          ...Object.fromEntries(EL1.flatMap((i, n) => { const [x, y] = pt(520, 540, 150, 100 + n * 180); return Object.entries(dot(i, x, y, 46, { fill: WHITE })) })),
          ...Object.fromEntries(EL2.flatMap((i, n) => { const [x, y] = pt(520, 540, 270, 15 + n * 60); return Object.entries(dot(i, x, y, 46, { fill: WHITE })) })),
          k: T(1000, 250, 800, 40, 'ELEMENT OF THE DAY', { color: '#FEE2E2' }), title: T(1000, 298, 820, 200, 'Oxygen', { px: 170, color: WHITE }),
          body: T(1000, 540, 780, 280, 'Symbol O, atomic number 8\nAbout one fifth of the air we breathe\nNeeded for burning and for breathing\nJoins with hydrogen to make water', { color: WHITE, px: 32 }),
        },
      },
      {
        id: 's8', title: 'Molecule', purpose: 'The red tile shrinks back into an oxygen atom, two tiles become hydrogen atoms joined to it by rods, and a beaker of water fills on the right.', bg: WHITE,
        place: {
          field: FIELD(20, 0, 1.04),
          ...beaker(1480, 380, 280, 440, 0.7, BLUE),
          rw1: rod(1010, 420, 781, 598, 24), rw2: rod(1010, 420, 1239, 598, 24),
          ...dot(5, 1010, 420, 250, { fill: RED, text: 'O', px: 100 }), ...dot(0, 781, 598, 160, { fill: BLUE, text: 'H', px: 70 }), ...dot(1, 1239, 598, 160, { fill: BLUE, text: 'H', px: 70 }),
          ...Object.fromEntries(BUB_B8.flatMap(([x, y, d], n) => [['bu' + (n + 1), at(disc(x!, y!, d!), { a: 0.75 })]])),
          k: T(120, 120, 700, 40, 'MOLECULES'), title: T(120, 166, 700, 170, 'One molecule of water', { px: 72 }),
          body: T(120, 370, 640, 260, 'Two hydrogen atoms bond to one oxygen atom by sharing electrons. The angle between the two bonds is about 104.5 degrees.'),
          fH: T(100, 700, 150, 170, 'H'), f2: T(252, 774, 70, 90, '2'), fO: T(296, 700, 150, 170, 'O'),
        },
      },
      {
        id: 's9', title: 'Reaction', purpose: 'The atoms regroup: hydrogen and oxygen molecules on the left, a flash on the arrow, and two water molecules on the right while the thermometer climbs.', bg: PALE,
        place: {
          field: FIELD(0, 0, 1.0), flashB: disc(905, 565, 310, { a: 0.45 }), flashA: disc(905, 565, 190, { a: 0.85 }), ...thermo(560),
          rr1: rod(200, 480, 315, 480, 18), rr2: rod(200, 650, 315, 650, 18), ro1: rod(520, 553, 670, 553, 12), ro2: rod(520, 577, 670, 577, 12),
          rp1: rod(1180, 520, 1088, 586, 16), rp2: rod(1180, 520, 1272, 586, 16), rp3: rod(1470, 520, 1378, 586, 16), rp4: rod(1470, 520, 1562, 586, 16),
          ash: rect(790, 555, 150, 20), ahd: rect(930, 535, 60, 60, { rot: 90 }),
          ...dot(0, 200, 480, 84, { fill: BLUE, text: 'H', px: 44 }), ...dot(1, 315, 480, 84, { fill: BLUE, text: 'H', px: 44 }), ...dot(2, 200, 650, 84, { fill: BLUE, text: 'H', px: 44 }), ...dot(3, 315, 650, 84, { fill: BLUE, text: 'H', px: 44 }),
          ...dot(5, 520, 565, 110, { fill: RED, text: 'O', px: 56 }), ...dot(6, 670, 565, 110, { fill: RED, text: 'O', px: 56 }),
          ...dot(7, 1180, 520, 110, { fill: RED, text: 'O', px: 56 }), ...dot(9, 1088, 586, 74, { fill: BLUE, text: 'H', px: 40 }), ...dot(10, 1272, 586, 74, { fill: BLUE, text: 'H', px: 40 }),
          ...dot(8, 1470, 520, 110, { fill: RED, text: 'O', px: 56 }), ...dot(11, 1378, 586, 74, { fill: BLUE, text: 'H', px: 40 }), ...dot(12, 1562, 586, 74, { fill: BLUE, text: 'H', px: 40 }),
          k: T(120, 90, 700, 40, 'CHEMICAL REACTION'), title: T(120, 134, 1400, 100, 'Hydrogen burns in oxygen', { px: 72 }),
          cap1: T(160, 372, 600, 32, 'REACTANTS', { color: BLUE }), cap2: T(1090, 372, 540, 32, 'PRODUCT', { color: BLUE }),
          eq1: T(160, 746, 600, 64, '2H₂ + O₂'), eq2: T(1090, 746, 540, 64, '2H₂O'),
          body: T(120, 880, 1450, 50, 'The atoms are the same before and after. They only change partners, so the total mass stays the same.'),
        },
      },
      {
        id: 's10', title: 'Experiment steps', purpose: 'The atoms become four number badges on four cards in a row, with a small beaker of yellow liquid and rising bubbles at the top right.', bg: WHITE,
        place: {
          field: FIELD(-20, 0, 1.04), ...beaker(1590, 100, 190, 280, 0.6, YEL),
          c1: rect(cardX(0), 460, 390, 470), c2: rect(cardX(1), 460, 390, 470), c3: rect(cardX(2), 460, 390, 470), c4: rect(cardX(3), 460, 390, 470),
          ...Object.fromEntries([0, 5, 13, 14].flatMap((i, n) => Object.entries(sq(i, cardX(n) + 36, 502, 84, { names: false, px: 44, radius: 22, text: String(n + 1) })))),
          ...Object.fromEntries(BUB_B10.flatMap(([x, y, d], n) => [['bu' + (n + 1), at(disc(x!, y!, d!), { a: 0.8 })]])),
          k: T(120, 100, 800, 40, 'THE SCIENTIFIC METHOD'), title: T(120, 146, 1400, 100, 'How we run an experiment', { px: 76 }), body: T(120, 262, 1400, 50, 'Scientists follow the same four steps, whatever they study.'),
          h1: T(cardX(0) + 36, 612, 320, 52, 'Ask'), b1: T(cardX(0) + 36, 682, 322, 230, 'Pick one clear question, such as: does heat make sugar dissolve faster?', { px: 29 }),
          h2: T(cardX(1) + 36, 612, 320, 52, 'Plan'), b2: T(cardX(1) + 36, 682, 322, 230, 'Change one thing at a time and keep everything else the same.', { px: 29 }),
          h3: T(cardX(2) + 36, 612, 320, 52, 'Measure'), b3: T(cardX(2) + 36, 682, 322, 230, 'Record the results in a table and repeat the test to check them.', { px: 29 }),
          h4: T(cardX(3) + 36, 612, 320, 52, 'Conclude'), b4: T(cardX(3) + 36, 682, 322, 230, 'Compare the results with your prediction and say what you learned.', { px: 29 }),
        },
      },
      {
        id: 's11', title: 'Results', purpose: 'The bubbles rise out of the beaker and settle into the six dots of a line graph; a card and a test-tube rack carry the result.', bg: PALE,
        place: {
          field: FIELD(0, 0, 1.0), c1: rect(120, 270, 1100, 690), c2: rect(1260, 270, 540, 330), rack: rect(1260, 640, 540, 330),
          axY: rect(210, 330, 4, 480), axX: rect(210, 810, 940, 4),
          ...Object.fromEntries(range(5).map((k) => ['g' + (k + 1), rod(GX[k]!, GY[k]!, GX[k + 1]!, GY[k + 1]!, 8)])),
          ...Object.fromEntries(range(6).map((k) => ['bu' + (k + 1), at(disc(GX[k]!, GY[k]!, 40), { fill: BLUE })])),
          ...Object.fromEntries(range(6).map((k) => ['xl' + (k + 1), T(GX[k]! - 55, 826, 110, 32, ['20 °C', '30 °C', '40 °C', '50 °C', '60 °C', '70 °C'][k]!)])),
          yl: T(240, 290, 560, 32, 'Seconds to dissolve (sample data)'), xt: T(210, 886, 940, 32, 'Water temperature'),
          k: T(120, 96, 900, 40, 'RESULTS  ·  SAMPLE DATA'), title: T(120, 138, 1600, 100, 'Warmer water dissolves sugar faster', { px: 70 }),
          stat: T(1300, 296, 460, 130, '12 s'), body: T(1300, 440, 470, 130, 'Time for the sugar to dissolve at 70 °C in this sample run.', { px: 28 }),
        },
      },
      {
        id: 's12', title: 'Safety', purpose: 'Four tiles turn into round badges holding goggles, a lab coat, a water drop and a warning triangle above four safety rules.', bg: WHITE,
        place: {
          field: FIELD(20, 0, 1.04),
          c1: rect(cardX(0), 330, 390, 580), c2: rect(cardX(1), 330, 390, 580), c3: rect(cardX(2), 330, 390, 580), c4: rect(cardX(3), 330, 390, 580),
          ...dot(0, cardX(0) + 195, 455, 170, { fill: BLUE }), ...dot(4, cardX(1) + 195, 455, 170, { fill: VIOLET }), ...dot(14, cardX(2) + 195, 455, 170, { fill: GREEN }), ...dot(13, cardX(3) + 195, 455, 170, { fill: YEL }),
          gg1: rect(cardX(0) + 195 - 70, 430, 64, 50), gg2: rect(cardX(0) + 195 + 6, 430, 64, 50), gg3: rect(cardX(0) + 195 - 8, 451, 16, 8), gg4: rect(cardX(0) + 195 - 90, 451, 22, 8), gg5: rect(cardX(0) + 195 + 68, 451, 22, 8),
          coat: rect(cardX(1) + 195 - 42, 407, 84, 96), drop: rect(cardX(2) + 195 - 35, 409, 70, 92),
          warnT: rect(cardX(3) + 195 - 48, 412, 96, 84), warn: T(cardX(3) + 195 - 30, 443, 60, 54, '!'),
          k: T(120, 96, 700, 40, 'LAB SAFETY'), title: T(120, 138, 1400, 100, 'Four rules for every lesson', { px: 76 }),
          h1: T(cardX(0) + 36, 590, 320, 48, 'Goggles on'), b1: T(cardX(0) + 36, 656, 322, 230, 'Wear eye protection whenever you heat, mix or pour.', { px: 29 }),
          h2: T(cardX(1) + 36, 590, 320, 48, 'Coat and hair'), b2: T(cardX(1) + 36, 656, 322, 230, 'Fasten your lab coat and tie long hair back.', { px: 29 }),
          h3: T(cardX(2) + 36, 590, 320, 48, 'Wash hands'), b3: T(cardX(2) + 36, 656, 322, 230, 'Wash with soap after every practical, even if you wore gloves.', { px: 29 }),
          h4: T(cardX(3) + 36, 590, 320, 48, 'Report spills'), b4: T(cardX(3) + 36, 656, 322, 230, 'Tell your teacher straight away about spills, breaks or burns.', { px: 29 }),
        },
      },
      {
        id: 's13', title: 'Closing', purpose: 'The tiles swap rows and settle back into the cover frame around a closing line, with the flasks returning on the right.', bg: WHITE,
        place: {
          field: FIELD(0, 0, 1.0), ...frame(true), flasks: rect(1190, 280, 600, 500),
          k: T(120, 296, 900, 40, 'THANK YOU  ·  QUESTIONS WELCOME'), title: T(116, 346, 1040, 340, 'Keep asking\nwhy', { px: 150 }),
          body: T(120, 716, 960, 100, 'science@yourschool.edu\nLab open Thursdays after school', { px: 32 }),
        },
      },
    ],
  },
)
void H
