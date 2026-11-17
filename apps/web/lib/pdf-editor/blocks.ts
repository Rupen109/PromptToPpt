/**
 * Lines → paragraphs. Pure maths on `Run` boxes (points, page space), no DOM.
 * A visitor expects to click a title or a bullet and change all of it, not one wrapped line of it, so neighbouring lines that look like one
 * paragraph are grouped: similar size, same left edge, and tight spacing (the gap between two lines is small next to the height of a line).
 */
import type { Run } from './render'
import type { Anno, WhiteoutAnno } from './model'
import { charStyles, spansFrom } from './text'

const SIZE_TOLERANCE = 0.2 // lines of one paragraph differ in font size by at most this share
const EDGE_EM = 0.6 // left edges of lines of one paragraph differ by at most this many font sizes
const OCR_MAX_PITCH = 1.6 // read text: the baseline of the next line is at most this many font sizes below (wrapped lines 1.2-1.5; the next bullet or card 1.8 and more). Measured between baselines because the height of the ink depends on whether the line has descenders
const SHORT_LINE = 14 // a LAST line this short has a weak size reading (a word like "teams." has no tall capital): its size is compared loosely

const right = (r: Run) => r.box.x + r.box.w
const bottom = (r: Run) => r.box.y + r.box.h
const left = (r: Run) => r.box.x + (r.pad ?? 0)
const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1]!

/** Tesseract (sparse mode) can cut one line into pieces at wide gaps: put pieces on one baseline back together. Real PDF text is already merged by `extractRuns`. */
export function joinSameLine(runs: Run[]): Run[] {
  const sorted = [...runs].sort((a, b) => a.box.baseline - b.box.baseline || a.box.x - b.box.x)
  const out: Run[] = []
  for (const r of sorted) {
    const prev = r.box.rot ? undefined : out.find((q) => !q.box.rot && Math.abs(q.box.baseline - r.box.baseline) < Math.max(q.box.size, r.box.size) * 0.2 && Math.abs(q.box.size - r.box.size) / Math.max(q.box.size, r.box.size) < SIZE_TOLERANCE && r.box.x >= right(q) - q.box.size * 0.3 && r.box.x - right(q) < q.box.size * 1.0)
    if (!prev) { out.push(r); continue }
    const x0 = Math.min(prev.box.x, r.box.x), x1 = Math.max(right(prev), right(r)), y0 = Math.min(prev.box.y, r.box.y), y1 = Math.max(bottom(prev), bottom(r))
    prev.str = `${prev.str} ${r.str}`
    prev.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, baseline: (prev.box.baseline + r.box.baseline) / 2, size: Math.max(prev.box.size, r.box.size) }
    prev.conf = prev.conf !== undefined && r.conf !== undefined ? Math.min(prev.conf, r.conf) : prev.conf
  }
  return out.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
}

const REAL_SIZE_TOLERANCE = 0.08 // real PDF text has exact sizes: 11 pt and 13 pt are a paragraph and its heading, not one paragraph
const REAL_MAX_PITCH = 1.6 // real text: a next line more than this many font sizes below is not a wrapped line (a list item after one with margin, a new paragraph)
const REAL_PITCH_DRIFT = 0.2 // ...and once a paragraph has a line spacing, a line at a clearly different distance starts something new

type Weight = 'bold' | 'regular' | 'mixed'
/** a line that is mostly bold, mostly regular, or mixes both (a bold lead-in then regular words) */
const weight = (r: Run): Weight => { const s = r.boldShare ?? (r.bold ? 1 : 0); return s >= 0.85 ? 'bold' : s <= 0.15 ? 'regular' : 'mixed' }

/** can `next` (below) continue the paragraph whose last line is `last`? `pitch`: the baseline distance the paragraph already has (real text, from its second line on) */
function continues(last: Run, next: Run, sameFont: boolean, pitch?: number): boolean {
  if (last.box.rot || next.box.rot) return false // turned text is never joined into a paragraph with anything
  const big = Math.max(last.box.size, next.box.size)
  const short = !sameFont && next.str.length <= SHORT_LINE && next.box.size <= last.box.size // the short last line of a paragraph reads smaller than its neighbours
  if (Math.abs(last.box.size - next.box.size) / big > (sameFont ? REAL_SIZE_TOLERANCE : short ? 0.4 : SIZE_TOLERANCE)) return false
  if (sameFont) {
    if (last.fam !== next.fam || last.italic !== next.italic) return false
    const a = weight(last), b = weight(next)
    if (a !== 'mixed' && b !== 'mixed' && a !== b) return false // a bold heading line never joins regular body lines (and the reverse)
  }
  // left-aligned text shares a left edge, centred text (a caption, the words in a diagram box) shares a middle
  const cl = left(last) + (right(last) - left(last)) / 2, cn = left(next) + (right(next) - left(next)) / 2
  if (Math.abs(left(last) - left(next)) > big * EDGE_EM && Math.abs(cl - cn) > big * EDGE_EM) return false
  const d = next.box.baseline - last.box.baseline
  if (d < big * 0.7) return false // not really below (same line, or overlapping)
  if (sameFont) {
    if (d > big * REAL_MAX_PITCH) return false
    if (pitch !== undefined && Math.abs(d - pitch) > pitch * REAL_PITCH_DRIFT) return false
  }
  if (!sameFont && d > big * OCR_MAX_PITCH) return false
  return true
}

/**
 * Group lines into paragraphs. A group of one line stays exactly that line. `sameFont`: real PDF text (exact sizes, fonts and spacing are known, so the
 * tests are strict); OCR's size, bold and serif guesses are noisy, so there the tests are loose.
 */
export function groupRuns(runs: Run[], sameFont: boolean): Run[] {
  const lines = [...runs].sort((a, b) => a.box.baseline - b.box.baseline || a.box.x - b.box.x)
  const groups: Run[][] = []
  const pitchOf = (g: Run[]): number | undefined => (g.length >= 2 ? median(g.slice(1).map((r, k) => r.box.baseline - g[k]!.box.baseline)) : undefined)
  for (const r of lines) {
    let target: Run[] | undefined
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i]!
      if (continues(g[g.length - 1]!, r, sameFont, pitchOf(g))) { target = g; break }
      if (r.box.baseline - g[g.length - 1]!.box.baseline > r.box.size * 4) break
    }
    if (target) target.push(r); else groups.push([r])
  }
  const blocks = groups.map((g, i): Run => {
    if (g.length === 1) return g[0]!
    const x0 = Math.min(...g.map((r) => r.box.x)), x1 = Math.max(...g.map(right)), y0 = g[0]!.box.y, y1 = bottom(g[g.length - 1]!)
    const pitches = g.slice(1).map((r, k) => r.box.baseline - g[k]!.box.baseline)
    const widest = g.reduce((a, b) => (b.box.w > a.box.w ? b : a))
    const confs = g.map((r) => r.conf).filter((c): c is number => c !== undefined)
    const total = g.reduce((s, r) => s + r.box.w, 0)
    const share = g.every((r) => r.boldShare !== undefined) ? g.reduce((s, r) => s + r.box.w * r.boldShare!, 0) / total : undefined
    const bold = share !== undefined ? share >= 0.5 : widest.bold, italic = widest.italic
    // the lines' own bold / italic stretches carry over into the block (offsets move by the lines before)
    const styles: number[] = []
    g.forEach((r, k) => { if (k > 0) styles.push(styles.at(-1) ?? 0); styles.push(...charStyles(r.str, r.bold, r.italic, r.spans)) })
    const spans = g.some((r) => r.spans?.length || r.bold !== bold || r.italic !== italic) && g.every((r) => r.boldShare !== undefined) ? spansFrom(styles, bold, italic) : []
    return {
      id: `b${i}`, str: g.map((r) => r.str).join(' '), fam: widest.fam, bold, italic,
      ...(share !== undefined ? { boldShare: share } : {}), ...(spans.length ? { spans } : {}), ...(g[0]!.marker ? { marker: g[0]!.marker } : {}),
      ...(g[0]!.pad !== undefined ? { pad: median(g.map((r) => r.pad ?? 0)) } : {}), ...(confs.length ? { conf: Math.min(...confs) } : {}),
      box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0, baseline: g[0]!.box.baseline, size: median(g.map((r) => r.box.size)) },
      parts: g, pitch: median(pitches),
    }
  })
  return blocks.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
}

/** a run that mixes bold and regular words whose looks could NOT be kept as spans (the new text then has one weight) */
export const isMixedWeight = (r: Run): boolean => r.boldShare !== undefined && r.boldShare > 0.05 && r.boldShare < 0.95 && !r.spans?.length

/** the lines of a run (a paragraph's own lines, or the run itself) */
export const linesOf = (r: Run): Run[] => r.parts ?? [r]

/** a whiteout that covers the whole box (1 pt slack) */
export const coveredBy = (annos: Anno[], b: { x: number; y: number; w: number; h: number }): boolean =>
  annos.some((a): a is WhiteoutAnno => a.kind === 'whiteout' && a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.w >= b.x + b.w - 1 && a.y + a.h >= b.y + b.h - 1)
/** hidden from the clickable list: a line the visitor already covered; a paragraph with ANY covered line (it was changed already, change the rest line by line) */
export const runCovered = (annos: Anno[], r: Run): boolean => linesOf(r).some((l) => coveredBy(annos, l.box)) || coveredBy(annos, r.box)

/** the line of a paragraph nearest to page-space height `y` (for Alt-click: edit just that line) */
export function lineAt(r: Run, y: number): Run {
  return linesOf(r).reduce((a, b) => (Math.abs(b.box.y + b.box.h / 2 - y) < Math.abs(a.box.y + a.box.h / 2 - y) ? b : a))
}
