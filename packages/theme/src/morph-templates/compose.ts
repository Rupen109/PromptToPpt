import { textBaseWeight, type Slide, type SlideContent, type SlideElement, type Theme } from '@prompttoppt/validation'
import { estimateTextHeight, fitFontSize, metricOptsFor, textWidth } from '../text-metrics'
import type { MorphTemplate, TemplateObject, TemplatePara, TemplatePicture, TemplateRun } from './types'

/**
 * A scene of a Morph template, as a slide. Pure: the same template, scene and words always give the same elements, with the template's own object ids, so a Morph between two scenes
 * moves the objects the source deck moves. Words come from `fields` (by the id of the text object), pictures from `images` (by the id of the picture object); everything not given
 * keeps the template's own.
 */
type Content = Extract<SlideContent, { layout: 'morph-template' }>
type Composed = Pick<Slide, 'layoutId' | 'background' | 'elements' | 'speakerNotes' | 'sources' | 'content' | 'transition'>

const PT = 96 / 72 // a point is 1.333 canvas pixels (the 1920-wide canvas is 20 inches at 96 dpi)
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** The words of a text object. */
export const objectText = (o: TemplateObject) => (o.paras ?? []).filter((p): p is TemplatePara => !!p).map((p) => p.runs.map((r) => r.t).join('')).join('\n')

export function templateTheme(tpl: MorphTemplate): Theme {
  return { id: `morph-${tpl.id}`, name: tpl.name, colors: tpl.colors, fonts: tpl.fonts, radius: 0, templateId: `morph:${tpl.id}` } as Theme
}

const weightOf = (r: TemplateRun, tpl: MorphTemplate) => {
  if (r.w) return r.w
  const f = r.font ?? ''
  if (norm(f) === norm(tpl.fonts.heading) && /anton|bebas|oswald/i.test(f)) return 400 // a one-weight display face
  if (/black|heavy/i.test(f)) return 900
  if (/extra ?bold/i.test(f)) return 800
  if (/semi ?bold/i.test(f)) return 600
  if (/bold/i.test(f) || r.b) return 700
  if (/medium/i.test(f)) return 500
  if (/light|thin/i.test(f)) return 300
  return 400
}

/** A ticker is one phrase repeated across a very wide box ("About Us   About Us   About Us"): how many times, or 0 when the words are not a repeated phrase. */
const repeats = (text: string) => { const m = text.trim().match(/^([\s\S]+?)(?:(?:\s{2,}|\s*[-–—•|]\s*)\1)+(?:\s*[-–—•|])?$/); return m ? Math.round(text.trim().length / (m[1]!.length + 3)) || 0 : 0 }

type TextEl = Extract<SlideElement, { type: 'text' }>

/** The slide's own size and the margins the composer keeps text inside (canvas px). */
const SLIDE_W = 1920
const SLIDE_H = 1080
const EDGE = 40
const WIDE_BOX = 1800

const isDisplayFace = (tpl: MorphTemplate, headingFace: boolean) => /anton|bebas|oswald/i.test(tpl.fonts.heading) && headingFace

/** A ticker rests inside the slide: the phrase repeated as often as whole phrases fit between the margins (it still glides in from off the slide, as in the source). */
function layOutTicker(el: TextEl, o: TemplateObject, phrase: string, times: number, display: boolean) {
  const oneW = phrase.length * el.fontSize * (display ? 0.5 : 0.56) + el.fontSize * 1.5
  const n = Math.max(1, Math.min(times, Math.floor(WIDE_BOX / oneW)))
  el.paragraphs = [{ runs: [{ text: Array.from({ length: n }, () => phrase).join('     ') }] }]
  if (o.x < SLIDE_W && o.x + o.w > 0 && o.y < SLIDE_H && o.y + o.h > 0) { el.x = (SLIDE_W - WIDE_BOX) / 2; el.width = WIDE_BOX; el.align = 'center' }
}

/** Small body copy of an imported deck is lifted to a readable size: at least the source's, as large as fits a box twice the source's height, and the box grows to hold it. */
function liftBodyCopy(el: TextEl, o: TemplateObject, tpl: MorphTemplate, px: number) {
  const opts = metricOptsFor(el, { fonts: tpl.fonts })
  const fit = fitFontSize(el.paragraphs, o.w, Math.max(o.h, 40) * 2, 34, Math.max(px, 22), opts)
  el.fontSize = Math.max(px, fit)
  el.height = Math.max(o.h, Math.ceil(estimateTextHeight(el.paragraphs, el.fontSize, o.w, opts)))
}

/** A line the source set on one line stays on one line, whatever face we draw it in (a wider face must never wrap "GALLERY" into "GALLER / Y"). */
function keepOnOneLine(el: TextEl, o: TemplateObject, tpl: MorphTemplate, r0: TemplateRun) {
  const face = el.role === 'title' || el.role === 'heading' ? tpl.fonts.heading : tpl.fonts.body
  const text = el.paragraphs[0]!.runs.map((r) => r.text).join('')
  const capitals = r0.cap === 'all' || el.uppercase || (text === text.toUpperCase() && /[A-Z]/.test(text))
  // measured width at the weight it is drawn (font-widths.ts), with a small margin for rendering differences
  const needed = textWidth(text, el.fontSize, { font: face, uppercase: capitals, tracking: Math.abs(el.letterSpacing ?? 0), weight: textBaseWeight(el) }) * 1.04 + 6
  if (needed <= el.width) return
  const grow = needed - el.width
  el.x = el.align === 'center' ? el.x - grow / 2 : el.align === 'right' ? el.x - grow : el.x
  el.width = needed
  // a line that was on the slide stays on the slide
  if (o.x >= 0 && o.x + o.w <= SLIDE_W && el.x + el.width > SLIDE_W - EDGE) el.x = Math.max(EDGE, SLIDE_W - EDGE - el.width)
}

function textElement(tpl: MorphTemplate, o: TemplateObject, z: number, override: string | undefined): SlideElement {
  // new words for a ticker are repeated just as the source repeated its own
  const times = repeats(objectText(o))
  const ticker = times > 1
  const phrase = override ?? (ticker ? objectText(o).trim().split(/\s{2,}|\s*[-–—•|]\s*/)[0] : undefined)
  const paras = (o.paras ?? []).filter((p): p is TemplatePara => !!p)
  const first = paras[0]!
  const r0 = first.runs.find((r) => r.t.trim() && r.t !== '\n') ?? first.runs[0]!
  const px = (r0.sz ?? 18) * PT
  const headingFace = norm(r0.font ?? '') === norm(tpl.fonts.heading) && norm(tpl.fonts.heading) !== norm(tpl.fonts.body)
  const role = px >= 72 ? 'title' : headingFace || px >= 40 ? 'heading' : px >= 24 ? 'body' : 'caption'
  const isHeading = role === 'title' || role === 'heading'
  const display = isDisplayFace(tpl, headingFace)
  const color = r0.color ?? '#FFFFFF'
  const lines = (runs: TemplateRun[]) => runs.reduce<TemplateRun[][]>((acc, r) => { if (r.t === '\n') acc.push([]); else acc[acc.length - 1]!.push(r); return acc }, [[]])
  const run = (r: TemplateRun) => ({ text: r.t, ...(r.b ? { bold: true } : {}), ...(r.i ? { italic: true } : {}), ...(r.u ? { underline: true } : {}), ...(r.color && r.color !== color ? { color: r.color } : {}) })
  const paragraphs = phrase !== undefined && !ticker
    ? phrase.split('\n').map((line) => ({ runs: [{ text: line }] }))
    : paras.flatMap((p) => lines(p.runs).map((runs) => ({ runs: (runs.length ? runs : [{ t: '' } as TemplateRun]).map(run) })))
  const spc = r0.spc ? r0.spc * PT : 0

  // Typography. An authored template (`exact`) is used exactly as written. An imported one is made ours: light display weights become a confident semibold, lines never touch,
  // and the tracking of big headlines is tightened.
  const weight = o.exact ? weightOf(r0, tpl)
    : isHeading && tpl.headingWeight ? tpl.headingWeight
    : isHeading && !display && weightOf(r0, tpl) < 600 ? 600
    : !isHeading && !r0.cap ? Math.max(400, weightOf(r0, tpl))
    : weightOf(r0, tpl)
  const lineHeight = o.exact ? Math.max(0.7, Math.min(2.4, first.lnSpc ?? 1.2)) : Math.max(isHeading ? (display ? 0.98 : 1.12) : 1.4, Math.min(2.2, first.lnSpc ?? 1.2))
  const tracking = o.exact ? Math.max(-12, Math.min(40, spc))
    : isHeading && !display && !spc ? -Math.round(px * 0.012 * 10) / 10
    : spc ? Math.max(-4, Math.min(30, spc))
    : 0

  const el = {
    type: 'text', id: o.id, x: o.x, y: o.y, width: o.w, height: o.h, rotation: o.rot, locked: false, zIndex: z, opacity: o.alpha ?? 1,
    role, paragraphs: paragraphs.length ? paragraphs : [{ runs: [{ text: '' }] }], fontSize: Math.max(4, Math.round(px * 10) / 10), align: first.algn === 'ctr' ? 'center' : first.algn === 'r' ? 'right' : 'left',
    color, valign: o.anchor === 'ctr' ? 'middle' : o.anchor === 'b' ? 'bottom' : 'top', bullet: '•', weight, lineHeight, paraGap: 0,
    ...(r0.cap === 'all' ? { uppercase: true } : {}), ...(tracking ? { letterSpacing: tracking } : {}),
  } as TextEl
  if (o.exact) {
    // an authored band of one repeated phrase takes the deck's phrase, repeated as many times as the template repeated its own (its position and size are the author's)
    if (ticker && override !== undefined) el.paragraphs = [{ runs: [{ text: Array.from({ length: times }, () => override.trim()).join('   ') }] }]
    return el
  }
  if (ticker && phrase !== undefined) layOutTicker(el, o, phrase, times, display)
  else if (!isHeading && !r0.cap && px >= 16 && px < 40 && o.w < WIDE_BOX && o.y > 110 && o.y < 1000) liftBodyCopy(el, o, tpl, px)
  if (!ticker && el.paragraphs.length === 1 && o.h < px * 1.7) keepOnOneLine(el, o, tpl, r0)
  return el
}

/** Bump when any picture in apps/web/public/morph-templates is regenerated: the files are cached for a day, and a new number makes every browser fetch the new ones. */
export const MORPH_ART_VERSION = 31
const urlOf = (src: string, base: string) => (/^https?:\/\//i.test(src) ? src : `${base.replace(/\/$/, '')}/morph-templates/${src}?v=${MORPH_ART_VERSION}`)

function imageElement(tpl: MorphTemplate, o: TemplateObject, z: number, base: string, override: Content['images'][string] | undefined): SlideElement | null {
  const pic: TemplatePicture | undefined = o.hash ? tpl.pictures[o.hash] : undefined
  if (pic?.drop) return null
  const invisible = (o.alpha ?? 1) < 0.05
  const fallback = tpl.pictures['void'] // a parked, invisible copy shows nothing
  const use = override ? { src: override.url, alt: override.alt, ...(override.attribution ? { attribution: override.attribution } : {}) } : pic ?? (invisible ? fallback : undefined)
  const product = !!override && !!tpl.swap?.pictures.includes(o.id) // the person's own picture of their product: shown filled and softly rounded, whatever shape the template's picture had
  if (!use) return null
  const full = o.w >= SLIDE_W - EDGE && o.h >= SLIDE_H - EDGE
  let { x, y, w, h, rot } = { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot }
  const frame = override && !product ? tpl.fillFrame?.[o.id] : undefined
  const inset = frame?.inset ?? tpl.fillInset
  if (override && !product && inset && !o.radius && !(o.clip ?? pic?.clip) && !full) { x += w * inset / 2; y += h * inset / 2; w *= 1 - inset; h *= 1 - inset }
  if (pic?.tilt && pic.aspect && !override) {
    // the box is the bounding box of a tilted picture: find the angle that makes an upright one of this shape fill it, then draw the upright one turned by that angle about the same centre
    const a = pic.aspect, ratio = o.w / o.h
    const f = (deg: number) => { const t = (deg * Math.PI) / 180; return (a * Math.cos(t) + Math.sin(t)) / (a * Math.sin(t) + Math.cos(t)) }
    let lo = 0, hi = 60
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (f(mid) < ratio) lo = mid; else hi = mid }
    const deg = ratio <= a ? 0 : Math.round(((lo + hi) / 2) * 10) / 10, t = (deg * Math.PI) / 180
    const ch = Math.min(o.w / (a * Math.cos(t) + Math.sin(t)), o.h / (a * Math.sin(t) + Math.cos(t))), cw = ch * a
    x = o.x + o.w / 2 - cw / 2; y = o.y + o.h / 2 - ch / 2; w = cw; h = ch; rot = o.rot + pic.tilt * deg
  }
  return {
    type: 'image', id: o.id, x, y, width: w, height: h, rotation: rot, locked: invisible || full, zIndex: z, opacity: o.alpha ?? 1,
    src: urlOf(use.src, base), alt: invisible ? '' : use.alt, fit: override ? (product ? (tpl.swap!.fit ?? 'cover') : 'cover') : o.fit ?? (full || pic?.clip === 'circle' || (o.crop && tpl.coverCrops) ? 'cover' : 'contain'), clip: product ? 'none' : o.clip ?? pic?.clip ?? frame?.clip ?? 'none', radius: product ? (tpl.swap!.radius ?? 36) : override && !full && !o.radius && !(o.clip ?? pic?.clip) && !frame?.clip ? frame?.radius ?? tpl.fillRadius ?? 0 : o.radius ?? 0,
    ...('attribution' in use && use.attribution ? { attribution: use.attribution } : {}),
    ...(invisible ? { decorative: true } : {}),
  } as SlideElement
}

export interface TemplateComposeOptions { assetBase?: string }
const DEFAULT_BASE = 'https://slidesdone.app'

export function composeTemplateScene(tpl: MorphTemplate, content: Content, opts: TemplateComposeOptions = {}): Composed {
  const base = opts.assetBase ?? DEFAULT_BASE
  const n = Number(content.scene.replace(/^s/, ''))
  const slide = tpl.data.slides.find((s) => s.n === n)
  if (!slide) throw new Error(`Morph template "${tpl.id}" has no scene "${content.scene}"`)
  const elements: SlideElement[] = []
  const replaced = tpl.replace
  const hidden = new Set(content.swapped ? tpl.swap?.hide ?? [] : [])
  slide.objects.forEach((o, z) => {
    if (hidden.has(o.id) && o.kind !== 'text') return // only on the original product: nothing for it to point at
    if (o.kind === 'image') { const el = imageElement(tpl, o, z, base, content.images[o.id]); if (el) elements.push(el) }
    else if (o.kind === 'text') {
      if (!(o.paras ?? []).some(Boolean)) return
      if (content.fields[o.id] === '') return // a detail the deck has no words for (an address, a handle): the object is left out rather than showing a placeholder
      const own = replaced[norm(objectText(o))]
      elements.push(textElement(tpl, o, tpl.textOnTop || content.swapped || (tpl.textAboveOwn && Object.keys(content.images).length > 0) ? z + 1000 : z, content.fields[o.id] ?? own)) // the person's photo is a picture with its own background, not a cut-out: words are always drawn above it
    } else if (o.fill || o.gradient || o.stroke) {
      elements.push({
        type: 'shape', id: o.id, x: o.x, y: o.y, width: o.w, height: o.h, rotation: o.rot, locked: false, zIndex: z, opacity: o.alpha ?? 1,
        shape: o.poly ? 'polygon' : o.shape ?? (o.geom === 'ellipse' ? 'ellipse' : 'rect'), ...(o.poly ? { points: o.poly } : {}),
        fill: o.fill ?? 'none', radius: o.radius ?? 0, ...(o.gradient ? { gradient: o.gradient } : {}), ...(o.stroke ? { stroke: o.stroke, strokeWidth: o.strokeW ?? 2 } : {}),
      } as SlideElement)
    }
  })
  return {
    layoutId: 'morph-template',
    background: slide.bgGradient ? { type: 'gradient', value: slide.bgGradient.from, gradient: slide.bgGradient } : { type: 'color', value: slide.background ?? tpl.background },
    elements, speakerNotes: content.speakerNotes, sources: content.sources, content,
    transition: { type: 'morph', duration: tpl.durationMs, easing: 'power2-in-out', blend: 'cross', own: true },
  }
}

/** The text objects of a scene whose words are the deck's (not the navigation and branding that every scene repeats), top to bottom. */
export function textSlots(tpl: MorphTemplate, sceneId: string): { id: string; text: string; fontSize: number; maxChars: number; /** the letters that really fit (heavy and capital type is wider): what a deck written by the AI is held to */ room: number; ticker: boolean }[] {
  const n = Number(sceneId.replace(/^s/, ''))
  const slide = tpl.data.slides.find((s) => s.n === n)
  if (!slide) return []
  // navigation and branding: the same object with the same words on many scenes (an object that keeps its id but changes its words, like a title, is the deck's)
  const count = new Map<string, number>()
  const key = (o: TemplateObject) => `${o.id}|${norm(objectText(o))}`
  for (const s of tpl.data.slides) for (const o of s.objects) if (o.kind === 'text') count.set(key(o), (count.get(key(o)) ?? 0) + 1)
  const chrome = (o: TemplateObject) => (count.get(key(o)) ?? 0) >= Math.max(3, tpl.data.slides.length * 0.35)
  const px = (o: TemplateObject) => ((o.paras ?? []).find(Boolean)?.runs[0]?.sz ?? 18) * PT
  // on the slide (a ticker starts off its edge but crosses it), and big enough to be words rather than a parked staging copy
  return slide.objects.filter((o) => o.kind === 'text' && (o.paras ?? []).some(Boolean) && !(chrome(o) && px(o) < 24) && (o.alpha ?? 1) >= 0.5 && o.y >= -50 && o.y < 1000 && o.x + o.w > 0 && o.x < SLIDE_W && px(o) >= 12)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((o) => {
      const px = ((o.paras ?? []).find(Boolean)?.runs[0]?.sz ?? 18) * PT
      const text = objectText(o)
      // a ticker is ONE short phrase the template repeats: it has room for about as many letters as the phrase it was drawn with
      const ticker = repeats(text) > 1
      // how wide a letter is in this box: heavy and capital letters are wider than the 0.52 em of ordinary text, and a box drawn for one big word has room for only about that many letters
      const r0 = (o.paras ?? []).find(Boolean)?.runs.find((r) => r.t.trim()) ?? null
      const heavy = !!r0 && (!!r0.b || (r0.w ?? 0) >= 700), caps = !!r0?.cap
      const glyph = caps ? (heavy ? 0.72 : 0.64) : heavy ? 0.62 : 0.52
      const ceil = /\s/.test(text.trim()) ? 12 : 4
      const phrase = ticker ? text.trim().split(/\s{2,}|\s*[-–—•|]\s*/)[0]!.length : 0
      return { id: o.id, text, fontSize: px, ticker, maxChars: ticker ? Math.max(6, phrase + 2) : Math.max(12, Math.round((o.w / (px * 0.52)) * Math.max(1, Math.floor(o.h / (px * 1.2))))), room: ticker ? Math.max(6, phrase + 2) : Math.max(ceil, Math.round((o.w / (px * glyph)) * Math.max(1, Math.floor(o.h / (px * 1.2))))) }
    })
}

/**
 * The branding and navigation text that every scene repeats (a wordmark, a date line, a section label): the template's own words in its own style, which a deck of someone else's must
 * replace once for the whole deck. One entry per object id, with the room it has.
 */
export function chromeSlots(tpl: MorphTemplate): { id: string; text: string; maxChars: number }[] {
  const count = new Map<string, number>()
  const key = (o: TemplateObject) => `${o.id}|${norm(objectText(o))}`
  for (const s of tpl.data.slides) for (const o of s.objects) if (o.kind === 'text') count.set(key(o), (count.get(key(o)) ?? 0) + 1)
  const out = new Map<string, { id: string; text: string; maxChars: number }>()
  for (const s of tpl.data.slides) for (const o of s.objects) {
    if (o.kind !== 'text' || !(o.paras ?? []).some(Boolean) || out.has(o.id)) continue
    if ((count.get(key(o)) ?? 0) < Math.max(3, tpl.data.slides.length * 0.35)) continue
    const px = ((o.paras ?? []).find(Boolean)?.runs[0]?.sz ?? 18) * PT
    if (px >= 24 || !/[\p{L}\p{N}]/u.test(objectText(o))) continue // a big one is already a text box of the scene (textSlots)
    out.set(o.id, { id: o.id, text: objectText(o), maxChars: Math.max(8, Math.round(o.w / (px * 0.52))) })
  }
  return [...out.values()]
}
