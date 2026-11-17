import { SourceError } from '../sources/errors.ts'
import { isEncryptedOffice, isOle, isZip, readZip, utf8, zipNames } from '../sources/zip.ts'
import { IMPORT_LIMITS } from './types.ts'
import { at, kid, kids, num, parseXml, type XNode } from './xml.ts'
import type { ColourContext } from './color.ts'
import { DEFAULT_MAP } from './color.ts'

/** Reading the .pptx container: the zip under the same safety limits as every upload (declared sizes checked before inflating, entry count, total size), relationships, theme, master, layout. */

const XML_PART = /^(\[Content_Types\]\.xml|ppt\/(presentation|slides\/slide\d+|slideLayouts\/slideLayout\d+|slideMasters\/slideMaster\d+|theme\/theme\d+|charts\/chart\d+|diagrams\/(drawing|data)\d+)\.xml|ppt\/(_rels|slides\/_rels|slideLayouts\/_rels|slideMasters\/_rels|charts\/_rels|theme\/_rels)\/[^/]+\.rels)$/
const XML_LIMITS = { maxEntryBytes: 12 * 1024 * 1024, maxTotalBytes: 80 * 1024 * 1024, maxEntries: 1500 }
const MAX_ENTRIES_IN_ZIP = 6000
const MAX_MEDIA_TOTAL = 160 * 1024 * 1024
const TOO_BIG = 'That PowerPoint file is too large or unusual to read'

export interface Rel { type: string; target: string; external: boolean }
export interface ThemeData {
  path: string
  scheme: Record<string, string>
  major: string
  minor: string
  fills: XNode[]
  lines: XNode[]
  bgFills: XNode[]
}
export interface MasterData {
  path: string
  root: XNode
  theme: ThemeData
  map: Record<string, string>
  tree: XNode | undefined
  txStyles: XNode | undefined
}
export interface LayoutData { path: string; root: XNode; name: string; tree: XNode | undefined; master: MasterData; showMasterSp: boolean; map: Record<string, string> }
export interface SlideData { n: number; path: string; root: XNode; layout: LayoutData; hidden: boolean; rels: Record<string, Rel> }

export interface Pkg {
  names: string[]
  slideSize: { cx: number; cy: number }
  slides: SlideData[]
  masters: MasterData[]
  defaultTextStyle: XNode | undefined
  /** presentation-level facts for the deck's warnings */
  facts: { embeddedFonts: boolean; smartArt: number; charts: number; media: number; ole: number; hasAnimations: boolean; hasTransitions: boolean; hasNotes: number; sections: boolean; skippedBeyondLimit: number; hiddenSlides: number; totalSlides: number }
  media(path: string): Uint8Array | null
  part(path: string): XNode | undefined
  rels(path: string): Record<string, Rel>
}

const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/') + 1)
export function resolveTarget(fromPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = (dirOf(fromPart) + target).split('/')
  const out: string[] = []
  for (const s of parts) { if (s === '..') out.pop(); else if (s !== '.' && s !== '') out.push(s) }
  return out.join('/')
}
const relsPath = (part: string) => `${dirOf(part)}_rels/${part.slice(part.lastIndexOf('/') + 1)}.rels`

export function themeFrom(root: XNode | undefined, path = ''): ThemeData {
  const els = kid(root, 'themeElements')
  const scheme: Record<string, string> = {}
  for (const c of kid(els, 'clrScheme')?.c ?? []) {
    const v = c.c[0]
    const hex = v?.n === 'srgbClr' ? v.a['val'] : v?.n === 'sysClr' ? v.a['lastClr'] ?? (v.a['val'] === 'window' ? 'FFFFFF' : '000000') : undefined
    if (hex && /^[0-9a-f]{6}$/i.test(hex)) scheme[c.n] = hex.toUpperCase()
  }
  const fonts = kid(els, 'fontScheme')
  return {
    path,
    scheme: { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72', ...scheme },
    major: at(fonts, 'majorFont/latin')?.a['typeface'] || 'Calibri Light',
    minor: at(fonts, 'minorFont/latin')?.a['typeface'] || 'Calibri',
    fills: kid(kid(els, 'fmtScheme'), 'fillStyleLst')?.c ?? [],
    lines: kid(kid(els, 'fmtScheme'), 'lnStyleLst')?.c ?? [],
    bgFills: kid(kid(els, 'fmtScheme'), 'bgFillStyleLst')?.c ?? [],
  }
}

export const colourCtx = (theme: ThemeData, map: Record<string, string>, ph?: string): ColourContext => ({ scheme: theme.scheme, map, ph })

/** Opens the file. Throws a SourceError (a sentence for the person) for anything that is not a readable .pptx. */
export function openPptx(bytes: Uint8Array, filename: string): Pkg {
  if (bytes.length > IMPORT_LIMITS.maxBytes) throw new SourceError(`That presentation is larger than ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. Save a smaller copy and try again.`)
  if (isEncryptedOffice(bytes)) throw new SourceError('That PowerPoint file is password protected. Remove the password in PowerPoint (File > Info > Protect Presentation) and upload it again.')
  if (isOle(bytes) || /\.(ppt|pps)$/i.test(filename)) throw new SourceError('Old .ppt files are not supported. Open it in PowerPoint and save as .pptx')
  if (!isZip(bytes)) throw new SourceError('That file is not a PowerPoint (.pptx) presentation')
  const names = zipNames(bytes)
  if (names.length > MAX_ENTRIES_IN_ZIP) throw new SourceError(TOO_BIG)
  if (!names.includes('ppt/presentation.xml')) {
    if (names.some((n) => /^(word|xl)\//.test(n))) throw new SourceError('That is not a PowerPoint file (it is a Word or Excel document)')
    throw new SourceError('That file is not a valid PowerPoint presentation. It may be damaged or renamed from another type')
  }
  if (names.some((n) => /^ppt\/(slides|slideLayouts|slideMasters)\/.+\.bin$/i.test(n)) || names.includes('EncryptionInfo')) throw new SourceError('That PowerPoint file is protected and cannot be read')
  const entries = readZip(bytes, (n) => XML_PART.test(n), XML_LIMITS, TOO_BIG)
  const budget = { nodes: 0 }
  const cache = new Map<string, XNode | undefined>()
  const part = (p: string): XNode | undefined => {
    if (cache.has(p)) return cache.get(p)
    const raw = entries[p]
    let node: XNode | undefined
    if (raw) { try { node = parseXml(utf8(raw), budget) } catch (e) { if (e instanceof SourceError) throw e; node = undefined } }
    cache.set(p, node)
    return node
  }
  const relCache = new Map<string, Record<string, Rel>>()
  const rels = (p: string): Record<string, Rel> => {
    const rp = relsPath(p)
    const hit = relCache.get(rp)
    if (hit) return hit
    const out: Record<string, Rel> = {}
    for (const r of kids(kid(part(rp), 'Relationships'), 'Relationship')) {
      const id = r.a['Id'], target = r.a['Target']
      if (id && target) out[id] = { type: r.a['Type'] ?? '', target: r.a['TargetMode'] === 'External' ? target : resolveTarget(p, target), external: r.a['TargetMode'] === 'External' }
    }
    relCache.set(rp, out)
    return out
  }
  let mediaTotal = 0
  const mediaCache = new Map<string, Uint8Array | null>()
  const media = (p: string): Uint8Array | null => {
    if (mediaCache.has(p)) return mediaCache.get(p)!
    if (!names.includes(p) || !/^ppt\/(media|embeddings)\//.test(p)) { mediaCache.set(p, null); return null }
    const got = readZip(bytes, (n) => n === p, { maxEntryBytes: 20 * 1024 * 1024, maxTotalBytes: 20 * 1024 * 1024, maxEntries: 1 }, TOO_BIG)[p] ?? null
    mediaTotal += got?.length ?? 0
    if (mediaTotal > MAX_MEDIA_TOTAL) throw new SourceError(TOO_BIG)
    mediaCache.set(p, got)
    return got
  }

  const pres = part('ppt/presentation.xml')
  if (!pres) throw new SourceError('That file is not a valid PowerPoint presentation. It may be damaged')
  const sldSz = kid(kid(pres, 'presentation'), 'sldSz')
  const cx = num(sldSz?.a['cx'], 12192000), cy = num(sldSz?.a['cy'], 6858000)
  if (cx < 1_000_000 || cy < 1_000_000 || cx > 60_000_000 || cy > 60_000_000) throw new SourceError('That presentation has an unusual slide size and cannot be imported')
  const presRoot = kid(pres, 'presentation')
  const presRels = rels('ppt/presentation.xml')
  const sldIds = kids(kid(presRoot, 'sldIdLst'), 'sldId')

  const themes = new Map<string, ThemeData>()
  const masters = new Map<string, MasterData>()
  const loadMaster = (path: string): MasterData => {
    const hit = masters.get(path)
    if (hit) return hit
    const root = part(path)
    const m = kid(root, 'sldMaster')
    const themeRel = Object.values(rels(path)).find((r) => /\/theme$/.test(r.type))
    let theme = themeRel ? themes.get(themeRel.target) : undefined
    if (!theme) { theme = themeFrom(kid(themeRel ? part(themeRel.target) : undefined, 'theme'), themeRel?.target ?? ''); if (themeRel) themes.set(themeRel.target, theme) }
    const clr = kid(m, 'clrMap')
    const data: MasterData = { path, root: m ?? { n: 'sldMaster', a: {}, c: [], t: '' }, theme, map: { ...DEFAULT_MAP, ...(clr?.a ?? {}) }, tree: at(kid(m, 'cSld'), 'spTree'), txStyles: kid(m, 'txStyles') }
    masters.set(path, data)
    return data
  }
  const layouts = new Map<string, LayoutData>()
  const loadLayout = (path: string): LayoutData | null => {
    const hit = layouts.get(path)
    if (hit) return hit
    const root = kid(part(path), 'sldLayout')
    const masterRel = Object.values(rels(path)).find((r) => /\/slideMaster$/.test(r.type))
    if (!root || !masterRel) return null
    const master = loadMaster(masterRel.target)
    const ovr = at(root, 'clrMapOvr/overrideClrMapping')
    const data: LayoutData = { path, root, name: kid(root, 'cSld')?.a['name'] ?? '', tree: at(kid(root, 'cSld'), 'spTree'), master, showMasterSp: root.a['showMasterSp'] !== '0', map: ovr ? { ...master.map, ...ovr.a } : master.map }
    layouts.set(path, data)
    return data
  }

  const slides: SlideData[] = []
  let hiddenSlides = 0
  let beyond = 0
  let missing = 0
  sldIds.forEach((s, i) => {
    const rel = presRels[s.a['r:id'] ?? '']
    const root = rel ? kid(part(rel.target), 'sld') : undefined
    if (!rel || !root) { missing++; return }
    const layoutRel = Object.values(rels(rel.target)).find((r) => /\/slideLayout$/.test(r.type))
    const layout = layoutRel ? loadLayout(layoutRel.target) : null
    if (!layout) { missing++; return }
    if (root.a['show'] === '0') { hiddenSlides++; return }
    if (slides.length >= IMPORT_LIMITS.maxSlides) { beyond++; return }
    slides.push({ n: i + 1, path: rel.target, root, layout, hidden: false, rels: rels(rel.target) })
  })
  if (slides.length === 0) throw new SourceError(sldIds.length === 0 ? 'No slides found in that PowerPoint file' : hiddenSlides && !missing ? 'Every slide in that file is hidden, so there is nothing to import' : 'No readable slides were found in that PowerPoint file. It may be damaged')

  const facts: Pkg['facts'] = {
    embeddedFonts: names.some((n) => n.startsWith('ppt/fonts/')) || !!kid(presRoot, 'embeddedFontLst'),
    smartArt: names.filter((n) => /^ppt\/diagrams\/data\d+\.xml$/.test(n)).length,
    charts: names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)).length,
    media: names.filter((n) => /^ppt\/media\/.+\.(mp4|mov|wmv|avi|m4v|mp3|wav|m4a|wma|mpg)$/i.test(n)).length,
    ole: names.filter((n) => n.startsWith('ppt/embeddings/')).length,
    hasAnimations: slides.some((s) => !!kid(s.root, 'timing')),
    hasTransitions: slides.some((s) => !!kid(s.root, 'transition') || !!kid(s.root, 'AlternateContent')),
    hasNotes: names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).length,
    sections: names.includes('ppt/presProps.xml') && !!at(kid(presRoot, 'extLst') ?? undefined, 'ext'),
    skippedBeyondLimit: beyond,
    hiddenSlides,
    totalSlides: sldIds.length,
  }
  return { names, slideSize: { cx, cy }, slides, masters: [...masters.values()], defaultTextStyle: kid(presRoot, 'defaultTextStyle'), facts, media, part, rels }
}
