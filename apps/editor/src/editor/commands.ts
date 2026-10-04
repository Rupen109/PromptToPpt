import { current, isDraft, type Draft } from 'immer'
import { IMAGE_BG_LAYOUTS, PHOTO_LAYOUTS, composeSlide, getTheme, makeColors } from '@prompttoppt/theme'
import { CANVAS, elementSchema, type AspectRatio, type LayoutId, type Presentation, type Slide, type SlideContent, type SlideElement, type TextElement, type Theme } from '@prompttoppt/validation'

/**
 * Document commands: small PURE mutators over an immer draft. The store turns each call into patches + inverse patches,
 * which is what makes undo/redo exact (spec §9: command/diff based, never a reload). IDs are injected for testability.
 */
export type D = Draft<Presentation>
export type IdGen = () => string
export const newId: IdGen = () => globalThis.crypto.randomUUID()

/** structuredClone throws on immer draft proxies — unwrap first. */
const plain = <T>(x: T): T => structuredClone(isDraft(x) ? (current(x as Draft<T>) as T) : x)

const findSlide = (d: D, slideId: string) => d.slides.find((s) => s.id === slideId)
const findEl = (s: Draft<Slide>, elId: string) => s.elements.find((e) => e.id === elId)

/** Build a new element through the schema so every default (opacity, bullet glyph, …) is filled in one place. */
export const makeElement = (partial: Record<string, unknown>): SlideElement => elementSchema.parse(partial)

// ─── elements ────────────────────────────────────────────────────────────────

/** Hand-editing marks the slide `manual`, so later theme/layout swaps preserve the user's work instead of recomposing it. */
const touch = (s: Draft<Slide>) => {
  s.manual = true
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
const slidePhoto = (s: Draft<Slide> | Slide) => {
  if (!(PHOTO_LAYOUTS as readonly string[]).includes(s.layoutId)) return undefined
  const im = s.elements.find((e) => e.type === 'image' && e.src)
  return im && im.type === 'image' && im.src ? { src: im.src, alt: im.alt } : undefined
}

const topZ = (s: Draft<Slide> | Slide) => s.elements.reduce((m, e) => Math.max(m, e.zIndex), 0)

export function addElement(d: D, slideId: string, element: SlideElement) {
  const s = findSlide(d, slideId)
  if (!s) return
  s.elements.push({ ...element, zIndex: topZ(s) + 1 })
  touch(s)
}

/** Clones elements with fresh IDs, nudged so the copy is visible. Returns the new ids. */
export function duplicateElements(d: D, slideId: string, ids: string[], gen: IdGen = newId): string[] {
  const s = findSlide(d, slideId)
  if (!s) return []
  const out: string[] = []
  for (const e of s.elements.filter((x) => ids.includes(x.id))) {
    const id = gen()
    s.elements.push({ ...plain(e), id, x: e.x + 32, y: e.y + 32, locked: false, zIndex: topZ(s) + 1 })
    out.push(id)
  }
  if (out.length) touch(s)
  return out
}

export function pasteElements(d: D, slideId: string, elements: SlideElement[], gen: IdGen = newId): string[] {
  const s = findSlide(d, slideId)
  if (!s) return []
  const out: string[] = []
  for (const e of elements) {
    const id = gen()
    s.elements.push({ ...plain(e), id, x: e.x + 32, y: e.y + 32, locked: false, zIndex: topZ(s) + 1 })
    out.push(id)
  }
  if (out.length) touch(s)
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

export function addSlideAt(d: D, index: number, slide: Slide) {
  d.slides.splice(Math.max(0, Math.min(index, d.slides.length)), 0, slide as Draft<Slide>)
}

export function duplicateSlide(d: D, slideId: string, gen: IdGen = newId): string | null {
  const i = d.slides.findIndex((s) => s.id === slideId)
  if (i < 0) return null
  const copy = plain(d.slides[i]!) as Slide
  copy.id = gen()
  copy.locked = false
  copy.elements = copy.elements.map((e) => ({ ...e, id: gen() }))
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
  s.background = { type: 'color', value }
  touch(s)
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

/** Swaps the deck's whole design (colours, fonts, style kit, motion) and re-composes every slide that wasn't hand-edited. */
export function applyThemeObject(d: D, next: Theme) {
  const old = d.theme as Theme
  d.theme = next as Draft<Theme>
  const aspect = d.aspectRatio
  for (const s of d.slides) {
    if (!s.manual && s.content) {
      const fresh = composeSlide(s.content as SlideContent, next, aspect, undefined, { backgroundImage: photoOf(s), photo: slidePhoto(s) })
      s.elements = fresh.elements as Draft<Slide>['elements']
      s.background = fresh.background
      s.transition = fresh.transition as Draft<Slide>['transition']
    } else if (s.background?.type === 'color') {
      const k = colorKey(old, s.background.value)
      if (k) s.background = { type: 'color', value: next.colors[k] }
    }
  }
}

/** One AI-assistant answer = one undo step: optional new theme, then validated slide rewrites (already checked server-side). */
/** The deck remembers sources attached in chat. Applied as its own step BEFORE the edit, so undoing an AI edit does not make the deck forget its document. */
export function addSources(d: D, list: { id: string; type: 'pdf' | 'url' | 'text'; title: string; url?: string }[]) {
  for (const src of list) if (!d.sources.some((x) => x.id === src.id)) d.sources.push(src)
}

export function applyAssist(d: D, r: { theme: Theme | null; edits: { slideId: string; content: SlideContent }[]; sources?: { id: string; type: 'pdf' | 'url' | 'text'; title: string; url?: string }[] | undefined }) {
  if (r.theme) applyThemeObject(d, r.theme)
  for (const e of r.edits) replaceContent(d, e.slideId, e.content)
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
  const fresh = composeSlide(converted, d.theme as Theme, d.aspectRatio)
  s.layoutId = fresh.layoutId
  s.content = fresh.content
  s.elements = fresh.elements as Draft<Slide>['elements']
  s.background = fresh.background
  s.manual = false
}

/** Apply AI-edited content (already validated server-side) through the layout engine. */
export function replaceContent(d: D, slideId: string, content: SlideContent) {
  const s = findSlide(d, slideId)
  if (!s || s.locked || content.layout !== s.layoutId) return
  const fresh = composeSlide(content, d.theme as Theme, d.aspectRatio, undefined, { backgroundImage: photoOf(s), photo: slidePhoto(s) })
  s.content = fresh.content
  s.elements = fresh.elements as Draft<Slide>['elements']
  s.background = fresh.background
  s.transition = fresh.transition as Draft<Slide>['transition']
  if (content.speakerNotes) s.speakerNotes = content.speakerNotes
  s.manual = false
}

// ─── pictures ────────────────────────────────────────────────────────────────

export type ImagePlacement = 'background' | 'beside' | 'replace' | 'floating'
export interface PlacedImage { url: string; alt: string; prompt: string }

/** Where a picture can go on this slide (card layouts can't take a full background; text-only layouts can become picture+text). */
export function imagePlacements(slide: Slide, selectedImageId?: string | null): { id: ImagePlacement; label: string; hint: string }[] {
  const out: { id: ImagePlacement; label: string; hint: string }[] = []
  if (selectedImageId && slide.elements.some((e) => e.id === selectedImageId && e.type === 'image')) out.push({ id: 'replace', label: 'Replace the selected picture', hint: 'Fills the picture frame you selected' })
  if (!slide.manual && slide.content && (IMAGE_BG_LAYOUTS as readonly string[]).includes(slide.layoutId)) out.push({ id: 'background', label: 'Full-slide background', hint: 'Dark overlay keeps the text readable' })
  if (!slide.manual && slide.content && compatibleLayouts(slide.content as SlideContent).includes('split-image-text')) out.push({ id: 'beside', label: 'Picture beside the text', hint: slide.layoutId === 'split-image-text' ? 'Fills this slide’s picture frame' : 'Switches this slide to the picture + text layout' })
  out.push({ id: 'floating', label: 'Free-floating picture', hint: 'Placed in the middle — move and resize it yourself' })
  return out
}

export function setImageBackground(d: D, slideId: string, url: string) {
  const s = findSlide(d, slideId)
  if (!s || s.locked || s.manual || !s.content || !(IMAGE_BG_LAYOUTS as readonly string[]).includes(s.layoutId)) return
  const fresh = composeSlide(s.content as SlideContent, d.theme as Theme, d.aspectRatio, undefined, { backgroundImage: url })
  s.elements = fresh.elements as Draft<Slide>['elements']
  s.background = fresh.background
}

export function clearImageBackground(d: D, slideId: string) {
  const s = findSlide(d, slideId)
  if (!s || s.background?.type !== 'image' || !s.content) return
  const fresh = composeSlide(s.content as SlideContent, d.theme as Theme, d.aspectRatio)
  s.elements = fresh.elements as Draft<Slide>['elements']
  s.background = fresh.background
}

/** Picture + text layout with the picture filled in; the URL lives in the slide CONTENT so theme changes keep it. */
export function placeImageBeside(d: D, slideId: string, img: PlacedImage) {
  const s = findSlide(d, slideId)
  if (!s || s.locked || s.manual || !s.content) return
  const converted = convertContent(s.content as SlideContent, 'split-image-text')
  if (!converted || converted.layout !== 'split-image-text') return
  const content = { ...converted, imageUrl: img.url, imageAlt: img.alt.slice(0, 200) || converted.imageAlt, imagePrompt: img.prompt.slice(0, 300) || converted.imagePrompt }
  const fresh = composeSlide(content, d.theme as Theme, d.aspectRatio)
  s.layoutId = fresh.layoutId
  s.content = fresh.content
  s.elements = fresh.elements as Draft<Slide>['elements']
  s.background = fresh.background
  s.manual = false
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
