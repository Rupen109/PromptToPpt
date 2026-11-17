import { createHash } from 'node:crypto'
import { hexToHsl } from '@prompttoppt/theme'
import { SourceError } from '../sources/errors.ts'
import { parseBrandUpload } from '../sources/parse-pool.ts'
import { mapFont as mapFileFont } from '../template-import/fonts.ts'
import { assetUrl, storeWebsiteLogo } from './assets.ts'
import { isBrandable, pickPrimaryAccent } from './extract.ts'
import { nameFromFile, type RawColour, type RawFileBrand } from './file-types.ts'
import type { MappedFont } from './fonts.ts'
import { isOle, isZip } from '../sources/zip.ts'

/**
 * "Get brand from a file": a PowerPoint or a PDF becomes the same review card a website does (colours, fonts, logo, name), plus honest notes and whether the file can ALSO
 * give slide layouts. The reading happens in the parse worker (read-pptx.ts / read-pdf.ts); this file turns what was read into a profile and stores the logo.
 */
export interface FileBrandProfile {
  source: 'pptx' | 'pdf'
  fileName: string
  name: string | null
  colors: { primary: string | null; accent: string | null; accentDerived: boolean; palette: string[] }
  fonts: { heading: MappedFont | null; body: MappedFont | null; detected: string[] }
  logo: { url: string; aspect: number } | null
  confidence: 'high' | 'low'
  /** sentences for the person: what could not be read, what was replaced */
  notes: string[]
  /** the same file can also be used as a design with slide layouts ("Use a file's design") */
  layouts: { available: boolean; reason: string }
}

const dist = (a: string, b: string) => { const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const [x, y] = [n(a), n(b)]; return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!) }

/** Weighted colours -> a ranked palette of brand-like colours (neutrals out, near-duplicates merged), scored the way the website lookup scores them so one picker serves both. */
export function rankPalette(colors: RawColour[]): { hex: string; score: number }[] {
  // a page or slide background is a brand colour only when nothing else is: it counts a third as much as ink and shapes (a dark deck's slate must not become its accent)
  const usage = colors.filter((c) => c.source !== 'theme' && isBrandable(c.hex)).map((c) => ({ ...c, weight: c.source === 'background' ? c.weight * 0.33 : c.weight }))
  // a dark slate or a pale tint that a deck uses for cards and panels is a surface, not its accent: it counts for much less than a vivid colour
  const surfacey = (hex: string) => { const [, s, l] = hexToHsl(hex); return (l < 0.3 || l > 0.82) && s < 0.5 ? Math.max(0.25, s / 0.5) : 1 }
  for (const c of usage) c.weight *= surfacey(c.hex)
  const total = usage.reduce((s, c) => s + c.weight, 0)
  const merged: { hex: string; score: number; top: number }[] = []
  const place = (hex: string, v: number) => {
    const near = merged.find((m) => dist(m.hex, hex) < 30)
    if (near) near.score += v // a shade of the same colour: it adds to the one already ranked (the heavier one keeps its exact value)
    else merged.push({ hex, score: v, top: v })
  }
  for (const c of [...usage].sort((a, b) => b.weight - a.weight)) place(c.hex, total > 0 ? (c.weight / total) * 10 : 0)
  // the theme's slots back up what the slides show; a theme colour that no slide uses is only "available", so it ranks after every colour that is really used
  const used = merged.length > 0
  for (const c of colors.filter((x) => x.source === 'theme' && isBrandable(x.hex)).sort((a, b) => b.weight - a.weight)) {
    const matched = merged.some((m) => dist(m.hex, c.hex) < 30)
    place(c.hex, c.weight * 10 * surfacey(c.hex) * (matched || !used ? 1 : 0.1))
  }
  return merged.sort((a, b) => b.score - a.score).slice(0, 8).map((m) => ({ hex: m.hex, score: Math.round(m.score * 10) / 10 }))
}

const asMapped = (original: string): MappedFont => { const m = mapFileFont(original); return { family: m.mapped, original: m.original, exact: !m.replaced } }

/** Pure: what the readers returned -> the profile (the logo's stored address is filled in by the caller). */
export function profileFromRaw(raw: RawFileBrand, fileName: string): Omit<FileBrandProfile, 'logo'> {
  const palette = rankPalette(raw.colors)
  // main and accent are picked among the vivid colours when there are any: a muted slate that a deck uses for panels is in the palette but is not what the brand is known by
  const vivid = palette.filter((c) => hexToHsl(c.hex)[1] >= 0.4)
  const { primary, accent, derived } = pickPrimaryAccent(vivid.length ? vivid : palette)
  const heading = raw.fonts.find((f) => f.role === 'heading') ?? null
  const body = raw.fonts.find((f) => f.role === 'body') ?? heading
  const hf = heading ? asMapped(heading.original) : null
  const bf = body ? (body.original === heading?.original && hf ? { ...hf } : asMapped(body.original)) : null
  const notes = [...raw.notes]
  const replaced = [...new Map([hf, bf].filter((f): f is MappedFont => !!f && !f.exact).map((f) => [f.original, f])).values()]
  if (replaced.length) notes.push(`${replaced.map((f) => `${f.original} was replaced by ${f.family}`).join(' and ')} (the closest font we can use on every device and in exports).`)
  if (!palette.length) notes.push('We could not find brand colours in this file (it uses only black, white and grey). Pick your colours by hand.')
  const top = palette[0]?.score ?? 0
  const sure = !!primary && top >= 2.5 && !raw.facts.stockOffice
  const layouts = raw.kind === 'pptx'
    ? { available: true, reason: 'A PowerPoint has real slide layouts: you can keep them as a design for new presentations.' }
    : raw.fonts.length > 0
      ? { available: true, reason: 'A PDF with real text can also be kept as a design: each page is rebuilt as a slide layout (an approximation of the look, not the original editable layouts).' }
      : { available: false, reason: 'This PDF is pictures of pages, so it can give colours and a logo but no slide layouts. Upload the PowerPoint file to get layouts.' }
  return { source: raw.kind, fileName, name: raw.name ?? nameFromFile(fileName) ?? raw.nameAlt ?? null, colors: { primary, accent, accentDerived: derived, palette: palette.map((p) => p.hex) }, fonts: { heading: hf, body: bf, detected: [...new Set(raw.fonts.map((f) => f.original))].slice(0, 6) }, confidence: sure ? 'high' : 'low', notes, layouts }
}

/** Reads an uploaded PowerPoint or PDF and returns its brand (logo stored as one of the person's assets). Throws SourceError (a sentence for the person) or BusyError. */
export async function brandFromFile(userId: string, bytes: Uint8Array, filename: string): Promise<FileBrandProfile> {
  const head = bytes.subarray(0, 5)
  const isPdf = Buffer.from(head).toString('latin1') === '%PDF-'
  if (!isPdf && !isZip(bytes) && !isOle(bytes)) throw new SourceError('Upload a PowerPoint (.pptx) or a PDF file.')
  if (!isPdf && !/\.pptx?$/i.test(filename) && !isZip(bytes)) throw new SourceError('Upload a PowerPoint (.pptx) or a PDF file.')
  const raw = await parseBrandUpload(bytes, filename)
  const p = profileFromRaw(raw, filename.slice(0, 200))
  let logo: FileBrandProfile['logo'] = null
  if (raw.logo) {
    const buf = Buffer.from(raw.logo.bytes)
    const id = await storeWebsiteLogo(userId, buf, raw.logo.mime, `file:${createHash('sha256').update(buf).digest('hex').slice(0, 24)}`)
    if (id) logo = { url: assetUrl(id), aspect: raw.logo.aspect }
  }
  if (!logo) p.notes.push(raw.kind === 'pptx' ? 'No logo was found (we look for a small picture repeated on the slides, usually in a corner). You can upload one.' : 'No logo was found (we look for a small picture repeated on the pages, usually in a corner). You can upload one.')
  return { ...p, logo }
}
