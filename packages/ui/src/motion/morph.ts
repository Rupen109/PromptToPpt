import type { Slide, SlideElement } from '@prompttoppt/validation'

/**
 * Morph: how the elements of one slide become the elements of the next. Pure planning, no DOM.
 *
 *  · An element is the SAME element when its id and its type match on both slides (ids are kept when a slide is duplicated, and by Morph decks when they are generated).
 *    Never by its text, its picture or its name.
 *  · A matched element moves and resizes from where it was to where it is. Two copies of it are drawn (the old one and the new one), each carried onto the other's place
 *    with `transform` and `opacity` only, so nothing is laid out during the transition and a text never reflows or stretches: it is scaled evenly by its font size.
 *  · An element on one slide only comes in or goes out.
 */
/** How a matched text travels piece by piece: `matches` are [index in the old text, index in the new text] pairs, in reading order; pieces left over fade out (old) or in (new). */
export interface MorphPieces { level: 'word' | 'letter'; from: number; to: number; matches: [number, number][] }
export interface MorphPair { from: SlideElement; to: SlideElement; /** set when the text moves word by word / letter by letter (the choice asked for, and the two texts allow it); absent = the text moves as one object */ pieces?: MorphPieces; /** the two copies would not line up (other words, or the text wraps differently in its new box): the old copy fades away while the new one fades in, instead of the new one fading in over the old one */ crossfade: boolean }
export interface MorphPlan { pairs: MorphPair[]; entering: SlideElement[]; exiting: SlideElement[] }

const wordsOf = (e: SlideElement) => (e.type === 'text' ? e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n') : '')

/** The picture of an image element, to tell whether two images are the same picture. */

/** A text breaks its lines by the width of its box in letters (box width over font size): when that changes, the words wrap differently and the two copies do not coincide. */
const WRAP_TOLERANCE = 0.05
const rewraps = (a: SlideElement, b: SlideElement) => {
  if (a.type !== 'text' || b.type !== 'text' || a.fontSize <= 0 || b.fontSize <= 0 || a.width <= 0) return false
  return Math.abs((b.width / b.fontSize) / (a.width / a.fontSize) - 1) > WRAP_TOLERANCE
}

/** The most pieces a text may be split into (per text) before it moves as one object: every piece is an animated element. */
export const MAX_WORD_PIECES = 60
export const MAX_LETTER_PIECES = 140
/** A text needs at least this share of its shorter side matched, and one piece, to travel in pieces: otherwise the two texts are different and cross-fade. */
const MIN_SHARED = 0.34

/** The pieces of a text exactly as the renderer marks them (SlideCanvas splitParts): words are the runs of non-space characters of each run, letters the characters of those words. */
export function piecesOf(e: SlideElement, level: 'word' | 'letter'): string[] {
  if (e.type !== 'text') return []
  const out: string[] = []
  for (const p of e.paragraphs) for (const r of p.runs) for (const w of r.text.split(/(\s+)/)) {
    if (w === '' || /^\s+$/.test(w)) continue
    if (level === 'word') out.push(w); else out.push(...Array.from(w))
  }
  return out
}

/** The longest run of equal pieces in order (case does not matter): which old piece goes to which new one. Pure. */
export function matchPieces(a: readonly string[], b: readonly string[]): [number, number][] {
  const n = a.length, m = b.length
  const eq = (i: number, j: number) => a[i]!.toLowerCase() === b[j]!.toLowerCase()
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = eq(i, j) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const out: [number, number][] = []
  for (let i = 0, j = 0; i < n && j < m;) {
    if (eq(i, j)) { out.push([i, j]); i++; j++ }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++
    else j++
  }
  return out
}

/** Can this pair of texts travel piece by piece? Both plain text at the same rotation, few enough pieces, and enough of the words (or letters) shared; otherwise null (one object). */
export function planPieces(a: SlideElement, b: SlideElement, by: 'word' | 'character'): MorphPieces | null {
  if (a.type !== 'text' || b.type !== 'text' || a.rotation !== b.rotation) return null
  const level = by === 'word' ? 'word' : 'letter'
  const pa = piecesOf(a, level), pb = piecesOf(b, level)
  const cap = level === 'word' ? MAX_WORD_PIECES : MAX_LETTER_PIECES
  if (pa.length === 0 || pb.length === 0 || pa.length > cap || pb.length > cap) return null
  const matches = matchPieces(pa, pb)
  if (matches.length === 0 || matches.length < MIN_SHARED * Math.min(pa.length, pb.length)) return null
  return { level, from: pa.length, to: pb.length, matches }
}

export function planMorph(from: Pick<Slide, 'elements'>, to: Pick<Slide, 'elements'>, hiddenFrom: ReadonlySet<string> = new Set(), by: 'object' | 'word' | 'character' = 'object'): MorphPlan {
  from = { elements: from.elements.filter((e) => !e.hidden) } // an object switched off in the Selection pane is not on either slide
  to = { elements: to.elements.filter((e) => !e.hidden) }
  const before = from.elements.filter((e) => !hiddenFrom.has(e.id)) // an element an exit effect already removed is not on screen to move
  const old = new Map(before.map((e) => [e.id, e]))
  const pairs: MorphPair[] = [], entering: SlideElement[] = []
  const used = new Set<string>()
  for (const e of to.elements) {
    const was = old.get(e.id)
    if (was && was.type === e.type) {
      const pieces = by !== 'object' && e.type === 'text' ? planPieces(was, e, by) : null
      pairs.push({ from: was, to: e, ...(pieces ? { pieces } : {}), crossfade: pieces ? false : was.type === 'text' ? wordsOf(was) !== wordsOf(e) || rewraps(was, e) || (e.type === 'text' && was.type === 'text' && was.color !== e.color) : was.type === 'image' && e.type === 'image' && was.src !== e.src }); used.add(e.id)
    }
    else entering.push(e)
  }
  return { pairs, entering, exiting: before.filter((e) => !used.has(e.id)) }
}

/** A transform that carries an element drawn at `at` onto the place `onto`, and what it is drawn with. */
export interface Carry { transform: string; origin: string; rotate: [number, number] }

const fontOf = (e: SlideElement) => (e.type === 'text' ? e.fontSize : 0)

/**
 * Boxes (shapes, pictures, icons, charts, tables) go to the new place and size exactly, from their top-left corner. A text is moved by its centre and scaled evenly by the
 * change of font size (its words are never stretched); when the font size is the same it simply moves.
 */
export function carry(at: SlideElement, onto: SlideElement): Carry {
  const rotate: [number, number] = [at.rotation, onto.rotation]
  if (at.type === 'text' && onto.type === 'text') {
    const s = fontOf(at) > 0 && fontOf(onto) > 0 ? fontOf(onto) / fontOf(at) : 1
    const dx = onto.x + onto.width / 2 - (at.x + at.width / 2)
    const dy = onto.y + onto.height / 2 - (at.y + at.height / 2)
    return { transform: `translate(${dx}px, ${dy}px) scale(${s})`, origin: 'center', rotate }
  }
  const sx = at.width > 0 ? onto.width / at.width : 1, sy = at.height > 0 ? onto.height / at.height : 1
  return { transform: `translate(${onto.x - at.x}px, ${onto.y - at.y}px) scale(${sx}, ${sy})`, origin: '0 0', rotate }
}
