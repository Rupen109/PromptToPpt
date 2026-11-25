/**
 * The editor's data model and every change to it, as pure functions (no React, no DOM, no pdf.js).
 *
 * Coordinates: every annotation lives in "page space" = the page as pdf.js shows it at scale 1 with the page's own /Rotate applied:
 * points (pt), origin top-left, y down. Rotating a page in the editor never changes annotation numbers; it only changes `rotate` (the
 * extra turn). geometry.ts turns page space into PDF user space when the file is written.
 */
/** the three standard PDF fonts, and the open-licence fonts of fonts.ts */
export type Family = 'sans' | 'serif' | 'mono' | 'inter' | 'jakarta' | 'roboto' | 'opensans' | 'lora' | 'jbmono'
/** a stretch of a text with its own weight / slant: characters [s, e) of `text` (a text item keeps only the stretches that differ from its own `bold` / `italic`) */
export interface Span { s: number; e: number; bold: boolean; italic: boolean }
export type Turn = 0 | 90 | 180 | 270

export interface Box { x: number; y: number; w: number; h: number }
interface Base extends Box { id: string }

/**
 * `wrap` (pt) makes the text a paragraph: it is broken into lines no wider than `wrap`, `pitch` (pt) apart baseline to baseline.
 * `lines` is that layout, worked out once (text.ts `retext`); the screen and the saved PDF both draw exactly these lines, so they cannot differ.
 * Without `wrap` the text breaks only where the visitor pressed Enter.
 */
/**
 * `right` (page space x, pt): text never runs past this edge; a line that would is wrapped there (so a long edit cannot fall off the page).
 * `replaces`: the text stands in for words of the page that were covered (an emptied one removes the words and keeps the cover).
 */
export interface TextAnno extends Base { kind: 'text'; /** clockwise turn in degrees about the box's top-left corner (text read from a turned line); the box itself is the unturned box */ rot?: number; text: string; fam: Family; size: number; bold: boolean; italic: boolean; color: string; wrap?: number; pitch?: number; lines?: string[]; right?: number; replaces?: boolean; spans?: Span[]; /** with `spans`: per line, one digit per character: 0 regular, 1 bold, 2 italic, 3 bold italic (worked out with `lines`) */ sty?: string[] }
/** `patch`: a smooth picture of what surrounded the box (for a gradient), drawn instead of the flat `color` */
export interface WhiteoutAnno extends Base { kind: 'whiteout'; /** clockwise turn in degrees about the box's top-left corner (a cover for turned text) */ rot?: number; color: string; patch?: { url: string; bytes: Uint8Array } }
export interface HighlightAnno extends Base { kind: 'highlight'; color: string }
/** pen, line and arrow share one shape: points are 0..1 inside the box, so moving and resizing is the same for all */
export interface PathAnno extends Base { kind: 'path'; variant: 'pen' | 'line' | 'arrow'; points: [number, number][]; color: string; width: number }
export interface ShapeAnno extends Base { kind: 'shape'; shape: 'rect' | 'ellipse'; stroke: string; width: number; fill: string | null }
/**
 * `src` + `fit`: set when the picture was replaced: `src` is the picture the visitor chose (as it came), and url/bytes are that picture cut or
 * letter-boxed to this box (`fit` 'cover' fills the box and crops, 'contain' fits inside it), so the saved file holds exactly what is shown.
 */
export interface ImageSource { url: string; mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array; w: number; h: number }
/** 8-bit see-through plane of a picture, one byte per pixel (255 = solid), saved as the picture's soft mask: `bytes` are then the plain JPEG and `url` (screen only) a PNG of the same look */
export interface AlphaMask { w: number; h: number; data: Uint8Array }
export interface ImageAnno extends Base { kind: 'image'; url: string; mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array; alpha?: AlphaMask; src?: ImageSource; fit?: 'cover' | 'contain' }
export type Anno = TextAnno | WhiteoutAnno | HighlightAnno | PathAnno | ShapeAnno | ImageAnno

/** Where the page came from in the file, as pdf.js sees it (CropBox ∩ MediaBox, and the page's own /Rotate). Blank pages have none. */
export interface Geom { view: [number, number, number, number]; rotate: Turn }
export interface PageState {
  id: string
  /** 0-based page of the original file; null = a blank page added here */
  src: number | null
  geom: Geom
  /** extra clockwise turn the visitor added */
  turn: Turn
  annos: Anno[]
}
/** `form`: values the visitor entered into the file's form fields, by field name (what is not here is as the file has it) */
export interface Doc { pages: PageState[]; form?: Record<string, string | boolean | string[]> }

let counter = 0
export const uid = (p = 'a') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`

export const MIN_SIZE = 4

/** the page's size in page space (width and height swap when /Rotate is 90 or 270) */
export function pageSize(g: Geom): { w: number; h: number } {
  const w = g.view[2] - g.view[0], h = g.view[3] - g.view[1]
  return g.rotate % 180 === 0 ? { w, h } : { w: h, h: w }
}
/** size on screen, after the visitor's extra turn */
export function shownSize(p: PageState): { w: number; h: number } {
  const s = pageSize(p.geom)
  return p.turn % 180 === 0 ? s : { w: s.h, h: s.w }
}

export const newDoc = (pages: PageState[]): Doc => ({ pages })

// ---------- page operations (all return a new Doc) ----------
const swap = <T,>(a: T[], i: number, j: number): T[] => { const n = [...a]; [n[i], n[j]] = [n[j]!, n[i]!]; return n }
const mapPage = (d: Doc, id: string, f: (p: PageState) => PageState): Doc => ({ ...d, pages: d.pages.map((p) => (p.id === id ? f(p) : p)) })

export function rotatePage(d: Doc, id: string, by: 90 | -90): Doc {
  return mapPage(d, id, (p) => ({ ...p, turn: ((((p.turn + by) % 360) + 360) % 360) as Turn }))
}
export function deletePage(d: Doc, id: string): Doc {
  return d.pages.length <= 1 ? d : { ...d, pages: d.pages.filter((p) => p.id !== id) }
}
export function movePage(d: Doc, id: string, to: number): Doc {
  const from = d.pages.findIndex((p) => p.id === id)
  if (from < 0 || to < 0 || to >= d.pages.length || to === from) return d
  const n = [...d.pages]; const [p] = n.splice(from, 1); n.splice(to, 0, p!)
  return { ...d, pages: n }
}
export const movePageBy = (d: Doc, id: string, delta: -1 | 1): Doc => {
  const i = d.pages.findIndex((p) => p.id === id)
  return i < 0 ? d : { ...d, pages: swap(d.pages, i, i + delta < 0 || i + delta >= d.pages.length ? i : i + delta) }
}
export function duplicatePage(d: Doc, id: string): { doc: Doc; newId: string } {
  const i = d.pages.findIndex((p) => p.id === id)
  if (i < 0) return { doc: d, newId: id }
  const src = d.pages[i]!
  const copy: PageState = { ...src, id: uid('p'), annos: src.annos.map((a) => ({ ...a, id: uid() })) }
  const n = [...d.pages]; n.splice(i + 1, 0, copy)
  return { doc: { ...d, pages: n }, newId: copy.id }
}
/** a blank page after `id`, the same size as that page looks on screen */
export function addBlankPage(d: Doc, id: string): { doc: Doc; newId: string } {
  const i = d.pages.findIndex((p) => p.id === id)
  const at = i < 0 ? d.pages.length - 1 : i
  const { w, h } = shownSize(d.pages[at]!)
  const blank: PageState = { id: uid('p'), src: null, geom: { view: [0, 0, w, h], rotate: 0 }, turn: 0, annos: [] }
  const n = [...d.pages]; n.splice(at + 1, 0, blank)
  return { doc: { ...d, pages: n }, newId: blank.id }
}

/** set a form field's value (one undo step per field while typing: use a key per field) */
export const setField = (d: Doc, name: string, value: string | boolean | string[]): Doc => ({ ...d, form: { ...d.form, [name]: value } })

// ---------- annotation operations ----------
export const addAnno = (d: Doc, pageId: string, a: Anno | Anno[]): Doc => mapPage(d, pageId, (p) => ({ ...p, annos: [...p.annos, ...(Array.isArray(a) ? a : [a])] }))
/** add items at position `at` of the page's item list (0 = underneath everything the visitor already added) */
export const insertAnnos = (d: Doc, pageId: string, a: Anno[], at: number): Doc => mapPage(d, pageId, (p) => ({ ...p, annos: [...p.annos.slice(0, at), ...a, ...p.annos.slice(at)] }))
export const removeAnno = (d: Doc, pageId: string, id: string): Doc => mapPage(d, pageId, (p) => ({ ...p, annos: p.annos.filter((a) => a.id !== id) }))
export const patchAnno = (d: Doc, pageId: string, id: string, patch: Partial<Anno>): Doc =>
  mapPage(d, pageId, (p) => ({ ...p, annos: p.annos.map((a) => (a.id === id ? ({ ...a, ...patch } as Anno) : a)) }))
/**
 * An item replaced WHOLE. A text item laid out again by `retext` must be stored this way, never merged with patchAnno: retext leaves out what no longer applies
 * (spans, styled lines, a paragraph's lines), and a merge would keep the old values, so the screen and the saved file drew the old words (a line with a bold
 * stretch lost every edit).
 */
export const replaceAnno = (d: Doc, pageId: string, id: string, next: Anno): Doc =>
  mapPage(d, pageId, (p) => ({ ...p, annos: p.annos.map((a) => (a.id === id ? next : a)) }))
export const findAnno = (d: Doc, pageId: string, id: string): Anno | undefined => d.pages.find((p) => p.id === pageId)?.annos.find((a) => a.id === id)

/** keep a box inside the page and at least MIN_SIZE big */
export function clampBox(b: Box, pw: number, ph: number): Box {
  const w = Math.max(MIN_SIZE, Math.min(b.w, pw)), h = Math.max(MIN_SIZE, Math.min(b.h, ph))
  return { x: Math.min(Math.max(b.x, 0), pw - w), y: Math.min(Math.max(b.y, 0), ph - h), w, h }
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
/** drag one handle of a box; `keepRatio` scales from the opposite corner */
export function resizeBox(b: Box, handle: Handle, dx: number, dy: number, keepRatio: boolean): Box {
  let { x, y, w, h } = b
  const ratio = b.w / Math.max(b.h, 0.0001)
  if (handle.includes('e')) w += dx
  if (handle.includes('w')) { x += dx; w -= dx }
  if (handle.includes('s')) h += dy
  if (handle.includes('n')) { y += dy; h -= dy }
  if (keepRatio) {
    const horizontalOnly = handle === 'e' || handle === 'w'
    const verticalOnly = handle === 'n' || handle === 's'
    let nw = w, nh = h
    if (horizontalOnly) nh = w / ratio
    else if (verticalOnly) nw = h * ratio
    else if (Math.abs(w - b.w) / b.w >= Math.abs(h - b.h) / b.h) nh = w / ratio
    else nw = h * ratio
    if (handle.includes('w')) x = b.x + b.w - nw
    if (handle.includes('n')) y = b.y + b.h - nh
    if (horizontalOnly) y = b.y + (b.h - nh) / 2
    if (verticalOnly) x = b.x + (b.w - nw) / 2
    w = nw; h = nh
  }
  if (w < MIN_SIZE) { if (handle.includes('w')) x -= MIN_SIZE - w; w = MIN_SIZE }
  if (h < MIN_SIZE) { if (handle.includes('n')) y -= MIN_SIZE - h; h = MIN_SIZE }
  return { x, y, w, h }
}

// ---------- history (undo / redo) ----------
export interface History { past: Doc[]; present: Doc; future: Doc[]; key: string | null }
export const MAX_HISTORY = 200
export const newHistory = (d: Doc): History => ({ past: [], present: d, future: [], key: null })

/**
 * Record a change. Changes that share a `key` back to back (every step of one drag, every keystroke of one text box) become ONE undo step.
 */
export function commit(h: History, next: Doc, key: string | null = null): History {
  if (next === h.present) return h
  if (key !== null && key === h.key) return { ...h, present: next, future: [] }
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: [], key }
}
export const undo = (h: History): History => (h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future], key: null } : h)
export const redo = (h: History): History => (h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1), key: null } : h)
/** end the current run of coalesced changes (the next change starts a new undo step) */
export const seal = (h: History): History => (h.key === null ? h : { ...h, key: null })
/** drop the last step if it was recorded under `key` (an empty text box that was never typed in leaves no trace) */
export const cancelKey = (h: History, key: string): History => (h.key === key && h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [], key: null } : h)

/** how strong a highlight is (also used when the file is written) */
export const HIGHLIGHT_OPACITY = 0.55
