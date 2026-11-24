import { CANVAS, HIGHLIGHTS, chartTypeProblem, type ChartType, TEXT_OUTLINE_MAX, canFlip, canRotate, normAngle, cellNumber, alignCells, describeArea, insertColumn, insertRow, mergeAt, mergeCells, removeColumn, removeRow, reorderRows, unmergeCells, validMerges, type CellArea, type GridParts, isRunBold, isRunItalic, styleWords, textBaseWeight, expandToGroups, formatCell, type ElementChange, type Presentation, type ShapeKind, type Slide, type SlideElement, type TextElement } from '@prompttoppt/validation'
import { estimateTextHeight, metricOptsFor } from '../text-metrics'
import { EFFECTS, canStack, chartColor, chartLookOn, chartShowsFigures, shapeDef } from '@prompttoppt/validation'

/**
 * Element-level editing as a CLOSED set of typed operations ("make it bigger", "move it to the right", "text size 32", "make it bold", "delete it"). `planElementChange` turns one operation on
 * one element into ABSOLUTE values, or says why it cannot; the editor applies those values with its own commands, and the check compares the deck with exactly those numbers. Pure, shared by
 * the server (which plans) and the tests. No model ever outputs a coordinate.
 */
export type Edge = 'left' | 'right' | 'top' | 'bottom' | 'center' | 'center_h' | 'center_v'
export type ElementOp =
  | { op: 'move'; to?: Edge | undefined; dx?: number | undefined; dy?: number | undefined; /** the person said to put it ON TOP of what is there ("anyway", "over the text") */ overlap?: boolean | undefined }
  | { op: 'resize'; scale?: number | undefined; width?: number | undefined; height?: number | undefined; overlap?: boolean | undefined }
  | { op: 'font_size'; size?: number | undefined; delta?: number | undefined; scale?: number | undefined; same?: boolean | undefined; /** the DIRECTION the person asked for ("increase", "smaller"): a number that goes the other way is never used */ change?: 'bigger' | 'smaller' | undefined }
  | { op: 'text_style'; bold?: boolean | undefined; italic?: boolean | undefined; color?: string | undefined; align?: 'left' | 'center' | 'right' | 'justify' | undefined; uppercase?: boolean | undefined
      underline?: boolean | undefined; valign?: 'top' | 'middle' | 'bottom' | undefined
      /** ONLY these words of the text get bold / italic / underline / colour ("make 'revenue' bold"); the rest of the box is left as it is */
      words?: string | undefined
      /** a marker colour behind the words (or all the text): the typing bar's own five, or none; the whole box: a shadow under the letters, an outline round them */
      highlight?: 'yellow' | 'green' | 'pink' | 'blue' | 'orange' | 'none' | undefined; shadow?: 'none' | 'soft' | 'strong' | undefined; outline?: string | undefined; outlineWidth?: number | undefined
      /** words or the person's own number (line spacing 0.7-2.2, letter spacing in px, paragraph gap in multiples of the size, weight 300-900): code turns words into numbers */
      lineSpacing?: 'tighter' | 'looser' | number | undefined; letterSpacing?: 'tighter' | 'wider' | 'normal' | number | undefined; paragraphSpacing?: 'less' | 'more' | number | undefined; weight?: 'lighter' | 'bolder' | number | undefined
      /** the letters' case: upper/normal is a display setting; lower/sentence/title change the letters of the person's own words (acronyms kept) */ textCase?: 'upper' | 'normal' | 'lower' | 'sentence' | 'title' | undefined
      list?: 'bullet' | 'number' | 'none' | undefined; /** shrink: the text gets smaller until it fits its box; box: the box takes the height its text needs (only into free room) */ fit?: 'shrink' | 'box' | undefined }
  | { op: 'align'; to: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'; overlap?: boolean | undefined }
  | { op: 'delete' }
  | { op: 'chart_type'; to: ChartType }
  | { op: 'chart_order'; order: 'high_to_low' | 'low_to_high' | 'a_to_z' }
  | { op: 'table_order'; column: number | string; order: 'asc' | 'desc' }
  | { op: 'table_rows'; action: 'add' | 'remove'; at?: 'start' | 'end' | undefined; row?: number | undefined; count?: number | undefined }
  | { op: 'table_columns'; action: 'add' | 'remove'; at?: 'start' | 'end' | undefined; column?: number | string | undefined }
  | { op: 'table_style'; headerFill?: string | undefined; headerColor?: string | undefined; rowFill?: string | undefined; altRowFill?: string | undefined; textColor?: string | undefined; borderColor?: string | undefined }
  | { op: 'animate'; effect: string; rewind?: boolean | undefined; start?: 'click' | 'with' | 'after' | undefined; speed?: 'fast' | 'normal' | 'slow' | undefined; seconds?: number | undefined; delay?: number | undefined; repeat?: number | undefined; loop?: boolean | undefined; distance?: 'small' | 'medium' | 'large' | undefined; direction?: 'left' | 'right' | 'up' | 'down' | undefined; by?: 'paragraph' | 'word' | 'letter' | undefined; easing?: 'smooth' | 'slow-start' | 'slow-end' | 'steady' | 'bounce' | undefined; /** which object, when clicked, plays it (the capability finds it on the slide) */ whenClicked?: ({ by: string } & Record<string, unknown>) | undefined }
  | { op: 'picture_style'; overlay?: 'lighter' | 'darker' | 'none' | undefined; clip?: 'none' | 'circle' | 'arch' | 'diagonal' | 'diagonal-flip' | 'hex' | undefined; corners?: 'square' | 'small' | 'medium' | 'large' | undefined; fit?: 'cover' | 'contain' | undefined; zoom?: 'in' | 'out' | 'reset' | number | undefined; view?: 'left' | 'right' | 'up' | 'down' | 'center' | undefined; brightness?: 'brighter' | 'darker' | undefined; contrast?: 'more' | 'less' | undefined; blackAndWhite?: boolean | undefined; /** colour: "more vivid" / "muted" / back to normal */ saturation?: 'more' | 'less' | 'normal' | undefined; /** white balance: warmer (golden) / cooler (bluer) / back to neutral */ warmth?: 'warmer' | 'cooler' | 'normal' | undefined; /** a soft-focus blur (none = sharp again) */ blur?: 'soft' | 'strong' | 'none' | undefined; /** a line round the inside of the frame: a colour (theme word or hex), or none; its width */ border?: string | undefined; borderWidth?: number | undefined; shadow?: 'none' | 'soft' | 'strong' | undefined; resetLook?: boolean | undefined }
  | { op: 'table_highlight'; column: number | string; which: 'max' | 'min' | 'clear'; color?: string | undefined }
  | { op: 'table_format'; column: number | string; format: 'thousands' | 'percent' | 'usd' | 'inr' | 'eur' | 'gbp'; decimals?: number | undefined }
  | { op: 'group' }
  | { op: 'ungroup' }
  | { op: 'animate_clear'; kind?: 'entrance' | 'emphasis' | 'exit' | undefined }
  | { op: 'animate_remove_at'; position: number }
  | { op: 'animate_start'; start: 'click' | 'with' | 'after' }
  | { op: 'animate_sequence'; order: unknown[] }
  | { op: 'copy_animation'; from: unknown; fromSlide?: number | undefined }
  | { op: 'animate_order'; to: 'first' | 'last' | 'earlier' | 'later' }
  | { op: 'table_cell'; row?: number | string | undefined; column: number | string; text: string }
  /** merge (or unmerge) a block of cells: rows "header", counted from 1 below it, or named by their first cell; columns by header name or counted from 1; a missing row = the whole column below the header, a missing column = the whole row; unmerge with neither = every merge */
  | { op: 'table_merge'; action: 'merge' | 'unmerge'; row?: number | string | undefined; toRow?: number | string | undefined; column?: number | string | undefined; toColumn?: number | string | undefined }
  /** align the words of a block of cells (named like table_merge; nothing named = the whole table): across and / or up and down */
  | { op: 'table_align'; row?: number | string | undefined; toRow?: number | string | undefined; column?: number | string | undefined; toColumn?: number | string | undefined; align?: 'left' | 'center' | 'right' | undefined; valign?: 'top' | 'middle' | 'bottom' | undefined }
  | { op: 'chart_value'; label: number | string; value: number; series?: string | undefined }
  | { op: 'copy_object'; fromSlide: number }
  | { op: 'layer'; to: 'front' | 'back' | 'forward' | 'backward' | 'behind' | 'above'; of?: unknown }
  | { op: 'lock' } | { op: 'unlock' } | { op: 'hide' } | { op: 'show' }
  | { op: 'rename'; name: string }
  | { op: 'select' }
  /** a picture cut to a shape ("16:9", "square"), pushed to one side, or to the SUBJECT the person named (found by a vision step; the box arrives as fractions of the picture) */
  | { op: 'crop'; ratio?: '16:9' | '4:3' | '3:2' | '1:1' | '9:16' | '3:4' | '2:3' | 'original' | undefined; focus?: 'center' | 'left' | 'right' | 'top' | 'bottom' | undefined; subject?: string | undefined }
  /** the look of another object of the same kind ("same look as this picture") */
  | { op: 'copy_look'; from?: unknown; fromSlide?: number | undefined }
  /** another kind of shape ("make it a circle"); equalSides = a PERFECT circle / square (width = height) */
  | { op: 'shape_kind'; to: ShapeKind; equalSides?: boolean | undefined }
  /** turned to an angle, or BY an angle ("rotate it 45 degrees" = by) */
  | { op: 'rotate'; degrees: number; by?: boolean | undefined }
  /** mirrored as seen (PowerPoint's Flip): pictures and shapes only; a turned object's angle reverses too */
  | { op: 'flip'; axis: 'horizontal' | 'vertical' }
  /** the size of another object ("as big as the picture"); same_size: all the objects named take one size */
  | { op: 'match_size'; of?: unknown; dimension?: 'both' | 'width' | 'height' | undefined }
  | { op: 'same_size'; dimension?: 'both' | 'width' | 'height' | undefined }
  /** a chart's look beyond its data: the legend, a trend line, the figures on the marks, one series' (or slice's) colour */
  | { op: 'chart_style'; legend?: 'none' | 'bottom' | 'right' | 'auto' | undefined; trendline?: boolean | undefined; dataLabels?: boolean | undefined; seriesColor?: { series: string | number; color: string } | undefined; stack?: 'stacked' | 'percent' | 'none' | undefined }
  /** a new series or category with the PERSON's figures (the capability checks they are in the message) */
  | { op: 'chart_add'; kind: 'series' | 'category'; name: string; values: number[] }
  /** a table's text size */
  | { op: 'table_font'; size?: number | undefined; change?: 'bigger' | 'smaller' | undefined }
  /** a NEW chart on the slide from figures the person typed (placed by the capability in free room) */
  | { op: 'add_chart'; chartType: ChartType; labels: string[]; series: { name: string; values: number[] }[]; unit?: string | undefined }
  | { op: 'distribute'; axis: 'horizontal' | 'vertical' }
  | { op: 'chart_from_table'; chartType?: ChartType | undefined }
  | { op: 'shape_style'; fill?: string | undefined; /** two colours (theme words or hex) and an angle: the fill becomes a gradient */ gradient?: { from: string; to: string; angle?: number | undefined; radial?: boolean | undefined } | undefined; stroke?: string | undefined; strokeWidth?: number | undefined; dash?: 'solid' | 'dashed' | 'dotted' | undefined; /** a shadow under the shape (the pictures' presets) */ shadow?: 'none' | 'soft' | 'strong' | undefined; radius?: number | undefined; opacity?: number | undefined }
  | { op: 'add_shape'; shape: ShapeKind; /** several equal shapes in a row ("three equal cards"): placed by code in free room */ count?: number | undefined; around?: boolean | undefined; at?: Edge | undefined; size?: 'small' | 'medium' | 'large' | undefined; fill?: string | undefined; stroke?: string | undefined; strokeWidth?: number | undefined; radius?: number | undefined; opacity?: number | undefined }

export type Planned = { ok: true; change: ElementChange; /** a change to do FIRST (the table made narrower to leave room for its chart) */ also?: ElementChange; /** objects moved to make room (a picture moved left: the text it would cover takes the picture's old place) */ others?: ElementChange[]; /** what the person should know (made as big as fits, not as big as asked) */ note?: string } | { ok: false; why: string }

/** the distance an element keeps from the slide's edge when it is moved "to the right/left/top/bottom": 5% of the width */
export const edgeMargin = (doc: Presentation) => Math.round(CANVAS[doc.aspectRatio].width * 0.05)

const TYPE_WORD: Record<string, string> = { image: 'picture', shape: 'shape', icon: 'icon', chart: 'chart', table: 'table', diagram: 'diagram', text: 'text box' }
/** "the title", "the picture", "the text box": how the element is named in a message */
export function describeElement(e: SlideElement): string {
  if (e.type === 'text') return e.role === 'title' ? 'the title' : e.role === 'subtitle' ? 'the subtitle' : e.role === 'heading' ? 'a heading' : e.role === 'body' ? 'the body text' : e.role === 'caption' ? 'a caption' : e.role === 'metric' ? 'a number' : e.role === 'quote' ? 'the quote' : 'the text box'
  return `the ${TYPE_WORD[e.type] ?? e.type}`
}

const EDGE_PHRASE: Record<Edge, string> = { left: 'to the left', right: 'to the right', top: 'to the top', bottom: 'to the bottom', center: 'to the centre', center_h: 'to the horizontal centre', center_v: 'to the vertical centre' }
const ALIGN_PHRASE = { left: 'to the left', center: 'to the horizontal centre', right: 'to the right', top: 'to the top', middle: 'to the vertical centre', bottom: 'to the bottom' } as const
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const MIN_FONT = 8, MAX_FONT = 400
/** one step of "bigger" / "smaller" text when no number was given */
const STEP_UP = 1.25, STEP_DOWN = 0.8
/** the smallest growth still worth doing (below it, the text "cannot grow" and the person is told why) */
const MIN_GROWTH = 1.1
type Base = { slideId: string; elementId: string; desc: string }

const namesOf = (els: SlideElement[]) => { const n = [...new Set(els.map(describeElement))].slice(0, 3); return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}` }

const round2t = (v: number) => Math.round(v * 100) / 100
/** a word that is an acronym or a name written in capitals ("AI", "NASA", "Q4"): kept as it is by sentence and title case */
const keepCase = (w: string) => w.length >= 2 && w === w.toUpperCase() && /\p{L}/u.test(w)
const SMALL = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'by', 'with', 'from', 'as', 'vs'])
/** the same words with their letters' case changed; the runs (bold, colour, links) keep their own look. Sentence: first letter of each sentence; title: every word except small ones. */
export function caseParagraphs(paragraphs: TextElement['paragraphs'], to: 'lower' | 'sentence' | 'title'): TextElement['paragraphs'] {
  return paragraphs.map((p) => {
    let start = true, wordStart = true, first = true
    const runs = p.runs.map((r) => {
      // whole words decide (an acronym is kept), letters are changed in place so a word split over two runs stays one word
      const out = r.text.replace(/(\p{L}[\p{L}\p{N}'’]*)|([^\p{L}]+)/gu, (m, word: string | undefined) => {
        if (!word) { if (/[.!?]\s*$/.test(m)) start = true; if (/\s/.test(m)) wordStart = true; return m }
        let w = word
        if (to === 'lower') w = word.toLowerCase()
        else if (keepCase(word)) w = word
        else if (to === 'sentence') w = start ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()
        else w = (first || !SMALL.has(word.toLowerCase())) && wordStart ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()
        start = false; wordStart = false; first = false
        return w
      })
      return { ...r, text: out }
    })
    return { ...p, runs }
  })
}

/** A colour in words for a reply: the deck's colour by its role, else its everyday name and code ("red (#DC2626)"). */
function colourWord(_doc: Presentation, c: string): string {
  const roles: Record<string, string> = { primary: 'the main colour', secondary: 'the second colour', accent: 'the accent colour', textPrimary: 'the text colour', textSecondary: 'the muted text colour', onPrimary: 'the on-colour text colour' }
  if (roles[c]) return roles[c]!
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c)
  if (!m) return c
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min, sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4), hue = (h + 360) % 360
  const name = l < 0.15 ? 'black' : l > 0.94 ? 'white' : sat < 0.18 ? 'grey' : hue < 15 || hue >= 345 ? 'red' : hue < 40 ? 'orange' : hue < 66 ? 'yellow' : hue < 165 ? 'green' : hue < 195 ? 'teal' : hue < 255 ? 'blue' : hue < 290 ? 'purple' : 'pink'
  return `${name} (${c.toUpperCase()})`
}

/** Words to numbers for a text box's formatting (the model only picks words, or passes the person's own number). Fills `patch`; returns the wording, or why it cannot be done. */
function textFormat(doc: Presentation, slide: Slide, el: TextElement, o: Extract<ElementOp, { op: 'text_style' }>, patch: NonNullable<ElementChange['patch']>): { ok: true; verb?: string; note?: string } | { ok: false; why: string } {
  const said: string[] = []
  if (o.valign) { patch.valign = o.valign; said.push(`placed the text of {} at the ${o.valign === 'middle' ? 'middle' : o.valign} of its box`) }
  if (o.lineSpacing !== undefined) {
    const now = el.lineHeight ?? 1.3
    patch.lineHeight = round2t(clamp(typeof o.lineSpacing === 'number' ? o.lineSpacing : o.lineSpacing === 'looser' ? now + 0.2 : now - 0.15, 0.7, 2.2))
    said.push(typeof o.lineSpacing === 'number' ? `set the line spacing of {} to ${patch.lineHeight}` : `gave {} ${o.lineSpacing === 'looser' ? 'more' : 'less'} space between lines`)
  }
  if (o.paragraphSpacing !== undefined) {
    const now = el.paraGap ?? 0.5
    patch.paraGap = round2t(clamp(typeof o.paragraphSpacing === 'number' ? o.paragraphSpacing : o.paragraphSpacing === 'more' ? now + 0.3 : now - 0.25, 0, 2))
    said.push(`gave {} ${patch.paraGap > now ? 'more' : 'less'} space between paragraphs`)
  }
  if (o.letterSpacing !== undefined) {
    const now = el.letterSpacing ?? 0
    const to = typeof o.letterSpacing === 'number' ? o.letterSpacing : o.letterSpacing === 'normal' ? 0 : o.letterSpacing === 'wider' ? now + Math.max(1, el.fontSize * 0.05) : now - Math.max(0.5, el.fontSize * 0.03)
    patch.letterSpacing = round2t(clamp(to, -12, 30))
    said.push(o.letterSpacing === 'normal' ? 'set the letter spacing of {} back to normal' : `set the letter spacing of {} ${patch.letterSpacing > now ? 'wider' : 'tighter'}`)
  }
  if (o.weight !== undefined) {
    const now = textBaseWeight(el) // as drawn (the one rule the slide and the export use)
    const to = typeof o.weight === 'number' ? o.weight : o.weight === 'bolder' ? now + 200 : now - 200
    patch.weight = Math.round(clamp(to, 300, 900) / 100) * 100
    if (patch.weight === now) return { ok: false, why: `the text of ${describeElement(el)} is already as ${o.weight === 'bolder' ? 'heavy' : 'light'} as it can be` }
    said.push(`made the letters of {} ${patch.weight > now ? 'heavier' : 'lighter'}`)
  }
  let paragraphs = el.paragraphs
  if (o.textCase !== undefined) {
    if (o.textCase === 'upper' || o.textCase === 'normal') { patch.uppercase = o.textCase === 'upper'; said.push(o.textCase === 'upper' ? 'put {} in capitals' : 'took the capitals off {}') }
    else { paragraphs = caseParagraphs(paragraphs, o.textCase); patch.uppercase = false; said.push(`put {} in ${o.textCase === 'lower' ? 'lower case' : o.textCase === 'sentence' ? 'sentence case' : 'title case'}`) }
  }
  if (o.list !== undefined) {
    paragraphs = paragraphs.map((p) => { const q = { ...p }; if (o.list === 'none') delete q.list; else q.list = o.list as 'bullet' | 'number'; return q })
    said.push(o.list === 'none' ? 'took the bullets off {}' : o.list === 'number' ? 'made {} a numbered list' : 'made {} a bulleted list')
  }
  if (paragraphs !== el.paragraphs) patch.paragraphs = paragraphs
  let note: string | undefined
  if (o.fit) {
    const m = metricOptsFor({ ...el, ...(patch.uppercase !== undefined ? { uppercase: patch.uppercase } : {}), ...(patch.letterSpacing !== undefined ? { letterSpacing: patch.letterSpacing } : {}), ...(patch.lineHeight !== undefined ? { lineHeight: patch.lineHeight } : {}), ...(patch.paraGap !== undefined ? { paraGap: patch.paraGap } : {}) } as TextElement, doc.theme)
    const need = Math.ceil(estimateTextHeight(paragraphs, el.fontSize, el.width, m))
    if (o.fit === 'shrink') {
      if (need <= el.height) return { ok: false, why: `the text of ${describeElement(el)} already fits its box` }
      const floor = Math.max(MIN_FONT, Math.round(el.fontSize * 0.6))
      let size = el.fontSize
      while (size > floor && estimateTextHeight(paragraphs, size, el.width, m) > el.height) size--
      if (estimateTextHeight(paragraphs, size, el.width, m) > el.height) return { ok: false, why: `the text of ${describeElement(el)} would have to get smaller than ${floor} pt to fit its box: make the text shorter or the box bigger` }
      patch.fontSize = size
      said.push(`made the text of {} smaller so it fits its box (${Math.round(el.fontSize)} → ${size} pt)`)
    } else {
      if (Math.abs(need - el.height) <= 4) return { ok: false, why: `the box of ${describeElement(el)} already fits its text` }
      const { height: H } = CANVAS[doc.aspectRatio]
      const height = Math.min(need, H - el.y)
      const hit = height > el.height ? newContacts(doc, slide, el, { height }) : []
      if (hit.length) return { ok: false, why: `the box of ${describeElement(el)} cannot grow to fit its text: it would cover ${namesOf(hit)}` }
      if (need > H - el.y) note = `the text of ${describeElement(el)} still runs past the bottom of the slide: make it shorter or smaller`
      patch.height = height
      said.push(`made the box of {} fit its text`)
    }
  }
  if (!said.length) return { ok: true }
  const verb = said.join(' and ')
  return { ok: true, verb: verb.charAt(0).toUpperCase() + verb.slice(1), ...(note ? { note } : {}) }
}

/**
 * A text size for a text box, in ITS OWN place. Smaller: just the size. Bigger: the box grows DOWN only when the text needs more height, and only into room that is free (never over another
 * object, never past the slide). A number the person gave is used as given (said plainly when it no longer fits); a step ("bigger", "1.3x") takes the largest size up to it that fits, and is
 * refused with the reason when not even a small step fits.
 */
function sizeTextPlan(doc: Presentation, slide: Slide, el: TextElement, base: Base, want: number, exact: boolean, overlap?: boolean): Planned {
  const target = Math.round(clamp(want, MIN_FONT, MAX_FONT))
  const verb = exact ? `Set the text size of {} to ${target} pt` : target >= el.fontSize ? 'Made the text of {} bigger' : 'Made the text of {} smaller'
  if (target <= el.fontSize) return { ok: true, change: { ...base, patch: { fontSize: target }, verb } }
  const { height: H } = CANVAS[doc.aspectRatio]
  const m = metricOptsFor(el, doc.theme)
  // the estimate's own error on this box (a box laid out by the engine may already "overflow" by the estimate): kept, so only the GROWTH is measured
  const over = Math.max(0, estimateTextHeight(el.paragraphs, el.fontSize, el.width, m) - el.height)
  const bottom = H - Math.round(edgeMargin(doc) / 2)
  const at = (size: number): { patch: NonNullable<ElementChange['patch']> } | { why: string } => {
    const need = Math.ceil(estimateTextHeight(el.paragraphs, size, el.width, m) - over)
    if (need <= el.height) return { patch: { fontSize: size } }
    if (el.y + need > bottom && !overlap) return { why: 'run past the bottom of the slide' }
    const height = Math.min(need, H - el.y)
    const hit = overlap ? [] : newContacts(doc, slide, el, { height })
    return hit.length ? { why: `cover ${namesOf(hit)}` } : { patch: { fontSize: size, height } }
  }
  const first = at(target)
  if ('patch' in first) return { ok: true, change: { ...base, patch: first.patch, verb } }
  if (exact) return { ok: true, change: { ...base, patch: { fontSize: target }, verb }, note: `at ${target} pt the text of ${base.desc} no longer fits its box (a taller box would ${first.why}): make the text shorter or give it more room` }
  const floor = Math.max(el.fontSize + 2, Math.round(el.fontSize * MIN_GROWTH))
  for (let size = target - 1; size >= floor; size--) {
    const r = at(size)
    if ('patch' in r) return { ok: true, change: { ...base, patch: r.patch, verb }, note: `I made ${base.desc} ${size} pt (from ${Math.round(el.fontSize)}), as big as fits: ${target} pt would ${first.why}` }
  }
  return { ok: false, why: `${base.desc} has no room to grow: bigger text would ${first.why} (make room first, or say "bigger even if it overlaps")` }
}

/** inside the slide; and inside its margins (4% of the width) on every side where the object was inside them before (a full-bleed picture may stay full-bleed) */
const inside = (doc: Pick<Presentation, 'aspectRatio'>, b: Box, was?: Box) => {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const m = was ? Math.round(W * 0.04) : 0
  const lo = (v: number) => Math.min(m, v ?? m), x0 = was ? lo(was.x) : 0, y0 = was ? lo(was.y) : 0
  const x1 = was ? Math.max(W - m, was.x + was.width) : W, y1 = was ? Math.max(H - m, was.y + was.height) : H
  return b.x >= x0 - 0.5 && b.y >= y0 - 0.5 && b.x + b.width <= x1 + 0.5 && b.y + b.height <= y1 + 0.5
}
/** what a changed object would TOUCH that it did not touch before (strict: any covered pixel; the rule for where it may go, as for new objects) */
export function newContacts(doc: Pick<Presentation, 'aspectRatio'>, slide: Pick<Slide, 'elements'>, el: SlideElement, patch: Partial<Box>): SlideElement[] {
  const after: Box = { x: patch.x ?? el.x, y: patch.y ?? el.y, width: patch.width ?? el.width, height: patch.height ?? el.height }
  return slide.elements.filter((o) => o.id !== el.id && takesRoom(doc, o) && coveredArea(after, o) > 0 && coveredArea(el, o) === 0)
}

/**
 * A bigger object goes where there is ROOM: grown from its centre, or from a corner or an edge (so a picture next to text grows away from the text), never over another object. When the size
 * asked for fits nowhere, the largest smaller growth that fits is used and the person is told; when not even a small growth fits, nothing is done and the reason is given.
 */
function growIntoRoom(doc: Presentation, slide: Slide, el: SlideElement, base: Base, w: number, h: number, verb: string): Planned {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const spots = (ww: number, hh: number): Box[] => {
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2
    const xs = [cx - ww / 2, el.x, el.x + el.width - ww], ys = [cy - hh / 2, el.y, el.y + el.height - hh]
    return xs.flatMap((x) => ys.map((y) => ({ x: Math.round(clamp(x, 0, Math.max(0, W - ww))), y: Math.round(clamp(y, 0, Math.max(0, H - hh))), width: Math.round(ww), height: Math.round(hh) })))
  }
  const fitAt = (f: number) => spots(el.width + (w - el.width) * f, el.height + (h - el.height) * f).find((b) => inside(doc, b, el) && newContacts(doc, slide, el, b).length === 0)
  const full = fitAt(1)
  if (full) return { ok: true, change: { ...base, patch: { ...full }, verb } }
  const blocked = namesOf(newContacts(doc, slide, el, spots(w, h)[0]!)) || 'the edge of the slide'
  // a part of the growth: the largest share of it that fits (at least a visible step)
  const least = Math.max(0, Math.min(1, (MIN_GROWTH - 1) / Math.max(0.0001, Math.max(w / el.width, h / el.height) - 1)))
  for (let f = 0.9; f >= least - 1e-9; f -= 0.1) {
    const b = fitAt(f)
    if (b) return { ok: true, change: { ...base, patch: { ...b }, verb }, note: `I made ${base.desc} as big as fits without covering ${blocked}` }
  }
  // no free room: the text beside it gives up some of ITS width (a picture-and-text slide gets a wider picture column), when that text still fits at its own size
  const widened = growSideways(doc, slide, el, base, w, verb)
  if (widened) return widened
  return { ok: false, why: `${base.desc} has no free room around it: bigger, it would cover ${blocked} (make room first, or say "bigger even if it overlaps")` }
}

/**
 * A wider object, with the text boxes beside it made NARROWER to make room ("make this image bigger" on a slide where the picture fills its column: the picture column gets wider, the
 * text column narrower). Only text boxes may give room, only from one side, never locked or grouped ones, and only while their text still fits at its own size (the same estimate as the
 * overflow check) and they keep at least 60% of their width. Anything else in the way: no plan (the caller says why).
 */
function growSideways(doc: Presentation, slide: Slide, el: SlideElement, base: Base, w: number, verb: string): Planned | null {
  const { width: W } = CANVAS[doc.aspectRatio]
  const m = Math.round(W * 0.04)
  if (w <= el.width + 4) return null
  const others = slide.elements.filter((o) => o.id !== el.id && takesRoom(doc, o))
  const level = (o: SlideElement) => o.y < el.y + el.height && o.y + o.height > el.y
  const leftSide = others.filter((o) => level(o) && o.x + o.width <= el.x + 1), rightSide = others.filter((o) => level(o) && o.x >= el.x + el.width - 1)
  const tryGrow = (f: number, side: 'left' | 'right'): Planned | null => {
    const ww = Math.round(el.width + (w - el.width) * f)
    const x = side === 'left' ? Math.round(el.x + el.width - ww) : el.x
    if (x < Math.min(m, el.x) || x + ww > Math.max(W - m, el.x + el.width)) return null
    const box = { x, y: el.y, width: ww, height: el.height }
    const hit = newContacts(doc, slide, el, box)
    if (!hit.length) return null // (growIntoRoom already tried the free room)
    const gap = side === 'left' ? Math.max(24, Math.min(...leftSide.map((o) => el.x - (o.x + o.width)))) : Math.max(24, Math.min(...rightSide.map((o) => o.x - (el.x + el.width))))
    const changes: ElementChange[] = []
    for (const h of hit) {
      if (h.type !== 'text' || h.locked || h.groupId) return null
      if (side === 'left' ? h.x + h.width > el.x + 1 : h.x < el.x + el.width - 1) return null // (only what is beside it, on that side)
      const nx = side === 'left' ? h.x : x + ww + gap
      const nw = side === 'left' ? x - gap - h.x : h.x + h.width - nx
      if (nw < h.width * 0.6) return null
      const mo = metricOptsFor(h, doc.theme)
      const over = Math.max(0, estimateTextHeight(h.paragraphs, h.fontSize, h.width, mo) - h.height)
      if (estimateTextHeight(h.paragraphs, h.fontSize, nw, mo) - over > h.height) return null // its text would no longer fit
      changes.push({ slideId: base.slideId, elementId: h.id, desc: describeElement(h), patch: { x: Math.round(nx), width: Math.round(nw) }, verb: 'Made {} narrower to make room' })
    }
    // nothing else is touched by the wider object, and the narrowed text touches nothing new
    const after = { ...slide, elements: slide.elements.map((e) => { const c = changes.find((x) => x.elementId === e.id); return c ? ({ ...e, ...c.patch } as SlideElement) : e }) }
    if (newContacts(doc, after, el, box).length) return null
    for (const c of changes) { const h = slide.elements.find((e) => e.id === c.elementId)!; if (newContacts(doc, after, h, c.patch as Partial<Box>).some((o) => o.id !== el.id)) return null }
    return { ok: true, change: { ...base, patch: box, verb }, others: changes, ...(f < 1 ? { note: `I made ${base.desc} as wide as the text beside it allows` } : {}) }
  }
  for (const side of [rightSide.length ? 'right' : null, leftSide.length ? 'left' : null].filter(Boolean) as ('left' | 'right')[]) {
    for (let f = 1; f >= 0.3 - 1e-9; f -= 0.1) { const r = tryGrow(f, side); if (r) return r }
  }
  return null
}

/**
 * A move that would land on other objects: they SWAP places with it (a picture moved to the left of a picture-and-text slide: the text goes right, into the place the picture leaves) when they
 * fit there and nothing else gets covered; otherwise nothing is moved and the reason is given. Locked objects, grouped objects and a template's own text are never pushed around.
 */
function makeRoom(doc: Presentation, slide: Slide, el: SlideElement, change: ElementChange): Planned {
  const p = change.patch as Box & Record<string, unknown>
  const hit = newContacts(doc, slide, el, p)
  if (!hit.length) return { ok: true, change }
  const dx = p.x - el.x, dy = p.y - el.y
  const refuse = (why: string): Planned => ({ ok: false, why: `moving ${describeElement(el)} there would cover ${namesOf(hit)}, ${why} (say "move it anyway" to put it on top)` })
  if (hit.some((h) => h.locked)) return refuse(`and ${namesOf(hit.filter((h) => h.locked))} is locked`)
  if (hit.some((h) => h.groupId)) return refuse('which is part of a group')
  const after = new Map<string, Box>([[el.id, { x: p.x, y: p.y, width: el.width, height: el.height }]])
  for (const h of hit) after.set(h.id, { x: Math.round(h.x - dx), y: Math.round(h.y - dy), width: h.width, height: h.height })
  if (![...after.values()].every((b) => inside(doc, b))) return refuse('and there is no room to swap them')
  // nothing that was clear before is covered after the swap (the moved objects among themselves and with everything else on the slide)
  const box = (e: SlideElement) => after.get(e.id) ?? e
  const room = slide.elements.filter((e) => takesRoom(doc, e) || after.has(e.id))
  for (const a of room) for (const b of room) {
    if (a.id >= b.id || (!after.has(a.id) && !after.has(b.id))) continue
    if (coveredArea(box(a), box(b)) > 0 && coveredArea(a, b) === 0) return refuse('and there is no room to swap them')
  }
  const others = hit.map((h): ElementChange => ({ slideId: change.slideId, elementId: h.id, desc: describeElement(h), patch: { x: after.get(h.id)!.x, y: after.get(h.id)!.y }, verb: 'Moved {} to make room' }))
  return { ok: true, change, others }
}

/** A column named by its header ("Price") or counted from 1; the NAME is what a person says, and code (not a model) finds it. `null` when there is no such column. */
export function columnIndex(header: string[], ref: number | string): number | null {
  if (typeof ref === 'number') return ref >= 1 && ref <= header.length ? Math.round(ref) - 1 : null
  const want = ref.trim().toLowerCase()
  const exact = header.findIndex((h) => h.trim().toLowerCase() === want)
  if (exact >= 0) return exact
  const part = header.map((h, i) => ({ h: h.toLowerCase(), i })).filter((x) => x.h.includes(want) || (want.length > 2 && want.includes(x.h) && x.h.length > 2))
  return part.length === 1 ? part[0]!.i : null
}
const headersText = (h: string[]) => h.map((x) => `"${x}"`).join(', ')

type TableEl = Extract<SlideElement, { type: 'table' }>
/** a grid change from the shared rule (packages/validation table-merge.ts) as a patch: merges and highlights follow their cells */
const gridPatch = (g: GridParts): NonNullable<ElementChange['patch']> => ({ header: g.header, rows: g.rows, merges: g.merges ?? null, highlights: g.highlights ?? [], aligns: g.aligns ?? null })
/** A row the way people name it: "header" (or 0), counted from 1 below the header, or by the words of its first cell ("Basic"). -1 = the header; null = no such row. */
export function tableRow(t: TableEl, ref: number | string): number | null {
  if (typeof ref === 'number') return ref === 0 ? -1 : ref >= 1 && ref <= t.rows.length ? Math.round(ref) - 1 : null
  if (/^\s*(the\s+)?(header|heading|title)s?(\s+row)?\s*$/i.test(ref)) return -1
  return columnIndex(t.rows.map((r) => r[0] ?? ''), ref)
}
/** the block of cells a table_merge names (see the op), or why it cannot be found */
function mergeArea(t: TableEl, o: Extract<ElementOp, { op: 'table_merge' }>, desc: string): CellArea | { why: string } {
  const rowName = (ref: number | string) => (typeof ref === 'number' ? `row ${ref}` : `"${ref}"`)
  const r0 = o.row === undefined ? 0 : tableRow(t, o.row), r1 = o.toRow === undefined ? (o.row === undefined ? t.rows.length - 1 : r0) : tableRow(t, o.toRow)
  if (r0 === null) return { why: `${desc} has no row ${rowName(o.row!)} (its rows are the header and ${headersText(t.rows.map((r) => r[0] ?? ''))})` }
  if (r1 === null) return { why: `${desc} has no row ${rowName(o.toRow!)} (its rows are the header and ${headersText(t.rows.map((r) => r[0] ?? ''))})` }
  const c0 = o.column === undefined ? 0 : columnIndex(t.header, o.column), c1 = o.toColumn === undefined ? (o.column === undefined ? t.header.length - 1 : c0) : columnIndex(t.header, o.toColumn)
  if (c0 === null) return { why: `${desc} has no column "${o.column}" (its columns are ${headersText(t.header)})` }
  if (c1 === null) return { why: `${desc} has no column "${o.toColumn}" (its columns are ${headersText(t.header)})` }
  return { row: Math.min(r0, r1), column: Math.min(c0, c1), rows: Math.abs(r1 - r0) + 1, columns: Math.abs(c1 - c0) + 1 }
}

/** Plans one operation on one element of a slide. Refuses for a locked slide or element, and for operations that do not fit the element (a text size on a picture). */
export function planElementChange(doc: Presentation, slide: Slide, el: SlideElement, o: ElementOp, templateText = false): Planned {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const desc = describeElement(el)
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (el.locked && o.op !== 'unlock' && o.op !== 'lock') return { ok: false, why: `${desc} is locked` }
  const base = { slideId: slide.id, elementId: el.id, desc }
  const textAlign = o.op === 'align' && el.type === 'text' && (o.to === 'left' || o.to === 'center' || o.to === 'right')
  const geometry = o.op === 'rotate' || o.op === 'flip' || o.op === 'shape_kind' || o.op === 'move' || (o.op === 'resize' && !(el.type === 'text' && o.scale !== undefined)) || (o.op === 'align' && !textAlign) || o.op === 'delete'
  if (templateText && geometry) return { ok: false, why: 'it is part of the template animation: I can change the words and the text style, not where it is' }
  if (templateText && (o.op === 'hide' || o.op === 'show' || o.op === 'rename' || o.op === 'layer')) return { ok: false, why: 'it is part of the template animation: hiding, renaming or re-stacking it would break the Morph between the scenes' }
  switch (o.op) {
    case 'delete':
      return { ok: true, change: { ...base, remove: true, verb: 'Deleted {}' } }
    case 'move': {
      let { x, y } = el
      const m = edgeMargin(doc)
      const to = o.to
      if (to === 'left') x = m
      else if (to === 'right') x = W - m - el.width
      else if (to === 'top') y = m
      else if (to === 'bottom') y = H - m - el.height
      else if (to === 'center_h') x = (W - el.width) / 2
      else if (to === 'center_v') y = (H - el.height) / 2
      else if (to === 'center') { x = (W - el.width) / 2; y = (H - el.height) / 2 }
      else if (o.dx !== undefined || o.dy !== undefined) { x += o.dx ?? 0; y += o.dy ?? 0 }
      else return { ok: false, why: 'I was not told where to move it' }
      x = Math.round(clamp(x, 0, Math.max(0, W - el.width))); y = Math.round(clamp(y, 0, Math.max(0, H - el.height)))
      const change: ElementChange = { ...base, patch: { x, y }, verb: to ? `Moved {} ${EDGE_PHRASE[to]}` : 'Moved {}' }
      return o.overlap ? { ok: true, change } : makeRoom(doc, slide, el, change)
    }
    case 'resize': {
      // "make the title bigger": the TEXT gets bigger, in its own place (the box only grows down when the text needs it, and only into free room)
      if (el.type === 'text' && o.scale !== undefined) return sizeTextPlan(doc, slide, el, base, el.fontSize * o.scale, false, o.overlap)
      let w = el.width, h = el.height
      if (o.scale !== undefined) { w = el.width * o.scale; h = el.height * o.scale }
      else if (o.width !== undefined && o.height !== undefined) { w = o.width; h = o.height }
      else if (o.width !== undefined) { w = o.width; h = el.height * (o.width / el.width) }
      else if (o.height !== undefined) { h = o.height; w = el.width * (o.height / el.height) }
      else return { ok: false, why: 'I was not told how big it should be' }
      // never bigger than the slide (keeping the shape), never tiny
      const fit = Math.min(1, W / w, H / h)
      w = Math.max(24, w * fit); h = Math.max(24, h * fit)
      const cx = el.x + el.width / 2, cy = el.y + el.height / 2
      const x = Math.round(clamp(cx - w / 2, 0, Math.max(0, W - w))), y = Math.round(clamp(cy - h / 2, 0, Math.max(0, H - h)))
      const verb = o.scale !== undefined ? (o.scale >= 1 ? 'Made {} bigger' : 'Made {} smaller') : 'Resized {}'
      const grows = Math.round(w) > el.width || Math.round(h) > el.height
      if (!grows || o.overlap) return { ok: true, change: { ...base, patch: { x, y, width: Math.round(w), height: Math.round(h) }, verb } }
      return growIntoRoom(doc, slide, el, base, w, h, verb)
    }
    case 'font_size': {
      if (el.type !== 'text') return { ok: false, why: `${desc} has no text size` }
      let size = o.size ?? (o.scale !== undefined ? el.fontSize * o.scale : o.delta !== undefined ? el.fontSize + o.delta : undefined)
      let exact = o.size !== undefined
      // "increase" / "smaller": the direction is the person's, the number only the model's; a number going the other way (or none) becomes one clear step
      if (o.change === 'bigger' && (size === undefined || size <= el.fontSize)) { size = Math.max(el.fontSize + 2, el.fontSize * STEP_UP); exact = false }
      if (o.change === 'smaller' && (size === undefined || size >= el.fontSize)) { size = Math.min(el.fontSize - 2, el.fontSize * STEP_DOWN); exact = false }
      if (size === undefined) return { ok: false, why: 'I was not told which text size' }
      return sizeTextPlan(doc, slide, el, base, size, exact)
    }
    case 'text_style': {
      if (el.type !== 'text') return { ok: false, why: `${desc} is not text` }
      const patch: NonNullable<ElementChange['patch']> = {}
      // single words: their bold / italic / underline / colour go into the words' own runs; anything else asked (alignment, spacing…) is still about the whole box
      const words = o.words?.trim()
      if (o.color && !words) patch.color = o.color
      if (o.align) patch.align = o.align
      const alignSaid = o.align === 'justify' ? 'justified {}' : o.align === 'center' ? 'centred {}' : o.align ? `aligned {} ${o.align}` : ''
      if (o.uppercase !== undefined) patch.uppercase = o.uppercase
      const fmt = textFormat(doc, slide, el, o, patch)
      if (!fmt.ok) return fmt
      // effects (packages/validation text-effects.ts, the editor's Effects panel and the typing bar's markers): a shadow and an outline for the box, a highlight for words
      const fx: string[] = []
      if (o.shadow !== undefined) { patch.textShadow = o.shadow === 'none' ? null : o.shadow; fx.push(o.shadow === 'none' ? 'took the shadow off {}' : `gave {} a ${o.shadow} shadow`) }
      if (o.outline !== undefined) {
        if (o.outline === 'none') { patch.textOutline = null; fx.push('took the outline off {}') }
        else { const c = o.outline === 'text' ? 'textPrimary' : o.outline; patch.textOutline = { color: c, width: Math.round(clampN(o.outlineWidth ?? Math.max(1, Math.round(el.fontSize / 30)), 0.5, TEXT_OUTLINE_MAX) * 10) / 10 }; fx.push(`gave {} a ${colourWord(doc, c)} outline`) }
      }
      const marker = o.highlight === undefined ? undefined : o.highlight === 'none' ? null : HIGHLIGHTS.find((h) => h.label.toLowerCase() === o.highlight)?.hex ?? undefined
      if (o.highlight !== undefined && !words) {
        // all the text of the box: every word highlighted (or none)
        patch.paragraphs = (patch.paragraphs ?? el.paragraphs).map((p) => ({ ...p, runs: p.runs.map((r) => { const q = { ...r }; if (marker) q.highlight = marker as typeof r.highlight; else delete q.highlight; return q }) }))
        fx.push(marker ? `highlighted the text of {} in ${o.highlight}` : 'took the highlight off {}')
      }
      if (words) {
        const ws = { bold: o.bold, italic: o.italic, underline: o.underline, ...(o.color ? { color: (o.color === 'text' ? 'textPrimary' : o.color) as TextElement['color'] } : {}), ...(marker !== undefined ? { highlight: marker } : {}) }
        if (ws.bold === undefined && ws.italic === undefined && ws.underline === undefined && !ws.color && ws.highlight === undefined) return { ok: false, why: 'only bold, italic, underline, colour and a highlight can be given to single words' }
        const r = styleWords({ ...el, paragraphs: patch.paragraphs ?? el.paragraphs }, words, ws)
        if (!r.found) return { ok: false, why: `"${words}" is not in the text of ${desc}` }
        patch.paragraphs = r.paragraphs
        const look = [ws.bold === true ? 'bold' : ws.bold === false ? 'not bold' : '', ws.italic === true ? 'italic' : ws.italic === false ? 'not italic' : '', ws.underline === true ? 'underlined' : ws.underline === false ? 'not underlined' : '', ws.highlight ? `highlighted in ${o.highlight}` : ws.highlight === null ? 'not highlighted' : '', ws.color ? colourWord(doc, ws.color) : ''].filter(Boolean)
        const change: ElementChange = { ...base, verb: `Made "${words}" ${look.join(' and ')} in {}`, patch }
        return { ok: true, change, ...(fmt.note ? { note: fmt.note } : {}) }
      }
      if (alignSaid && !words) fx.unshift(alignSaid)
      const fxVerb = fx.join(' and ')
      const change: ElementChange = { ...base, verb: fmt.verb ? (fxVerb ? `${fmt.verb} and ${fxVerb}` : fmt.verb) : fxVerb ? fxVerb.charAt(0).toUpperCase() + fxVerb.slice(1) : 'Changed the text style of {}' }
      if (Object.keys(patch).length) change.patch = patch
      if (o.bold !== undefined) change.bold = o.bold
      if (o.italic !== undefined) change.italic = o.italic
      if (o.underline !== undefined) change.underline = o.underline
      if (!change.patch && change.bold === undefined && change.italic === undefined && change.underline === undefined) return { ok: false, why: 'I was not told which style' }
      return { ok: true, change, ...(fmt.note ? { note: fmt.note } : {}) }
    }
    case 'picture_style': {
      if (el.type !== 'image') return { ok: false, why: `${desc} is not a picture` }
      const patch: NonNullable<ElementChange['patch']> = {}
      if (o.clip !== undefined) patch.clip = o.clip
      if (o.corners !== undefined) patch.radius = ({ square: 0, small: 16, medium: 40, large: 90 } as const)[o.corners]
      if (o.fit !== undefined) patch.fit = o.fit
      const look = pictureLook(doc, el, o, patch)
      if (!look.ok) return { ok: false, why: look.why }
      if (!Object.keys(patch).length) return { ok: false, why: 'I was not told which shape' }
      if (patch.radius !== undefined && patch.radius > 0 && (patch.clip ?? el.clip) !== 'none') return { ok: false, why: `${desc} has a cut shape (${patch.clip ?? el.clip}), and rounded corners only go on a normal rectangle: say "no shape" first, or ask for the shape alone` }
      const onlyOverlay = o.overlay !== undefined && Object.keys(o).filter((k) => k !== 'op' && (o as Record<string, unknown>)[k] !== undefined).length === 1
      const pretty = [o.clip && o.clip !== 'none' ? `in a ${o.clip === 'arch' ? 'arch' : o.clip === 'hex' ? 'hexagon' : o.clip.replace('-', ' ')} shape` : '', o.clip === 'none' ? 'in a plain rectangle' : '', o.corners ? (o.corners === 'square' ? 'with square corners' : `with ${o.corners} rounded corners`) : '', o.fit ? (o.fit === 'contain' ? 'showing the whole picture' : 'filling its frame') : '', ...look.said].filter(Boolean).reduce((out, w, i, all) => out + (i === 0 ? '' : i === all.length - 1 ? ' and ' : ', ') + w, '') // "warmer and more colourful", never two words run together
      return { ok: true, change: { ...base, patch, verb: onlyOverlay ? (o.overlay === 'none' ? 'Took the colour wash off {}' : `Made the colour wash over {} ${o.overlay}`) : o.clip === undefined && o.corners === undefined && o.fit === undefined ? `Changed {}: ${pretty}` : `Put {} ${pretty}` } }
    }
    case 'shape_style': {
      const patch: NonNullable<ElementChange['patch']> = {}
      const shapeOnly = o.fill !== undefined || o.gradient !== undefined || o.stroke !== undefined || o.strokeWidth !== undefined || o.radius !== undefined || o.dash !== undefined || o.shadow !== undefined
      if (shapeOnly && el.type !== 'shape') return { ok: false, why: `${desc} is not a shape, so it has no fill or outline` }
      if (o.fill !== undefined) patch.fill = o.fill
      if (o.gradient) {
        // theme colour words become the deck's real colours (a gradient stores two hex colours); the angle is a number from the words ("left to right" 90, "top to bottom" 180)
        const hex = (w: string) => /^#[0-9a-f]{6}$/i.test(w) ? w.toLowerCase() : ((doc.theme.colors as Record<string, string>)[w === 'text' ? 'textPrimary' : w] ?? '').toLowerCase()
        const from = hex(o.gradient.from), to = hex(o.gradient.to)
        if (!/^#[0-9a-f]{6}$/.test(from) || !/^#[0-9a-f]{6}$/.test(to)) return { ok: false, why: 'a gradient needs two colours I can read: a deck colour (primary, secondary, accent, surface) or a hex colour' }
        patch.gradient = { from, to, angle: clamp(Math.round(o.gradient.angle ?? 135), 0, 360), ...(o.gradient.radial ? { kind: 'radial' as const } : {}) }
      }
      if (o.stroke !== undefined) patch.stroke = o.stroke
      if (o.strokeWidth !== undefined) patch.strokeWidth = clamp(Math.round(o.strokeWidth), 0, 80)
      if (o.radius !== undefined) patch.radius = Math.max(0, Math.round(o.radius))
      if (o.dash !== undefined && el.type === 'shape') {
        // a dashed border needs a border: never one made up (its colour is the person's to say); a line is its own border
        const bordered = el.shape === 'line' || el.shape === 'ring' || o.stroke !== undefined || (!!el.stroke && (el.strokeWidth ?? 3) > 0)
        if (!bordered && o.dash !== 'solid') return { ok: false, why: `${desc} has no border to make ${o.dash}: say a colour for the border too ("a ${o.dash} red border")` }
        patch.strokeDash = o.dash === 'solid' ? null : o.dash === 'dashed' ? 'dash' : 'dot'
        if (Object.keys(patch).length === 1) return { ok: true, change: { ...base, patch, verb: el.shape === 'line' ? `Made {} ${o.dash}` : `Made the border of {} ${o.dash}` } }
      }
      if (o.opacity !== undefined) patch.opacity = clamp(o.opacity, 0, 1)
      if (o.shadow !== undefined) { patch.shadow = o.shadow; if (Object.keys(patch).length === 1) return { ok: true, change: { ...base, patch, verb: o.shadow === 'none' ? 'Took the shadow off {}' : `Gave {} a ${o.shadow} shadow` } } }
      if (!Object.keys(patch).length) return { ok: false, why: 'I was not told which style' }
      // what was done, in words: a new border with its style says so ("Restyled" told the person nothing)
      const verb = o.dash !== undefined && o.dash !== 'solid' && o.stroke !== undefined && Object.keys(patch).every((k) => k === 'stroke' || k === 'strokeWidth' || k === 'strokeDash') ? `Gave {} a ${o.dash} border`
        : patch.gradient && Object.keys(patch).every((k) => k === 'gradient') ? `Filled {} with a ${patch.gradient.kind === 'radial' ? 'radial ' : ''}gradient`
        : 'Restyled {}'
      return { ok: true, change: { ...base, patch, verb } }
    }
    case 'add_shape':
      return { ok: false, why: 'adding a shape is planned with planShapeAdd' }
    case 'copy_object':
      return { ok: false, why: 'a copy is planned with planCopy' }
    case 'distribute':
      return { ok: false, why: 'distributing is planned for several objects together (planDistribute)' }
    case 'layer':
      if (o.to !== 'front' && o.to !== 'back') return { ok: false, why: 'a layer next to another object is planned with planLayer' }
      return { ok: true, change: { ...base, layer: o.to, verb: o.to === 'front' ? 'Brought {} to the front' : 'Sent {} to the back' } }
    case 'lock':
    case 'unlock':
      return { ok: true, change: { ...base, patch: { locked: o.op === 'lock' }, verb: o.op === 'lock' ? 'Locked {}' : 'Unlocked {}' } }
    case 'hide':
    case 'show':
      return { ok: true, change: { ...base, patch: { hidden: o.op === 'hide' }, verb: o.op === 'hide' ? 'Hid {}' : 'Showed {} again' } }
    case 'rename': {
      const name = o.name.replace(/\s+/g, ' ').trim().slice(0, 80)
      if (!name) return { ok: false, why: 'I was not told the name' }
      return { ok: true, change: { ...base, patch: { label: name }, verb: `Named {} "${name}"` } }
    }
    case 'select':
      return { ok: false, why: 'selecting is not a change (the capability selects)' }
    case 'crop':
      return { ok: false, why: 'a crop is planned with planCrop (it needs the picture\'s own shape)' }
    case 'copy_look':
      return { ok: false, why: 'a copied look is planned with planCopyLook (it needs the other object)' }
    case 'match_size':
    case 'same_size':
      return { ok: false, why: 'a size taken from other objects is planned by the capability (as a resize)' }
    case 'shape_kind': {
      if (el.type !== 'shape') return { ok: false, why: `${desc} is not a shape` }
      if (!isShapeKind(o.to)) return { ok: false, why: `"${o.to}" is not one of the shapes I can draw` }
      const patch: NonNullable<ElementChange['patch']> = { shape: o.to }
      if (o.equalSides && el.width !== el.height) {
        // a PERFECT circle or square: both sides take the shorter one, around the same centre
        const side = Math.min(el.width, el.height)
        Object.assign(patch, { x: Math.round(el.x + (el.width - side) / 2), y: Math.round(el.y + (el.height - side) / 2), width: side, height: side })
      }
      if (el.shape === o.to && !patch.width) return { ok: true, change: { ...base, patch, verb: `Made {} ${shapeWord(o.to)}` } }
      return { ok: true, change: { ...base, patch, verb: `Made {} ${o.equalSides ? `a perfect ${o.to === 'ellipse' ? 'circle' : shapeWord(o.to).replace(/^an? /, '')}` : shapeWord(o.to)}` } }
    }
    case 'rotate': {
      // the editor's own rule and arithmetic (packages/validation rotation.ts): charts and tables never turn, an angle is kept in (-180, 180]
      if (!canRotate(el)) return { ok: false, why: `${desc} cannot be turned: charts and tables stay upright (PowerPoint cannot turn them either)` }
      const deg = normAngle(o.by ? (el.rotation ?? 0) + o.degrees : o.degrees)
      return { ok: true, change: { ...base, patch: { rotation: deg }, verb: deg === 0 ? 'Turned {} straight' : `Turned {} to ${deg}°` } }
    }
    case 'flip': {
      // the editor's own rule (packages/validation rotation.ts canFlip) and its arithmetic (apps/editor rotate.ts flipElements)
      if (!canFlip(el)) return { ok: false, why: el.type === 'text' ? `${desc} cannot be flipped: its words would read backwards (I can turn it instead)` : `${desc} cannot be flipped: only pictures and shapes can (PowerPoint cannot flip a ${el.type} either)` }
      const key = o.axis === 'vertical' ? 'flipV' : 'flipH'
      const r = normAngle(el.rotation ?? 0)
      return { ok: true, change: { ...base, patch: { [key]: !el[key], ...(r ? { rotation: normAngle(-r) } : {}) }, verb: o.axis === 'vertical' ? 'Flipped {} upside down' : 'Flipped {} left to right' } }
    }
    case 'chart_from_table':
      return { ok: false, why: 'a chart from a table is planned with planChartFromTable' }
    case 'table_align': {
      if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
      if (!o.align && !o.valign) return { ok: false, why: 'I was not told how to align the words' }
      // the block named like a merge; nothing named = the whole table, header included
      const found = o.row === undefined && o.column === undefined ? { row: -1, column: 0, rows: el.rows.length + 1, columns: el.header.length } : mergeArea(el, o as never, desc)
      if ('why' in found) return { ok: false, why: found.why }
      // a whole column ("right-align the Price column") takes its header along, as it does in PowerPoint (a merge keeps the header apart; alignment does not)
      const area = o.row === undefined && found.row === 0 ? { ...found, row: -1, rows: found.rows + 1 } : found
      const g = alignCells(el, area, { ...(o.align ? { h: o.align } : {}), ...(o.valign ? { v: o.valign } : {}) })
      const how = [o.align ? (o.align === 'center' ? 'centred' : `aligned ${o.align}`) : null, o.valign ? (o.valign === 'middle' ? 'in the middle' : `at the ${o.valign}`) : null].filter(Boolean).join(' and ')
      const where = o.row === undefined && o.column === undefined ? 'every cell' : `the cells at ${describeArea(area)}`
      return { ok: true, change: { ...base, patch: gridPatch(g), verb: `Put the words of ${where} of {} ${how}` } }
    }
    case 'table_merge': {
      if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
      if (o.action === 'unmerge') {
        const area = o.row === undefined && o.column === undefined ? undefined : mergeArea(el, o, desc)
        if (area && 'why' in area) return { ok: false, why: area.why }
        const r = unmergeCells(el, area)
        if (!r.ok) return { ok: false, why: `${r.why} in ${desc}` }
        return { ok: true, change: { ...base, patch: gridPatch(r.parts), verb: area ? `Unmerged the cells at ${describeArea(area)} of {}` : `Unmerged ${r.count === 1 ? 'the merged cells' : `all ${r.count} merged areas`} of {}` } }
      }
      if (o.row === undefined && o.column === undefined) return { ok: false, why: 'I was not told which cells to merge' }
      const area = mergeArea(el, o, desc)
      if ('why' in area) return { ok: false, why: area.why }
      const r = mergeCells(el, area)
      if (!r.ok) return { ok: false, why: `the cells at ${describeArea(area)} of ${desc} cannot be merged: ${r.why}` }
      // the words of the cells were kept together in the top-left one: said, so nobody is surprised that they now read as one
      const words: string[] = []
      for (let i = area.row; i < area.row + area.rows; i++) for (let j = area.column; j < area.column + area.columns; j++) { const w = (i < 0 ? el.header[j] : el.rows[i]?.[j])?.trim(); if (w && !words.includes(w)) words.push(w) }
      return { ok: true, change: { ...base, patch: gridPatch(r.parts), verb: `Merged the cells at ${describeArea(area)} of {}` }, ...(words.length > 1 ? { note: `their words now read as one: "${words.join(' ').slice(0, 80)}"` } : {}) }
    }
    case 'table_cell': {
      if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
      const c = columnIndex(el.header, o.column) ?? -1
      if (c < 0) return { ok: false, why: `${desc} has no column "${o.column}" (its columns are ${headersText(el.header)})` }
      const text = o.text.trim().slice(0, 200)
      if (o.row === undefined || o.row === 0 || (typeof o.row === 'string' && o.row.trim().toLowerCase() === 'header')) {
        // a header cell inside a merged area is not drawn: the words go to the merged cell the person sees
        const at = mergeAt(el, -1, c)?.column ?? c
        const header = [...el.header]; header[at] = text
        return { ok: true, change: { ...base, patch: { header }, verb: at === c ? `Renamed the "${el.header[c]}" column of {}` : 'Changed the merged header cell of {}' } }
      }
      // a row is named by its first cell ("Basic") or counted from 1: the NAME is what a person says, and code finds it
      const r = typeof o.row === 'number' ? Math.round(o.row) - 1 : (columnIndex(el.rows.map((x) => x[0] ?? ''), o.row) ?? -1)
      if (r < 0 || r >= el.rows.length) return { ok: false, why: typeof o.row === 'string' ? `${desc} has no row "${o.row}" (its rows are ${headersText(el.rows.map((x) => x[0] ?? ''))})` : `${desc} has ${el.rows.length} row${el.rows.length === 1 ? '' : 's'} below the header, not ${Math.round(o.row)}` }
      // a cell inside a merged area is not drawn: the words go to the merged cell the person sees (its top-left cell)
      const m = mergeAt(el, r, c), rr = m?.row ?? r, cc = m?.column ?? c
      const rows = el.rows.map((x) => [...x]); rows[rr]![cc] = text
      return { ok: true, change: { ...base, patch: { rows }, verb: m ? `Changed the merged cell at ${describeArea(m)} in {}` : `Changed the "${el.header[c]}" cell of row ${r + 1} in {}` } }
    }
    case 'chart_value': {
      if (el.type !== 'chart') return { ok: false, why: `${desc} is not a chart` }
      const i = columnIndex(el.labels, o.label) ?? -1
      if (i < 0) return { ok: false, why: `${desc} has no item "${o.label}" (its items are ${headersText(el.labels)})` }
      const si = o.series !== undefined ? (columnIndex(el.series.map((s) => s.name), o.series) ?? -1) : el.series.length === 1 ? 0 : -1
      if (si < 0) return { ok: false, why: o.series !== undefined ? `${desc} has no series "${o.series}" (its series are ${headersText(el.series.map((s) => s.name))})` : `${desc} has several series (${headersText(el.series.map((s) => s.name))}): say which one` }
      if (!Number.isFinite(o.value)) return { ok: false, why: 'that is not a number' }
      const series = el.series.map((s, k) => (k === si ? { name: s.name, values: s.values.map((v, j) => (j === i ? o.value : v)) } : { name: s.name, values: [...s.values] }))
      return { ok: true, change: { ...base, patch: { series }, verb: `Set "${el.labels[i]}" to ${o.value} in {}` } }
    }
    case 'animate':
    case 'animate_clear':
    case 'animate_remove_at':
    case 'animate_start':
    case 'animate_sequence':
    case 'copy_animation':
    case 'animate_order':
    case 'group':
    case 'ungroup':
      return { ok: false, why: 'an animation is planned with the effect catalogue (the assistant\'s effect planner)' }
    case 'chart_type': {
      if (el.type !== 'chart') return { ok: false, why: `${desc} is not a chart` }
      // the shared rule (chart-style.ts): a pie or doughnut shows one series, a scatter needs numbers as its labels (the x values)
      const why = chartTypeProblem(el, o.to)
      if (why) return { ok: false, why: `${desc} cannot be shown that way: ${why}` }
      return { ok: true, change: { ...base, patch: { chartType: o.to, ...(o.to !== 'bar' && el.stack ? { stack: null } : {}) }, verb: `Changed {} to ${o.to === 'area' ? 'an area' : `a ${o.to}`} chart` } }
    }
    case 'chart_style': {
      if (el.type !== 'chart') return { ok: false, why: `${desc} is not a chart` }
      const circular = el.chartType === 'pie' || el.chartType === 'doughnut'
      const patch: NonNullable<ElementChange['patch']> = {}, said: string[] = []
      if (o.legend !== undefined) { patch.legend = o.legend === 'auto' ? null : o.legend; said.push(o.legend === 'none' ? 'hid the legend of {}' : o.legend === 'auto' ? 'let {} place its legend itself' : `put the legend of {} at the ${o.legend}`) }
      // stacked bars (chart-style.ts): a bar chart with two series or more; stacking takes a trend line off, and a trend line is not drawn on stacked bars
      const stackOn = o.stack === 'stacked' || o.stack === 'percent'
      if (o.stack !== undefined) {
        if (stackOn && !canStack(el)) return { ok: false, why: el.chartType !== 'bar' ? `${desc} is a ${el.chartType} chart, and only bar charts stack` : `${desc} has one series, and stacking needs two or more` }
        patch.stack = stackOn ? o.stack as 'stacked' | 'percent' : null
        said.push(o.stack === 'percent' ? 'stacked the bars of {} as shares of 100%' : stackOn ? 'stacked the bars of {}' : 'put the bars of {} side by side')
        if (stackOn && el.trendline && o.trendline === undefined) { patch.trendline = false; said.push('took the trend line off {} (it does not fit stacked bars)') }
      }
      if (o.trendline !== undefined) {
        if (circular && o.trendline) return { ok: false, why: `${desc} is a ${el.chartType} chart, and a trend line only fits a bar or line chart` }
        if (o.trendline && (stackOn || (o.stack === undefined && el.stack && canStack(el)))) return { ok: false, why: `${desc} has stacked bars, and a trend line over them would show figures the bars do not` }
        patch.trendline = o.trendline; said.push(o.trendline ? 'added a trend line to {}' : 'took the trend line off {}')
      }
      if (o.dataLabels !== undefined) { patch.dataLabels = o.dataLabels; said.push(o.dataLabels ? 'showed the figures on {}' : 'hid the figures on {}') }
      if (o.seriesColor) {
        const names = circular ? el.labels : el.series.map((x) => x.name)
        const i = columnIndex(names, o.seriesColor.series) ?? -1
        if (i < 0) return { ok: false, why: `${desc} has no ${circular ? 'slice' : 'series'} "${o.seriesColor.series}" (it has ${headersText(names)})` }
        const c = o.seriesColor.color
        const hex = /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : ((doc.theme.colors as Record<string, string>)[c === 'text' ? 'textPrimary' : c] ?? '').toUpperCase()
        if (!/^#[0-9A-F]{6}$/.test(hex)) return { ok: false, why: `"${c}" is not a colour I can use` }
        const deck = chartLookOn(doc.theme.colors, slide).palette // (the colours the chart shows on this slide)
        const colors = names.map((_, k) => chartColor(el.colors, k, deck).toUpperCase())
        colors[i] = hex
        patch.colors = colors; said.push(`coloured "${names[i]}" in {}`)
      }
      if (!said.length) return { ok: false, why: 'I was not told what to change on the chart' }
      const verb = said.join(' and ')
      return { ok: true, change: { ...base, patch, verb: verb.charAt(0).toUpperCase() + verb.slice(1) } }
    }
    case 'chart_add': {
      if (el.type !== 'chart') return { ok: false, why: `${desc} is not a chart` }
      const name = o.name.trim().slice(0, 60)
      if (!name) return { ok: false, why: 'I was not told its name' }
      if (o.kind === 'series') {
        if (el.chartType === 'pie' || el.chartType === 'doughnut') return { ok: false, why: `${desc} is a ${el.chartType} chart, which shows one series only` }
        if (el.series.length >= 6) return { ok: false, why: `${desc} already has 6 series, the most a chart shows` }
        if (el.series.some((x) => x.name.toLowerCase() === name.toLowerCase())) return { ok: false, why: `${desc} already has a series called "${name}"` }
        if (o.values.length !== el.labels.length) return { ok: false, why: `a new series needs one figure for each of the ${el.labels.length} items (${headersText(el.labels)}); I was given ${o.values.length}` }
        return { ok: true, change: { ...base, patch: { series: [...el.series.map((x) => ({ name: x.name, values: [...x.values] })), { name, values: [...o.values] }] }, verb: `Added the series "${name}" to {}` } }
      }
      if (el.labels.length >= 24) return { ok: false, why: `${desc} already has 24 items, the most a chart shows` }
      if (el.labels.some((x) => x.toLowerCase() === name.toLowerCase())) return { ok: false, why: `${desc} already has an item called "${name}"` }
      if (o.values.length !== el.series.length) return { ok: false, why: `a new item needs one figure for each of the ${el.series.length} series (${headersText(el.series.map((x) => x.name))}); I was given ${o.values.length}` }
      return { ok: true, change: { ...base, patch: { labels: [...el.labels, name], series: el.series.map((x, k) => ({ name: x.name, values: [...x.values, o.values[k]!] })) }, verb: `Added "${name}" to {}` } }
    }
    case 'table_font': {
      if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
      const now = el.fontSize ?? 30
      let size = o.size ?? (o.change === 'smaller' ? now * 0.85 : now * 1.2)
      if (o.change === 'bigger' && size <= now) size = now * 1.2
      if (o.change === 'smaller' && size >= now) size = now * 0.85
      const to = Math.round(clamp(size, 14, 80))
      if (to === now && o.size === undefined) return { ok: false, why: `the text of ${desc} is already as ${o.change === 'smaller' ? 'small' : 'big'} as it can be` }
      return { ok: true, change: { ...base, patch: { fontSize: to }, verb: o.size !== undefined ? `Set the text size of {} to ${to}` : `Made the text of {} ${o.change === 'smaller' ? 'smaller' : 'bigger'}` } }
    }
    case 'add_chart':
      return { ok: false, why: 'a new chart is planned with planNewChart (it needs free room)' }
    case 'chart_order': {
      if (el.type !== 'chart') return { ok: false, why: `${desc} is not a chart` }
      const idx = el.labels.map((_, i) => i)
      const first = el.series[0]!.values
      if (o.order === 'a_to_z') idx.sort((a, b) => el.labels[a]!.localeCompare(el.labels[b]!))
      else idx.sort((a, b) => (o.order === 'high_to_low' ? first[b]! - first[a]! : first[a]! - first[b]!))
      return { ok: true, change: { ...base, patch: { labels: idx.map((i) => el.labels[i]!), series: el.series.map((s) => ({ name: s.name, values: idx.map((i) => s.values[i]!) })) }, verb: `Sorted {} ${o.order === 'a_to_z' ? 'A to Z' : o.order === 'high_to_low' ? 'from high to low' : 'from low to high'}` } }
    }
    case 'table_order': {
      if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
      const c = columnIndex(el.header, o.column) ?? -1
      if (c < 0) return { ok: false, why: `${desc} has no column "${o.column}" (its columns are ${headersText(el.header)})` }
      const num = (t: string) => Number(t.replace(/[^0-9.\-]/g, ''))
      const numeric = el.rows.length > 0 && el.rows.every((r) => /[0-9]/.test(r[c] ?? '') && Number.isFinite(num(r[c] ?? '')))
      const cmp = (a: string[], b: string[]) => (numeric ? num(a[c] ?? '') - num(b[c] ?? '') : (a[c] ?? '').localeCompare(b[c] ?? '')) * (o.order === 'asc' ? 1 : -1)
      const order = el.rows.map((_, i) => i).sort((a, b) => cmp(el.rows[a]!, el.rows[b]!) || a - b)
      // through the shared rule: highlights and merged cells move with their rows (a merge over several rows cannot be sorted through: refused with the reason)
      const sorted = reorderRows(el, order)
      if (!sorted.ok) return { ok: false, why: `${desc} cannot be sorted: ${sorted.why}` }
      return { ok: true, change: { ...base, patch: gridPatch(sorted.parts), verb: `Sorted {} by "${el.header[c]}" ${o.order === 'asc' ? 'from low to high' : 'from high to low'}` } }
    }
    case 'table_highlight': {
      if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
      const c = columnIndex(el.header, o.column) ?? -1
      if (c < 0) return { ok: false, why: `${desc} has no column "${o.column}" (its columns are ${headersText(el.header)})` }
      const others = (el.highlights ?? []).filter((h) => h.column !== c)
      if (o.which === 'clear') return { ok: true, change: { ...base, patch: { highlights: others }, verb: `Took the highlight off the "${el.header[c]}" column of {}` } }
      const nums = el.rows.map((r) => cellNumber(r[c] ?? ''))
      if (!nums.length || nums.every((n) => n === null)) return { ok: false, why: `the "${el.header[c]}" column of ${desc} has no numbers to compare` }
      const target = o.which === 'max' ? Math.max(...(nums.filter((n) => n !== null) as number[])) : Math.min(...(nums.filter((n) => n !== null) as number[]))
      const hex = (w: string | undefined) => { const k = w ?? 'accent'; return /^#[0-9a-f]{6}$/i.test(k) ? k.toLowerCase() : ((doc.theme.colors as Record<string, string>)[k] ?? doc.theme.colors.accent).toLowerCase() }
      const fill = hex(o.color)
      const rows = nums.flatMap((n, ri) => (n === target ? [ri] : []))
      return { ok: true, change: { ...base, patch: { highlights: [...others, ...rows.map((row) => ({ row, column: c, fill }))] }, verb: `Highlighted the ${o.which === 'max' ? 'highest' : 'lowest'} figure in the "${el.header[c]}" column of {}` } }
    }
    case 'table_format': {
      if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
      const c = columnIndex(el.header, o.column) ?? -1
      if (c < 0) return { ok: false, why: `${desc} has no column "${o.column}" (its columns are ${headersText(el.header)})` }
      const decimals = o.decimals === undefined ? undefined : clamp(Math.round(o.decimals), 0, 4)
      let numeric = 0, left = 0
      const rows = el.rows.map((r) => {
        const text = r[c] ?? ''
        const out = formatCell(text, o.format, decimals)
        if (out === null) { if (text.trim()) left++; return [...r] }
        // the figure itself never changes: the number before and after must be the same
        if (cellNumber(out) !== cellNumber(text) && decimals === undefined) return [...r]
        numeric++
        const next = [...r]; next[c] = out
        return next
      })
      if (!numeric) return { ok: false, why: `the "${el.header[c]}" column of ${desc} has no numbers to format` }
      const what = { thousands: 'thousands separators', percent: 'a percent sign', usd: 'dollar signs', inr: 'rupee signs', eur: 'euro signs', gbp: 'pound signs' }[o.format]
      return { ok: true, change: { ...base, patch: { rows }, verb: `Put ${what}${decimals !== undefined ? ` and ${decimals} decimals` : ''} on the "${el.header[c]}" column of {}${left ? ` (${left} cell${left === 1 ? ' is' : 's are'} not numbers, so I left ${left === 1 ? 'it' : 'them'})` : ''}` } }
    }
    case 'table_rows': {
      if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
      // through the shared rule (table-merge.ts): merged cells and highlights follow their rows
      const n = Math.max(1, Math.min(5, Math.round(o.count ?? 1)))
      if (o.action === 'add') {
        if (el.rows.length + n > 20) return { ok: false, why: `${desc} can have at most 20 rows` }
        let g: TableEl = el
        for (let i = 0; i < n; i++) g = { ...g, ...insertRow(g, o.at === 'start' ? 0 : g.rows.length) }
        return { ok: true, change: { ...base, patch: { ...gridPatch(g as GridParts), height: Math.round(el.height + 86 * n) }, verb: `Added ${n === 1 ? 'an empty row' : `${n} empty rows`} to {}` } }
      }
      const at = o.row !== undefined ? Math.round(o.row) - 1 : o.at === 'start' ? 0 : el.rows.length - 1
      if (at < 0 || at >= el.rows.length) return { ok: false, why: `${desc} has ${el.rows.length} row${el.rows.length === 1 ? '' : 's'} below the header, not ${at + 1}` }
      if (el.rows.length <= 1) return { ok: false, why: `${desc} needs at least one row` }
      return { ok: true, change: { ...base, patch: { ...gridPatch(removeRow(el, at)), height: Math.max(120, Math.round(el.height - 86)) }, verb: `Removed row ${at + 1} of {}` } }
    }
    case 'table_columns': {
      if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
      // through the shared rule (table-merge.ts): merged cells and highlights follow their columns
      if (o.action === 'add') {
        if (el.header.length >= 8) return { ok: false, why: `${desc} can have at most 8 columns` }
        return { ok: true, change: { ...base, patch: gridPatch(insertColumn(el, o.at === 'start' ? 0 : el.header.length, `Column ${el.header.length + 1}`)), verb: 'Added an empty column to {}' } }
      }
      const i = o.column !== undefined ? columnIndex(el.header, o.column) ?? -1 : o.at === 'start' ? 0 : el.header.length - 1
      if (i < 0) return { ok: false, why: `${desc} has no column "${o.column}" (its columns are ${headersText(el.header)})` }
      if (el.header.length <= 1) return { ok: false, why: `${desc} needs at least one column` }
      return { ok: true, change: { ...base, patch: gridPatch(removeColumn(el, i)), verb: `Removed column ${i + 1} of {}` } }
    }
    case 'table_style': {
      if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
      const patch: NonNullable<ElementChange['patch']> = {}
      for (const k of ['headerFill', 'headerColor', 'rowFill', 'altRowFill', 'textColor', 'borderColor'] as const) if (o[k] !== undefined) patch[k] = o[k]!
      if (!Object.keys(patch).length) return { ok: false, why: 'I was not told which colours' }
      return { ok: true, change: { ...base, patch, verb: 'Restyled {}' } }
    }
    case 'align': {
      // "centre the title" / "align the text left": the text inside its box (as the toolbar's align buttons do); the box stays in its column
      if (textAlign) return { ok: true, change: { ...base, patch: { align: o.to as 'left' | 'center' | 'right' }, verb: o.to === 'center' ? 'Centred the text of {}' : `Aligned the text of {} ${o.to}` } }
      const to: Edge = ({ left: 'left', center: 'center_h', right: 'right', top: 'top', middle: 'center_v', bottom: 'bottom' } as const)[o.to]
      const moved = planElementChange(doc, slide, el, { op: 'move', to, overlap: o.overlap }, templateText)
      if (moved.ok) moved.change.verb = `Aligned {} ${ALIGN_PHRASE[o.to]}`
      return moved
    }
  }
}

/** The facts of an element's text that an expectation checks. */
/** bold / italic as DRAWN (the one rule the slide and the export use: a title is bold by its role) */
export const isBold = (e: SlideElement) => e.type === 'text' && e.paragraphs.every((p) => p.runs.every((r) => isRunBold(r, e)))
export const isItalic = (e: SlideElement) => e.type === 'text' && e.paragraphs.every((p) => p.runs.every((r) => isRunItalic(r, e)))
export const isUnderlined = (e: SlideElement) => e.type === 'text' && e.paragraphs.every((p) => p.runs.every((r) => r.underline === true))


const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round2 = (v: number) => Math.round(v * 100) / 100
/** Words to numbers for a picture's zoom, position, light and shadow (the model only picks words; the numbers are decided here). Fills `patch`, and says in words what was asked. */
function pictureLook(doc: Presentation, el: SlideElement, o: Extract<ElementOp, { op: 'picture_style' }>, patch: NonNullable<ElementChange['patch']>): { ok: true; said: string[] } | { ok: false; why: string } {
  if (el.type !== 'image') return { ok: true, said: [] }
  const said: string[] = []
  const zoom = el.zoom ?? 1, focus = el.focus ?? { x: 0.5, y: 0.5 }, f = el.filter ?? { brightness: 1, contrast: 1, grayscale: 0 }
  if (o.resetLook) {
    patch.zoom = 1; patch.focus = { x: 0.5, y: 0.5 }; patch.filter = { brightness: 1, contrast: 1, grayscale: 0, saturation: 1, warmth: 0 }; patch.shadow = 'none'
    return { ok: true, said: ['back to how it was (no zoom, no light changes, no shadow)'] }
  }
  if (o.zoom !== undefined) {
    const to = o.zoom === 'in' ? zoom * 1.4 : o.zoom === 'out' ? zoom / 1.4 : o.zoom === 'reset' ? 1 : o.zoom
    patch.zoom = round2(clampN(to, 1, 5))
    said.push(patch.zoom === 1 ? 'not zoomed in' : `zoomed in ${patch.zoom}x`)
  }
  if (o.view !== undefined) {
    const to = { left: { x: 0.1, y: focus.y }, right: { x: 0.9, y: focus.y }, up: { x: focus.x, y: 0.1 }, down: { x: focus.x, y: 0.9 }, center: { x: 0.5, y: 0.5 } }[o.view]
    patch.focus = to
    said.push(o.view === 'center' ? 'showing the middle of the picture' : `showing the ${o.view === 'up' ? 'top' : o.view === 'down' ? 'bottom' : o.view} part`)
    if ((patch.zoom ?? zoom) <= 1 && el.fit === 'cover') said.push('(zoom in to see the difference: a picture that is not zoomed fills its frame)')
  }
  if (o.brightness !== undefined || o.contrast !== undefined || o.blackAndWhite !== undefined || o.saturation !== undefined || o.warmth !== undefined || o.blur !== undefined) {
    const nf = { ...f }
    if (o.brightness) { nf.brightness = round2(clampN(f.brightness + (o.brightness === 'brighter' ? 0.2 : -0.2), 0.2, 2)); said.push(o.brightness === 'brighter' ? 'brighter' : 'darker') }
    if (o.contrast) { nf.contrast = round2(clampN(f.contrast + (o.contrast === 'more' ? 0.2 : -0.2), 0.2, 2)); said.push(o.contrast === 'more' ? 'with more contrast' : 'with less contrast') }
    if (o.blackAndWhite !== undefined) { nf.grayscale = o.blackAndWhite ? 1 : 0; said.push(o.blackAndWhite ? 'in black and white' : 'back in colour') }
    // the same fields and ranges as the editor's Colour and Cool / warm sliders (packages/validation picture.ts draws and bakes them)
    if (o.saturation) { const now = f.saturation ?? 1; nf.saturation = o.saturation === 'normal' ? 1 : round2(clampN(now + (o.saturation === 'more' ? 0.3 : -0.3), 0, 2)); said.push(o.saturation === 'normal' ? 'back to its normal colour' : o.saturation === 'more' ? 'more colourful' : 'more muted') }
    if (o.blur) { nf.blur = o.blur === 'none' ? 0 : o.blur === 'soft' ? 3 : 8; said.push(o.blur === 'none' ? 'sharp again (no blur)' : o.blur === 'soft' ? 'softly blurred' : 'strongly blurred') }
    if (o.warmth) { const now = f.warmth ?? 0; nf.warmth = o.warmth === 'normal' ? 0 : round2(clampN(now + (o.warmth === 'warmer' ? 0.35 : -0.35), -1, 1)); said.push(o.warmth === 'normal' ? 'neutral (not warmer or cooler)' : o.warmth) }
    patch.filter = nf
  }
  if (o.shadow !== undefined) { patch.shadow = o.shadow; said.push(o.shadow === 'none' ? 'without a shadow' : `with a ${o.shadow} shadow`) }
  if (o.border !== undefined) {
    if (o.border === 'none') { patch.border = null; said.push('without a border') }
    else { const c = o.border === 'text' ? 'textPrimary' : o.border; patch.border = { color: c, width: Math.round(clampN(o.borderWidth ?? 6, 1, 40)) }; said.push(`with a ${colourWord(doc, c)} border`) }
  }
  if (o.overlay !== undefined) {
    // the colour wash a design lays over a photo (so its text reads): lighter, darker or off; how much is decided here
    const ov = el.overlay
    if (o.overlay === 'darker') { const base = ov ?? { from: '#000000', to: '#000000', angle: 180, opacity: 0 }; patch.overlay = { ...base, opacity: round2(clampN((ov?.opacity ?? 0) + 0.2, 0.2, 0.9)) }; said.push('with a darker colour wash over it') }
    else if (!ov) return { ok: false, why: 'the picture has no colour wash over it' }
    else if (o.overlay === 'none') { patch.overlay = null; said.push('without the colour wash over it') }
    else { patch.overlay = { ...ov, opacity: round2(clampN(ov.opacity - 0.25, 0.1, 1)) }; said.push(patch.overlay.opacity >= ov.opacity ? 'with its colour wash as light as it goes' : 'with a lighter colour wash over it') }
  }
  return { ok: true, said }
}

/** Whether the element already is as the change asks (nothing to do). */
export function alreadyAsked(el: SlideElement, c: ElementChange): boolean {
  if (c.group) return false // (judged on the slide, by groupAlready)
  if (c.remove || c.add || c.addChart || c.copy || c.effect || c.layer) return false
  const p = c.patch ?? {}
  const geo = (['x', 'y', 'width', 'height'] as const).every((k) => p[k] === undefined || Math.abs((el as unknown as Record<string, number>)[k]! - p[k]!) <= 1)
  const text = el.type === 'text'
    ? (p.fontSize === undefined || el.fontSize === p.fontSize) && (p.align === undefined || el.align === p.align) && (p.color === undefined || (el.color.toLowerCase() === p.color.toLowerCase() && el.paragraphs.every((q) => q.runs.every((r) => r.color === undefined || r.color.toLowerCase() === p.color!.toLowerCase())))) && (p.uppercase === undefined || !!el.uppercase === p.uppercase) && (c.bold === undefined || isBold(el) === c.bold) && (c.italic === undefined || isItalic(el) === c.italic) && (c.underline === undefined || isUnderlined(el) === c.underline)
      && (p.valign === undefined || (el.valign ?? 'top') === p.valign) && (p.lineHeight === undefined || Math.abs((el.lineHeight ?? 1.3) - p.lineHeight) < 0.01) && (p.paraGap === undefined || Math.abs((el.paraGap ?? 0.5) - p.paraGap) < 0.01) && (p.letterSpacing === undefined || Math.abs((el.letterSpacing ?? 0) - p.letterSpacing) < 0.01) && (p.weight === undefined || el.weight === p.weight) && (p.paragraphs === undefined || JSON.stringify(el.paragraphs) === JSON.stringify(p.paragraphs))
    : (p.fontSize === undefined || (el.type === 'table' && (el.fontSize ?? 30) === p.fontSize)) && p.align === undefined && p.color === undefined && p.uppercase === undefined && c.bold === undefined && c.italic === undefined && c.underline === undefined && p.valign === undefined && p.lineHeight === undefined && p.paraGap === undefined && p.letterSpacing === undefined && p.weight === undefined && p.paragraphs === undefined
  const same = (a: unknown, b: unknown) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase()
  const sh = el.type === 'shape' ? el : null
  const look = (p.fill === undefined || (!!sh && same(sh.fill, p.fill))) && (p.gradient === undefined || (!!sh && !!sh.gradient && same(sh.gradient.from, p.gradient.from) && same(sh.gradient.to, p.gradient.to) && sh.gradient.angle === p.gradient.angle)) && (p.stroke === undefined || (!!sh && same(sh.stroke, p.stroke))) && (p.strokeWidth === undefined || (!!sh && (sh.strokeWidth ?? 0) === p.strokeWidth)) && (p.radius === undefined || (!!sh && sh.radius === p.radius) || (el.type === 'image' && (el.radius ?? -1) === p.radius)) && (p.clip === undefined || (el.type === 'image' && el.clip === p.clip)) && (p.fit === undefined || (el.type === 'image' && el.fit === p.fit)) && (p.opacity === undefined || Math.abs(el.opacity - p.opacity) < 0.01) && pictureLookAlready(el, p)
  const chartLook = el.type === 'chart' ? ('legend' in p ? (p.legend ?? undefined) === el.legend : true) && (p.trendline === undefined || !!el.trendline === p.trendline) && (p.dataLabels === undefined || chartShowsFigures(el) === p.dataLabels) && ('stack' in p ? (p.stack ?? undefined) === el.stack : true) && (p.colors === undefined || JSON.stringify((el.colors ?? []).map((c) => c.toUpperCase())) === JSON.stringify(p.colors)) : !('legend' in p) && !('stack' in p) && p.trendline === undefined && p.dataLabels === undefined && p.colors === undefined
  const data = chartLook && (el.type === 'chart' ? (p.chartType === undefined || el.chartType === p.chartType) && (p.labels === undefined || JSON.stringify(el.labels) === JSON.stringify(p.labels)) && (p.series === undefined || JSON.stringify(el.series) === JSON.stringify(p.series)) : p.chartType === undefined && p.labels === undefined && p.series === undefined)
    && (el.type === 'table' ? (p.header === undefined || JSON.stringify(el.header) === JSON.stringify(p.header)) && (p.rows === undefined || JSON.stringify(el.rows) === JSON.stringify(p.rows)) && (['headerFill', 'headerColor', 'rowFill', 'altRowFill', 'textColor', 'borderColor'] as const).every((k) => p[k] === undefined || same(el[k], p[k])) && (p.highlights === undefined || JSON.stringify(el.highlights ?? []) === JSON.stringify(p.highlights)) && (p.merges === undefined || JSON.stringify(validMerges(el)) === JSON.stringify(p.merges ?? [])) && (p.aligns === undefined || JSON.stringify(el.aligns ?? []) === JSON.stringify(p.aligns ?? [])) : p.header === undefined && p.rows === undefined && p.highlights === undefined && p.merges === undefined && p.aligns === undefined && p.headerFill === undefined && p.headerColor === undefined && p.rowFill === undefined && p.altRowFill === undefined && p.textColor === undefined && p.borderColor === undefined)
  const cropped = !c.crop || (c.crop.rect === null ? !(el.type === 'image' && el.crop) : el.type === 'image' && !!el.crop && (['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(el.crop![k] - c.crop!.rect![k]) < 0.005))
  const shaped = (p.shape === undefined || (el.type === 'shape' && el.shape === p.shape)) && (p.rotation === undefined || Math.abs((el.rotation ?? 0) - p.rotation) < 0.5)
  const effects = (p.textShadow === undefined || (el.type === 'text' && (el.textShadow ?? null) === p.textShadow)) && (p.textOutline === undefined || (el.type === 'text' && JSON.stringify(el.textOutline ?? null) === JSON.stringify(p.textOutline)))
  const flipped = effects && (p.flipH === undefined || !!el.flipH === p.flipH) && (p.flipV === undefined || !!el.flipV === p.flipV) && (p.strokeDash === undefined || (el.type === 'shape' && (el.strokeDash ?? null) === p.strokeDash))
  const meta = cropped && shaped && flipped && (p.locked === undefined || !!el.locked === p.locked) && (p.hidden === undefined || !!el.hidden === p.hidden) && (p.label === undefined || (el.label ?? '') === p.label)
  return geo && text && look && data && meta
}

/** a picture's zoom, position, light and shadow are as the plan says (a missing value means the default) */
function pictureLookAlready(el: SlideElement, p: NonNullable<ElementChange['patch']>): boolean {
  if (p.zoom === undefined && p.focus === undefined && p.filter === undefined && p.shadow === undefined && p.overlay === undefined && !('overlay' in p) && p.border === undefined) return true
  // a shape has a shadow too (and nothing else of a picture's look)
  if (el.type === 'shape') return p.zoom === undefined && p.focus === undefined && p.filter === undefined && !('overlay' in p) && (p.shadow === undefined || (el.shadow ?? 'none') === p.shadow)
  if (el.type !== 'image') return false
  if ('overlay' in p && !(p.overlay === null ? !el.overlay : !!el.overlay && Math.abs(el.overlay.opacity - p.overlay!.opacity) < 0.01)) return false
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01
  const f = el.filter ?? { brightness: 1, contrast: 1, grayscale: 0 }, fo = el.focus ?? { x: 0.5, y: 0.5 }
  return (p.zoom === undefined || near(el.zoom ?? 1, p.zoom)) && (p.focus === undefined || (near(fo.x, p.focus.x) && near(fo.y, p.focus.y))) && (p.filter === undefined || (near(f.brightness, p.filter.brightness) && near(f.contrast, p.filter.contrast) && near(f.grayscale, p.filter.grayscale) && near(f.saturation ?? 1, p.filter.saturation ?? 1) && near(f.warmth ?? 0, p.filter.warmth ?? 0) && near(f.blur ?? 0, p.filter.blur ?? 0))) && (p.border === undefined || JSON.stringify(el.border ?? null) === JSON.stringify(p.border)) && (p.shadow === undefined || (el.shadow ?? 'none') === p.shadow)
}

type Box = { x: number; y: number; width: number; height: number }
const intersects = (a: Box, b: Box) => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 4 && h > 4 && (w * h) > 0.05 * Math.min(a.width * a.height, b.width * b.height) // (a touching edge or a sliver is not an overlap)
}

/**
 * The other objects of the slide that the changed element would cover (or be covered by) AFTER the change but did not before. Backdrops (anything covering most of the slide) and objects
 * that already overlapped it are left out: only what this change causes is reported, so the message can say so instead of letting the person find it.
 */
export function newOverlaps(doc: Presentation, slide: Slide, el: SlideElement, patch: Partial<Box>): SlideElement[] {
  const after: Box = { x: patch.x ?? el.x, y: patch.y ?? el.y, width: patch.width ?? el.width, height: patch.height ?? el.height }
  return slide.elements.filter((o) => o.id !== el.id && takesRoom(doc, o) && intersects(after, o) && !intersects(el, o))
}

const coveredArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
/** a new object is clear of another when it does not touch it at all, with a small gap (placement is stricter than the overlap NOTE, which ignores slivers) */
const GAP = 16
const clearOf = (a: Box, b: Box) => coveredArea({ x: a.x - GAP, y: a.y - GAP, width: a.width + 2 * GAP, height: a.height + 2 * GAP }, b) === 0

/** An object that takes room on its slide: not a backdrop (anything covering most of the slide), not a decorative ornament, not hidden. The one rule for "is that spot free?". */
export function takesRoom(doc: Pick<Presentation, 'aspectRatio'>, o: SlideElement): boolean {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  return o.width * o.height < 0.6 * W * H && !o.decorative && !o.hidden
}

/**
 * Where a NEW object of `w`×`h` goes: the free place nearest the middle of the slide that covers nothing that takes room and keeps a margin from the edges (4% of the width).
 * Returns null when no such place exists (the caller then uses the middle, and the object is left selected for the person to move). One rule for every insert: the toolbar's
 * Text, Shapes, Table and Chart, and new objects from the assistant.
 */
export function freeSpot(doc: Pick<Presentation, 'aspectRatio'>, slide: Pick<Slide, 'elements'>, w: number, h: number): Box | null {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const m = Math.round(W * 0.04), step = Math.round(W / 64)
  if (w > W - 2 * m || h > H - 2 * m) return null
  const others = slide.elements.filter((o) => takesRoom(doc, o))
  const cx = (W - w) / 2, cy = (H - h) / 2
  let best: Box | null = null, bestD = Infinity
  for (let y = m; y <= H - m - h; y += step) {
    for (let x = m; x <= W - m - w; x += step) {
      const d = (x - cx) ** 2 + (y - cy) ** 2
      if (d >= bestD) continue
      const box = { x, y, width: w, height: h }
      if (others.some((o) => !clearOf(box, o))) continue
      best = box; bestD = d
    }
  }
  // the exact middle is checked too (the grid may step over it)
  const mid = { x: Math.round(cx), y: Math.round(cy), width: w, height: h }
  if (!others.some((o) => !clearOf(mid, o))) return mid
  return best
}

/**
 * `freeSpot`, and when the slide has no free room (a full layout), the place inside the margins that covers the LEAST of what is there (nearest the middle on a tie), so a new
 * object never lands on the middle of a photo or a title just because the middle is the default.
 */
export function bestSpot(doc: Pick<Presentation, 'aspectRatio'>, slide: Pick<Slide, 'elements'>, w: number, h: number): Box {
  const free = freeSpot(doc, slide, w, h)
  if (free) return free
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const m = Math.round(W * 0.04), step = Math.round(W / 64)
  const others = slide.elements.filter((o) => takesRoom(doc, o))
  const x0 = Math.max(0, Math.min(m, W - w)), y0 = Math.max(0, Math.min(m, H - h)), x1 = Math.max(x0, W - m - w), y1 = Math.max(y0, H - m - h)
  const cx = (W - w) / 2, cy = (H - h) / 2
  let best: Box = { x: Math.round(Math.max(0, cx)), y: Math.round(Math.max(0, cy)), width: w, height: h }, bestA = Infinity, bestD = Infinity
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const box = { x, y, width: w, height: h }
      const a = others.reduce((n, o) => n + coveredArea(box, o), 0), d = (x - cx) ** 2 + (y - cy) ** 2
      if (a < bestA - 1 || (Math.abs(a - bestA) <= 1 && d < bestD)) { best = box; bestA = a; bestD = d }
    }
  }
  return best
}


/** every shape the assistant may draw: the basic kinds and the editor's own shape library (one list, the editor's) */
export const BASIC_SHAPES = ['rect', 'ellipse', 'line', 'triangle', 'ring', 'chevron'] as const
export const isShapeKind = (k: string) => (BASIC_SHAPES as readonly string[]).includes(k) || !!shapeDef(k)
/** "a rectangle", "a heart": the basic words, else the library's own label */
export const shapeWord = (k: string): string => SHAPE_WORD[k] ?? (shapeDef(k) ? `${/^[aeiou]/i.test(shapeDef(k)!.label) ? 'an' : 'a'} ${shapeDef(k)!.label.toLowerCase()}` : 'a shape')
const SHAPE_WORD: Record<string, string> = { rect: 'a rectangle', ellipse: 'a circle', line: 'a line', triangle: 'a triangle', ring: 'a ring', chevron: 'a chevron', arrowRight: 'an arrow pointing right', arrowLeft: 'an arrow pointing left', arrowUp: 'an arrow pointing up', arrowDown: 'an arrow pointing down', arrowBoth: 'a double arrow' }
const SHAPE_SIZE = { small: 0.12, medium: 0.2, large: 0.34 } as const
/** how far a shape placed "behind" an object reaches past it */
const AROUND_PAD = 24

/**
 * Plans ONE new shape for a slide, with every value worked out here: its size (from a named size and the slide, never a number from a model), its place (an edge or the centre of the slide, or
 * around an existing object and BEHIND it), its colours (a theme colour word or a hex). `newId` is the id the editor will give it; the check later looks for exactly that id.
 */
export function planShapeAdd(doc: Presentation, slide: Slide, o: Extract<ElementOp, { op: 'add_shape' }>, newId: string, around?: SlideElement): Planned {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (slide.layoutId === 'morph' || slide.layoutId === 'morph-template') return { ok: false, why: 'it is part of the template animation: I can change its words and text style, not add to it' }
  const line = o.shape === 'line'
  let x: number, y: number, w: number, h: number, zIndex: number | undefined
  if (around) {
    x = around.x - AROUND_PAD; y = around.y - AROUND_PAD; w = around.width + 2 * AROUND_PAD; h = around.height + 2 * AROUND_PAD
    if (line) { y = around.y + around.height + 8; h = 6; x = around.x; w = around.width }
    zIndex = around.zIndex - 1
  } else {
    const unit = Math.round(W * SHAPE_SIZE[o.size ?? 'medium'])
    const square = o.shape === 'ellipse' || o.shape === 'ring' || o.shape === 'triangle' || o.shape === 'arrowUp' || o.shape === 'arrowDown' || !!shapeDef(o.shape)?.square
    w = line ? Math.round(W * 0.3) : square ? unit : Math.round(unit * 1.6); h = line ? 8 : unit
    const m = edgeMargin(doc), to = o.at ?? 'center'
    x = to === 'left' ? m : to === 'right' ? W - m - w : (W - w) / 2
    y = to === 'top' ? m : to === 'bottom' ? H - m - h : (H - h) / 2
  }
  x = Math.round(clamp(x, 0, Math.max(0, W - w))); y = Math.round(clamp(y, 0, Math.max(0, H - h))); w = Math.round(Math.min(w, W)); h = Math.round(Math.min(h, H))
  const add: NonNullable<ElementChange['add']> = { shape: o.shape, x, y, width: w, height: h, fill: line ? (o.fill ?? 'none') : (o.fill ?? 'primary'), ...(line ? { stroke: o.stroke ?? o.fill ?? 'primary', strokeWidth: o.strokeWidth ?? 6 } : o.stroke ? { stroke: o.stroke, strokeWidth: o.strokeWidth ?? 4 } : {}), ...(o.radius !== undefined ? { radius: Math.max(0, Math.round(o.radius)) } : {}), ...(o.opacity !== undefined ? { opacity: clamp(o.opacity, 0, 1) } : {}), ...(zIndex !== undefined ? { zIndex } : {}) }
  return { ok: true, change: { slideId: slide.id, elementId: newId, add, verb: 'Added {}', desc: shapeWord(o.shape) } }
}

/**
 * N equal shapes in a row ("three equal cards"): one size from the slide and the size named, equal gaps, the whole row placed in FREE room (never over what is there). No free room for the row:
 * refused with the reason. Each shape is its own change with its own id (`newId` per shape).
 */
export function planShapeRow(doc: Presentation, slide: Slide, o: Extract<ElementOp, { op: 'add_shape' }>, newId: () => string): { ok: true; changes: ElementChange[] } | { ok: false; why: string } {
  const { width: W } = CANVAS[doc.aspectRatio]
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (slide.layoutId === 'morph' || slide.layoutId === 'morph-template') return { ok: false, why: 'it is part of the template animation: I can change its words and text style, not add to it' }
  if (!isShapeKind(o.shape) || o.shape === 'line') return { ok: false, why: 'a row of lines is not something I can lay out' }
  const n = Math.max(2, Math.min(6, Math.round(o.count ?? 2)))
  const gap = Math.round(W * 0.02), m = Math.round(W * 0.04)
  const unit = Math.round(W * SHAPE_SIZE[o.size ?? 'medium'])
  const square = o.shape === 'ellipse' || o.shape === 'ring' || !!shapeDef(o.shape)?.square
  let w = square ? unit : Math.round(unit * 1.4), h = unit
  // a row wider than the slide gets narrower shapes (equal still)
  const most = W - 2 * m
  if (n * w + (n - 1) * gap > most) { const k = (most - (n - 1) * gap) / (n * w); w = Math.floor(w * k); if (square) h = w }
  const total = n * w + (n - 1) * gap
  const spot = freeSpot(doc, slide, total, h)
  if (!spot) return { ok: false, why: `there is no free room on the slide for ${n} shapes in a row (make room first, or ask for small ones)` }
  const fill = o.fill ?? 'primary'
  const changes = Array.from({ length: n }, (_, i): ElementChange => ({ slideId: slide.id, elementId: newId(), desc: shapeWord(o.shape), verb: 'Added {}', add: { shape: o.shape, x: spot.x + i * (w + gap), y: spot.y, width: w, height: h, fill, ...(o.stroke ? { stroke: o.stroke, strokeWidth: o.strokeWidth ?? 4 } : {}), ...(o.radius !== undefined ? { radius: Math.max(0, Math.round(o.radius)) } : {}), ...(o.opacity !== undefined ? { opacity: clamp(o.opacity, 0, 1) } : {}) } }))
  return { ok: true, changes }
}


/** Whether the object already has what an animation change asks: the effect with each option named, or (for a clear) no animation at all. */
export function effectAlready(slide: Slide | undefined, c: ElementChange): boolean {
  const fx = c.effect
  if (!fx) return false
  const mine = (slide?.effects ?? []).filter((x) => x.elementId === c.elementId)
  const all = slide?.effects ?? []
  if ('clear' in fx) return fx.effectId ? !all.some((x) => x.id === fx.effectId) : fx.kind ? !mine.some((x) => (EFFECTS[fx.kind!] as readonly string[]).includes(x.type)) : mine.length === 0
  if ('moveTo' in fx) return all[fx.moveTo]?.elementId === c.elementId
  if ('setStart' in fx) return mine.length > 0 && mine.every((x) => x.start === fx.setStart)
  // the objects' animations come in this order (first appearance of each object)
  if ('sequence' in fx) { const firsts = fx.sequence.map((id) => all.findIndex((x) => x.elementId === id)).filter((i) => i >= 0); return firsts.every((v, i) => i === 0 || v > firsts[i - 1]!) && firsts.length === fx.sequence.length }
  if ('paint' in fx) return mine.map((x) => x.type).join('|') === fx.paint.map((p) => p.type).join('|') && fx.paint.every((p, i) => p.start === undefined || mine[i]?.start === p.start)
  return mine.some((x) => x.type === fx.type && (fx.start === undefined || x.start === fx.start) && (fx.duration === undefined || x.duration === fx.duration) && (fx.delay === undefined || x.delay === fx.delay) && (fx.repeat === undefined || x.repeat === fx.repeat) && (fx.loop === undefined || !!x.loop === fx.loop) && (fx.distance === undefined || x.distance === fx.distance) && (fx.direction === undefined || x.direction === fx.direction) && (fx.textBy === undefined || x.textBy === fx.textBy) && (fx.easing === undefined || x.easing === fx.easing) && (fx.trigger === undefined || x.trigger === fx.trigger))
}


const num = (t: string): number | null => {
  const m = t.replace(/(\d),(\d{3})/g, '$1$2').match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : null
}
/** A table column read as numbers ("$1,150", "12%", "3.5"): all rows must have one, or it is not a data column. */
export function numericColumn(rows: string[][], c: number): { values: number[]; unit: string } | null {
  if (!rows.length) return null
  const values = rows.map((r) => num(r[c] ?? ''))
  if (values.some((v) => v === null)) return null
  const marks = new Set(rows.map((r) => ((r[c] ?? '').match(/[%$€£₹]/) ?? [''])[0]))
  return { values: values as number[], unit: marks.size === 1 ? [...marks][0]! : '' }
}

/**
 * A chart built from a table's OWN numbers: the first column gives the labels, every other column whose cells are all numbers gives a series (the figures are read from the cells, never written by anyone).
 * It is placed in free room beside or below the table; with no room it is refused with the reason.
 */
export function planChartFromTable(doc: Presentation, slide: Slide, el: SlideElement, o: Extract<ElementOp, { op: 'chart_from_table' }>, newId: string): Planned {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const desc = describeElement(el)
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (slide.layoutId === 'morph' || slide.layoutId === 'morph-template') return { ok: false, why: 'it is part of the template animation: I can change its words and text style, not add to it' }
  if (el.locked) return { ok: false, why: `${desc} is locked` }
  if (el.type !== 'table') return { ok: false, why: `${desc} is not a table` }
  const cols = el.header.map((h, c) => ({ h, c })).filter(({ c }) => c > 0).map(({ h, c }) => ({ h, n: numericColumn(el.rows, c) })).filter((x): x is { h: string; n: { values: number[]; unit: string } } => !!x.n)
  if (!cols.length) return { ok: false, why: `${desc} has no column of numbers to chart (the first column is the labels, the others must be numbers in every row)` }
  const kind = o.chartType ?? 'bar'
  const use = kind === 'pie' || kind === 'doughnut' ? cols.slice(0, 1) : cols.slice(0, 6)
  // the shared rule (chart-style.ts): a scatter needs the table's first column (the labels) to be numbers, its x values
  const typeWhy = chartTypeProblem({ labels: el.rows.map((r) => r[0] ?? ''), series: use }, kind)
  if (typeWhy) return { ok: false, why: `${desc} cannot become that chart: ${typeWhy}` }
  if (el.rows.length > 24) return { ok: false, why: `${desc} has more than 24 rows, which is more than a chart can show` }
  const unit = use.every((x) => x.n.unit === use[0]!.n.unit) ? use[0]!.n.unit : ''
  const w = Math.min(900, Math.round(W * 0.45)), h = Math.min(520, Math.round(H * 0.5))
  const others = slide.elements.filter((e) => e.id !== el.id && e.width * e.height < 0.6 * W * H)
  const hits = (b: { x: number; y: number; width: number; height: number }) => others.some((e) => e.x < b.x + b.width && b.x < e.x + e.width && e.y < b.y + b.height && b.y < e.y + e.height) || (el.x < b.x + b.width && b.x < el.x + el.width && el.y < b.y + b.height && b.y < el.y + el.height)
  const cand = [{ x: el.x + el.width + 24, y: el.y, width: w, height: h }, { x: el.x, y: el.y + el.height + 24, width: w, height: h }, { x: W - w - edgeMargin(doc), y: H - h - edgeMargin(doc), width: w, height: h }]
  const spot = cand.find((b) => b.x >= 0 && b.y >= 0 && b.x + b.width <= W && b.y + b.height <= H && !hits(b))
  let narrow: ElementChange | undefined
  let place = spot
  if (!place) {
    // no free room: when the table is what takes it (it spans the slide), it is made half as wide and the chart goes beside it, and that is said
    const m = edgeMargin(doc), half = Math.floor((W - 2 * m - 24) / 2)
    const cw = Math.min(w, W - m - (el.x + half + 24))
    const beside = { x: el.x + half + 24, y: el.y, width: cw, height: Math.min(h, el.height) }
    const blocked = others.some((e) => e.x < beside.x + beside.width && beside.x < e.x + e.width && e.y < beside.y + beside.height && beside.y < e.y + e.height)
    if (el.width > half + 4 && el.x + half + 24 + cw <= W && cw >= 400 && !blocked) {
      place = beside
      narrow = { slideId: slide.id, elementId: el.id, desc, patch: { width: half }, verb: 'Made {} half as wide to leave room for the chart' }
    }
  }
  if (!place) return { ok: false, why: 'there is no free room on the slide for a chart next to the table (make the table smaller, or put the chart on a new slide)' }
  const addChart: NonNullable<ElementChange['addChart']> = { chartType: kind, labels: el.rows.map((r) => (r[0] ?? '').slice(0, 60) || '–'), series: use.map((x) => ({ name: x.h.slice(0, 60), values: x.n.values })), ...(unit ? { unit } : {}), ...place, fromTableId: el.id }
  return { ok: true, ...(narrow ? { also: narrow } : {}), change: { slideId: slide.id, elementId: newId, addChart, verb: 'Added {} from the table', desc: `a ${kind === 'doughnut' ? 'doughnut' : kind} chart` } }
}

/**
 * A copy of an object of another slide, at the same place (or where it fits). The copy gets `newId`; the check looks for an object of that kind with the same content on the destination slide.
 */
export function planCopy(doc: Presentation, from: Slide, el: SlideElement, to: Slide, newId: string): Planned {
  if (to.locked) return { ok: false, why: 'its slide is locked' }
  if (to.layoutId === 'morph' || to.layoutId === 'morph-template') return { ok: false, why: 'it is part of the template animation: I can change its words and text style, not add to it' }
  if (to.id === from.id) return { ok: false, why: 'that is the same slide' }
  return { ok: true, change: { slideId: to.id, elementId: newId, copy: { fromSlideId: from.id, fromElementId: el.id }, verb: 'Copied {}', desc: describeElement(el) } }
}


/** The slide's objects from the front to the back, exactly as the editor's Selection pane orders them (highest stacking number first; the later one on a tie). */
const stackFrontToBack = (s: Pick<Slide, 'elements'>) => s.elements.map((e, i) => ({ e, i })).sort((a, b) => b.e.zIndex - a.e.zIndex || b.i - a.i).map((x) => x.e)
/** Whether the object already is at the front (or back) of its slide, or is the only object there. */
export function layerAlready(slide: Pick<Slide, 'elements'> | undefined, c: ElementChange): boolean {
  if (!c.layer || !slide) return false
  const order = stackFrontToBack(slide)
  if (c.layer === 'above' || c.layer === 'behind') {
    const i = order.findIndex((e) => e.id === c.elementId), j = order.findIndex((e) => e.id === c.layerOf)
    return i >= 0 && j >= 0 && (c.layer === 'above' ? i < j : i > j)
  }
  return order.length < 2 || (c.layer === 'front' ? order[0]?.id === c.elementId : order.at(-1)?.id === c.elementId)
}

/**
 * Spreads three or more objects evenly across the slide: the first and the last stay where they are, the ones between get equal gaps (horizontally: the same space between their sides, from
 * the leftmost to the rightmost; vertically the same from the top). One position change per object that has to move, each checked like any other move.
 */
/**
 * One layer forward or back, or right in front of / behind another object. "Forward" is "in front of the object just in front of it now", so every relative move is ONE fact the check can
 * read from the deck afterwards (this object is in front of / behind that one). At the very front (back) already: the front (back) change, which the check then finds already so.
 */
export function planLayer(doc: Presentation, slide: Slide, el: SlideElement, to: 'forward' | 'backward' | 'behind' | 'above', other?: SlideElement, templateText = false): Planned {
  const desc = describeElement(el)
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (el.locked) return { ok: false, why: `${desc} is locked` }
  if (templateText) return { ok: false, why: 'it is part of the template animation: re-stacking it would break the Morph between the scenes' }
  const base = { slideId: slide.id, elementId: el.id, desc }
  const order = stackFrontToBack(slide)
  const i = order.findIndex((e) => e.id === el.id)
  if (to === 'forward' || to === 'backward') {
    const j = to === 'forward' ? i - 1 : i + 1
    if (j < 0 || j >= order.length) return { ok: true, change: { ...base, layer: to === 'forward' ? 'front' : 'back', verb: to === 'forward' ? 'Brought {} one layer forward' : 'Sent {} one layer back' } }
    return { ok: true, change: { ...base, layer: to === 'forward' ? 'above' : 'behind', layerOf: order[j]!.id, verb: to === 'forward' ? 'Brought {} one layer forward' : 'Sent {} one layer back' } }
  }
  if (!other) return { ok: false, why: `I could not tell which object to put it ${to === 'behind' ? 'behind' : 'in front of'}` }
  if (other.id === el.id) return { ok: false, why: 'an object cannot go behind or in front of itself' }
  void doc
  return { ok: true, change: { ...base, layer: to, layerOf: other.id, verb: `Put {} ${to === 'behind' ? 'behind' : 'in front of'} ${describeElement(other)}` } }
}

const RATIOS = { '16:9': 16 / 9, '4:3': 4 / 3, '3:2': 3 / 2, '1:1': 1, '9:16': 9 / 16, '3:4': 3 / 4, '2:3': 2 / 3 } as const
type CropRect = { x: number; y: number; w: number; h: number }
const r4 = (v: number) => Math.round(v * 10000) / 10000

/**
 * A picture cut to a shape, to one side, or to its subject. Every number is worked out here from the picture's own shape (`sourceAspect`, measured by the server) and, for a subject, the box a
 * vision step found (fractions of the whole picture). Cutting to a subject keeps the frame's shape (the layout does not change) and leaves some room around the subject; cutting to a ratio
 * gives the frame that shape (it keeps its width, as the Crop dialog does), refused when the taller frame would cover other objects or leave the slide.
 */
export function planCrop(doc: Presentation, slide: Slide, el: SlideElement, o: Extract<ElementOp, { op: 'crop' }>, sourceAspect: number, box?: CropRect | null, templateText = false): Planned {
  const desc = describeElement(el)
  if (el.type !== 'image') return { ok: false, why: `${desc} is not a picture` }
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (el.locked) return { ok: false, why: `${desc} is locked` }
  if (templateText) return { ok: false, why: 'it is part of the template animation: cropping it would change the Morph between the scenes' }
  if (!(sourceAspect > 0)) return { ok: false, why: 'I could not read the size of the picture' }
  const base = { slideId: slide.id, elementId: el.id, desc }
  if (o.ratio === 'original') return { ok: true, change: { ...base, crop: { rect: null, sourceAspect }, verb: 'Showed the whole of {} again' } }
  const shapeOf = (r: number) => r / sourceAspect // a cut-out of this shape (w ÷ h on the screen), in fractions of the picture
  const place = (w: number, h: number, cx: number, cy: number): CropRect => ({ x: r4(clamp(cx - w / 2, 0, 1 - w)), y: r4(clamp(cy - h / 2, 0, 1 - h)), w: r4(w), h: r4(h) })
  let rect: CropRect, verb: string
  if (o.subject) {
    if (!box) return { ok: false, why: `I could not find ${o.subject} in ${desc}` }
    const frac = shapeOf(o.ratio ? RATIOS[o.ratio] : el.width / el.height)
    const pad = 0.12
    const bw = Math.min(1, box.w * (1 + 2 * pad)), bh = Math.min(1, box.h * (1 + 2 * pad))
    let w = Math.max(bw, bh * frac), h = w / frac
    if (h > 1) { h = 1; w = frac }
    if (w > 1) { w = 1; h = 1 / frac }
    // the most of the picture a frame of this shape can show: a subject that needs all of it already fills the picture as it is shown
    if (w >= (frac >= 1 ? 1 : frac) * 0.97 && h >= (frac >= 1 ? 1 / frac : 1) * 0.97) return { ok: false, why: `${o.subject} already fills ${desc}` }
    rect = place(w, h, box.x + box.w / 2, box.y + box.h / 2)
    verb = `Cropped {} to ${/^(the|a|an|my|our|this|that|his|her|their)\b/i.test(o.subject.trim()) ? o.subject.trim() : `the ${o.subject.trim()}`}`
  } else {
    if (!o.ratio && !o.focus) return { ok: false, why: 'I was not told how to crop it' }
    const frac = shapeOf(o.ratio ? RATIOS[o.ratio] : el.width / el.height)
    const w = frac >= 1 ? 1 : frac, h = frac >= 1 ? 1 / frac : 1
    const f = o.focus ?? 'center'
    rect = place(w, h, f === 'left' ? w / 2 : f === 'right' ? 1 - w / 2 : 0.5, f === 'top' ? h / 2 : f === 'bottom' ? 1 - h / 2 : 0.5)
    if (rect.w >= 0.995 && rect.h >= 0.995 && !el.crop) return { ok: false, why: `${desc} already has that shape` }
    verb = o.ratio ? `Cropped {} to ${o.ratio === '1:1' ? 'a square' : o.ratio}${f !== 'center' ? ` (the ${f} part)` : ''}` : `Cropped {} to its ${f} part`
  }
  // the frame keeps its width and takes the cut-out's shape (the Crop dialog's rule): a taller frame must not cover anything or leave the slide
  const { height: H } = CANVAS[doc.aspectRatio]
  const height = Math.round(el.width * (rect.h / rect.w) / sourceAspect)
  const y = Math.round(clamp(el.y + el.height / 2 - height / 2, 0, Math.max(0, H - height)))
  if (height > H) return { ok: false, why: `cut to that shape, ${desc} would be taller than the slide` }
  const hit = height > el.height + 2 ? newContacts(doc, slide, el, { y, height }) : []
  if (hit.length) return { ok: false, why: `cut to that shape, ${desc} gets taller and would cover ${namesOf(hit)} (make it smaller first, or move it)` }
  return { ok: true, change: { ...base, crop: { rect, sourceAspect }, verb } }
}

/** The look of one object put on another of the same kind ("the same look as this picture", "copy the style of the first card"): only how it looks, never its words, place or size. */
export function planCopyLook(slide: Slide, el: SlideElement, from: SlideElement, templateText = false): Planned {
  const desc = describeElement(el)
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (el.locked) return { ok: false, why: `${desc} is locked` }
  if (from.id === el.id) return { ok: false, why: 'that is the same object' }
  if (from.type !== el.type) return { ok: false, why: `${describeElement(from)} is not ${TYPE_WORD[el.type] ? `a ${TYPE_WORD[el.type]}` : 'the same kind of object'}, so its look does not fit ${desc}` }
  if (templateText) return { ok: false, why: 'it is part of the template animation: its look is the template\'s' }
  const pick = <K extends string>(src: Record<string, unknown>, keys: readonly K[]) => Object.fromEntries(keys.filter((k) => src[k] !== undefined).map((k) => [k, structuredClone(src[k])])) as Record<K, unknown>
  const s = from as unknown as Record<string, unknown>
  const patch = from.type === 'image' ? { ...pick(s, ['clip', 'radius', 'fit', 'shadow'] as const), filter: from.filter ?? { brightness: 1, contrast: 1, grayscale: 0 }, overlay: from.overlay ?? null }
    : from.type === 'shape' ? { ...pick(s, ['fill', 'gradient', 'stroke', 'strokeWidth', 'radius'] as const), opacity: from.opacity }
    : from.type === 'text' ? { ...pick(s, ['color', 'weight', 'letterSpacing', 'lineHeight', 'paraGap', 'uppercase', 'align'] as const) }
    : null
  if (!patch || !Object.keys(patch).length) return { ok: false, why: `${desc} has no look I can copy` }
  return { ok: true, change: { slideId: slide.id, elementId: el.id, desc, patch: patch as NonNullable<ElementChange['patch']>, verb: `Gave {} the look of ${describeElement(from)}` } }
}

/** A NEW chart from figures the person typed ("add a bar chart: Q1 10, Q2 14, Q3 9"): every figure is theirs (the capability checks the message), the chart goes in FREE room. */
export function planNewChart(doc: Presentation, slide: Slide, o: Extract<ElementOp, { op: 'add_chart' }>, newId: string): Planned {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (slide.layoutId === 'morph' || slide.layoutId === 'morph-template') return { ok: false, why: 'it is part of the template animation: I can change its words and text style, not add to it' }
  const labels = o.labels.map((l) => l.trim().slice(0, 40)).filter(Boolean)
  if (labels.length < 2 || labels.length > 24) return { ok: false, why: 'a chart needs 2 to 24 items' }
  if (!o.series.length || o.series.length > 6) return { ok: false, why: 'a chart needs 1 to 6 series' }
  if (o.series.some((x) => x.values.length !== labels.length)) return { ok: false, why: `each series needs one figure for each of the ${labels.length} items` }
  const typeWhy = chartTypeProblem({ labels, series: o.series }, o.chartType)
  if (typeWhy) return { ok: false, why: typeWhy }
  const sizes = [[0.5, 0.55], [0.42, 0.46], [0.34, 0.38]] as const
  for (const [fw, fh] of sizes) {
    const spot = freeSpot(doc, slide, Math.round(W * fw), Math.round(H * fh))
    if (spot) return { ok: true, change: { slideId: slide.id, elementId: newId, desc: `a ${o.chartType} chart`, verb: 'Added {}', addChart: { chartType: o.chartType, labels, series: o.series.map((x) => ({ name: x.name.trim().slice(0, 60) || 'Series', values: [...x.values] })), ...(o.unit ? { unit: o.unit.slice(0, 16) } : {}), x: spot.x, y: spot.y, width: spot.width, height: spot.height } } }
  }
  return { ok: false, why: 'there is no free room on the slide for a chart (make room first, or put it on a new slide)' }
}

/** whether the objects already are as the group change asks (grouped as one, or none of them in a group) */
export function groupAlready(g: NonNullable<ElementChange['group']>, slide: Pick<Slide, 'elements'> | undefined): boolean {
  if (!slide) return false
  const members = slide.elements.filter((e) => g.ids.includes(e.id))
  return g.to === 'ungroup' ? members.every((e) => !e.groupId) : members.length === g.ids.length && !!members[0]?.groupId && members.every((e) => e.groupId === members[0]!.groupId)
}

/**
 * Making several objects of a slide one group, or freeing them. Needs two or more objects (not locked, on a slide that is not locked, not part of a template animation). Objects that are already in a group bring
 * their whole group (two groups become one): the change lists every object that ends up in it.
 */
export function planGroup(slide: Slide, els: SlideElement[], to: 'group' | 'ungroup', newId: string): { ok: true; change: ElementChange } | { ok: false; why: string } {
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (slide.layoutId === 'morph' || slide.layoutId === 'morph-template') return { ok: false, why: 'it is part of the template animation: grouping would break it' }
  const ids = expandToGroups(slide.elements, els.map((e) => e.id))
  const members = slide.elements.filter((e) => ids.includes(e.id))
  if (members.some((e) => e.locked)) return { ok: false, why: `${describeElement(members.find((e) => e.locked)!)} is locked` }
  if (to === 'ungroup') {
    const grouped = members.filter((e) => e.groupId)
    if (!grouped.length) return { ok: false, why: 'none of those objects is in a group' }
    return { ok: true, change: { slideId: slide.id, elementId: grouped[0]!.id, desc: `${grouped.length} objects`, group: { to, ids: grouped.map((e) => e.id), groupId: '' }, verb: 'Ungrouped {}' } }
  }
  if (members.length < 2) return { ok: false, why: `grouping needs at least 2 objects, and ${members.length === 0 ? 'none were' : 'one was'} named: select them on the slide, or say which ones` }
  return { ok: true, change: { slideId: slide.id, elementId: members[0]!.id, desc: `${members.length} objects`, group: { to, ids: members.map((e) => e.id), groupId: `g${newId}`.slice(0, 40) }, verb: 'Grouped {}' } }
}

export function planDistribute(doc: Presentation, slide: Slide, els: SlideElement[], axis: 'horizontal' | 'vertical'): { ok: true; changes: ElementChange[]; notes: string[] } | { ok: false; why: string } {
  if (slide.locked) return { ok: false, why: 'its slide is locked' }
  if (els.length < 3) return { ok: false, why: `distributing needs at least 3 objects, and ${els.length === 0 ? 'none were' : els.length === 1 ? 'one was' : 'two were'} named: select them on the slide, or say which ones (for example "the pictures")` }
  const key = axis === 'horizontal' ? 'x' : 'y', size = axis === 'horizontal' ? 'width' : 'height'
  const sorted = [...els].sort((a, b) => a[key] - b[key])
  const first = sorted[0]!, last = sorted.at(-1)!
  const span = last[key] + last[size] - first[key]
  const room = span - sorted.reduce((a, e) => a + e[size], 0)
  if (room < 0) return { ok: false, why: 'those objects overlap too much to be spread evenly (they are wider than the space between the first and the last)' }
  const gap = room / (sorted.length - 1)
  const changes: ElementChange[] = [], notes: string[] = []
  let at = first[key] + first[size] + gap
  for (const e of sorted.slice(1, -1)) {
    const pos = Math.round(at)
    if (e.locked) notes.push(`${describeElement(e).charAt(0).toUpperCase()}${describeElement(e).slice(1)} is locked, so it stays where it is.`)
    else if (Math.abs(e[key] - pos) > 1) changes.push({ slideId: slide.id, elementId: e.id, desc: describeElement(e), patch: { [key]: pos }, verb: axis === 'horizontal' ? 'Spread {} evenly across' : 'Spread {} evenly down' })
    at += e[size] + gap
  }
  void doc
  return { ok: true, changes, notes }
}
