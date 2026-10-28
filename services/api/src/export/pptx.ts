import PptxGenJS from 'pptxgenjs'
import { resolveColor } from '@prompttoppt/theme'
import { CANVAS, type Presentation, type Slide, type SlideElement, type TextElement, type Theme } from '@prompttoppt/validation'
import { gradientPng, imageSize, parseColor } from './png.ts'
import { NAME_PREFIX, hasEntrance, injectMotion, type SlideMotion } from './motion.ts'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { generatedAsset } from '../db/schema.ts'
import { env } from '../env.ts'
import { assertPublicUrl, safeFetch } from '../sources/ssrf.ts'
import { getStorage } from '../storage/index.ts'

/** 1920 px canvas = 13.333 in → 144 px per inch; 1 pt = 2 px. */
const PX = 144
const inch = (px: number) => px / PX
const pt = (px: number) => Math.max(1, Math.round((px / 2) * 10) / 10)
const hex6 = (c: string) => c.replace('#', '').slice(0, 6).toUpperCase()
const transparency = (opacity: number) => Math.round((1 - Math.min(1, Math.max(0, opacity))) * 100)

export interface ImageData { data: string; w: number; h: number }
export type ImageLoader = (url: string) => Promise<ImageData | null>

const HEADING_ROLES = new Set<TextElement['role']>(['title', 'heading', 'metric', 'subtitle'])
const SKIP = new Set(['footer'])
/** Every exported object carries its element id in its name, so the animation step can find it in the finished file. */
const named = (el: { id: string }) => ({ objectName: `${NAME_PREFIX}${el.id}` })

const MAX_EXPORT_IMAGES = 40
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_REDIRECTS = 3
const isRaster = (b: Buffer) => (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') || b.toString('ascii', 0, 3) === 'GIF'

/** Reads a response body with a hard byte cap (never buffers an unbounded body). */
async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > max) return null
  const reader = res.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) { await reader.cancel(); return null }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/**
 * The server fetches picture URLs that live in a USER-CONTROLLED document, so this is an SSRF surface (cloud metadata, localhost, the VPC).
 *  · our own generated pictures are read straight from storage (never over HTTP),
 *  · our template photos come from the configured web origin only,
 *  · everything else (stock photos, user links) must resolve to a PUBLIC address: validated URL, validated connection address, every redirect
 *    re-validated, raster image types only, hard size cap, and at most MAX_EXPORT_IMAGES pictures per export.
 * Failures degrade to "no picture", never to a failed export.
 */
export const fetchImageLoader = (opts: { timeoutMs?: number; maxBytes?: number; maxImages?: number } = {}): ImageLoader => {
  let loaded = 0
  const max = opts.maxBytes ?? MAX_IMAGE_BYTES
  return async (url) => {
    try {
      if (++loaded > (opts.maxImages ?? MAX_EXPORT_IMAGES)) return null
      const u = new URL(url)
      let buf: Buffer | null = null
      const assetId = u.origin === new URL(env.API_URL).origin ? /^\/api\/v1\/assets\/([A-Za-z0-9_-]{32})$/.exec(u.pathname)?.[1] : undefined
      if (assetId) {
        const [row] = await db.select().from(generatedAsset).where(and(eq(generatedAsset.id, assetId), eq(generatedAsset.status, 'ready'), isNull(generatedAsset.deletedAt)))
        const bytes = row ? await (await getStorage()).get(row.storageKey) : null
        buf = bytes ? Buffer.from(bytes) : null
      } else if (u.origin === new URL(env.WEB_URL).origin && u.pathname.startsWith('/template-assets/')) {
        const res = await fetch(u, { signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000), redirect: 'error' })
        buf = res.ok ? await readCapped(res, max) : null
      } else {
        let cur = assertPublicUrl(url)
        for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS && !buf; hop++) {
          const res = (await safeFetch(cur.toString(), { redirect: 'manual', signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000), headers: { Accept: 'image/png,image/jpeg,image/gif' } })) as unknown as Response
          if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get('location')
            if (!loc) return null
            cur = assertPublicUrl(new URL(loc, cur).toString()) // every hop re-validated
            continue
          }
          if (!res.ok || !/^image\/(png|jpe?g|gif)/i.test(res.headers.get('content-type') ?? '')) return null
          buf = await readCapped(res, max)
          break
        }
      }
      if (!buf || buf.length > max || !isRaster(buf)) return null // webp/svg/heif/jxl etc.: not embeddable, and exotic parsers are an attack surface
      const size = imageSize(buf)
      if (!size) return null
      const mime = buf[0] === 0xff ? 'image/jpeg' : buf.toString('ascii', 1, 4) === 'PNG' ? 'image/png' : 'image/gif'
      return { data: `${mime};base64,${buf.toString('base64')}`, ...size }
    } catch { return null }
  }
}

function addText(slide: PptxGenJS.Slide, el: TextElement, theme: Theme, sl: Slide) {
  const color = hex6(resolveColor(el.color, theme, sl))
  const font = HEADING_ROLES.has(el.role) ? theme.fonts.heading : theme.fonts.body
  const size = pt(el.fontSize)
  const runs: PptxGenJS.TextProps[] = []
  el.paragraphs.forEach((p, pi) => {
    const last = pi === el.paragraphs.length - 1
    p.runs.forEach((r, ri) => {
      const isLast = ri === p.runs.length - 1
      runs.push({
        text: el.uppercase ? r.text.toUpperCase() : r.text,
        options: {
          ...((r.bold ?? (el.weight ? el.weight >= 600 : false)) ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(r.color ? { color: hex6(resolveColor(r.color, theme, sl)) } : {}), ...(r.link ? { hyperlink: { url: r.link } } : {}),
          ...(ri === 0 && p.list ? { bullet: p.list === 'number' ? { type: 'number' as const } : { characterCode: (el.bullet.codePointAt(0) ?? 0x2022).toString(16).toUpperCase().padStart(4, '0') } } : {}),
          ...(ri === 0 && p.list ? { indentLevel: 0 } : {}),
          breakLine: isLast && !last,
          paraSpaceAfter: isLast && !last ? Math.round(size * (el.paraGap ?? 0.5)) : 0,
        },
      })
    })
  })
  slide.addText(runs, {
    ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width), h: inch(el.height), margin: 0, fontFace: font, fontSize: size, color,
    align: el.align, valign: el.valign === 'middle' ? 'middle' : el.valign, lineSpacingMultiple: el.lineHeight ?? 1.2,
    ...(el.letterSpacing ? { charSpacing: Math.round((el.letterSpacing / 2) * 10) / 10 } : {}), rotate: el.rotation || 0,
    ...(el.opacity < 1 ? { transparency: transparency(el.opacity) } : {}), wrap: true, fit: 'none',
  })
}

function addShape(pptx: PptxGenJS, slide: PptxGenJS.Slide, el: Extract<SlideElement, { type: 'shape' }>, theme: Theme, sl: Slide) {
  const pos = { ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width), h: inch(el.height), rotate: el.rotation || 0 }
  const line = el.stroke ? { color: hex6(resolveColor(el.stroke, theme, sl)), width: pt(el.strokeWidth ?? 3), transparency: transparency(el.opacity) } : { type: 'none' as const }
  const T = pptx.ShapeType
  if (el.gradient && el.shape !== 'line' && el.shape !== 'ring') {
    // a gradient fill = a gradient picture (clipped to a circle for ellipses); keeps the look PowerPoint's shape API can't express
    slide.addImage({ data: gradientPng(el.gradient.from, el.gradient.to, el.gradient.angle, el.opacity), ...pos, ...(el.shape === 'ellipse' ? { rounding: true } : {}) })
    return
  }
  const fillHex = el.fill === 'none' ? null : resolveColor(el.fill, theme, sl)
  const fill = fillHex ? { color: hex6(fillHex), transparency: transparency(el.opacity * parseColor(fillHex).a) } : { type: 'none' as const }
  if (el.shape === 'line') { slide.addShape(T.line, { ...pos, line: { color: hex6(fillHex ?? theme.colors.textPrimary), width: pt(el.strokeWidth ?? 3) } }); return }
  if (el.shape === 'ring') { slide.addShape(T.ellipse, { ...pos, fill: { type: 'none' }, line: line.type === 'none' ? { color: hex6(fillHex ?? theme.colors.primary), width: 2, transparency: transparency(el.opacity) } : line }); return }
  if (el.shape === 'ellipse') { slide.addShape(T.ellipse, { ...pos, fill, line }); return }
  if (el.shape === 'triangle') { slide.addShape(T.triangle, { ...pos, fill, line }); return }
  if (el.shape === 'chevron') { slide.addShape(T.chevron, { ...pos, fill, line }); return }
  if (el.radius > 0) {
    const r = Math.min(0.5, el.radius / Math.min(el.width, el.height))
    slide.addShape(T.roundRect, { ...pos, fill, line, rectRadius: r * Math.min(pos.w, pos.h) })
  } else slide.addShape(T.rect, { ...pos, fill, line })
}

async function addImageEl(pptx: PptxGenJS, slide: PptxGenJS.Slide, el: Extract<SlideElement, { type: 'image' }>, load: ImageLoader) {
  const pos = { ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width), h: inch(el.height), rotate: el.rotation || 0 }
  const img = el.src ? await load(el.src) : null
  if (!img) {
    slide.addShape(pptx.ShapeType.rect, { ...pos, fill: { color: 'E5E7EB' }, line: { type: 'none' } })
    slide.addText(el.alt || 'Image', { ...pos, align: 'center', valign: 'middle', fontSize: 12, color: '6B7280', margin: 4 })
    return
  }
  const round = el.clip === 'circle'
  slide.addImage({
    data: img.data, ...pos, altText: el.alt, ...(round ? { rounding: true } : {}),
    sizing: el.fit === 'contain' ? { type: 'contain', w: pos.w, h: pos.h } : { type: 'cover', w: pos.w, h: pos.h },
    ...(el.opacity < 1 ? { transparency: transparency(el.opacity) } : {}),
  })
  void img.w
  if (el.overlay) slide.addImage({ data: gradientPng(el.overlay.from, el.overlay.to, el.overlay.angle, el.overlay.opacity), ...pos, ...(round ? { rounding: true } : {}) })
}

function addChartEl(slide: PptxGenJS.Slide, el: Extract<SlideElement, { type: 'chart' }>, theme: Theme) {
  const k = theme.colors
  const palette = [k.primary, k.accent, k.secondary, mixHex(k.primary, k.accent), mixHex(k.accent, k.secondary), mixHex(k.primary, k.secondary)].map(hex6)
  const data = el.series.map((s) => ({ name: s.name, labels: el.labels, values: s.values }))
  const type = el.chartType
  const circular = el.chartType === 'pie' || el.chartType === 'doughnut'
  slide.addChart(type, data, {
    ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width), h: inch(el.height),
    chartColors: circular ? el.labels.map((_, i) => palette[i % palette.length]!) : palette.slice(0, el.series.length),
    showLegend: el.series.length > 1 || circular, legendPos: 'b', legendFontFace: theme.fonts.body, legendFontSize: 12, legendColor: hex6(k.textSecondary),
    catAxisLabelFontFace: theme.fonts.body, catAxisLabelFontSize: 12, catAxisLabelColor: hex6(k.textSecondary),
    valAxisLabelFontFace: theme.fonts.body, valAxisLabelFontSize: 12, valAxisLabelColor: hex6(k.textSecondary),
    valGridLine: { color: hex6(mixHex(k.textSecondary, k.background, 0.8)), size: 0.5 }, catGridLine: { style: 'none' },
    showValue: circular || el.labels.length <= 8, dataLabelFontFace: theme.fonts.body, dataLabelFontSize: 12, dataLabelColor: hex6(circular ? k.onPrimary : k.textPrimary),
    ...(el.chartType === 'bar' ? { barGapWidthPct: 60 } : {}), ...(el.unit ? { dataLabelFormatCode: `#,##0.##"${el.unit.replace(/"/g, '')}"` } : {}),
  })
}
const mixHex = (a: string, b: string, t = 0.5) => { const x = parseColor(a), y = parseColor(b); const h = (n: number) => Math.round(n).toString(16).padStart(2, '0'); return `#${h(x.r + (y.r - x.r) * t)}${h(x.g + (y.g - x.g) * t)}${h(x.b + (y.b - x.b) * t)}` }

function addTableEl(slide: PptxGenJS.Slide, el: Extract<SlideElement, { type: 'table' }>, theme: Theme) {
  const k = theme.colors
  const cell = (text: string, head: boolean, i: number): PptxGenJS.TableCell => ({
    text, options: { bold: head, fontFace: head ? theme.fonts.heading : theme.fonts.body, fontSize: pt(head ? 26 : 24), color: hex6(head ? k.onPrimary : k.textPrimary), fill: { color: hex6(head ? k.primary : i % 2 ? k.surface : k.background) }, valign: 'middle', margin: [0.06, 0.1, 0.06, 0.1], border: { type: 'solid', pt: 0.5, color: hex6(mixHex(k.textSecondary, k.background, 0.75)) } },
  })
  slide.addTable([el.header.map((h) => cell(h, true, 0)), ...el.rows.map((r, i) => el.header.map((_, c) => cell(r[c] ?? '', false, i)))], { ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width) })
}

const sortByZ = (els: SlideElement[]) => [...els].sort((a, b) => a.zIndex - b.zIndex)

/** Presentation JSON → .pptx (editable text, native charts/tables, embedded pictures, speaker notes, slide transitions and entrance animations — see motion.ts). */
export async function buildPptx(doc: Presentation, load: ImageLoader): Promise<Buffer> {
  const pptx = new PptxGenJS()
  const { width, height } = CANVAS[doc.aspectRatio]
  pptx.defineLayout({ name: 'DECK', width: inch(width), height: inch(height) })
  pptx.layout = 'DECK'
  pptx.title = doc.title
  pptx.company = 'promptToPpt'
  pptx.theme = { headFontFace: doc.theme.fonts.heading, bodyFontFace: doc.theme.fonts.body }

  const motion: SlideMotion[] = []
  for (const sl of doc.slides) {
    const slide = pptx.addSlide()
    const m: SlideMotion = { transition: sl.transition ?? { type: doc.theme.motion?.transition ?? 'none', duration: doc.theme.motion?.duration ?? 500 }, targets: [] }
    motion.push(m)
    const bg = sl.background
    if (bg?.type === 'gradient' && bg.gradient) slide.background = { data: gradientPng(bg.gradient.from, bg.gradient.to, bg.gradient.angle) }
    else if (bg?.type === 'image') { const img = await load(bg.value); slide.background = img ? { data: img.data } : { color: hex6(doc.theme.colors.background) } }
    else slide.background = { color: hex6(bg?.value ?? doc.theme.colors.background) }

    for (const el of sortByZ(sl.elements)) {
      if (SKIP.has(el.type)) continue
      if (hasEntrance(el.animation)) m.targets.push({ elementId: el.id, animation: el.animation, paragraphs: el.type === 'text' ? el.paragraphs.length : 1 })
      switch (el.type) {
        case 'text': addText(slide, el, doc.theme, sl); break
        case 'shape': addShape(pptx, slide, el, doc.theme, sl); break
        case 'image': await addImageEl(pptx, slide, el, load); break
        case 'chart': addChartEl(slide, el, doc.theme); break
        case 'table': addTableEl(slide, el, doc.theme); break
        case 'icon': slide.addText(el.name, { ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width), h: inch(el.height), fontSize: pt(el.height * 0.7), align: 'center', valign: 'middle', margin: 0, rotate: el.rotation || 0 }); break
        default: break // diagram: not generated by any layout yet
      }
    }
    if (sl.speakerNotes) slide.addNotes(sl.speakerNotes)
  }
  return injectMotion((await pptx.write({ outputType: 'nodebuffer' })) as Buffer, motion)
}
