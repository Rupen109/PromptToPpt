import { current, isDraft, type Draft } from 'immer'
import { IMAGE_BG_LAYOUTS, PHOTO_LAYOUTS, applyBrandToTheme, slideBase, slideTheme, brandLogoElements, commonSlideBackground, composePlaceholderSlide, composeSlide, contrastRatio, effectiveBackground, isDark, mix, readableOn, resolveColor, designById, getTheme, makeColors, recolor } from '@prompttoppt/theme'
import type { PlaceholderKind } from '@prompttoppt/theme'
import { composeTemplateScene, getMorphTemplate, pictureSlots } from '@prompttoppt/theme/morph-templates'
import { CANVAS, EFFECTS, elementSchema, themeStyleSchema, isRunBold, isRunItalic, type AspectRatio, type ElementChange, type Effect, type LayoutId, type Presentation, type Slide, type SlideContent, type SlideElement, type TextElement, type Theme, type Transition, type TransitionSpec } from '@prompttoppt/validation'
import { setTransition } from './transition-commands'
import { moveLayer, placeNextTo, renameElement, setHidden } from './selection-commands'
import { frameForCrop, type Rect } from './crop-geometry'
import { defaultPattern, expandToGroups, type PatternKind } from '@prompttoppt/validation'
import { EFFECT_INFO } from '@prompttoppt/ui'
import { applyEffect, clearEffects, copyEffects, moveEffect, effectsForCopies, pruneEffects, remapEffects, snapshotElements, setPathShape, setTrigger, updateEffect } from './effect-commands'

/**
 * Document commands: small PURE mutators over an immer draft. The store turns each call into patches + inverse patches,
 * which is what makes undo/redo exact (spec §9: command/diff based, never a reload). IDs are injected for testability.
 */
export type D = Draft<Presentation>
export type IdGen = () => string
export const newId: IdGen = () => globalThis.crypto.randomUUID()

/** a draft (or anything) as a plain copy: structuredClone throws on immer draft proxies, so they are unwrapped first */
export const plain = <T>(x: T): T => structuredClone(isDraft(x) ? (current(x as Draft<T>) as T) : x)
/** the theme a slide is composed and its own look worked out in: the deck's, with the slide's own brand on it (theme slide-theme.ts); a plain copy, never a draft */
export const baseOf = (d: D, s: Draft<Slide> | Slide): Theme => slideBase(plain(d.theme) as Theme, plain(s.brand) ? { brand: plain(s.brand) as Slide['brand'] } : null)

const findSlide = (d: D, slideId: string) => d.slides.find((s) => s.id === slideId)
const findEl = (s: Draft<Slide>, elId: string) => s.elements.find((e) => e.id === elId)

/** Build a new element through the schema so every default (opacity, bullet glyph, …) is filled in one place. */
export const makeElement = (partial: Record<string, unknown>): SlideElement => elementSchema.parse(partial)

// ─── elements ────────────────────────────────────────────────────────────────

/** Hand-editing marks the slide `manual`, so later theme/layout swaps preserve the user's work instead of recomposing it. */
const touch = (s: Draft<Slide>) => {
  s.manual = true
}

/**
 * A slide's OWN LOOK: the background (colour, gradient or picture) and the text colours that go with it, chosen for THIS slide by a person or by the
 * assistant. It is not "hand-edited" (that is about moved or edited elements, and stops the slide from being laid out again): the slide stays a designed
 * slide, its words and layout can still change, and whenever it is composed again (new words, new layout, new theme) the chosen look is put back on
 * top of the fresh layout. One mechanism for every place a slide is composed again.
 */
interface OwnLook { background: NonNullable<Slide['background']>; themeOverrides: Slide['themeOverrides'] }
const ownLookOf = (s: Draft<Slide> | Slide): OwnLook | null => (s.ownLook && s.background ? { background: plain(s.background) as OwnLook['background'], themeOverrides: s.themeOverrides ? plain(s.themeOverrides) : undefined } : null)

/** Puts the chosen look back on a slide that was just composed again. A colour is applied afresh (its text colours are worked out against the theme in force); a gradient or picture is restored as it was. */
function reapplyOwnLook(d: D, s: Draft<Slide>, look: OwnLook | null, mapColor: (value: string) => string = (v) => v) {
  if (!look) return
  if (look.background.type === 'color') { setSlideBackground(d, s.id, mapColor(look.background.value)); return }
  s.background = look.background as Draft<Slide>['background']
  if (look.themeOverrides) s.themeOverrides = look.themeOverrides as Draft<Slide>['themeOverrides']
  else delete s.themeOverrides
  s.ownLook = true
  makeSlideReadable(d, s.id)
}

/** Puts freshly drawn elements on a slide and moves the slide's effects over to the elements that take their objects' places (the rest are removed). */
function swapElements(s: Draft<Slide>, fresh: Slide['elements']) {
  const old = snapshotElements(s.elements)
  s.elements = fresh as Draft<Slide>['elements']
  remapEffects(s, old)
  pruneEffects(s)
}

export function updateElement(d: D, slideId: string, elId: string, patch: Partial<SlideElement>) {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (!s || !e || e.locked && !('locked' in patch)) return
  Object.assign(e, patch)
  touch(s)
}

export function setText(d: D, slideId: string, elId: string, paragraphs: TextElement['paragraphs']) {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (!s || !e || e.type !== 'text' || e.locked) return
  e.paragraphs = paragraphs
  touch(s)
}

type Paragraphs = TextElement['paragraphs']
type Run = Paragraphs[number]['runs'][number]
type RunStyle = Omit<Run, 'text'>
const styleOf = (r: Run): RunStyle => { const rest: Partial<Run> = { ...r }; delete rest.text; return rest }
const sameStyle = (a: RunStyle, b: RunStyle) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The text typed in the inline editor becomes the new paragraphs WITHOUT throwing the formatting away. The editor only returns plain
 * lines, so each line is matched to the paragraph it came from (same text, else same position) and the characters that did not change
 * keep their run's look (italic word, emphasis colour, link); newly typed characters take the look of the character before them.
 */
export function retextParagraphs(old: Paragraphs, input: (string | { text: string; list?: 'bullet' | 'number' | undefined })[]): Paragraphs {
  const used = new Set<number>()
  const plainOf = (p: Paragraphs[number]) => p.runs.map((r) => r.text).join('')
  // a line may arrive with its own list kind (the editor knows which lines are bullets / numbered); a plain string keeps the list of the paragraph it came from
  const lines = input.map((x) => (typeof x === 'string' ? x : x.text))
  const lists = input.map((x) => (typeof x === 'string' ? undefined : { list: x.list ?? null }))
  return lines.map((line, i) => {
    const out = retextOne(line, i)
    const want = lists[i]
    if (!want) return out
    const rest = { ...out }
    delete rest.list
    return want.list ? { ...rest, list: want.list } : rest
  })
  function retextOne(line: string, i: number): Paragraphs[number] {
    let at = old.findIndex((p, k) => !used.has(k) && plainOf(p) === line)
    if (at < 0) at = i < old.length && !used.has(i) ? i : -1
    const src = at >= 0 ? old[at]! : old[old.length - 1]
    if (at >= 0) used.add(at)
    if (!src) return { runs: [{ text: line }] }
    const list = src.list ? { list: src.list } : {}
    const oldText = plainOf(src)
    if (oldText === line) return { runs: src.runs.map((r) => ({ ...r })), ...list }
    const styles: RunStyle[] = src.runs.flatMap((r) => [...r.text].map(() => styleOf(r)))
    const fallback: RunStyle = styles[0] ?? styleOf(src.runs[0]!)
    const a = [...oldText], b = [...line]
    let pre = 0
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
    let suf = 0
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
    const runs: Run[] = []
    b.forEach((ch, k) => {
      const st = k < pre ? styles[k]! : k >= b.length - suf ? styles[a.length - (b.length - k)]! : (styles[Math.max(0, pre - 1)] ?? fallback)
      const last = runs[runs.length - 1]
      if (last && sameStyle(styleOf(last), st)) last.text += ch
      else runs.push({ ...st, text: ch })
    })
    return { runs: runs.length ? runs : [{ ...fallback, text: '' }], ...list }
  }
}

/** Whether every word of a box is drawn bold / italic / underlined (what the toolbar button shows). */
export function boxHasFlag(e: TextElement, flag: 'bold' | 'italic' | 'underline'): boolean {
  return e.paragraphs.every((p) => p.runs.every((r) => (flag === 'bold' ? isRunBold(r, e) : flag === 'italic' ? isRunItalic(r, e) : !!r.underline)))
}

/** Turns bold / italic / underline on or off for every run of a text box (the toolbar acts on the whole box). Off overrides what the box's role draws (a title's weight, a quote's italic). */
export function setRunFlag(d: D, slideId: string, elId: string, flag: 'bold' | 'italic' | 'underline', on: boolean) {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (!s || !e || e.type !== 'text' || e.locked) return
  const byRole = flag === 'bold' ? isRunBold({}, e) : flag === 'italic' ? isRunItalic({}, e) : false
  for (const p of e.paragraphs) for (const r of p.runs) {
    if (on || byRole) r[flag] = on
    else delete r[flag]
  }
  touch(s)
}

/**
 * The colour of a WHOLE text box: the box's colour, and every coloured part of it (an accent word in a title) takes it too, so "make the title red" makes all of it red. The one
 * command for it: the toolbar's colour buttons and the assistant both use it.
 */
export function setTextColor(d: D, slideId: string, elId: string, color: TextElement['color']) {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (!s || !e || e.type !== 'text' || e.locked) return
  e.color = color
  for (const p of e.paragraphs) for (const r of p.runs) delete r.color
  touch(s)
}

/** Bullet / numbered list on or off for every paragraph of a text box. */
export function setList(d: D, slideId: string, elId: string, list: 'bullet' | 'number' | null) {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (!s || !e || e.type !== 'text' || e.locked) return
  for (const p of e.paragraphs) { if (list) p.list = list; else delete p.list }
  touch(s)
}

/** One link for the whole text box (http/https only — the schema refuses anything else); an empty value removes it. */
export function setLink(d: D, slideId: string, elId: string, url: string | null) {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (!s || !e || e.type !== 'text' || e.locked) return
  for (const p of e.paragraphs) for (const r of p.runs) { if (url) r.link = url; else delete r.link }
  touch(s)
}

export function moveElements(d: D, slideId: string, ids: string[], dx: number, dy: number) {
  const s = findSlide(d, slideId)
  if (!s) return
  for (const id of ids) {
    const e = findEl(s, id)
    if (e && !e.locked) {
      e.x = Math.round(e.x + dx)
      e.y = Math.round(e.y + dy)
    }
  }
  touch(s)
}

export function setGeometry(d: D, slideId: string, elId: string, g: { x: number; y: number; width: number; height: number }) {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (!s || !e || e.locked) return
  Object.assign(e, { x: Math.round(g.x), y: Math.round(g.y), width: Math.max(8, Math.round(g.width)), height: Math.max(8, Math.round(g.height)) })
  touch(s)
}

export function deleteElements(d: D, slideId: string, ids: string[]) {
  const s = findSlide(d, slideId)
  if (!s) return
  const keep = s.elements.filter((e) => !(ids.includes(e.id) && !e.locked))
  if (keep.length === s.elements.length) return // nothing deletable → record nothing
  s.elements = keep
  pruneEffects(s)
  touch(s)
}

export function toggleLock(d: D, slideId: string, elId: string) {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (e) e.locked = !e.locked
}

/** The slide's picture background URL, if it has one (kept across theme / content re-composition). */
const photoOf = (s: Draft<Slide> | Slide): string | undefined => (s.background?.type === 'image' ? s.background.value : undefined)

/** The catalogue/generated picture a photo-styled slide shows (kept across theme / content re-composition). */
export const slidePhoto = (s: Draft<Slide> | Slide) => {
  if (!(PHOTO_LAYOUTS as readonly string[]).includes(s.layoutId)) return undefined
  const im = s.elements.find((e) => e.type === 'image' && e.src && !e.decorative) // the company logo is a decorative image: never mistake it for the slide's picture
  return im && im.type === 'image' && im.src ? { src: im.src, alt: im.alt } : undefined
}

const topZ = (s: Draft<Slide> | Slide) => s.elements.reduce((m, e) => Math.max(m, e.zIndex), 0)

/** A shape the assistant planned (every value already worked out): on top of the slide, or at the stacking place the plan gave (behind the object it surrounds). */
export function addPlannedShape(d: D, slideId: string, id: string, a: NonNullable<ElementChange['add']>) {
  const s = findSlide(d, slideId)
  if (!s || s.elements.some((e) => e.id === id)) return
  addElement(d, slideId, makeElement({ id, type: 'shape', shape: a.shape, x: a.x, y: a.y, width: a.width, height: a.height, rotation: 0, locked: false, zIndex: 0, opacity: a.opacity ?? 1, fill: a.fill, radius: a.radius ?? 0, ...(a.stroke ? { stroke: a.stroke } : {}), ...(a.strokeWidth !== undefined ? { strokeWidth: a.strokeWidth } : {}) }))
  if (a.zIndex !== undefined) { const e = s.elements.find((x) => x.id === id); if (e) e.zIndex = a.zIndex }
}

export function addElement(d: D, slideId: string, element: SlideElement) {
  const s = findSlide(d, slideId)
  if (!s) return
  s.elements.push({ ...element, zIndex: topZ(s) + 1 })
  touch(s)
}

const MAX_EFFECTS = 200 // the schema's cap

/** Puts the copied elements' effects on the slide (as new effects on the copies), up to the schema's cap. */
function addCopiedEffects(s: Draft<Slide>, source: Effect[] | undefined, map: Map<string, string>, gen: IdGen) {
  const fx = effectsForCopies(source, map, gen).slice(0, Math.max(0, MAX_EFFECTS - (s.effects?.length ?? 0)))
  if (fx.length) s.effects = [...(s.effects ?? []), ...fx] as Draft<Slide>['effects']
}

/** Clones elements with fresh IDs, nudged so the copy is visible. Their effects (animation) are copied with them. Returns the new ids. */
export function duplicateElements(d: D, slideId: string, ids: string[], gen: IdGen = newId): string[] {
  const s = findSlide(d, slideId)
  if (!s) return []
  const out: string[] = []
  const map = new Map<string, string>()
  const fx = s.effects ? (plain(s.effects) as Effect[]) : undefined
  for (const e of s.elements.filter((x) => ids.includes(x.id))) {
    const id = gen()
    s.elements.push({ ...plain(e), id, x: e.x + 32, y: e.y + 32, locked: false, zIndex: topZ(s) + 1 })
    out.push(id)
    map.set(e.id, id)
  }
  regroupCopies(s, out, gen)
  if (out.length) { addCopiedEffects(s, fx, map, gen); touch(s) }
  return out
}

/** Copies of a group are a NEW group (every copy of a member gets the new group's id); a lone copy of one member of a group is not in any group. */
function regroupCopies(s: Draft<Slide>, copyIds: string[], gen: IdGen) {
  const copies = s.elements.filter((x) => copyIds.includes(x.id))
  const size = new Map<string, number>() // how many copies carry each OLD group id, counted before any is changed
  for (const c of copies) if (c.groupId) size.set(c.groupId, (size.get(c.groupId) ?? 0) + 1)
  const fresh = new Map<string, string>()
  for (const c of copies) {
    if (!c.groupId) continue
    const old = c.groupId
    if ((size.get(old) ?? 0) < 2) { delete c.groupId; continue }
    if (!fresh.has(old)) fresh.set(old, `g${gen()}`.slice(0, 40))
    c.groupId = fresh.get(old)!
  }
}

/**
 * Makes the objects one GROUP (they are selected, moved, resized, copied and deleted together). Objects that are already in a group bring their whole group along (two groups become one). Needs two or more
 * objects, none of them locked, on a slide that is not locked. Returns the group's id, or null when refused.
 */
export function groupElements(d: D, slideId: string, ids: string[], gen: IdGen = newId): string | null {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return null
  const all = expandToGroups(s.elements, ids)
  const members = s.elements.filter((x) => all.includes(x.id))
  if (members.length < 2 || members.some((x) => x.locked)) return null
  const gid = `g${gen()}`.slice(0, 40)
  for (const m of members) m.groupId = gid
  touch(s)
  return gid
}

/** Takes the objects out of their group(s): every member of a group the ids touch becomes a separate object again. Returns how many objects were freed. */
export function ungroupElements(d: D, slideId: string, ids: string[]): number {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return 0
  const members = s.elements.filter((x) => x.groupId && expandToGroups(s.elements, ids).includes(x.id))
  if (members.some((x) => x.locked)) return 0
  for (const m of members) delete m.groupId
  if (members.length) touch(s)
  return members.length
}

/** Gives several objects their new boxes at once (a group resized as one); text grows or shrinks with `fontScale`. Locked objects and slides keep theirs. */
export function setBoxes(d: D, slideId: string, boxes: Record<string, Box>, fontScale = 1) {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return
  let changed = false
  for (const e of s.elements) {
    const b = boxes[e.id]
    if (!b || e.locked) continue
    e.x = Math.round(b.x); e.y = Math.round(b.y); e.width = Math.max(1, Math.round(b.width)); e.height = Math.max(1, Math.round(b.height))
    if (e.type === 'text' && fontScale !== 1) e.fontSize = Math.min(300, Math.max(10, Math.round(e.fontSize * fontScale)))
    changed = true
  }
  if (changed) touch(s)
}

/** Pastes copied elements (and the effects that were copied with them) with fresh ids. Returns the new ids. */
export function pasteElements(d: D, slideId: string, elements: SlideElement[], gen: IdGen = newId, effects: Effect[] = []): string[] {
  const s = findSlide(d, slideId)
  if (!s) return []
  const out: string[] = []
  const map = new Map<string, string>()
  for (const e of elements) {
    const id = gen()
    s.elements.push({ ...plain(e), id, x: e.x + 32, y: e.y + 32, locked: false, zIndex: topZ(s) + 1 })
    out.push(id)
    map.set(e.id, id)
  }
  regroupCopies(s, out, gen)
  if (out.length) { addCopiedEffects(s, effects, map, gen); touch(s) }
  return out
}

// ─── slides ──────────────────────────────────────────────────────────────────

export function blankSlide(theme: Theme, id: string = newId()): Slide {
  return { id, layoutId: 'blank', locked: false, manual: true, background: { type: 'color', value: theme.colors.background }, elements: [], speakerNotes: '', sources: [], validation: { status: 'pending', issues: [] } }
}

const PLACEHOLDER: Partial<Record<LayoutId, SlideContent>> = {
  'title-body': { layout: 'title-body', title: 'Slide title', bullets: ['First point', 'Second point', 'Third point'], speakerNotes: '', sources: [] },
  'split-image-text': { layout: 'split-image-text', title: 'Slide title', bullets: ['First point', 'Second point'], imagePrompt: 'A relevant illustration', imageAlt: 'Illustration', speakerNotes: '', sources: [] },
  comparison: { layout: 'comparison', title: 'Compare options', left: { heading: 'Option A', bullets: ['Point'] }, right: { heading: 'Option B', bullets: ['Point'] }, speakerNotes: '', sources: [] },
  process: { layout: 'process', title: 'Our process', steps: [1, 2, 3].map((n) => ({ label: `Step ${n}`, detail: 'Describe this step' })), speakerNotes: '', sources: [] },
  timeline: { layout: 'timeline', title: 'Timeline', steps: [1, 2, 3].map((n) => ({ label: `Phase ${n}`, detail: 'Describe this phase' })), speakerNotes: '', sources: [] },
  quote: { layout: 'quote', quote: 'Add a quote', attribution: 'Source', speakerNotes: '', sources: [] },
  table: { layout: 'table', title: 'Table', header: ['Item', 'Detail'], rows: [['A', 'Detail'], ['B', 'Detail']], speakerNotes: '', sources: [] },
  'section-divider': { layout: 'section-divider', title: 'Section title', speakerNotes: '', sources: [] },
  title: { layout: 'title', title: 'Presentation title', subtitle: 'Subtitle', speakerNotes: '', sources: [] },
  'thank-you': { layout: 'thank-you', title: 'Thank you', speakerNotes: '', sources: [] },
  agenda: { layout: 'agenda', title: 'Agenda', items: [1, 2, 3].map((n) => ({ label: `Topic ${n}`, detail: 'A short description' })), speakerNotes: '', sources: [] },
  team: { layout: 'team', title: 'Meet the team', people: [1, 2, 3].map((n) => ({ name: `Team member ${n}`, role: 'Role', bio: 'A short bio' })), speakerNotes: '', sources: [] },
  matrix: { layout: 'matrix', title: 'Prioritisation matrix', xLabel: 'Effort', yLabel: 'Impact', quadrants: [1, 2, 3, 4].map((n) => ({ heading: `Quadrant ${n}`, bullets: ['Point'] })), speakerNotes: '', sources: [] },
  roadmap: { layout: 'roadmap', title: 'Roadmap', phases: [1, 2, 3].map((n) => ({ label: `Phase ${n}`, heading: `Milestone ${n}`, bullets: ['Describe the outcome'] })), speakerNotes: '', sources: [] },
  architecture: { layout: 'architecture', title: 'How it fits together', layers: [{ name: 'Experience', items: ['App', 'Web'] }, { name: 'Platform', items: ['API', 'Workers', 'Data'] }], speakerNotes: '', sources: [] },
  'case-study': { layout: 'case-study', title: 'Customer story', client: 'Client name', challenge: 'What problem did they face?', approach: ['What we did'], results: ['What changed'], headline: { value: '2x', label: 'Headline result' }, speakerNotes: '', sources: [] },
  'big-number': { layout: 'big-number', title: 'The headline', value: '100%', label: 'What this number means', context: ['Supporting context'], speakerNotes: '', sources: [] },
}
/** Layouts a user can insert with placeholder content. (chart/metrics need real data, so they're not offered blank.) */
export const INSERTABLE_LAYOUTS = Object.keys(PLACEHOLDER) as LayoutId[]

export function slideFromLayout(layout: LayoutId, theme: Theme, aspect: AspectRatio, idGen: IdGen = newId): Slide {
  const content = PLACEHOLDER[layout]
  if (!content) return blankSlide(theme, idGen())
  return { id: idGen(), locked: false, validation: { status: 'pending', issues: [] }, ...composeSlide(content, theme, aspect, idGen) }
}

// ─── new slides made of empty, prompted boxes (PowerPoint's layouts) ─────────

/** A new slide: its title / text boxes are empty and show "Click to add …" in the editor (and nothing anywhere else). Hand-made: no stored words for a redesign to bring back. */
export function newSlide(kind: PlaceholderKind, theme: Theme, aspect: AspectRatio, idGen: IdGen = newId): Slide {
  return { id: idGen(), locked: false, manual: true, validation: { status: 'pending', issues: [] }, ...composePlaceholderSlide(kind, theme, aspect, idGen) } as Slide
}

/** The same layout with sample words in its boxes: what the layout gallery shows. */
export function previewSlide(kind: PlaceholderKind, theme: Theme, aspect: AspectRatio): Slide {
  let n = 0
  return { id: `preview-${kind}`, locked: false, manual: true, validation: { status: 'pending', issues: [] }, ...composePlaceholderSlide(kind, theme, aspect, () => `p${++n}`, { sample: true }) } as Slide
}

const isTyped = (e: SlideElement): e is TextElement => e.type === 'text' && e.paragraphs.some((p) => p.runs.some((r) => r.text.trim() !== ''))

/**
 * A slide made only of prompted text boxes (a new slide, whatever has been typed in it): its layout can be changed without losing the words. A slide with a picture, chart, table,
 * diagram or icon on it is not one, and keeps the layout it has.
 */
export function canChangeLayout(s: Slide): boolean {
  return !s.locked && s.elements.some((e) => e.type === 'text' && e.hint !== undefined) && !s.elements.some((e) => e.type === 'image' || e.type === 'chart' || e.type === 'table' || e.type === 'diagram' || e.type === 'icon')
}

/**
 * Gives the slide another PowerPoint layout. Every box with words in it hands them to the box of the same kind in the new layout (a title to the title, text to the text, in reading
 * order); words with no box of that kind left go to the last text box of the body, and are dropped only when the new layout has none (Title only; undo brings them back). One undo step.
 */
export function changeLayout(d: D, slideId: string, kind: PlaceholderKind, idGen: IdGen = newId) {
  const s = findSlide(d, slideId)
  if (!s || !canChangeLayout(s as Slide)) return
  const queues: Record<string, TextElement['paragraphs'][]> = { title: [], subtitle: [], heading: [], body: [] }
  const slot = (role: TextElement['role']) => (role === 'caption' || role === 'quote' || role === 'metric' ? 'body' : role)
  for (const e of [...(plain(s.elements) as SlideElement[])].sort((a, b) => a.y - b.y || a.x - b.x)) if (isTyped(e)) queues[slot(e.role)]!.push(e.paragraphs)
  const fresh = newSlide(kind, d.theme as Theme, d.aspectRatio, idGen)
  let last: TextElement | null = null
  const elements = fresh.elements.map((e) => {
    if (e.type !== 'text' || e.hint === undefined) return e
    const words = queues[slot(e.role)]!.shift()
    if (slot(e.role) === 'body') last = e
    return words ? { ...e, paragraphs: words } : e
  })
  const rest = Object.values(queues).flat()
  if (rest.length && last) {
    const at = elements.findIndex((e) => e === last)
    const el = elements[at] as TextElement
    const empty = !isTyped(el)
    elements[at] = { ...el, paragraphs: [...(empty ? [] : el.paragraphs), ...rest.flat()] }
  }
  s.layoutId = fresh.layoutId
  s.background = fresh.background
  delete s.content
  swapElements(s, elements)
  s.manual = true
}

export function addSlideAt(d: D, index: number, slide: Slide) {
  d.slides.splice(Math.max(0, Math.min(index, d.slides.length)), 0, slide as Draft<Slide>)
}

export function duplicateSlide(d: D, slideId: string, gen: IdGen = newId): string | null {
  const i = d.slides.findIndex((s) => s.id === slideId)
  if (i < 0) return null
  const copy = plain(d.slides[i]!) as Slide
  copy.id = gen()
  copy.locked = false
  // The copy keeps its elements' ids: an element is the same element on both slides, which is what lets a Morph move it from one slide to the other (an id only has to be unique within its slide).
  const fx = copyEffects(copy.effects, new Map(copy.elements.map((e) => [e.id, e.id])), gen)
  if (fx) copy.effects = fx; else delete copy.effects
  d.slides.splice(i + 1, 0, copy as Draft<Slide>)
  return copy.id
}

/** A deck always keeps at least one slide. */
export function deleteSlide(d: D, slideId: string) {
  const i = d.slides.findIndex((s) => s.id === slideId)
  if (i < 0 || d.slides.length <= 1) return
  d.slides.splice(i, 1)
}

export function moveSlide(d: D, from: number, to: number) {
  if (from === to || from < 0 || from >= d.slides.length) return
  const [s] = d.slides.splice(from, 1)
  d.slides.splice(Math.max(0, Math.min(to, d.slides.length)), 0, s!)
}

export function setSpeakerNotes(d: D, slideId: string, notes: string) {
  const s = findSlide(d, slideId)
  if (s) s.speakerNotes = notes.slice(0, 5000)
}

export function setSlideBackground(d: D, slideId: string, value: string) {
  const s = findSlide(d, slideId)
  if (!s) return
  // a pattern stays when the colour changes, re-tinted for the new colour (a faint white on dark, black on light) so it stays as quiet as it was
  const had = s.background?.type === 'color' ? s.background.pattern : undefined
  s.background = { type: 'color', value, ...(had && /^#[0-9a-f]{6}$/i.test(value) ? { pattern: { ...defaultPattern(had.kind, value), size: had.size } } : {}) }
  // text colours are theme tokens: on a hand-picked colour the deck's normal text can vanish (dark text on navy), so this one slide gets readable colours of its own
  const isHexColour = /^#[0-9a-f]{6}$/i.test(value)
  const light = isDark(value)
  const own = baseOf(d, s) // (worked out against the slide's own brand, when it has one)
  const overrides: Record<string, string> = { ...s.themeOverrides }
  const setOrClear = (key: string, fix: string | null) => { if (fix) overrides[key] = fix; else delete overrides[key] }
  for (const [key, fallback] of [['textPrimary', light ? '#FFFFFF' : '#111827'], ['textSecondary', light ? '#D6D6E0' : '#4B5563']] as const) {
    setOrClear(key, isHexColour && contrastRatio(own.colors[key], value) < 4.5 ? fallback : null)
  }
  // brand colours also draw text (kickers, numbers) and panels: move them toward white/black only as far as needed, and keep the text ON them readable
  let moved = false
  for (const key of ['primary', 'accent'] as const) {
    const base = own.colors[key]
    let fix: string | null = null
    if (isHexColour && contrastRatio(base, value) < 3) {
      const toward = light ? '#FFFFFF' : '#000000'
      for (let t = 0.1; t <= 1.001 && !fix; t += 0.1) { const c = mix(base, toward, t); if (contrastRatio(c, value) >= 3.5) fix = c }
    }
    setOrClear(key, fix); if (fix && key === 'primary') moved = true
  }
  setOrClear('onPrimary', moved ? readableOn(overrides['primary']!, ['#FFFFFF', '#111827']) : null)
  if (Object.keys(overrides).length) s.themeOverrides = overrides as typeof s.themeOverrides
  else delete s.themeOverrides
  makeSlideReadable(d, slideId)
  s.ownLook = true // the slide's own look, not hand-editing: its words and layout can still be changed (see OwnLook)
}

/**
 * Makes every piece of text on a slide readable on what is ACTUALLY behind it (the slide's background and any panel or card under the text). Slides such as a cover or a
 * thank-you page set their text to fixed colours chosen for their own background, so moving the background (a hand-picked colour, "same as the other slides") can leave
 * dark text on dark: theme tokens cannot fix that. Text that already reads is left exactly as it was; text that does not gets the closest colour that does.
 * Returns how many text boxes it recoloured.
 */
export function makeSlideReadable(d: D, slideId: string): number {
  const s = findSlide(d, slideId)
  if (!s) return 0
  const theme = plain(d.theme) as Theme
  const colors = slideTheme(theme, plain(s) as Slide).colors // (the slide's own brand and own look)
  let fixed = 0
  for (const e of s.elements) {
    if (e.type !== 'text' || e.decorative) continue
    const t = e as TextElement
    const bg = effectiveBackground(s as Slide, theme, t)
    const fg = resolveColor(t.color, theme, s as Slide)
    const need = t.fontSize >= 32 || ((t.weight ?? 400) >= 700 && t.fontSize >= 24) ? 3 : 4.5
    if (fg && contrastRatio(fg, bg) >= need) continue
    // the closest readable choice: the deck's own text colours first (so the slide still looks like the deck), then plain white / near-black
    const soft = t.role === 'subtitle' || t.role === 'caption'
    const fix = readableOn(bg, soft ? [colors.textSecondary, colors.textPrimary, '#FFFFFF', '#111827'] : [colors.textPrimary, '#FFFFFF', '#111827'], Math.max(need, 4.5))
    if (fix && fix.toLowerCase() !== (fg ?? '').toLowerCase()) { t.color = fix as TextElement['color']; fixed++ }
  }
  // words with a colour of their own (a blue "Classical Physics" in a title): moved toward white / black only as far as needed, so they keep their colour and their
  // emphasis and stay readable on the new background (a highlighted word sits on its own marker and is left as it is)
  for (const e of s.elements) {
    if (e.type !== 'text' || e.decorative) continue
    const t = e as TextElement
    const bg = effectiveBackground(s as Slide, theme, t)
    const need = t.fontSize >= 32 || ((t.weight ?? 400) >= 700 && t.fontSize >= 24) ? 3 : 4.5
    const toward = isDark(bg) ? '#FFFFFF' : '#000000'
    for (const p of t.paragraphs) for (const r of p.runs) {
      if (!r.color || r.highlight) continue
      const fg = resolveColor(r.color, theme, s as Slide)
      if (!fg || contrastRatio(fg, bg) >= need) continue
      let fix: string | null = null
      for (let k = 0.1; k <= 1.001 && !fix; k += 0.1) { const c = mix(fg, toward, k); if (contrastRatio(c, bg) >= need) fix = c }
      if (fix) { r.color = fix.toUpperCase() as typeof r.color; fixed++ }
    }
  }
  return fixed
}

export function setSlideLocked(d: D, slideId: string, locked: boolean) {
  const s = findSlide(d, slideId)
  if (s) s.locked = locked
}

export function setTitle(d: D, title: string) {
  d.title = title.trim().slice(0, 200) || 'Untitled presentation'
}

// ─── design: theme, layout swap, typography, AI replacement ─────────────────────

const colorKey = (theme: Theme, value: string) => (Object.entries(theme.colors).find(([, v]) => v.toLowerCase() === value.toLowerCase())?.[0] as keyof Theme['colors'] | undefined)

/**
 * Switch theme. Untouched slides are re-composed from their stored semantic content (full redesign, nothing lost);
 * hand-edited slides keep their elements — only the background is mapped to the same colour role in the new theme.
 */
export function applyTheme(d: D, themeId: string) {
  applyThemeObject(d, getTheme(themeId))
}

/** Switch the whole deck between dark and light, keeping its brand colours (primary / accent), fonts, layout and content. */
export function setThemeMode(d: D, mode: 'light' | 'dark') {
  const t = d.theme as Theme
  applyThemeObject(d, { ...t, colors: makeColors({ primary: t.colors.primary, accent: t.colors.accent, mode, bg: 'white' }) })
}

/** Switches the deck to one of the catalogue designs (colours, fonts, style kit, motion); untouched slides are re-composed, hand-edited ones keep their content. */
export function applyDesign(d: D, designId: string) {
  const design = designById(designId)
  if (design) applyThemeObject(d, design.theme)
}

/** New colour palette on the current design (any palette works on any design). */
export function applyPalette(d: D, seed: { primary: string; accent: string }) {
  applyThemeObject(d, recolor(d.theme as Theme, seed))
}

/** A hand-edited slide is never redrawn from its content, so its logo is swapped directly: the old one (and its plate) out, the theme's logo in. */
function placeLogo(s: Draft<Slide>, theme: Theme, aspect: Presentation['aspectRatio']) {
  s.elements = s.elements.filter((e) => !e.brand) as Draft<Slide>['elements']
  if (!theme.brand?.logo) return
  const top = s.elements.reduce((m, e) => Math.max(m, e.zIndex), 0)
  const dark = s.background?.type === 'image' || isDark((s.background?.value as string | undefined) ?? theme.colors.background)
  brandLogoElements(theme, aspect, dark, newId).forEach((e, i) => s.elements.push({ ...e, zIndex: top + 1 + i } as Draft<Slide>['elements'][number]))
}

/**
 * Swaps the deck's whole design (colours, fonts, style kit, motion) and re-composes every slide that wasn't hand-edited.
 * The company brand (logo) belongs to the deck, not to a template, so it stays unless `keepBrand` is false.
 */
export function applyThemeObject(d: D, incoming: Theme, opts: { keepBrand?: boolean } = {}) {
  const old = d.theme as Theme
  const next: Theme = opts.keepBrand !== false && old.brand && !incoming.brand ? { ...incoming, brand: old.brand } : incoming
  d.theme = next as Draft<Theme>
  const aspect = d.aspectRatio
  for (const s of d.slides) {
    if (!s.manual && s.content) {
      const look = ownLookOf(s)
      const fresh = composeSlide(s.content as SlideContent, slideBase(next, s.brand ? { brand: plain(s.brand) as Slide['brand'] } : null), aspect, undefined, { backgroundImage: photoOf(s), photo: slidePhoto(s), keepPhoto: true }) // (a slide with its own brand keeps it)
      swapElements(s, fresh.elements)
      s.background = fresh.background
      if (!s.transition?.own) s.transition = fresh.transition as Draft<Slide>['transition'] // a transition a person chose stays
      // a colour chosen from the old palette (the deck's own background, its primary…) follows the new palette; any other colour stays
      reapplyOwnLook(d, s, look, (value) => { const k = colorKey(old, value); return k ? next.colors[k] : value })
    } else {
      if (s.background?.type === 'color') {
        const k = colorKey(old, s.background.value)
        if (k) s.background = { type: 'color', value: next.colors[k] }
      }
      // A hand-edited slide is never redrawn from its content, so its logo is swapped directly: the old one (and plate) out, the new one in.
      placeLogo(s, slideBase(next, s.brand ? { brand: plain(s.brand) as Slide['brand'] } : null), aspect)
      pruneEffects(s)
    }
  }
}

/**
 * Changes the deck's DESIGN settings (theme.style: title and heading styles, heading weight / letter spacing / capitals, cards, decorations, photo frames, bullets, diagrams,
 * backgrounds, the footer) and draws the designed slides again in them, the same way a design swap does (hand-edited slides keep their objects). Values outside what the
 * schema allows are refused (nothing changes). Returns whether anything changed.
 */
export function setDesignStyle(d: D, patch: Partial<NonNullable<Theme['style']>>): boolean {
  const theme = plain(d.theme) as Theme
  const now = themeStyleSchema.parse(theme.style ?? {})
  const next = themeStyleSchema.safeParse({ ...now, ...patch })
  if (!next.success) return false
  if (next.data.footerText === '') delete (next.data as { footerText?: string }).footerText
  if (JSON.stringify(next.data) === JSON.stringify(now)) return false
  applyThemeObject(d, { ...theme, style: next.data })
  return true
}

/** A brand to apply: what "use my brand" found on a website, or a saved brand kit. */
export interface BrandProfileLike {
  name: string | null
  colors: { primary: string | null; accent: string | null }
  fonts: { heading: { family: string } | null; body: { family: string } | null }
  logo: { url: string; aspect: number } | null
}

/** Applies the chosen parts of a brand to the whole deck in one step: colours (mode and layout stay), fonts, and the logo on every slide. A brand some slides had of their own gives way: the whole deck is now in this one. */
export function applyBrand(d: D, brand: BrandProfileLike, pick: { colors: boolean; fonts: boolean; logo: boolean }) {
  for (const s of d.slides) delete s.brand
  applyThemeObject(d, applyBrandToTheme(structuredClone(plain(d.theme)) as Theme, { primary: brand.colors.primary, accent: brand.colors.accent, headingFont: brand.fonts.heading?.family, bodyFont: brand.fonts.body?.family, name: brand.name, logo: brand.logo }, pick))
}

/** A slide drawn again in the theme it now has (its own brand put on or taken off): its layout, fonts and logo; its own look is put back on top; a hand-edited slide keeps its objects and only its logo changes. */
function redrawInOwnTheme(d: D, s: Draft<Slide>) {
  const theme = baseOf(d, s)
  if (!s.manual && s.content) {
    const look = ownLookOf(s)
    const fresh = composeSlide(s.content as SlideContent, theme, d.aspectRatio, undefined, { backgroundImage: photoOf(s), photo: slidePhoto(s), keepPhoto: true })
    swapElements(s, fresh.elements)
    s.background = fresh.background
    reapplyOwnLook(d, s, look)
  } else {
    placeLogo(s, theme, d.aspectRatio)
    if (s.ownLook && s.background?.type === 'color') setSlideBackground(d, s.id, s.background.value) // (its text colours worked out again against the new colours)
    makeSlideReadable(d, s.id)
    pruneEffects(s)
  }
}

/**
 * Applies the chosen parts of a brand to SOME slides only ("my brand on slides 1 to 5"): those slides get the brand's colours (worked out against the deck's design, so they
 * stay readable), its fonts and its logo; the other slides stay as they are. Locked slides are left alone. Returns how many slides took it.
 */
export function applyBrandToSlides(d: D, slideIds: string[], brand: BrandProfileLike, pick: { colors: boolean; fonts: boolean; logo: boolean }): number {
  const own: NonNullable<Slide['brand']> = {
    ...(brand.name ? { name: brand.name } : {}),
    ...(pick.colors && brand.colors.primary && brand.colors.accent ? { primary: brand.colors.primary.toUpperCase(), accent: brand.colors.accent.toUpperCase() } : {}),
    ...(pick.fonts && brand.fonts.heading && brand.fonts.body ? { headingFont: brand.fonts.heading.family, bodyFont: brand.fonts.body.family } : {}),
    ...(pick.logo && brand.logo ? { logo: { url: brand.logo.url, aspect: brand.logo.aspect } } : {}),
  }
  if (!own.primary && !own.headingFont && !own.logo) return 0
  let n = 0
  for (const id of slideIds) {
    const s = findSlide(d, id)
    if (!s || s.locked) continue
    s.brand = own as Draft<Slide>['brand']
    redrawInOwnTheme(d, s)
    n++
  }
  return n
}

/** Takes a slide's own brand off (it goes back to the deck's look). Returns how many slides had one. */
export function removeSlideBrand(d: D, slideIds: string[]): number {
  let n = 0
  for (const id of slideIds) {
    const s = findSlide(d, id)
    if (!s || s.locked || !s.brand) continue
    delete s.brand
    redrawInOwnTheme(d, s)
    n++
  }
  return n
}

/** Drops one of the brand kit's pictures onto a slide (centred, kept in proportion). */
export function addBrandImage(d: D, slideId: string, img: { url: string; name: string; aspect: number }) {
  const { width: W, height: H } = CANVAS[d.aspectRatio]
  const w = Math.round(Math.min(W * 0.28, H * 0.5 * img.aspect))
  const h = Math.round(w / img.aspect)
  addElement(d, slideId, makeElement({ type: 'image', id: newId(), x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), width: w, height: h, rotation: 0, locked: false, zIndex: 0, opacity: 1, src: img.url, alt: img.name, fit: 'contain', clip: 'none' }))
}

/** Takes the company logo off every slide (colours and fonts stay as they are). */
export function removeBrandLogo(d: D) {
  const rest = { ...(plain(d.theme) as Theme) } as Partial<Theme>
  delete rest.brand
  applyThemeObject(d, rest as Theme, { keepBrand: false })
}

/** One AI-assistant answer = one undo step: optional new theme, then validated slide rewrites (already checked server-side). */
/** The deck remembers sources attached in chat. Applied as its own step BEFORE the edit, so undoing an AI edit does not make the deck forget its document. */
export function addSources(d: D, list: { id: string; type: 'pdf' | 'url' | 'text'; title: string; url?: string }[]) {
  for (const src of list) if (!d.sources.some((x) => x.id === src.id)) d.sources.push(src)
}

export interface AssistChanges {
  theme: Theme | null
  edits: { slideId: string; content: SlideContent }[]
  additions?: { afterSlideId: string | null; content: SlideContent; id?: string | undefined; atStart?: boolean | undefined }[] | undefined
  backgrounds?: { slideId: string; color: string }[] | undefined
  gradients?: { slideId: string; from: string; to: string; kind?: 'radial' | undefined }[] | undefined
  blurs?: { slideId: string; blur: number }[] | undefined
  patterns?: { slideId: string; kind: PatternKind | null }[] | undefined
  /** one slide's background, as it is, on other slides */
  backgroundCopies?: { fromSlideId: string; slideIds: string[] }[] | undefined
  /** a brand on some slides only, or taken off them (brand null) */
  slideBrands?: { slideIds: string[]; brand: NonNullable<Slide['brand']> | null }[] | undefined
  clearPictures?: string[] | undefined
  pictureSwaps?: { slideId: string; elementId: string; url: string; alt: string }[] | undefined
  readability?: string[] | undefined
  pictures?: { slideId: string; url: string; alt?: string | undefined; placement?: 'background' | 'beside' | 'floating' | undefined }[] | undefined
  duplicates?: { slideId: string; newId: string }[] | undefined
  moves?: { slideId: string; afterSlideId: string | null }[] | undefined
  locks?: { slideId: string; locked: boolean }[] | undefined
  transitions?: { slideId: string; to: TransitionSpec }[] | undefined
  removals?: string[] | undefined
  /** objects changed in size, place, text or existence, planned into absolute values by the server */
  elementChanges?: ElementChange[] | undefined
  sources?: { id: string; type: 'pdf' | 'url' | 'text'; title: string; url?: string }[] | undefined
}

/** One change of an assistant answer, with the key that names it (the same key its expectation carries, see packages/theme/src/assist), so it can be applied and checked on its own. */
export interface AssistStep { key: string; apply: (d: D) => void }

/**
 * The changes of one assistant answer as an ordered list of steps (validated server-side). New slides and copies go in first, so the other changes of the same answer can target them ("add a
 * thank you page and make it brown", "duplicate slide 3 and make the copy blue"); moves, locks and deletions go last. Every step uses the editor's own commands.
 */
export function assistSteps(r: AssistChanges): AssistStep[] {
  const steps: AssistStep[] = []
  const add = (key: string, apply: (d: D) => void) => steps.push({ key, apply })
  if (r.theme) { const t = r.theme; add('theme', (d) => applyThemeObject(d, t)) }
  ;(r.additions ?? []).forEach((a, i) => add(`addition:${i}`, (d) => {
    const at = a.atStart ? 0 : a.afterSlideId ? d.slides.findIndex((s) => s.id === a.afterSlideId) + 1 : d.slides.length
    const slide: Slide = { locked: false, validation: { status: 'pending', issues: [] }, ...composeSlide(a.content, d.theme as Theme, d.aspectRatio, newId), id: a.id ?? newId() }
    addSlideAt(d, at > 0 || a.atStart ? at : d.slides.length, slide)
    matchDeckBackground(d, slide.id)
  }))
  ;(r.duplicates ?? []).forEach((x, i) => add(`duplicate:${i}`, (d) => { let first = true; duplicateSlide(d, x.slideId, () => (first ? ((first = false), x.newId) : newId())) }))
  r.edits.forEach((e, i) => add(`edit:${i}`, (d) => replaceContent(d, e.slideId, e.content, true))) // the server already checked that a layout change was asked for
  ;(r.backgrounds ?? []).forEach((b, i) => add(`background:${i}`, (d) => setSlideBackground(d, b.slideId, b.color)))
  ;(r.gradients ?? []).forEach((g, i) => add(`gradient:${i}`, (d) => setBackgroundGradient(d, g.slideId, g.from, g.to, 135, g.kind ?? 'linear')))
  ;(r.blurs ?? []).forEach((g, i) => add(`blur:${i}`, (d) => setBackgroundBlur(d, g.slideId, g.blur)))
  ;(r.patterns ?? []).forEach((g, i) => add(`pattern:${i}`, (d) => setBackgroundPattern(d, g.slideId, g.kind)))
  ;(r.backgroundCopies ?? []).forEach((g, i) => add(`background_copy:${i}`, (d) => { copyBackground(d, g.fromSlideId, g.slideIds) })) // the Background menu's own command
  // a brand on some slides only: the Brand tab's own commands (its colours worked out against the deck, the slides drawn again in it)
  ;(r.slideBrands ?? []).forEach((g, i) => add(`slide_brand:${i}`, (d) => {
    if (!g.brand) { removeSlideBrand(d, g.slideIds); return }
    const b = g.brand
    applyBrandToSlides(d, g.slideIds, { name: b.name ?? null, colors: { primary: b.primary ?? null, accent: b.accent ?? null }, fonts: { heading: b.headingFont ? { family: b.headingFont } : null, body: b.bodyFont ? { family: b.bodyFont } : null }, logo: b.logo ?? null }, { colors: !!b.primary, fonts: !!b.headingFont, logo: !!b.logo })
  }))
  ;(r.clearPictures ?? []).forEach((id, i) => add(`clear_pictures:${i}`, (d) => clearPictures(d, id)))
  ;(r.pictureSwaps ?? []).forEach((x, i) => add(`picture_swap:${i}`, (d) => swapPicture(d, x.slideId, x.elementId, { url: x.url, alt: x.alt, fit: 'contain' })))
  ;(r.readability ?? []).forEach((id, i) => add(`readability:${i}`, (d) => { makeSlideReadable(d, id) }))
  ;(r.pictures ?? []).forEach((p, i) => add(`photo:${i}`, (d) => placePhoto(d, p.slideId, p.placement ?? 'background', { url: p.url, alt: p.alt ?? '', prompt: '' })))
  ;(r.moves ?? []).forEach((m, i) => add(`move:${i}`, (d) => {
    const from = d.slides.findIndex((s) => s.id === m.slideId)
    if (from < 0) return
    const [s] = d.slides.splice(from, 1)
    const anchor = m.afterSlideId ? d.slides.findIndex((x) => x.id === m.afterSlideId) : -1
    d.slides.splice(m.afterSlideId && anchor < 0 ? d.slides.length : anchor + 1, 0, s!)
  }))
  ;(r.elementChanges ?? []).forEach((c, i) => add(`element:${i}`, (d) => {
    const s = findSlide(d, c.slideId)
    if (c.add) { if (s && !s.locked) addPlannedShape(d, c.slideId, c.elementId, c.add); return }
    if (c.addChart) { if (s && !s.locked && !s.elements.some((e) => e.id === c.elementId)) { const a = c.addChart; addElement(d, c.slideId, makeElement({ id: c.elementId, type: 'chart', x: a.x, y: a.y, width: a.width, height: a.height, rotation: 0, locked: false, zIndex: 0, opacity: 1, chartType: a.chartType, labels: a.labels, series: a.series, ...(a.unit ? { unit: a.unit } : {}) })) } return }
    if (c.copy) {
      // a copy of an object of another slide (its effects are not copied)
      const src = findSlide(d, c.copy.fromSlideId)?.elements.find((x) => x.id === c.copy!.fromElementId)
      if (s && !s.locked && src && !s.elements.some((e) => e.id === c.elementId)) addElement(d, c.slideId, makeElement({ ...plain(src as SlideElement), id: c.elementId, locked: false, zIndex: 0 } as SlideElement))
      return
    }
    const e = s && findEl(s, c.elementId)
    if (!s || !e || s.locked) return // the element commands check the object's own lock; the slide's lock is checked here
    if (c.remove) { if (c.patch?.locked === false) updateElement(d, c.slideId, c.elementId, { locked: false }); deleteElements(d, c.slideId, [c.elementId]); return } // (a design-locked decoration the person named is unlocked first)
    if (c.layer) { if (c.layer === 'above' || c.layer === 'behind') { if (c.layerOf) placeNextTo(d, c.slideId, c.elementId, c.layerOf, c.layer) } else moveLayer(d, c.slideId, c.elementId, c.layer); return }
    // lock, switch off, name: the Selection pane's own commands (a lock change is the only change a locked object accepts)
    const { locked, hidden, label } = c.patch ?? {}
    if (locked === false) updateElement(d, c.slideId, c.elementId, { locked }) // (unlocked first, so the rest of the change applies)
    if (hidden !== undefined) setHidden(d, c.slideId, c.elementId, hidden)
    if (label !== undefined) renameElement(d, c.slideId, c.elementId, label)
    if (c.group) { if (c.group.to === 'group') groupElements(d, c.slideId, c.group.ids, () => c.group!.groupId.slice(1)); else ungroupElements(d, c.slideId, c.group.ids); return }
    if (c.effect) {
      // an animation: the editor's own commands (the gallery click replaces an effect of the same kind; "None" takes them all off), then the options asked for
      if ('clear' in c.effect) {
        // all of the object's animations, only one kind of them (entrance / emphasis / exit), or ONE animation by its id
        const fx = c.effect, s0 = findSlide(d, c.slideId)
        if (!fx.kind && !fx.effectId) clearEffects(d, c.slideId, [c.elementId])
        else if (s0 && !s0.locked && s0.effects) { const kind = fx.kind ? new Set<string>(EFFECTS[fx.kind]) : null; s0.effects = s0.effects.filter((x) => !(fx.effectId ? x.id === fx.effectId : x.elementId === c.elementId && kind!.has(x.type))); if (!s0.effects.length) delete s0.effects }
      }
      else if ('setStart' in c.effect) { const st = c.effect.setStart; for (const x of findSlide(d, c.slideId)?.effects?.filter((e) => e.elementId === c.elementId) ?? []) updateEffect(d, c.slideId, x.id, { start: st }) }
      else if ('sequence' in c.effect) {
        // the slide's animations in this order of objects (each object keeps the order of its own animations; the others follow, as they were)
        const s0 = findSlide(d, c.slideId), order = c.effect.sequence
        if (s0 && !s0.locked && s0.effects) { const rank = (x: { elementId: string }) => { const i = order.indexOf(x.elementId); return i < 0 ? order.length : i }; s0.effects = s0.effects.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i).map((p) => p.x) }
      }
      else if ('paint' in c.effect) {
        // the Animation Painter: the object's own animations are replaced by these, one by one with the editor's own commands
        clearEffects(d, c.slideId, [c.elementId])
        for (const p of c.effect.paint) {
          const { type, direction, distance, ...opts } = p
          for (const id of applyEffect(d, c.slideId, [c.elementId], type as Effect['type'], newId)) {
            if (EFFECT_INFO[type as Effect['type']]?.path) { if (direction !== undefined || distance !== undefined) setPathShape(d, c.slideId, id, { ...(direction ? { direction: direction as NonNullable<Effect['direction']> } : {}), ...(distance !== undefined ? { distance } : {}) }) }
            else if (direction !== undefined || distance !== undefined) updateEffect(d, c.slideId, id, { ...(direction ? { direction } : {}), ...(distance !== undefined ? { distance } : {}) } as Partial<Effect>)
            if (Object.keys(opts).length) updateEffect(d, c.slideId, id, opts as Partial<Effect>)
          }
        }
      }
      else if ('moveTo' in c.effect) { const at = findSlide(d, c.slideId)?.effects?.findIndex((x) => x.elementId === c.elementId) ?? -1; if (at >= 0) moveEffect(d, c.slideId, at, c.effect.moveTo) }
      else {
        const { type, direction, distance, trigger, ...opts } = c.effect
        for (const id of applyEffect(d, c.slideId, [c.elementId], type as Effect['type'], newId)) {
          // a motion path stores its points: the editor's own command draws them for the asked direction and distance; other effects just take the options
          if (EFFECT_INFO[type as Effect['type']]?.path) { if (direction !== undefined || distance !== undefined) setPathShape(d, c.slideId, id, { ...(direction ? { direction } : {}), ...(distance !== undefined ? { distance } : {}) }) }
          else updateEffect(d, c.slideId, id, { ...(direction ? { direction } : {}), ...(distance !== undefined ? { distance } : {}) } as Partial<Effect>)
          if (Object.keys(opts).length) updateEffect(d, c.slideId, id, opts as Partial<Effect>)
          if (trigger) setTrigger(d, c.slideId, id, trigger) // plays when that object is clicked: the editor's own command (it checks the object is on the slide)
        }
      }
      return
    }
    const own: Record<string, unknown> = { ...(c.patch ?? {}) }
    for (const k of ['locked', 'hidden', 'label'] as const) delete own[k] // (applied above with their own commands)
    if (own['overlay'] === null) own['overlay'] = undefined // (no colour wash: the field is taken off)
    for (const k of ['textShadow', 'textOutline', 'border'] as const) if (own[k] === null) own[k] = undefined // (an effect taken off)
    if (own['strokeDash'] === null) own['strokeDash'] = undefined // (a solid border or line again: the field is taken off)
    if (own['legend'] === null) own['legend'] = undefined // (an automatic legend: the field is taken off)
    if (own['stack'] === null) own['stack'] = undefined // (bars side by side again)
    if (own['merges'] === null) own['merges'] = undefined // (a table with no merged cells left)
    if (own['aligns'] === null) own['aligns'] = undefined // (no cell with its own alignment left)
    if (Array.isArray(own['highlights']) && !(own['highlights'] as unknown[]).length) own['highlights'] = undefined // (no highlighted cell left)
    if (c.crop) setPictureCrop(d, c.slideId, c.elementId, c.crop.rect, c.crop.sourceAspect) // (the Crop dialog's own command: it also sizes the frame)
    const { x, y, width, height, ...rest } = own as NonNullable<typeof c.patch>
    if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) setGeometry(d, c.slideId, c.elementId, { x, y, width, height })
    else if (x !== undefined || y !== undefined || width !== undefined || height !== undefined) updateElement(d, c.slideId, c.elementId, { ...(x !== undefined ? { x: Math.round(x) } : {}), ...(y !== undefined ? { y: Math.round(y) } : {}), ...(width !== undefined ? { width: Math.round(width) } : {}), ...(height !== undefined ? { height: Math.round(height) } : {}) }) // (a size alone, like a table that grew by a row, is applied too)
    const { color, ...other } = rest
    const left = e.type === 'text' ? other : rest
    if (Object.keys(left).length) updateElement(d, c.slideId, c.elementId, structuredClone(left) as Partial<SlideElement>) // (a copy: the planned arrays are the answer's own and must stay plain; new words first, so a colour asked with them reaches every word)
    if (color !== undefined && e.type === 'text') setTextColor(d, c.slideId, c.elementId, color as TextElement['color']) // (the whole text, its coloured words too)
    if (c.bold !== undefined) setRunFlag(d, c.slideId, c.elementId, 'bold', c.bold)
    if (c.italic !== undefined) setRunFlag(d, c.slideId, c.elementId, 'italic', c.italic)
    if (c.underline !== undefined) setRunFlag(d, c.slideId, c.elementId, 'underline', c.underline)
    if (locked === true) updateElement(d, c.slideId, c.elementId, { locked }) // (locked last, after everything else of the change)
  }))
  ;(r.transitions ?? []).forEach((t, i) => add(`transition:${i}`, (d) => { setTransition(d, t.slideId, t.to) }))
  ;(r.locks ?? []).forEach((l, i) => add(`lock:${i}`, (d) => setSlideLocked(d, l.slideId, l.locked)))
  ;(r.removals ?? []).forEach((id, i) => add(`removal:${i}`, (d) => { const s = findSlide(d, id); if (s && !s.locked) deleteSlide(d, id) }))
  return steps
}

/** Applies one assistant answer as the caller's ONE undo step (all the steps, no checking: see applyAssistVerified for what the assistant panel uses). */
export function applyAssist(d: D, r: AssistChanges) {
  for (const s of assistSteps(r)) s.apply(d)
}

/**
 * A pattern over the slide's background colour (dots, grid, lines, diagonal), or none. On a slide whose background is a gradient or a picture, the pattern goes over
 * the deck's background colour (the slide becomes that colour first, with readable text). `size` = the pattern's spacing (canvas units). Nothing to do records nothing.
 */
/** A slide back to its own designed background (the deck's, or its own brand's): a picture background a designed slide got is taken off, a colour gives way to the theme's; nothing of its own look is kept. */
export function backToDeckBackground(d: D, slideId: string) {
  const s = findSlide(d, slideId)
  if (!s) return
  if (s.background?.type === 'image' && !s.manual && s.content) { clearImageBackground(d, slideId); return }
  setSlideBackground(d, slideId, baseOf(d, s).colors.background)
  delete s.themeOverrides
  delete s.ownLook // back to the deck's own background: nothing of the slide's own look is kept
}

/**
 * Gives other slides the background of one slide ("use it on this section", "on all slides"): through the background commands themselves, so each slide gets the text
 * colours that read on it, exactly as if the background had been chosen there. Locked slides are left alone. Returns how many slides changed.
 */
export function copyBackground(d: D, fromSlideId: string, toSlideIds: readonly string[]): number {
  const from = findSlide(d, fromSlideId)
  if (!from) return 0
  const bg = from.background ? (plain(from.background) as NonNullable<Slide['background']>) : null
  let n = 0
  for (const id of toSlideIds) {
    const s = findSlide(d, id)
    if (!s || s.locked || id === fromSlideId) continue
    const before = JSON.stringify(s.background ?? null)
    if (!bg || !from.ownLook) { if (s.ownLook) backToDeckBackground(d, id) } // (the source shows the deck's own background: so do they)
    else if (bg.type === 'color') { setSlideBackground(d, id, bg.value); if (bg.pattern) setBackgroundPattern(d, id, bg.pattern.kind, bg.pattern.size) }
    else if (bg.type === 'gradient' && bg.gradient) setBackgroundGradient(d, id, bg.gradient.from, bg.gradient.to, bg.gradient.angle, bg.gradient.kind ?? 'linear')
    else if (bg.type === 'image') { setBackgroundPicture(d, id, bg.value); if (bg.blur) setBackgroundBlur(d, id, bg.blur) }
    if (JSON.stringify(s.background ?? null) !== before) n++
  }
  return n
}

export function setBackgroundPattern(d: D, slideId: string, kind: PatternKind | null, size?: number) {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return
  const isColour = s.background?.type === 'color' && /^#[0-9a-f]{6}$/i.test(s.background.value)
  if (!kind) { if (isColour && s.background?.type === 'color' && s.background.pattern) { delete s.background.pattern; s.ownLook = true } return }
  if (!isColour) setSlideBackground(d, slideId, baseOf(d, findSlide(d, slideId)!).colors.background)
  const bg = s.background
  if (bg?.type !== 'color') return
  const next = { ...defaultPattern(kind, bg.value), ...(size !== undefined ? { size: Math.round(Math.min(200, Math.max(16, size))) } : bg.pattern?.kind === kind ? { size: bg.pattern.size } : {}) }
  if (JSON.stringify(bg.pattern) === JSON.stringify(next)) return
  bg.pattern = next
  s.ownLook = true
}

/** Softens the slide's background picture (canvas units; 0 = sharp). Nothing to do (no picture, or already so) records nothing. */
export function setBackgroundBlur(d: D, slideId: string, blur: number) {
  const s = findSlide(d, slideId)
  if (!s || s.locked || s.background?.type !== 'image') return
  const b = Math.round(Math.min(30, Math.max(0, blur)) * 2) / 2
  if ((s.background.blur ?? 0) === b) return
  if (b) s.background.blur = b; else delete s.background.blur
  s.ownLook = true
}

/** A two-colour gradient behind the slide: linear along `angle`, or radial (from the middle out to the corners). */
export function setBackgroundGradient(d: D, slideId: string, from: string, to: string, angle = 135, kind: 'linear' | 'radial' = 'linear') {
  const s = findSlide(d, slideId)
  if (!s) return
  s.background = { type: 'gradient', value: from, gradient: { from, to, angle, ...(kind === 'radial' ? { kind } : {}) } }
  s.ownLook = true
  makeSlideReadable(d, slideId)
}

/** Takes the pictures off a slide: its background picture, and on a hand-made slide the photos placed on it (a designed slide's own frames are its layout). */
export function clearPictures(d: D, slideId: string) {
  const s = findSlide(d, slideId)
  if (!s || s.locked || s.writing) return
  if (s.background?.type === 'image') { if (!s.manual && s.content) clearImageBackground(d, slideId); else { setSlideBackground(d, slideId, baseOf(d, findSlide(d, slideId)!).colors.background); delete s.themeOverrides } }
  if (s.manual || !s.content) s.elements = s.elements.filter((e) => e.type !== 'image' || e.decorative || e.locked) as typeof s.elements
}

/** A slide the assistant adds takes the background colour most of the other slides share (a deck whose slides carry their own colour should not get a plain-theme page at the end). */
export function matchDeckBackground(d: D, slideId: string) {
  const s = findSlide(d, slideId)
  if (!s || s.background?.type !== 'color') return
  const shared = commonSlideBackground(d.slides, slideId)
  if (shared && shared !== s.background.value.toUpperCase()) setSlideBackground(d, slideId, shared)
}

/**
 * What is needed to put one assistant change back, small enough to be saved with the chat (so it still works after the panel was
 * closed or the page reloaded): the design as it was (only if the change touched it), the text of each slide the change rewrote,
 * and the ids of slides it added. Layouts are recomposed from this, never copied.
 */
export interface AssistUndo {
  id: string
  theme: Theme | null
  contents: Record<string, SlideContent>
  /** slides whose background the change set: how each one was (background + its own readable-colour overrides) */
  backgrounds?: Record<string, { background: Slide['background'] | null; themeOverrides: Slide['themeOverrides'] | null; textColors: Record<string, string>; ownLook?: boolean }>
  /** pictures placed on a slide as new elements (floating): their ids and whether the slide was hand-edited before, so the change can be taken back */
  placed?: Record<string, { elementIds: string[]; manual: boolean }>
  /** slides the change deleted, with where they were */
  removed?: { index: number; slide: Slide }[]
  /** the slide order before the change, when it moved slides, and which slides were moved */
  order?: string[]
  moved?: string[]
  /** slides whose lock the change switched: how each one was */
  locks?: Record<string, boolean>
  /** slides whose transition the change set: how each one arrived before (null = it had none of its own) */
  transitions?: Record<string, Transition | null>
  /** slides whose OBJECTS or object animations the change touched (a size, a new shape, a sorted table, an animation): how each one was, so it can be put back whole */
  objects?: Record<string, { elements: Slide['elements']; effects: Slide['effects'] | null; manual: boolean }>
  added: string[]
  /** what the change did, in words (also shown to the model as context) */
  summary: string[]
}

/**
 * The slides that were MOVED between two orders of the same slides: those that are not part of the longest run that kept its relative order
 * (moving one slide to the end moves that one slide, not all the others after it).
 */
export function movedSlideIds(before: string[], after: string[]): string[] {
  const pos = new Map(after.map((id, i) => [id, i]))
  const common = before.filter((id) => pos.has(id)) // the slides in both, in the old order
  const seq = common.map((id) => pos.get(id)!) // where each one is now
  // longest increasing run of new positions = the slides that kept their order relative to each other; the rest were moved
  const tails: number[] = [], tailAt: number[] = [], prev: number[] = new Array(seq.length).fill(-1)
  seq.forEach((v, i) => {
    let lo = 0, hi = tails.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid]! < v) lo = mid + 1; else hi = mid }
    tails[lo] = v; tailAt[lo] = i; prev[i] = lo > 0 ? tailAt[lo - 1]! : -1
  })
  const stay = new Set<number>()
  for (let i = tailAt[tails.length - 1] ?? -1; i >= 0; i = prev[i]!) stay.add(i)
  return common.filter((_, i) => !stay.has(i))
}

/** Records what an assistant answer changed (call with the deck from BEFORE and AFTER applying it). */
/** the slides whose LOOK an answer changes (every kind of background change, a brand on some slides, pictures, readable text): ONE list for the undo record, so a new kind is never left out */
export function lookSlideIds(r: AssistChanges): string[] {
  return [...new Set([
    ...(r.backgrounds ?? []).map((b) => b.slideId), ...(r.gradients ?? []).map((g) => g.slideId), ...(r.blurs ?? []).map((g) => g.slideId), ...(r.patterns ?? []).map((g) => g.slideId),
    ...(r.backgroundCopies ?? []).flatMap((g) => g.slideIds), ...(r.slideBrands ?? []).flatMap((g) => g.slideIds), ...(r.clearPictures ?? []), ...(r.pictures ?? []).map((x) => x.slideId), ...(r.readability ?? []),
  ])]
}

export function snapshotAssist(before: Presentation, after: Presentation, themeChanged: boolean, summary: string[], id: string = newId(), lookIds: string[] = []): AssistUndo {
  const had = new Set(before.slides.map((s) => s.id))
  const contents: Record<string, SlideContent> = {}
  for (const s of before.slides) {
    const now = after.slides.find((x) => x.id === s.id)
    if (s.content && now && JSON.stringify(now.content) !== JSON.stringify(s.content)) contents[s.id] = structuredClone(s.content) as SlideContent
  }
  const backgrounds: NonNullable<AssistUndo['backgrounds']> = {}
  const colorsOf = (sl: Slide) => Object.fromEntries(sl.elements.filter((e) => e.type === 'text').map((e) => [e.id, String((e as TextElement).color)]))
  // slides whose LOOK the change touched (background, own colours, the colour of their text): enough to put each one back
  for (const s of before.slides.filter((x) => lookIds.includes(x.id))) {
    const now = after.slides.find((x) => x.id === s.id)
    if (now && (JSON.stringify(now.background) !== JSON.stringify(s.background) || JSON.stringify(now.themeOverrides) !== JSON.stringify(s.themeOverrides) || JSON.stringify(colorsOf(now)) !== JSON.stringify(colorsOf(s)))) backgrounds[s.id] = { background: structuredClone(s.background ?? null), themeOverrides: structuredClone(s.themeOverrides ?? null), textColors: colorsOf(s), ownLook: !!s.ownLook }
  }
  const placed: NonNullable<AssistUndo['placed']> = {}
  for (const s of before.slides.filter((x) => lookIds.includes(x.id))) {
    const now = after.slides.find((x) => x.id === s.id)
    const had = new Set(s.elements.map((e) => e.id))
    const fresh = now ? now.elements.filter((e) => !had.has(e.id) && e.type === 'image').map((e) => e.id) : []
    if (now && fresh.length && now.layoutId === s.layoutId) placed[s.id] = { elementIds: fresh, manual: !!s.manual }
  }
  const kept = new Set(after.slides.map((s) => s.id))
  const removed = before.slides.flatMap((s, index) => (kept.has(s.id) ? [] : [{ index, slide: structuredClone(s) as Slide }]))
  const moved = movedSlideIds(before.slides.map((x) => x.id), after.slides.map((x) => x.id))
  const locks: Record<string, boolean> = {}
  for (const s of before.slides) { const now = after.slides.find((x) => x.id === s.id); if (now && !!now.locked !== !!s.locked) locks[s.id] = !!s.locked }
  const transitions: Record<string, Transition | null> = {}
  for (const s of before.slides) { const now = after.slides.find((x) => x.id === s.id); if (now && JSON.stringify(now.transition ?? null) !== JSON.stringify(s.transition ?? null)) transitions[s.id] = s.transition ? (structuredClone(s.transition) as Transition) : null }
  // a slide whose objects or object animations changed (and that was not rebuilt from its words or got a picture the placed-pictures undo already knows): the whole object list as it was
  const objects: NonNullable<AssistUndo['objects']> = {}
  for (const s of before.slides) {
    const now = after.slides.find((x) => x.id === s.id)
    if (themeChanged || !now || contents[s.id] || placed[s.id] || backgrounds[s.id]) continue // (a new design recomposes objects: that is undone with the design)
    if (JSON.stringify(now.elements) !== JSON.stringify(s.elements) || JSON.stringify(now.effects ?? null) !== JSON.stringify(s.effects ?? null)) objects[s.id] = { elements: structuredClone(s.elements) as Slide['elements'], effects: s.effects ? (structuredClone(s.effects) as Slide['effects']) : null, manual: !!s.manual }
  }
  return {
    id, ...(Object.keys(objects).length ? { objects } : {}), ...(Object.keys(transitions).length ? { transitions } : {}), ...(Object.keys(placed).length ? { placed } : {}), theme: themeChanged ? (structuredClone(before.theme) as Theme) : null, contents, ...(Object.keys(backgrounds).length ? { backgrounds } : {}),
    ...(removed.length ? { removed } : {}), ...(moved.length ? { order: before.slides.map((s) => s.id), moved } : {}), ...(Object.keys(locks).length ? { locks } : {}),
    added: after.slides.filter((s) => !had.has(s.id)).map((s) => s.id), summary,
  }
}
/** Ids of every slide the change touched (rewritten or added). */
export const undoSlideIds = (u: AssistUndo) => [...new Set([...Object.keys(u.contents), ...Object.keys(u.backgrounds ?? {}), ...Object.keys(u.placed ?? {}), ...Object.keys(u.locks ?? {}), ...Object.keys(u.transitions ?? {}), ...Object.keys(u.objects ?? {}), ...(u.moved ?? []), ...(u.removed ?? []).map((r) => r.slide.id), ...u.added])]

/** Puts back (all of, or part of) an assistant change. Slides first (added ones are removed), then the design so everything is recomposed together. */
export function revertAssist(d: D, undo: AssistUndo, part: 'all' | 'theme' | 'slide', slideId?: string) {
  const ids = part === 'theme' ? [] : part === 'slide' ? (slideId ? [slideId] : []) : undoSlideIds(undo)
  // deleted slides come back where they were, then the old order and locks are restored
  for (const r of [...(undo.removed ?? [])].sort((a, b) => a.index - b.index)) if (ids.includes(r.slide.id) && !d.slides.some((s) => s.id === r.slide.id)) d.slides.splice(Math.min(r.index, d.slides.length), 0, structuredClone(r.slide) as Draft<Slide>)
  if (undo.order && (part === 'all' || (part === 'slide' && !!slideId && !!undo.moved?.includes(slideId)))) {
    const rank = new Map(undo.order.map((id, i) => [id, i]))
    let last = -1
    const keyed = d.slides.map((s) => { const k = rank.get(s.id); last = k ?? last + 0.001; return { s, k: k ?? last } })
    d.slides.splice(0, d.slides.length, ...keyed.sort((a, b) => a.k - b.k).map((x) => x.s))
  }
  for (const [id, locked] of Object.entries(undo.locks ?? {})) if (ids.includes(id)) setSlideLocked(d, id, locked)
  for (const [id, was] of Object.entries(undo.objects ?? {})) {
    const s = ids.includes(id) ? d.slides.find((x) => x.id === id) : undefined
    if (!s || s.locked) continue
    s.elements = structuredClone(was.elements) as typeof s.elements
    if (was.effects) s.effects = structuredClone(was.effects) as typeof s.effects; else delete s.effects
    if (was.manual) s.manual = true; else delete s.manual
  }
  for (const [id, was] of Object.entries(undo.transitions ?? {})) { const s = ids.includes(id) ? d.slides.find((x) => x.id === id) : undefined; if (s && !s.locked) { if (was) s.transition = structuredClone(was) as typeof s.transition; else delete s.transition } }
  for (const id of ids) {
    if (undo.removed?.some((r) => r.slide.id === id) || (undo.locks && id in undo.locks && !undo.contents[id] && !undo.backgrounds?.[id]) || (undo.transitions && id in undo.transitions && !undo.contents[id] && !undo.backgrounds?.[id] && !undo.placed?.[id]) || (undo.objects && id in undo.objects && !undo.contents[id] && !undo.backgrounds?.[id] && !undo.placed?.[id])) continue
    if (undo.added.includes(id)) { const i = d.slides.findIndex((s) => s.id === id); if (i >= 0 && !d.slides[i]!.locked) d.slides.splice(i, 1); continue }
    const put = undo.placed?.[id]
    const target = put ? d.slides.find((x) => x.id === id) : undefined
    if (put && target && !target.locked) { target.elements = target.elements.filter((e) => !put.elementIds.includes(e.id)) as typeof target.elements; if (put.manual) target.manual = true; else delete target.manual }
    const old = undo.contents[id]
    if (old) {
      // a change that moved the slide to another layout (a picture "beside the text" turns a text slide into picture + text) is put back to that layout first
      const cur = d.slides.find((x) => x.id === id)
      if (cur && !cur.locked && cur.layoutId !== old.layout) cur.layoutId = old.layout as typeof cur.layoutId
      replaceContent(d, id, old)
    }
    const bg = undo.backgrounds?.[id]
    const slide = bg ? d.slides.find((x) => x.id === id) : undefined
    if (bg && slide && !slide.locked && slide.background?.type === 'image' && bg.background?.type !== 'image' && !slide.manual && slide.content) clearImageBackground(d, id) // a picture background re-laid the slide out: undo that first
    if (bg && slide && !slide.locked) { if (bg.background) slide.background = structuredClone(bg.background); else delete slide.background; if (bg.themeOverrides) slide.themeOverrides = structuredClone(bg.themeOverrides); else delete slide.themeOverrides; if (bg.ownLook) slide.ownLook = true; else delete slide.ownLook; for (const e of slide.elements) if (e.type === 'text' && bg.textColors[e.id] !== undefined) (e as TextElement).color = bg.textColors[e.id] as TextElement['color'] }
  }
  if ((part === 'theme' || part === 'all') && undo.theme) applyThemeObject(d, structuredClone(undo.theme))
}

/** Per-deck typography override (token values stay; only font families change). */
export function setFonts(d: D, fonts: { heading: string; body: string }) {
  d.theme.fonts = fonts
}

/** Layouts whose content converts losslessly (enough) into each other. */
export function compatibleLayouts(content: SlideContent | undefined): LayoutId[] {
  if (!content) return []
  switch (content.layout) {
    case 'title': case 'section-divider': case 'thank-you': return ['title', 'section-divider', 'thank-you']
    case 'title-body': case 'split-image-text': return ['title-body', 'split-image-text']
    case 'process': case 'timeline': return ['process', 'timeline']
    default: return [content.layout]
  }
}

export function convertContent(c: SlideContent, to: LayoutId): SlideContent | null {
  if (c.layout === to) return c
  const base = { speakerNotes: c.speakerNotes, sources: c.sources }
  if ((c.layout === 'title' || c.layout === 'section-divider' || c.layout === 'thank-you') && (to === 'title' || to === 'section-divider' || to === 'thank-you')) return { ...c, layout: to } as SlideContent
  if (c.layout === 'title-body' && to === 'split-image-text') return { layout: 'split-image-text', title: c.title, bullets: c.bullets.slice(0, 5), imagePrompt: `Illustration for: ${c.title}`.slice(0, 300), imageAlt: c.title.slice(0, 200), ...base }
  if (c.layout === 'split-image-text' && to === 'title-body') return { layout: 'title-body', title: c.title, bullets: c.bullets, ...base }
  if ((c.layout === 'process' && to === 'timeline') || (c.layout === 'timeline' && to === 'process')) return { ...c, layout: to } as SlideContent
  return null
}

/** Swap to another design for the same content. Resets manual edits on that slide (the user chose a new design). */
export function relayout(d: D, slideId: string, to: LayoutId) {
  const s = findSlide(d, slideId)
  if (!s?.content) return
  const converted = convertContent(s.content as SlideContent, to)
  if (!converted) return
  const look = ownLookOf(s)
  const fresh = composeSlide(converted, baseOf(d, s), d.aspectRatio)
  s.layoutId = fresh.layoutId
  s.content = fresh.content
  swapElements(s, fresh.elements)
  s.background = fresh.background
  s.manual = false
  reapplyOwnLook(d, s, look)
}

/** Apply AI-edited content (already validated server-side) through the layout engine. */
export function replaceContent(d: D, slideId: string, content: SlideContent, allowLayoutChange = false) {
  const s = findSlide(d, slideId)
  if (!s || s.locked || (content.layout !== s.layoutId && !allowLayoutChange)) return
  const look = ownLookOf(s)
  const fresh = composeSlide(content, baseOf(d, s), d.aspectRatio, undefined, { backgroundImage: photoOf(s), photo: slidePhoto(s), keepPhoto: true })
  s.layoutId = fresh.layoutId
  s.content = fresh.content
  swapElements(s, fresh.elements)
  s.background = fresh.background
  if (!s.transition?.own) s.transition = fresh.transition as Draft<Slide>['transition']
  if (content.speakerNotes) s.speakerNotes = content.speakerNotes
  s.manual = false
  reapplyOwnLook(d, s, look)
}

// ─── pictures ────────────────────────────────────────────────────────────────

export type ImagePlacement = 'background' | 'beside' | 'replace' | 'floating'
export interface PlacedImage { url: string; alt: string; prompt: string }

/** Where a picture can go on this slide (card layouts can't take a full background; text-only layouts can become picture+text). */
export function imagePlacements(slide: Slide, selectedImageId?: string | null): { id: ImagePlacement; label: string; hint: string }[] {
  const out: { id: ImagePlacement; label: string; hint: string }[] = []
  if (selectedImageId && slide.elements.some((e) => e.id === selectedImageId && e.type === 'image')) out.push({ id: 'replace', label: 'Replace the selected picture', hint: 'Fills the picture frame you selected' })
  out.push({ id: 'background', label: 'Full-slide background', hint: slide.manual || !slide.content || !(IMAGE_BG_LAYOUTS as readonly string[]).includes(slide.layoutId) ? 'Behind everything on the slide; the text colours adjust to stay readable' : 'Dark overlay keeps the text readable' })
  if (!slide.manual && slide.content && compatibleLayouts(slide.content as SlideContent).includes('split-image-text')) out.push({ id: 'beside', label: 'Picture beside the text', hint: slide.layoutId === 'split-image-text' ? 'Fills this slide’s picture frame' : 'Switches this slide to the picture + text layout' })
  out.push({ id: 'floating', label: 'Free-floating picture', hint: 'Placed in the middle — move and resize it yourself' })
  return out
}

export function setImageBackground(d: D, slideId: string, url: string) {
  const s = findSlide(d, slideId)
  if (!s || s.locked || s.manual || !s.content || !(IMAGE_BG_LAYOUTS as readonly string[]).includes(s.layoutId)) return
  const fresh = composeSlide(s.content as SlideContent, baseOf(d, s), d.aspectRatio, undefined, { backgroundImage: url })
  swapElements(s, fresh.elements)
  s.background = fresh.background
}

/** A picture behind the whole slide. Designed slides use their picture layout (with the dark wash that keeps text readable); any other slide gets the picture straight behind its elements. Used by the toolbar, the media library, the AI image proposals and the assistant. */
export function setBackgroundPicture(d: D, slideId: string, url: string) {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return
  if (!s.manual && s.content && (IMAGE_BG_LAYOUTS as readonly string[]).includes(s.layoutId)) { setImageBackground(d, slideId, url); return }
  s.background = { type: 'image', value: url }
  s.ownLook = true
  makeSlideReadable(d, slideId)
}

/** A free photo on one slide, where the person asked: behind it, next to the text (text layouts only, else it floats), or floating on it. */
export function placePhoto(d: D, slideId: string, placement: 'background' | 'beside' | 'floating', img: PlacedImage) {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return
  if (placement === 'background') return setBackgroundPicture(d, slideId, img.url)
  if (placement === 'beside' && !s.manual && s.content && compatibleLayouts(s.content as SlideContent).includes('split-image-text')) return placeImageBeside(d, slideId, img)
  insertImageElement(d, slideId, img)
}

export function clearImageBackground(d: D, slideId: string) {
  const s = findSlide(d, slideId)
  if (!s || s.background?.type !== 'image' || !s.content) return
  const fresh = composeSlide(s.content as SlideContent, baseOf(d, s), d.aspectRatio)
  swapElements(s, fresh.elements)
  s.background = fresh.background
  delete s.ownLook // the person took the picture away: the layout's own background is back
}

/** Picture + text layout with the picture filled in; the URL lives in the slide CONTENT so theme changes keep it. */
export function placeImageBeside(d: D, slideId: string, img: PlacedImage) {
  const s = findSlide(d, slideId)
  if (!s || s.locked || s.manual || !s.content) return
  const converted = convertContent(s.content as SlideContent, 'split-image-text')
  if (!converted || converted.layout !== 'split-image-text') return
  const content = { ...converted, imageUrl: img.url, imageAlt: img.alt.slice(0, 200) || converted.imageAlt, imagePrompt: img.prompt.slice(0, 300) || converted.imagePrompt }
  const look = ownLookOf(s)
  const fresh = composeSlide(content, baseOf(d, s), d.aspectRatio)
  s.layoutId = fresh.layoutId
  s.content = fresh.content
  swapElements(s, fresh.elements)
  s.background = fresh.background
  s.manual = false
  reapplyOwnLook(d, s, look)
}

/**
 * Crops a picture to a rectangle (fractions of the whole picture) and gives the frame the cut-out's shape, so nothing is stretched: the frame keeps its width and its middle (and stays inside the slide).
 * `sourceAspect` is the whole picture's width ÷ height. No crop (or the whole picture) takes the crop off and gives the frame the whole picture's shape back. One undo step. Locked pictures and slides are refused.
 */
export function setPictureCrop(d: D, slideId: string, elId: string, crop: Rect | null, sourceAspect: number): boolean {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (!s || !e || e.type !== 'image' || e.locked || s.locked || !(sourceAspect > 0)) return false
  const whole = !crop || (crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999)
  if (whole && !e.crop) return false
  const frame = frameForCrop(e, whole ? { x: 0, y: 0, w: 1, h: 1 } : crop!, sourceAspect, CANVAS[d.aspectRatio])
  Object.assign(e, frame)
  if (whole) delete e.crop; else { e.crop = { x: crop!.x, y: crop!.y, w: crop!.w, h: crop!.h }; delete e.zoom; delete e.focus } // (zoom and position are not used on a cropped picture)
  touch(s)
  return true
}

/** Fill an existing picture frame (placeholder or previous picture). On composed picture+text slides the content is updated too. */
export function setImageElementSrc(d: D, slideId: string, elId: string, img: PlacedImage) {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (!s || !e || e.type !== 'image' || s.locked || e.locked) return
  if (!s.manual && s.content && s.content.layout === 'split-image-text') {
    replaceContent(d, slideId, { ...(s.content as Extract<SlideContent, { layout: 'split-image-text' }>), imageUrl: img.url, imageAlt: img.alt.slice(0, 200) || s.content.imageAlt, imagePrompt: img.prompt.slice(0, 300) || s.content.imagePrompt })
    return
  }
  e.src = img.url
  e.alt = img.alt.slice(0, 300) || e.alt
  e.prompt = img.prompt.slice(0, 500)
  touch(s)
}

/** The template picture (one piece of the template's artwork, wherever it is used) that this element of this slide is, or null when it is an ordinary picture. */
export function templateSlotOf(d: D | Presentation, slideId: string, elementId: string) {
  const slide = d.slides.find((s) => s.id === slideId)
  const content = slide?.content
  if (content?.layout !== 'morph-template') return null
  const tpl = getMorphTemplate(content.template)
  return tpl ? pictureSlots(tpl).find((sl) => sl.uses.some((u) => u.scene === content.scene && u.id === elementId)) ?? null : null
}

/** Puts a new picture where one is: a picture of a Morph template on every slide it is on (the Morph moves that one picture), any other picture only on its own slide. */
export function swapPicture(d: D, slideId: string, elementId: string, img: { url: string; alt: string; fit?: 'cover' | 'contain' }) {
  const slot = templateSlotOf(d, slideId, elementId)
  if (slot) { replaceTemplatePicture(d, slot.uses, img); return }
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elementId)
  if (!s || !e || e.type !== 'image' || s.locked) return
  e.src = img.url
  e.alt = img.alt.slice(0, 300) || e.alt
  e.fit = img.fit ?? e.fit
  touch(s)
}

/** A plain copy of a slide's content (drafts cannot be handed to the composer). */
const plainContent = (c: unknown) => JSON.parse(JSON.stringify(isDraft(c) ? current(c as never) : c))

/**
 * A picture of a Morph template deck: one piece of the template's artwork, wherever it is used (`uses`: the scene and object of each place, the hidden copies parked off the slide too, so the
 * Morph never brings the old picture back in). It is replaced on EVERY scene at once; the scenes remember it too, so a later re-compose keeps the person's picture. Returns how many scenes
 * changed. Locked slides keep theirs.
 */
export function replaceTemplatePicture(d: D, uses: { scene: string; id: string }[], img: { url: string; alt: string; fit?: 'cover' | 'contain'; attribution?: { source: string; license: string; url?: string } }): number {
  let n = 0
  for (const s of d.slides) {
    if (s.locked || s.content?.layout !== 'morph-template') continue
    const sceneId = s.content.scene
    const ids = new Set(uses.filter((u) => u.scene === sceneId).map((u) => u.id))
    if (ids.size === 0) continue
    // how the template itself places a person's picture in this spot (a rounded frame, a margin round a replaced icon): used unless the person has moved or resized the picture
    const tpl = getMorphTemplate(s.content.template)
    const mine = Object.fromEntries([...ids].map((id) => [id, { url: img.url, alt: img.alt.slice(0, 200) }]))
    const plain = tpl ? composeTemplateScene(tpl, { ...(plainContent(s.content)), images: {} } as never).elements : []
    const placed = tpl ? composeTemplateScene(tpl, { ...(plainContent(s.content)), images: mine } as never).elements : []
    const near = (a: number, b: number) => Math.abs(a - b) <= 1
    for (const e of s.elements) {
      if (e.type !== 'image' || !ids.has(e.id)) continue
      e.src = img.url
      e.alt = img.alt.slice(0, 300) || e.alt
      e.fit = img.fit ?? 'cover'
      if (img.attribution) e.attribution = img.attribution; else delete (e as { attribution?: unknown }).attribution
      const was = plain.find((x) => x.id === e.id), now = placed.find((x) => x.id === e.id)
      if (now?.type === 'image') {
        e.radius = now.radius; e.clip = now.clip
        if (was && near(e.x, was.x) && near(e.y, was.y) && near(e.width, was.width) && near(e.height, was.height) && near(e.rotation, was.rotation)) { e.x = now.x; e.y = now.y; e.width = now.width; e.height = now.height; e.rotation = now.rotation }
      }
    }
    s.content.images = { ...s.content.images, ...Object.fromEntries([...ids].map((id) => [id, { url: img.url, alt: img.alt.slice(0, 200), ...(img.attribution ? { attribution: img.attribution } : {}) }])) }
    touch(s)
    n++
  }
  return n
}

/** A free-floating 4:3 picture in the middle of the slide (about 45 % of the width). Returns the new element id. */
export function insertImageElement(d: D, slideId: string, img: PlacedImage, gen: IdGen = newId): string | null {
  const s = findSlide(d, slideId)
  if (!s || s.locked) return null
  const { width: W, height: H } = CANVAS[d.aspectRatio]
  const w = Math.round(W * 0.45)
  const h = Math.min(Math.round((w * 3) / 4), Math.round(H * 0.7))
  const id = gen()
  addElement(d, slideId, makeElement({ type: 'image', id, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), width: w, height: h, rotation: 0, locked: false, zIndex: 1, opacity: 1, src: img.url, alt: img.alt.slice(0, 300) || 'Image', fit: 'cover', prompt: img.prompt.slice(0, 500) }))
  return id
}

// ─── geometry helpers (pure, no draft) ────────────────────────────────────────

export interface Box { x: number; y: number; width: number; height: number }
export interface Guide { axis: 'x' | 'y'; at: number }

/**
 * Snap a moving box to slide edges/centre and to other elements' edges/centres. Returns the adjusted position and the
 * guide lines to draw. Threshold is in canvas units (≈8px at typical zoom).
 */
export function snap(moving: Box, others: Box[], aspect: AspectRatio, threshold = 10): { x: number; y: number; guides: Guide[] } {
  const { width: W, height: H } = CANVAS[aspect]
  const xs = [0, W / 2, W, ...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width])]
  const ys = [0, H / 2, H, ...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height])]
  const best = (edges: number[], targets: number[]) => {
    let pick: { delta: number; at: number } | null = null
    for (const e of edges) for (const t of targets) {
      const delta = t - e
      if (Math.abs(delta) <= threshold && (!pick || Math.abs(delta) < Math.abs(pick.delta))) pick = { delta, at: t }
    }
    return pick
  }
  const sx = best([moving.x, moving.x + moving.width / 2, moving.x + moving.width], xs)
  const sy = best([moving.y, moving.y + moving.height / 2, moving.y + moving.height], ys)
  return { x: moving.x + (sx?.delta ?? 0), y: moving.y + (sy?.delta ?? 0), guides: [...(sx ? [{ axis: 'x' as const, at: sx.at }] : []), ...(sy ? [{ axis: 'y' as const, at: sy.at }] : [])] }
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export function resizeBox(b: Box, handle: Handle, dx: number, dy: number, min = 24): Box {
  let { x, y, width, height } = b
  if (handle.includes('e')) width = Math.max(min, b.width + dx)
  if (handle.includes('s')) height = Math.max(min, b.height + dy)
  if (handle.includes('w')) { width = Math.max(min, b.width - dx); x = b.x + (b.width - width) }
  if (handle.includes('n')) { height = Math.max(min, b.height - dy); y = b.y + (b.height - height) }
  return { x, y, width, height }
}
