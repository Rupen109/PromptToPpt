import sharp from 'sharp'
import { xmlSafeFile } from './xml-safe.ts'
import PptxGenJS from 'pptxgenjs'
import { resolveColor, slideBase, slideTheme } from '@prompttoppt/theme'
import { CANVAS, PICTURE_SHADOWS, patternSvg, pictureRadius, pptRoundAdj, TEXT_SHADOWS, flipOf, pptDash, pptLineMultiple, turnOf, canStack, chartColor, chartLookOn, chartShowsFigures, isRunBold, isRunItalic, deckChartColors, highlightText, cellSpans, alignOf, scatterXs, legendPlace, linearTrend, flattenShape, shapeDef, type Presentation, type Slide, type SlideElement, type TextElement, type Theme } from '@prompttoppt/validation'
import { gradientPng, imageSize, parseColor } from './png.ts'
import { roundPictures, type PictureRounding } from './picture-geometry.ts'
import { inkStackedLabels } from './chart-labels.ts'
import { scatterTrendlines } from './scatter-trend.ts'
import { backgroundPicture, bakePicture, needsBake } from './picture-bake.ts'
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
/** the turn as PowerPoint stores it: 0..360 clockwise (the deck keeps -180..180); charts and tables are never turned (the same rule as the screen, packages/validation rotation.ts) */
const turnPpt = (el: { type: string; rotation?: number | undefined }) => { const r = turnOf(el); return r < 0 ? r + 360 : r }
/** mirroring as PowerPoint stores it (`flipH` / `flipV` on the object's frame, applied before the turn, as the screen does) */
const flipPpt = (el: { type: string; flipH?: boolean | undefined; flipV?: boolean | undefined }) => { const f = flipOf(el); return { ...(f.h ? { flipH: true } : {}), ...(f.v ? { flipV: true } : {}) } }

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
  const font = HEADING_ROLES.has(el.role) ? slideTheme(theme, sl).fonts.heading : slideTheme(theme, sl).fonts.body // (the slide's own brand fonts: theme/slide-theme.ts)
  const size = pt(el.fontSize)
  // Arabic, Hebrew, Persian, Urdu… read right-to-left: PowerPoint needs each paragraph flagged, and "left" then means the reading start (the right edge)
  const rtl = RTL_CHARS.test(el.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' '))
  const runs: PptxGenJS.TextProps[] = []
  // the box's effects as the screen draws them (packages/validation text-effects.ts): an outline on every letter, a shadow under them, a highlight behind words
  const outline = el.textOutline ? { color: hex6(resolveColor(el.textOutline.color, theme, sl)), size: pt(el.textOutline.width) } : null
  const sh = el.textShadow ? TEXT_SHADOWS[el.textShadow] : null
  el.paragraphs.forEach((p, pi) => {
    const last = pi === el.paragraphs.length - 1
    p.runs.forEach((r, ri) => {
      const isLast = ri === p.runs.length - 1
      runs.push({
        text: el.uppercase ? r.text.toUpperCase() : r.text,
        options: {
          ...(rtl ? { rtlMode: true } : {}),
          ...(isRunBold(r, el) ? { bold: true } : {}), ...(isRunItalic(r, el) ? { italic: true } : {}), ...(r.underline ? { underline: { style: 'sng' as const } } : {}), ...(r.color ? { color: hex6(resolveColor(r.color, theme, sl)) } : r.highlight ? { color: hex6(highlightText(r.highlight)) } : {}), ...(r.highlight ? { highlight: hex6(r.highlight) } : {}), ...(outline ? { outline } : {}), ...(r.link ? { hyperlink: { url: r.link } } : {}),
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
    align: rtl && el.align === 'left' ? 'right' : rtl && el.align === 'right' ? 'left' : el.align, ...(rtl ? { rtlMode: true } : {}), valign: el.valign === 'middle' ? 'middle' : el.valign, lineSpacingMultiple: pptLineMultiple(el.lineHeight), // (PowerPoint's 1.0 is 1.2 × the size: the screen's line height ÷ 1.2)
    ...(el.letterSpacing ? { charSpacing: Math.round((el.letterSpacing / 2) * 10) / 10 } : {}), rotate: turnPpt(el),
    ...(el.opacity < 1 ? { transparency: transparency(el.opacity) } : {}), wrap: true, fit: 'none',
    ...(sh ? { shadow: { type: 'outer' as const, angle: 90, offset: Math.round((sh.dy / 2) * 10) / 10, blur: Math.round((sh.blur / 2) * 10) / 10, color: '000000', opacity: sh.alpha } } : {}),
  })
}

/** any letter from a right-to-left script (Hebrew, Arabic, Syriac, Thaana, N'Ko…) */
const RTL_CHARS = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

function addShape(pptx: PptxGenJS, slide: PptxGenJS.Slide, el: Extract<SlideElement, { type: 'shape' }>, theme: Theme, sl: Slide) {
  // a shadow under the shape, the pictures' presets (straight down, black), as the screen draws it
  const sh = el.shadow && el.shadow !== 'none' ? PICTURE_SHADOWS[el.shadow] : null
  const pos = { ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width), h: inch(el.height), rotate: turnPpt(el), ...flipPpt(el), ...(sh ? { shadow: { type: 'outer' as const, angle: 90, offset: Math.round((sh.dy / 2) * 10) / 10, blur: Math.round((sh.blur / 2) * 10) / 10, color: '000000', opacity: sh.alpha } } : {}) }
  const dash = pptDash(el.strokeDash) // dashed / dotted, PowerPoint's own preset (the screen draws the same proportions: packages/validation stroke.ts)
  const line = el.stroke && (el.strokeWidth ?? 3) > 0 ? { color: hex6(resolveColor(el.stroke, theme, sl)), width: pt(el.strokeWidth ?? 3), transparency: transparency(el.opacity), ...(dash ? { dashType: dash } : {}) } : { type: 'none' as const }
  const T = pptx.ShapeType
  if (el.gradient && el.shape !== 'line' && el.shape !== 'ring') {
    // a gradient fill = a gradient picture (clipped to a circle for ellipses); keeps the look PowerPoint's shape API can't express
    slide.addImage({ data: gradientPng(el.gradient.from, el.gradient.to, el.gradient.angle, el.opacity, 96, el.gradient.kind), ...pos, ...(el.shape === 'ellipse' ? { rounding: true } : {}) })
    // its outline on top, as the screen draws it (the picture alone dropped it)
    if (line.type !== 'none') addShape(pptx, slide, { ...el, gradient: undefined, fill: 'none', shadow: 'none' }, theme, sl)
    return
  }
  const fillHex = el.fill === 'none' ? null : resolveColor(el.fill, theme, sl)
  const fill = fillHex ? { color: hex6(fillHex), transparency: transparency(el.opacity * parseColor(fillHex).a) } : { type: 'none' as const }
  // a line runs through the middle of its box, as thick as the box is tall (as the slide draws it; from corner to corner it came out sloped)
  if (el.shape === 'line') { slide.addShape(T.line, { ...pos, y: inch(el.y + el.height / 2), h: 0, line: { color: hex6(fillHex ?? slideTheme(theme, sl).colors.textPrimary), width: pt(el.height), ...(dash ? { dashType: dash } : {}) } }); return }
  if (el.shape === 'ring') { slide.addShape(T.ellipse, { ...pos, fill: { type: 'none' }, line: line.type === 'none' ? { color: hex6(fillHex ?? slideTheme(theme, sl).colors.primary), width: pt(el.strokeWidth ?? 3), transparency: transparency(el.opacity), ...(dash ? { dashType: dash } : {}) } : line }); return }
  if (el.shape === 'ellipse') { slide.addShape(T.ellipse, { ...pos, fill, line }); return }
  if (el.shape === 'triangle') { slide.addShape(T.triangle, { ...pos, fill, line }); return }
  if (el.shape === 'chevron') { slide.addShape(T.chevron, { ...pos, fill, line }); return }
  const def = shapeDef(el.shape)
  if (def) {
    // library shape: the outline flattened into a free-form PowerPoint shape (every contour, so holes in frames and signs survive)
    const points: Array<Record<string, unknown>> = []
    for (const contour of flattenShape(def.path)) {
      contour.forEach(([x, y], i) => points.push({ x: (x / 100) * pos.w, y: (y / 100) * pos.h, ...(i === 0 ? { moveTo: true } : {}) }))
      points.push({ close: true })
    }
    slide.addShape('custGeom' as never, { ...pos, fill, line, points } as never)
    return
  }
  if (el.radius > 0) {
    const r = Math.min(0.5, el.radius / Math.min(el.width, el.height))
    slide.addShape(T.roundRect, { ...pos, fill, line, rectRadius: r * Math.min(pos.w, pos.h) })
  } else slide.addShape(T.rect, { ...pos, fill, line })
}

/**
 * The deck's footer (slide numbers, and the deck's title in "brand" mode), drawn where and how the editor draws it (packages/ui SlideCanvas Footer): bottom of the slide, the number on the right as
 * "01 / 06", the title on the left, a quiet colour that reads on the slide's background; never on a title slide. It is not an object of the slide, so it is not animated or picked up by Morph.
 */
function addFooter(slide: PptxGenJS.Slide, doc: Presentation, sl: Slide, index: number) {
  const st = slideTheme(doc.theme, sl) // (the slide's own brand fonts and colours)
  const mode = doc.theme.style?.footer ?? 'none'
  if (mode === 'none' || sl.layoutId === 'title') return
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const M = Math.round(W * 0.05)
  const bg = sl.background?.type === 'color' ? sl.background.value : st.colors.background
  const dark = parseInt(bg.slice(1, 3), 16) * 0.299 + parseInt(bg.slice(3, 5), 16) * 0.587 + parseInt(bg.slice(5, 7), 16) * 0.114 < 128
  const color = dark ? 'D9D9D9' : hex6(st.colors.textSecondary)
  const y = H - M * 0.55 - 14, h = 34
  const common = { y: inch(y), h: inch(h), margin: 0, fontFace: st.fonts.body, fontSize: pt(22), color, charSpacing: 1, valign: 'middle' as const }
  if (mode === 'brand') slide.addText(doc.theme.style?.footerText || doc.title, { ...common, x: inch(M), w: inch(W * 0.6), align: 'left', fit: 'shrink' })
  slide.addText(`${String(index + 1).padStart(2, '0')} / ${String(doc.slides.length).padStart(2, '0')}`, { ...common, x: inch(W - M - 360), w: inch(360), align: 'right' })
}

async function addImageEl(pptx: PptxGenJS, slide: PptxGenJS.Slide, given: Extract<SlideElement, { type: 'image' }>, load: ImageLoader, theme: Theme, sl: Slide, rounded: Map<string, PictureRounding>) {
  // its corners as the slide draws them (its own radius, else the deck's), and a border in a theme colour in the deck's real colour
  const radius = pictureRadius(given, theme.radius)
  const el = { ...given, radius, ...(given.border ? { border: { ...given.border, color: resolveColor(given.border.color, theme, sl) as typeof given.border.color } } : {}) }
  const pos = { ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width), h: inch(el.height), rotate: turnPpt(el), ...flipPpt(el) }
  const img = el.src ? await load(el.src) : null
  if (!img) {
    slide.addShape(pptx.ShapeType.rect, { ...pos, fill: { color: 'E5E7EB' }, line: { type: 'none' } })
    slide.addText(el.alt || 'Image', { ...pos, flipH: false, flipV: false, align: 'center', valign: 'middle', fontSize: 12, color: '6B7280', margin: 4 })
    return
  }
  // rounded corners: PowerPoint's own rounded rectangle, so a plain photo stays the JPEG it was (a baked picture has them in its own see-through corners: its frame
  // may be larger, with room for a shadow, so it is never rounded again); the colour wash over a picture has its own name and is rounded the same way
  // (the wash keeps the picture's name: they fade in together and Morph pairs them by it; so the rounding says from which of the name's shapes on: 0 = all, 1 = after the baked picture)
  const adj = el.clip !== 'circle' && radius > 0 ? pptRoundAdj(radius, el.width, el.height) : 0
  // zoom, light adjustments, cut shapes, rounded corners and shadows are baked into the picture (a PowerPoint picture is only a rectangle or an ellipse): the file shows what the editor shows
  if (needsBake(el)) {
    try {
      const baked = await bakePicture(Buffer.from(img.data.slice(img.data.indexOf('base64,') + 7), 'base64'), el)
      const bp = { ...pos, x: pos.x - inch(baked.pad), y: pos.y - inch(baked.pad), w: pos.w + 2 * inch(baked.pad), h: pos.h + 2 * inch(baked.pad) }
      slide.addImage({ data: `image/png;base64,${baked.png.toString('base64')}`, ...bp, altText: el.alt, sizing: { type: 'cover', w: bp.w, h: bp.h }, ...(el.opacity < 1 ? { transparency: transparency(el.opacity) } : {}) })
      if (el.overlay) { slide.addImage({ data: gradientPng(el.overlay.from, el.overlay.to, el.overlay.angle, el.overlay.opacity), ...pos }); if (adj) rounded.set(named(el).objectName, { adj, from: 1 }) }
      return
    } catch { /* a picture that cannot be processed is placed as it is (below) rather than leaving a hole in the file */ }
  }
  const round = el.clip === 'circle'
  if (adj) rounded.set(named(el).objectName, { adj, from: 0 })
  slide.addImage({
    data: img.data, ...pos, altText: el.alt, ...(round ? { rounding: true } : {}),
    sizing: el.fit === 'contain' ? { type: 'contain', w: pos.w, h: pos.h } : { type: 'cover', w: pos.w, h: pos.h },
    ...(el.opacity < 1 ? { transparency: transparency(el.opacity) } : {}),
  })
  void img.w
  if (el.overlay) slide.addImage({ data: gradientPng(el.overlay.from, el.overlay.to, el.overlay.angle, el.overlay.opacity), ...pos, ...(round ? { rounding: true } : {}) })
}

/** adds one chart (one chart file in the deck, in order); returns the trend line colours of a SCATTER with a trend line (scatter-trend.ts adds PowerPoint's own trendline to it), else null */
function addChartEl(slide: PptxGenJS.Slide, el: Extract<SlideElement, { type: 'chart' }>, theme: Theme, on: Slide): string[] | null {
  // the slide's own colours and backdrop decide the chart's colours and words, as on the screen (chart-style.ts chartLookOn)
  const look = chartLookOn(slideBase(theme, on).colors, on) // (the slide's own brand, then its own look)
  const font = slideTheme(theme, on).fonts.body
  const k = { ...slideBase(theme, on).colors, ...look.colors }, ink = look.ink, behind = look.backdrop[0]!
  const deck = look.palette
  const circular = el.chartType === 'pie' || el.chartType === 'doughnut'
  // the person's own colours (one per series or per slice) replace the deck's, from the same helper the screen uses
  const colorOf = (i: number) => hex6(chartColor(el.colors, i, deck))
  const data = el.series.map((s) => ({ name: s.name, labels: el.labels, values: s.values }))
  const type = el.chartType
  const place = legendPlace({ legend: el.legend, circular, series: el.series.length })
  // stacked bars (chart-style.ts): PowerPoint's own grouping, the figures centred in each segment (coloured per series to read on it: chart-labels.ts), a 0-100% axis for shares
  const stacked = el.stack && canStack(el) ? el.stack : undefined
  const stackedOpts = stacked ? {
    barGrouping: stacked === 'percent' ? 'percentStacked' : 'stacked', dataLabelPosition: 'ctr',
    ...(stacked === 'percent' ? { valAxisLabelFormatCode: '0%' } : {}),
  } : {}
  const common = {
    ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width), h: inch(el.height),
    showLegend: place !== 'none', legendPos: place === 'right' ? 'r' : 'b', legendFontFace: font, legendFontSize: 12, legendColor: hex6(ink),
    catAxisLabelFontFace: font, catAxisLabelFontSize: 12, catAxisLabelColor: hex6(ink),
    valAxisLabelFontFace: font, valAxisLabelFontSize: 12, valAxisLabelColor: hex6(ink),
    valGridLine: { color: hex6(mixHex(ink, behind, 0.8)), size: 0.5 }, catGridLine: { style: 'none' }, valAxisLineShow: false, catAxisLineColor: hex6(mixHex(ink, behind, 0.8)), // (as on the screen: grid lines, the bottom one the base line, no upright axis line)
    showValue: chartShowsFigures(el), dataLabelFontFace: font, dataLabelFontSize: 12, dataLabelColor: hex6(circular ? k.onPrimary : ink),
    ...(el.chartType === 'bar' ? { barGapWidthPct: 60 } : {}), ...(stacked ? stackedOpts : {}), ...(el.unit ? { dataLabelFormatCode: `#,##0.##"${el.unit.replace(/"/g, '')}"` } : {}),
  } as PptxGenJS.IChartOpts
  const trends = el.trendline && !circular && !stacked && !(el.chartType === 'scatter' && scatterXs(el.labels)) ? el.series.map((s, i) => ({ name: `${s.name || 'Series'} trend`, labels: el.labels, values: linearTrend(s.values.slice(0, el.labels.length)) ?? s.values, color: colorOf(i) })) : []
  if (circular) { slide.addChart(type, data, { ...common, chartColors: el.labels.map((_, i) => colorOf(i)) }); return null }
  const seriesColors = el.series.map((_, i) => colorOf(i))
  // a SCATTER: PowerPoint's own XY chart (the labels are its x values: chart-style.ts scatterXs), points only; a trend line is PowerPoint's own trendline, added after (scatter-trend.ts).
  // Labels that are not numbers are drawn as a line chart, as the screen does.
  const xs = type === 'scatter' ? scatterXs(el.labels) : null
  if (xs) {
    const xy = [{ name: 'X', values: xs }, ...el.series.map((s) => ({ name: s.name, values: s.values.slice(0, xs.length) }))]
    slide.addChart('scatter' as PptxGenJS.CHART_NAME, xy as never, { ...common, chartColors: seriesColors, lineSize: 0, lineDataSymbol: 'circle', lineDataSymbolSize: 9, valAxisMinVal: 0 } as PptxGenJS.IChartOpts)
    return el.trendline ? seriesColors : null
  }
  const drawn = (type === 'scatter' ? 'line' : type) as PptxGenJS.CHART_NAME
  // an area chart's fills are see-through, as on screen, so a series behind another stays visible
  const areaFill = drawn === 'area' ? { chartColorsOpacity: 55 } : {}
  if (!trends.length) { slide.addChart(drawn, data, { ...common, ...areaFill, chartColors: seriesColors } as PptxGenJS.IChartOpts); return null }
  // a trend line is one more line (dashed, no marks, no figures) for each series, drawn over the chart: PowerPoint's own way is a second chart type in the same chart (one dash style per type, so a line
  // chart's own lines stay solid)
  const trendOpts = { chartColors: trends.map((t) => t.color), lineDash: 'dash', lineSize: 2, lineDataSymbol: 'none', showValue: false } as PptxGenJS.IChartOpts
  const main = { chartColors: seriesColors, ...areaFill, ...(type === 'bar' ? { barGapWidthPct: 60 } : { lineDataSymbol: 'none' }) } as PptxGenJS.IChartOpts
  const addMulti = slide.addChart.bind(slide) as unknown as (types: unknown[], opts: PptxGenJS.IChartOpts) => unknown // (the library takes the options as the second argument for a chart of several types; its typings do not say so)
  addMulti([{ type: drawn, data, options: main }, { type: 'line', data: trends.map(({ name, labels, values }) => ({ name, labels, values })), options: trendOpts }], common)
  return null
}
const mixHex = (a: string, b: string, t = 0.5) => { const x = parseColor(a), y = parseColor(b); const h = (n: number) => Math.round(n).toString(16).padStart(2, '0'); return `#${h(x.r + (y.r - x.r) * t)}${h(x.g + (y.g - x.g) * t)}${h(x.b + (y.b - x.b) * t)}` }

function addTableEl(slide: PptxGenJS.Slide, el: Extract<SlideElement, { type: 'table' }>, theme: Theme) {
  const k = theme.colors
  // 'none' = no fill: the slide shows through (a table made in the editor starts that way)
  const fillOf = (c: string, bg: string) => ({ color: hex6(c === 'none' ? bg : c), ...(c === 'none' ? { transparency: 100 } : {}) })
  const cell = (text: string, head: boolean, i: number, c = -1): PptxGenJS.TableCell => {
    const hl = head ? undefined : el.highlights?.find((h) => h.row === i && h.column === c)
    const base = {
    text, options: { bold: head, fontFace: head ? theme.fonts.heading : theme.fonts.body, fontSize: pt((head ? 26 : 24) * (el.fontSize ?? 30) / 30), color: hex6(head ? (el.headerColor ?? k.onPrimary) : (el.textColor ?? k.textPrimary)), fill: fillOf(head ? (el.headerFill ?? k.primary) : i % 2 ? (el.altRowFill ?? k.background) : (el.rowFill ?? k.surface), k.background), valign: 'middle', margin: [0.06, 0.1, 0.06, 0.1], border: el.borderColor ? { type: 'solid', pt: 1.5, color: hex6(el.borderColor) } : { type: 'solid', pt: 0.5, color: hex6(mixHex(k.textSecondary, k.background, 0.75)) } },
    } as PptxGenJS.TableCell
    if (hl) { base.options = { ...base.options, bold: true, color: hex6(highlightText(hl.fill)), fill: { color: hex6(hl.fill) } } }
    return base
  }
  // merged cells (packages/validation table-merge.ts, the same rule as the screen): the top-left cell carries colspan/rowspan, the cells it covers are left out (the
  // library then writes PowerPoint's own gridSpan/rowSpan with hMerge/vMerge); a header area across columns is centred, as on screen
  const span = cellSpans(el)
  const spanned = (tc: PptxGenJS.TableCell, sp: { rows: number; columns: number }, head: boolean) => {
    if (sp.rows === 1 && sp.columns === 1) return tc
    return { ...tc, options: { ...tc.options, ...(sp.columns > 1 ? { colspan: sp.columns } : {}), ...(sp.rows > 1 ? { rowspan: sp.rows } : {}) } }
  }
  // how the words sit in each cell: the same rule as the screen (alignOf: the cell's own setting, else header group centred, left, middle)
  const aligned = (tc: PptxGenJS.TableCell, r: number, c: number) => { const a = alignOf(el, r, c); return { ...tc, options: { ...tc.options, align: a.h, valign: a.v } } }
  const row = (r: number, texts: string[], head: boolean) => texts.flatMap((t, c) => { const sp = span(r, c); return sp.covered ? [] : [aligned(spanned(cell(t, head, head ? 0 : r, c), sp, head), r, c)] })
  slide.addTable([row(-1, el.header, true), ...el.rows.map((r, i) => row(i, el.header.map((_, c) => r[c] ?? ''), false))], { ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width) })
}

const sortByZ = (els: SlideElement[]) => [...els].sort((a, b) => a.zIndex - b.zIndex)

/** Presentation JSON → .pptx (editable text, native charts/tables, embedded pictures, speaker notes, slide transitions and entrance animations — see motion.ts). */
/**
 * The .pptx of a deck, or of some of its slides (`slideIds`, in deck order: "this slide", "slides 1-3, 5"). A part keeps the deck's own slide numbers in its footer ("07 / 12", as the
 * editor shows that slide), and a Morph pairs objects with the slide before it IN THE FILE.
 */
export async function buildPptx(doc: Presentation, load: ImageLoader, opts: { slideIds?: readonly string[] | undefined } = {}): Promise<Buffer> {
  const only = opts.slideIds ? new Set(opts.slideIds) : null
  const slides = only ? doc.slides.filter((s) => only.has(s.id)) : doc.slides
  const pptx = new PptxGenJS()
  const { width, height } = CANVAS[doc.aspectRatio]
  pptx.defineLayout({ name: 'DECK', width: inch(width), height: inch(height) })
  pptx.layout = 'DECK'
  pptx.title = doc.title
  pptx.company = 'SlidesDone'
  pptx.theme = { headFontFace: doc.theme.fonts.heading, bodyFontFace: doc.theme.fonts.body }

  const motion: SlideMotion[] = []
  /** charts in the order they are added (the library numbers its chart files the same way): the scatters that get PowerPoint's own trendline, with their series colours */
  let chartNo = 0
  const scatterTrends = new Map<number, string[]>()
  /** per slide of the file: the pictures to round (name → PowerPoint's adj) */
  const rounded: Map<string, PictureRounding>[] = []
  for (const sl of slides) {
    const slide = pptx.addSlide()
    const roundedNow = new Map<string, PictureRounding>(); rounded.push(roundedNow)
    const elementList: { id: string; type: SlideElement['type'] }[] = []
    const own = new Set((sl.effects ?? []).map((e) => e.elementId)) // an object with effects of its own plays those instead of the theme's automatic entrance
    const m: SlideMotion = { transition: sl.transition ?? { type: doc.theme.motion?.transition ?? 'none', duration: doc.theme.motion?.duration ?? 500 }, targets: [], effects: sl.effects ?? [], elements: elementList, canvas: { w: width, h: height } }
    motion.push(m)
    const bg = sl.background
    if (bg?.type === 'gradient' && bg.gradient) slide.background = { data: gradientPng(bg.gradient.from, bg.gradient.to, bg.gradient.angle, 1, 96, bg.gradient.kind) }
    else if (bg?.type === 'image') {
      const img = await load(bg.value)
      // cover-fitted and softened as the screen shows it (a picture that cannot be processed is used as it is rather than left out)
      let data = img?.data
      if (img) try { data = await backgroundPicture(Buffer.from(img.data.slice(img.data.indexOf('base64,') + 7), 'base64'), width, height, bg.blur ?? 0) } catch { /* as it is */ }
      // the file name carries the real kind (without one the library names every background .png: a JPEG labelled PNG, which PowerPoint may call a damaged file)
      slide.background = data ? { data, path: /^image\/png/.test(data) ? 'background.png' : 'background.jpg' } : { color: hex6(slideTheme(doc.theme, sl).colors.background) }
    }
    else if (bg?.type === 'color' && bg.pattern && /^#[0-9a-f]{6}$/i.test(bg.value)) {
      // a pattern: the screen's very drawing (validation background-pattern.ts) rendered to a picture of the slide's size (flat colours: a small PNG)
      const png = await sharp(Buffer.from(patternSvg(bg.pattern, bg.value, width, height))).png({ compressionLevel: 9, palette: true }).toBuffer()
      slide.background = { data: `image/png;base64,${png.toString('base64')}`, path: 'pattern.png' }
    }
    else slide.background = { color: hex6(bg?.value ?? slideTheme(doc.theme, sl).colors.background) }

    for (const el of sortByZ(sl.elements)) {
      if (SKIP.has(el.type) || el.hidden) continue // an object switched off in the Selection pane is not exported
      elementList.push({ id: el.id, type: el.type })
      if (hasEntrance(el.animation) && !own.has(el.id)) m.targets.push({ elementId: el.id, animation: el.animation, paragraphs: el.type === 'text' ? el.paragraphs.length : 1 })
      switch (el.type) {
        case 'text': addText(slide, el, doc.theme, sl); break
        case 'shape': addShape(pptx, slide, el, doc.theme, sl); break
        case 'image': await addImageEl(pptx, slide, el, load, doc.theme, sl, roundedNow); break
        case 'chart': { chartNo++; const trend = addChartEl(slide, el, doc.theme, sl); if (trend) scatterTrends.set(chartNo, trend); break }
        case 'table': addTableEl(slide, el, slideTheme(doc.theme, sl)); break // (a table reads the slide's colours: its own brand and own look)
        case 'icon': slide.addText(el.name, { ...named(el), x: inch(el.x), y: inch(el.y), w: inch(el.width), h: inch(el.height), fontSize: pt(el.height * 0.7), align: 'center', valign: 'middle', margin: 0, rotate: turnPpt(el) }); break
        default: break // diagram: not generated by any layout yet
      }
    }
    addFooter(slide, doc, sl, doc.slides.indexOf(sl))
    if (sl.speakerNotes) slide.addNotes(sl.speakerNotes)
  }
  // Morph: an object that is the same object (same id and type) on a Morph slide and on the slide before it is named alike on both, which is how PowerPoint pairs them
  slides.forEach((sl, i) => {
    if (sl.transition?.type !== 'morph' || i === 0) return
    const before = new Map(motion[i - 1]!.elements!.map((e) => [e.id, e.type]))
    const pairs = new Set(motion[i]!.elements!.filter((e) => before.get(e.id) === e.type).map((e) => e.id))
    for (const k of [i - 1, i]) motion[k]!.morphPairs = new Set([...(motion[k]!.morphPairs ?? []), ...pairs])
  })
  return xmlSafeFile(scatterTrendlines(inkStackedLabels(roundPictures(injectMotion((await pptx.write({ outputType: 'nodebuffer' })) as Buffer, motion), rounded)), scatterTrends))
}
