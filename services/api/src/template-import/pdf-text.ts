import type { Chunk } from './pdf-ops.ts'
import { weightHint } from './fonts.ts'

/**
 * Text pieces of a PDF page -> lines -> paragraphs -> text boxes. A PDF has no text boxes: every line is placed by itself, so what a person sees as "one bullet list" or "a title"
 * is rebuilt from positions. Pure maths on `Chunk`s (points, page space, y down); no pdf.js here. Rules are the free PDF editor's (apps/web/lib/pdf-editor/blocks.ts) in spirit:
 * neighbouring lines that share a left edge (or middle), a size, a colour and a tight line pitch are one paragraph; paragraphs with the same look and a small gap are one box.
 */

export interface RunSeg { text: string; bold: boolean; italic: boolean; color: string }
export interface Line {
  /** upright text only (angle 0); turned text is a `Line` of its own with `angle` */
  x: number
  /** baseline y */
  y: number
  w: number
  size: number
  angle: number
  segs: RunSeg[]
  text: string
  color: string
  bold: boolean
  italic: boolean
  mono: boolean
  serif: boolean
  fontName: string
  alpha: number
  /** a list marker that started the line (its glyph); the words start at `x` */
  marker?: { glyph: string; x: number; kind: 'bullet' | 'number'; font: string }
  order: number
  /** spacing added between letters (pt), 0 = none */
  spacing: number
}
export interface Paragraph { lines: Line[]; pitch: number | null }
export interface TextBox {
  paras: Paragraph[]
  size: number
  color: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  fontName: string
  mono: boolean
  serif: boolean
  alpha: number
  angle: number
  order: number
  spacing: number
  /** left edge of the words, right edge of the widest line, baseline of first and last line (page space) */
  left: number
  right: number
  firstBaseline: number
  lastBaseline: number
  list: 'bullet' | 'number' | null
  bulletGlyph: string
}

const BULLET = /^[•◦▪▫‣⁃·●○■□◆◇▶►➢➤➔→✓✔–—\-*o]$/
const NUMBER = /^(\d{1,3}|[a-zA-Z])[.)]$/
const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1]!

/** the family a font name stands for ("ABCDEF+Aptos-Bold" -> "Aptos", "TimesNewRomanPSMT" -> "Times New Roman", "SegoeUI-Semibold" -> "Segoe UI") */
export function familyOf(name: string): string {
  let n = name.replace(/^[A-Z]{6}\+/, '').trim()
  n = n.split(/[-,]/)[0]!.replace(/(PSMT|MT|PS)$/, '').trim()
  n = n.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_]+/g, ' ')
  n = n.replace(/\s+(Regular|Roman|Normal|Book)$/i, '').trim()
  return n || 'Arial'
}
export const weightOf = (name: string, bold: boolean): number => weightHint(name.replace(/^[A-Z]{6}\+/, '').replace(/[-_,]/g, ' ')) ?? (bold ? 700 : 400)

const sameLine = (a: Chunk, b: Chunk) => Math.abs(a.y - b.y) < Math.max(a.size, b.size) * 0.28 && Math.abs(a.size - b.size) / Math.max(a.size, b.size) < 0.35

/** Chunks of one orientation -> lines. A piece joins the line it continues; a wide gap starts a new line (a column, a table cell, a label beside a number). */
export function toLines(chunks: Chunk[], pageW: number): Line[] {
  const up = chunks.filter((c) => Math.abs(c.angle) < 1.5 && c.text.length > 0)
  const turned = chunks.filter((c) => Math.abs(c.angle) >= 1.5)
  const sorted = [...up].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Line[] = []
  const accs: { chunks: Chunk[] }[] = []
  for (const c of sorted) {
    let target: { chunks: Chunk[] } | undefined
    for (let i = accs.length - 1; i >= Math.max(0, accs.length - 12); i--) {
      const acc = accs[i]!
      const last = acc.chunks[acc.chunks.length - 1]!
      if (!sameLine(last, c)) continue
      const gap = c.x - (last.x + last.w)
      // behind or on top of the previous piece (letters placed by hand), or only a short gap: the same line
      // letter-spaced words arrive one letter per piece: the rhythm of the line says how wide a word gap may be
      const recent = acc.chunks.length >= 3 && acc.chunks.slice(-4).every((k) => k.text.trim().length <= 2) ? median(acc.chunks.slice(1).map((k, j) => k.x - (acc.chunks[j]!.x + acc.chunks[j]!.w)).filter((g) => g > 0.05)) : 0
      if (gap > -last.size * 0.6 && gap < Math.max(Math.max(last.size, c.size) * 1.1, recent * 3.4)) { target = acc; break }
    }
    if (target) target.chunks.push(c); else accs.push({ chunks: [c] })
  }
  void pageW
  for (const acc of accs) lines.push(lineOf(acc.chunks))
  for (const t of turned) lines.push(lineOf([t]))
  return lines.filter((l) => /\S/.test(l.text)).sort((a, b) => a.y - b.y || a.x - b.x)
}

function lineOf(cs: Chunk[]): Line {
  const segs: RunSeg[] = []
  let text = ''
  let prev: Chunk | undefined
  const weight = { bold: 0, total: 0, italic: 0 }
  const byColour = new Map<string, number>()
  const bySize = new Map<number, number>()
  // letter-spaced text arrives as one piece per letter: the gap between letters is the spacing, a wider gap is a space
  const gaps = cs.slice(1).map((c, i) => c.x - (cs[i]!.x + cs[i]!.w))
  const short = cs.filter((c) => c.text.trim().length <= 2).length
  const spaced = cs.length >= 4 && short >= cs.length * 0.7
  const unit = spaced ? median(gaps.filter((g) => g > 0.05)) || 0 : 0
  for (const c of cs) {
    let t = c.text
    if (prev) {
      const gap = c.x - (prev.x + prev.w)
      const needSpace = gap > (spaced && unit > 0 ? Math.max(unit * 1.9, Math.min(c.size, prev.size) * 0.14) : Math.min(c.size, prev.size) * 0.14) && !/\s$/.test(text) && !/^\s/.test(t)
      if (needSpace) t = ' ' + t
    }
    const w = Math.max(1, t.replace(/\s/g, '').length)
    weight.total += w; if (c.bold) weight.bold += w; if (c.italic) weight.italic += w
    byColour.set(c.color, (byColour.get(c.color) ?? 0) + w)
    const sk = Math.round(c.size * 2) / 2
    bySize.set(sk, (bySize.get(sk) ?? 0) + w)
    const last = segs[segs.length - 1]
    if (last && last.bold === c.bold && last.italic === c.italic && last.color === c.color) last.text += t
    else segs.push({ text: t, bold: c.bold, italic: c.italic, color: c.color })
    text += t
    prev = c
  }
  segs[0]!.text = segs[0]!.text.replace(/^\s+/, '')
  segs[segs.length - 1]!.text = segs[segs.length - 1]!.text.replace(/\s+$/, '')
  text = text.trim()
  const first = cs[0]!, lastC = cs[cs.length - 1]!
  const color = [...byColour].sort((a, b) => b[1] - a[1])[0]![0]
  const size = [...bySize].sort((a, b) => b[1] - a[1])[0]![0]
  const widest = cs.reduce((a, b) => (b.text.length > a.text.length ? b : a))
  const right = lastC.x + lastC.w
  const line: Line = {
    x: first.x, y: median(cs.map((c) => c.y)), w: Math.max(0, right - first.x), size, angle: first.angle, segs: segs.filter((s) => s.text.length > 0), text, color,
    bold: weight.bold / weight.total >= 0.5, italic: weight.italic / weight.total >= 0.5, mono: widest.mono, serif: widest.serif, fontName: widest.fontName, alpha: first.alpha, order: first.order, spacing: spaced ? unit : 0,
  }
  // a list marker is its own piece at the start: "•" or "1." followed by the words
  if (cs.length >= 2 && Math.abs(first.angle) < 1.5) {
    const m = first.text.trim()
    const second = cs[1]!
    const gap = second.x - (first.x + first.w)
    if ((BULLET.test(m) || NUMBER.test(m)) && gap > -1 && gap < first.size * 2.5 && second.text.trim().length > 0 && !(m === 'o' && false)) {
      const isNum = NUMBER.test(m) && !BULLET.test(m)
      // "-" and "o" are only markers when something else says list (a gap wider than a space)
      if (isNum || !/^[-o*]$/.test(m) || gap > first.size * 0.35) {
        const rest = lineOf(cs.slice(1))
        return { ...rest, x: second.x, marker: { glyph: m, x: first.x, kind: isNum ? 'number' : 'bullet', font: first.fontName }, order: first.order }
      }
    }
  }
  // a marker and the words in one piece ("• Word")
  const lead = /^([•◦▪▫‣⁃●○■□◆▶►➢➤➔→✓✔])\s+(?=\S)/.exec(line.text)
  if (lead && cs.length >= 1 && Math.abs(first.angle) < 1.5) {
    const shift = Math.min(line.w * 0.5, line.size * 0.9)
    const segs2 = line.segs.map((s, i) => (i === 0 ? { ...s, text: s.text.replace(/^[^\s]+\s+/, '') } : s)).filter((s) => s.text.length > 0)
    return { ...line, segs: segs2, text: line.text.slice(lead[0].length), x: line.x + shift, w: Math.max(1, line.w - shift), marker: { glyph: lead[1]!, x: line.x, kind: 'bullet', font: first.fontName } }
  }
  return line
}

const leftOf = (l: Line) => l.x
const centreOf = (l: Line) => l.x + l.w / 2
const rightOf = (l: Line) => l.x + l.w
const weightClass = (l: Line) => (l.bold ? 'b' : 'r')

/** can `next` (below `last`) be the next line of the same paragraph? */
function continues(last: Line, next: Line, pitch: number | null): boolean {
  if (last.angle !== 0 || next.angle !== 0 || next.marker) return false
  const big = Math.max(last.size, next.size)
  if (Math.abs(last.size - next.size) / big > 0.09) return false
  if (last.color !== next.color || weightClass(last) !== weightClass(next)) return false
  if (last.fontName && next.fontName && last.fontName.replace(/^[A-Z]{6}\+/, '') !== next.fontName.replace(/^[A-Z]{6}\+/, '') && last.italic === next.italic && familyOf(last.fontName) !== familyOf(next.fontName)) return false
  const d = next.y - last.y
  if (d < big * 0.7 || d > big * 1.75) return false
  if (pitch !== null && Math.abs(d - pitch) > Math.max(1, pitch * 0.2)) return false
  const edge = Math.abs(leftOf(last) - leftOf(next)) <= big * 0.6
  const middle = Math.abs(centreOf(last) - centreOf(next)) <= big * 0.6 && Math.abs(leftOf(last) - leftOf(next)) > big * 0.6
  const rightEdge = Math.abs(rightOf(last) - rightOf(next)) <= big * 0.6 && !edge
  return edge || middle || rightEdge
}

export function toParagraphs(lines: Line[]): Paragraph[] {
  const groups: Line[][] = []
  const pitchOf = (g: Line[]) => (g.length >= 2 ? median(g.slice(1).map((l, i) => l.y - g[i]!.y)) : null)
  for (const l of lines) {
    let target: Line[] | undefined
    for (let i = groups.length - 1; i >= Math.max(0, groups.length - 14); i--) {
      const g = groups[i]!
      if (continues(g[g.length - 1]!, l, pitchOf(g))) { target = g; break }
      if (l.y - g[g.length - 1]!.y > l.size * 4) break
    }
    if (target) target.push(l); else groups.push([l])
  }
  return groups.map((g) => ({ lines: g, pitch: pitchOf(g) }))
}

const firstLine = (p: Paragraph) => p.lines[0]!
const lastLine = (p: Paragraph) => p.lines[p.lines.length - 1]!

/** paragraphs of one look and a small gap are one box (a bullet list, a text with paragraph spacing); anything else is a box of its own */
export function toBoxes(paras: Paragraph[], pageW: number): TextBox[] {
  const sorted = [...paras].sort((a, b) => firstLine(a).y - firstLine(b).y || firstLine(a).x - firstLine(b).x)
  const groups: Paragraph[][] = []
  for (const p of sorted) {
    let target: Paragraph[] | undefined
    for (let i = groups.length - 1; i >= Math.max(0, groups.length - 14); i--) {
      const g = groups[i]!
      const a = lastLine(g[g.length - 1]!), b = firstLine(p)
      if (a.angle !== 0 || b.angle !== 0) continue
      const big = Math.max(a.size, b.size)
      const d = b.y - a.y
      if (d > big * 3.2) { if (b.y - a.y > big * 6) break; continue }
      if (d < big * 0.7) continue
      if (Math.abs(a.size - b.size) / big > 0.09 || a.color !== b.color || weightClass(a) !== weightClass(b)) continue
      const first = firstLine(g[0]!)
      const bothListed = !!first.marker && !!b.marker
      const noneListed = !first.marker && !b.marker && !g.some((q) => firstLine(q).marker)
      if (!bothListed && !noneListed) continue
      const sameLeft = Math.abs(first.x - b.x) <= big * 0.6
      const sameMiddle = Math.abs(centreOf(first) - centreOf(b)) <= big * 0.8 && !sameLeft
      if (!sameLeft && !sameMiddle) continue
      // unlisted paragraphs join only when the gap is a paragraph gap, not a fresh block further down
      if (noneListed && d > big * 2.4) continue
      target = g; break
    }
    if (target) target.push(p); else groups.push([p])
  }
  const boxes: TextBox[] = []
  for (const g of groups) {
    const lines = g.flatMap((p) => p.lines)
    const f = firstLine(g[0]!)
    const left = Math.min(...lines.map(leftOf)), right = Math.max(...lines.map(rightOf))
    const widths = lines.map((l) => l.w)
    const w = Math.max(...widths)
    // alignment from how the lines sit against each other; a lone line is judged against the page
    let align: TextBox['align'] = 'left'
    if (lines.length >= 2) {
      const lefts = lines.map(leftOf), rights = lines.map(rightOf), mids = lines.map(centreOf)
      const spread = (v: number[]) => Math.max(...v) - Math.min(...v)
      const tol = f.size * 0.5
      if (spread(lefts) <= tol) align = 'left'
      else if (spread(mids) <= tol) align = 'center'
      else if (spread(rights) <= tol) align = 'right'
    } else if (Math.abs(centreOf(f) - pageW / 2) < pageW * 0.012 && f.x > pageW * 0.08 && f.w < pageW * 0.9) align = 'center'
    const byColour = new Map<string, number>(), bySize = new Map<number, number>()
    let boldW = 0, tot = 0, italicW = 0
    for (const l of lines) { const n = Math.max(1, l.text.length); byColour.set(l.color, (byColour.get(l.color) ?? 0) + n); bySize.set(l.size, (bySize.get(l.size) ?? 0) + n); tot += n; if (l.bold) boldW += n; if (l.italic) italicW += n }
    const widest = lines.reduce((a, b) => (b.text.length > a.text.length ? b : a))
    const listed = g.some((p) => firstLine(p).marker)
    boxes.push({
      paras: g, size: [...bySize].sort((a, b) => b[1] - a[1])[0]![0], color: [...byColour].sort((a, b) => b[1] - a[1])[0]![0], bold: boldW / tot >= 0.5, italic: italicW / tot >= 0.5, align,
      fontName: widest.fontName, mono: widest.mono, serif: widest.serif, alpha: f.alpha, angle: f.angle, order: Math.min(...lines.map((l) => l.order)), spacing: median(lines.map((l) => l.spacing)),
      left, right: Math.max(right, left + w), firstBaseline: f.y, lastBaseline: lastLine(g[g.length - 1]!).y,
      list: listed ? (firstLine(g[0]!).marker?.kind ?? 'bullet') : null, bulletGlyph: firstLine(g.find((p) => firstLine(p).marker) ?? g[0]!).marker?.glyph ?? '•',
    })
  }
  return boxes
}
