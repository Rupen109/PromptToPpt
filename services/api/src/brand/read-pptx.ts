import { SourceError } from '../sources/errors.ts'
import { openPptx } from '../template-import/package.ts'
import { parsePptxTemplate } from '../template-import/parse.ts'
import { pendingRef, type ExtractedPicture, type UploadedTemplate } from '../template-import/types.ts'
import type { RawColour, RawFileBrand, RawLogo } from './file-types.ts'

/**
 * A brand from a PowerPoint: the theme's colours and fonts (what the designer set up), the colours the slides REALLY use (weighted by how much of the slide they cover or
 * how big their text is, so a deck that ignores its theme still gives its true colours), the logo (a small picture repeated on the master/layout or on most slides, in a
 * corner) and a name. It reads the file with the same importer, and the same limits, as "Use a file's design"; nothing is stored here.
 */

/** the stock Office themes: a file that has only these was never given a brand */
const OFFICE_ACCENT1 = new Set(['4472C4', '5B9BD5', '156082', '4F81BD'])
const OFFICE_FONTS = /^(calibri|calibri light|aptos|aptos display|aptos narrow|arial|cambria|times new roman)$/i

/** theme slot -> how much it says about the brand (accent1 is the colour a designer picked first) */
const SLOT_WEIGHT: Record<string, number> = { accent1: 0.3, accent2: 0.15, accent3: 0.07, accent4: 0.07, accent5: 0.05, accent6: 0.05, dk2: 0.06 }

const MAX_SLIDES_LOOKED = 40

/** the logo among a deck's pictures: small, in a corner, on the master/layout or on most slides; never a photo or a full-slide background */
export function pickPptxLogo(t: UploadedTemplate, pictures: ExtractedPicture[]): RawLogo | null {
  const byRef = new Map(pictures.map((p) => [p.ref, p]))
  const W = t.canvas.width, H = t.canvas.height
  const total = Math.max(1, t.slides.length)
  interface Cand { ref: string; slides: Set<number>; inherited: boolean; corner: number; area: number; kind: string; first: boolean }
  const cands = new Map<string, Cand>()
  for (const s of t.slides) {
    for (const pl of s.pictures) {
      const el = s.slide.elements.find((e) => e.id === pl.elementId)
      if (!el || el.type !== 'image') continue
      const ref = pendingRef(el.src)
      if (!ref || !byRef.has(ref)) continue
      if (pl.kind !== 'logo' && pl.kind !== 'icon') continue
      const cx = (el.x + el.width / 2) / W, cy = (el.y + el.height / 2) / H
      const corner = (cx < 0.28 || cx > 0.72 ? 1 : 0) + (cy < 0.24 || cy > 0.76 ? 1 : 0) // 0, 1 (an edge) or 2 (a corner)
      const c = cands.get(ref) ?? { ref, slides: new Set<number>(), inherited: false, corner: 0, area: 0, kind: pl.kind, first: false }
      c.slides.add(s.n); c.inherited ||= pl.inherited; c.corner = Math.max(c.corner, corner); c.area = Math.max(c.area, pl.coverage); if (pl.kind === 'logo') c.kind = 'logo'; c.first ||= s === t.slides[0]
      cands.set(ref, c)
    }
  }
  let best: { c: Cand; score: number } | null = null
  for (const c of cands.values()) {
    const p = byRef.get(c.ref)!
    const aspect = p.width / p.height
    if (p.width < 48 || p.height < 48 || aspect > 6 || aspect < 0.2) continue
    const score = (c.slides.size / total) * 4 + (c.inherited ? 2 : 0) + c.corner * 1.25 + (c.first ? 0.4 : 0) + (c.kind === 'logo' ? 0.6 : 0) + (c.area >= 0.002 && c.area <= 0.06 ? 0.8 : 0)
    if (!best || score > best.score) best = { c, score }
  }
  if (!best || best.score < 2.4) return null
  const p = byRef.get(best.c.ref)!
  return { bytes: p.bytes, mime: p.mime, aspect: Math.round((p.width / p.height) * 1000) / 1000, width: p.width, height: p.height, why: `${best.c.slides.size}/${total} slides, ${best.c.inherited ? 'on the master/layout, ' : ''}score ${best.score.toFixed(1)}` }
}

const resolve = (v: string | undefined, t: UploadedTemplate): string | null => {
  if (!v) return null
  if (/^#[0-9a-f]{6}/i.test(v)) return v.slice(0, 7).toUpperCase()
  const c = t.theme.colors as Record<string, string>
  const map: Record<string, string | undefined> = { primary: c['primary'], secondary: c['secondary'], accent: c['accent'], surface: c['surface'], background: c['background'], text: c['textPrimary'], textPrimary: c['textPrimary'], textSecondary: c['textSecondary'], onPrimary: c['onPrimary'] }
  return map[v]?.toUpperCase() ?? null
}

/** the colours the slides actually show, weighted by how much they show */
export function usedColours(t: UploadedTemplate): RawColour[] {
  const W = t.canvas.width, H = t.canvas.height
  const acc = new Map<string, { w: number; source: RawColour['source'] }>()
  const add = (hex: string | null, w: number, source: RawColour['source']) => { if (!hex || !(w > 0)) return; const k = hex.toUpperCase(); const cur = acc.get(k); acc.set(k, { w: (cur?.w ?? 0) + w, source: cur && cur.source !== source && cur.w > w ? cur.source : source }) }
  for (const s of t.slides.slice(0, MAX_SLIDES_LOOKED)) {
    const bg = s.slide.background
    if (bg?.type === 'color') add(bg.value, W * H * 0.5, 'background')
    else if (bg?.type === 'gradient') { add(bg.gradient?.from ?? bg.value, W * H * 0.25, 'background'); add(bg.gradient?.to ?? null, W * H * 0.25, 'background') }
    for (const e of s.slide.elements) {
      const area = Math.min(W * H, e.width * e.height)
      if (e.type === 'shape') {
        if (e.shape === 'line') { add(resolve(typeof e.stroke === 'string' ? e.stroke : undefined, t), (e.strokeWidth ?? 2) * Math.max(e.width, e.height) * 0.5, 'fill'); continue }
        if (e.gradient) { add(e.gradient.from, area * 0.5, 'fill'); add(e.gradient.to, area * 0.5, 'fill') }
        else if (e.fill !== 'none') add(resolve(e.fill, t), area, 'fill')
      } else if (e.type === 'text') {
        const chars = e.paragraphs.reduce((n, p) => n + p.runs.reduce((m, r) => m + r.text.length, 0), 0)
        const colour = resolve(e.color, t)
        // a text box rarely covers its whole frame: letters x size squared is the ink it really lays down
        add(colour, Math.min(area, chars * e.fontSize * e.fontSize * 0.55), 'text')
        for (const p of e.paragraphs) for (const r of p.runs) { const rc = (r as { color?: string }).color; if (rc && resolve(rc, t) !== colour) add(resolve(rc, t), r.text.length * e.fontSize * e.fontSize * 0.55, 'text') }
      }
    }
  }
  return [...acc].map(([hex, v]) => ({ hex, weight: v.w, source: v.source }))
}

export async function readPptxBrand(bytes: Uint8Array, filename: string): Promise<RawFileBrand> {
  const pkg = openPptx(bytes, filename) // refuses password-protected, old .ppt, bombs, wrong types with a sentence for the person
  const master = pkg.masters[0]
  const scheme = master?.theme.scheme ?? {}
  const parsed = await parsePptxTemplate(bytes, filename)
  const t = parsed.template
  if (!t.slides.length) throw new SourceError('That presentation has no slides we could read.')

  const colors: RawColour[] = usedColours(t)
  for (const [slot, w] of Object.entries(SLOT_WEIGHT)) { const h = scheme[slot]; if (h && /^[0-9a-f]{6}$/i.test(h)) colors.push({ hex: `#${h.toUpperCase()}`, weight: w, source: 'theme' }) }

  const fonts = t.fonts.map((f) => ({ original: f.original, role: f.role, uses: f.uses }))
  const major = master?.theme.major ?? '', minor = master?.theme.minor ?? ''
  const stockOffice = OFFICE_ACCENT1.has((scheme['accent1'] ?? '').toUpperCase()) && (!major || OFFICE_FONTS.test(major)) && (!minor || OFFICE_FONTS.test(minor))
  const notes: string[] = []
  if (stockOffice) notes.push('This file uses PowerPoint\'s standard theme, so its colours and fonts may not be your brand. Check them before saving.')
  if (t.stats.masters > 1) notes.push(`The file has ${t.stats.masters} slide masters; the first one gives the theme.`)
  const title = t.slides.find((s) => s.slots.some((x) => x.role === 'title'))?.name ?? null
  return {
    kind: 'pptx', name: null, nameAlt: title && !/^Slide \d+$/.test(title) ? title.split('\n')[0]!.slice(0, 60) : null, colors, fonts, logo: pickPptxLogo(t, parsed.pictures), notes,
    facts: { units: t.stats.sourceSlides, looked: Math.min(t.slides.length, MAX_SLIDES_LOOKED), hasText: t.slides.some((s) => s.slots.length > 0), stockOffice, pictureOnly: false },
  }
}
