import { authored, at, rect, W, H } from '../author'
import type { ObjDef, Place, TextObj } from '../author'

/**
 * Circuit: an engineering terminal. One board of small square components and thin traces (0, 90 and 45 degrees, with vias at the joints) re-routes from scene to scene: the same rects change
 * length, position and angle, components slide to new pads, and the traces that carry the story pulse bright. A central chip (a body, a die and pin rows made of small rects) is the hero:
 * it travels, then zooms through until its die is the background of one scene, then shrinks back onto the board. A boot log types and scrolls up a line per scene, progress bars fill and a
 * square wave changes frequency. Original choreography for SlidesDone.
 */
const C = { bg: '#050A07', panel: '#0A150E', G: '#3DFF8B', dim: '#1E7A44', amb: '#FFB000', ink: '#D9F5E3', mute: '#8DB5A0', off: '#0C1A12', mid: '#123824', pin: '#2BA862', dark: '#04120A' }
type Pt = [number, number]
type Seg = [number, number, number, number]
const NT = 28, NV = 18, NC = 10, NW = 20, NP = 28, RING = 12

// ── traces: polylines at 0, 90 and 45 degrees, laid out as thin rotated rects ──
const legs = (a: Pt, b: Pt): Seg[] => {
  const dx = b[0] - a[0], dy = b[1] - a[1], ax = Math.abs(dx), ay = Math.abs(dy)
  if (ax < 0.5 || ay < 0.5 || Math.abs(ax - ay) < 0.5) return [[a[0], a[1], b[0], b[1]]]
  if (ax > ay) { const mx = a[0] + Math.sign(dx) * (ax - ay); return [[a[0], a[1], mx, a[1]], [mx, a[1], b[0], b[1]]] }
  const my = a[1] + Math.sign(dy) * (ay - ax)
  return [[a[0], a[1], a[0], my], [a[0], my, b[0], b[1]]]
}
const segPlace = (s: Seg, th: number, extra: Partial<Place> = {}): Place => {
  const len = Math.hypot(s[2] - s[0], s[3] - s[1])
  let deg = (Math.atan2(s[3] - s[1], s[2] - s[0]) * 180) / Math.PI
  if (deg > 90) deg -= 180
  if (deg <= -90) deg += 180
  return { x: (s[0] + s[2]) / 2 - len / 2, y: (s[1] + s[3]) / 2 - th / 2, w: len, h: th, rot: Math.round(deg * 100) / 100, ...extra }
}
interface Route { pts: Pt[]; hot?: boolean | 'a' }
const hotColor = (h: Route['hot']) => (h === 'a' ? C.amb : h ? C.G : C.dim)
/** the traces and vias of one scene; the pool objects that are not needed pull back into the net and fade */
function net(routes: Route[], o: { th?: number; vias?: boolean; via?: number } = {}): Record<string, Place> {
  const th = o.th ?? 4, out: Record<string, Place> = {}
  let ti = 0, last: Seg = [W / 2, H / 2, W / 2, H / 2]
  const vs: Array<[number, number, string]> = []
  for (const r of routes) {
    for (let k = 0; k < r.pts.length - 1; k++) for (const s of legs(r.pts[k]!, r.pts[k + 1]!)) {
      if (ti >= NT) throw new Error('tech-circuit: too many trace segments')
      out[`t${++ti}`] = segPlace(s, r.hot ? th + 2 : th, { fill: hotColor(r.hot) }); last = s
    }
    for (const p of r.pts) if (p[0] > 20 && p[0] < W - 20 && p[1] > 20 && p[1] < H - 20 && !vs.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) < 3)) vs.push([p[0], p[1], hotColor(r.hot)])
  }
  for (let i = ti + 1; i <= NT; i++) out[`t${i}`] = segPlace([last[0], last[1], last[0] + 2, last[1]], th, { a: 0, fill: C.dim })
  const vz = o.via ?? 16
  const useV = o.vias === false ? [] : vs
  if (useV.length > NV) throw new Error('tech-circuit: too many vias')
  useV.forEach((v, i) => { out[`v${i + 1}`] = { x: v[0] - vz / 2, y: v[1] - vz / 2, w: vz, h: vz, fill: v[2] === C.dim ? C.bg : v[2] } })
  for (let i = useV.length + 1; i <= NV; i++) out[`v${i}`] = { x: last[0] - 4, y: last[1] - 4, w: 8, h: 8, a: 0, fill: C.bg }
  return out
}

// ── the chip: body, die, four floorplan tiles and 28 pins, all computed from one box ──
const tip = (p: Place, side: 'l' | 'r' | 't' | 'b', i: number): Pt => {
  const S = p.w, L = 0.1 * S, c = 0.1 * S + (i + 0.5) * ((0.8 * S) / 7)
  return side === 'l' ? [p.x - L, p.y + c] : side === 'r' ? [p.x + S + L, p.y + c] : side === 't' ? [p.x + c, p.y - L] : [p.x + c, p.y + S + L]
}
const chipBox = (cx: number, cy: number, S: number): Place => ({ x: cx - S / 2, y: cy - S / 2, w: S, h: S })
interface HeroOpts { lit?: number; litFill?: string; tiles?: Place[]; tileA?: number; tileFill?: string; imgA?: number; img?: Place; label?: string; labelPx?: number; radius?: number }
function hero(p: Place, o: HeroOpts = {}): Record<string, Place> {
  const S = p.w, L = 0.1 * S, pitch = (0.8 * S) / 7, pw = pitch * 0.5, ov = 0.025 * S
  const die = at(rect(p.x + 0.2 * S, p.y + 0.2 * S, 0.6 * S, 0.6 * S), {})
  const out: Record<string, Place> = {
    hero: at(p, { radius: o.radius ?? S * 0.06 }), die: at(die, { radius: S * 0.03 }), dieimg: at(o.img ?? die, { a: o.imgA ?? 0.55, radius: o.img ? 0 : S * 0.03 }),
    lit: at(die, { a: o.lit ?? 0.12, fill: o.litFill ?? C.G, radius: S * 0.03 }), pm: rect(p.x + 0.05 * S, p.y + 0.05 * S, 0.04 * S, 0.04 * S),
    hl: { ...die, a: o.label ? 1 : 0, text: o.label ?? '', px: o.labelPx ?? 40 },
  }
  const inner = rect(die.x + 0.08 * die.w, die.y + 0.08 * die.w, 0.84 * die.w, 0.84 * die.w), g = 0.05 * die.w, tw = (inner.w - g) / 2
  const tiles = o.tiles ?? [0, 1, 2, 3].map((k) => rect(inner.x + (k % 2) * (tw + g), inner.y + Math.floor(k / 2) * (tw + g), tw, tw))
  tiles.forEach((t, k) => { out[`dt${k + 1}`] = at(t, { a: o.tileA ?? 0.9, radius: Math.max(4, S * 0.012), ...(o.tileFill ? { fill: o.tileFill } : {}) }) })
  let n = 0
  for (const side of ['l', 'r', 't', 'b'] as const) for (let i = 0; i < 7; i++) {
    const t = tip(p, side, i), cx = t[0], cy = t[1]
    out[`pin${++n}`] = side === 'l' ? rect(p.x - L, cy - pw / 2, L + ov, pw) : side === 'r' ? rect(p.x + S - ov, cy - pw / 2, L + ov, pw) : side === 't' ? rect(cx - pw / 2, p.y - L, pw, L + ov) : rect(cx - pw / 2, p.y + S - ov, pw, L + ov)
  }
  return out
}

// ── the chips (components): squares or blocks, each with an optional label ──
interface Comp { x: number; y: number; w: number; h?: number; fill?: string; a?: number; label?: string; px?: number; lc?: string }
function comps(items: Record<number, Comp>): Record<string, Place> {
  const out: Record<string, Place> = {}
  for (const [k, c] of Object.entries(items)) {
    const b = rect(c.x, c.y, c.w, c.h ?? c.w)
    out[`c${k}`] = at(b, { fill: c.fill ?? C.off, ...(c.a !== undefined ? { a: c.a } : {}) })
    if (c.label) out[`cl${k}`] = at(b, { text: c.label, px: c.px ?? 24, color: c.lc ?? C.G })
  }
  return out
}

// ── square wave: 20 pieces (10 flats, 10 edges); `cycles` of 3 to 5 changes the frequency ──
function wave(x: number, y: number, w: number, amp: number, cycles: number, th = 4): Record<string, Place> {
  const out: Record<string, Place> = {}
  const hp = w / (2 * cycles), used = 4 * cycles - 1
  for (let k = 0; k < NW; k++) {
    if (k >= used) { out[`w${k + 1}`] = rect(x + w - 2, y + amp - th / 2, 2, th, { a: 0 }); continue }
    if (k % 2 === 0) { const n = k / 2; out[`w${k + 1}`] = rect(x + n * hp, (n % 2 ? y : y + amp) - th / 2, hp, th) }
    else { const n = (k - 1) / 2; out[`w${k + 1}`] = rect(x + (n + 1) * hp - th / 2, y - th / 2, th, amp + th) }
  }
  return out
}

// ── the boot log: a ring of 12 lines, one line scrolls off the top and a new one types in at the bottom per scene ──
const LOG = [
  '> boot rom v2.3 ............. ok', '> clock tree 48 MHz .......... ok', '> sram self-test 512 KB ...... ok', '> flash map 16 MB ............ ok', '> can bus 500 kbit/s ......... up',
  '> imu offset 0.02 g .......... ok', '> radio 2.4 GHz .............. ok', '> motor driver ............... ok', '> thermal sensor 41 C ........ ok', '> adc reference 3.300 V ...... ok',
  '> watchdog armed 2 s ......... ok', '> firmware 1.8.0 loaded ...... ok', '> selftest 38 of 40 .......... warn', '> retry flash write .......... ok', '> soak test 12 h ............. run',
  '> selftest 40 of 40 .......... ok', '> thermal peak 68 C .......... ok', '> radio range 120 m ........... ok', '> system ready.', '> idle',
]
const RAMP = ['#1E7A44', '#2E9B5A', '#46BA73', '#7BDBA0', C.G]
function logLines(scene: number, panel: { x: number; w: number }, y0: number, n: number, px: number, pitch: number): Record<string, Place> {
  const out: Record<string, Place> = {}
  for (let j = scene - 1; j <= scene + n; j++) {
    const slot = j - scene, vis = slot >= 0 && slot < n
    out[`ll${((j % RING) + RING) % RING}`] = rect(panel.x + 30, y0 + slot * pitch, panel.w - 60, Math.round(px * 1.4), { a: vis ? 1 : 0, text: LOG[j] ?? '', color: RAMP[4 - Math.min(Math.max(n - 1 - slot, 0), 4)]! })
  }
  return out
}

// ── objects ──
const mono = (px: number, color: string, o: Partial<TextObj> = {}): TextObj => ({ kind: 'text', text: '', px, weight: 700, color, face: 'heading', caps: true, spc: 2, ...o })
const sans = (px: number, color: string, o: Partial<TextObj> = {}): TextObj => ({ kind: 'text', text: '', px, weight: 400, color, lh: 1.4, ...o })
const objects: Record<string, ObjDef> = {}
const order: string[] = []
const add = (id: string, d: ObjDef) => { objects[id] = d; order.push(id) }
for (let k = 0; k <= 17; k++) add(`gv${k}`, { kind: 'shape', fill: C.dim })
for (let k = 0; k <= 9; k++) add(`gh${k}`, { kind: 'shape', fill: C.dim })
add('bgp', { kind: 'image', art: 'circuit-board.webp', alt: 'A macro of a circuit board in green light' })
for (let k = 1; k <= 3; k++) add(`hc${k}`, { kind: 'shape', shape: 'ellipse', fill: C.amb })
for (let k = 1; k <= 3; k++) add(`pn${k}`, { kind: 'shape', radius: 14, fill: C.panel, stroke: C.dim, strokeW: 2 })
add('lc', { kind: 'shape', radius: 14, fill: C.panel, stroke: C.dim, strokeW: 2, park: 'b' })
add('heat', { kind: 'shape', radius: 28, gradient: { from: C.G, to: C.amb, angle: 0 } })
for (let k = 1; k <= 8; k++) add(`rs${k}`, { kind: 'shape', radius: 1, fill: C.dim })
for (let k = 1; k <= NP; k++) add(`pin${k}`, { kind: 'shape', radius: 2, fill: C.pin, park: 'r' })
add('hero', { kind: 'shape', gradient: { from: '#10261A', to: '#08130D', angle: 135 }, stroke: C.dim, strokeW: 3, radius: 28, park: 'r' })
add('die', { kind: 'shape', gradient: { from: '#14452A', to: '#0A2315', angle: 135 }, stroke: C.G, strokeW: 2, radius: 14, park: 'r' })
add('dieimg', { kind: 'image', art: 'circuit-board.webp', alt: 'The silicon die, a field of green circuitry', fit: 'cover', park: 'r' })
add('lit', { kind: 'shape', fill: C.G, radius: 14, park: 'r' })
for (let k = 1; k <= 4; k++) add(`dt${k}`, { kind: 'shape', radius: 8, fill: '#0E2D1B', stroke: C.dim, strokeW: 2, park: 'r' })
add('pm', { kind: 'shape', shape: 'ellipse', fill: C.G, park: 'r' })
add('hl', { ...mono(44, C.G, { align: 'ctr', anchor: 'ctr', spc: 3 }), park: 'r' })
for (let k = 1; k <= NT; k++) add(`t${k}`, { kind: 'shape', radius: 3, fill: C.dim })
add('scan', { kind: 'image', art: 'circuit-scan.webp', alt: 'Faint scanlines and a green phosphor glow' })
for (let k = 1; k <= NV; k++) add(`v${k}`, { kind: 'shape', shape: 'ellipse', fill: C.bg, stroke: C.G, strokeW: 3 })
for (let k = 1; k <= 4; k++) add(`bt${k}`, { kind: 'shape', radius: 11, fill: '#0F2218', stroke: C.dim, strokeW: 1 })
for (let k = 1; k <= 4; k++) add(`pf${k}`, { kind: 'shape', radius: 6, fill: C.dim })
for (let k = 1; k <= 4; k++) add(`bf${k}`, { kind: 'shape', radius: 11, fill: C.G })
for (let k = 1; k <= NW; k++) add(`w${k}`, { kind: 'shape', radius: 2, fill: C.G, park: 'b' })
add('mk', { kind: 'shape', shape: 'triangle', fill: C.amb })
add('chipimg', { kind: 'image', art: 'circuit-chip.webp', alt: 'An isometric microchip with gold pins on a slice of green circuit board', fit: 'contain', park: 'l' })
const PARK = ['l', 'r', 'l', 'r', 't', 'b', 't', 'b', 'l', 'r'] as const
for (let k = 1; k <= NC; k++) add(`c${k}`, { kind: 'shape', radius: 6, fill: C.off, stroke: C.dim, strokeW: 2, park: PARK[k - 1]! })
for (let k = 1; k <= NC; k++) add(`cl${k}`, { ...mono(24, C.G, { align: 'ctr', anchor: 'ctr' }), park: PARK[k - 1]! })
for (let k = 1; k <= 8; k++) add(`ar${k}`, { kind: 'shape', shape: 'triangle', fill: C.G })
add('brand', mono(22, C.G, { spc: 4 }))
add('page', mono(22, C.mute, { spc: 3, align: 'r', weight: 400 }))
add('k', mono(24, C.amb, { spc: 4 }))
add('t', mono(64, C.ink, { lh: 1.05, spc: 2 }))
add('b', sans(30, C.mute, { lh: 1.45 }))
add('cap', mono(22, C.mute, { weight: 400, spc: 2 }))
for (let k = 1; k <= 5; k++) { add(`sg${k}`, mono(22, C.amb, { spc: 3, align: 'ctr' })); add(`sh${k}`, sans(34, C.ink, { weight: 600, lh: 1.15, align: 'ctr' })); add(`sd${k}`, sans(26, C.mute, { lh: 1.4, align: 'ctr' })) }
for (let k = 1; k <= 3; k++) add(`rg${k}`, mono(22, C.amb, { spc: 3, align: 'r' }))
add('foot', { ...mono(22, C.mute, { weight: 400, spc: 1, caps: false }), park: 'b' })
for (let k = 1; k <= 6; k++) add(`n${k}`, mono(56, C.G, { lh: 1, spc: 1 }))
for (let k = 1; k <= 6; k++) add(`h${k}`, sans(34, C.ink, { weight: 600, lh: 1.15 }))
for (let k = 1; k <= 6; k++) add(`d${k}`, sans(26, C.mute, { lh: 1.4 }))
for (let k = 1; k <= 5; k++) add(`g${k}`, mono(22, C.amb, { spc: 3 }))
add('colA', sans(30, C.ink, { weight: 600, lh: 2.164 }))
add('colB', sans(30, C.ink, { weight: 400, lh: 2.164 }))
add('colC', sans(30, C.mute, { weight: 400, lh: 2.164 }))
for (let k = 0; k < RING; k++) add(`ll${k}`, { ...mono(24, C.G, { weight: 400, caps: false, spc: 0, lh: 1, anchor: 'ctr' }), park: 'b' })

// ── scene helpers ──
const HEAD = { brand: rect(80, 52, 560, 30, { text: 'KESTREL-9  //  REV C' }), page: rect(1160, 52, 680, 30, { text: 'SAMPLE HARDWARE BRIEFING' }) }
const GRAD = { from: '#050A07', to: '#08130C', angle: 160 }
const grid = (i: number): Record<string, Place> => {
  const out: Record<string, Place> = {}
  for (let k = 0; k <= 17; k++) out[`gv${k}`] = rect(120 * k - 11 * i, 0, 1.5, H, { a: 0.16 })
  for (let k = 0; k <= 9; k++) out[`gh${k}`] = rect(0, 120 * k + 20 - 7 * i, W, 1.5, { a: 0.16 })
  return out
}
const backdrop = (i: number, k = 1.2, a = 0.16): Record<string, Place> => ({
  ...grid(i), bgp: rect(-(k - 1) * 960 - 14 * i, -(k - 1) * 540 - 6 * i, W * k, H * k, { a }), scan: rect(0, 0, W, H, { a: 0.55 }),
})
const foot = (s: string): Place => rect(80, 1008, 1760, 28, { text: s })
const heroP = (cx: number, cy: number, S: number) => chipBox(cx, cy, S)
const bar = (k: number, x: number, y: number, w: number, h: number, frac: number, extra: Partial<Place> = {}): Record<string, Place> => ({ [`bt${k}`]: rect(x, y, w, h, { ...extra }), [`bf${k}`]: rect(x, y, Math.max(h, w * frac), h, { ...extra }) })

// ── the eleven scenes ──
const H1 = heroP(1330, 560, 480)
const T1 = (c: number, hot?: boolean): Route[] => {
  const t = (s: 'l' | 'r' | 't' | 'b', i: number) => tip(H1, s, i)
  const all: Route[] = [
    { pts: [t('r', 2), [W, t('r', 2)[1]]], hot: true }, { pts: [t('r', 4), [W, 780]], hot: true }, { pts: [t('r', 0), [W, 230]], hot: hot ?? false }, { pts: [t('r', 6), [W, 880]], hot: hot ?? false },
    { pts: [t('l', 5), [1000, H]], hot: hot ?? false }, { pts: [t('l', 1), [1000, 0]], hot: hot ?? false }, { pts: [t('t', 5), [t('t', 5)[0], 0]], hot: true }, { pts: [t('t', 2), [1180, 0]], hot: hot ?? false },
  ]
  return all.slice(0, c)
}
const COVER_CHIPS = (fill: string): Record<string, Place> => comps({
  1: { x: 1732, y: 477, w: 56, fill }, 2: { x: 1662, y: 587, w: 56, fill }, 3: { x: 1662, y: 367, w: 56, fill }, 4: { x: 1014, y: 872, w: 56, fill }, 5: { x: 1014, y: 202, w: 56, fill }, 6: { x: 1412, y: 102, w: 56, fill }, 7: { x: 1247, y: 142, w: 56, fill },
})
const cover = (i: number, logAt: number, o: { kick: string; title: string; tpx: number; body: string; boot: string; frac: number; hot: boolean; cycles: number; cap: string; chipFill: string; lit: number }): Record<string, Place> => ({
  ...backdrop(i, 1.2, o.hot ? 0.24 : 0.17), ...net(T1(8, o.hot)), ...hero(H1, { lit: o.lit, imgA: 0.6 }), ...COVER_CHIPS(o.chipFill), ...wave(1100, 892, 740, 56, o.cycles), ...HEAD,
  cap: rect(1100, 962, 740, 28, { text: o.cap }),
  k: rect(80, 190, 820, 30, { text: o.kick }), t: rect(80, 236, 920, 150, { text: o.title, px: o.tpx }), b: rect(80, 410, 820, 100, { text: o.body, px: 30 }),
  g1: rect(80, 540, 820, 30, { text: o.boot }), ...bar(1, 80, 584, 820, 16, o.frac), lc: rect(80, 660, 820, 300), ...logLines(logAt, { x: 80, w: 820 }, 700, 5, 24, 44),
})

const H2 = heroP(1740, 176, 160)
const AGENDA = ['Inside the die', 'System architecture', 'Specifications and performance', 'Power and thermal', 'Roadmap and risks', 'Validation and sign-off']
const s2: Record<string, Place> = {
  ...backdrop(1), ...net([{ pts: [tip(H2, 'l', 3), [1010, tip(H2, 'l', 3)[1]], [1010, H]], hot: true }, { pts: [tip(H2, 'r', 5), [W, tip(H2, 'r', 5)[1] + 40]] }]), ...hero(H2, { lit: 0.12 }),
  ...comps({ 1: { x: 1302, y: 148, w: 56 }, 2: { x: 982, y: 480, w: 56 }, 3: { x: 982, y: 800, w: 56 } }), chipimg: rect(1090, 300, 700, 700), ...HEAD,
  k: rect(80, 120, 820, 30, { text: 'SAMPLE BRIEFING' }), t: rect(80, 160, 900, 80, { text: 'Contents', px: 64 }),
  ...Object.fromEntries(AGENDA.flatMap((a, k) => [[`n${k + 1}`, rect(80, 290 + 76 * k + 2, 90, 50, { text: `0${k + 1}`, px: 34, color: C.amb })], [`h${k + 1}`, rect(180, 290 + 76 * k, 780, 52, { text: a, px: 36 })]])),
  ...Object.fromEntries(AGENDA.map((_, k) => [`rs${k + 1}`, rect(80, 290 + 76 * k + 62, 880, 2, { a: 0.45 })])),
  lc: rect(80, 760, 880, 220), ...logLines(1, { x: 80, w: 880 }, 796, 4, 24, 44),
}

const TL = [rect(80, 250, 868, 338), rect(972, 250, 868, 338), rect(80, 612, 868, 338), rect(972, 612, 868, 338)]
const DIE = [
  ['CORE A  ·  120 MHZ', 'Real-time control', 'Runs the motor loop and sensor fusion on a fixed 1 ms tick.'],
  ['CORE B  ·  120 MHZ', 'Communications', 'Handles CAN, the radio and firmware updates, isolated from Core A.'],
  ['SRAM  ·  512 KB', 'Fast memory', 'Zero-wait-state memory with parity, split into two banks per core.'],
  ['RADIO  ·  2.4 GHZ', 'Wireless link', 'Low-power transceiver with hardware encryption and its own timer.'],
]
const s3: Record<string, Place> = {
  ...backdrop(2, 1.2, 0.04), ...net([{ pts: [[960, 250], [960, 950]], hot: true }, { pts: [[80, 600], [1840, 600]], hot: true }]),
  ...hero(chipBox(960, 540, 3600), { lit: 0, imgA: 0.7, tileA: 0.78, tileFill: C.bg, tiles: TL, radius: 220 }), ...HEAD,
  k: rect(80, 100, 900, 30, { text: 'ZOOM  ·  THE DIE FLOORPLAN' }), t: rect(80, 138, 1200, 80, { text: 'Inside the die', px: 60 }),
  ...Object.fromEntries(DIE.flatMap((d, k) => [[`g${k + 1}`, rect(TL[k]!.x + 40, TL[k]!.y + 34, 780, 30, { text: d[0]! })], [`h${k + 1}`, rect(TL[k]!.x + 40, TL[k]!.y + 84, 780, 54, { text: d[1]!, px: 44 })], [`d${k + 1}`, rect(TL[k]!.x + 40, TL[k]!.y + 156, 760, 120, { text: d[2]!, px: 30 })]])),
  foot: foot('> floorplan loaded: 2 cores, sram, radio_'),
}

const H4 = heroP(960, 540, 280)
const t4 = (s: 'l' | 'r' | 't' | 'b', i: number) => tip(H4, s, i)
const s4: Record<string, Place> = {
  ...backdrop(3), ...net([
    { pts: [[440, 380], t4('l', 0)], hot: true }, { pts: [[440, 570], t4('l', 3)] }, { pts: [[440, 760], t4('l', 6)] },
    { pts: [t4('r', 0), [1480, 380]], hot: true }, { pts: [t4('r', 3), [1480, 570]] }, { pts: [t4('r', 6), [1480, 760]] }, { pts: [[960, 338], t4('t', 3)] }, { pts: [t4('b', 3), [960, 790]] },
  ], { vias: false }),
  ...hero(H4, { lit: 0.1, tileA: 0.25, label: 'MCU', labelPx: 46 }),
  ...comps({
    1: { x: 100, y: 330, w: 340, h: 100, fill: C.mid, label: 'IMU + SENSORS', px: 26 }, 2: { x: 100, y: 520, w: 340, h: 100, label: 'ADC  12 BIT', px: 26 }, 3: { x: 100, y: 710, w: 340, h: 100, label: 'CAN  TRANSCEIVER', px: 26 },
    4: { x: 1480, y: 330, w: 340, h: 100, fill: C.mid, label: 'RADIO 2.4 GHZ', px: 26 }, 5: { x: 1480, y: 520, w: 340, h: 100, label: 'MOTOR DRIVER', px: 26 }, 6: { x: 1480, y: 710, w: 340, h: 100, label: 'STATUS DISPLAY', px: 26 },
    7: { x: 790, y: 248, w: 340, h: 90, label: 'FLASH 16 MB', px: 26 }, 8: { x: 790, y: 790, w: 340, h: 90, label: 'POWER  3V3 / 1V8', px: 26 },
  }),
  ...Object.fromEntries([[0, 444], [3, 540], [6, 636]].map(([i, y], k) => [`ar${k + 1}`, rect(773, y! - 13, 26, 26, { rot: 90 })])),
  ...Object.fromEntries([[0, 444], [3, 540], [6, 636]].map(([, y], k) => [`ar${k + 4}`, rect(1450, [380, 570, 760][k]! - 13, 26, 26, { rot: 90 })])),
  ar7: rect(947, 352, 26, 26, { rot: 180 }), ar8: rect(947, 706, 26, 26, { rot: 0 }), ...HEAD,
  k: rect(80, 100, 900, 30, { text: 'BLOCK DIAGRAM' }), t: rect(80, 138, 1100, 80, { text: 'System architecture', px: 60 }),
  b: rect(80, 925, 1760, 44, { text: 'Sample block diagram. The green path runs from sensors to radio; memory and power attach on the vertical axis.', px: 26 }),
  foot: foot('> route: sensors -> mcu -> radio  (3 buses)_'),
}

const SPEC = [['MCU', 'Dual core, 120 MHz', 'Real-time + comms'], ['Memory', '512 KB RAM, 16 MB flash', 'ECC on RAM'], ['Supply', '9 to 36 V input', 'Polarity protected'], ['I/O', '24 GPIO, 2 CAN, 3 UART', 'All 3.3 V tolerant'],
  ['Radio', '2.4 GHz, 1 Mbit/s', 'Hardware encryption'], ['Power', '1.8 W typical (sample)', 'Sleep mode 40 uA'], ['Size', '62 x 48 mm, 4 layers', 'M3 mounting holes'], ['Temperature', '-40 to 85 C', 'Conformal coating']]
const s5: Record<string, Place> = {
  ...backdrop(4), ...net([{ pts: [[690, 250], [690, 880]], hot: true }, { pts: [[630, 590], [690, 590]], hot: true }]),
  ...comps({ 1: { x: 664, y: 400, w: 52, fill: C.mid }, 2: { x: 664, y: 730, w: 52, fill: C.mid } }), chipimg: rect(60, 320, 570, 570), ...HEAD,
  k: rect(80, 100, 900, 30, { text: 'SAMPLE VALUES' }), t: rect(80, 138, 1200, 80, { text: 'Key specifications', px: 60 }),
  pn1: rect(740, 250, 1100, 630),
  g1: rect(790, 280, 300, 30, { text: 'PARAMETER' }), g2: rect(1050, 280, 300, 30, { text: 'VALUE' }), g3: rect(1500, 280, 300, 30, { text: 'NOTE' }),
  colA: rect(790, 340, 240, 560, { text: SPEC.map((r) => r[0]).join('\n'), px: 28 }), colB: rect(1050, 340, 430, 560, { text: SPEC.map((r) => r[1]).join('\n'), px: 28 }), colC: rect(1500, 340, 330, 560, { text: SPEC.map((r) => r[2]).join('\n'), px: 28 }),
  ...Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`rs${k + 1}`, rect(790, k === 0 ? 334 : 369 + 60.6 * (k - 1) + 30.3, 1010, 2, { a: 0.5 })])),
  foot: foot('> spec sheet rev C  (sample values)_'),
}

const H6 = heroP(1735, 190, 170)
const PERF = [['Control loop rate', '4.2×', 'faster than rev B', 0.92, 0.22], ['Time to first command', '3.1×', 'faster than rev B', 0.78, 0.25], ['Energy per task', '-38%', 'less energy than B', 0.7, 0.45], ['Radio throughput', '2.0×', 'higher than rev B', 0.86, 0.43]] as const
const s6: Record<string, Place> = {
  ...backdrop(5), ...net([{ pts: [tip(H6, 'l', 5), [1530, tip(H6, 'l', 5)[1]], [1530, 930]], hot: true }, { pts: [tip(H6, 'r', 3), [W, tip(H6, 'r', 3)[1]]] }]), ...hero(H6, { lit: 0.12 }),
  ...comps(Object.fromEntries(PERF.map((p, k) => [k + 1, { x: 80, y: 300 + 170 * k, w: 80, fill: k === 0 ? C.mid : C.off, label: ['CPU', 'BOOT', 'PWR', 'RF'][k]!, px: 22 }]))), ...HEAD,
  k: rect(80, 100, 900, 30, { text: 'KESTREL-9 VS REV B  ·  SAMPLE MEASUREMENTS' }), t: rect(80, 138, 1200, 80, { text: 'Performance', px: 60 }),
  ...Object.assign({}, ...PERF.map((p, k) => ({ ...bar(k + 1, 190, 346 + 170 * k, 1050, 22, p[3]), [`pf${k + 1}`]: rect(190, 380 + 170 * k, 1050 * p[4], 12) }))),
  ...Object.fromEntries(PERF.flatMap((p, k) => [[`h${k + 1}`, rect(190, 296 + 170 * k, 1000, 44, { text: p[0], px: 30 })], [`n${k + 1}`, rect(1290, 308 + 170 * k, 230, 70, { text: p[1], px: 54 })], [`d${k + 1}`, rect(1570, 312 + 170 * k, 280, 70, { text: p[2], px: 24 })]])),
  cap: rect(190, 972 - 0, 1050, 28, { text: 'GREEN: KESTREL-9    DIM: REV B', color: C.mute }),
}

const H7 = heroP(380, 570, 340)
const s7: Record<string, Place> = {
  ...backdrop(6), hc1: at(chipBox(380, 570, 760), { a: 0.06 }), hc2: at(chipBox(380, 570, 560), { a: 0.09 }), hc3: at(chipBox(380, 570, 430), { a: 0.13 }),
  ...net([{ pts: [tip(H7, 'r', 3), [820, 588]], hot: 'a' }, { pts: [tip(H7, 'r', 5), [820, 856]], hot: true }, { pts: [tip(H7, 'l', 2), [0, tip(H7, 'l', 2)[1]]] }, { pts: [tip(H7, 'b', 3), [tip(H7, 'b', 3)[0], H]] }]),
  ...hero(H7, { lit: 0.22, litFill: C.amb }), ...comps({ 1: { x: 687, y: 726, w: 56, fill: C.mid }, 2: { x: 700, y: 546, w: 52, fill: C.amb } }), ...HEAD,
  k: rect(80, 100, 900, 30, { text: 'POWER  ·  THERMAL  ·  SAMPLE FIGURES' }), t: rect(80, 138, 1200, 80, { text: 'Power and thermal', px: 60 }),
  n1: rect(840, 270, 440, 100, { text: '1.8 W', px: 84 }), d1: rect(840, 380, 490, 76, { text: 'typical draw at 12 V, radios on', px: 26 }),
  n2: rect(1360, 270, 440, 100, { text: '68 °C', px: 84, color: C.amb }), d2: rect(1360, 380, 440, 76, { text: 'peak junction temperature, sealed case at 40 °C ambient', px: 26 }),
  cap: rect(840, 522, 1000, 28, { text: 'THERMAL BUDGET' }),
  heat: rect(840, 560, 1000, 56), mk: rect(1534, 626, 36, 32), g1: rect(840, 672, 300, 30, { text: '25 °C' }), g2: rect(1300, 672, 340, 30, { text: '55 °C' }), g3: rect(1640, 672, 200, 30, { text: '85 °C LIMIT', color: C.amb }),
  ...wave(840, 790, 1000, 80, 5), ...{ b: rect(840, 904, 1000, 40, { text: 'Rail ripple under load: 5 cycles on screen, about 12 mV (sample).', px: 26 }) },
  foot: foot('> thermal limit 85 C, margin 17 C (sample)_'),
}

const BUS = [260, 620, 980, 1340, 1700]
const ROAD = [['Q1 2027', 'Prototype A', 'First boards back, power and boot verified.'], ['Q2 2027', 'EVT build', '50 units, full bench test, second source qualified.'], ['Q3 2027', 'Certification', 'Radio and EMC test slot, one respin held in reserve.'],
  ['Q4 2027', 'Pilot run', '500 boards in the field with three partners.'], ['Q1 2028', 'Production', 'Volume build at the contract manufacturer.']]
const stFill = (k: number) => (k < 2 ? C.G : k === 2 ? C.amb : C.bg)
const s8: Record<string, Place> = {
  ...backdrop(7), ...net([{ pts: [[100, 600], [260, 600], [620, 600], [980, 600]], hot: true }, { pts: [[980, 600], [1340, 600], [1700, 600], [1840, 600]] }, ...BUS.map((x, k): Route => ({ pts: [[x, 600], [x, 492]], hot: k < 3 }))], { vias: false, th: 5 }),
  ...Object.fromEntries(BUS.map((x, k) => [`v${k + 1}`, rect(x - 22, 578, 44, 44, { fill: stFill(k) })])),
  ...comps(Object.fromEntries(BUS.map((x, k) => [k + 1, { x: x - 38, y: 420, w: 76, fill: stFill(k) === C.bg ? C.off : stFill(k), label: `0${k + 1}`, px: 28, lc: k < 3 ? C.dark : C.G }]))), ...HEAD,
  k: rect(80, 100, 900, 30, { text: 'SAMPLE DATES' }), t: rect(80, 138, 1300, 80, { text: 'Roadmap to production', px: 60 }),
  cap: rect(896, 374, 300, 28, { text: 'WE ARE HERE', color: C.amb }),
  ...Object.fromEntries(ROAD.flatMap((r, k) => [[`sg${k + 1}`, rect(BUS[k]! - 160, 668, 320, 30, { text: r[0]! })], [`sh${k + 1}`, rect(BUS[k]! - 160, 712, 320, 46, { text: r[1]! })], [`sd${k + 1}`, rect(BUS[k]! - 160, 774, 320, 130, { text: r[2]! })]])),
  foot: foot('> milestone 3 of 5: certification_'),
}

const H9 = heroP(1735, 190, 170)
const RISK = [['Supply: gate-driver lead time', 'HIGH', 'Quoted at 26 weeks. A second source is being qualified for Q2 and 500 units of buffer stock are on order.'],
  ['Thermal margin under full load', 'MEDIUM', 'Junction peaks at 68 °C in a sealed case. A heat spreader and a firmware throttle are in design.'], ['Radio certification slip', 'MEDIUM', 'The pre-scan passed with margin. A full test slot is booked for Q3, with one respin held in reserve.']]
const s9: Record<string, Place> = {
  ...backdrop(8), ...net([{ pts: [tip(H9, 'l', 6), [50, tip(H9, 'l', 6)[1]], [50, 830]], hot: 'a' }, ...[370, 600, 830].map((y): Route => ({ pts: [[50, y], [120, y]], hot: 'a' }))], { th: 4, vias: false }),
  ...Object.fromEntries([370, 600, 830].map((y, k) => [`v${k + 1}`, rect(42, y - 8, 16, 16, { fill: C.amb })])),
  ...hero(H9, { lit: 0.14, litFill: C.amb }),
  ...Object.fromEntries(RISK.flatMap((r, k) => [[`pn${k + 1}`, rect(80, 290 + 230 * k, 1760, 200)], [`h${k + 1}`, rect(230, 330 + 230 * k, 1100, 50, { text: r[0]!, px: 38 })], [`rg${k + 1}`, rect(1440, 340 + 230 * k, 340, 30, { text: r[1] === 'HIGH' ? 'HIGH RISK' : 'MEDIUM RISK', color: r[1] === 'HIGH' ? C.amb : C.mute })], [`d${k + 1}`, rect(230, 392 + 230 * k, 1500, 76, { text: r[2]!, px: 28 })]])),
  ...comps(Object.fromEntries([370, 600, 830].map((y, k) => [k + 1, { x: 120, y: y - 36, w: 72, fill: C.amb, label: '!', px: 40, lc: C.dark }]))), ...HEAD,
  k: rect(80, 100, 900, 30, { text: 'SAMPLE RISK REGISTER' }), t: rect(80, 138, 1300, 80, { text: 'Risks and warnings', px: 60 }),
  foot: foot('> 3 risks open, 0 blocking_'),
}
// the risk cards sit lower than the title: keep the cards below 270
void s9

const H10 = heroP(1735, 200, 170)
const VAL = [['Electrical', 1], ['Thermal', 0.8], ['Radio', 0.6]] as const
const s10: Record<string, Place> = {
  ...backdrop(9), ...net([{ pts: [tip(H10, 'l', 3), [1140, tip(H10, 'l', 3)[1]], [1140, 960]], hot: true }, { pts: [tip(H10, 'r', 4), [W, tip(H10, 'r', 4)[1]]] }]), ...hero(H10, { lit: 0.12 }),
  lc: rect(80, 250, 1020, 720), g1: rect(110, 274, 800, 30, { text: 'TEST LOG  ·  BENCH 02' }), ...logLines(9, { x: 80, w: 1020 }, 330, 9, 28, 68),
  ...Object.assign({}, ...VAL.map((v, k) => ({ ...bar(k + 1, 1190, 640 + 120 * k, 650, 22, v[1]) }))),
  ...Object.fromEntries(VAL.map((v, k) => [`h${k + 1}`, rect(1190, 592 + 120 * k, 650, 44, { text: `${v[0]}  ${Math.round(v[1] * 100)}%`, px: 30 })])), ...HEAD,
  k: rect(80, 100, 900, 30, { text: 'BENCH RESULTS  ·  SAMPLE' }), t: rect(80, 138, 1300, 80, { text: 'Validation and sign-off', px: 60 }),
  n1: rect(1190, 268, 420, 140, { text: '94%', px: 128 }), b: rect(1190, 420, 650, 100, { text: '40 bench tests: 38 passed first time, 2 passed on retry (sample).', px: 28 }),
}

const s11 = cover(10, 14, { kick: 'ALL CHECKS PASSED  ·  REV C', title: 'SYSTEM READY', tpx: 96, body: 'Schematics, firmware and the full test report live in the project wiki. Questions to hw-team@example.com.', boot: 'READY  100%', frac: 1, hot: true, cycles: 4, cap: 'CLK 48 MHZ  ·  LOCKED', chipFill: C.mid, lit: 0.4 })
const s1 = cover(0, 0, { kick: 'HARDWARE BRIEFING  ·  REV C', title: 'KESTREL-9', tpx: 110, body: 'Embedded controller for field robotics: dual core, 12 V rail, CAN bus and a 2.4 GHz radio.', boot: 'BOOT  64%', frac: 0.64, hot: false, cycles: 3, cap: 'CLK 48 MHZ', chipFill: C.off, lit: 0.3 })

export const TECH_CIRCUIT = authored(
  {
    id: 'tech-circuit', category: 'technology', name: 'Circuit', tagline: 'A board that re-routes itself as the story moves',
    description: 'An engineering terminal deck: a board of components and traces re-routes between scenes, a central chip zooms through to its die, and a boot log, progress bars and a square wave carry a hardware briefing from cover to sign-off.',
    audience: 'The Circuit template suits hardware and embedded systems briefings, chip and board design reviews, firmware and robotics updates, IoT product roadmaps, engineering status reports and any technical talk that wants the feel of a terminal.',
    topics: ['hardware', 'embedded systems', 'electronics', 'engineering', 'iot', 'chip design', 'pcb', 'firmware', 'robotics', 'technical briefing', 'systems architecture', 'microcontroller', 'semiconductor', 'circuit board', 'technology', 'design review'],
    fonts: { heading: 'Space Mono', body: 'IBM Plex Sans' },
    colors: { background: C.bg, surface: C.panel, textPrimary: C.ink, textSecondary: C.mute, primary: C.G, secondary: C.dim, accent: C.amb, onPrimary: C.dark },
    background: C.bg,
  },
  {
    objects, order,
    scenes: [
      { id: 's1', title: 'Cover', purpose: 'The board boots: traces draw in from the edges, the central chip lights up and the boot log starts to type.', grad: GRAD, place: s1 },
      { id: 's2', title: 'Contents', purpose: 'The chip shrinks to the corner and a list of six sections appears beside an isometric chip as the log scrolls up a line.', grad: GRAD, place: s2 },
      { id: 's3', title: 'Inside the die', purpose: 'The central chip zooms through until its die is the whole slide, split into four floorplan blocks.', grad: GRAD, place: s3 },
      { id: 's4', title: 'Architecture', purpose: 'The chip shrinks back to the middle of the board and the components regroup into labelled blocks joined by arrows.', grad: GRAD, place: s4 },
      { id: 's5', title: 'Specifications', purpose: 'The chip leaves, an isometric chip takes its place and a table lists the key sample specifications.', grad: GRAD, place: s5 },
      { id: 's6', title: 'Performance', purpose: 'The components become the labels of four bars that compare the new board with the previous revision.', grad: GRAD, place: s6 },
      { id: 's7', title: 'Power and thermal', purpose: 'The chip heats up with amber contours, a gradient strip marks the thermal budget and a square wave shows rail ripple.', grad: GRAD, place: s7 },
      { id: 's8', title: 'Roadmap', purpose: 'The traces become a bus line with five stations, the first three lit as milestones reached.', grad: GRAD, place: s8 },
      { id: 's9', title: 'Risks', purpose: 'Amber traces run to three warning cards, each with a risk, a severity and its mitigation.', grad: GRAD, place: s9 },
      { id: 's10', title: 'Validation', purpose: 'A large test log scrolls beside a pass rate and three progress bars.', grad: GRAD, place: s10 },
      { id: 's11', title: 'System ready', purpose: 'The board returns to its cover layout with every trace lit, all checks passed and the contact details.', grad: GRAD, place: s11 },
    ],
  },
)
