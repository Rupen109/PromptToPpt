import type { Emitted } from './walk.ts'
import type { PicturePlacement, SlotRole, TemplateChrome, TemplateSlot } from './types.ts'

/** Which text boxes carry the deck's own words (slots), which text is repeated branding (chrome), and which pictures a new deck may swap. */

/** same detection as generation/template-deck.ts for "a detail only the user can give": an e-mail, link, phone number, address, credit */
const DETAIL = /@\w|https?:\/\/|www\.|\.(com|org|net|io|co|app|ai)\b|(?:^|\s)\+?\d[\d\s().-]{7,}\d|\b(street|avenue|road|suite|floor|blvd|lane)\b|photo by|credit|source:|©/i
const FOOTER = new Set(['dt', 'ftr', 'sldNum'])
const NUMERIC = /^(?=.*\d)[\s\d.,%+\-–×x$€£₹#/]+[kKmMbB]?\+?$/
const hasWords = (t: string) => /[\p{L}\p{N}]/u.test(t)
/** the identity of a piece of text across slides: small text ignores its digits ("Page 3" and "Page 4" are one footer), big text is compared as written (two titles that differ only by a number are two titles) */
export const normKey = (t: string, px = 0) => (px && px > 28 ? t.toLowerCase().replace(/\s+/g, ' ').trim() : t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim())

export interface SlideForSlots { n: number; emitted: Emitted[]; W: number; H: number }

export function room(sample: string, boxW: number, boxH: number, px: number, heavy: boolean, caps: boolean, lineFactor: number): { maxChars: number; maxLines: number } {
  const glyph = caps ? (heavy ? 0.72 : 0.64) : heavy ? 0.62 : 0.52
  const maxLines = Math.max(1, Math.floor(boxH / (px * Math.max(1, lineFactor))))
  const floor = /\s/.test(sample.trim()) ? 12 : 4
  return { maxChars: Math.max(floor, Math.round((boxW / (px * glyph)) * maxLines)), maxLines }
}

/** text repeated on most slides, found across the whole deck */
export function repeatedText(slides: SlideForSlots[]): Set<string> {
  const count = new Map<string, number>()
  for (const s of slides) {
    const seen = new Set<string>()
    for (const e of s.emitted) if (e.origin === 'slide' && e.kind === 'text' && e.text && hasWords(e.text.plain)) seen.add(normKey(e.text.plain, e.text.px))
    for (const k of seen) count.set(k, (count.get(k) ?? 0) + 1)
  }
  const need = Math.max(3, Math.ceil(slides.length * 0.4))
  return new Set(slides.length < 3 ? [] : [...count].filter(([, n]) => n >= need).map(([k]) => k))
}

export interface Classified { slots: TemplateSlot[]; decor: string[]; chromeIds: { elementId: string; key: string; sample: string; maxChars: number }[] }

export function classifySlide(s: SlideForSlots, repeated: Set<string>, pictureDecor: Set<string>): Classified {
  const slots: TemplateSlot[] = []
  const decor: string[] = []
  const chromeIds: Classified['chromeIds'] = []
  const texts = s.emitted.filter((e) => e.kind === 'text' && e.origin === 'slide' && e.text)
  const biggest = [...texts].filter((e) => !['dt', 'ftr'].includes(e.ph ?? '')).sort((a, b) => b.text!.px - a.text!.px || a.el.y - b.el.y)[0]
  const hasTitlePh = texts.some((e) => e.ph === 'title' || e.ph === 'ctrTitle')
  for (const e of s.emitted) {
    if (e.kind === 'shape') { decor.push(e.el.id); continue }
    if (e.kind === 'picture') { if (e.origin !== 'slide' || pictureDecor.has(e.el.id)) decor.push(e.el.id); continue }
    if (e.kind !== 'text' || !e.text) continue
    const t = e.text
    const sample = t.plain.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim()
    const key = normKey(sample, t.px)
    const { maxChars } = room(sample, t.boxW, t.boxH, t.px, t.heavy, t.caps, t.lineFactor)
    // words the master or layout draws on every slide (a company name, a tagline): decoration, and chrome the person can replace once for the whole deck
    if (e.origin !== 'slide') { decor.push(e.el.id); if (hasWords(sample)) chromeIds.push({ elementId: e.el.id, key, sample: sample.slice(0, 80), maxChars: Math.max(8, maxChars) }); continue }
    const footerPh = e.ph === 'dt' || e.ph === 'ftr'
    const nearEdgeRepeat = e.el.y > s.H * 0.86 && t.px <= 24 && repeated.has(key)
    if (!hasWords(sample)) { decor.push(e.el.id); continue }
    if (footerPh || nearEdgeRepeat || (repeated.has(key) && e.ph !== 'title' && e.ph !== 'ctrTitle')) { decor.push(e.el.id); chromeIds.push({ elementId: e.el.id, key, sample: sample.slice(0, 80), maxChars: Math.max(8, maxChars) }); continue }
    const numeric = NUMERIC.test(sample)
    const detail = DETAIL.test(sample)
    const words = sample.split(/\s+/).filter(Boolean).length
    const lines = t.paras.filter((p) => p.runs.some((r) => r.text.trim())).length
    let role: SlotRole
    if (e.ph === 'title' || e.ph === 'ctrTitle') role = 'title'
    else if (e.ph === 'subTitle') role = 'subtitle'
    else if (numeric) role = 'number'
    else if (t.list >= 2 || (e.ph === 'body' && lines >= 3)) role = 'bullets'
    else if (/name|person|author|speaker|presenter|founder|ceo/i.test(t.name) && words <= 5) role = 'name'
    else if (!hasTitlePh && biggest === e && e.el.y < s.H * 0.5 && words <= 18) role = 'title'
    else if (detail) role = 'other'
    else if (e.ph && !FOOTER.has(e.ph)) role = 'body'
    else if (lines >= 2 || sample.length > 90) role = 'body'
    else if (t.px <= 24 && words > 3) role = 'caption'
    else if (words <= 4 && sample.length <= 34) role = t.shapeBound || t.px <= 28 ? 'label' : 'other'
    else role = 'body'
    const r = room(sample, t.boxW, t.boxH, t.px, t.heavy, t.caps, t.lineFactor)
    slots.push({ id: e.el.id, elementId: e.el.id, role, sample: sample.slice(0, 160), maxChars: r.maxChars, maxLines: r.maxLines, lines, detail, numeric, ticker: false })
  }
  return { slots, decor, chromeIds }
}

export function mergeChrome(perSlide: { n: number; ids: Classified['chromeIds'] }[]): TemplateChrome[] {
  const byKey = new Map<string, TemplateChrome>()
  for (const s of perSlide) for (const c of s.ids) {
    let t = byKey.get(c.key)
    if (!t) { t = { id: `chrome-${byKey.size + 1}`, sample: c.sample, maxChars: c.maxChars, refs: [] }; byKey.set(c.key, t) }
    t.refs.push({ slide: s.n, elementId: c.elementId })
  }
  return [...byKey.values()]
}

/** Pictures: which are a design element (logo, icon, texture, repeated image) and which a big photo that a new deck may replace. */
export function classifyPictures(slides: SlideForSlots[]): { placements: PicturePlacement[][]; decorIds: Set<string>[] } {
  const slidesWith = new Map<string, number>()
  for (const s of slides) for (const k of new Set(s.emitted.filter((e) => e.kind === 'picture' && e.pic).map((e) => e.pic!.mediaKey))) slidesWith.set(k, (slidesWith.get(k) ?? 0) + 1)
  const repeatedMin = Math.max(2, Math.ceil(slides.length * 0.4))
  const placements: PicturePlacement[][] = []
  const decorIds: Set<string>[] = []
  for (const s of slides) {
    const list: PicturePlacement[] = []
    const dec = new Set<string>()
    for (const e of s.emitted) {
      if (e.kind !== 'picture' || !e.pic || e.el.type !== 'image') continue
      const w = e.el.width, h = e.el.height, coverage = Math.min(1, (w * h) / (s.W * s.H))
      const inherited = e.origin !== 'slide'
      const repeated = (slidesWith.get(e.pic.mediaKey) ?? 0) >= repeatedMin && slides.length >= 3
      const ratio = w / h
      const small = coverage < 0.012 || (w < 150 && h < 150)
      let kind: PicturePlacement['kind']
      let replaceable = false
      if (inherited) kind = coverage > 0.5 ? 'background' : small ? 'logo' : 'texture'
      else if (repeated || (slidesWith.get(e.pic.mediaKey) ?? 0) > 1 && small) kind = small ? 'logo' : coverage > 0.5 ? 'background' : 'texture'
      else if (small) kind = ratio > 0.8 && ratio < 1.25 && coverage < 0.004 ? 'icon' : 'logo'
      else if (ratio > 6 || ratio < 1 / 6) kind = 'texture'
      else { kind = e.pic.masked ? 'masked' : coverage >= 0.85 ? 'background' : 'photo'; replaceable = coverage >= 0.02 && w >= 150 && h >= 150 }
      if (!replaceable) dec.add(e.el.id)
      list.push({ elementId: e.el.id, replaceable, kind, width: Math.round(w), height: Math.round(h), coverage: Math.round(coverage * 1000) / 1000, inherited })
    }
    placements.push(list); decorIds.push(dec)
  }
  return { placements, decorIds }
}
