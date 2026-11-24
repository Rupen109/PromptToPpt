import type { TextElement } from './presentation'

/**
 * How heavy and how slanted text is drawn: ONE rule for the slide, the inline editor, the toolbar, the assistant and the PowerPoint export (the export used to read only an
 * explicit `weight`, so a subtitle that was bold on screen came out plain in the file).
 */
type Box = Pick<TextElement, 'role' | 'weight'>
type RunFlags = { bold?: boolean | undefined; italic?: boolean | undefined }

/** the weight of the box's own text: its `weight`, else its role's (titles and figures 800, headings and subtitles 700, the rest 400) */
export function textBaseWeight(el: Box): number {
  return el.weight ?? (el.role === 'title' || el.role === 'metric' ? 800 : el.role === 'heading' || el.role === 'subtitle' ? 700 : 400)
}
/** a weight people call bold */
export const isBoldWeight = (w: number) => w >= 600
/** the weight a run is drawn at: bold on = at least 700, bold off = 400 (it overrides a heading's weight), not set = the box's */
export function runWeight(run: RunFlags, el: Box): number {
  const base = textBaseWeight(el)
  return run.bold === true ? Math.max(700, base) : run.bold === false ? 400 : base
}
export const isRunBold = (run: RunFlags, el: Box) => isBoldWeight(runWeight(run, el))
/** quotes are italic by default; a run can switch italic on or off */
export const isRunItalic = (run: RunFlags, el: Pick<TextElement, 'role'>) => run.italic ?? el.role === 'quote'

type Paragraphs = TextElement['paragraphs']
type Run = Paragraphs[number]['runs'][number]
/** a style for some words: only what is given changes (color null = back to the box's colour) */
export interface WordStyle { bold?: boolean | undefined; italic?: boolean | undefined; underline?: boolean | undefined; color?: Run['color'] | null | undefined; /** a marker colour behind the words (hex); null takes it off */ highlight?: string | null | undefined }

const LETTER = /[\p{L}\p{N}]/u
/** where the words are in a text, ignoring case: whole-word matches ("art" is not inside "start"), else any match */
function findWords(text: string, words: string): [number, number][] {
  const t = text.toLowerCase(), w = words.trim().toLowerCase()
  if (!w) return []
  const all: [number, number][] = []
  for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + w.length)) all.push([i, i + w.length])
  const whole = all.filter(([a, b]) => !(a > 0 && LETTER.test(text[a - 1]!) && LETTER.test(text[a]!)) && !(b < text.length && LETTER.test(text[b]!) && LETTER.test(text[b - 1]!)))
  return whole.length ? whole : all
}

/**
 * The same text with a style given to every place the words appear (bold / italic / underline / colour of THOSE words only). One rule for the assistant and its check; a
 * style the box already draws (a title is bold) is not written onto the words. `found` = how many places; `changed` = false when they all already look like that.
 */
export function styleWords(el: Pick<TextElement, 'role' | 'weight' | 'color' | 'paragraphs'>, words: string, style: WordStyle): { paragraphs: Paragraphs; found: number; changed: boolean } {
  let found = 0, changed = false
  const baseBold = isBoldWeight(textBaseWeight(el)), baseItalic = el.role === 'quote'
  const restyle = (r: Run): Run => {
    const o: Run = { ...r }
    if (style.bold !== undefined) { if (style.bold === baseBold) delete o.bold; else o.bold = style.bold }
    if (style.italic !== undefined) { if (style.italic === baseItalic) delete o.italic; else o.italic = style.italic }
    if (style.underline !== undefined) { if (style.underline) o.underline = true; else delete o.underline }
    if (style.color !== undefined) { if (style.color === null || style.color.toLowerCase() === el.color.toLowerCase()) delete o.color; else o.color = style.color }
    if (style.highlight !== undefined) { if (style.highlight === null) delete o.highlight; else o.highlight = style.highlight.toUpperCase() as Run['highlight'] }
    return o
  }
  const key = (r: Run) => JSON.stringify([r.bold, r.italic, r.underline, r.color, r.link, r.highlight])
  const paragraphs = el.paragraphs.map((p) => {
    const text = p.runs.map((r) => r.text).join('')
    const at = findWords(text, words)
    if (!at.length) return p
    found += at.length
    // one style per character, the words restyled, then neighbours with the same style joined again
    const chars: Run[] = p.runs.flatMap((r) => [...r.text].map(() => r))
    const per = [...text]
    let pos = 0
    const offsets = per.map((ch) => { const o = pos; pos += ch.length; return o })
    const out: Run[] = []
    per.forEach((ch, i) => {
      const inWords = at.some(([a, b]) => offsets[i]! >= a && offsets[i]! < b)
      const st = inWords ? restyle(chars[i]!) : chars[i]!
      if (inWords && key(st) !== key(chars[i]!)) changed = true
      const last = out[out.length - 1]
      const { text: _t, ...rest } = st
      if (last && key(last) === key(st)) last.text += ch
      else out.push({ ...rest, text: ch })
    })
    return { ...p, runs: out }
  })
  return { paragraphs: changed ? paragraphs : el.paragraphs, found, changed }
}

/**
 * PowerPoint's "single" line spacing is 1.2 × the text size (measured 2026-11-23: real PowerPoint saved a test deck as PDF; 1.0 / 1.3 / 1.5 / 2.0 came out at exactly
 * 1.2× the multiple). The slide draws `lineHeight` × size (CSS). So the file's multiple is lineHeight / 1.2, and an imported multiple is × 1.2: ONE factor both ways.
 */
export const PPT_SINGLE_LINE = 1.2
/** the deck's normal line height when a box sets none (the slide's default) */
export const LINE_HEIGHT_DEFAULT = 1.3
/** PowerPoint's line spacing multiple for a text box drawn at `lineHeight` (or the deck's normal) */
export const pptLineMultiple = (lineHeight: number | undefined) => Math.round(((lineHeight ?? LINE_HEIGHT_DEFAULT) / PPT_SINGLE_LINE) * 1000) / 1000

/**
 * A box's alignment as CSS (the slide, the typing editor, the empty-box hint). Logical: identical to left / right for left-to-right text, mirrored for right-to-left paragraphs.
 * `justify`: both edges straight, the last line of each paragraph at its start (PowerPoint's "Justify" does the same).
 */
export const TEXT_ALIGN_CSS = { left: 'start', center: 'center', right: 'end', justify: 'justify' } as const
