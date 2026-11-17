import { getDocumentProxy } from 'unpdf'
import { encodePng } from '../export/png.ts'
import { SourceError } from '../sources/errors.ts'
import type { RawColour, RawFileBrand, RawFont, RawLogo } from './file-types.ts'

/**
 * A brand from a PDF, read with pdf.js (no rendering, no network, no canvas): the fill and text colours its pages really draw (weighted by the area they cover or the ink
 * the text lays down, with page backgrounds counted lightly), the font names the text is set in, a small repeated picture in a corner as the logo, and a name from the
 * file's title or the biggest words on page 1. Photos are never a source of colour, except when the PDF is only page pictures (then those pictures are the design).
 * Runs inside the parse worker (parse-pool.ts), so a hostile PDF ends only its own worker.
 */

export const PDF_BRAND_MAX_PAGES = 300
const PAGES_LOOKED = 12
const BUDGET_MS = 18_000
const MAX_IMAGE_PIXELS = 16_000_000
const MAX_IMAGES_DECODED = 40

/** PDF font names that are not a brand font: symbols, bullets, maths, icon sets */
const NOT_A_BRAND_FONT = /symbol|wingding|dingbat|webding|emoji|math|icon|awesome|glyph|bullet|\bcid\b|^type3$/i

/** "ABCDEF+Open-Sans-Bold", "ArialMT", "TimesNewRomanPSMT", "Montserrat-SemiBold" -> "Open Sans", "Arial", "Times New Roman", "Montserrat" */
export function cleanPdfFontName(raw: string): string | null {
  let n = raw.replace(/^[A-Z]{6}\+/, '').replace(/^g_d\d+_f\d+$/, '')
  if (!n) return null
  n = n.split(/[,]/)[0]!
  // "Name-Bold" / "Name-BoldItalic": the family is before the first dash (but "Open-Sans" style names keep their words)
  const parts = n.split('-')
  const STYLE = /^(regular|roman|book|normal|bold|semibold|demibold|extrabold|light|extralight|thin|black|heavy|medium|italic|oblique|bolditalic|boldoblique|lightitalic|condensed|narrow|cond|ultra|it|bd|md|lt|rg|psmt|ps|mt|oldstyle|display|text|variable|var)$/i
  const kept = parts.filter((p, i) => i === 0 || !STYLE.test(p.replace(/[0-9]+$/, '')))
  n = kept.join(' ')
  n = n.replace(/(PS)?MT$/, '').replace(/PS$/, '').replace(/(Regular|Bold|Italic|Oblique|Light|Medium|SemiBold)$/g, '')
  n = n.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (n.length < 2 || NOT_A_BRAND_FONT.test(n)) return null
  return n.slice(0, 60)
}

/** Title metadata from PowerPoint/Word exports is "Microsoft PowerPoint - deck.pptx", "Untitled" or a file name: only a real name is used */
export function usableTitle(t: unknown): string | null {
  if (typeof t !== 'string') return null
  const s = t.replace(/^microsoft (powerpoint|word)\s*-\s*/i, '').replace(/\.(pptx?|docx?|pdf|key|indd)$/i, '').replace(/[_]+/g, ' ').trim()
  if (s.length < 2 || s.length > 80 || /^(untitled|presentation\d*|document\d*|slide\s*\d*|powerpoint presentation|title|new document)$/i.test(s) || /^[\d\s._-]+$/.test(s)) return null
  return s
}

type M = [number, number, number, number, number, number]
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const IDENT: M = [1, 0, 0, 1, 0, 0]
const HEX = /^#[0-9a-f]{6}$/i

interface FontAcc { chars: number; ink: number; maxSize: number; sumSizeChars: number }
interface ImgSeen { key: string; pages: Set<number>; w: number; h: number; px: Uint8Array; kind: number; box: { x0: number; y0: number; x1: number; y1: number }; firstPage: boolean; area: number; pw: number; ph: number }

/** a cheap fingerprint of a decoded picture: same logo on every page gives the same key */
function fingerprint(data: Uint8Array, w: number, h: number): string {
  let a = 2166136261
  const step = Math.max(1, Math.floor(data.length / 997))
  for (let i = 0; i < data.length; i += step) a = Math.imul(a ^ data[i]!, 16777619)
  return `${w}x${h}:${a >>> 0}:${data.length}`
}

function toRgba(data: Uint8Array, w: number, h: number, kind: number): Uint8Array | null {
  const n = w * h
  const out = new Uint8Array(n * 4)
  if (kind === 3 && data.length >= n * 4) { out.set(data.subarray(0, n * 4)); return out }
  if (kind === 2 && data.length >= n * 3) { for (let i = 0; i < n; i++) { out[i * 4] = data[i * 3]!; out[i * 4 + 1] = data[i * 3 + 1]!; out[i * 4 + 2] = data[i * 3 + 2]!; out[i * 4 + 3] = 255 } return out }
  return null
}
/** box filter down to at most `max` pixels on the long side */
function shrink(rgba: Uint8Array, w: number, h: number, max: number): { rgba: Uint8Array; w: number; h: number } {
  const f = Math.ceil(Math.max(w, h) / max)
  if (f <= 1) return { rgba, w, h }
  const nw = Math.max(1, Math.floor(w / f)), nh = Math.max(1, Math.floor(h / f))
  const out = new Uint8Array(nw * nh * 4)
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    let r = 0, g = 0, b = 0, a = 0, c = 0
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) { const i = ((y * f + dy) * w + x * f + dx) * 4; const al = rgba[i + 3]!; r += rgba[i]! * al; g += rgba[i + 1]! * al; b += rgba[i + 2]! * al; a += al; c++ }
    const o = (y * nw + x) * 4
    out[o] = a ? r / a : 0; out[o + 1] = a ? g / a : 0; out[o + 2] = a ? b / a : 0; out[o + 3] = a / c
  }
  return { rgba: out, w: nw, h: nh }
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

export async function readPdfBrand(bytes: Uint8Array, filename: string): Promise<RawFileBrand> {
  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') throw new SourceError('That file is not a PDF.')
  const t0 = Date.now()
  const left = () => BUDGET_MS - (Date.now() - t0)
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>
  try { pdf = await getDocumentProxy(new Uint8Array(bytes)) } catch (e) {
    const n = (e as { name?: string })?.name ?? ''
    if (n === 'PasswordException' || /password/i.test(String((e as Error)?.message))) throw new SourceError('That PDF is password protected. Remove the password (open it, then save or print a copy without one) and upload it again.')
    throw new SourceError('That PDF could not be opened. It may be damaged. Save a fresh copy and try again.')
  }
  const pdfjs = await import('unpdf/pdfjs') as unknown as { OPS: Record<string, number> }
  const OPS = pdfjs.OPS
  const N: Record<number, string> = {}; for (const [k, v] of Object.entries(OPS)) N[v as number] = k
  if (pdf.numPages > PDF_BRAND_MAX_PAGES) throw new SourceError(`That PDF has ${pdf.numPages} pages. Upload a shorter one (up to ${PDF_BRAND_MAX_PAGES} pages), for example its first pages.`)
  const looked = Math.min(pdf.numPages, PAGES_LOOKED)

  const colour = new Map<string, { w: number; source: RawColour['source'] }>()
  const addColour = (hex: string, w: number, source: RawColour['source']) => { if (!HEX.test(hex) || !(w > 0)) return; const k = hex.toUpperCase(); const c = colour.get(k); colour.set(k, { w: (c?.w ?? 0) + w, source: c && c.w > w ? c.source : source }) }
  const fonts = new Map<string, FontAcc>()
  const images = new Map<string, ImgSeen>()
  let decoded = 0, vectorFills = 0, textChars = 0, bigText = { size: 0, text: '' }
  const pageArea: number[] = []
  const bgByPage: string[] = []
  const pageImages: { w: number; h: number; px: Uint8Array; kind: number; cover: number }[] = []

  const meta = await pdf.getMetadata().catch(() => null)
  const title = usableTitle((meta?.info as { Title?: unknown } | undefined)?.Title)

  for (let pn = 1; pn <= looked && left() > 2000; pn++) {
    const page = await pdf.getPage(pn)
    const [vx0, vy0, vx1, vy1] = page.view as [number, number, number, number]
    const PW = Math.abs(vx1 - vx0), PH = Math.abs(vy1 - vy0)
    if (!(PW > 0 && PH > 0)) continue
    const area = PW * PH
    pageArea.push(area)
    const base: M = [1, 0, 0, 1, -Math.min(vx0, vx1), -Math.min(vy0, vy1)]
    const ops = await page.getOperatorList()
    let ctm: M = base
    const stack: M[] = []
    let fill: string | null = '#000000'
    const fillStack: (string | null)[] = []
    let font: string | null = null, fontSize = 0, tm: M = IDENT, bigBg: { hex: string; cover: number } | null = null
    const clampBox = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(PW, b.x1), y1: Math.min(PH, b.y1) })
    const boxOf = (m: M, x0: number, y0: number, x1: number, y1: number) => { const pts = [apply(m, x0, y0), apply(m, x1, y0), apply(m, x1, y1), apply(m, x0, y1)]; return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) } }
    const fontName = (id: string): string | null => { try { const f = (page.commonObjs as unknown as { get(id: string): { name?: string } | undefined }).get(id); return f?.name ?? null } catch { return null } }
    const pending: { id: string; box: ReturnType<typeof boxOf> }[] = []
    for (let i = 0; i < ops.fnArray.length; i++) {
      const op = N[ops.fnArray[i]!], a = ops.argsArray[i] as unknown[] | null
      switch (op) {
        case 'save': stack.push(ctm); fillStack.push(fill); break
        case 'restore': ctm = stack.pop() ?? ctm; if (fillStack.length) fill = fillStack.pop() ?? fill; break
        case 'transform': if (a && a.length >= 6) ctm = mul(ctm, a.slice(0, 6) as M); break
        case 'paintFormXObjectBegin': stack.push(ctm); fillStack.push(fill); if (Array.isArray(a?.[0]) && (a[0] as number[]).length >= 6) ctm = mul(ctm, a[0] as M); break
        case 'paintFormXObjectEnd': ctm = stack.pop() ?? ctm; if (fillStack.length) fill = fillStack.pop() ?? fill; break
        case 'setFillRGBColor': fill = typeof a?.[0] === 'string' && HEX.test(a[0]) ? (a[0] as string).toUpperCase() : null; break
        case 'setFillColorN': case 'setFillColorSpace': case 'setFillColor': if (op === 'setFillColorN') fill = null; break // patterns and shadings: not a plain colour
        case 'constructPath': {
          const paint = N[a?.[0] as number] ?? ''
          if (!/^(fill|eoFill|fillStroke|eoFillStroke|closeFillStroke|closeEOFillStroke)$/.test(paint) || !fill) break
          const mm = a?.[2] as Record<number, number> | undefined
          if (!mm) break
          const b = clampBox(boxOf(ctm, mm[0]!, mm[1]!, mm[2]!, mm[3]!))
          const ar = Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0)
          if (ar <= 0) break
          vectorFills++
          const cover = ar / area
          if (cover >= 0.85) { if (!bigBg || cover >= bigBg.cover) bigBg = { hex: fill, cover }; addColour(fill, area * 0.35, 'background') } else addColour(fill, ar, 'fill')
          break
        }
        case 'paintSolidColorImageMask': if (fill) { const b = clampBox(boxOf(ctm, 0, 0, 1, 1)); const ar = Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0); if (ar > 0) { vectorFills++; if (ar / area >= 0.85) { addColour(fill, area * 0.35, 'background'); bigBg ??= { hex: fill, cover: ar / area } } else addColour(fill, ar, 'fill') } } break
        case 'beginText': tm = IDENT; break
        case 'setFont': font = typeof a?.[0] === 'string' ? (a[0] as string) : null; fontSize = Number(a?.[1]) || 0; break
        case 'setTextMatrix': { // pdf.js passes the six numbers as one typed array (or six arguments)
          const m = a && a.length === 1 && a[0] && typeof a[0] === 'object' ? Array.from({ length: 6 }, (_, k) => Number((a[0] as Record<number, number>)[k])) : a && a.length >= 6 ? a.slice(0, 6).map(Number) : null
          if (m && m.every((v) => Number.isFinite(v))) tm = m as M
          break
        }
        case 'showText': case 'showSpacedText': {
          const glyphs = ((op === 'showText' ? a?.[0] : a?.[0]) as { unicode?: string; isSpace?: boolean }[] | undefined) ?? []
          const chars = glyphs.filter((g) => g && typeof g === 'object' && g.unicode && !g.isSpace && g.unicode.trim()).length
          if (!chars || !font) break
          const scale = Math.hypot(ctm[2], ctm[3]) * Math.hypot(tm[2], tm[3])
          const size = Math.abs(fontSize) * scale
          if (!(size > 0)) break
          textChars += chars
          const fname = fontName(font)
          const fam = fname ? cleanPdfFontName(fname) : null
          if (fam) { const f = fonts.get(fam) ?? { chars: 0, ink: 0, maxSize: 0, sumSizeChars: 0 }; f.chars += chars; f.ink += chars * size * size; f.maxSize = Math.max(f.maxSize, size); f.sumSizeChars += size * chars; fonts.set(fam, f) }
          if (fill) addColour(fill, chars * size * size * 0.55, 'text')
          if (pn === 1 && size > bigText.size * 0.98) {
            const s = glyphs.map((g) => (g && typeof g === 'object' && g.unicode) || '').join('').trim()
            if (s.length >= 2 && (size > bigText.size || s.length > bigText.text.length)) bigText = { size, text: s }
          }
          break
        }
        case 'paintImageXObject': case 'paintInlineImageXObject': case 'paintImageXObjectRepeat': {
          const b = clampBox(boxOf(ctm, 0, 0, 1, 1))
          if (op === 'paintImageXObject' && typeof a?.[0] === 'string') pending.push({ id: a[0] as string, box: b })
          else if (op === 'paintInlineImageXObject' && a?.[0] && typeof a[0] === 'object') pending.push({ id: '', box: b, ...({ inline: a[0] } as object) } as never)
          break
        }
        default: break
      }
    }
    if (bigBg) bgByPage.push(bigBg.hex)
    // pictures: decode (bounded), fingerprint, and remember where they sit
    for (const pd of pending as { id: string; box: { x0: number; y0: number; x1: number; y1: number }; inline?: { width: number; height: number; kind: number; data: Uint8Array } }[]) {
      if (decoded >= MAX_IMAGES_DECODED || left() < 1500) break
      const bw = pd.box.x1 - pd.box.x0, bh = pd.box.y1 - pd.box.y0
      if (bw <= 1 || bh <= 1) continue
      let img = pd.inline as { width: number; height: number; kind: number; data: Uint8Array | null } | undefined
      if (!img && pd.id) img = await new Promise<{ width: number; height: number; kind: number; data: Uint8Array | null } | undefined>((res) => { const t = setTimeout(() => res(undefined), 1500); try { const store = (pd.id.startsWith('g_') ? page.commonObjs : page.objs) as unknown as { get(id: string, cb: (o: unknown) => void): void }; store.get(pd.id, (o) => { clearTimeout(t); res(o as typeof img) }) } catch { clearTimeout(t); res(undefined) } }) // pictures shared by several pages live in the common store
      if (!img?.data || !img.width || !img.height || img.width * img.height > MAX_IMAGE_PIXELS || (img.kind !== 2 && img.kind !== 3)) continue
      decoded++
      const key = fingerprint(img.data, img.width, img.height)
      const cover = (bw * bh) / area
      if (cover >= 0.4) pageImages.push({ w: img.width, h: img.height, px: img.data, kind: img.kind, cover })
      const seen = images.get(key)
      if (seen) { seen.pages.add(pn); seen.box = { x0: Math.min(seen.box.x0, pd.box.x0), y0: Math.min(seen.box.y0, pd.box.y0), x1: Math.max(seen.box.x1, pd.box.x1), y1: Math.max(seen.box.y1, pd.box.y1) } }
      else images.set(key, { key, pages: new Set([pn]), w: img.width, h: img.height, px: img.data, kind: img.kind, box: pd.box, firstPage: pn === 1, area: cover, pw: PW, ph: PH })
    }
    page.cleanup()
  }
  const notes: string[] = []
  const pictureOnly = textChars === 0 && vectorFills === 0 && pageImages.length > 0
  const hasText = textChars > 0

  // colours: a picture-only PDF has nothing else, so its page pictures are the design (photos in a normal PDF are never a source)
  if (pictureOnly) {
    for (const im of pageImages.slice(0, 6)) {
      const rgba = toRgba(im.px, im.w, im.h, im.kind)
      if (!rgba) continue
      const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
      const step = Math.max(1, Math.floor(Math.sqrt((im.w * im.h) / 40_000)))
      for (let y = 0; y < im.h; y += step) for (let x = 0; x < im.w; x += step) {
        const i = (y * im.w + x) * 4; if (rgba[i + 3]! < 200) continue
        const k = (rgba[i]! >> 4) << 8 | (rgba[i + 1]! >> 4) << 4 | (rgba[i + 2]! >> 4)
        const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += rgba[i]!; e.g += rgba[i + 1]!; e.b += rgba[i + 2]!; buckets.set(k, e)
      }
      for (const e of buckets.values()) addColour(`#${hex2(e.r / e.n)}${hex2(e.g / e.n)}${hex2(e.b / e.n)}`, e.n * step * step, 'image')
    }
    notes.push('This PDF is made of page pictures, so there is no text to read fonts from. The colours come from the pictures; choose fonts yourself.')
  } else if (!hasText) notes.push('We could not read any fonts from this PDF (its text is missing or drawn as pictures). Choose fonts yourself.')

  // fonts
  const fontList = [...fonts].sort((a, b) => b[1].ink - a[1].ink)
  const raw: RawFont[] = []
  if (fontList.length) {
    const byMax = [...fontList].sort((a, b) => b[1].maxSize - a[1].maxSize || b[1].chars - a[1].chars)
    const heading = byMax[0]![0]
    const lowCut = byMax[0]![1].maxSize * 0.6
    const bodyPick = [...fontList].filter(([, f]) => f.sumSizeChars / f.chars <= lowCut).sort((a, b) => b[1].chars - a[1].chars)[0]?.[0] ?? [...fontList].sort((a, b) => b[1].chars - a[1].chars)[0]![0]
    raw.push({ original: heading, role: 'heading', uses: fonts.get(heading)!.chars })
    if (bodyPick !== heading) raw.push({ original: bodyPick, role: 'body', uses: fonts.get(bodyPick)!.chars })
    else raw.push({ original: heading, role: 'body', uses: fonts.get(heading)!.chars })
    for (const [f, v] of fontList) if (f !== heading && f !== bodyPick) raw.push({ original: f, role: 'other', uses: v.chars })
  }

  // logo: a small picture, repeated across pages or sitting in a corner of the first page
  let logo: RawLogo | null = null
  let bestScore = 0
  const nPages = Math.max(1, pageArea.length)
  for (const im of images.values()) {
    if (im.w < 48 || im.h < 48 || im.area > 0.18) continue
    const aspect = im.w / im.h
    if (aspect > 6 || aspect < 0.2) continue
    const repeat = nPages > 1 ? im.pages.size / nPages : 0.4 // one page cannot show a repeat: a small picture in its corner is only a weak guess
    const cx = (im.box.x0 + im.box.x1) / 2, cy = (im.box.y0 + im.box.y1) / 2
    const corner = ((cx / im.pw < 0.28 || cx / im.pw > 0.72) ? 1 : 0) + ((cy / im.ph < 0.24 || cy / im.ph > 0.76) ? 1 : 0)
    const score = repeat * 4 + corner * 1.25 + (im.firstPage ? 0.4 : 0) + (im.area >= 0.002 && im.area <= 0.06 ? 0.8 : 0) + (im.pages.size >= 2 ? 1 : 0)
    if (score > bestScore) { bestScore = score; const rgba = toRgba(im.px, im.w, im.h, im.kind); if (rgba) { const s = shrink(rgba, im.w, im.h, 800); const png = encodePng(s.w, s.h, s.rgba); if (png.length <= 1_500_000) logo = { bytes: new Uint8Array(png), mime: 'image/png', aspect: Math.round((s.w / s.h) * 1000) / 1000, width: s.w, height: s.h, why: `${im.pages.size}/${nPages} pages, corner ${corner}, score ${score.toFixed(1)}` } } }
  }
  if (bestScore < 2.4) logo = null

  const colors: RawColour[] = [...colour].map(([hex, v]) => ({ hex, weight: v.w, source: v.source }))
  return {
    kind: 'pdf', name: title, nameAlt: bigText.text && bigText.text.length <= 60 ? bigText.text : null, colors, fonts: raw, logo, notes,
    facts: { units: pdf.numPages, looked, hasText, stockOffice: false, pictureOnly },
  }
}
