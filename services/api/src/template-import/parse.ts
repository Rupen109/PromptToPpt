import { createHash } from 'node:crypto'
import { CANVAS, elementSchema, presentationSchema, themeStyleSchema, type AspectRatio, type Slide, type SlideElement, type Theme } from '@prompttoppt/validation'
import { SourceError } from '../sources/errors.ts'
import { colourIn, fromHex, isDark, mix, toHex, type Colour, type ColourContext } from './color.ts'
import { mapFont } from './fonts.ts'
import { processImages } from './images.ts'
import { colourCtx, openPptx, type SlideData } from './package.ts'
import { classifyPictures, classifySlide, mergeChrome, repeatedText, type SlideForSlots } from './slots.ts'
import { IMPORT_LIMITS, pendingRef, pendingSrc, type ExtractedPicture, type ParsedTemplate, type TemplateSlide, type UploadedFont, type UploadedTemplate } from './types.ts'
import { duotoneOf, walkTree, type Ctx, type Emitted, type ImageJob, type Origin } from './walk.ts'
import type { Aff } from './geom.ts'
import { at, findAll, kid, kids, num, type XNode } from './xml.ts'

/**
 * `parsePptxTemplate(bytes, filename)`: the whole .pptx -> template step, free of the database and of the network, so it can run inside the upload-parsing worker thread
 * (parse-pool.ts). Pictures come back as bytes beside the template; `importPptxTemplate` (index.ts) stores them and fixes the addresses.
 */

export const TIME_BUDGET_MS = 20_000

const ASPECTS: { id: AspectRatio; ratio: number }[] = [{ id: '16:9', ratio: 16 / 9 }, { id: '4:3', ratio: 4 / 3 }, { id: '1:1', ratio: 1 }]
export function aspectFor(cx: number, cy: number): { aspect: AspectRatio; fitted: boolean } {
  const r = cx / cy
  const best = [...ASPECTS].sort((a, b) => Math.abs(Math.log(r / a.ratio)) - Math.abs(Math.log(r / b.ratio)))[0]!
  return { aspect: best.id, fitted: Math.abs(Math.log(r / best.ratio)) > 0.02 }
}

type BgFill = NonNullable<Slide['background']>

function backgroundOf(root: XNode | undefined, c: Ctx, cc: ColourContext): BgFill | null {
  const bg = at(kid(root, 'cSld'), 'bg')
  if (!bg) return null
  const pr = kid(bg, 'bgPr'), ref = kid(bg, 'bgRef')
  let holder: XNode | undefined, ph: Colour | null = null
  let fromTheme = false
  if (pr) holder = pr
  else if (ref) {
    const idx = num(ref.a['idx'])
    ph = colourIn(ref, cc)
    const style = idx >= 1001 ? c.theme.bgFills[idx - 1001] : c.theme.fills[idx - 1]
    holder = style ? { n: 'x', a: {}, c: [style], t: '' } : undefined
    fromTheme = idx >= 1001 || !!style
    if (!holder && ph) return { type: 'color', value: ph.hex }
  }
  const n = holder?.c.find((x) => ['solidFill', 'gradFill', 'blipFill', 'pattFill'].includes(x.n))
  if (!n) return null
  const ctx = { ...cc, ph: ph?.hex }
  if (n.n === 'solidFill' || n.n === 'pattFill') { const col = n.n === 'solidFill' ? colourIn(n, ctx) : colourIn(kid(n, 'fgClr'), ctx); return col ? { type: 'color', value: col.hex } : null }
  if (n.n === 'gradFill') {
    const stops = kids(kid(n, 'gsLst'), 'gs').map((g) => ({ pos: num(g.a['pos']), col: colourIn(g, ctx) })).filter((g) => g.col).sort((a, b) => a.pos - b.pos) as { pos: number; col: Colour }[]
    if (!stops.length) return null
    if (stops.length === 1) return { type: 'color', value: stops[0]!.col.hex }
    const lin = kid(n, 'lin')
    // three or more stops, or a radial gradient, cannot be a two-colour linear one: it is drawn once as a picture
    if (stops.length > 2 || kid(n, 'path')) {
      const gradient = { stops: stops.map((s) => ({ pos: s.pos / 100000, hex: s.col.hex })), angle: lin ? ((num(lin.a['ang']) / 60000) % 360 + 360) % 360 : 90, radial: !!kid(n, 'path') }
      const key = createHash('sha1').update(`grad|${JSON.stringify(gradient)}`).digest('hex').slice(0, 20)
      if (!c.jobs.has(key)) c.jobs.set(key, { ref: key, part: c.partPath, mediaKey: '', crop: null, flipH: false, flipV: false, outW: 960, outH: Math.round((960 * c.canvasH) / c.canvasW), gradient })
      return { type: 'image', value: pendingSrc(key) }
    }
    const angle = lin ? Math.round(((num(lin.a['ang']) / 60000 + 90) % 360 + 360) % 360) : 180
    return { type: 'gradient', value: stops[0]!.col.hex, gradient: { from: stops[0]!.col.hex, to: stops[stops.length - 1]!.col.hex, angle } }
  }
  // a picture background
  const blip = kid(n, 'blip')
  const rid = blip?.a['r:embed']
  const relPart = fromTheme ? c.theme.path : c.partPath
  const rel = rid ? c.pkg.rels(relPart)[rid] : undefined
  if (!rel || rel.external) return null
  const duo = duotoneOf(blip, c, ph?.hex)
  const s = kid(n, 'srcRect')?.a
  const crop = s ? { l: Math.max(0, num(s['l']) / 100000), t: Math.max(0, num(s['t']) / 100000), r: Math.max(0, num(s['r']) / 100000), b: Math.max(0, num(s['b']) / 100000) } : null
  const outW = IMPORT_LIMITS.maxImageSide > c.canvasW ? c.canvasW : IMPORT_LIMITS.maxImageSide, outH = c.canvasH
  const key = createHash('sha1').update(`bg|${rel.target}|${crop ? JSON.stringify(crop) : ''}|${outW}x${outH}|${duo?.join('') ?? ''}`).digest('hex').slice(0, 20)
  if (!c.jobs.has(key)) c.jobs.set(key, { ref: key, part: relPart, mediaKey: rel.target, crop, flipH: false, flipV: false, outW, outH, ...(duo ? { duotone: duo } : {}) })
  return { type: 'image', value: pendingSrc(key) }
}

const inCanvas = (e: SlideElement, W: number, H: number) => {
  const cx = e.x + e.width / 2, cy = e.y + e.height / 2
  const r = Math.hypot(e.width, e.height) / 2
  return cx + r > 0 && cx - r < W && cy + r > 0 && cy - r < H
}

/** Repairs what can be repaired, validates the rest against the real schema, drops what cannot be represented. */
function validateElements(els: Emitted[], warn: (m: string) => void): Emitted[] {
  const out: Emitted[] = []
  for (const e of els) {
    const el = e.el as Record<string, unknown>
    for (const k of ['x', 'y', 'width', 'height', 'rotation', 'opacity']) if (typeof el[k] !== 'number' || !Number.isFinite(el[k] as number)) { el[k] = k === 'opacity' ? 1 : k === 'width' || k === 'height' ? 1 : 0 }
    el['opacity'] = Math.min(1, Math.max(0, el['opacity'] as number))
    if (el['type'] === 'text') el['fontSize'] = Math.min(600, Math.max(4, el['fontSize'] as number))
    const parsed = elementSchema.safeParse(el)
    if (parsed.success) { e.el = parsed.data; out.push(e) } else warn('An element could not be represented and was left out')
  }
  return out
}

function pickAccent(scheme: Record<string, string>, bg: string): string {
  const cands = ['accent3', 'accent4', 'accent5', 'accent6'].map((k) => scheme[k]).filter(Boolean).map((h) => `#${h}`)
  const sat = (h: string) => { const { r, g, b } = fromHex(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx }
  const contrast = (h: string) => Math.abs(luma(h) - luma(bg))
  return [...cands].sort((a, b) => sat(b) * (0.4 + contrast(b)) - sat(a) * (0.4 + contrast(a)))[0] ?? '#' + (scheme['accent2'] ?? '4472C4')
}
const luma = (h: string) => { const c = fromHex(h); return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 }

export async function parsePptxTemplate(bytes: Uint8Array, filename: string): Promise<ParsedTemplate> {
  const t0 = Date.now()
  const pkg = openPptx(bytes, filename)
  const { cx, cy } = pkg.slideSize
  const { aspect, fitted } = aspectFor(cx, cy)
  const { width: W, height: H } = CANVAS[aspect]
  const scale = Math.min(W / cx, H / cy)
  const offX = (W - cx * scale) / 2, offY = (H - cy * scale) / 2
  const root: Aff = { a: scale, b: 0, c: 0, d: scale, e: offX, f: offY }
  const jobs = new Map<string, ImageJob>()
  const fontUse = new Map<string, { role: 'heading' | 'body' | 'other'; uses: number }>()
  const flags = new Set<string>()
  const deck = { slideNumbers: 0, shadows: 0 }

  interface Built { data: SlideData; emitted: Emitted[]; background: BgFill | null; warnings: Map<string, number>; layoutName: string }
  const built: Built[] = []
  for (const sd of pkg.slides) {
    const warnings = new Map<string, number>()
    const warn = (m: string) => void warnings.set(m, (warnings.get(m) ?? 0) + 1)
    const master = sd.layout.master
    const mk = (origin: Origin, partPath: string, map: Record<string, string>): Ctx => ({ pkg, scale, offX, offY, canvasW: W, canvasH: H, warn, flags, jobs, fontUse, slide: sd, origin, partPath, master, layout: sd.layout, theme: master.theme, colours: colourCtx(master.theme, map), counter, prefix: origin === 'master' ? 'm' : origin === 'layout' ? 'l' : 'e', hasSlideNumber: false, groupFills: [] })
    const counter = { n: 0 }
    const emitted: Emitted[] = []
    const slideHides = sd.root.a['showMasterSp'] === '0'
    if (!slideHides && sd.layout.showMasterSp && master.tree) walkTree(master.tree.c, root, mk('master', master.path, master.map), emitted)
    if (!slideHides && sd.layout.tree) walkTree(sd.layout.tree.c, root, mk('layout', sd.layout.path, sd.layout.map), emitted)
    const sc = mk('slide', sd.path, sd.layout.map)
    const tree = at(kid(sd.root, 'cSld'), 'spTree')
    if (tree) walkTree(tree.c, root, sc, emitted)
    if (sc.hasSlideNumber) deck.slideNumbers++
    // background: the slide's own, else its layout's, else the master's
    let background = backgroundOf(sd.root, sc, sc.colours)
    background ??= backgroundOf(sd.layout.root, mk('layout', sd.layout.path, sd.layout.map), colourCtx(master.theme, sd.layout.map))
    background ??= backgroundOf(master.root, mk('master', master.path, master.map), colourCtx(master.theme, master.map))
    // facts that are only worth a line at deck level
    if (findAll(sd.root, 'prstTxWarp').some((n) => n.a['prst'] && n.a['prst'] !== 'textNoShape')) flags.add('wordart')
    if (findAll(sd.root, 'sp3d').length || findAll(sd.root, 'scene3d').some((n) => kid(n, 'camera')?.a['prst'] && !/^orthographicFront$/.test(kid(n, 'camera')!.a['prst']!))) flags.add('3d')
    if (findAll(sd.root, 'outerShdw').length || findAll(sd.root, 'glow').length || findAll(sd.root, 'softEdge').length) deck.shadows++
    built.push({ data: sd, emitted, background, warnings, layoutName: sd.layout.name || 'Layout' })
  }

  // pictures: processed once for the whole deck (the same logo on 30 slides is one picture)
  const imgs = await processImages(jobs, pkg, t0 + TIME_BUDGET_MS)
  const pictures: ExtractedPicture[] = [...imgs.ok.values()]
  const failedReasons = new Set<string>()

  // the deck's design, from the master of the first slide
  const first = built[0]!.data.layout.master
  const th = first.theme
  const sch = th.scheme
  const bgOfMaster = backgroundOf(first.root, { pkg, scale, offX, offY, canvasW: W, canvasH: H, warn: () => undefined, flags: new Set(), jobs: new Map(), fontUse: new Map(), slide: built[0]!.data, origin: 'master', partPath: first.path, master: first, layout: built[0]!.data.layout, theme: th, colours: colourCtx(th, first.map), counter: { n: 0 }, prefix: 'm', hasSlideNumber: false, groupFills: [] }, colourCtx(th, first.map))
  // the deck's background colour: what the first slide really shows (its own, its layout's or the master's), else the master's, else the theme's light colour
  const firstBg = built[0]!.background
  const seen = firstBg?.type === 'color' || firstBg?.type === 'gradient' ? firstBg : bgOfMaster?.type === 'color' || bgOfMaster?.type === 'gradient' ? bgOfMaster : null
  const bgHex = seen ? seen.value : `#${sch[first.map['bg1'] ?? 'lt1'] ?? 'FFFFFF'}`
  const tx1 = `#${sch[first.map['tx1'] ?? 'dk1'] ?? '000000'}`
  const bg2 = `#${sch[first.map['bg2'] ?? 'lt2'] ?? 'E7E6E6'}`
  const primary = `#${sch['accent1'] ?? '4472C4'}`
  const secondary = `#${sch['accent2'] ?? 'ED7D31'}`
  // text that would vanish on the background (a theme whose tx1 equals the master's picture background) falls back to the readable end
  const textPrimary = Math.abs(luma(tx1) - luma(bgHex)) < 0.25 ? (isDark(bgHex) ? '#FFFFFF' : '#111827') : tx1
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8)
  const name = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 80) || 'Uploaded template'
  const heading = mapFont(th.major), body = mapFont(th.minor)
  const theme: Theme = {
    id: `uploaded-${hash}`, name, templateId: `upload:${hash}`,
    colors: { background: toHex(fromHex(bgHex)), surface: Math.abs(luma(bg2) - luma(bgHex)) > 0.02 ? bg2 : mix(bgHex, textPrimary, 0.06), textPrimary, textSecondary: mix(textPrimary, bgHex, 0.38), primary, secondary, accent: pickAccent(sch, bgHex), onPrimary: isDark(primary) ? '#FFFFFF' : '#0F172A' },
    fonts: { heading: heading.mapped, body: body.mapped },
    radius: 8,
    style: themeStyleSchema.parse({ footer: deck.slideNumbers >= Math.ceil(built.length / 2) ? 'number' : 'none' }),
  }

  // slides
  const slides: TemplateSlide[] = []
  const forSlots: SlideForSlots[] = []
  let elementTotal = 0
  for (const b of built) {
    const warn = (m: string) => void b.warnings.set(m, (b.warnings.get(m) ?? 0) + 1)
    // pictures that could not be kept stay as the editor's own "picture goes here" placeholder
    for (const e of b.emitted) if (e.el.type === 'image') {
      const ref = pendingRef(e.el.src)
      if (ref && !imgs.ok.has(ref)) { const why = imgs.failed.get(ref) ?? 'could not be decoded'; warn(`A picture ${why} and became a placeholder`); failedReasons.add(why); delete (e.el as { src?: string }).src }
    }
    let bg = b.background
    if (bg?.type === 'image') { const ref = pendingRef(bg.value); if (ref && !imgs.ok.has(ref)) { warn('A background picture could not be imported; the slide colour is used'); bg = null } }
    let list = b.emitted.filter((e) => inCanvas(e.el, W, H))
    list = validateElements(list, warn)
    if (list.length > IMPORT_LIMITS.maxElementsPerSlide) {
      // drop the smallest pieces of decoration first, never words
      const drop = list.length - IMPORT_LIMITS.maxElementsPerSlide
      const ranked = list.map((e, i) => ({ e, i, a: e.el.width * e.el.height })).filter((x) => x.e.kind === 'shape').sort((x, y) => x.a - y.a).slice(0, drop)
      const gone = new Set(ranked.map((x) => x.e))
      list = list.filter((e) => !gone.has(e))
      list = list.slice(0, IMPORT_LIMITS.maxElementsPerSlide)
      warn(`The slide had more than ${IMPORT_LIMITS.maxElementsPerSlide} objects; the smallest decoration was left out`)
    }
    list.forEach((e, i) => { e.el.zIndex = i + 1 })
    const el = list.map((e) => e.el)
    const slide: Slide = {
      id: `slide-${b.data.n}`, layoutId: 'blank', locked: false, manual: true, ownLook: true,
      background: bg ?? { type: 'color', value: theme.colors.background },
      elements: el, speakerNotes: '', sources: [], validation: { status: 'pending', issues: [] },
    }
    elementTotal += el.length
    forSlots.push({ n: b.data.n, emitted: list, W, H })
    slides.push({ n: b.data.n, name: '', layoutName: b.layoutName, slide, slots: [], decor: [], pictures: [], warnings: [] })
  }

  // slots, chrome, pictures
  const repeated = repeatedText(forSlots)
  const pics = classifyPictures(forSlots)
  const chromePer: { n: number; ids: ReturnType<typeof classifySlide>['chromeIds'] }[] = []
  forSlots.forEach((fs, i) => {
    const cl = classifySlide(fs, repeated, pics.decorIds[i]!)
    const t = slides[i]!
    t.slots = cl.slots
    t.decor = cl.decor
    t.pictures = pics.placements[i]!
    const title = cl.slots.find((s) => s.role === 'title')
    t.name = (title?.sample.split('\n')[0] ?? '').slice(0, 80) || `Slide ${t.n}`
    chromePer.push({ n: t.n, ids: cl.chromeIds })
    t.warnings = [...built[i]!.warnings].map(([m, n]) => (n > 1 ? `${m} (${n} times)` : m))
  })

  // every slide must validate as a whole: wrap each in a one-slide deck and run the real schema
  for (const t of slides) {
    const wrapper = { schemaVersion: 1 as const, id: 'template-check', title: name, aspectRatio: aspect, language: 'en', theme, slides: [t.slide], sources: [] }
    const r = presentationSchema.safeParse(wrapper)
    if (!r.success) throw new SourceError('That presentation could not be converted into a valid template')
    t.slide = r.data.slides[0]!
  }

  const usedFonts: UploadedFont[] = []
  const seenFont = new Set<string>()
  const addFont = (original: string, role: UploadedFont['role'], uses: number) => { if (seenFont.has(original)) return; seenFont.add(original); const m = mapFont(original); usedFonts.push({ original, mapped: m.mapped, replaced: m.replaced, role, uses }) }
  addFont(th.major, 'heading', fontUse.get(th.major)?.uses ?? 0)
  addFont(th.minor, 'body', fontUse.get(th.minor)?.uses ?? 0)
  for (const [f, u] of [...fontUse].sort((a, b) => b[1].uses - a[1].uses)) addFont(f, 'other', u.uses)

  const f = pkg.facts
  const warnings: string[] = []
  if (pkg.masters.length > 1) warnings.push(`The file has ${pkg.masters.length} slide masters; the design (colours, fonts) comes from the first slide's master and every slide keeps its own look`)
  if (fitted) warnings.push(`The slide size is not exactly ${aspect}; the slides were fitted to the ${aspect} canvas`)
  if (usedFonts.some((x) => x.replaced)) warnings.push(`Fonts replaced: ${usedFonts.filter((x) => x.replaced).map((x) => `${x.original} became ${x.mapped}`).join(', ')}`)
  if (f.embeddedFonts) warnings.push('The file embeds its own fonts; they are not used (the nearest available font is shown)')
  if (flags.has('smartart') || f.smartArt) warnings.push(`SmartArt (${f.smartArt}) was converted to plain shapes where PowerPoint had saved a drawing of it, and left out otherwise; it is no longer editable as a diagram`)
  if (flags.has('chart') || f.charts) warnings.push(`Charts (${f.charts}) were imported as simple bar, line, pie or doughnut charts in the deck's colours; other chart types were left out`)
  if (flags.has('wordart')) warnings.push('WordArt text effects are not kept; the text is plain')
  if (flags.has('3d')) warnings.push('3-D effects are not kept')
  if (deck.shadows) warnings.push('Shadows, glows and soft edges are not kept')
  if (flags.has('arrowheads')) warnings.push('Arrowheads on lines are not kept')
  if (flags.has('dashes')) warnings.push('Dashed lines are drawn solid')
  if (f.media || flags.has('media')) warnings.push('Video and audio are not imported (only their poster pictures)')
  if (f.ole || flags.has('ole')) warnings.push('Embedded objects (for example Excel sheets) are kept only as pictures')
  if (f.hasAnimations || f.hasTransitions) warnings.push('Animations and slide transitions in the file are not imported')
  if (f.hasNotes) warnings.push('Speaker notes were not imported (they describe the old content)')
  if (f.hiddenSlides) warnings.push(`${f.hiddenSlides} hidden slide${f.hiddenSlides === 1 ? ' was' : 's were'} skipped`)
  if (f.skippedBeyondLimit) warnings.push(`Only the first ${IMPORT_LIMITS.maxSlides} slides were imported; ${f.skippedBeyondLimit} more were skipped`)
  if (imgs.failed.size) warnings.push(`${imgs.failed.size} picture${imgs.failed.size === 1 ? '' : 's'} could not be imported (${[...failedReasons].join(', ')})`)
  if (flags.has('mixed-align')) warnings.push('Some text boxes mix left, centre and right aligned paragraphs; they show in their main alignment')

  const template: UploadedTemplate = {
    name, source: { kind: 'pptx', filename: filename.slice(0, 200), bytes: bytes.length }, theme, aspect, canvas: { width: W, height: H, fitted },
    slides, chrome: mergeChrome(chromePer), fonts: usedFonts, warnings,
    stats: { sourceSlides: f.totalSlides, importedSlides: slides.length, skippedSlides: f.skippedBeyondLimit, hiddenSlides: f.hiddenSlides, masters: pkg.masters.length, elements: elementTotal, pictures: pictures.length, storedAssets: 0 },
  }
  return { template, pictures }
}

