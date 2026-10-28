import { CANVAS, themeStyleSchema, motionSchema, type Animation, type AspectRatio, type SlideElement, type TextElement, type Theme, type ThemeStyle, type Motion } from '@prompttoppt/validation'
import { blend, contrastRatio, isDark, luminance, mix, readableOn } from '../color'
import { fitFontSize, metricOptsFor } from '../text-metrics'

export type IdGen = () => string
export const defaultId: IdGen = () => globalThis.crypto.randomUUID()
export type Para = TextElement['paragraphs']
/** Heading runs with the last few words in an emphasis colour (the "$2 Trillion" treatment). */
export function emphasised(title: string, color: string, words = 0) {
  const w = title.trim().split(/\s+/)
  const n = words || (w.length >= 7 ? 3 : w.length >= 4 ? 2 : 1)
  if (w.length < 3) return { runs: [{ text: title }] }
  return { runs: [{ text: w.slice(0, -n).join(' ') + ' ' }, { text: w.slice(-n).join(' '), color }] }
}

/**
 * The 'duo' title: the closing words (about 40%) are set in italic AND in a colour, the rest plain — the editorial look of "Gauss's Law, *felt from the inside of a charged sphere.*".
 * One-word titles stay plain. `color` should already be chosen to read on the slide's background.
 */
export function duo(title: string, color: string) {
  const w = title.trim().split(/\s+/)
  if (w.length < 2) return { runs: [{ text: title }] }
  const n = Math.max(1, Math.round(w.length * 0.4))
  return { runs: [{ text: w.slice(0, -n).join(' ') + ' ' }, { text: w.slice(-n).join(' '), italic: true, color }] }
}

export const para = (t: string, list?: 'bullet' | 'number'): Para[number] => ({ runs: [{ text: t }], ...(list ? { list } : {}) })

/** Decks made before design-system v2 have no style/motion → the classic look with no animation. */
export const CLASSIC_STYLE: ThemeStyle = themeStyleSchema.parse({})
export const NO_MOTION: Motion = { ...motionSchema.parse({}), entrance: 'none', transition: 'fade' }

export interface Ctx {
  W: number
  H: number
  M: number
  id: IdGen
  theme: Theme
  style: ThemeStyle
  motion: Motion
  els: SlideElement[]
  z: number
  /** next animation order slot (drives stagger) */
  order: number
  aspect: AspectRatio
  /** hex of the slide's body background (cards pick a contrasting fill from it) */
  bodyBg: string
  /** lowest y content may reach (leaves room for the renderer-drawn footer when the template has one) */
  bottom: number
  /** which look a plain title+bullets slide takes (rotates through the deck so neighbours differ) */
  variant?: number
  /** draw ornaments above the slide's picture instead of behind everything (covers) */
  decoTop?: boolean
}

export function makeCtx(theme: Theme, aspect: AspectRatio, id: IdGen): Ctx {
  const { width: W, height: H } = CANVAS[aspect]
  const style = { ...CLASSIC_STYLE, ...theme.style }
  const M = Math.round(W * 0.05)
  return { W, H, M, id, theme, style, motion: { ...NO_MOTION, ...theme.motion }, els: [], z: 0, order: 0, aspect, bodyBg: theme.colors.background, bottom: H - M - (style.footer !== 'none' ? 30 : 0) }
}

// ── animation ────────────────────────────────────────────────────────────────
type Kind = 'title' | 'body' | 'card' | 'image' | 'metric' | 'accent'
export function animationFor(c: Ctx, kind: Kind, byParagraph = false): Animation | undefined {
  const m = c.motion
  if (m.entrance === 'none') return undefined
  const type: Animation['type'] = kind === 'metric' ? 'count-up' : kind === 'image' ? 'zoom' : kind === 'card' && (m.entrance === 'fade-up' || m.entrance === 'fade') ? 'pop' : kind === 'accent' ? 'wipe' : (m.entrance as Animation['type'])
  const delay = Math.min(7000, c.order++ * m.stagger)
  return { type, delay, duration: m.duration, ...(byParagraph ? { byParagraph: true, stagger: Math.round(m.stagger * 0.8) } : {}) }
}

// ── colour helpers ───────────────────────────────────────────────────────────
export const pal = (c: Ctx) => c.theme.colors
export const headingHex = (c: Ctx) => pal(c).textPrimary

/** Background colour for a title-style slide, as hex (and optional gradient). */
export function titleBg(c: Ctx): { value: string; gradient?: { from: string; to: string; angle: number } } {
  const k = pal(c)
  switch (c.style.titleBackground) {
    case 'gradient': return { value: k.primary, gradient: { from: k.primary, to: mix(k.primary, k.accent, 0.55), angle: 135 } }
    case 'dark': return { value: mix(k.primary, '#000000', 0.72) }
    case 'surface': return { value: k.surface }
    case 'accent': return { value: k.accent }
    default: return { value: k.primary }
  }
}
/**
 * Text colour that reads on a given background — or on ALL stops of a gradient (the worst stop decides, so text never
 * disappears into one end of a gradient).
 */
export function onBg(c: Ctx, bg: string | string[]): string {
  const stops = Array.isArray(bg) ? bg : [bg]
  const candidates = [pal(c).onPrimary, '#FFFFFF', pal(c).textPrimary, '#0B0F1A']
  const worst = (fg: string) => Math.min(...stops.map((s) => contrastRatio(fg, s)))
  const passing = candidates.find((f) => worst(f) >= 4.5)
  return passing ?? candidates.reduce((best, f) => (worst(f) > worst(best) ? f : best))
}
/** Every colour a (possibly gradient) background passes through, for contrast decisions. */
export const stopsOf = (bg: { value: string; gradient?: { from: string; to: string } | undefined }): string[] => (bg.gradient ? [bg.gradient.from, mix(bg.gradient.from, bg.gradient.to, 0.5), bg.gradient.to] : [bg.value])

// ── elements ─────────────────────────────────────────────────────────────────
const base = (c: Ctx, x: number, y: number, w: number, h: number) => ({ id: c.id(), x, y, width: w, height: h, rotation: 0, locked: false, zIndex: c.z++, opacity: 1 })

export interface TextOpts {
  align?: TextElement['align'] | undefined
  color?: TextElement['color']
  valign?: TextElement['valign'] | undefined
  min?: number
  weight?: number | undefined
  uppercase?: boolean
  tracking?: number | undefined
  lineHeight?: number
  rotation?: number | undefined
  animate?: Kind | false | undefined
  byParagraph?: boolean | undefined
  bullet?: ThemeStyle['bullet']
}

const HEADINGS = new Set<TextElement['role']>(['title', 'heading', 'metric'])

export function text(c: Ctx, role: TextElement['role'], paragraphs: Para, x: number, y: number, w: number, h: number, size: number, o: TextOpts = {}): TextElement {
  const heading = HEADINGS.has(role)
  const uppercase = o.uppercase ?? (heading && role !== 'metric' ? c.style.uppercaseHeadings : false)
  const tracking = o.tracking ?? (role === 'title' || role === 'heading' ? c.style.headingTracking : 0)
  const weight = o.weight ?? (role === 'title' ? c.style.headingWeight : role === 'metric' ? Math.max(700, c.style.headingWeight) : role === 'heading' ? Math.max(600, c.style.headingWeight - 100) : undefined)
  const proto = { role, uppercase, letterSpacing: tracking, lineHeight: o.lineHeight }
  const fitted = fitFontSize(paragraphs, w, h, size, o.min ?? Math.round(size * 0.5), metricOptsFor(proto as TextElement, c.theme))
  const anim = o.animate === false ? undefined : animationFor(c, o.animate ?? (role === 'metric' ? 'metric' : role === 'title' ? 'title' : 'body'), o.byParagraph)
  const el: TextElement = {
    type: 'text', ...base(c, x, y, w, h), rotation: o.rotation ?? 0,
    role, paragraphs, fontSize: fitted, align: o.align ?? 'left', color: o.color ?? 'textPrimary', valign: o.valign ?? 'top', bullet: o.bullet ?? c.style.bullet,
    ...(weight ? { weight } : {}), ...(uppercase ? { uppercase: true } : {}), ...(tracking ? { letterSpacing: tracking } : {}), ...(o.lineHeight ? { lineHeight: o.lineHeight } : {}),
    ...(anim ? { animation: anim } : {}),
  }
  c.els.push(el)
  return el
}

type ShapeFill = 'surface' | 'primary' | 'secondary' | 'accent' | 'background' | 'text' | 'onPrimary' | 'none' | (string & {})
export interface ShapeOpts {
  radius?: number | undefined
  shape?: 'rect' | 'ellipse' | 'ring' | 'triangle' | 'chevron' | 'line'
  opacity?: number | undefined
  rotation?: number
  gradient?: { from: string; to: string; angle?: number } | undefined
  stroke?: string
  strokeWidth?: number | undefined
  decorative?: boolean
  z?: number | undefined
  animate?: Kind | false | undefined
}
export function shape(c: Ctx, fill: ShapeFill, x: number, y: number, w: number, h: number, o: ShapeOpts = {}): SlideElement {
  const anim = o.animate ? animationFor(c, o.animate) : undefined
  const b = base(c, x, y, w, h)
  const el: SlideElement = {
    type: 'shape', ...b, ...(o.z !== undefined ? { zIndex: o.z } : {}), rotation: o.rotation ?? 0, opacity: o.opacity ?? 1,
    shape: o.shape ?? 'rect', fill: fill as never, radius: o.radius ?? 0,
    ...(o.gradient ? { gradient: { from: o.gradient.from, to: o.gradient.to, angle: o.gradient.angle ?? 135 } } : {}),
    ...(o.stroke ? { stroke: o.stroke as never, strokeWidth: o.strokeWidth ?? 3 } : {}),
    ...(o.decorative ? { decorative: true, locked: true } : {}),
    ...(anim ? { animation: anim } : {}),
  }
  if (o.z === undefined) c.z = Math.max(c.z, el.zIndex + 1)
  c.els.push(el)
  return el
}
const rect = (c: Ctx, fill: ShapeFill, x: number, y: number, w: number, h: number, o: ShapeOpts = {}) => shape(c, fill, x, y, w, h, o)

/** Decorations always sit behind content (negative z) and never take part in selection/validation. */
export const deco = (c: Ctx, fill: ShapeFill, x: number, y: number, w: number, h: number, o: ShapeOpts = {}) => shape(c, fill, x, y, w, h, { ...o, decorative: true, ...(c.decoTop ? {} : { z: -20 + c.els.filter((e) => e.decorative).length }) })

// ── layout helpers ───────────────────────────────────────────────────────────
/** Card grid: as many columns as fit at `minW`, wrapping to more rows on narrow canvases (never squeezing text). */
export function grid(c: Ctx, n: number, y: number, minW: number, gap: number, maxH?: number, x0 = c.M, totalW = c.W - 2 * c.M) {
  const cols = Math.max(1, Math.min(n, Math.floor((totalW + gap) / (minW + gap))))
  const rows = Math.ceil(n / cols)
  const cw = (totalW - gap * (cols - 1)) / cols
  const availH = c.bottom - y
  const ch = Math.min(maxH ?? availH, (availH - gap * (rows - 1)) / rows)
  return { cols, rows, cw, ch, gap, pos: (i: number) => ({ x: x0 + (i % cols) * (cw + gap), y: y + Math.floor(i / cols) * (ch + gap) }) }
}

/** Fill for cards: always visibly different from the slide background, whatever the body style is. */
export function cardFill(c: Ctx): string {
  const k = pal(c)
  return Math.abs(luminance(c.bodyBg) - luminance(k.surface)) < 0.012 ? k.background : k.surface
}

/** A card in the template's card style. Returns the content inset (padding) so layouts position text inside consistently. */
export function card(c: Ctx, x: number, y: number, w: number, h: number, o: { tone?: 'primary' | 'accent' | 'secondary'; animate?: boolean } = {}): number {
  const k = pal(c)
  const r = c.theme.radius
  const tone = k[o.tone ?? 'primary']
  const fill = cardFill(c)
  const anim = o.animate === false ? undefined : 'card'
  switch (c.style.card) {
    case 'outline':
      rect(c, 'none', x, y, w, h, { radius: r, stroke: mix(k.textSecondary, c.bodyBg, 0.55), strokeWidth: 3, animate: anim })
      break
    case 'shadow':
      rect(c, 'text', x + 10, y + 12, w, h, { radius: r, opacity: 0.12 })
      rect(c, fill, x, y, w, h, { radius: r, stroke: mix(k.textSecondary, c.bodyBg, 0.8), strokeWidth: 2, animate: anim })
      break
    case 'tint':
      rect(c, mix(tone, c.bodyBg, 0.9), x, y, w, h, { radius: r, animate: anim })
      break
    case 'accent-top':
      rect(c, fill, x, y, w, h, { radius: r, animate: anim })
      rect(c, tone, x, y, w, 12, { radius: Math.min(r, 6) })
      break
    case 'accent-left':
      rect(c, fill, x, y, w, h, { radius: r, animate: anim })
      rect(c, tone, x, y, 12, h, { radius: Math.min(r, 6) })
      break
    case 'paper': {
      // a sheet of paper stuck down with a strip of tape
      rect(c, 'text', x + 6, y + 8, w, h, { radius: 6, opacity: 0.1 })
      rect(c, fill, x, y, w, h, { radius: 6, stroke: mix(k.textSecondary, c.bodyBg, 0.82), strokeWidth: 2, animate: anim })
      rect(c, tone, x + w / 2 - 50, y - 12, 100, 26, { radius: 3, opacity: 0.55, rotation: -2 })
      return 40
    }
    case 'sticker':
      // chunky offset block shadow + outline
      rect(c, tone, x + 10, y + 10, w, h, { radius: r })
      rect(c, fill, x, y, w, h, { radius: r, stroke: k.textPrimary, strokeWidth: 3, animate: anim })
      break
    default:
      rect(c, fill, x, y, w, h, { radius: r, animate: anim })
  }
  return c.style.card === 'accent-left' ? 40 : 32
}

/** Colour a card's inner text should use: only differs when the card is tinted with the tone colour. */
export const cardBgHex = (c: Ctx, tone: 'primary' | 'accent' | 'secondary' = 'primary') => (c.style.card === 'tint' ? mix(pal(c)[tone], c.bodyBg, 0.9) : cardFill(c))

export { rect, isDark, blend, luminance, mix, readableOn }
