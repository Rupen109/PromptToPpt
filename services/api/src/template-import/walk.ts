import { createHash } from 'node:crypto'
import { PPT_SINGLE_LINE, areaProblem, dashFromPpt, scatterXs, validMerges, type CellAlign, type CellArea, type ChartType, type SlideElement, type StrokeDash } from '@prompttoppt/validation'
import { colourIn, colourOf, isDark, mix, type Colour, type ColourContext } from './color.ts'
import { apply, groupMap, IDENT, mul, place, readXfrm, type Aff, type Placed, type Xfrm } from './geom.ts'
import { mapFont, weightHint } from './fonts.ts'
import type { LayoutData, MasterData, Pkg, SlideData, ThemeData } from './package.ts'
import { adjustments, customGeometry, presetGeometry, type Geo, type Pt } from './presets.ts'
import { readBody, readParagraphs, type BodyProps, type StyleSources, type TextPara } from './text.ts'
import { pendingSrc } from './types.ts'
import { at, findAll, kid, kids, num, type XNode } from './xml.ts'

/** Turns the shapes of a slide (and of its layout and master) into editor elements. See docs/TEMPLATE_FROM_FILE.md for what is kept, approximated and dropped. */

export type Origin = 'slide' | 'layout' | 'master'
export interface TextMeta { plain: string; paras: TextPara[]; px: number; heavy: boolean; caps: boolean; list: number; shapeBound: boolean; name: string; boxW: number; boxH: number; lineFactor: number }
export interface PicMeta { mediaKey: string; masked: boolean; shape: boolean }
export interface Emitted {
  el: SlideElement
  origin: Origin
  kind: 'text' | 'picture' | 'shape' | 'table' | 'chart'
  ph?: string
  text?: TextMeta
  pic?: PicMeta
}
export interface ImageJob { ref: string; part: string; mediaKey: string; crop: { l: number; t: number; r: number; b: number } | null; flipH: boolean; flipV: boolean; outW: number; outH: number; /** a two-colour recolour (PowerPoint's duotone): dark end, light end */ duotone?: [string, string]; /** no picture at all: a gradient with any number of stops, drawn as the slide's background picture */ gradient?: { stops: { pos: number; hex: string }[]; angle: number; radial: boolean } }

export interface Ctx {
  pkg: Pkg
  scale: number
  offX: number
  offY: number
  canvasW: number
  canvasH: number
  warn: (msg: string) => void
  /** deck-level facts collected on the way */
  flags: Set<string>
  jobs: Map<string, ImageJob>
  fontUse: Map<string, { role: 'heading' | 'body' | 'other'; uses: number }>
  slide: SlideData
  origin: Origin
  partPath: string
  master: MasterData
  layout: LayoutData
  theme: ThemeData
  colours: ColourContext
  counter: { n: number }
  prefix: string
  hasSlideNumber: boolean
  /** the fill a `grpFill` shape takes: that of the nearest enclosing group (innermost last) */
  groupFills: Fill[]
}

const PH_EQUIV: Record<string, string> = { ctrTitle: 'title', subTitle: 'body', obj: 'body', tbl: 'body', chart: 'body', pic: 'body', media: 'body', clipArt: 'body', dgm: 'body', body: 'body', title: 'title', dt: 'dt', ftr: 'ftr', sldNum: 'sldNum' }
const phOf = (n: XNode): { type: string; idx: string | undefined } | null => {
  const ph = at(at(n, 'nvSpPr') ?? at(n, 'nvPicPr') ?? at(n, 'nvGraphicFramePr') ?? at(n, 'nvCxnSpPr'), 'nvPr/ph')
  return ph ? { type: ph.a['type'] ?? 'obj', idx: ph.a['idx'] } : null
}
const treeShapes = (tree: XNode | undefined): XNode[] => (tree ? tree.c.filter((c) => ['sp', 'pic', 'graphicFrame', 'cxnSp'].includes(c.n)) : [])
function matchPh(tree: XNode | undefined, ph: { type: string; idx: string | undefined }): XNode | undefined {
  const cands = treeShapes(tree).map((s) => ({ s, p: phOf(s) })).filter((x) => x.p) as { s: XNode; p: { type: string; idx: string | undefined } }[]
  const found = (ph.idx !== undefined ? cands.find((c) => c.p.idx === ph.idx && (c.p.type === ph.type || PH_EQUIV[c.p.type] === PH_EQUIV[ph.type])) : undefined)
    ?? cands.find((c) => c.p.type === ph.type && (ph.idx === undefined || c.p.idx === ph.idx || ph.type === 'title' || ph.type === 'ctrTitle' || ph.type === 'dt' || ph.type === 'ftr' || ph.type === 'sldNum'))
    ?? cands.find((c) => PH_EQUIV[c.p.type] === PH_EQUIV[ph.type] && (PH_EQUIV[ph.type] !== 'body' || ph.idx === undefined || c.p.idx === ph.idx))
    ?? (PH_EQUIV[ph.type] === 'body' ? cands.find((c) => PH_EQUIV[c.p.type] === 'body') : undefined)
  return found?.s
}
const spPrOf = (n: XNode | undefined) => kid(n, 'spPr')
const txBodyOf = (n: XNode | undefined) => kid(n, 'txBody')

const id = (c: Ctx) => `${c.prefix}${++c.counter.n}`
const FILL_NODES = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill']

export type Fill = { k: 'none' } | { k: 'solid'; c: Colour } | { k: 'grad'; from: Colour; to: Colour; angle: number } | { k: 'pic'; node: XNode } | null
function fillFrom(holder: XNode | undefined, c: Ctx, ph?: string): Fill {
  const n = holder?.c.find((x) => FILL_NODES.includes(x.n))
  if (!n) return null
  const ctx = ph ? { ...c.colours, ph } : c.colours
  if (n.n === 'noFill') return { k: 'none' }
  if (n.n === 'solidFill') { const col = colourIn(n, ctx); return col ? { k: 'solid', c: col } : null }
  if (n.n === 'pattFill') { const col = colourOf(kid(kid(n, 'fgClr'), 'srgbClr') ?? kid(n, 'fgClr')?.c[0], ctx); return col ? { k: 'solid', c: col } : null }
  if (n.n === 'blipFill') return { k: 'pic', node: n }
  if (n.n === 'gradFill') {
    const stops = kids(kid(n, 'gsLst'), 'gs').map((g) => ({ pos: num(g.a['pos']), col: colourIn(g, ctx) })).filter((g) => g.col) as { pos: number; col: Colour }[]
    if (!stops.length) return null
    stops.sort((a, b) => a.pos - b.pos)
    if (stops.length === 1) return { k: 'solid', c: stops[0]!.col }
    const lin = kid(n, 'lin')
    // the editor's gradients have no transparency: a glow that fades to nothing keeps its average strength as the shape's opacity
    const avg = stops.reduce((s, g) => s + g.col.alpha, 0) / stops.length
    const tweak = (col: Colour): Colour => ({ hex: col.hex, alpha: avg })
    return { k: 'grad', from: tweak(stops[0]!.col), to: tweak(stops[stops.length - 1]!.col), angle: lin ? Math.round(((num(lin.a['ang']) / 60000 + 90) % 360 + 360) % 360) : 180 }
  }
  return null
}
function styleFill(style: XNode | undefined, c: Ctx): Fill {
  const ref = kid(style, 'fillRef')
  if (!ref) return null
  const idx = num(ref.a['idx'])
  if (idx === 0) return { k: 'none' }
  const ph = colourIn(ref, c.colours)
  const holder = idx >= 1001 ? c.theme.bgFills[idx - 1001] : c.theme.fills[idx - 1]
  const f = holder ? fillFrom({ n: 'x', a: {}, c: [holder], t: '' }, c, ph?.hex) : null
  return f ?? (ph ? { k: 'solid', c: ph } : null)
}
interface Line { color: Colour | null; widthPx: number; /** dashed / dotted (PowerPoint's preset, as ours) */ dash?: StrokeDash | undefined }
function lineOf(spPr: XNode | undefined, style: XNode | undefined, c: Ctx): Line | null {
  const ln = kid(spPr, 'ln')
  const ref = kid(style, 'lnRef')
  const px = (emu: number) => Math.max(0.5, Math.round(emu * c.scale * 10) / 10)
  const refIdx = num(ref?.a['idx'])
  const refW = refIdx > 0 ? num(kid(c.theme.lines[refIdx - 1], 'ln')?.a['w'] ?? c.theme.lines[refIdx - 1]?.a['w'], 12700) : 0
  const phc = ref ? colourIn(ref, c.colours) : null
  if (ln) {
    if (kid(ln, 'noFill')) return null
    const w = ln.a['w'] !== undefined ? num(ln.a['w']) : refW || 9525
    const f = fillFrom(ln, c, phc?.hex)
    const col = f?.k === 'solid' ? f.c : f?.k === 'grad' ? f.from : phc
    // a dashed or dotted line stays so (dash-dot kinds come in as dashes and are flagged)
    const d = dashFromPpt(kid(ln, 'prstDash')?.a['val'])
    if (!d.exact) c.flags.add('dashes')
    return col ? { color: col, widthPx: px(w), ...(d.dash ? { dash: d.dash } : {}) } : null
  }
  if (ref && refIdx > 0 && phc) return { color: phc, widthPx: px(refW) }
  return null
}

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r1 = (v: number) => Math.round(v * 10) / 10
const hexOf = (c: Colour) => c.hex

function baseBox(p: Placed) {
  return { x: r1(p.cx - p.w / 2), y: r1(p.cy - p.h / 2), width: Math.max(0.5, r1(p.w)), height: Math.max(0.5, r1(p.h)), rotation: p.rot > 180 ? r1(p.rot - 360) : r1(p.rot), locked: false, zIndex: 0, opacity: 1 }
}

/** the position a placeholder inherits when the slide does not give one */
function xfrmChain(sp: XNode, ph: ReturnType<typeof phOf>, c: Ctx): Xfrm | null {
  const own = readXfrm(kid(spPrOf(sp), 'xfrm') ?? kid(sp, 'xfrm'))
  if (own || !ph) return own
  const lay = c.origin === 'slide' ? matchPh(c.layout.tree, ph) : undefined
  const lx = readXfrm(kid(spPrOf(lay), 'xfrm'))
  if (lx) return lx
  const mph = matchPh(c.master.tree, lay ? (phOf(lay) ?? ph) : ph)
  return readXfrm(kid(spPrOf(mph), 'xfrm'))
}

/** shape-geometry + fill + line -> an editor shape element (or null when nothing is drawn) */
function shapeElement(sp: XNode, pl: Placed, fill: Fill, line: Line | null, c: Ctx, wPx: number, hPx: number): { el: SlideElement; geo: Geo } | null {
  const spPr = spPrOf(sp)
  const cust = kid(spPr, 'custGeom')
  const prstNode = kid(spPr, 'prstGeom')
  let geo: Geo
  if (cust) {
    const g = customGeometry(spPr)
    if (g?.ring !== undefined) geo = { kind: 'ring', width: Math.max(1, g.ring * Math.min(wPx, hPx)) }
    else if (g) { geo = { kind: 'poly', points: g.points }; if (g.subpaths > 1) c.warn('A drawn shape with several parts was simplified to its largest outline') }
    else { geo = { kind: 'rect-fallback', reason: 'freeform' } }
  } else geo = presetGeometry(prstNode?.a['prst'] ?? 'rect', adjustments(prstNode), wPx, hPx)
  if (geo.kind === 'none') { if (fill && fill.k !== 'none') c.warn(`A "${geo.reason}" shape is not supported and was left out`); return null }
  if (geo.kind === 'rect-fallback') { if (fill && fill.k !== 'none') c.warn(`A "${geo.reason}" shape was drawn as a rectangle`); geo = { kind: 'basic', shape: 'rect' } }
  const visibleFill = fill && fill.k !== 'none'
  if (!visibleFill && !line) return null
  // flips: a polygon carries them in its points; the editor's other shapes are symmetric enough or keep the mirror part of the rotation
  let flipH = pl.flipH, flipV = pl.flipV
  const box = baseBox(pl)
  let fillHex: string | 'none' = visibleFill ? (fill!.k === 'solid' ? hexOf(fill!.c) : fill!.k === 'grad' ? hexOf(fill!.from) : '#CCCCCC') : 'none'
  let opacity = 1
  if (visibleFill && fill!.k === 'solid') opacity = fill!.c.alpha
  else if (visibleFill && fill!.k === 'grad') opacity = fill!.from.alpha
  if (opacity < 0.02 && !line) return null // an invisible glow
  const gradient = visibleFill && fill!.k === 'grad' ? { from: hexOf(fill!.from), to: hexOf(fill!.to), angle: fill!.angle } : undefined
  const common = { type: 'shape' as const, id: id(c), ...box, opacity: clampN(opacity, 0, 1), fill: fillHex, ...(gradient ? { gradient } : {}), ...(line ? { stroke: hexOf(line.color!), strokeWidth: clampN(line.widthPx, 0, 80), ...(line.dash ? { strokeDash: line.dash } : {}) } : {}) }
  if (geo.kind === 'basic') return { geo, el: { ...common, shape: geo.shape, radius: geo.shape === 'rect' ? Math.round(geo.radius ?? 0) : 0 } as SlideElement }
  if (geo.kind === 'triangle') { if (flipV) return { geo, el: { ...common, shape: 'polygon', points: [[0.5, 1], [1, 0], [0, 0]], radius: 0 } as SlideElement }; return { geo, el: { ...common, shape: 'triangle', radius: 0 } as SlideElement } }
  if (geo.kind === 'ring') return { geo, el: { ...common, shape: 'ring', fill: 'none', stroke: fillHex === 'none' ? (line ? hexOf(line.color!) : '#000000') : fillHex, strokeWidth: clampN(geo.width, 1, 80), radius: 0 } as SlideElement }
  if (geo.kind === 'path') { flipH = false; flipV = false; return { geo, el: { ...common, shape: geo.id, radius: 0 } as SlideElement } }
  if (geo.kind === 'poly') {
    const pts = geo.points.map(([x, y]) => [flipH ? 1 - x : x, flipV ? 1 - y : y] as Pt)
    return { geo, el: { ...common, shape: 'polygon', points: pts, radius: 0 } as SlideElement }
  }
  return null
}

function hyperlinkOf(c: Ctx) {
  return (rid: string): string | undefined => {
    const rel = c.pkg.rels(c.partPath)[rid]
    return rel?.external && /^https?:\/\//i.test(rel.target) && rel.target.length <= 2048 ? rel.target : undefined
  }
}

/** Wingdings / Symbol bullets are letters in a symbol font: by the low byte of the character, the glyph PowerPoint draws */
const WING: Record<number, string> = { 0xa7: '▪', 0xb7: '•', 0xd8: '→', 0xe0: '→', 0xfc: '✓', 0x76: '▪', 0x6e: '▪', 0x71: '▪', 0xa8: '▪', 0x6c: '●', 0x9f: '•', 0xfb: '•', 0x2a: '•', 0xd5: '→', 0xd6: '→' }
function bulletGlyph(ch: string, font: string | undefined): string {
  const code = ch.codePointAt(0) ?? 0x2022
  if (font && /wingdings 3/i.test(font)) return '→' // the arrow / triangle set
  if (font && /wingdings|symbol|webdings/i.test(font)) return WING[code & 0xff] ?? '•'
  if (code >= 0xf000 && code <= 0xf0ff) return WING[code & 0xff] ?? '•'
  return BULLETS[ch] ?? '•'
}
const BULLETS: Record<string, string> = { '•': '•', '–': '–', '-': '–', '—': '–', '▪': '▪', '■': '▪', '§': '▪', '◦': '•', 'o': '•', '●': '●', '·': '•', '✓': '✓', 'ü': '✓', 'Ø': '→', '→': '→', '➢': '→', '➤': '→', '' : '•' }

interface TextOut { el: SlideElement; meta: TextMeta }
function textFrom(paras: TextPara[], body: BodyProps, box: Placed, c: Ctx, o: { role: 'title' | 'subtitle' | 'body'; name: string; shapeBound: boolean; inset: { l: number; t: number; r: number; b: number } }): TextOut | null {
  // trim empty paragraphs at both ends; an empty one in the middle stays as a blank line
  let a = 0, z = paras.length
  while (a < z && !paras[a]!.runs.some((r) => r.text.trim())) a++
  while (z > a && !paras[z - 1]!.runs.some((r) => r.text.trim())) z--
  const ps = paras.slice(a, z)
  if (!ps.length) return null
  const pxPt = 12700 * c.scale
  const chars = (p: TextPara) => p.runs.reduce((n, r) => n + r.text.length, 0)
  // dominant run: the one holding the most letters (ties: the first)
  const runs = ps.flatMap((p) => p.runs).filter((r) => r.text.trim())
  const totals = new Map<string, { n: number; run: (typeof runs)[number] }>()
  for (const r of runs) { const k = `${r.sz}|${r.colour.hex}|${r.b}|${r.font}`; const t = totals.get(k); if (t) t.n += r.text.length; else totals.set(k, { n: r.text.length, run: r }) }
  const dom = [...totals.values()].sort((x, y) => y.n - x.n)[0]!.run
  const fontScale = body.fontScale
  const fontPx = clampN(dom.sz * fontScale * pxPt, 4, 600)
  const domPara = [...ps].sort((x, y) => chars(y) - chars(x))[0]!
  const sizes = new Set(runs.map((r) => Math.round(r.sz)))
  if (sizes.size > 1 && Math.max(...sizes) / Math.min(...sizes) > 1.3) c.warn('A text box mixes very different text sizes; it is shown at its main size')
  const allBold = runs.every((r) => r.b)
  const hint = weightHint(dom.font)
  const weight = allBold ? 700 : hint !== null && hint !== 700 ? hint : dom.b ? 700 : 400
  // the editor draws title / heading / subtitle / metric text in the heading font and the rest in the body font: pick the role by which of the file's two fonts this text uses
  const mj = mapFont(c.theme.major).mapped, mn = mapFont(c.theme.minor).mapped, mine = mapFont(dom.font).mapped
  const twoFonts = mj !== mn
  const heading = twoFonts ? (dom.font === c.theme.major || (mine === mj && dom.font !== c.theme.minor)) : o.role === 'title'
  const isTitle = o.role === 'title'
  const lineSpacing = domPara.lineSpacing ?? 1
  const lineHeight = domPara.lnSpcPts ? clampN((domPara.lnSpcPts * pxPt) / fontPx, 0.7, 2.2) : clampN(PPT_SINGLE_LINE * Math.max(0.5, lineSpacing - body.lnSpcReduction), 0.7, 2.2)
  const gap = (p: TextPara, q: TextPara) => {
    const of = (v: number, p0: TextPara) => (v > 0 ? v * pxPt : v < 0 ? -v * 1.2 * (p0.runs[0]?.sz ?? dom.sz) * fontScale * pxPt : 0)
    return of(p.spaceAfter, p) + of(q.spaceBefore, q)
  }
  const gaps = ps.slice(1).map((p, k) => gap(ps[k]!, p))
  const paraGap = gaps.length ? clampN(gaps.reduce((s, g) => s + g, 0) / gaps.length / fontPx, 0, 2) : 0.5
  const alignCount = new Map<string, number>()
  for (const p of ps) alignCount.set(p.algn, (alignCount.get(p.algn) ?? 0) + chars(p))
  const algn = [...alignCount.entries()].sort((x, y) => y[1] - x[1])[0]![0]
  const align = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' || algn === 'dist' || algn === 'thaiDist' || algn === 'justLow' ? 'justify' : 'left' // (justified text stays justified)
  if (alignCount.size > 1 && ps.length > 1) c.flags.add('mixed-align')
  const firstBullet = ps.find((p) => p.bullet.kind === 'char')?.bullet
  const glyph = firstBullet && firstBullet.kind === 'char' ? bulletGlyph(firstBullet.char, firstBullet.font) : '•'
  const list = ps.filter((p) => p.bullet.kind !== 'none').length
  const mkRuns = (p: TextPara) => p.runs.map((r) => ({
    text: (r.text || ' ').slice(0, 5000),
    ...(r.b && !allBold ? { bold: true } : {}), ...(r.i ? { italic: true } : {}), ...(r.u ? { underline: true } : {}),
    ...(r.colour.hex !== dom.colour.hex ? { color: r.colour.hex } : {}), ...(r.link ? { link: r.link } : {}),
  }))
  // box with the shape's text insets taken off (the editor draws text edge to edge)
  const il = body.lIns * c.scale, it = body.tIns * c.scale, ir = body.rIns * c.scale, ib = body.bIns * c.scale
  let w = box.w - il - ir - (o.inset.l + o.inset.r), h = box.h - it - ib - (o.inset.t + o.inset.b)
  if (w < 4) w = Math.max(4, box.w)
  if (h < 4) h = Math.max(4, box.h)
  const cosr = Math.cos((box.rot * Math.PI) / 180), sinr = Math.sin((box.rot * Math.PI) / 180)
  // the inset box's centre is off the shape's centre by (il - ir + ...)/2 in the shape's own frame
  let dx = (il + o.inset.l - ir - o.inset.r) / 2, dy = (it + o.inset.t - ib - o.inset.b) / 2
  let rot = box.rot
  if (body.vert === 'vert270' || body.vert === 'vert') { [w, h] = [h, w]; rot = box.rot + (body.vert === 'vert270' ? -90 : 90); [dx, dy] = [0, 0] }
  else if (body.vert !== 'horz') c.warn('Vertical or stacked text was shown horizontally')
  // text that does not wrap: widen the box to the line (the editor always wraps)
  if (!body.wrap && body.vert === 'horz') {
    const longest = Math.max(...ps.map((p) => p.runs.map((r) => r.text).join('').length))
    const need = longest * fontPx * 0.55
    if (need > w) { const extra = need - w; if (align === 'left') dx += extra / 2; else if (align === 'right') dx -= extra / 2; w = need }
  }
  const cx = box.cx + dx * cosr - dy * sinr, cy = box.cy + dx * sinr + dy * cosr
  const px = fontPx
  const heavy = weight >= 700, caps = dom.cap
  const base = { x: r1(cx - w / 2), y: r1(cy - h / 2), width: Math.max(1, r1(w)), height: Math.max(1, r1(h)), rotation: rot > 180 ? r1(rot - 360) : r1(rot), locked: false, zIndex: 0, opacity: clampN(dom.colour.alpha, 0, 1) }
  // font roles: the editor picks the heading font for title/heading/subtitle/metric, the body font otherwise
  const role = heading ? (isTitle ? 'title' : /^\d[\d.,%]*$/.test(domPara.runs.map((r) => r.text).join('').trim()) && fontPx >= 60 ? 'metric' : 'heading') : fontPx <= 22 && !list ? 'caption' : 'body'
  const fm = mapFont(dom.font)
  const use = c.fontUse.get(fm.original) ?? { role: heading ? 'heading' as const : fm.original === c.theme.minor ? 'body' as const : 'other' as const, uses: 0 }
  use.uses++; c.fontUse.set(fm.original, use)
  const el = {
    type: 'text' as const, id: id(c), ...base, label: o.name.slice(0, 80) || undefined, role, fontSize: r1(px), align, color: dom.colour.hex, valign: body.anchor, bullet: glyph, weight: clampN(weight, 300, 900),
    ...(dom.spc ? { letterSpacing: clampN(r1(dom.spc * pxPt), -12, 30) } : {}), ...(caps ? { uppercase: true } : {}), lineHeight: r1(lineHeight * 100) / 100, paraGap: r1(paraGap * 100) / 100,
    paragraphs: ps.map((p) => ({ runs: mkRuns(p), ...(p.bullet.kind === 'char' ? { list: 'bullet' as const } : p.bullet.kind === 'auto' ? { list: 'number' as const } : {}) })),
  } as SlideElement
  if (!(el as { label?: string }).label) delete (el as { label?: string }).label
  const plain = ps.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
  return { el, meta: { plain, paras: ps, px, heavy, caps, list, shapeBound: o.shapeBound, name: o.name, boxW: w, boxH: h, lineFactor: lineHeight } }
}

function styleSources(sp: XNode | undefined, ph: ReturnType<typeof phOf>, c: Ctx): { src: StyleSources; own: XNode | undefined; bodies: (XNode | undefined)[] } {
  const style = kid(sp, 'style')
  const fontRef = kid(style, 'fontRef') ? colourIn(kid(style, 'fontRef'), c.colours) : null
  const tx = c.master.txStyles
  const kind = ph ? PH_EQUIV[ph.type] : null
  const masterStyle = kind === 'title' ? kid(tx, 'titleStyle') : kind === 'body' ? kid(tx, 'bodyStyle') : kid(tx, 'otherStyle')
  const chain: (XNode | undefined)[] = [c.pkg.defaultTextStyle, masterStyle]
  const bodies: (XNode | undefined)[] = []
  if (ph && c.origin === 'slide') {
    const lay = matchPh(c.layout.tree, ph)
    const mph = matchPh(c.master.tree, lay ? phOf(lay) ?? ph : ph)
    chain.push(kid(txBodyOf(mph), 'lstStyle'), kid(txBodyOf(lay), 'lstStyle'))
    bodies.push(kid(txBodyOf(mph), 'bodyPr'), kid(txBodyOf(lay), 'bodyPr'))
  }
  return { src: { chain, fontRef, theme: c.theme, colours: c.colours }, own: kid(txBodyOf(sp), 'lstStyle'), bodies }
}
function bodyPrOf(sp: XNode | undefined, inherited: (XNode | undefined)[]): BodyProps {
  const own = kid(txBodyOf(sp), 'bodyPr')
  const merged: XNode = { n: 'bodyPr', a: {}, c: [], t: '' }
  for (const b of [...inherited, own]) { if (!b) continue; Object.assign(merged.a, b.a); const af = b.c.find((x) => ['normAutofit', 'noAutofit', 'spAutoFit'].includes(x.n)); if (af) merged.c = [af] }
  return readBody(merged)
}


function duotoneOf(blip: XNode | undefined, c: Ctx, ph?: string): [string, string] | undefined {
  const d = kid(blip, 'duotone')
  const cols = (d?.c ?? []).map((x) => colourOf(x, ph ? { ...c.colours, ph } : c.colours)).filter(Boolean) as Colour[]
  return cols.length >= 2 ? [cols[0]!.hex, cols[1]!.hex] : undefined
}
function pictureJob(c: Ctx, blip: XNode | undefined, partPath: string, pl: Placed, crop: ImageJob['crop'], flipH: boolean, flipV: boolean): string | null {
  const rid = blip?.a['r:embed']
  const rel = rid ? c.pkg.rels(partPath)[rid] : undefined
  if (!rel || rel.external) { if (rel?.external) c.warn('A linked (not embedded) picture could not be imported'); return null }
  const q = (v: number) => Math.max(16, Math.round(v / 32) * 32)
  const outW = q(Math.min(2400, pl.w * 1.5)), outH = q(Math.min(2400, pl.h * 1.5))
  const duo = duotoneOf(blip, c)
  const key = createHash('sha1').update(`${rel.target}|${crop ? `${crop.l},${crop.t},${crop.r},${crop.b}` : ''}|${flipH}${flipV}|${outW}x${outH}|${duo?.join('') ?? ''}`).digest('hex').slice(0, 20)
  if (!c.jobs.has(key)) c.jobs.set(key, { ref: key, part: partPath, mediaKey: rel.target, crop, flipH, flipV, outW, outH, ...(duo ? { duotone: duo } : {}) })
  return key
}
const cropOf = (bf: XNode | undefined): ImageJob['crop'] => {
  const s = kid(bf, 'srcRect')?.a
  if (!s) return null
  const f = (k: string) => clampN(num(s[k]) / 100000, -0.5, 0.95)
  const out = { l: f('l'), t: f('t'), r: f('r'), b: f('b') }
  return out.l || out.t || out.r || out.b ? out : null
}

function pictureElement(isShape: boolean, bf: XNode, pl: Placed, c: Ctx, geo: Geo | null, nameNode: XNode | undefined): Emitted | null {
  const blip = kid(bf, 'blip')
  const key = pictureJob(c, blip, c.partPath, pl, cropOf(bf), pl.flipH, pl.flipV)
  if (!key) return null
  const alpha = kid(blip, 'alphaModFix')
  const clip = geo?.kind === 'basic' && geo.shape === 'ellipse' ? 'circle' : geo?.kind === 'poly' && geo.points.length === 6 && Math.abs((geo.points[0]![0]) - 0.25) < 0.05 ? 'hex' : 'none'
  const radius = geo?.kind === 'basic' && geo.shape === 'rect' && geo.radius ? clampN(Math.round(geo.radius), 0, 400) : undefined
  const box = baseBox(pl)
  const el = {
    type: 'image' as const, id: id(c), ...box, opacity: alpha ? clampN(num(alpha.a['amt'], 100000) / 100000, 0, 1) : 1, label: (nameNode?.a['name'] ?? '').slice(0, 80) || undefined,
    src: pendingSrc(key), alt: (nameNode?.a['descr'] ?? '').slice(0, 300), fit: 'cover' as const, clip, radius: radius ?? 0, // a picture is square unless the file rounds it (the editor otherwise rounds every picture to the theme's corner)
  } as SlideElement
  if (!(el as { label?: string }).label) delete (el as { label?: string }).label
  const lowKey = c.jobs.get(key)!.mediaKey
  return { el, origin: c.origin, kind: 'picture', pic: { mediaKey: lowKey, masked: clip !== 'none' || !!radius, shape: isShape } }
}

function tableElement(tbl: XNode, pl: Placed, c: Ctx): Emitted | null {
  const rows = kids(tbl, 'tr')
  if (!rows.length) return null
  const cellText = (tc: XNode) => kids(txBodyOf(tc), 'p').map((p) => findAll(p, 't').map((t) => t.t).join('')).filter((s) => s.trim()).join(' ').trim().slice(0, 300)
  let grid = rows.map((r) => kids(r, 'tc').map(cellText))
  const maxCols = Math.max(...grid.map((r) => r.length))
  if (maxCols > 8) { c.warn(`A table with ${maxCols} columns was cut to 8`); grid = grid.map((r) => r.slice(0, 8)) }
  if (grid.length > 21) { c.warn(`A table with ${grid.length} rows was cut to 21`); grid = grid.slice(0, 21) }
  const header = grid[0]!.length ? grid[0]! : ['']
  const cols = header.length
  const body = grid.slice(1).map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''))
  const tcFill = (r: number) => { const tc = kid(rows[r], 'tc'); const f = fillFrom(kid(tc, 'tcPr'), c); return f?.k === 'solid' ? hexOf(f.c) : f?.k === 'none' ? ('none' as const) : undefined }
  const runCol = (r: number) => { const rPr = findAll(kid(rows[r], 'tc'), 'rPr')[0]; const f = fillFrom(rPr, c); return f?.k === 'solid' ? hexOf(f.c) : undefined }
  const tblPr = kid(tbl, 'tblPr')
  const styled = !!kid(tblPr, 'tableStyleId')
  const accent = c.theme.scheme['accent1'] ? `#${c.theme.scheme['accent1']}` : undefined
  let headerFill = tcFill(0), rowFill = rows.length > 1 ? tcFill(1) : undefined, alt = rows.length > 2 ? tcFill(2) : undefined
  let headerColor = runCol(0)
  if (headerFill === undefined && styled && accent && tblPr?.a['firstRow'] !== '0') { headerFill = accent; headerColor ??= isDark(accent) ? '#FFFFFF' : '#000000'; rowFill ??= mix(accent, '#FFFFFF', 0.82); alt ??= mix(accent, '#FFFFFF', 0.9) }
  const textColor = rows.length > 1 ? runCol(1) : undefined
  // merged cells: PowerPoint marks the top-left cell with gridSpan (across) / rowSpan (down) and keeps the covered cells (hMerge / vMerge), so the grid above is whole.
  // Kept as areas of the table (packages/validation table-merge.ts; the file's first row is the header, row -1); an area cut by the 8-column / 21-row limit keeps the part
  // that is left, and a header area reaching into the body (a table can't keep that) is left unmerged with a note.
  const merges: CellArea[] = []
  rows.slice(0, grid.length).forEach((tr, r) => kids(tr, 'tc').slice(0, cols).forEach((tc, col) => {
    const across = Math.max(1, num(tc.a['gridSpan'], 1)), down = Math.max(1, num(tc.a['rowSpan'], 1))
    if (across === 1 && down === 1) return
    const area = { row: r - 1, column: col, rows: Math.min(down, grid.length - r), columns: Math.min(across, cols - col) }
    if (area.row === -1 && area.rows > 1) { c.warn('A header cell merged with the rows below it was kept as separate cells'); return }
    if (!areaProblem({ header, rows: body }, area)) merges.push(area)
  }))
  // each cell's own alignment: the first paragraph's algn (across) and the cell's anchor (up and down); PowerPoint's defaults (left, top) are not stored
  const H = { ctr: 'center', r: 'right' } as const, V = { ctr: 'middle', b: 'bottom' } as const
  const aligns: CellAlign[] = []
  rows.slice(0, grid.length).forEach((tr, r) => kids(tr, 'tc').slice(0, cols).forEach((tc, col) => {
    const algn = kid(kids(txBodyOf(tc), 'p')[0], 'pPr')?.a['algn'], anchor = kid(tc, 'tcPr')?.a['anchor']
    const h = H[algn as keyof typeof H], v = V[anchor as keyof typeof V] ?? (anchor === 't' ? 'top' as const : undefined)
    if (h || v) aligns.push({ row: r - 1, column: col, ...(h ? { h } : {}), ...(v ? { v } : {}) })
  }))
  const box = baseBox(pl)
  const el = {
    ...(aligns.length ? { aligns: aligns.slice(0, 200) } : {}),
    type: 'table' as const, id: id(c), ...box, header, rows: body, ...(headerFill ? { headerFill } : {}), ...(headerColor ? { headerColor } : {}), ...(rowFill ? { rowFill } : {}), ...(alt ? { altRowFill: alt } : {}), ...(textColor ? { textColor } : {}),
    ...(merges.length ? { merges: validMerges({ header, rows: body, merges }) } : {}),
  } as SlideElement
  c.flags.add('table')
  return { el, origin: c.origin, kind: 'table' }
}

function chartElement(chartRoot: XNode, pl: Placed, c: Ctx): Emitted | null {
  const plot = at(kid(chartRoot, 'chart'), 'plotArea')
  const kinds: [string, ChartType][] = [['barChart', 'bar'], ['bar3DChart', 'bar'], ['lineChart', 'line'], ['line3DChart', 'line'], ['pieChart', 'pie'], ['pie3DChart', 'pie'], ['doughnutChart', 'doughnut'], ['areaChart', 'area'], ['area3DChart', 'area'], ['scatterChart', 'scatter']]
  const found = kinds.map(([n, t]) => ({ node: kid(plot, n), t, n })).find((x) => x.node)
  if (!found?.node) return null
  const sers = kids(found.node, 'ser').slice(0, 6)
  // a scatter keeps its x values in xVal and its y values in yVal (read as the labels and the figures; chart-style.ts scatterXs reads the labels back as numbers)
  const scatter = found.t === 'scatter'
  const valuesOf = (ser: XNode, path: 'val' | 'cat') => {
    if (scatter) path = path === 'cat' ? ('xVal' as never) : ('yVal' as never)
    const cache = findAll(kid(ser, path), 'pt').map((p) => ({ idx: num(p.a['idx']), v: kid(p, 'v')?.t ?? '' }))
    return cache
  }
  const catPts = sers[0] ? valuesOf(sers[0], 'cat') : []
  const labels = (catPts.length ? catPts : valuesOf(sers[0]!, 'val').map((p) => ({ idx: p.idx, v: String(p.idx + 1) }))).sort((a, b) => a.idx - b.idx).slice(0, 24).map((p) => p.v.slice(0, 40))
  if (!labels.length) return null
  const series = sers.map((s, i) => {
    const name = findAll(kid(s, 'tx'), 'v')[0]?.t ?? `Series ${i + 1}`
    const byIdx = new Map(valuesOf(s, 'val').map((p) => [p.idx, Number(p.v)]))
    return { name: name.slice(0, 40), values: labels.map((_, k) => { const v = byIdx.get(k); return v !== undefined && Number.isFinite(v) ? v : 0 }) }
  })
  if (!series.length) return null
  const box = baseBox(pl)
  c.warn('A chart was imported with the deck\'s own colours (its original chart styling is not kept)')
  // labels that are not numbers cannot be a scatter's x values: it comes in as a line chart (the screen and the file would draw it so anyway)
  const chartType: ChartType = scatter && !scatterXs(labels) ? 'line' : found.t
  const trendline = sers.some((x) => !!kid(x, 'trendline'))
  return { el: { type: 'chart' as const, id: id(c), ...box, chartType, labels, series, ...(trendline ? { trendline: true } : {}) } as SlideElement, origin: c.origin, kind: 'chart' }
}

/** The editor element(s) for one shape-tree child (and, recursively, a group's children). */
export function walkTree(children: XNode[], m: Aff, c: Ctx, out: Emitted[]): void {
  for (const n of children) {
    if (n.n === 'AlternateContent') { const pick = kid(n, 'Fallback') ?? kid(n, 'Choice'); if (pick) walkTree(pick.c, m, c, out); continue }
    if (n.n === 'grpSp') {
      const gx = readXfrm(kid(kid(n, 'grpSpPr'), 'xfrm'))
      if (n.c.some((x) => x.n === 'nvGrpSpPr' && at(x, 'cNvPr')?.a['hidden'] === '1')) continue
      const gf = fillFrom(kid(n, 'grpSpPr'), c) ?? c.groupFills[c.groupFills.length - 1] ?? null
      c.groupFills.push(gf)
      walkTree(n.c.filter((x) => x.n !== 'nvGrpSpPr' && x.n !== 'grpSpPr'), gx ? mul(m, groupMap(gx)) : m, c, out)
      c.groupFills.pop()
      continue
    }
    // one odd object must never fail the whole import: it is left out, with a note
    const before = out.length
    try {
      if (n.n === 'sp' || n.n === 'cxnSp') shape(n, m, c, out)
      else if (n.n === 'pic') pic(n, m, c, out)
      else if (n.n === 'graphicFrame') frame(n, m, c, out)
    } catch (e) {
      out.length = before
      if (e instanceof RangeError || e instanceof TypeError || e instanceof SyntaxError) c.warn('An object could not be read and was left out')
      else throw e
    }
  }
}

function shape(sp: XNode, m: Aff, c: Ctx, out: Emitted[]) {
  const nv = at(sp, 'nvSpPr') ?? at(sp, 'nvCxnSpPr')
  const cNv = kid(nv, 'cNvPr')
  if (cNv?.a['hidden'] === '1') return
  const ph = phOf(sp)
  if (ph && c.origin !== 'slide') return // placeholders on a layout or master are patterns, not content
  const xf = xfrmChain(sp, ph, c)
  if (!xf || xf.w < 0 || xf.h < 0) return
  const pl = place(mul(m, IDENT), xf)
  const spPr = spPrOf(sp)
  const style = kid(sp, 'style')
  // fill and line: the shape's own, else a placeholder's inherited, else the style reference
  const lay = ph && c.origin === 'slide' ? matchPh(c.layout.tree, ph) : undefined
  const mph = ph && c.origin === 'slide' ? matchPh(c.master.tree, lay ? phOf(lay) ?? ph : ph) : undefined
  const chainNodes = [spPr, spPrOf(lay), spPrOf(mph)]
  let fill: Fill = null
  if (kid(spPr, 'grpFill')) fill = c.groupFills[c.groupFills.length - 1] ?? null
  else for (const s of chainNodes) { fill = fillFrom(s, c); if (fill) break }
  if (!fill) fill = styleFill(style, c)
  let line = lineOf(spPr, style, c)
  if (!kid(spPr, 'ln') && ph) { const inh = [spPrOf(lay), spPrOf(mph)].find((s) => kid(s, 'ln')); if (inh) line = lineOf(inh, undefined, c) }
  const prst = kid(spPr, 'prstGeom')?.a['prst']
  const isLine = n_isLine(sp, prst)
  const text = kid(sp, 'txBody')
  const phType = ph ? PH_EQUIV[ph.type] ?? 'body' : undefined

  if (ph?.type === 'sldNum') { c.hasSlideNumber = true; return } // numbers are drawn by the viewer from the deck's footer setting, so they stay right when slides move
  c.flags.add('seen')

  if (isLine) {
    if (!line) return
    const [x1, y1] = apply(m, xf.flipH ? xf.x + xf.w : xf.x, xf.flipV ? xf.y + xf.h : xf.y)
    const [x2, y2] = apply(m, xf.flipH ? xf.x : xf.x + xf.w, xf.flipV ? xf.y : xf.y + xf.h)
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len < 0.5) return
    const th = clampN(line.widthPx, 1, 80)
    const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
    if (prst && /^(bent|curved)/.test(prst)) c.warn('An elbow or curved connector was drawn as a straight line')
    if (kid(kid(spPr, 'ln'), 'headEnd') || kid(kid(spPr, 'ln'), 'tailEnd')) c.flags.add('arrowheads')
    const el = { type: 'shape' as const, id: id(c), x: r1(cx - len / 2), y: r1(cy - th / 2), width: r1(len), height: r1(th), rotation: r1(ang), locked: false, zIndex: 0, opacity: line.color!.alpha, shape: 'line' as const, fill: hexOf(line.color!), radius: 0, strokeWidth: th, ...(line.dash ? { strokeDash: line.dash } : {}) } as SlideElement
    out.push({ el, origin: c.origin, kind: 'shape' })
    return
  }

  // a shape filled with a picture is a picture
  if (fill?.k === 'pic') {
    const geo = prst ? presetGeometry(prst, adjustments(kid(spPr, 'prstGeom')), pl.w, pl.h) : null
    const p = pictureElement(true, fill.node, pl, c, geo, cNv)
    if (p) { if (phType) p.ph = phType; out.push(p) }
    return
  }
  const sh = shapeElement(sp, pl, fill, line, c, pl.w, pl.h)
  if (sh) out.push({ el: sh.el, origin: c.origin, kind: 'shape' })

  if (text && ph?.type !== 'sldNum') {
    const { src, own, bodies } = styleSources(sp, ph, c)
    const body = bodyPrOf(sp, bodies)
    const paras = readParagraphs(text, src, hyperlinkOf(c), own, 18)
    const role = ph && (ph.type === 'title' || ph.type === 'ctrTitle') ? 'title' : ph?.type === 'subTitle' ? 'subtitle' : 'body'
    const geoInset = sh && sh.geo.kind === 'basic' && sh.geo.shape === 'ellipse' ? { l: pl.w * 0.1464, r: pl.w * 0.1464, t: pl.h * 0.1464, b: pl.h * 0.1464 } : sh && sh.geo.kind === 'basic' && sh.geo.radius ? (() => { const d = sh.geo.radius! * 0.29289; return { l: d, r: d, t: d, b: d } })() : { l: 0, r: 0, t: 0, b: 0 }
    const t = textFrom(paras, body, pl, c, { role, name: cNv?.a['name'] ?? '', shapeBound: !ph && !!sh, inset: geoInset })
    if (t) out.push({ el: t.el, origin: c.origin, kind: 'text', ...(phType ? { ph: ph!.type } : {}), text: t.meta })
  }
}
const n_isLine = (sp: XNode, prst: string | undefined) => sp.n === 'cxnSp' || prst === 'line' || prst === 'straightConnector1'

function pic(p: XNode, m: Aff, c: Ctx, out: Emitted[]) {
  const cNv = at(p, 'nvPicPr/cNvPr')
  if (cNv?.a['hidden'] === '1') return
  const ph = phOf(p)
  if (ph && c.origin !== 'slide') return
  const xf = xfrmChain(p, ph, c)
  if (!xf) return
  const pl = place(m, xf)
  const bf = kid(p, 'blipFill')
  const prst = kid(spPrOf(p), 'prstGeom')
  const geo = prst ? presetGeometry(prst.a['prst'] ?? 'rect', adjustments(prst), pl.w, pl.h) : null
  if (at(p, 'nvPicPr/nvPr/videoFile') || at(p, 'nvPicPr/nvPr/audioFile') || at(p, 'nvPicPr/nvPr/wavAudioFile')) c.flags.add('media')
  const e = bf ? pictureElement(false, bf, pl, c, geo, cNv) : null
  if (!e) { c.warn('A picture could not be imported and was left out'); return }
  out.push(e)
}

function frame(f: XNode, m: Aff, c: Ctx, out: Emitted[]) {
  const nv = at(f, 'nvGraphicFramePr')
  if (kid(nv, 'cNvPr')?.a['hidden'] === '1') return
  const ph = phOf(f)
  if (ph && c.origin !== 'slide') return
  const xf = readXfrm(kid(f, 'xfrm')) ?? xfrmChain(f, ph, c)
  if (!xf) return
  const pl = place(m, xf)
  const data = kid(kid(f, 'graphic'), 'graphicData')
  const uri = data?.a['uri'] ?? ''
  const tbl = kid(data, 'tbl')
  if (tbl) { const e = tableElement(tbl, pl, c); if (e) out.push(e); return }
  if (/chart$/.test(uri)) {
    c.flags.add('chart')
    const rid = kid(data, 'chart')?.a['r:id']
    const rel = rid ? c.pkg.rels(c.partPath)[rid] : undefined
    const root = kid(rel ? c.pkg.part(rel.target) : undefined, 'chartSpace')
    const e = root ? chartElement(root, pl, c) : null
    if (e) out.push(e)
    else c.warn('A chart could not be imported and was left out (only bar, line, pie and doughnut charts are kept)')
    return
  }
  if (/diagram$/.test(uri)) {
    c.flags.add('smartart')
    const drawing = smartArtDrawing(data!, c)
    if (drawing) {
      // the drawing's shapes are in the frame's own space: move them to the frame's place
      const dm = mul(m, { a: 1, b: 0, c: 0, d: 1, e: xf.x, f: xf.y })
      walkTree(kid(drawing, 'spTree')?.c.filter((x) => x.n === 'sp' || x.n === 'grpSp' || x.n === 'pic') ?? [], dm, c, out)
    } else c.warn('SmartArt could not be imported and was left out (open it in PowerPoint and convert it to shapes)')
    return
  }
  const ole = findAll(data, 'oleObj')[0]
  if (ole) {
    c.flags.add('ole')
    const fallback = findAll(ole, 'pic')[0]
    if (fallback) { if (!kid(spPrOf(fallback), 'xfrm')) { const sp = spPrOf(fallback); if (sp) sp.c.push({ n: 'xfrm', a: {}, t: '', c: [{ n: 'off', a: { x: String(xf.x), y: String(xf.y) }, c: [], t: '' }, { n: 'ext', a: { cx: String(xf.w), cy: String(xf.h) }, c: [], t: '' }] }) } pic(fallback, m, c, out); return }
  }
  c.warn('An embedded object (graph, video or other) could not be imported and was left out')
}

function smartArtDrawing(data: XNode, c: Ctx): XNode | undefined {
  const dm = kid(data, 'relIds')?.a['r:dm']
  const rels = c.pkg.rels(c.partPath)
  const dataPart = dm ? rels[dm]?.target : undefined
  const dataRoot = dataPart ? c.pkg.part(dataPart) : undefined
  const relId = findAll(dataRoot, 'dataModelExt')[0]?.a['relId']
  const target = relId ? rels[relId]?.target : Object.values(rels).find((r) => /diagramDrawing$/.test(r.type))?.target
  const drawing = target ? c.pkg.part(target) : undefined
  return kid(drawing, 'drawing')
}

export { duotoneOf }
