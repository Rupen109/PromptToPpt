import { authored, at, rect, W, H } from '../author'
import type { Place } from '../author'

/**
 * Learning Atlas: a learning unit told as a journey across one illustrated panorama. The camera pans and zooms over the map (the picture moves and scales between scenes, with
 * hill, tree and cloud layers sliding at other speeds for parallax), a dotted path is re-computed for every camera, a fox walks it from stop to stop, the current stop drops a map pin
 * and unfolds a flag card, and at the end the pins fly into a checklist. Original choreography for SlidesDone.
 */
const C = { parch: '#F6EBD3', meadow: '#7FB069', forest: '#3F7D58', sea: '#4FA3C7', sun: '#F28F3B', berry: '#C2456B', ink: '#3A2A1E', card: '#FFF6E0', mute: '#6B5442', beige: '#DCC9A0', wood: '#8B5E34', berryDark: '#9E3555', berryDeep: '#7D2A44' }
const BAND = 1000
const AR = 3600 / 1544

type PL = Record<string, Place> & { fox?: Place; card?: Place; cardS?: Place; ptrR?: Place; ptrL?: Place; kick?: Place; ctitle?: Place; cbody?: Place; glow?: Place; chest?: Place; lantern?: Place; stat?: Place; fact?: Place; head?: Place; big?: Place; sub?: Place; scrim?: Place; scrimQ?: Place; eyebrow?: Place }

// ── the camera ──
interface Cam { x: number; y: number; w: number; h: number; r: number; k: number }
/** the panorama at zoom k (1 = slide height), with the map point (fx, fy) at the screen point (sx, sy), kept inside the slide */
const cam = (fx: number, fy: number, k: number, sx = 960, sy = 540): Cam => {
  const h = H * k
  const w = h * AR
  const x = Math.min(0, Math.max(W - w, sx - fx * w))
  const y = Math.min(0, Math.max(H - h, sy - fy * h))
  return { x, y, w, h, r: w > W ? -x / (w - W) : 0, k }
}
/** the whole panorama shown as a framed picture */
const frame = (x: number, y: number, w: number): Cam => ({ x, y, w, h: w / AR, r: 0.5, k: w / AR / H })
const at2 = (c: Cam, px: number, py: number) => ({ x: c.x + px * c.w, y: c.y + py * c.h })

// ── the path (map fractions): control points, which of them are the six stops ──
const PATH: [number, number][] = [
  [0.09, 0.46], [0.128, 0.51], [0.074, 0.6], [0.116, 0.674], [0.19, 0.66], [0.27, 0.615], [0.33, 0.67], [0.38, 0.73], [0.423, 0.715],
  [0.485, 0.78], [0.543, 0.69], [0.606, 0.6], [0.68, 0.61], [0.726, 0.65], [0.796, 0.63], [0.87, 0.58], [0.93, 0.52],
]
const STOP_AT = [0, 5, 8, 11, 14, 16]
const SEG = 30
const dense: { x: number; y: number; d: number }[] = []
{
  const cr = (a: number[], b: number[], c: number[], d: number[], t: number) => [0, 1].map((i) => 0.5 * (2 * b[i]! + (-a[i]! + c[i]!) * t + (2 * a[i]! - 5 * b[i]! + 4 * c[i]! - d[i]!) * t * t + (-a[i]! + 3 * b[i]! - 3 * c[i]! + d[i]!) * t * t * t))
  const pts: number[][] = []
  for (let s = 0; s < PATH.length - 1; s++) for (let j = 0; j < SEG; j++) pts.push(cr(PATH[Math.max(s - 1, 0)]!, PATH[s]!, PATH[s + 1]!, PATH[Math.min(s + 2, PATH.length - 1)]!, j / SEG))
  pts.push([...PATH[PATH.length - 1]!])
  let d = 0
  pts.forEach((p, i) => { if (i) d += Math.hypot((p[0]! - pts[i - 1]![0]!) * AR, p[1]! - pts[i - 1]![1]!); dense.push({ x: p[0]!, y: p[1]!, d }) })
}
const TOTAL = dense[dense.length - 1]!.d
const STOP_D = STOP_AT.map((i) => dense[i * SEG]!.d)
const ND = 40
const DOTS = Array.from({ length: ND }, (_, i) => {
  const want = (TOTAL * i) / (ND - 1)
  const p = dense.find((q) => q.d >= want) ?? dense[dense.length - 1]!
  return p
})
const stopXY = (i: number) => { const p = PATH[STOP_AT[i]!]!; return { px: p[0], py: p[1] } }

// ── pieces ──
/** the dotted path for a camera: dots up to the stop `walked` are orange */
const dotsFor = (c: Cam, walked: number, size = 18): Record<string, Place> => Object.fromEntries(DOTS.map((p, i) => {
  const s = at2(c, p.x, p.y)
  const d = size * (0.85 + 0.15 * Math.min(c.k, 1.8))
  return [`d${i}`, { x: s.x - d / 2, y: s.y - d / 2, w: d, h: d, fill: walked >= 0 && p.d <= STOP_D[walked]! + 1e-6 ? C.sun : C.card }]
}))
const PS = { big: [100, 125], mid: [70, 88], small: [52, 65] } as const
/** a map pin (teardrop, white eye, number) whose tip is at (tx, ty) */
const pin = (i: number, tx: number, ty: number, kind: keyof typeof PS, fill: string, numA = 1): Record<string, Place> => {
  const [w, h] = PS[kind]
  const x = tx - w / 2
  const y = ty - h
  const cy = y + 0.34 * h
  const d = 0.5 * w
  return {
    [`p${i}`]: { x, y, w, h, fill },
    [`pc${i}`]: { x: x + w / 2 - d / 2, y: cy - d / 2, w: d, h: d },
    [`n${i}`]: { x, y: cy - d / 2, w, h: d, px: kind === 'big' ? 36 : 24, a: numA },
  }
}
const teardrop = (): number[][] => {
  const cy = 0.34
  const ry = 0.32
  const rx = 0.4
  const phi = Math.asin(ry / (1 - cy))
  const a0 = Math.PI - phi
  const a1 = 2 * Math.PI + phi
  const pts: number[][] = []
  for (let k = 0; k <= 22; k++) { const a = a0 + ((a1 - a0) * k) / 22; pts.push([+(0.5 + rx * Math.cos(a)).toFixed(3), +(cy + ry * Math.sin(a)).toFixed(3)]) }
  pts.push([0.5, 1])
  return pts
}
const fox = (cx: number, foot: number, h: number, rot = 0): Place => rect(cx - 0.38 * h, foot - h, 0.76 * h, h, { rot })
/** the compass rose centred at (cx, cy), turned by deg */
const compass = (cx: number, cy: number, r: number, deg: number): Record<string, Place> => {
  const rad = (deg * Math.PI) / 180
  const tri = (len: number, wd: number, off: number, dir: number): Place => {
    const a = rad + (dir * Math.PI) / 180
    const mx = cx + Math.sin(a) * off
    const my = cy - Math.cos(a) * off
    return { x: mx - wd / 2, y: my - len / 2, w: wd, h: len, rot: deg + dir }
  }
  return {
    cDisc: rect(cx - r, cy - r, 2 * r, 2 * r), cRing: rect(cx - r + 6, cy - r + 6, 2 * r - 12, 2 * r - 12),
    cN: tri(r * 0.9, r * 0.42, r * 0.45, 0), cS: tri(r * 0.9, r * 0.42, r * 0.45, 180), cE: tri(r * 0.6, r * 0.3, r * 0.3, 90), cW: tri(r * 0.6, r * 0.3, r * 0.3, -90),
    cDot: rect(cx - 6, cy - 6, 12, 12),
  }
}
/** the bottom strip: scale bar for the camera, progress trail, brand */
const hud = (c: Cam, scene: number): Record<string, Place> => {
  const km = c.k < 1 ? 200 : 100
  const half = (km * 1.2 * c.k) / 2
  const out: Record<string, Place> = {
    band: rect(0, BAND, W, H - BAND), bandLine: rect(0, BAND - 2, W, 3),
    sbA: rect(80, 1052, half, 10), sbB: rect(80 + half, 1052, half, 10), sbL: { ...rect(80, 1014, 300, 30), text: `Scale  ·  ${km} km` },
    brand: rect(1340, 1020, 500, 30),
  }
  for (let i = 0; i < 12; i++) out[`t${i}`] = { ...rect(740 + i * 42, 1030, 18, 18), fill: i <= scene ? C.sun : C.beige }
  return out
}
/** parallax layers for a full-bleed camera */
const layers = (c: Cam): Record<string, Place> => {
  const hw = Math.max(W * 1.3, c.w * 1.25)
  const tw = Math.max(W * 1.5, c.w * 1.6)
  const cw = 2400
  return {
    cl: { x: -c.r * (cw - W), y: -330 - (c.k - 1) * 40, w: cw, h: cw / AR, a: 0.5 },
    hl: { x: -c.r * (hw - W), y: BAND - 95 - 0.52 * (hw / AR), w: hw, h: hw / AR },
    tr: { x: -c.r * (tw - W), y: BAND - 175 - 0.35 * (tw / AR), w: tw, h: tw / AR },
  }
}
const pano = (c: Cam, radius = 0): Place => ({ x: c.x, y: c.y, w: c.w, h: c.h, radius })
const edge = (p: Place, radius: number) => ({ shadow: at(p, { x: p.x + 10, y: p.y + 16, radius, a: 0.2 }), edge: at(p, { radius }) })

// ── the stops ──
const STOPS = [
  { name: 'The Source', fx: 0.09, k: 1.6, side: 'R', body: 'Every river starts small. Snow and ice melt in the mountains and rain soaks into the ground, then the water bubbles out as a spring.', take: 'Rivers begin as melted snow, rain and springs.' },
  { name: 'The Rapids', fx: 0.22, k: 1.7, side: 'R', body: 'Where the land is steep, water rushes over rocks and turns white with bubbles. Fast water carries stones and wears the rock smooth.', take: 'Fast water shapes rock and carries stones.' },
  { name: 'The Forest', fx: 0.37, k: 1.6, side: 'L', body: 'Trees and plants hold the soil in place with their roots. The forest keeps the banks strong and shelters fish, birds and otters.', take: 'Roots hold the banks and shelter wildlife.' },
  { name: 'The Village', fx: 0.6, k: 1.5, side: 'R', body: 'People have always built homes beside rivers for drinking water, farms and travel. Bridges and mills grew up along the banks.', take: 'People settle by rivers for water and food.' },
  { name: 'The Delta', fx: 0.8, k: 1.6, side: 'L', body: 'Near the end the river slows and drops the mud it carried. The mud builds up into new land and reed islands called a delta.', take: 'Slow water drops mud and builds new land.' },
  { name: 'The Ocean', fx: 0.93, k: 1.6, side: 'L', body: 'At last the river meets the sea. Sunlight warms the water, it rises as vapour, and one day it will fall as rain on the mountains again.', take: 'The water cycle starts again with sun and rain.' },
]
const SX = [520, 560, 1380, 560, 1380, 1400]
const SY = 700

// ── the objects ──
const heading = { face: 'heading' as const, weight: 700, color: C.ink }
const objects: Parameters<typeof authored>[1]['objects'] = {
  frameShadow: { kind: 'shape', radius: 40, fill: C.ink, park: 'b' },
  pano: { kind: 'image', art: 'atlas-world.webp', alt: 'An illustrated map of a river running from a snowy mountain through forest and village to a delta and the sea', fit: 'cover' },
  cl: { kind: 'image', art: 'atlas-clouds.webp', alt: 'Soft storybook clouds', park: 'l' },
  hl: { kind: 'image', art: 'atlas-hills.webp', alt: 'Rolling green hills', park: 'b' },
  tr: { kind: 'image', art: 'atlas-trees.webp', alt: 'A row of storybook trees', park: 'b' },
  scrimQ: { kind: 'shape', fill: C.parch },
  edge: { kind: 'shape', radius: 40, stroke: C.card, strokeW: 12 },
}
const order: string[] = ['frameShadow', 'pano', 'cl', 'hl', 'tr', 'scrimQ', 'edge']
const add = (id: string, def: (typeof objects)[string]) => { objects[id] = def; order.push(id) }
for (let i = 0; i < 6; i++) add(`cr${i}`, { kind: 'shape', radius: 28, fill: C.card, stroke: C.beige, strokeW: 3, park: 'r' })
for (let i = 0; i < ND; i++) add(`d${i}`, { kind: 'shape', shape: 'ellipse', fill: C.card, stroke: C.ink, strokeW: 2 })
for (let i = 0; i < 6; i++) add(`p${i}`, { kind: 'shape', poly: teardrop(), fill: C.sun, stroke: C.ink, strokeW: 3, park: 't' })
for (let i = 0; i < 6; i++) add(`pc${i}`, { kind: 'shape', shape: 'ellipse', fill: '#FFFFFF', park: 't' })
for (let i = 0; i < 6; i++) add(`n${i}`, { kind: 'text', text: String(i + 1), px: 30, ...heading, align: 'ctr', anchor: 'ctr', park: 't' })
add('scrim', { kind: 'shape', fill: C.ink })
add('glow', { kind: 'shape', shape: 'ellipse', fill: C.sun })
add('chest', { kind: 'image', art: 'atlas-chest.webp', alt: 'An open wooden treasure chest full of gold and a blue gem', park: 'b' })
add('lantern', { kind: 'image', art: 'atlas-lantern.webp', alt: 'A glowing brass explorer lantern', park: 'b' })
for (let i = 0; i < 6; i++) add(`lp${i}`, { kind: 'shape', radius: 22, fill: C.card, stroke: C.ink, strokeW: 2 })
for (let i = 0; i < 6; i++) add(`lb${i}`, { kind: 'text', text: STOPS[i]!.name, px: 24, weight: 700, color: C.ink, align: 'ctr', anchor: 'ctr' })
add('fox', { kind: 'image', art: 'atlas-fox.webp', alt: 'A friendly cartoon fox explorer with a satchel' })
for (const [id, def] of Object.entries({
  ribbonL: { kind: 'shape', poly: [[0, 0], [1, 0], [1, 1], [0, 1], [0.3, 0.5]], fill: C.berryDark, park: 't' },
  ribbonR: { kind: 'shape', poly: [[0, 0], [1, 0], [0.7, 0.5], [1, 1], [0, 1]], fill: C.berryDark, park: 't' },
  foldL: { kind: 'shape', poly: [[0, 0], [1, 0], [0, 1]], fill: C.berryDeep, park: 't' },
  foldR: { kind: 'shape', poly: [[0, 0], [1, 0], [1, 1]], fill: C.berryDeep, park: 't' },
  ribbon: { kind: 'shape', fill: C.berry, park: 't' },
  big: { kind: 'text', text: '', px: 96, ...heading, color: C.card, align: 'ctr', anchor: 'ctr', lh: 1.05, park: 't' },
} as const)) add(id, def as (typeof objects)[string])
add('sub', { kind: 'text', text: '', px: 36, weight: 600, color: C.ink, align: 'ctr', lh: 1.3 })
add('cardS', { kind: 'shape', radius: 34, fill: C.ink, park: 'b' })
add('card', { kind: 'shape', radius: 34, fill: C.card, stroke: C.beige, strokeW: 4, park: 'b' })
add('ptrR', { kind: 'shape', shape: 'triangle', fill: C.card, park: 'b' })
add('ptrL', { kind: 'shape', shape: 'triangle', fill: C.card, park: 'b' })
add('eyebrow', { kind: 'text', text: '', px: 24, weight: 700, color: C.berry, caps: true, spc: 4 })
add('kick', { kind: 'text', text: '', px: 24, weight: 700, color: C.berry, caps: true, spc: 4, park: 'b' })
add('ctitle', { kind: 'text', text: '', px: 52, ...heading, lh: 1.05, park: 'b' })
add('cbody', { kind: 'text', text: '', px: 28, weight: 400, color: C.ink, lh: 1.45, park: 'b' })
add('stat', { kind: 'text', text: '', px: 260, ...heading, color: C.card, lh: 1, spc: -4, park: 'b' })
add('fact', { kind: 'text', text: '', px: 36, weight: 600, color: C.card, lh: 1.4, park: 'b' })
add('head', { kind: 'text', text: '', px: 60, ...heading, lh: 1.1 })
for (let i = 0; i < 3; i++) add(`sp${i}`, { kind: 'shape', radius: 10, fill: C.wood, park: 'b' })
for (let i = 0; i < 3; i++) add(`sb${i}`, { kind: 'shape', poly: [[0, 0], [0.92, 0], [1, 0.5], [0.92, 1], [0, 1]], fill: '#F3DDAE', stroke: '#7A5230', strokeW: 4, park: 't' })
for (let i = 0; i < 3; i++) add(`sl${i}`, { kind: 'shape', shape: 'ellipse', fill: C.berry, park: 't' })
for (let i = 0; i < 3; i++) add(`st${i}`, { kind: 'text', text: 'ABC'[i]!, px: 38, ...heading, color: '#FFFFFF', align: 'ctr', anchor: 'ctr', park: 't' })
const QA = ['The Rapids', 'The Delta', 'The Village']
for (let i = 0; i < 3; i++) add(`sa${i}`, { kind: 'text', text: QA[i]!, px: 40, ...heading, anchor: 'ctr', park: 't' })
for (let i = 0; i < 6; i++) add(`rn${i}`, { kind: 'text', text: STOPS[i]!.name, px: 38, ...heading, park: 'r' })
for (let i = 0; i < 6; i++) add(`rt${i}`, { kind: 'text', text: STOPS[i]!.take, px: 26, weight: 500, color: C.mute, park: 'r' })
add('cDisc', { kind: 'shape', shape: 'ellipse', fill: C.card, stroke: C.ink, strokeW: 4 })
add('cRing', { kind: 'shape', shape: 'ellipse', stroke: C.beige, strokeW: 3 })
add('cN', { kind: 'shape', shape: 'triangle', fill: C.berry })
add('cS', { kind: 'shape', shape: 'triangle', fill: C.mute })
add('cE', { kind: 'shape', shape: 'triangle', fill: C.forest })
add('cW', { kind: 'shape', shape: 'triangle', fill: C.sea })
add('cDot', { kind: 'shape', shape: 'ellipse', fill: C.ink })
add('band', { kind: 'shape', fill: C.parch })
add('bandLine', { kind: 'shape', fill: C.beige })
add('sbA', { kind: 'shape', fill: C.ink })
add('sbB', { kind: 'shape', fill: C.beige, stroke: C.ink, strokeW: 2 })
add('sbL', { kind: 'text', text: '', px: 22, weight: 600, color: C.mute })
for (let i = 0; i < 12; i++) add(`t${i}`, { kind: 'shape', shape: 'ellipse', fill: C.beige })
add('brand', { kind: 'text', text: 'LEARNING ATLAS  ·  RIVERS', px: 22, weight: 700, color: C.mute, caps: true, spc: 4, align: 'r' })

// ── the scenes ──
const COMP = [0, 14, -10, 22, -6, 18, -16, 30, 6, -22, 12, -4]
const compassAt = (s: number) => compass(1762, 138, 62, COMP[s]!)

/** a framed picture of the whole map (cover, overview, closing) */
const framed = (c: Cam, walked: number) => ({ pano: pano(c, 40), ...edge(pano(c, 40), 40) as object, ...dotsFor(c, walked) })

const scenes: Parameters<typeof authored>[1]['scenes'] = []
const ribbon = (): Record<string, Place> => ({
  ribbonL: rect(300, 120, 170, 150), ribbonR: rect(1450, 120, 170, 150), foldL: rect(410, 246, 44, 34), foldR: rect(1466, 246, 44, 34), ribbon: rect(410, 86, 1100, 160), big: rect(410, 86, 1100, 160),
})

// 1 cover
{
  const c = frame(110, 225, 1700)
  const s0 = at2(c, ...(Object.values(stopXY(0)).map(Number) as [number, number]))
  const e = edge(pano(c, 40), 40)
  scenes.push({
    id: 's1', title: 'Cover', purpose: 'A wide aerial view of the whole map in a frame, with the title on a ribbon and the fox at the start of the path.', bg: C.parch,
    place: { frameShadow: e.shadow, pano: pano(c, 40), edge: e.edge, ...dotsFor(c, -1), ...ribbon(), big: { ...rect(410, 86, 1100, 160), text: 'The River Journey' },
      sub: { ...rect(310, 280, 1300, 50), text: 'A learning atlas: follow one river from mountain spring to the sea.' }, fox: fox(s0.x - 40, s0.y + 18, 190, -3), ...compassAt(0), ...hud(c, 0) },
  })
}
// 2 overview
{
  const c = frame(110, 195, 1700)
  const e = edge(pano(c, 40), 40)
  const place: PL = {
    frameShadow: e.shadow, pano: pano(c, 40), edge: e.edge, ...dotsFor(c, -1),
    head: { ...rect(110, 60, 1500, 80), text: 'Six stops from source to sea' }, eyebrow: { ...rect(110, 24, 600, 30), text: 'THE ROUTE' }, ...compassAt(1), ...hud(c, 1),
  }
  for (let i = 0; i < 6; i++) {
    const s = at2(c, stopXY(i).px, stopXY(i).py)
    Object.assign(place, pin(i, s.x, s.y, 'mid', C.sun))
    const w = STOPS[i]!.name.length * 14 + 44
    place[`lp${i}`] = rect(s.x - w / 2, s.y + 8, w, 44)
    place[`lb${i}`] = rect(s.x - w / 2, s.y + 8, w, 44)
  }
  const s0 = at2(c, stopXY(0).px, stopXY(0).py)
  place.fox = fox(s0.x - 62, s0.y + 24, 170, 3)
  scenes.push({ id: 's2', title: 'The route', purpose: 'The map stays whole while six numbered pins drop in along the path and the fox steps up to the first one.', bg: C.parch, place })
}
// 3-8 the stops
STOPS.forEach((st, i) => {
  const c = cam(stopXY(i).px, stopXY(i).py, st.k, SX[i]!, SY)
  const s = at2(c, stopXY(i).px, stopXY(i).py)
  const place: PL = { pano: pano(c), ...layers(c), ...dotsFor(c, i), ...compassAt(i + 2), ...hud(c, i + 2) }
  for (let j = 0; j < 6; j++) {
    const t = at2(c, stopXY(j).px, stopXY(j).py)
    Object.assign(place, j === i ? pin(j, t.x, t.y, 'big', C.berry) : pin(j, t.x, t.y, 'small', j < i ? C.forest : C.sun, 0))
  }
  const cw = 600
  const ch = 480
  const cy = 250
  const right = st.side === 'R'
  const cx = right ? s.x + 50 + 38 : s.x - 50 - 38 - cw
  const head = s.y - 125 + 0.34 * 125
  place.card = rect(cx, cy, cw, ch, { rot: right ? 1.5 : -1.5 })
  place.cardS = rect(cx + 10, cy + 14, cw, ch, { rot: right ? 1.5 : -1.5, a: 0.2 })
  const ptr = right ? rect(cx - 56, head - 20, 44, 40, { rot: -90 }) : rect(cx + cw + 12, head - 20, 44, 40, { rot: 90 })
  place.ptrR = right ? at(ptr, { a: 0 }) : ptr
  place.ptrL = right ? ptr : at(ptr, { a: 0 })
  place.kick = { ...rect(cx + 44, cy + 40, cw - 88, 30), text: `STOP ${i + 1} OF 6`, color: C.berry }
  place.ctitle = { ...rect(cx + 44, cy + 82, cw - 88, 64), text: st.name }
  place.cbody = { ...rect(cx + 44, cy + 170, cw - 88, 280), text: st.body }
  const fxs = right ? s.x - 50 - 24 - 95 : s.x + 50 + 24 + 95
  place.fox = fox(fxs, s.y + 30, 250, i % 2 ? 4 : -4)
  scenes.push({
    id: `s${i + 3}`, title: st.name, bg: C.parch,
    purpose: ['The camera dives into the mountains and the first pin drops where the river is born.', 'The camera slides down the gorge to the rapids and the fox follows the dotted path.', 'The map pans into the forest while the flag card swings to the other side of the pin.', 'The camera glides to the village, the hills and trees sliding faster than the map behind them.', 'The camera crosses to the delta, where the river spreads into islands.', 'The camera reaches the sea at the right-hand edge of the map and the last pin drops.'][i]!,
    place,
  })
})
// 9 discovery
{
  const c = cam(0.1, 0.45, 1.8, 960, 540)
  const place: PL = { pano: pano(c), ...layers(c), ...dotsFor(c, 5), scrim: at(rect(0, 0, W, BAND), { a: 0.8 }), ...compassAt(8), ...hud(c, 8) }
  for (let j = 0; j < 6; j++) { const t = at2(c, stopXY(j).px, stopXY(j).py); Object.assign(place, pin(j, t.x, t.y, 'small', C.forest, 0)) }
  place.glow = rect(100, 150, 760, 760, { a: 0.35 })
  place.chest = rect(130, 190, 700, 700)
  place.lantern = rect(840, 640, 190, 250)
  place.eyebrow = { ...rect(1090, 190, 700, 32), text: 'DISCOVERY', color: C.sun }
  place.stat = { ...rect(1090, 240, 700, 290), text: '3%' }
  place.fact = { ...rect(1090, 570, 620, 260), text: 'of all the water on Earth is fresh water, and most of that is locked away as ice in glaciers.' }
  place.fox = fox(1790, 960, 280, 3)
  scenes.push({ id: 's9', title: 'Discovery', purpose: 'A dark veil falls over the map and the treasure chest grows to the left while one big fact fills the right.', bg: C.parch, place })
}
// 10 quiz
{
  const c = cam(0.55, 0.55, 1.3, 960, 540)
  const place: PL = { pano: pano(c), ...layers(c), scrimQ: at(rect(0, 0, W, BAND), { a: 0.9 }), ...compassAt(9), ...hud(c, 9) }
  const F = { x: 960, y: 872 }
  const bx = [150, 720, 1290]
  const dots: Record<string, Place> = {}
  const dd = 16
  for (let i = 0; i < ND; i++) {
    let x: number
    let y: number
    if (i < 7) { const t = i / 6; x = F.x; y = 995 - t * (995 - F.y) } else {
      const b = Math.floor((i - 7) / 11)
      const t = ((i - 7) % 11 + 1) / 11
      const tx = bx[b]! + 240
      const ty = 690
      x = F.x + (tx - F.x) * t + [-1, 0, 1][b]! * Math.sin(Math.PI * t) * 60
      y = F.y + (ty - F.y) * t
    }
    dots[`d${i}`] = { x: x - dd / 2, y: y - dd / 2, w: dd, h: dd, fill: C.sun }
  }
  Object.assign(place, dots)
  for (let b = 0; b < 3; b++) {
    place[`sp${b}`] = rect(bx[b]! + 226, 390, 28, 300)
    place[`sb${b}`] = rect(bx[b]!, 250, 480, 140)
    place[`sl${b}`] = rect(bx[b]! + 26, 284, 72, 72)
    place[`st${b}`] = rect(bx[b]! + 26, 284, 72, 72)
    place[`sa${b}`] = rect(bx[b]! + 116, 250, 330, 140)
  }
  place.eyebrow = { ...rect(110, 40, 700, 32), text: 'QUIZ AT THE FORK', color: C.berry }
  place.head = { ...rect(110, 84, 1500, 80), text: 'Which stop builds new land from river mud?' }
  place.fox = fox(740, 950, 300, -3)
  scenes.push({ id: 's10', title: 'Quiz at the fork', purpose: 'The path splits into three signposts, one for each possible answer, and the fox stops at the fork to choose.', bg: C.parch, place })
}
// 11 what we learned
{
  const card = rect(100, 190, 600, 760, { radius: 44 })
  const e = edge(card, 44)
  const place: PL = { frameShadow: e.shadow, pano: card, edge: e.edge, ...compassAt(10), ...hud(frame(110, 195, 1700), 10) }
  place.head = { ...rect(780, 70, 880, 80), text: 'What we learned' }
  place.eyebrow = { ...rect(780, 36, 600, 30), text: 'THE JOURNEY CHECKLIST', color: C.berry }
  for (let i = 0; i < 6; i++) {
    const y = 200 + i * 128
    place[`cr${i}`] = rect(780, y, 1040, 112)
    Object.assign(place, pin(i, 828, y + 88, 'small', C.forest, 0))
    place[`rn${i}`] = rect(900, y + 12, 880, 50)
    place[`rt${i}`] = rect(900, y + 62, 880, 36)
  }
  place.fox = fox(610, 985, 260, 3)
  scenes.push({ id: 's11', title: 'What we learned', purpose: 'The map shrinks into a postcard and the six pins fly into a checklist, one row per stop.', bg: C.parch, place })
}
// 12 closing
{
  const c = frame(110, 225, 1700)
  const e = edge(pano(c, 40), 40)
  const place: PL = { frameShadow: e.shadow, pano: pano(c, 40), edge: e.edge, ...dotsFor(c, 5), ...ribbon(), ...compassAt(11), ...hud(c, 11) }
  place.big = { ...rect(410, 86, 1100, 160), text: 'Journey complete' }
  place.sub = { ...rect(260, 275, 1400, 100), text: 'Source, rapids, forest, village, delta and ocean: you have followed the whole river.' }
  for (let i = 0; i < 6; i++) { const s = at2(c, stopXY(i).px, stopXY(i).py); Object.assign(place, pin(i, s.x, s.y, 'mid', C.forest)) }
  const s5 = at2(c, stopXY(5).px, stopXY(5).py)
  place.fox = fox(s5.x - 70, s5.y + 30, 180, -3)
  place.glow = rect(130, 640, 300, 300, { a: 0.4 })
  place.lantern = rect(185, 700, 190, 250)
  scenes.push({ id: 's12', title: 'Journey complete', purpose: 'The camera zooms back out to the framed map, the ribbon returns with a new title and the fox rests at the sea beside a lit lantern.', bg: C.parch, place })
}


export const EDU_ATLAS = authored(
  {
    id: 'edu-atlas', category: 'education', name: 'Learning Atlas', tagline: 'A lesson as a journey across a storybook map',
    description: 'A warm, hand-illustrated atlas where the camera pans and zooms across one wide landscape while a fox walks a dotted path from stop to stop: a cover, a route overview, six stops with map pins and flag cards, a treasure-chest discovery, a quiz at the fork, a checklist of what was learned and a journey-complete finale.',
    audience: 'The Learning Atlas template suits geography, history, nature and social studies lessons, school units and projects, storytelling and adventure themes, museum and library programmes, and any lesson that is easiest to teach as a trip from one place to the next.',
    topics: ['geography', 'history', 'nature', 'learning unit', 'lesson', 'school', 'classroom', 'teacher', 'adventure', 'journey', 'map', 'atlas', 'social studies', 'environment', 'story', 'river', 'water cycle', 'explorer', 'travel', 'kids', 'education', 'science', 'ecosystem'],
    fonts: { heading: 'Lora', body: 'Nunito Sans' },
    colors: { background: '#F6EBD3', surface: '#FFF6E0', textPrimary: '#3A2A1E', textSecondary: '#6B5442', primary: '#3F7D58', secondary: '#4FA3C7', accent: '#F28F3B', onPrimary: '#FFF6E0' },
    background: '#F6EBD3',
  },
  { objects, order, scenes },
)
void at
