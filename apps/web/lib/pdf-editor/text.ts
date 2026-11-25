/**
 * Text helpers: which characters a standard PDF font can write, which font to use, measuring, mixed bold / italic stretches (spans), and the picture
 * fallback for everything else (Arabic, Hindi, Chinese, emoji…). Browser-only parts use a canvas; the rest is pure.
 *
 * One rule keeps the screen and the saved file the same: every line of a text item is laid out ONCE (`retext` stores `lines` and, with spans, `sty`), and
 * the screen, the PDF and the picture fallback all draw exactly those lines, each stretch of a line in its own font. Kerning is off on the canvas and
 * on screen (pdf-lib writes plain advance widths), so a width measured here is the width written there.
 */
import type { StandardFonts } from 'pdf-lib'
import type { Family, Span, TextAnno } from './model'
import { FONT_DEFS, fontDef } from './fonts'

export const LINE_HEIGHT = 1.2
/** where new text must not run past on a page `pw` wide when it starts at `x`: a margin like the one the page already has on that side (12 to 36 pt) */
export const rightEdge = (pw: number, x: number): number => pw - Math.min(Math.max(x * 0.6, 12), 36)
/** where the first baseline sits inside a text box, as a share of the font size (box top → baseline) */
export const BASELINE = Object.fromEntries(FONT_DEFS.map((f) => [f.id, f.baseline])) as Record<Family, number>
export const FAMILIES: { value: Family; label: string }[] = FONT_DEFS.map((f) => ({ value: f.id, label: f.label }))
export const CSS_FAMILY = Object.fromEntries(FONT_DEFS.map((f) => [f.id, f.css])) as Record<Family, string>

/** characters beyond ASCII and Latin-1 that Windows-1252 (PDF "WinAnsi") also holds */
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
export function isWinAnsi(text: string): boolean {
  for (const ch of text) {
    if (ch === '\n' || ch === '\t') continue
    const c = ch.codePointAt(0)!
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch)) continue
    return false
  }
  return true
}
/** Hebrew, Arabic, Syriac, Thaana… and their presentation forms. Written as escapes: typed as letters, "יִ" is two code points and the range swallowed nearly every non-Latin character (dashes, ₹, Devanagari, CJK). */
export const hasRtl = (text: string): boolean => /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(text)
/** Devanagari and the other scripts that need shaping (joined letters): they are drawn as a picture so the shapes are right */
export const needsShaping = (text: string): boolean => hasRtl(text) || /[ऀ-෿฀-໿က-႟]/.test(text)

export type FontKey = keyof typeof StandardFonts
export function fontKey(fam: Family, bold: boolean, italic: boolean): FontKey {
  const g = fontDef(fam).group
  if (g === 'serif') return bold ? (italic ? 'TimesRomanBoldItalic' : 'TimesRomanBold') : italic ? 'TimesRomanItalic' : 'TimesRoman'
  if (g === 'mono') return bold ? (italic ? 'CourierBoldOblique' : 'CourierBold') : italic ? 'CourierOblique' : 'Courier'
  return bold ? (italic ? 'HelveticaBoldOblique' : 'HelveticaBold') : italic ? 'HelveticaOblique' : 'Helvetica'
}

/** guess family / weight / slant from a PDF font name such as "ABCDEF+Arial-BoldMT"; `generic` is pdf.js's own fallback guess */
export function guessFont(name: string, generic: string | undefined, flags?: { bold?: boolean; italic?: boolean; isMonospace?: boolean; isSerifFont?: boolean }): { fam: Family; bold: boolean; italic: boolean } {
  const n = name.replace(/^[A-Z]{6}\+/, '')
  let fam: Family = 'sans'
  if (/courier|mono|consolas|menlo|typewriter|code/i.test(n) || generic === 'monospace' || flags?.isMonospace) fam = 'mono'
  else if ((/times|serif|georgia|garamond|palatino|minion|cambria|book|roman|baskerville|caslon|century/i.test(n) && !/sans/i.test(n)) || ((generic === 'serif' || flags?.isSerifFont) && !/sans|arial|helvet/i.test(n))) fam = 'serif'
  return { fam, bold: /bold|black|heavy|semibold|demi|extrabold/i.test(n) || !!flags?.bold, italic: /italic|oblique/i.test(n) || !!flags?.italic }
}

let measureCtx: CanvasRenderingContext2D | null = null
const ctx = (): CanvasRenderingContext2D => { if (!measureCtx) { measureCtx = document.createElement('canvas').getContext('2d')!; measureCtx.fontKerning = 'none' } return measureCtx }
export const cssFont = (fam: Family, bold: boolean, italic: boolean, size: number): string => `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${CSS_FAMILY[fam]}`
const fontCss = (a: Pick<TextAnno, 'fam' | 'size' | 'bold' | 'italic'>, size = a.size): string => cssFont(a.fam, a.bold, a.italic, size)

// ---------- styles per character (spans) ----------
export const BOLD = 1, ITALIC = 2
export const hasSpans = (a: Pick<TextAnno, 'spans'>): boolean => !!a.spans && a.spans.length > 0
/** one style code (0..3) per character of `text` */
export function charStyles(text: string, bold: boolean, italic: boolean, spans: Span[] | undefined): number[] {
  const base = (bold ? BOLD : 0) | (italic ? ITALIC : 0)
  const out = Array.from({ length: text.length }, () => base)
  for (const s of spans ?? []) for (let i = Math.max(0, s.s); i < Math.min(text.length, s.e); i++) out[i] = (s.bold ? BOLD : 0) | (s.italic ? ITALIC : 0)
  return out
}
/** the stretches that differ from the base style, as spans */
export function spansFrom(styles: number[], bold: boolean, italic: boolean): Span[] {
  const base = (bold ? BOLD : 0) | (italic ? ITALIC : 0)
  const out: Span[] = []
  for (let i = 0; i < styles.length; i++) {
    if (styles[i] === base) continue
    const st = styles[i]!, s = i
    while (i + 1 < styles.length && styles[i + 1] === st) i++
    out.push({ s, e: i + 1, bold: !!(st & BOLD), italic: !!(st & ITALIC) })
  }
  return out
}
/**
 * The text changed from `old` to `now` (typing, delete, paste): spans follow the characters. What is typed inside a stretch, or right after it, takes that
 * stretch's style; the rest keeps its style.
 */
export function editSpans(spans: Span[] | undefined, old: string, now: string, bold: boolean, italic: boolean): Span[] | undefined {
  if (!spans || !spans.length) return spans
  let p = 0
  while (p < old.length && p < now.length && old[p] === now[p]) p++
  let q = 0
  while (q < old.length - p && q < now.length - p && old[old.length - 1 - q] === now[now.length - 1 - q]) q++
  const styles = charStyles(old, bold, italic, spans)
  const base = (bold ? BOLD : 0) | (italic ? ITALIC : 0)
  const inserted = now.length - p - q
  // typed text takes the style of the character before it; a text replaced as a whole takes the dominant style of what it replaced
  const whole = p === 0 && q === 0
  const dom = dominantStyle(old, styles)
  const like = whole ? (dom.bold ? BOLD : 0) | (dom.italic ? ITALIC : 0) : p > 0 ? styles[p - 1]! : styles[0] ?? base
  const next = [...styles.slice(0, p), ...Array.from({ length: inserted }, () => like), ...styles.slice(old.length - q)]
  return spansFrom(next, bold, italic)
}
/** set or clear bold / italic on characters [s, e): if every character already has it, it is cleared, else it is set */
export function toggleRange(a: Pick<TextAnno, 'text' | 'bold' | 'italic' | 'spans'>, s: number, e: number, which: 'bold' | 'italic'): Span[] {
  const styles = charStyles(a.text, a.bold, a.italic, a.spans)
  const bit = which === 'bold' ? BOLD : ITALIC
  const all = styles.slice(s, e).every((x) => x & bit)
  for (let i = s; i < e; i++) styles[i] = all ? styles[i]! & ~bit : styles[i]! | bit
  return spansFrom(styles, a.bold, a.italic)
}
/** the dominant style of a text (what a whole replaced text keeps) */
export function dominantStyle(text: string, styles: number[]): { bold: boolean; italic: boolean } {
  let b = 0, i = 0, n = 0
  for (let k = 0; k < text.length; k++) { if (/\s/.test(text[k]!)) continue; n++; if (styles[k]! & BOLD) b++; if (styles[k]! & ITALIC) i++ }
  return { bold: n > 0 && b / n >= 0.5, italic: n > 0 && i / n >= 0.5 }
}

// ---------- lines ----------
const expandTabs = (text: string, st: number[]): { text: string; st: number[] } => {
  if (!text.includes('\t')) return { text, st }
  let t = ''; const s: number[] = []
  for (let i = 0; i < text.length; i++) { if (text[i] === '\t') { t += '    '; s.push(st[i]!, st[i]!, st[i]!, st[i]!) } else { t += text[i]; s.push(st[i]!) } }
  return { text: t, st: s }
}
const hardLines = (text: string): string[] => text.replace(/\t/g, '    ').split('\n')
/** the lines of a text item as drawn (screen, PDF and picture fallback all use this): the stored paragraph layout, or the lines the visitor typed */
export const textLines = (a: Pick<TextAnno, 'text' | 'lines'>): string[] => a.lines ?? hardLines(a.text)
/** the style digits of line `i` (all the base style when the item has no spans) */
export const lineStyles = (a: Pick<TextAnno, 'text' | 'lines' | 'sty' | 'bold' | 'italic'>, i: number): string => a.sty?.[i] ?? String((a.bold ? BOLD : 0) | (a.italic ? ITALIC : 0)).repeat(textLines(a)[i]?.length ?? 0)
/** a line cut into stretches of one style */
export function stretches(line: string, sty: string): { text: string; bold: boolean; italic: boolean }[] {
  const out: { text: string; bold: boolean; italic: boolean }[] = []
  for (let i = 0; i < line.length; i++) {
    const c = Number(sty[i] ?? '0'), last = out.at(-1)
    if (last && last.bold === !!(c & BOLD) && last.italic === !!(c & ITALIC)) last.text += line[i]
    else out.push({ text: line[i]!, bold: !!(c & BOLD), italic: !!(c & ITALIC) })
  }
  return out
}
/** the text is laid out line by line (a paragraph with its own width, or text kept inside the page edge, or text with spans) */
export const isLaidOut = (a: Pick<TextAnno, 'lines'>): boolean => a.lines !== undefined
/** distance between baselines (pt) */
export const linePitch = (a: Pick<TextAnno, 'size' | 'pitch'>): number => a.pitch ?? a.size * LINE_HEIGHT
/** baseline of line `i`, measured from the top of the box */
export const baselineAt = (a: Pick<TextAnno, 'size' | 'fam' | 'pitch'>, i: number): number => BASELINE[a.fam] * a.size + i * linePitch(a)

/**
 * Break `text` into lines no wider than `width` (greedy, at spaces; a word wider than the line is split by letters). `measure` gives the width of a line
 * from its characters and their style digits. Returns the lines and a style digit per character. Pure.
 */
export function wrapStyled(text: string, styles: number[], width: number, measure: (line: string, sty: string) => number): { lines: string[]; sty: string[] } {
  const ex = expandTabs(text, styles)
  const lines: string[] = [], sty: string[] = []
  const emit = (chars: { c: string; s: number }[]) => { lines.push(chars.map((x) => x.c).join('')); sty.push(chars.map((x) => x.s).join('')) }
  let pos = 0
  for (const hard of ex.text.split('\n')) {
    const st = ex.st.slice(pos, pos + hard.length); pos += hard.length + 1
    if (width === Infinity) { emit(Array.from(hard, (c, i) => ({ c, s: st[i]! }))); continue } // no wrapping: the visitor's own lines, spaces kept
    if (!hard.trim()) { emit([]); continue }
    // words with their style
    const words: { c: string; s: number }[][] = []
    let cur: { c: string; s: number }[] = []
    for (let i = 0; i < hard.length; i++) { if (hard[i] === ' ') { if (cur.length) { words.push(cur); cur = [] } } else cur.push({ c: hard[i]!, s: st[i]! }) }
    if (cur.length) words.push(cur)
    const w = (chars: { c: string; s: number }[]) => measure(chars.map((x) => x.c).join(''), chars.map((x) => x.s).join(''))
    let line: { c: string; s: number }[] = []
    const join = (l: { c: string; s: number }[], word: { c: string; s: number }[]) => (l.length ? [...l, { c: ' ', s: l.at(-1)!.s }, ...word] : word)
    for (const word of words) {
      if (w(word) <= width) {
        const tryLine = join(line, word)
        if (!line.length || w(tryLine) <= width) line = tryLine; else { emit(line); line = word }
        continue
      }
      // too long for one line: cut it by letters
      const chunks: { c: string; s: number }[][] = []; let piece: { c: string; s: number }[] = []
      for (const ch of word) { if (piece.length && w([...piece, ch]) > width) { chunks.push(piece); piece = [] } piece.push(ch) }
      chunks.push(piece)
      if (line.length) emit(line)
      for (const ch of chunks.slice(0, -1)) emit(ch)
      line = chunks.at(-1)!
    }
    emit(line)
  }
  return { lines, sty }
}
/** the old text-only entry point (one style) */
export function wrapLines(text: string, width: number, measure: (s: string) => number): string[] {
  return wrapStyled(text, Array.from({ length: text.length }, () => 0), width, (l) => measure(l)).lines
}

/** width of a line whose stretches have their own fonts (pt) */
function lineWidth(a: Pick<TextAnno, 'fam' | 'size'>, line: string, sty: string): number {
  const c = ctx(); let w = 0
  for (const s of stretches(line, sty)) { c.font = cssFont(a.fam, s.bold, s.italic, a.size * 10); w += c.measureText(s.text).width / 10 }
  return w
}

/** width and height a text box needs for its text (no wrapping: lines break only at newlines) */
export function measureText(a: Pick<TextAnno, 'text' | 'fam' | 'size' | 'bold' | 'italic'> & { spans?: Span[] }): { w: number; h: number } {
  const st = charStyles(a.text, a.bold, a.italic, a.spans)
  const ex = expandTabs(a.text, st)
  const lines = ex.text.split('\n'); let pos = 0
  const w = Math.max(...lines.map((l) => { const s = ex.st.slice(pos, pos + l.length).join(''); pos += l.length + 1; return lineWidth(a, l, s) }), 0)
  return { w: Math.max(w + 2, a.size * 0.6), h: lines.length * a.size * LINE_HEIGHT }
}
/** apply a change to a text box and refit its size (and, for a paragraph, its line breaks) to the new text/font/width */
export function retext(a: TextAnno, patch: Partial<TextAnno>): TextAnno {
  const n = { ...a, ...patch }
  if (patch.text !== undefined && patch.spans === undefined && a.spans) n.spans = editSpans(a.spans, a.text, patch.text, n.bold, n.italic)
  if (n.spans && !n.spans.length) delete n.spans
  if (patch.size !== undefined && a.pitch !== undefined && patch.pitch === undefined) n.pitch = a.pitch * (patch.size / a.size) // a bigger font keeps its line spacing ratio
  const styles = charStyles(n.text, n.bold, n.italic, n.spans)
  const styled = hasSpans(n)
  const measure = (l: string, s: string) => lineWidth(n, l, s)
  if (n.wrap === undefined) {
    const { lines: _l, sty: _s, pitch: _p, wrap: _w, ...rest } = n; void _l; void _s; void _p; void _w
    const m = measureText(rest)
    const room = n.right === undefined ? Infinity : Math.max(n.size * 3, n.right - n.x)
    if (m.w <= room) {
      if (!styled) return { ...rest, w: m.w, h: m.h }
      const laid = wrapStyled(n.text, styles, Infinity, measure) // spans: the lines are the visitor's own breaks, each stretch drawn in its own font
      return { ...rest, lines: laid.lines, sty: laid.sty, pitch: a.pitch, w: m.w, h: m.h }
    }
    // too wide for the page: wrap at the page edge (the lines stay the visitor's own breaks plus these)
    const laid = wrapStyled(n.text, styles, room, measure)
    return { ...rest, lines: laid.lines, ...(styled ? { sty: laid.sty } : {}), pitch: a.pitch, w: room, h: (laid.lines.length - 1) * linePitch(rest) + n.size * LINE_HEIGHT }
  }
  const laid = wrapStyled(n.text, styles, n.wrap, measure)
  const { sty: _s, ...rest } = n; void _s
  return { ...rest, lines: laid.lines, ...(styled ? { sty: laid.sty } : {}), w: n.wrap, h: (laid.lines.length - 1) * linePitch(n) + n.size * LINE_HEIGHT }
}

/** render a text box to a transparent PNG (for text a standard PDF font cannot write). `scale` = pixels per point. */
export async function textToPng(a: TextAnno, scale = 4): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(a.w * scale)); canvas.height = Math.max(1, Math.ceil(a.h * scale))
  const c = canvas.getContext('2d')!
  c.fillStyle = a.color; c.textBaseline = 'alphabetic'; c.fontKerning = 'none'
  const rtl = hasRtl(a.text)
  c.direction = rtl ? 'rtl' : 'ltr'; c.textAlign = rtl ? 'right' : 'left'
  textLines(a).forEach((line, i) => {
    const y = baselineAt(a, i) * scale
    if (rtl || !hasSpans(a)) { c.font = fontCss(a, a.size * scale); c.fillText(line, rtl ? canvas.width : 0, y); return }
    let x = 0
    for (const s of stretches(line, lineStyles(a, i))) { c.font = cssFont(a.fam, s.bold, s.italic, a.size * scale); c.fillText(s.text, x, y); x += c.measureText(s.text).width }
  })
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  canvas.width = 0
  if (!blob) throw new Error('Could not turn the text into a picture.')
  return new Uint8Array(await blob.arrayBuffer())
}
