import { z } from 'zod'
import { estimateTextHeight, metricOptsFor, type Photo } from '@prompttoppt/theme'
import { SCHEMA_VERSION, type Presentation, type Slide, type SlideElement, type TextElement } from '@prompttoppt/validation'
import type { SlotRole, TemplateSlide, TemplateSlot, UploadedTemplate } from '../template-import/types.ts'
import { fitText, sanitizeFill, stopgap, tooLong, type TemplateSceneSlots, type TemplateFill } from './template-deck.ts'
import { numberTokens } from './quality.ts'

/**
 * A deck built from the look of an uploaded file ("same format, different data", docs/TEMPLATE_FROM_FILE.md). The deck takes the file's theme and, for each story slide, a COPY of
 * one of the file's slides (its shapes, pictures, positions and type). Only the words change. This file is pure code (no model, no database): it decides which template slide each story
 * slide uses (`assignSlides`), puts words into the text boxes without ever copying the file's own sample words (`buildDeck`), and keeps every box inside its frame. The model only
 * proposes: every choice is validated here, so none of it depends on the model behaving.
 */

export type SlideKind = 'cover' | 'content' | 'closing'
export type TemplateMode = 'ai' | 'manual'

const CLOSING_NAME = /\b(thank|thanks|closing|the end|contact|questions?|q\s*&\s*a|end)\b/i
const roleSet = (s: TemplateSlide) => new Set(s.slots.map((x) => x.role))

/** Which template slides can be a cover and which a closing slide, from their position, name and the pattern of their text boxes. Always at least a cover (the first slide). */
export function classifySlides(tpl: UploadedTemplate): { cover: number; closing: number | null; kinds: SlideKind[] } {
  const T = tpl.slides.length
  const looksCover = (s: TemplateSlide, i: number) => {
    const r = roleSet(s)
    return r.has('title') && s.slots.length <= 4 && !r.has('bullets') && (i === 0 || /\b(title|cover|welcome)\b/i.test(s.layoutName))
  }
  let cover = tpl.slides.findIndex(looksCover)
  if (cover < 0) cover = 0
  let closing: number | null = null
  for (let i = T - 1; i > 0 && closing === null; i--) {
    if (i === cover) continue
    const s = tpl.slides[i]!
    const r = roleSet(s)
    const named = CLOSING_NAME.test(s.layoutName) || CLOSING_NAME.test(s.name)
    const lastAndShort = i === T - 1 && s.slots.length <= 3 && !r.has('bullets') && !(r.has('body') && s.slots.some((x) => x.lines > 2))
    if (named || lastAndShort) closing = i
    if (i < T - 2) break // only the last two slides can be a closing slide unless one is named like one
  }
  const kinds = tpl.slides.map((_, i): SlideKind => (i === cover ? 'cover' : i === closing ? 'closing' : 'content'))
  return { cover, closing, kinds }
}

/** What the model is told about a template slide: its shape (roles and room), never its words. */
export function describeSlides(tpl: UploadedTemplate) {
  const { kinds } = classifySlides(tpl)
  return tpl.slides.map((s, index) => ({
    index, layout: s.layoutName, kind: kinds[index]!,
    pictures: s.pictures.filter((p) => p.replaceable).length,
    charts: chartsOf(s.slide).map((c) => ({ id: c.id, chartType: c.chartType, categories: c.labels.length, series: c.series.length, labelChars: labelRoom(c) })),
    slots: s.slots.map((x) => ({
      id: x.elementId, role: x.role, sampleChars: x.sample.length, maxChars: x.maxChars, maxLines: x.maxLines, lines: x.lines, detail: x.detail, numeric: x.numeric,
      caps: /\p{L}/u.test(x.sample) && x.sample === x.sample.toUpperCase(),
    })),
  }))
}

/**
 * The template slide each of the `n` story slides uses. `proposed` is what the model chose (any of it may be missing or wrong). Rules: the first slide is a cover (a title-like slide),
 * the last is the closing slide when the template has one, the middle only uses the other slides (never an unknown index), no slide repeats back to back when another is available,
 * and repeats are limited (at most ceil(middle/pool) uses when the template is smaller than the deck, so layouts repeat evenly; at most 2 otherwise).
 */
export function assignSlides(tpl: UploadedTemplate, n: number, proposed?: readonly number[]): number[] {
  const T = tpl.slides.length
  if (T === 0 || n <= 0) return []
  const { cover, closing } = classifySlides(tpl)
  const end = n >= 2 && closing !== null && T > 1 ? closing : null
  const others = Array.from({ length: T }, (_, i) => i).filter((i) => i !== cover && i !== end)
  const pool = others.length > 0 ? others : [cover]
  const mid = n - 1 - (end !== null ? 1 : 0)
  const fallbackMid = (k: number) => (pool.length >= mid ? pool[Math.floor((k * pool.length) / Math.max(1, mid))]! : pool[k % pool.length]!)
  const cap = pool.length >= mid ? 2 : Math.ceil(mid / pool.length)
  const used = new Map<number, number>()
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (i === 0) { out.push(cover); continue }
    if (end !== null && i === n - 1) { out.push(end); continue }
    const k = i - 1
    const cand = proposed?.[i]
    let pick = typeof cand === 'number' && Number.isInteger(cand) && pool.includes(cand) ? cand : fallbackMid(k)
    const prev = out[i - 1]!
    const full = (x: number) => (used.get(x) ?? 0) >= cap
    if ((pick === prev && pool.length > 1) || full(pick)) {
      const alt = pool.filter((x) => x !== prev && !full(x)).sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0) || a - b)
      pick = alt[0] ?? pool.filter((x) => x !== prev).sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0) || a - b)[0] ?? pick
    }
    used.set(pick, (used.get(pick) ?? 0) + 1)
    out.push(pick)
  }
  return out
}

/** The slide count of a deck from this template: the person's number wins, else the template's own count, never above the plan or the document limit. */
export const templateSlideCount = (tpl: { slides: unknown[] }, requested: number | undefined, planMax: number) => Math.max(1, Math.min(planMax, 60, Math.round(requested ?? tpl.slides.length)))

// ─── the words ────────────────────────────────────────────────────────────────

export const uploadedFillSchema = z.object({
  title: z.string().max(200),
  /** the file's repeated small labels (wordmark, section label), once for the whole deck: "" removes the label */
  chrome: z.record(z.string().max(80), z.string().max(200)).default({}),
  slides: z.array(z.object({
    use: z.number().int().min(-1).max(500), notes: z.string().max(1500).optional(), fields: z.record(z.string().max(80), z.string().max(900)).default({}),
    /** the data of each chart of the chosen slide, by the chart's id; only used when the request gave figures (validated by `chartData`) */
    charts: z.record(z.string().max(80), z.object({
      labels: z.array(z.string().max(80)).max(24),
      series: z.array(z.object({ name: z.string().max(80), values: z.array(z.number()).max(24) })).max(6),
      unit: z.string().max(16).optional(),
    })).optional(),
  })).max(60),
})
export type UploadedFill = z.infer<typeof uploadedFillSchema>

/** A neutral stand-in for a box, by what the box is for. Never the file's own words. */
export function placeholderFor(slot: Pick<TemplateSlot, 'role' | 'lines' | 'maxChars' | 'numeric'>): string {
  const one: Record<SlotRole, string> = { title: 'Add your title', subtitle: 'Add your subtitle', body: 'Add your text here', bullets: 'Add a point', caption: 'Add a caption', number: '0', label: 'Add label', name: 'Add a name', other: 'Add text' }
  if (slot.numeric) return '0'
  const text = one[slot.role]
  if (slot.role === 'bullets' && slot.lines > 1) return Array.from({ length: Math.min(slot.lines, 4) }, () => text).join('\n')
  return text
}

type ChartEl = Extract<SlideElement, { type: 'chart' }>
const chartsOf = (slide: Slide): ChartEl[] => slide.elements.filter((e): e is ChartEl => e.type === 'chart')
/** the letters one category label may hold: a bar's slot width, or a legend line (pie / doughnut) */
const labelRoom = (c: ChartEl) => (c.chartType === 'pie' || c.chartType === 'doughnut' ? 28 : Math.max(4, Math.min(24, Math.floor(c.width / Math.max(1, c.labels.length) / 13))))

/** Neutral stand-in data: "Item 1..N" and clearly made-up stepped values. Nothing of the file's labels, series names, figures or unit survives. */
export function placeholderChart(el: ChartEl): ChartEl {
  const n = Math.max(3, Math.min(8, el.labels.length))
  const circular = el.chartType === 'pie' || el.chartType === 'doughnut'
  const k = circular ? 1 : Math.max(1, Math.min(3, el.series.length))
  const { unit: _u, ...rest } = el
  return {
    ...rest, placeholder: true,
    labels: Array.from({ length: n }, (_, i) => `Item ${i + 1}`),
    series: Array.from({ length: k }, (_, si) => ({ name: `Series ${si + 1}`, values: Array.from({ length: n }, (_, i) => (circular ? 10 + i * 10 : 20 + ((i + si * 2) % n) * 10 + si * 5)) })),
  }
}

/** a number token is acceptable when the person wrote it (with or without %, k, m, b, x) or it is a small structural integer (labels like "Q3") */
function numberOk(token: string, allowed: ReadonlySet<string>, small: boolean): boolean {
  if (allowed.has(token)) return true
  const bare = token.replace(/[%kmbx]$/, '')
  if (allowed.has(bare) || [...allowed].some((a) => a.replace(/[%kmbx]$/, '') === bare)) return true
  return small && /^\d{1,2}$/.test(token) && Number(token) <= 12
}

/** The model's data for a chart, only if EVERY figure is one the person supplied and the shape fits; else null (the caller falls back to placeholder data). */
export function chartData(el: ChartEl, given: NonNullable<UploadedFill['slides'][number]['charts']>[string] | undefined, allowed: ReadonlySet<string>): ChartEl | null {
  if (!given) return null
  const circular = el.chartType === 'pie' || el.chartType === 'doughnut'
  const labels = given.labels.map((l) => l.trim())
  if (labels.length < 1 || labels.length > 24 || labels.some((l) => !l)) return null
  const series = circular ? given.series.slice(0, 1) : given.series
  if (series.length < 1 || series.length > 6) return null
  for (const s of series) {
    if (s.values.length !== labels.length || s.values.some((v) => !Number.isFinite(v))) return null
    if (circular && s.values.some((v) => v < 0)) return null
    if (s.values.some((v) => !numberTokens(String(v)).every((t) => numberOk(t, allowed, false)))) return null
  }
  const wordsOk = [...labels, ...series.map((s) => s.name), given.unit ?? ''].every((t) => numberTokens(t).every((x) => numberOk(x, allowed, true)))
  if (!wordsOk) return null
  const room = labelRoom({ ...el, labels })
  const unit = given.unit?.trim()
  const { unit: _u, placeholder: _p, ...rest } = el
  return { ...rest, labels: labels.map((l) => fitText(l, room)), series: series.map((s, i) => ({ name: fitText(s.name.trim() || `Series ${i + 1}`, 24), values: s.values })), ...(unit && !/\d/.test(unit) ? { unit: unit.slice(0, 16) } : {}) }
}

/** Charts keep their type, place, size and theme colours but never the file's data. Tables keep their shape; their words become stand-ins. */
function neutraliseData(el: SlideElement, data?: ChartEl | null): SlideElement {
  if (el.type === 'chart') return data ?? placeholderChart(el)
  if (el.type === 'table') return { ...el, header: el.header.map((_, i) => `Column ${i + 1}`), rows: el.rows.map((r) => r.map(() => 'Add text')) }
  return el
}

const stripLink = (run: TextElement['paragraphs'][number]['runs'][number]) => { const { link: _l, ...rest } = run; return rest }

/** Puts `text` (paragraphs split on newlines) into a text element, keeping the sample paragraph's own style (first run: colour, bold, italic; the element: size, align, weight, spacing). */
export function setText(el: TextElement, text: string, theme: Presentation['theme']): TextElement {
  const parts = text.split(/\n+/).map((x) => x.trim()).filter(Boolean)
  if (parts.length === 0) parts.push(text.trim())
  const build = (ps: string[]): TextElement['paragraphs'] => ps.map((t, j) => {
    const src = el.paragraphs[Math.min(j, el.paragraphs.length - 1)]!
    const run = stripLink(src.runs[0]!)
    return { runs: [{ ...run, text: t }], ...(src.list ? { list: src.list } : {}) }
  })
  let ps = parts
  let next: TextElement = { ...el, paragraphs: build(ps) }
  // keep the words inside the box at the box's own type size: the same measure the deck validator uses
  for (let guard = 0; guard < 14; guard++) {
    if (estimateTextHeight(next.paragraphs, next.fontSize, next.width, metricOptsFor(next, theme)) <= next.height * 1.02) break
    if (ps.length > 1) ps = ps.slice(0, -1)
    else { const cut = fitText(ps[0]!, Math.floor(ps[0]!.length * 0.82)); if (cut === ps[0] || cut.length < 3) break; ps = [cut] }
    next = { ...el, paragraphs: build(ps) }
  }
  return next
}

/** Wraps the file's slots into the shape template-deck.ts's sanitiser expects: one "scene" per story slide. */
const asScenes = (tpl: UploadedTemplate, assignment: number[]): TemplateSceneSlots[] =>
  assignment.map((k, i) => ({ scene: `s${i}`, title: tpl.slides[k]!.name, purpose: '', slots: tpl.slides[k]!.slots.map((s) => ({ id: s.elementId, sample: s.sample, maxChars: s.maxChars, detail: s.detail, numeric: s.numeric, ticker: false })) }))

/** The model's words for the chosen slides, as the model's slide `i` (matched by position, never by what it says it used). */
const toFill = (fill: UploadedFill): TemplateFill => ({ title: fill.title, chrome: fill.chrome, scenes: fill.slides.map((s, i) => ({ scene: `s${i}`, notes: s.notes, fields: s.fields })) })

/** Boxes of the chosen slides that are too long for their room, for the one "shorten these" repair. */
export function longBoxes(fill: UploadedFill, tpl: UploadedTemplate, assignment: number[]) {
  return tooLong(toFill(fill), asScenes(tpl, assignment))
}

export interface BuildInput {
  tpl: UploadedTemplate
  assignment: number[]
  slideIds: string[]
  mode: TemplateMode
  /** AI mode: the model's words (a proposal) */
  fill?: UploadedFill
  rules: { allowedNumbers: ReadonlySet<string>; figuresAllowed: boolean }
  /** AI mode: a picture for a replaceable photo, by `<story slide index>:<template element id>`; missing/null → the editor's "picture goes here" box */
  photos?: ReadonlyMap<string, Photo | null | undefined>
  title: string
  language: string
  sources: Presentation['sources']
}
export interface BuildReport { boxesWithoutWords: number; picturesPlaced: number; picturePlaceholders: number; chartsKept: number; chartsPlaceholder: number; slidesUsed: number[] }

const stableId = (slideId: string, elementId: string) => `${slideId}:${elementId}`.slice(0, 64)

/** The deck: the template's theme and a copy of the chosen template slide for each story slide, with the words replaced. Element ids are `<slide id>:<template element id>`, so writing it again keeps them. */
export function buildDeck(i: BuildInput): { doc: Presentation; report: BuildReport } {
  const { tpl, assignment } = i
  const report: BuildReport = { boxesWithoutWords: 0, picturesPlaced: 0, picturePlaceholders: 0, chartsKept: 0, chartsPlaceholder: 0, slidesUsed: assignment }
  const scenes = asScenes(tpl, assignment)
  const ai = i.mode === 'ai' && i.fill
  // what ships in each box: the model's words fitted (AI), or a role placeholder (manual). A box the model left out never keeps the file's sample.
  const fields: Record<string, Record<string, string>> = {}
  if (ai) {
    const f = toFill(i.fill!)
    const { fields: ok, missing } = sanitizeFill(f, scenes, i.rules)
    const title = (i.fill!.title.trim() || i.title).slice(0, 100)
    for (const m of missing) { const slot = scenes.find((x) => x.scene === m.scene)?.slots.find((x) => x.id === m.id); if (slot) ok[m.scene]![m.id] = stopgap(slot, title); report.boxesWithoutWords++ }
    Object.assign(fields, ok)
  }
  const chrome = ai ? Object.fromEntries(tpl.chrome.map((c) => [c.id, fitText((i.fill!.chrome[c.id] ?? '').trim(), c.maxChars)])) : null

  const slides: Slide[] = assignment.map((k, idx) => {
    const ts = tpl.slides[k]!
    const sid = i.slideIds[idx]!
    const clone = structuredClone(ts.slide) as Slide
    const words = fields[`s${idx}`] ?? {}
    const slotById = new Map(ts.slots.map((s) => [s.elementId, s]))
    const chromeOn = new Map<string, string>()
    if (chrome) for (const c of tpl.chrome) for (const r of c.refs) if (r.slide === ts.n) chromeOn.set(r.elementId, chrome[c.id] ?? '')
    const photoEls = new Set(ts.pictures.filter((p) => p.replaceable).map((p) => p.elementId))
    const elements: SlideElement[] = []
    for (const el of clone.elements) {
      let next: SlideElement | null = el
      const slot = slotById.get(el.id)
      if (el.type === 'text' && slot) {
        const text = ai ? words[slot.elementId] ?? '' : placeholderFor(slot)
        next = text === '' ? null : setText(el, text, tpl.theme)
      } else if (el.type === 'text' && chromeOn.has(el.id)) {
        const text = chromeOn.get(el.id)!
        next = text === '' ? null : setText(el, text, tpl.theme)
      } else if (el.type === 'image' && photoEls.has(el.id)) {
        const photo = i.photos?.get(`${idx}:${el.id}`)
        const { src: _s, attribution: _a, ...rest } = el
        if (photo) { next = { ...rest, src: photo.src, alt: photo.alt.slice(0, 300), ...(photo.attribution ? { attribution: photo.attribution } : {}) }; report.picturesPlaced++ }
        else { next = { ...rest, alt: '' }; report.picturePlaceholders++ }
      } else if (el.type === 'chart' || el.type === 'table') {
        const real = el.type === 'chart' && ai && i.rules.figuresAllowed ? chartData(el, i.fill!.slides[idx]?.charts?.[el.id], i.rules.allowedNumbers) : null
        next = neutraliseData(el, real)
        if (el.type === 'chart') { report.chartsKept++; if ((next as ChartEl).placeholder) report.chartsPlaceholder++ }
      }
      if (next) elements.push({ ...next, id: stableId(sid, el.id) })
    }
    const { writing: _w, ...slide } = clone
    return { ...slide, id: sid, elements, speakerNotes: (ai ? i.fill!.slides[idx]?.notes ?? '' : '').slice(0, 1500), sources: [], validation: { status: 'pending', issues: [] } } as Slide
  })
  const doc: Presentation = { schemaVersion: SCHEMA_VERSION, id: 'template', title: i.title.slice(0, 200), aspectRatio: tpl.aspect, language: i.language, theme: tpl.theme, sources: i.sources, slides }
  return { doc, report }
}

/**
 * One slide from a template layout for the editor's "From your template" menu: the layout with neutral placeholders in every text box (never the file's words), the file's own
 * pictures that belong to the design kept, photos as "picture goes here" boxes. Ids are new but derive from the given slide id.
 */
export function layoutSlide(tpl: UploadedTemplate, index: number, slideId: string): Slide | null {
  const ts = tpl.slides[index]
  if (!ts) return null
  const { doc } = buildDeck({ tpl, assignment: [index], slideIds: [slideId], mode: 'manual', rules: { allowedNumbers: new Set(), figuresAllowed: false }, title: tpl.name, language: 'en', sources: [] })
  // a layout inserted into an existing deck keeps the deck's own repeated labels (wordmark, section label): they stay as the file drew them
  const slide = doc.slides[0]!
  return { ...slide, elements: slide.elements }
}

/**
 * The model wrote the words of the slide it chose; when the code has to use a different template slide in that position (the model's pick broke a rule), its words are carried over box by box
 * by role (the first title to the first title, and so on), so the slide is not left to stand-in words. Boxes that find no partner are left out and filled with a neutral stand-in later.
 */
export function alignFill(tpl: UploadedTemplate, assignment: number[], fill: UploadedFill): UploadedFill {
  const slides = assignment.map((k, i) => {
    const given = fill.slides[i]
    const target = tpl.slides[k]!
    const from = given && Number.isInteger(given.use) && given.use >= 0 && given.use < tpl.slides.length ? tpl.slides[given.use]! : null
    if (!given) return { use: k, fields: {} as Record<string, string>, charts: {} }
    if (from && given.use === k) return { ...given, use: k }
    const fields: Record<string, string> = {}
    // by id when the ids exist on the new slide (a repeated layout), else by role order
    const pool = new Map<SlotRole, string[]>()
    if (from) for (const s of from.slots) { const v = given.fields[s.elementId]; if (typeof v === 'string' && v.trim()) pool.set(s.role, [...(pool.get(s.role) ?? []), v]) }
    for (const s of target.slots) { const v = pool.get(s.role)?.shift(); if (v) fields[s.elementId] = v }
    // charts follow the same way, in order (the first chart of the slide the model meant to the first chart of the one used)
    const charts: NonNullable<UploadedFill['slides'][number]['charts']> = {}
    const fromCharts = from ? chartsOf(from.slide) : []
    chartsOf(target.slide).forEach((c, j) => { const d = fromCharts[j] ? given.charts?.[fromCharts[j]!.id] : undefined; if (d) charts[c.id] = d })
    return { ...given, use: k, fields, charts }
  })
  return { ...fill, slides }
}
