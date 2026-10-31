import { current, isDraft, type Draft } from 'immer'
import { IMAGE_BG_LAYOUTS, PHOTO_LAYOUTS, applyBrandToTheme, brandLogoElements, composeSlide, contrastRatio, effectiveBackground, isDark, mix, readableOn, resolveColor, designById, getTheme, makeColors, recolor } from '@prompttoppt/theme'
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
    const { list: _gone, ...rest } = out
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

/** Turns bold / italic / underline on or off for every run of a text box (the toolbar acts on the whole box). */
export function setRunFlag(d: D, slideId: string, elId: string, flag: 'bold' | 'italic' | 'underline', on: boolean) {
  const s = findSlide(d, slideId)
  const e = s && findEl(s, elId)
  if (!s || !e || e.type !== 'text' || e.locked) return
  for (const p of e.paragraphs) for (const r of p.runs) {
    if (on || flag === 'bold') r[flag] = on // bold:false is kept — it overrides the weight a heading style gives
    else delete r[flag]
  }
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
  // text colours are theme tokens: on a hand-picked colour the deck's normal text can vanish (dark text on navy), so this one slide gets readable colours of its own
  const isHexColour = /^#[0-9a-f]{6}$/i.test(value)
  const light = isDark(value)
  const overrides: Record<string, string> = { ...s.themeOverrides }
  const setOrClear = (key: string, fix: string | null) => { if (fix) overrides[key] = fix; else delete overrides[key] }
  for (const [key, fallback] of [['textPrimary', light ? '#FFFFFF' : '#111827'], ['textSecondary', light ? '#D6D6E0' : '#4B5563']] as const) {
    setOrClear(key, isHexColour && contrastRatio(d.theme.colors[key], value) < 4.5 ? fallback : null)
  }
  // brand colours also draw text (kickers, numbers) and panels: move them toward white/black only as far as needed, and keep the text ON them readable
  let moved = false
  for (const key of ['primary', 'accent'] as const) {
    const base = d.theme.colors[key]
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
  touch(s)
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
  const theme = d.theme as Theme
  const colors = { ...theme.colors, ...(s.themeOverrides ?? {}) }
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
      const fresh = composeSlide(s.content as SlideContent, next, aspect, undefined, { backgroundImage: photoOf(s), photo: slidePhoto(s) })
      s.elements = fresh.elements as Draft<Slide>['elements']
      s.background = fresh.background
      s.transition = fresh.transition as Draft<Slide>['transition']
    } else {
      if (s.background?.type === 'color') {
        const k = colorKey(old, s.background.value)
        if (k) s.background = { type: 'color', value: next.colors[k] }
      }
      // A hand-edited slide is never redrawn from its content, so its logo is swapped directly: the old one (and plate) out, the new one in.
      s.elements = s.elements.filter((e) => !e.brand) as Draft<Slide>['elements']
      if (next.brand?.logo) {
        const top = s.elements.reduce((m, e) => Math.max(m, e.zIndex), 0)
        const dark = s.background?.type === 'image' || isDark((s.background?.value as string | undefined) ?? next.colors.background)
        brandLogoElements(next, aspect, dark, newId).forEach((e, i) => s.elements.push({ ...e, zIndex: top + 1 + i } as Draft<Slide>['elements'][number]))
      }
    }
  }
}

/** A brand to apply: what "use my brand" found on a website, or a saved brand kit. */
export interface BrandProfileLike {
  name: string | null
  colors: { primary: string | null; accent: string | null }
  fonts: { heading: { family: string } | null; body: { family: string } | null }
  logo: { url: string; aspect: number } | null
}

/** Applies the chosen parts of a brand to the whole deck in one step: colours (mode and layout stay), fonts, and the logo on every slide. */
export function applyBrand(d: D, brand: BrandProfileLike, pick: { colors: boolean; fonts: boolean; logo: boolean }) {
  applyThemeObject(d, applyBrandToTheme(structuredClone(plain(d.theme)) as Theme, { primary: brand.colors.primary, accent: brand.colors.accent, headingFont: brand.fonts.heading?.family, bodyFont: brand.fonts.body?.family, name: brand.name, logo: brand.logo }, pick))
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
  const { brand: _gone, ...rest } = plain(d.theme) as Theme
  applyThemeObject(d, rest as Theme, { keepBrand: false })
}

/** One AI-assistant answer = one undo step: optional new theme, then validated slide rewrites (already checked server-side). */
/** The deck remembers sources attached in chat. Applied as its own step BEFORE the edit, so undoing an AI edit does not make the deck forget its document. */
export function addSources(d: D, list: { id: string; type: 'pdf' | 'url' | 'text'; title: string; url?: string }[]) {
  for (const src of list) if (!d.sources.some((x) => x.id === src.id)) d.sources.push(src)
}

export function applyAssist(d: D, r: { theme: Theme | null; backgrounds?: { slideId: string; color: string }[] | undefined; readability?: string[] | undefined; edits: { slideId: string; content: SlideContent }[]; additions?: { afterSlideId: string | null; content: SlideContent }[] | undefined; sources?: { id: string; type: 'pdf' | 'url' | 'text'; title: string; url?: string }[] | undefined }) {
  if (r.theme) applyThemeObject(d, r.theme)
  for (const e of r.edits) replaceContent(d, e.slideId, e.content)
  for (const b of r.backgrounds ?? []) setSlideBackground(d, b.slideId, b.color)
  for (const id of r.readability ?? []) makeSlideReadable(d, id)
  for (const a of r.additions ?? []) {
    const at = a.afterSlideId ? d.slides.findIndex((s) => s.id === a.afterSlideId) : -1
    const slide: Slide = { id: newId(), locked: false, validation: { status: 'pending', issues: [] }, ...composeSlide(a.content, d.theme as Theme, d.aspectRatio, newId) }
    addSlideAt(d, at >= 0 ? at + 1 : d.slides.length, slide)
  }
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
  backgrounds?: Record<string, { background: Slide['background'] | null; themeOverrides: Slide['themeOverrides'] | null; textColors: Record<string, string> }>
  added: string[]
  /** what the change did, in words (also shown to the model as context) */
  summary: string[]
}

/** Records what an assistant answer changed (call with the deck from BEFORE and AFTER applying it). */
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
    if (now && (JSON.stringify(now.background) !== JSON.stringify(s.background) || JSON.stringify(now.themeOverrides) !== JSON.stringify(s.themeOverrides) || JSON.stringify(colorsOf(now)) !== JSON.stringify(colorsOf(s)))) backgrounds[s.id] = { background: structuredClone(s.background ?? null), themeOverrides: structuredClone(s.themeOverrides ?? null), textColors: colorsOf(s) }
  }
  return { id, theme: themeChanged ? (structuredClone(before.theme) as Theme) : null, contents, ...(Object.keys(backgrounds).length ? { backgrounds } : {}), added: after.slides.filter((s) => !had.has(s.id)).map((s) => s.id), summary }
}
/** Ids of every slide the change touched (rewritten or added). */
export const undoSlideIds = (u: AssistUndo) => [...new Set([...Object.keys(u.contents), ...Object.keys(u.backgrounds ?? {}), ...u.added])]

/** Puts back (all of, or part of) an assistant change. Slides first (added ones are removed), then the design so everything is recomposed together. */
export function revertAssist(d: D, undo: AssistUndo, part: 'all' | 'theme' | 'slide', slideId?: string) {
  const ids = part === 'theme' ? [] : part === 'slide' ? (slideId ? [slideId] : []) : undoSlideIds(undo)
  for (const id of ids) {
    if (undo.added.includes(id)) { const i = d.slides.findIndex((s) => s.id === id); if (i >= 0 && !d.slides[i]!.locked) d.slides.splice(i, 1); continue }
    const old = undo.contents[id]
    if (old) replaceContent(d, id, old)
    const bg = undo.backgrounds?.[id]
    const slide = bg ? d.slides.find((x) => x.id === id) : undefined
    if (bg && slide && !slide.locked) { if (bg.background) slide.background = structuredClone(bg.background); else delete slide.background; if (bg.themeOverrides) slide.themeOverrides = structuredClone(bg.themeOverrides); else delete slide.themeOverrides; for (const e of slide.elements) if (e.type === 'text' && bg.textColors[e.id] !== undefined) (e as TextElement).color = bg.textColors[e.id] as TextElement['color'] }
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
