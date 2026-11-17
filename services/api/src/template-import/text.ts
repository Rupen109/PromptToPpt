import { colourIn, type Colour, type ColourContext } from './color.ts'
import { kid, kids, num, type XNode } from './xml.ts'
import type { ThemeData } from './package.ts'

/**
 * Text: runs resolved through the whole inheritance chain a PowerPoint text box has —
 * presentation default -> master text style (title / body / other) -> shape style font reference -> master placeholder -> layout placeholder -> the shape's own list style -> paragraph -> run.
 */
export interface Props {
  algn?: string
  lnSpcPct?: number; lnSpcPts?: number
  spcBefPct?: number; spcBefPts?: number; spcAftPct?: number; spcAftPts?: number
  bu?: 'none' | 'char' | 'auto'; buChar?: string; buFont?: string
  sz?: number; b?: boolean; i?: boolean; u?: boolean; cap?: boolean; spc?: number
  colour?: Colour; font?: string
}
const merge = (base: Props, over: Props): Props => { const out = { ...base }; for (const [k, v] of Object.entries(over)) if (v !== undefined) (out as Record<string, unknown>)[k] = v; return out }

/** the properties one `lvlNpPr` (or a paragraph's `pPr`, or a run's `rPr` / `defRPr`) sets */
export function readProps(pPr: XNode | undefined, ctx: ColourContext): Props {
  if (!pPr) return {}
  const p: Props = {}
  if (pPr.a['algn']) p.algn = pPr.a['algn']
  const ln = kid(pPr, 'lnSpc')
  if (ln) { const pct = kid(ln, 'spcPct'), pts = kid(ln, 'spcPts'); if (pct) p.lnSpcPct = num(pct.a['val']) / 100000; else if (pts) p.lnSpcPts = num(pts.a['val']) / 100 }
  const bef = kid(pPr, 'spcBef'), aft = kid(pPr, 'spcAft')
  if (bef) { const pct = kid(bef, 'spcPct'), pts = kid(bef, 'spcPts'); if (pct) p.spcBefPct = num(pct.a['val']) / 100000; else if (pts) p.spcBefPts = num(pts.a['val']) / 100 }
  if (aft) { const pct = kid(aft, 'spcPct'), pts = kid(aft, 'spcPts'); if (pct) p.spcAftPct = num(pct.a['val']) / 100000; else if (pts) p.spcAftPts = num(pts.a['val']) / 100 }
  if (kid(pPr, 'buNone')) p.bu = 'none'
  else if (kid(pPr, 'buAutoNum')) p.bu = 'auto'
  else { const bc = kid(pPr, 'buChar'); if (bc) { p.bu = 'char'; p.buChar = bc.a['char'] ?? '•' } }
  const bf = kid(pPr, 'buFont')?.a['typeface']
  if (bf) p.buFont = bf
  // a run's own properties live on the node itself; a list level's live on its defRPr child
  const r = pPr.n === 'rPr' || pPr.n === 'defRPr' || pPr.n === 'endParaRPr' ? pPr : kid(pPr, 'defRPr')
  if (r) {
    if (r.a['sz']) p.sz = num(r.a['sz']) / 100
    if (r.a['b'] !== undefined) p.b = r.a['b'] === '1' || r.a['b'] === 'true'
    if (r.a['i'] !== undefined) p.i = r.a['i'] === '1' || r.a['i'] === 'true'
    if (r.a['u'] !== undefined) p.u = r.a['u'] !== 'none'
    if (r.a['cap'] !== undefined) p.cap = r.a['cap'] === 'all'
    if (r.a['spc'] !== undefined) p.spc = num(r.a['spc']) / 100
    const sf = kid(r, 'solidFill')
    if (sf) { const c = colourIn(sf, ctx); if (c) p.colour = c }
    const latin = kid(r, 'latin')
    if (latin?.a['typeface']) p.font = latin.a['typeface']
  }
  return p
}

const lvlNode = (style: XNode | undefined, lvl: number) => kid(style, `lvl${Math.min(9, lvl + 1)}pPr`)

export interface TextRun { text: string; b: boolean; i: boolean; u: boolean; cap: boolean; spc: number; sz: number; colour: Colour; font: string; link?: string }
export interface TextPara { level: number; algn: string; bullet: { kind: 'none' } | { kind: 'char'; char: string; font?: string } | { kind: 'auto' }; lineSpacing: number | null; spaceBefore: number; spaceAfter: number; runs: TextRun[]; lnSpcPts?: number }
export interface BodyProps { anchor: 'top' | 'middle' | 'bottom'; lIns: number; tIns: number; rIns: number; bIns: number; wrap: boolean; fontScale: number; lnSpcReduction: number; vert: string; autofit: 'none' | 'shrink' | 'grow' }

export interface StyleSources {
  /** lowest priority first: presentation default, master text style for this kind of shape, ...  (each is a node holding lvlNpPr children) */
  chain: (XNode | undefined)[]
  /** the shape style's font reference colour, applied above the master text style */
  fontRef?: Colour | null | undefined
  theme: ThemeData
  colours: ColourContext
}

export function readBody(bodyPr: XNode | undefined): BodyProps {
  const a = bodyPr?.a ?? {}
  const norm = kid(bodyPr, 'normAutofit')
  return {
    anchor: a['anchor'] === 'ctr' || a['anchor'] === 'just' || a['anchor'] === 'dist' ? 'middle' : a['anchor'] === 'b' ? 'bottom' : 'top',
    lIns: num(a['lIns'], 91440), tIns: num(a['tIns'], 45720), rIns: num(a['rIns'], 91440), bIns: num(a['bIns'], 45720),
    wrap: a['wrap'] !== 'none',
    fontScale: norm ? num(norm.a['fontScale'], 100000) / 100000 : 1,
    lnSpcReduction: norm ? num(norm.a['lnSpcReduction'], 0) / 100000 : 0,
    vert: a['vert'] ?? 'horz',
    autofit: norm ? 'shrink' : kid(bodyPr, 'spAutoFit') ? 'grow' : 'none',
  }
}

/** The theme's fonts by their placeholder names (+mj-lt, +mn-lt); a script font reference (+mj-ea) falls back to the Latin one. */
export const themeFont = (face: string | undefined, theme: ThemeData): string => (!face ? theme.minor : /^\+mj/.test(face) ? theme.major : /^\+mn/.test(face) ? theme.minor : face)

export function readParagraphs(txBody: XNode | undefined, src: StyleSources, hyperlink: (rid: string) => string | undefined, ownList: XNode | undefined, defaultSz = 18): TextPara[] {
  const out: TextPara[] = []
  for (const p of kids(txBody, 'p')) {
    const pPr = kid(p, 'pPr')
    const level = Math.min(8, Math.max(0, num(pPr?.a['lvl'], 0)))
    let props: Props = {}
    for (const s of src.chain) props = merge(props, readProps(lvlNode(s, level), src.colours))
    if (src.fontRef) props = merge(props, { colour: src.fontRef })
    props = merge(props, readProps(lvlNode(ownList, level), src.colours))
    // (a placeholder's own list style is applied through `chain` by the caller, before this)
    const para = merge(props, readProps(pPr, src.colours))
    const runs: TextRun[] = []
    const breakParas: { runs: TextRun[] }[] = [{ runs }]
    let cur = runs
    for (const r of p.c) {
      if (r.n === 'br') { const next: TextRun[] = []; breakParas.push({ runs: next }); cur = next; continue }
      if (r.n !== 'r' && r.n !== 'fld') continue
      const t = kid(r, 't')?.t ?? ''
      const rPr = kid(r, 'rPr')
      const rid = kid(rPr, 'hlinkClick')?.a['r:id']
      const rp = merge(para, readProps(rPr, src.colours))
      const link = rid ? hyperlink(rid) : undefined
      cur.push({ text: t, b: !!rp.b, i: !!rp.i, u: !!rp.u, cap: !!rp.cap, spc: rp.spc ?? 0, sz: rp.sz ?? defaultSz, colour: rp.colour ?? { hex: '#000000', alpha: 1 }, font: themeFont(rp.font, src.theme), ...(link ? { link } : {}) })
    }
    const endSz = readProps(kid(p, 'endParaRPr'), src.colours).sz
    breakParas.forEach((bp, k) => {
      const text = bp.runs.map((r) => r.text).join('')
      const empty = !text.trim()
      const runsOut = bp.runs.filter((r) => r.text !== '')
      const bullet: TextPara['bullet'] = k > 0 ? { kind: 'none' } : para.bu === 'char' ? { kind: 'char', char: para.buChar ?? '•', ...(para.buFont ? { font: para.buFont } : {}) } : para.bu === 'auto' ? { kind: 'auto' } : { kind: 'none' }
      const first = bp.runs[0]
      out.push({
        level, algn: para.algn ?? 'l', bullet: empty ? { kind: 'none' } : bullet,
        lineSpacing: para.lnSpcPct ?? null, ...(para.lnSpcPts ? { lnSpcPts: para.lnSpcPts } : {}),
        spaceBefore: spacing(para.spcBefPct, para.spcBefPts), spaceAfter: spacing(para.spcAftPct, para.spcAftPts),
        runs: runsOut.length ? runsOut : [{ text: '', b: false, i: false, u: false, cap: false, spc: 0, sz: endSz ?? first?.sz ?? para.sz ?? defaultSz, colour: para.colour ?? { hex: '#000000', alpha: 1 }, font: themeFont(para.font, src.theme) }],
      })
    })
  }
  return out
}
/** space as a multiple of the font size is resolved later; percentages are kept as negative numbers, points as positive */
const spacing = (pct: number | undefined, pts: number | undefined): number => (pts !== undefined ? pts : pct !== undefined ? -pct : 0)
