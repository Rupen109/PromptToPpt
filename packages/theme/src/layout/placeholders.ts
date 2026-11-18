import type { SlideElement, TextElement } from '@prompttoppt/validation'
import { header } from './header'
import { para, text, type Ctx } from './primitives'

/**
 * The boxes of a NEW slide, the way PowerPoint's layouts give them: a title box, a text box (or two), empty, each saying what goes in it. The words below only size the boxes
 * (so the type scale and the design's heading look are the same as on any generated slide) and fill the gallery previews; a real new slide has them blanked by `blankHints`.
 */
const inner = (c: Ctx) => c.W - 2 * c.M

/** Title and content: a title and one bulleted text box. */
export function contentBody(c: Ctx) {
  const y = header(c, 'Slide title')
  text(c, 'body', ['First point', 'Second point', 'Third point'].map((b) => para(b, 'bullet')), c.M, y, inner(c), c.bottom - y, 36, { min: 22 })
}

/** Title only: a title, the rest of the slide is free. */
export function titleOnlyBody(c: Ctx) {
  header(c, 'Slide title')
}

/** Two content: a title and two bulleted text boxes side by side. */
export function twoContentBody(c: Ctx) {
  const gap = 64
  const colW = (inner(c) - gap) / 2
  const y = header(c, 'Slide title')
  for (let i = 0; i < 2; i++) text(c, 'body', ['First point', 'Second point'].map((b) => para(b, 'bullet')), c.M + i * (colW + gap), y, colW, c.bottom - y, 32, { min: 20 })
}

const HINT: Partial<Record<TextElement['role'], string>> = {
  title: 'Click to add title', subtitle: 'Click to add subtitle', heading: 'Click to add heading', body: 'Click to add text', caption: 'Click to add caption', quote: 'Click to add quote',
}

/**
 * Empties every text box of a composed slide and gives it the prompt for its role. The bullets of a text box stay (typing starts as the first bullet); a figure box (a badge number)
 * is left as drawn, since it is not something a person types.
 */
export function blankHints(elements: SlideElement[]): SlideElement[] {
  return elements.map((e) => {
    if (e.type !== 'text') return e
    const hint = HINT[e.role]
    if (!hint) return e
    const list = e.paragraphs[0]?.list
    return { ...e, hint, paragraphs: [{ runs: [{ text: '' }], ...(list ? { list } : {}) }] }
  })
}
