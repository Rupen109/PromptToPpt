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
export interface MorphPair { from: SlideElement; to: SlideElement; /** the two copies would not line up (other words, or the text wraps differently in its new box): the old copy fades away while the new one fades in, instead of the new one fading in over the old one */ crossfade: boolean }
export interface MorphPlan { pairs: MorphPair[]; entering: SlideElement[]; exiting: SlideElement[] }

const wordsOf = (e: SlideElement) => (e.type === 'text' ? e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n') : '')

/** The picture of an image element, to tell whether two images are the same picture. */

/** A text breaks its lines by the width of its box in letters (box width over font size): when that changes, the words wrap differently and the two copies do not coincide. */
const WRAP_TOLERANCE = 0.05
const rewraps = (a: SlideElement, b: SlideElement) => {
  if (a.type !== 'text' || b.type !== 'text' || a.fontSize <= 0 || b.fontSize <= 0 || a.width <= 0) return false
  return Math.abs((b.width / b.fontSize) / (a.width / a.fontSize) - 1) > WRAP_TOLERANCE
}

export function planMorph(from: Pick<Slide, 'elements'>, to: Pick<Slide, 'elements'>, hiddenFrom: ReadonlySet<string> = new Set()): MorphPlan {
  const before = from.elements.filter((e) => !hiddenFrom.has(e.id)) // an element an exit effect already removed is not on screen to move
  const old = new Map(before.map((e) => [e.id, e]))
  const pairs: MorphPair[] = [], entering: SlideElement[] = []
  const used = new Set<string>()
  for (const e of to.elements) {
    const was = old.get(e.id)
    if (was && was.type === e.type) { pairs.push({ from: was, to: e, crossfade: was.type === 'text' ? wordsOf(was) !== wordsOf(e) || rewraps(was, e) || (e.type === 'text' && was.type === 'text' && was.color !== e.color) : was.type === 'image' && e.type === 'image' && was.src !== e.src }); used.add(e.id) }
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
