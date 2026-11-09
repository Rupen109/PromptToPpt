import { authored, at, rect, full, W, H } from '../author'
import type { ObjDef, Place } from '../author'

/**
 * Feature Spotlight: a light app-release keynote. Five colour irises (a circle that grows from a dot until it is the next feature's whole background, and later shrinks back to a dot),
 * a carousel of five phone mockups built from shapes (the centre phone is large, the neighbours small and tilted, every scene pushes them one step, and one phone card zooms to fill the slide
 * and spreads into a timeline), six feature icons that travel from a grid to a list and on to stat cards and price cards, a divider that wipes before to after, and QR squares that
 * assemble out of loose dots. Original choreography for SlidesDone.
 */
const INK = '#0F172A'
const GREY = '#F1F3F7'
const IC = ['#FF7A1A', '#12B886', '#F43F8E', '#1CA7FF', '#5B5BFF', '#0F172A']
const BRAND = ['#5B5BFF', '#FF7A1A', '#12B886', '#F43F8E', '#1CA7FF'] // iris colours: indigo, tangerine, emerald, rose, sky

// ── text colours of a scene ──
type Tc = { i: string; s: string }
const LIGHT: Tc = { i: INK, s: '#475569' }
const ON_INDIGO: Tc = { i: '#FFFFFF', s: '#E0E3FF' }
const ON_TANGERINE: Tc = { i: INK, s: '#2B1500' }
const ON_EMERALD: Tc = { i: INK, s: '#05342A' }
const ON_ROSE: Tc = { i: '#FFFFFF', s: '#FFFFFF' }
const ON_SKY: Tc = { i: INK, s: '#052B45' }
const X = (r: Place, text: string, o: Partial<Place> = {}): Place => ({ ...r, text, ...o })
const chrome = (tc: Tc) => ({ brand: rect(80, 52, 400, 30, { color: tc.i }), page: rect(1240, 52, 600, 30, { color: tc.s }) })

// ── irises: the dots wait in a palette row top right; one grows from its dot to fill the slide ──
const disc = (cx: number, cy: number, r: number): Place => ({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r })
const PAL = (i: number) => disc(1600 + i * 50, 148, 13)
const BIG = (cx: number, cy: number) => disc(cx, cy, 2400)
const dots = (from = 0) => Object.fromEntries([0, 1, 2, 3, 4].filter((i) => i >= from).map((i) => [`ir${i}`, PAL(i)]))
const ALL_BIG = { ir0: BIG(530, 730), ir1: BIG(1650, 148), ir2: BIG(1700, 148), ir3: BIG(1750, 148), ir4: BIG(1800, 148) }

// ── feature icons: a rounded square and one simple glyph inside ──
const icn = (n: number, x: number, y: number, s: number, fillIc: string, fillGl: string, extra: Partial<Place> = {}): Record<string, Place> => ({
  [`ic${n}`]: { x, y, w: s, h: s, radius: s * 0.26, fill: fillIc, ...extra },
  [`gl${n}`]: { x: x + s * 0.27, y: y + s * 0.27, w: s * 0.46, h: s * 0.46, fill: fillGl, ...(n === 3 ? { radius: s * 0.1 } : {}), ...extra },
})
const GRID = [[110, 340], [470, 340], [830, 340], [110, 670], [470, 670], [830, 670]] as const
const FEATURES = [
  ['Focus Mode', 'Silence everything but the task'],
  ['Smart Plan', 'A day scheduled in seconds'],
  ['Shared Boards', 'Plan together, in real time'],
  ['Insights', 'See where your time goes'],
  ['Offline Sync', 'Works on a plane, syncs on landing'],
  ['Home Widgets', 'Today, one tap from the lock screen'],
] as const

// ── phones: every part is a shape placed in the phone's own units (the phone is 100 wide and 208 tall), so a tilted phone keeps all its parts together ──
type L = [number, number, number, number]
interface Part { id: string; l: L; r?: number; ellipse?: boolean; fill: string; a?: number }
interface PH { cx: number; cy: number; w: number; rot?: number; a?: number }
const CARD = '#FFFFFF'
const common = (acc: string): Part[] => [
  { id: 'ui1', l: [-38, -84, 44, 9], r: 4.5, fill: CARD, a: 0.92 },
  { id: 'ui2', l: [26, -88, 16, 16], ellipse: true, fill: CARD, a: 0.92 },
]
const PARTS: Record<string, Part[]> = {
  p1: [...common(BRAND[0]!),
    { id: 'ui3', l: [-38, -62, 76, 52], r: 10, fill: CARD, a: 0.94 }, { id: 'ui8', l: [-32, -56, 26, 8], r: 4, fill: BRAND[0]! },
    { id: 'ui4', l: [-38, -4, 36, 44], r: 9, fill: CARD, a: 0.94 }, { id: 'ui5', l: [2, -4, 36, 44], r: 9, fill: CARD, a: 0.94 },
    { id: 'ui6', l: [-38, 44, 76, 30], r: 9, fill: CARD, a: 0.94 }, { id: 'ui7', l: [-38, 80, 76, 14], r: 7, fill: BRAND[0]! }],
  p2: [...common(BRAND[1]!),
    { id: 'ui3', l: [-30, -66, 60, 60], ellipse: true, fill: CARD, a: 0.95 }, { id: 'ui8', l: [-18, -54, 36, 36], ellipse: true, fill: BRAND[1]! },
    { id: 'ui4', l: [-38, 8, 76, 22], r: 11, fill: CARD, a: 0.94 }, { id: 'ui5', l: [-38, 34, 76, 22], r: 11, fill: CARD, a: 0.94 },
    { id: 'ui6', l: [-38, 60, 76, 22], r: 11, fill: CARD, a: 0.94 }, { id: 'ui7', l: [-38, 86, 76, 12], r: 6, fill: INK }],
  p3: [...common(BRAND[2]!),
    { id: 'ui3', l: [-38, -66, 76, 38], r: 10, fill: CARD, a: 0.94 }, { id: 'ui8', l: [-32, -60, 30, 8], r: 4, fill: BRAND[2]! },
    { id: 'ui4', l: [-38, -22, 76, 22], r: 9, fill: CARD, a: 0.94 }, { id: 'ui5', l: [-38, 4, 76, 22], r: 9, fill: CARD, a: 0.94 },
    { id: 'ui6', l: [-38, 30, 76, 22], r: 9, fill: CARD, a: 0.94 }, { id: 'ui7', l: [-38, 64, 76, 14], r: 7, fill: BRAND[2]! }],
  p4: [...common(BRAND[3]!),
    { id: 'ui3', l: [-40, -62, 36, 70], r: 9, fill: CARD, a: 0.94 }, { id: 'ui8', l: [-36, -56, 16, 6], r: 3, fill: BRAND[3]! },
    { id: 'ui4', l: [4, -62, 36, 44], r: 9, fill: CARD, a: 0.94 }, { id: 'ui5', l: [-40, 14, 36, 40], r: 9, fill: CARD, a: 0.94 },
    { id: 'ui6', l: [4, -14, 36, 68], r: 9, fill: CARD, a: 0.94 }, { id: 'ui7', l: [-40, 62, 80, 14], r: 7, fill: BRAND[3]! }],
  p5: [...common(BRAND[4]!),
    { id: 'ui3', l: [-38, -66, 76, 74], r: 10, fill: CARD, a: 0.95 },
    { id: 'ui4', l: [-30, -24, 12, 24], r: 4, fill: BRAND[4]! }, { id: 'ui5', l: [-14, -40, 12, 40], r: 4, fill: BRAND[4]! },
    { id: 'ui6', l: [2, -32, 12, 32], r: 4, fill: BRAND[4]! }, { id: 'ui8', l: [18, -48, 12, 48], r: 4, fill: INK },
    { id: 'ui7', l: [-38, 14, 76, 40], r: 10, fill: CARD, a: 0.94 }, { id: 'ui9', l: [-38, 62, 76, 14], r: 7, fill: BRAND[4]! }],
}
const SCREEN: Record<string, ObjDef> = {
  p1: { kind: 'image', art: 'spot-wall1.webp', alt: 'A soft indigo and violet wallpaper' },
  p2: { kind: 'image', art: 'spot-wall2.webp', alt: 'A soft tangerine and peach wallpaper' },
  p3: { kind: 'image', art: 'spot-wall3.webp', alt: 'A soft emerald and mint wallpaper' },
  p4: { kind: 'shape', gradient: { from: '#FFC2DA', to: '#F43F8E', angle: 160 } },
  p5: { kind: 'shape', gradient: { from: '#B5E4FF', to: '#1CA7FF', angle: 160 } },
}
const phone = (k: string, p: PH, ov: Record<string, L> = {}): Record<string, Place> => {
  const u = p.w / 100, th = ((p.rot ?? 0) * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th)
  const out: Record<string, Place> = {}
  const put = (id: string, l: L, r: number | undefined, a: number | undefined) => {
    const lx = (l[0] + l[2] / 2) * u, ly = (l[1] + l[3] / 2) * u, w = l[2] * u, h = l[3] * u
    const cx = p.cx + lx * cos - ly * sin, cy = p.cy + lx * sin + ly * cos
    out[`${k}${id}`] = { x: cx - w / 2, y: cy - h / 2, w, h, rot: p.rot ?? 0, a: (p.a ?? 1) * (a ?? 1), ...(r ? { radius: r * u } : {}) }
  }
  put('b', [-50, -104, 100, 208], 15, 1)
  put('s', [-46, -100, 92, 200], 12, 1)
  put('n', [-11, -96, 22, 6], 3, 1)
  for (const part of PARTS[k]!) put(part.id, ov[part.id] ?? part.l, part.ellipse ? undefined : part.r, part.a)
  return out
}
// the carousel slots: centre (large, in focus), left and right (smaller, tilted), and the two places off the slide
const CS: PH = { cx: 1380, cy: 570, w: 400 }
const LS: PH = { cx: 985, cy: 610, w: 290, rot: -6 }
const RS: PH = { cx: 1730, cy: 610, w: 290, rot: 6 }
const OLS: PH = { cx: -240, cy: 610, w: 290, rot: -14, a: 0 }
const ORS: PH = { cx: 2160, cy: 610, w: 290, rot: 14, a: 0 }
const hid = (p: PH): PH => ({ ...p, a: 0 })

const phoneObjects = (): Record<string, ObjDef> => {
  const o: Record<string, ObjDef> = {}
  for (const k of Object.keys(PARTS)) {
    o[`${k}b`] = { kind: 'shape', fill: INK }
    o[`${k}s`] = SCREEN[k]!
    o[`${k}n`] = { kind: 'shape', fill: INK }
    for (const part of PARTS[k]!) o[`${k}${part.id}`] = { kind: 'shape', ...(part.ellipse ? { shape: 'ellipse' as const } : {}), fill: part.fill }
  }
  return o
}
const phoneOrder = Object.keys(PARTS).flatMap((k) => ['b', 's', 'n', ...PARTS[k]!.map((p) => p.id)].map((id) => `${k}${id}`))

// ── QR squares: nine by nine modules in a white card; loose confetti dots along the bottom one scene earlier ──
const QM = 44, QX = 1272, QY = 282
const inFinder = (r: number, c: number) => (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3)
const MODULES: [number, number][] = []
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!inFinder(r, c) && (r * 3 + c * 5 + r * c * 2) % 7 < 3) MODULES.push([r, c])
const FINDERS: [number, number][] = [[0, 0], [0, 6], [6, 0]]
let seed = 7
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const SCATTER = MODULES.map(() => [130 + rnd() * 1640, 996 + rnd() * 34] as const)
const SCATTER_COLORS = [...BRAND, IC[2]!, IC[0]!]

const OBJ: Record<string, ObjDef> = {
  mesh: { kind: 'image', art: 'spot-mesh.webp', alt: 'A soft pastel mesh gradient' },
  wipe: { kind: 'shape', fill: '#FFFFFF' },
  ...Object.fromEntries(BRAND.map((c, i) => [`ir${i}`, { kind: 'shape', shape: 'ellipse', fill: c } as ObjDef])),
  ...phoneObjects(),
  div: { kind: 'shape', radius: 4, fill: INK }, hd: { kind: 'shape', shape: 'ellipse', fill: '#FFFFFF', stroke: INK, strokeW: 8 },
  ...Object.fromEntries([1, 2, 3, 4].flatMap((n) => [[`bf${n}`, { kind: 'shape', radius: 28, fill: ['#FFE1D2', '#E1E5FF', '#D6F6E8', '#FFDDEA'][n - 1]! } as ObjDef], [`nf${n}`, { kind: 'text', text: '', px: 26, weight: 600, color: INK, align: 'ctr', lh: 1.2, anchor: 'ctr' } as ObjDef]])),
  qrCard: { kind: 'shape', radius: 48, fill: '#FFFFFF', park: 'b' },
  ...Object.fromEntries(MODULES.map((_, i) => [`qm${i}`, { kind: 'shape', radius: 8, fill: INK } as ObjDef])),
  ...Object.fromEntries(FINDERS.flatMap((_, i) => [[`qo${i}`, { kind: 'shape', radius: 14, fill: INK } as ObjDef], [`qi${i}`, { kind: 'shape', radius: 8, fill: '#FFFFFF' } as ObjDef], [`qc${i}`, { kind: 'shape', radius: 6, fill: INK } as ObjDef]])),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => {
    const park = n <= 4 ? ('l' as const) : undefined
    return [[`ic${n}`, { kind: 'shape', fill: IC[n - 1]!, ...(park ? { park } : {}) } as ObjDef], [`gl${n}`, { kind: 'shape', fill: '#FFFFFF', ...(park ? { park } : {}), ...(n === 1 ? { shape: 'ring' as const } : n === 2 ? { poly: [[0.5, 0], [0.62, 0.38], [1, 0.5], [0.62, 0.62], [0.5, 1], [0.38, 0.62], [0, 0.5], [0.38, 0.38]] } : n === 3 ? {} : n === 4 ? { shape: 'triangle' as const } : n === 5 ? { shape: 'chevron' as const } : { shape: 'ellipse' as const }) } as ObjDef]]
  })),
  app: { kind: 'image', art: 'spot-app.webp', alt: 'A floating indigo app icon with a white checkmark', park: 't' },
  bolt: { kind: 'image', art: 'spot-bolt.webp', alt: 'A floating tangerine lightning bolt', park: 't' },
  chip: { kind: 'shape', radius: 34, fill: INK, park: 'b' },
  bd1: { kind: 'shape', radius: 30, fill: INK }, bd2: { kind: 'shape', radius: 30, fill: INK },
  bg1: { kind: 'shape', shape: 'ellipse', fill: '#FFFFFF' }, bg2: { kind: 'shape', shape: 'ellipse', fill: '#FFFFFF' },
  bm1: { kind: 'shape', shape: 'triangle', fill: INK }, bm2: { kind: 'shape', shape: 'triangle', fill: INK },
  // text
  brand: { kind: 'text', text: 'TEMPO', px: 24, weight: 800, color: INK, face: 'heading', caps: true, spc: 6 },
  page: { kind: 'text', text: 'Release 4.0  ·  Keynote', px: 22, weight: 500, color: '#475569', align: 'r' },
  k: { kind: 'text', text: '', px: 26, weight: 700, color: '#475569', caps: true, spc: 4 },
  title: { kind: 'text', text: '', px: 76, weight: 800, color: INK, face: 'heading', lh: 1.04, spc: -1.5 },
  body: { kind: 'text', text: '', px: 32, weight: 500, color: '#475569', lh: 1.45 },
  af: { kind: 'text', text: '', px: 28, weight: 500, color: '#475569', lh: 1.4 },
  chipT: { kind: 'text', text: '', px: 28, weight: 600, color: '#FFFFFF', align: 'ctr', park: 'b' },
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => [[`lb${n}`, { kind: 'text', text: '', px: 36, weight: 700, color: INK, face: 'heading', lh: 1.1 } as ObjDef], [`ls${n}`, { kind: 'text', text: '', px: 26, weight: 500, color: '#475569', lh: 1.35 } as ObjDef]])),
  ...Object.fromEntries([1, 2, 3].flatMap((n) => [[`st${n}`, { kind: 'text', text: '', px: 150, weight: 800, color: INK, face: 'heading', lh: 1, spc: -5 } as ObjDef], [`sl${n}`, { kind: 'text', text: '', px: 28, weight: 500, color: INK, lh: 1.4 } as ObjDef], [`pl${n}`, { kind: 'text', text: '', px: 28, weight: 700, color: INK, caps: true, spc: 4 } as ObjDef], [`gt${n}`, { kind: 'text', text: '', px: 30, weight: 600, color: INK, anchor: 'ctr' } as ObjDef]])),
  gtB: { kind: 'text', text: '', px: 30, weight: 600, color: '#FFFFFF', align: 'ctr', anchor: 'ctr' }, gtC: { kind: 'text', text: '', px: 26, weight: 700, color: INK, align: 'ctr', anchor: 'ctr' },
  tg1: { kind: 'text', text: '', px: 26, weight: 700, color: '#475569', caps: true, spc: 4 }, tg2: { kind: 'text', text: '', px: 26, weight: 700, color: IC[4]!, caps: true, spc: 4 },
  bt1: { kind: 'text', text: 'Get it on iOS', px: 32, weight: 700, color: '#FFFFFF', face: 'heading', anchor: 'ctr' }, bt2: { kind: 'text', text: 'Get it on Android', px: 32, weight: 700, color: '#FFFFFF', face: 'heading', anchor: 'ctr' },
  url: { kind: 'text', text: '', px: 36, weight: 700, color: '#FFFFFF', face: 'heading' },
}

const ORDER = ['mesh', 'wipe', 'ir0', 'ir1', 'ir2', 'ir3', 'ir4', ...phoneOrder, 'div', 'hd', 'bf1', 'bf2', 'bf3', 'bf4', 'nf1', 'nf2', 'nf3', 'nf4', 'qrCard', ...MODULES.map((_, i) => `qm${i}`),
  ...FINDERS.flatMap((_, i) => [`qo${i}`, `qi${i}`, `qc${i}`]), ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`ic${n}`, `gl${n}`]), 'app', 'bolt', 'chip', 'bd1', 'bd2', 'bg1', 'bg2', 'bm1', 'bm2',
  'brand', 'page', 'k', 'title', 'body', 'af', 'chipT', ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`lb${n}`, `ls${n}`]), ...[1, 2, 3].flatMap((n) => [`st${n}`, `sl${n}`, `pl${n}`, `gt${n}`]), 'gtB', 'gtC', 'tg1', 'tg2', 'bt1', 'bt2', 'url']

// store badges (built from shapes: a dark pill, a white disc with a small triangle, and words)
const badges = (y: number, a = 1): Record<string, Place> => ({
  bd1: rect(110, y, 400, 96, { a }), bd2: rect(540, y, 440, 96, { a }),
  bg1: rect(142, y + 24, 48, 48, { a }), bg2: rect(572, y + 24, 48, 48, { a }), bm1: rect(155, y + 36, 24, 24, { rot: 90, a }), bm2: rect(585, y + 36, 24, 24, { rot: 90, a }),
  bt1: rect(208, y + 24, 290, 48, { a }), bt2: rect(638, y + 24, 330, 48, { a }),
})
/** the left-hand text column of a feature spotlight and its badge icon */
const spot = (n: number, tc: Tc, o: { k: string; title: string; body: string; chip: string }): Record<string, Place> => {
  const cw = Math.ceil(o.chip.length * 16 + 90)
  return {
    ...icn(n, 110, 150, 104, '#FFFFFF', IC[n - 1]!),
    k: X(rect(110, 292, 700, 34), o.k, { color: tc.s }), title: X(rect(110, 340, 720, 180), o.title, { color: tc.i, px: 76 }), body: X(rect(110, 555, 650, 170), o.body, { color: tc.s, px: 32 }),
    chip: rect(110, 800, cw, 68), chipT: rect(110, 811, cw, 46, { text: o.chip }),
  }
}

export const LAUNCH_SPOTLIGHT = authored(
  {
    id: 'launch-spotlight', category: 'launch', name: 'Feature Spotlight', tagline: 'Every new feature gets its own spotlight',
    description: 'A bright app-release keynote: colour irises grow from a dot to fill the slide, a carousel of phones pushes one step at a time, feature icons travel from a grid into a list, and a card on the phone zooms up into the feature detail. Cover, overview, four spotlights, before and after, numbers, pricing with store badges and a QR closing.',
    audience: 'The Feature Spotlight template suits app launches, feature announcements, product updates and release notes, SaaS and mobile product tours, customer-facing launch events, internal release reviews and any talk that walks an audience through what is new.',
    topics: ['app launch', 'feature release', 'product update', 'release notes', 'software launch', 'mobile app', 'saas product launch', 'feature announcement', 'product tour', 'new version', 'whats new', 'app release', 'product launch', 'productivity app', 'roadmap update', 'changelog', 'user interface', 'startup'],
    fonts: { heading: 'Outfit', body: 'Inter' },
    colors: { background: '#FFFFFF', surface: GREY, textPrimary: INK, textSecondary: '#475569', primary: '#5B5BFF', secondary: '#FF7A1A', accent: '#12B886', onPrimary: '#FFFFFF' },
    background: '#FFFFFF',
  },
  {
    objects: OBJ,
    order: ORDER,
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The opening: a huge app name on white with a phone half-rising from the bottom and the five colour dots waiting in the corner.', bg: '#FFFFFF',
        place: {
          mesh: full(), ...dots(), ...chrome(LIGHT),
          ...phone('p1', { cx: 1380, cy: 1010, w: 480 }), ...phone('p2', { cx: 1810, cy: 1150, w: 340, rot: 9 }),
          app: rect(1010, 290, 240, 240, { rot: -14 }),
          k: X(rect(110, 236, 700, 36), 'VERSION 4.0  ·  NOW AVAILABLE', { color: LIGHT.s }), title: X(rect(110, 285, 960, 270), 'Tempo', { px: 240, color: INK }),
          body: X(rect(110, 575, 720, 190), 'The calm, fast way to plan your day. Meet Focus Mode, Smart Plan and Shared Boards.', { color: LIGHT.s, px: 36 }), ...badges(860),
        },
      },
      {
        id: 's2', title: 'Overview', purpose: 'Six feature icons settle into a grid on cool grey while the phone lifts to the right and the indigo dot swells into a halo under one icon.', bg: GREY,
        place: {
          mesh: at(rect(-200, -120, 2320, 1320), { a: 0.5 }), ...dots(1), ir0: at(disc(530, 730, 120), { a: 0.16 }), ...chrome(LIGHT),
          ...phone('p1', { cx: 1540, cy: 560, w: 380 }), ...phone('p2', { cx: 1890, cy: 620, w: 300, rot: 8 }),
          ...Object.assign({}, ...GRID.map(([x, y], i) => icn(i + 1, x, y, 120, IC[i]!, '#FFFFFF'))),
          ...Object.fromEntries(GRID.flatMap(([x, y], i) => [[`lb${i + 1}`, X(rect(x, y + 142, 330, 46), FEATURES[i]![0], { color: INK })], [`ls${i + 1}`, X(rect(x, y + 192, 300, 76), FEATURES[i]![1], { color: LIGHT.s })]])),
          k: X(rect(110, 135, 700, 34), 'WHAT IS INSIDE', { color: LIGHT.s }), title: X(rect(110, 180, 1200, 100), 'Six upgrades in one release', { color: INK, px: 72 }),
        },
      },
      {
        id: 's3', title: 'What is new', purpose: 'The indigo iris swells from the Offline Sync icon until it is the whole page; the icons line up as a list beside the first phone.', bg: '#5B5BFF',
        place: {
          ...ALL_BIG_FROM(0), ...chrome(ON_INDIGO),
          ...phone('p1', CS), ...phone('p2', RS), ...phone('p3', ORS),
          ...Object.assign({}, ...IC.map((c, i) => icn(i + 1, 110, 290 + i * 105, 80, '#FFFFFF', c))),
          ...Object.fromEntries(FEATURES.flatMap(([a, b], i) => [[`lb${i + 1}`, X(rect(222, 288 + i * 105, 560, 44), a, { color: ON_INDIGO.i })], [`ls${i + 1}`, X(rect(222, 330 + i * 105, 560, 40), b, { color: ON_INDIGO.s })]])),
          k: X(rect(110, 135, 700, 34), 'RELEASE 4.0', { color: ON_INDIGO.s }), title: X(rect(110, 180, 1000, 100), 'What is new in Tempo', { color: ON_INDIGO.i, px: 72 }),
        },
      },
      {
        id: 's4', title: 'Focus Mode', purpose: 'A tangerine iris grows from the corner dot, the carousel pushes one step so the Focus phone is in the middle, and the Focus icon becomes the badge above the headline.', bg: '#FF7A1A',
        place: {
          ...ALL_BIG_FROM(1), ...chrome(ON_TANGERINE), ...phone('p1', LS), ...phone('p2', CS), ...phone('p3', RS), ...phone('p4', ORS),
          ...spot(1, ON_TANGERINE, { k: 'FEATURE 1  ·  FOCUS MODE', title: 'Deep work,\nprotected.', body: 'Mute chats, hide the noise and set a timer. Focus Mode keeps one task on screen until it is done.', chip: 'Included in every plan' }),
          bolt: rect(600, 770, 200, 200, { rot: 12 }),
        },
      },
      {
        id: 's5', title: 'Smart Plan', purpose: 'The emerald iris takes over and the carousel pushes again, with the Smart Plan phone in the centre.', bg: '#12B886',
        place: {
          ...ALL_BIG_FROM(2), ...chrome(ON_EMERALD), ...phone('p1', OLS), ...phone('p2', LS), ...phone('p3', CS), ...phone('p4', RS), ...phone('p5', ORS),
          ...spot(2, ON_EMERALD, { k: 'FEATURE 2  ·  SMART PLAN', title: 'Your day,\nplanned for you.', body: 'Tell Tempo what matters this week. It builds a realistic schedule around your meetings and your energy.', chip: 'Powered by on-device AI' }),
        },
      },
      {
        id: 's6', title: 'Plan in detail', purpose: 'The schedule card on the phone grows until it fills the slide, and the phone\'s own rows spread out into a timeline.', bg: '#12B886',
        place: {
          ...ALL_BIG_FROM(2), ...chrome(ON_EMERALD), ...phone('p2', hid(LS)), ...phone('p4', hid(RS)), ...phone('p5', hid(ORS)),
          ...phone('p3', hid(CS)),
          p3ui3: rect(80, 140, 1760, 870, { radius: 56, a: 1 }),
          p3ui1: rect(150, 418, 1500, 6, { radius: 3, fill: '#E2E8F0', a: 1 }), p3ui2: rect(1650, 170, 100, 100, { fill: '#D8F7EA', a: 1 }),
          p3ui4: rect(150, 480, 700, 84, { radius: 42, fill: '#D8F7EA', a: 1 }), p3ui5: rect(480, 600, 860, 84, { radius: 42, fill: '#12B886', a: 1 }), p3ui6: rect(900, 720, 780, 84, { radius: 42, fill: '#D8F7EA', a: 1 }),
          p3ui7: rect(150, 860, 330, 84, { radius: 42, fill: INK, a: 1 }), p3ui8: rect(1290, 196, 330, 60, { radius: 30, fill: '#12B886', a: 1 }),
          ...icn(2, 150, 180, 92, '#12B886', '#FFFFFF'),
          k: X(rect(270, 205, 760, 34), 'SMART PLAN  ·  A CLOSER LOOK', { color: LIGHT.s }), title: X(rect(150, 300, 1400, 100), 'Your week, planned in seconds.', { color: INK, px: 72 }),
          body: X(rect(1000, 850, 760, 110), 'Drag any block to reschedule. Tempo re-balances the rest of the week for you.', { color: LIGHT.s, px: 30 }),
          gt1: X(rect(190, 497, 620, 50), 'Design review  ·  9:00'), gt2: X(rect(520, 617, 780, 50), 'Deep work  ·  10:30'), gt3: X(rect(940, 737, 700, 50), 'Sync with Priya  ·  14:00'),
          gtB: rect(150, 879, 330, 46, { text: 'Accept plan' }), gtC: rect(1290, 209, 330, 34, { text: 'Auto-scheduled' }),
        },
      },
      {
        id: 's7', title: 'Shared Boards', purpose: 'The rose iris grows, the schedule card shrinks back into its phone, and the carousel moves so the Boards phone leads.', bg: '#F43F8E',
        place: {
          ...ALL_BIG_FROM(3), ...chrome(ON_ROSE), ...phone('p3', LS), ...phone('p4', CS), ...phone('p5', RS),
          ...spot(3, ON_ROSE, { k: 'FEATURE 3  ·  SHARED BOARDS', title: 'Plan together,\nlive.', body: 'Invite your team to a board, assign cards and watch every update land in real time, on any device.', chip: 'Up to 50 people free' }),
        },
      },
      {
        id: 's8', title: 'Insights', purpose: 'The sky iris is the last to grow; the Insights phone is in the middle and its chart bars rise taller than before.', bg: '#1CA7FF',
        place: {
          ...ALL_BIG_FROM(4), ...chrome(ON_SKY), ...phone('p3', OLS), ...phone('p4', LS),
          ...phone('p5', CS, { ui4: [-30, -36, 12, 36], ui5: [-14, -56, 12, 56], ui6: [2, -28, 12, 28], ui8: [18, -62, 12, 62] }),
          ...spot(4, ON_SKY, { k: 'FEATURE 4  ·  INSIGHTS', title: 'See where your\ntime goes.', body: 'Weekly reports show your focus hours, meetings and trends, so you can protect the work that counts.', chip: 'New weekly report' }),
          wipe: rect(1960, 0, 920, H), div: rect(1960, 0, 8, H), hd: rect(1990, 508, 64, 64),
          bf1: rect(-880, 620, 360, 130, { rot: -6 }), bf2: rect(-640, 700, 360, 130, { rot: 5 }), bf3: rect(-830, 800, 360, 130, { rot: 4 }), bf4: rect(-560, 850, 360, 130, { rot: -5 }),
          nf1: rect(-860, 665, 320, 40, { rot: -6 }), nf2: rect(-620, 745, 320, 40, { rot: 5 }), nf3: rect(-810, 845, 320, 40, { rot: 4 }), nf4: rect(-540, 895, 320, 40, { rot: -5 }),
        },
      },
      {
        id: 's9', title: 'Before and after', purpose: 'Every iris shrinks back to a dot; a divider slides in from the right and reveals the calm After on white, against a heap of notifications on grey.', bg: GREY,
        place: {
          ...dots(), ...chrome(LIGHT), ...phone('p4', hid(OLS)), ...phone('p5', { cx: 1570, cy: 570, w: 400 }),
          wipe: rect(1000, 0, 920, H), div: rect(996, 0, 8, H), hd: rect(968, 508, 64, 64),
          k: X(rect(110, 150, 700, 34), 'BEFORE AND AFTER', { color: LIGHT.s }), title: X(rect(110, 195, 800, 170), 'From 14 tabs\nto one calm view.', { color: INK, px: 72 }),
          body: X(rect(110, 395, 740, 100), 'Tasks, notes and chat in one screen.', { color: LIGHT.s, px: 32 }),
          tg1: rect(110, 540, 300, 34, { text: 'BEFORE' }), tg2: rect(1062, 470, 280, 34, { text: 'AFTER' }), af: rect(1062, 520, 290, 130, { text: 'One calm view for tasks, notes and chat.' }),
          bf1: rect(110, 620, 360, 130, { rot: -6 }), bf2: rect(350, 700, 360, 130, { rot: 5 }), bf3: rect(160, 800, 360, 130, { rot: 4 }), bf4: rect(440, 850, 360, 130, { rot: -5 }),
          nf1: rect(130, 665, 320, 40, { rot: -6, text: '3 new mentions' }), nf2: rect(370, 745, 320, 40, { rot: 5, text: 'Standup in 5 min' }), nf3: rect(180, 845, 320, 40, { rot: 4, text: '42 unread messages' }), nf4: rect(460, 895, 320, 40, { rot: -5, text: 'Sync failed. Retry?' }),
        },
      },
      {
        id: 's10', title: 'Numbers', purpose: 'The divider slides off to the left leaving white; three icons grow into big stat cards for users, rating and speed (sample figures).', bg: GREY,
        place: {
          ...dots(), ...chrome(LIGHT), ...phone('p5', hid({ cx: 1570, cy: 570, w: 400 })),
          wipe: full(), div: rect(-60, 0, 8, H), hd: rect(-90, 508, 64, 64),
          k: X(rect(110, 150, 900, 34), 'BY THE NUMBERS  ·  SAMPLE FIGURES', { color: LIGHT.s }), title: X(rect(110, 195, 1500, 100), 'Fast, loved and growing.', { color: INK, px: 72 }),
          ...statCards(['#FF7A1A', '#12B886', '#F43F8E'], [INK, INK, INK], [INK, INK, INK], 330, 600, 'stat'),
          ...Object.fromEntries([0, 1, 2].flatMap((i) => [[`st${i + 1}`, X(rect(164 + i * 570, 560, 460, 170), ['2.4M', '4.8', '0.3s'][i]!, { color: INK, px: 150 })], [`sl${i + 1}`, X(rect(164 + i * 570, 750, 450, 130), ['people plan with Tempo every week', 'average rating across 120k reviews', 'to open, even on a three-year-old phone'][i]!, { color: INK, px: 28 })]])),
          bolt: rect(1660, 245, 190, 190, { rot: 15 }),
        },
      },
      {
        id: 's11', title: 'Availability and pricing', purpose: 'The stat cards shrink into three price cards, the store badges slide up, and loose squares gather along the bottom edge.', bg: GREY,
        place: {
          ...dots(), ...chrome(LIGHT), wipe: full(),
          k: X(rect(110, 150, 900, 34), 'AVAILABILITY AND PRICING', { color: LIGHT.s }), title: X(rect(110, 195, 1500, 100), 'Free to start. Yours today.', { color: INK, px: 72 }),
          ...statCards([GREY, '#5B5BFF', GREY], [INK, '#FFFFFF', INK], [INK, '#FFFFFF', INK], 330, 450, 'price'),
          ...Object.fromEntries([0, 1, 2].flatMap((i) => [
            [`pl${i + 1}`, rect(164 + i * 570 + 90, 330 + 56, 360, 40, { text: ['FREE', 'PRO', 'TEAM'][i]!, color: i === 1 ? '#FFFFFF' : INK })],
            [`st${i + 1}`, X(rect(164 + i * 570, 330 + 140, 460, 130), ['$0', '$6', '$12'][i]!, { color: i === 1 ? '#FFFFFF' : INK, px: 110 })],
            [`sl${i + 1}`, X(rect(164 + i * 570, 330 + 280, 450, 130), ['Focus Mode, Smart Plan and boards for one person.', 'per month. Unlimited plans, insights and offline sync.', 'per person. Shared workspaces, roles and priority support.'][i]!, { color: i === 1 ? '#FFFFFF' : INK, px: 28 })],
          ])),
          ...badges(830), body: X(rect(1010, 846, 790, 90), 'Available today on iOS 16 and Android 10 or newer, in 12 languages.', { color: LIGHT.s, px: 30 }),
          qrCard: rect(1190, 1200, 560, 560),
          ...Object.fromEntries(MODULES.flatMap((_, i) => [[`qm${i}`, rect(SCATTER[i]![0], SCATTER[i]![1], 24, 24, { fill: SCATTER_COLORS[i % SCATTER_COLORS.length]!, a: 0.6, rot: (i * 37) % 60 - 30 })]])),
          ...Object.fromEntries(FINDERS.flatMap((_, i) => { const x = 520 + i * 440, y = 992; return [[`qo${i}`, rect(x, y, 40, 40, { a: 0.4 })], [`qi${i}`, rect(x + 9, y + 9, 22, 22, { a: 0.4 })], [`qc${i}`, rect(x + 15, y + 15, 10, 10, { a: 0.4 })]] })),
          app: rect(1190, -300, 220, 220),
        },
      },
      {
        id: 's12', title: 'Closing', purpose: 'The indigo iris returns and fills the page, the loose squares assemble into a QR code on a white card, and the app icon lands on its corner.', bg: '#5B5BFF',
        place: {
          ...dots(1), ir0: BIG(1600, 148), ...chrome(ON_INDIGO),
          k: X(rect(110, 230, 760, 36), 'TEMPO 4.0 IS LIVE', { color: ON_INDIGO.s }), title: X(rect(110, 280, 900, 270), 'Get Tempo\ntoday.', { color: ON_INDIGO.i, px: 120 }),
          body: X(rect(110, 590, 760, 160), 'Scan the code to download, or search for Tempo in your app store.', { color: ON_INDIGO.s, px: 34 }), ...badges(830),
          qrCard: rect(1190, 200, 560, 560),
          ...Object.fromEntries(MODULES.map(([r, c], i) => [`qm${i}`, rect(QX + c * QM + 3, QY + r * QM + 3, QM - 6, QM - 6, { fill: INK, a: 1 })])),
          ...Object.fromEntries(FINDERS.flatMap(([r, c], i) => { const x = QX + c * QM, y = QY + r * QM; return [[`qo${i}`, rect(x, y, QM * 3, QM * 3)], [`qi${i}`, rect(x + 22, y + 22, QM * 3 - 44, QM * 3 - 44)], [`qc${i}`, rect(x + 44, y + 44, 44, 44)]] })),
          url: X(rect(1190, 800, 420, 50), 'tempo.app/get'), app: rect(1640, 690, 220, 220, { rot: 12 }),
        },
      },
    ],
  },
)

/** the irises at the end of scene `upto` (0 = indigo only ... 4 = all grown) with the rest waiting as dots */
function ALL_BIG_FROM(upto: number): Record<string, Place> {
  const big = [ALL_BIG.ir0, ALL_BIG.ir1, ALL_BIG.ir2, ALL_BIG.ir3, ALL_BIG.ir4]
  return Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`ir${i}`, i <= upto ? big[i]! : PAL(i)]))
}
/** the three icons as three big rounded cards in a row, each with its glyph in the top-left corner */
function statCards(fills: string[], glyphFills: string[], _t: string[], y: number, h: number, kind: 'stat' | 'price'): Record<string, Place> {
  void _t
  return Object.assign({}, ...[0, 1, 2].map((i) => {
    const x = 120 + i * 570
    return {
      [`ic${i + 1}`]: { x, y, w: 540, h, radius: 44, fill: fills[i]! },
      [`gl${i + 1}`]: { x: x + 44, y: y + 44, w: kind === 'stat' ? 72 : 56, h: kind === 'stat' ? 72 : 56, fill: glyphFills[i]!, ...(i === 2 ? { radius: 8 } : {}) },
    }
  }))
}
void W
