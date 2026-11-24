/**
 * Formatting single words inside the inline text editor (bold, italic, underline, colour), the way a word processor does it:
 *  - words selected: the change applies to those words only;
 *  - the caret inside a word: the change applies to that word (and the caret stays where it was);
 *  - the caret between words: the change applies to what is typed next.
 *
 * The browser's own editing commands do the change (so typing, IME input and Ctrl/Cmd+Z behave natively), and the box is READ BACK from what is shown: whatever markup the
 * browser makes (<b>, <span style>, <font>), each piece of text gets the style it is drawn with. So what is saved is exactly what the person sees, never a guess.
 */
import { highlightText, isBoldWeight, textBaseWeight, type TextElement } from '@prompttoppt/validation'
import { blockOf, normalizeRoot, type ListKind } from './inline-lists'

type Paragraphs = TextElement['paragraphs']
type Run = Paragraphs[number]['runs'][number]
type Token = Exclude<TextElement['color'], `#${string}`>
export type InlineFlag = 'bold' | 'italic' | 'underline'

/** What a box draws when a run sets nothing: its weight, whether it is italic, its colour (as stored, and as drawn). */
export interface InlineBase { weight: number; italic: boolean; color: TextElement['color']; colorHex: string }

/** The look of a box's own text, as the slide draws it. */
export function inlineBase(el: Pick<TextElement, 'role' | 'weight' | 'color'>, resolve: (c: string) => string): InlineBase {
  return { weight: textBaseWeight(el), italic: el.role === 'quote', color: el.color, colorHex: resolve(el.color).toUpperCase() }
}

/** #RRGGBB from a CSS colour the browser wrote ("rgb(220, 38, 38)", "#dc2626", "#d23") */
export function cssHex(c: string): string | null {
  const v = c.trim().toLowerCase()
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v)
  if (rgb) return `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v.toUpperCase()
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((x) => x + x).join('')}`.toUpperCase()
  return null
}
const weightOf = (v: string): number | null => (v === 'bold' || v === 'bolder' ? 700 : v === 'normal' || v === 'lighter' ? 400 : /^\d+$/.test(v) ? Number(v) : null)

/** The style a span is drawn with in the editor (the same look as the slide). */
export function runSpanStyle(r: Run, base: InlineBase, resolve: (c: string) => string): Record<string, string | number> {
  const st: Record<string, string | number> = {}
  if (r.bold === true) st['fontWeight'] = Math.max(700, base.weight)
  if (r.bold === false) st['fontWeight'] = 400
  if (r.italic !== undefined && r.italic !== base.italic) st['fontStyle'] = r.italic ? 'italic' : 'normal'
  if (r.underline) st['textDecoration'] = 'underline'
  if (r.color) st['color'] = resolve(r.color)
  else if (r.highlight) st['color'] = highlightText(r.highlight) // (readable on its marker, as the slide draws it)
  if (r.highlight) { st['backgroundColor'] = r.highlight; st['boxDecorationBreak'] = 'clone'; st['WebkitBoxDecorationBreak'] = 'clone' }
  return st
}

/** The style a piece of text is drawn with: the nearest element (up to the box) that sets each property. Underline adds up (an underlined parent underlines its children). */
function styleAt(node: Node, root: HTMLElement, base: InlineBase): Omit<Run, 'text'> {
  let weight: number | null = null, italic: boolean | null = null, underline = false, color: Run['color'] | null = null, link: string | null = null
  // a highlight is the nearest background colour; a span set to transparent ("no highlight" inside a highlighted phrase) stops the search
  let highlight: string | null | undefined
  for (let n = node.parentElement; n && n !== root; n = n.parentElement) {
    const tag = n.tagName
    if (weight === null) weight = weightOf(n.style.fontWeight) ?? (tag === 'B' || tag === 'STRONG' ? 700 : null)
    if (italic === null) italic = n.style.fontStyle === 'italic' || n.style.fontStyle === 'oblique' ? true : n.style.fontStyle === 'normal' ? false : tag === 'I' || tag === 'EM' ? true : null
    if (`${n.style.textDecorationLine} ${n.style.textDecoration}`.includes('underline') || tag === 'U') underline = true
    if (color === null) {
      const hex = cssHex(n.style.color || (tag === 'FONT' ? n.getAttribute('color') ?? '' : ''))
      // a theme colour keeps its name (so it follows the theme), but only while the span still shows that very colour (a span the browser split and recoloured does not)
      if (hex) color = n.dataset['c'] && n.dataset['hex'] === hex ? (n.dataset['c'] as Token) : hex
    }
    if (link === null && n.dataset['link']) link = n.dataset['link']
    if (highlight === undefined && n.style.backgroundColor) { const bg = n.style.backgroundColor; highlight = /transparent|rgba\([^)]*,\s*0(\.0+)?\s*\)/.test(bg) ? null : cssHex(bg) } // (see-through = no highlight; cssHex would read rgba(0,0,0,0) as black)
  }
  const out: Omit<Run, 'text'> = {}
  if (weight !== null && isBoldWeight(weight) !== isBoldWeight(base.weight)) out.bold = isBoldWeight(weight)
  if (italic !== null && italic !== base.italic) out.italic = italic
  if (underline) out.underline = true
  if (color !== null && color !== base.color && color !== base.colorHex) out.color = color
  if (link) out.link = link
  if (highlight) out.highlight = highlight as Run['highlight']
  return out
}

const sameStyle = (a: Omit<Run, 'text'>, b: Omit<Run, 'text'>) => a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.color === b.color && a.link === b.link && a.highlight === b.highlight

/**
 * The box as paragraphs of runs, exactly as shown: one paragraph per block (a line break inside one starts a new paragraph with the same list kind), neighbouring pieces with
 * the same style joined, trailing spaces trimmed, empty paragraphs dropped unless that leaves nothing.
 */
export function readRuns(root: HTMLElement, base: InlineBase): Paragraphs {
  normalizeRoot(root)
  const out: { runs: Run[]; list?: ListKind }[] = []
  for (const block of Array.from(root.children) as HTMLElement[]) {
    const list = block.dataset['list'] === 'bullet' || block.dataset['list'] === 'number' ? (block.dataset['list'] as ListKind) : undefined
    let cur: Run[] = []
    const startPara = () => { cur = []; out.push({ runs: cur, ...(list ? { list } : {}) }) }
    startPara()
    const add = (text: string, st: Omit<Run, 'text'>) => {
      if (!text) return
      const last = cur[cur.length - 1]
      if (last && sameStyle(last, st)) last.text += text
      else cur.push({ ...st, text })
    }
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) {
        const st = styleAt(n, root, base)
        const parts = (n.textContent ?? '').replace(/\r/g, '').replace(/ /g, ' ').split('\n')
        parts.forEach((t, i) => { if (i) startPara(); add(t, st) })
      } else if ((n as Element).tagName === 'BR' && !isLastInBlock(n, block)) startPara()
    }
  }
  for (const p of out) {
    // trailing spaces go; a paragraph that is empty keeps ONE empty run (with the style of its first piece, so typing there later looks the same)
    while (p.runs.length && !p.runs[p.runs.length - 1]!.text.trimEnd()) { if (p.runs.length === 1) break; p.runs.pop() }
    const last = p.runs[p.runs.length - 1]
    if (last) last.text = last.text.trimEnd()
    if (!p.runs.length) p.runs.push({ text: '' })
  }
  const kept = out.filter((p) => p.runs.some((r) => r.text.length > 0))
  return kept.length ? kept : [{ runs: [{ text: '' }], ...(out[0]?.list ? { list: out[0].list } : {}) }]
}
function isLastInBlock(n: Node, block: HTMLElement): boolean {
  for (let x: Node | null = n; x && x !== block; x = x.parentNode) if (x.nextSibling && !(x.nextSibling.nodeType === Node.TEXT_NODE && !x.nextSibling.textContent)) return false
  return true
}

/**
 * The same paragraphs written the way the reader writes them (flags that only repeat the box's own look dropped, same-style neighbours joined, trailing spaces trimmed, empty
 * paragraphs dropped): opening a box and closing it without changing anything gives back exactly this, so it is NOT an edit.
 */
export function canonicalRuns(paragraphs: Paragraphs, base: InlineBase, resolve: (c: string) => string): Paragraphs {
  const out = paragraphs.map((p) => {
    const runs: Run[] = []
    for (const r of p.runs) {
      const st: Omit<Run, 'text'> = {}
      if (r.bold !== undefined && isBoldWeight(r.bold ? Math.max(700, base.weight) : 400) !== isBoldWeight(base.weight)) st.bold = r.bold
      if (r.italic !== undefined && r.italic !== base.italic) st.italic = r.italic
      if (r.underline) st.underline = true
      if (r.color && r.color !== base.color && (r.color.startsWith('#') ? r.color.toUpperCase() : r.color) !== base.colorHex && !(r.color.startsWith('#') && resolve(r.color).toUpperCase() === base.colorHex)) st.color = r.color.startsWith('#') ? (r.color.toUpperCase() as Run['color']) : r.color
      if (r.link) st.link = r.link
      if (r.highlight) st.highlight = r.highlight.toUpperCase() as Run['highlight']
      const text = r.text.replace(/\r/g, '').replace(/\u00A0/g, ' ')
      if (!text) continue
      const last = runs[runs.length - 1]
      if (last && sameStyle(last, st)) last.text += text
      else runs.push({ ...st, text })
    }
    while (runs.length > 1 && !runs[runs.length - 1]!.text.trimEnd()) runs.pop()
    const last = runs[runs.length - 1]
    if (last) last.text = last.text.trimEnd()
    return { runs: runs.length ? runs : [{ text: '' }], ...(p.list ? { list: p.list } : {}) }
  })
  const kept = out.filter((p) => p.runs.some((r) => r.text.length > 0))
  return kept.length ? kept : [{ runs: [{ text: '' }], ...(out[0]?.list ? { list: out[0].list } : {}) }]
}

// ─── formatting the selection ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const WORD = /[\p{L}\p{N}\p{M}'’_-]/u
/** With the caret INSIDE a word (letters on both sides), the range of that word; else null. */
function wordAtCaret(sel: Selection): Range | null {
  if (!sel.rangeCount || !sel.isCollapsed) return null
  const node = sel.anchorNode, at = sel.anchorOffset
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const t = node.textContent ?? ''
  if (!(at > 0 && at < t.length && WORD.test(t[at - 1]!) && WORD.test(t[at]!))) return null
  let a = at, b = at
  while (a > 0 && WORD.test(t[a - 1]!)) a--
  while (b < t.length && WORD.test(t[b]!)) b++
  const r = document.createRange()
  r.setStart(node, a)
  r.setEnd(node, b)
  return r
}

/** Runs a browser editing command on the selection (or the word at the caret), styled with CSS so the reader sees plain style properties. */
function run(root: HTMLElement, fn: () => void) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode)) return
  const caret = sel.isCollapsed ? { node: sel.anchorNode!, offset: sel.anchorOffset } : null
  const word = wordAtCaret(sel)
  if (word) { sel.removeAllRanges(); sel.addRange(word) }
  document.execCommand('styleWithCSS', false, 'true')
  fn()
  if (word && caret) {
    // back to the caret where it was: the same character count from the start of its paragraph
    const block = blockOf(root, sel.anchorNode)
    if (block) placeCaretAt(block, offsetIn(blockOf(root, word.startContainer) ?? block, caret))
  }
  root.dispatchEvent(new Event('input', { bubbles: true }))
  notify() // the text bar shows the new state
}
function offsetIn(block: HTMLElement, at: { node: Node; offset: number }): number {
  const r = document.createRange()
  r.setStart(block, 0)
  try { r.setEnd(at.node, at.offset) } catch { return 0 }
  return r.toString().length
}
function placeCaretAt(block: HTMLElement, chars: number) {
  const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let left = chars
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    if (left <= n.data.length) { const r = document.createRange(); r.setStart(n, left); r.collapse(true); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); return }
    left -= n.data.length
  }
}

/** Bold / italic / underline on the selection, the word at the caret, or what is typed next. */
export function formatInline(root: HTMLElement, flag: InlineFlag) {
  run(root, () => document.execCommand(flag, false))
}

/** Back to the box's own look (no bold / italic / underline / colour of their own) for the selection or the word at the caret. Links stay. */
export function clearInline(root: HTMLElement) {
  run(root, () => {
    document.execCommand('removeFormat', false)
    // the browser leaves the theme-colour names on spans whose colour it removed; without a colour they mean nothing, but keep the markup clean
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-c]'))) if (!el.style.color) { delete el.dataset['c']; delete el.dataset['hex'] }
  })
}

/** A colour on the selection or the word at the caret. A theme colour is remembered by name (it follows the theme); a colour that is the box's own clears the word's colour. */
export function colourInline(root: HTMLElement, color: TextElement['color'], hex: string) {
  const want = cssHex(hex)
  if (!want) return
  run(root, () => {
    document.execCommand('foreColor', false, want)
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[style]'))) {
      if (cssHex(el.style.color) !== want) continue
      if (color.startsWith('#')) { delete el.dataset['c']; delete el.dataset['hex'] } else { el.dataset['c'] = color; el.dataset['hex'] = want }
    }
  })
}

/** A marker colour behind the selection or the word at the caret (null takes it off). */
export function highlightInline(root: HTMLElement, hex: string | null) {
  run(root, () => document.execCommand('hiliteColor', false, hex ? cssHex(hex) ?? hex : 'transparent'))
}

/** Which of bold / italic / underline the selection (or the caret) has: what the toolbar buttons show while typing. */
export function inlineState(): Record<InlineFlag, boolean> {
  const q = (c: InlineFlag) => { try { return document.queryCommandState(c) } catch { return false } }
  return { bold: q('bold'), italic: q('italic'), underline: q('underline') }
}

// ─── the toolbar talks to the box being edited ────────────────────────────────────────────────────────────────────────────────────────
/**
 * The ONE inline editor open at a time registers itself, so the toolbar's B / I / U and colour buttons act on the selected words while typing (and on the whole box
 * otherwise). The selection is remembered: a button that takes the focus (a colour picker) still formats the words that were selected.
 */
let open: { elementId: string; root: HTMLElement; range: Range | null } | null = null
const listeners = new Set<() => void>()
const notify = () => { for (const l of listeners) l() }

export function registerInline(elementId: string, root: HTMLElement): () => void {
  open = { elementId, root, range: null }
  const onSel = () => {
    const s = window.getSelection()
    if (open && s && s.rangeCount && open.root.contains(s.anchorNode)) { open.range = s.getRangeAt(0).cloneRange(); notify() }
  }
  document.addEventListener('selectionchange', onSel)
  notify()
  return () => { document.removeEventListener('selectionchange', onSel); if (open?.root === root) open = null; notify() }
}
/** The box being edited, if it is this element. */
export const inlineFor = (elementId: string) => (open?.elementId === elementId ? open : null)
export function onInlineChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn) } }
/** Puts the focus and the remembered selection back in the box (after a button took the focus). */
export function restoreInline(): HTMLElement | null {
  if (!open) return null
  open.root.focus({ preventScroll: true })
  if (open.range) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(open.range) }
  return open.root
}
