import type { Slide, SlideContent, SlideElement } from '@prompttoppt/validation'
import { mix, readableOn } from '../color'
import { estimateTextHeight, metricOptsFor } from '../text-metrics'
import { contrastRatio, effectiveBackground, resolveColor } from '../validate'
import { COVER_ONLY_DECOR, decor } from './decor'
import { card, cardBgHex, isDark, onBg, pal, para, rect, shape, stopsOf, text, textNeed, titleBg, type Ctx } from './primitives'

/**
 * The Morph layouts. ONE cast of elements, drawn by twelve scenes in twelve arrangements, with the SAME element id for the same part on every slide (title, kicker, subtitle, hero picture,
 * each card and its number / heading / text, the stat, the accents, the ornament, the logo). A Morph (packages/ui/src/motion) matches elements by id, so between two scenes the cards
 * really travel, grow and regroup instead of fading out and in. A part a scene does not use is simply not there (it goes out, or comes in).
 *
 * Nothing here has an entrance animation: a Morph deck moves by its transitions.
 */
type M = Extract<SlideContent, { layout: 'morph' }>
type Scene = M['scene']
type Img = Extract<SlideElement, { type: 'image' }>

/** The transition every Morph slide arrives with. */
export const MORPH_TRANSITION = { type: 'morph', duration: 900, easing: 'power2-in-out', own: true } as const

/** Scenes drawn on the theme's title background (the dramatic ones); the others sit on the body background. */
const DRAMATIC = new Set<Scene>(['cover', 'focus-hero', 'closing'])

interface Look {
  fg: string; muted: string; accent: string; bg: string
  /**
   * How much of the optional detail a scene draws. 0: everything. 1: no kicker and no subtitle. 2: also no card numbers. A slide whose words do not fit at 0 is drawn again at 1, then 2
   * (a tight canvas with long words: the title and the cards matter, the extras give way). The same rule runs on every slide, so the cast stays consistent.
   */
  detail: 0 | 1 | 2
}

/** Runs `draw` and gives what it put on the slide the ids `name`, `name~1`, … (the same on every slide, whatever the random id generator says). */
export function named<T>(c: Ctx, name: string, draw: () => T): T {
  const from = c.els.length
  const r = draw()
  c.els.slice(from).forEach((e, k) => { e.id = k === 0 ? name : `${name}~${k}` })
  return r
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const tones = ['primary', 'accent', 'secondary'] as const

// ── the cast ───────────────────────────────────────────────────────────────
//
// The rule that makes a Morph look connected: every part of the cast is a RIGID object. A scene only chooses where it goes and how big it is (one scale for the whole object), never its shape.
//  · a CARD is one fixed-proportion tile; its text is fitted ONCE (at its base size, from its own words), so it wraps the same way at every scale and a Morph is a clean move and resize.
//    A card too small to read its body shows only its number and heading (the body fades away; it is back when the card is big again).
//  · the PICTURE has one fixed shape (4:5) at every size, so it is only ever scaled, never re-cropped.
//  · the HEADER (kicker, title, subtitle) stays where it is on every content scene; the cards and the picture do the moving.

/** A card at scale 1 (a 1920-wide canvas). Everything inside it is measured from these. */
const BASE = { w: 500, h: 380, pad: 32 }
const NUM = 26, HEAD = 44, BODY = 28
/** A card drawn smaller than this scale shows number and heading only: its body would be under about 20 px on a 1920-wide slide (in proportion on a narrower one). */
const bodyFrom = (c: Ctx) => Math.max(0.4, (c.W * 0.0105) / BODY)
const HERO_RATIO = 0.8 // the picture is always 4:5 (width over height)

interface Typo {
  head: number; body: number
  /** the smallest scale at which a card still shows its body */
  bodyFrom: number
  /** each card's heading height at base size (one or two lines) */
  headH: number[]
}

// the same measure the validator will use: a heading is set with the design's heading weight, case and tracking, which make it wider
const proto = (c: Ctx, role: 'heading' | 'body') => ({ role, uppercase: role === 'heading' ? c.style.uppercaseHeadings : false, letterSpacing: role === 'heading' ? c.style.headingTracking : 0, ...(role === 'heading' ? { weight: Math.max(600, c.style.headingWeight - 100) } : {}) }) as never
const need = (c: Ctx, role: 'heading' | 'body', t: string, size: number, w: number) => estimateTextHeight([para(t)], size, w, metricOptsFor(proto(c, role), c.theme))

/** Where a card's parts sit at base size (before scaling). */
const NUM_Y = Math.round(BASE.pad * 0.7), HEAD_Y = NUM_Y + 44

/**
 * The type of the deck's cards, fitted once from the cards' own words: one heading size and one body size for ALL cards, chosen so that every card fits at base size. The same numbers
 * are used by every scene (only multiplied by the card's scale), which is why a card's text wraps the same way wherever it is.
 */
function typo(c: Ctx, s: M): Typo {
  // measured a little narrower than the box really is, so a line that only just fits at base size cannot wrap differently once it is scaled and rounded
  const iw = Math.round((BASE.w - 2 * BASE.pad) * 0.93)
  let head = HEAD
  while (head > 24 && s.items.some((it) => need(c, 'heading', it.heading, head, iw) * 1.08 > head * 1.3 * 2 + 6)) head -= 2
  const headH = s.items.map((it) => Math.ceil(need(c, 'heading', it.heading, head, iw) * 1.08) + 6)
  let body = BODY
  const room = (i: number) => BASE.h - (HEAD_Y + (headH[i] ?? 0) + 10) - Math.round(BASE.pad * 0.8)
  while (body > 20 && s.items.some((it, i) => need(c, 'body', it.text, body, iw) * 1.06 > room(i))) body -= 2
  return { head, body, headH, bodyFrom: bodyFrom(c) }
}

/** Kicker, title and subtitle from (x, y); the title and subtitle boxes are as tall as their words need. Returns the y below them. */
function head(c: Ctx, s: M, L: Look, x: number, y: number, w: number, o: { size: number; titleRoom: number; subSize?: number; subRoom?: number; align?: 'left' | 'center'; min?: number }): number {
  let cy = y
  if (s.kicker && L.detail < 1) {
    named(c, 'm-kicker', () => text(c, 'caption', [para(s.kicker!)], x, cy, w, 36, 24, { uppercase: true, tracking: 2, weight: 700, color: L.accent, align: o.align, animate: false, min: 18 }))
    cy += 44
  }
  const th = Math.min(o.titleRoom, Math.max(64, Math.ceil(textNeed(c, 'title', [para(s.title)], w, o.size)) + 14))
  named(c, 'm-title', () => text(c, 'title', [para(s.title)], x, cy, w, th, o.size, { color: L.fg, align: o.align, valign: 'top', animate: false, min: o.min ?? 38 }))
  cy += th + 8
  if (s.subtitle && L.detail < 1) {
    const h = Math.min(o.subRoom ?? 90, Math.max(44, Math.ceil(textNeed(c, 'body', [para(s.subtitle!)], w, o.subSize ?? 28)) + 10))
    named(c, 'm-sub', () => text(c, 'body', [para(s.subtitle!)], x, cy, w, h, o.subSize ?? 28, { color: L.muted, align: o.align, animate: false, min: 20 }))
    cy += h + 8
  }
  return cy
}

/** The header every content scene shares: same place, same size, same width (room is kept for the small picture), so the title does not move from slide to slide. */
const THUMB_H = (c: Ctx) => Math.round(c.H * 0.16)
function standardHead(c: Ctx, s: M, L: Look): { top: number } {
  const w = c.W - 2 * c.M - Math.round(THUMB_H(c) * HERO_RATIO) - 40
  const titleRoom = Math.round(c.H * (c.W / c.H < 1.5 ? 0.18 : 0.125)), subRoom = Math.round(c.H * 0.075) // a squarer canvas wraps the title in more lines
  head(c, s, L, c.M, c.M, w, { size: 56, titleRoom, subSize: 26, subRoom, min: 40 })
  return { top: c.M + 44 + titleRoom + 8 + subRoom + 12 } // where the cards' area begins: fixed, whatever the words
}

/** The deck's picture, always 4:5 (a colour block of the same shape when it has none). `h` is its height. */
function hero(c: Ctx, s: M, x: number, y: number, h: number, radius = c.theme.radius) {
  const k = pal(c)
  const w = Math.round(h * HERO_RATIO)
  named(c, 'm-hero', () => {
    if (s.imageUrl) {
      c.els.push({ type: 'image', id: c.id(), x, y, width: w, height: h, rotation: 0, locked: false, zIndex: c.z++, opacity: 1, src: s.imageUrl, alt: s.imageAlt ?? s.title, fit: 'cover', clip: 'none', ...(s.imageAttribution ? { attribution: s.imageAttribution } : {}), ...(radius ? { radius } : {}) } as Img)
    } else {
      shape(c, k.primary, x, y, w, h, { radius, gradient: { from: k.primary, to: k.accent, angle: 135 }, animate: false })
    }
  })
  return w
}
const thumb = (c: Ctx, s: M) => hero(c, s, c.W - c.M - Math.round(THUMB_H(c) * HERO_RATIO), c.M, THUMB_H(c))

const cardText = (c: Ctx, tone: (typeof tones)[number]) => readableOn(cardBgHex(c, tone), [pal(c).textPrimary, '#FFFFFF', '#111111'], 4.5)
const cardMuted = (c: Ctx, tone: (typeof tones)[number]) => readableOn(cardBgHex(c, tone), [pal(c).textSecondary, pal(c).textPrimary, '#FFFFFF', '#111111'], 4.5)

/** The size of card `i` at scale `k`: the full card (with its body) or, when it is too small to read, just the number and heading. */
function cardSize(T: Typo, i: number, k: number, mini = false): { w: number; h: number; body: boolean } {
  const body = !mini && k >= T.bodyFrom
  const h = body ? BASE.h : HEAD_Y + (T.headH[i] ?? 0) + Math.round(BASE.pad * 0.9)
  return { w: Math.round(BASE.w * k), h: Math.round(h * k), body }
}

/** Draws card `i` with its top-left at (x, y) at scale `k`. Every length and every font size is the base value times k: the card is one rigid object. */
function card_(c: Ctx, s: M, L: Look, T: Typo, i: number, x: number, y: number, k: number, mini = false) {
  const it = s.items[i]
  if (!it) return
  const tone = tones[i % 2]!
  const kc = pal(c)
  const { w, h, body } = cardSize(T, i, k, mini)
  named(c, `m-c${i}`, () => card(c, x, y, w, h, { tone, animate: false }))
  const ink = cardText(c, tone), soft = cardMuted(c, tone)
  const numColor = readableOn(cardBgHex(c, tone), [kc.accent, kc.primary, ink], 4.5)
  const pad = BASE.pad * k, iw = (BASE.w - 2 * BASE.pad) * k
  /** a text of the card: made through the engine (fonts, weights, colours) and then given its exact scaled size, so it is never re-fitted differently from scene to scene */
  const put = (name: string, role: 'caption' | 'heading' | 'body', t: string, ty: number, th: number, size: number, o: { color: string; weight?: number }) =>
    named(c, name, () => { const e = text(c, role, [para(t)], x + pad, y + ty * k, iw, th * k, size, { color: o.color, ...(o.weight ? { weight: o.weight } : {}), animate: false, min: 8 }); e.fontSize = Math.max(8, Math.round(size * k)); return e })
  if (L.detail < 2) put(`m-c${i}-n`, 'caption', String(i + 1).padStart(2, '0'), NUM_Y, 40, NUM, { color: numColor, weight: 800 })
  put(`m-c${i}-h`, 'heading', it.heading, HEAD_Y, T.headH[i] ?? 60, T.head, { color: ink })
  if (body) put(`m-c${i}-t`, 'body', it.text, HEAD_Y + (T.headH[i] ?? 0) + 10, BASE.h - (HEAD_Y + (T.headH[i] ?? 0) + 10) - Math.round(BASE.pad * 0.8), T.body, { color: soft })
}

interface Rect { x: number; y: number; w: number; h: number }
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/** The scale at which `cols × rows` full cards fit in `r` with `gap` between them (never above `cap`). */
const fitK = (r: Rect, cols: number, rows: number, gap: number, cap = 1.6) => clamp(Math.min((r.w - gap * (cols - 1)) / (cols * BASE.w), (r.h - gap * (rows - 1)) / (rows * BASE.h)), 0.3, cap)

/** Cards in rows and columns, from the top-left of `r` (or centred across it), every card at scale k. */
function gridOf(c: Ctx, s: M, L: Look, T: Typo, idx: number[], r: Rect, cols: number, k: number, gap: number, o: { centre?: boolean; dy?: (row: number, col: number) => number } = {}) {
  const rows = Math.ceil(idx.length / cols)
  const cw = BASE.w * k, ch = BASE.h * k
  const width = cols * cw + (cols - 1) * gap
  const x0 = o.centre ? r.x + (r.w - width) / 2 : r.x
  const y0 = r.y + Math.max(0, (r.h - (rows * ch + (rows - 1) * gap)) * 0.42)
  idx.forEach((i, n) => { const col = n % cols, row = Math.floor(n / cols); card_(c, s, L, T, i, Math.round(x0 + col * (cw + gap)), Math.round(y0 + row * (ch + gap) + (o.dy?.(row, col) ?? 0)), k) })
}

/** Small cards (number and heading) one under the other in `r`, at scale k. */
function stack(c: Ctx, s: M, L: Look, T: Typo, idx: number[], r: Rect, k: number, gap: number) {
  let y = r.y
  for (const i of idx) { card_(c, s, L, T, i, r.x, Math.round(y), k, true); y += cardSize(T, i, k, true).h + gap }
}

// ── the twelve scenes ──────────────────────────────────────────────────────

type SceneFn = (c: Ctx, s: M, L: Look, T: Typo) => void
const SCENES: Record<Scene, SceneFn> = {
  /** The picture down the right edge, the big title on the left. */
  cover(c, s, L) {
    const { W, H, M } = c
    const hh = Math.min(H, Math.round((W * 0.46) / HERO_RATIO))
    const hw = hero(c, s, W - Math.round(hh * HERO_RATIO), H - hh, hh, 0)
    named(c, 'm-accent-1', () => rect(c, L.accent, M, Math.round(H * 0.27), 120, 12, { radius: 6 }))
    head(c, s, L, M, Math.round(H * 0.31), W - hw - 2 * M, { size: 80, titleRoom: Math.round(H * 0.3), subSize: 34, subRoom: Math.round(H * 0.17) })
  },

  /** A picture panel on the left; the title and the four cards on the right. */
  'hero-left'(c, s, L, T) {
    const { W, H, M } = c
    const hh = Math.min(H - 2 * M, Math.round((W * 0.31) / HERO_RATIO))
    const hw = hero(c, s, M, Math.round((H - hh) / 2), hh)
    const x0 = M + hw + M, w = W - x0 - M
    const y = head(c, s, L, x0, M, w, { size: 52, titleRoom: Math.round(H * 0.17), subSize: 26, subRoom: Math.round(H * 0.09), min: 36 })
    const r = { x: x0, y: y + 8, w, h: c.bottom - y - 8 }
    gridOf(c, s, L, T, range(s.items.length), r, 2, fitK(r, 2, Math.ceil(s.items.length / 2), 18), 18)
  },

  /** The header, the small picture, the cards in one row. */
  'cards-row'(c, s, L, T) {
    const { W, M } = c
    const { top } = standardHead(c, s, L); thumb(c, s)
    const n = s.items.length || 1
    const cols = W / c.H >= 1.6 ? n : 2
    const r = { x: M, y: top, w: W - 2 * M, h: c.bottom - top }
    gridOf(c, s, L, T, range(s.items.length), r, cols, fitK(r, cols, Math.ceil(n / cols), 24, 1), 24, { centre: true })
  },

  /** The concepts as a list down the left, the picture as a panel on the right. */
  'cards-column'(c, s, L, T) {
    const { W, M } = c
    const { top } = standardHead(c, s, L)
    const ph = c.bottom - top
    hero(c, s, W - M - Math.round(ph * HERO_RATIO), top, ph)
    const k = 0.85 // a list: each card is its number and heading
    const r = { x: M, y: top, w: Math.round(BASE.w * k), h: ph }
    stack(c, s, L, T, range(s.items.length), r, k, 16)
  },

  /** The cards in a 2 × 2 on the left, the picture as a panel on the right. */
  'cards-grid'(c, s, L, T) {
    const { W, M } = c
    const { top } = standardHead(c, s, L)
    const ph = c.bottom - top
    const pw = hero(c, s, W - M - Math.round(ph * HERO_RATIO), top, ph)
    const r = { x: M, y: top, w: W - 2 * M - pw - 40, h: ph }
    gridOf(c, s, L, T, range(s.items.length), r, 2, fitK(r, 2, Math.ceil((s.items.length || 1) / 2), 20, 1.1), 20, { centre: true })
  },

  /** One card (s.focus) grows to take the stage, the others shrink to a list beside it. */
  spotlight(c, s, L, T) {
    const { W, M } = c
    const { top } = standardHead(c, s, L); thumb(c, s)
    const n = s.items.length
    const f = clamp(s.focus ?? 0, 0, Math.max(0, n - 1))
    const km = 0.62
    const colW = Math.round(BASE.w * km)
    const gap = 48
    const stage = { x: M, y: top, w: W - 2 * M - colW - gap, h: c.bottom - top }
    const k = fitK(stage, 1, 1, 0, 1.7)
    const bigW = Math.round(BASE.w * k)
    // the stage card and the list beside it are centred as one group, so there is no hole between them
    const x0 = Math.round(M + (W - 2 * M - (bigW + gap + colW)) / 2)
    card_(c, s, L, T, f, x0, stage.y, k)
    stack(c, s, L, T, range(n).filter((i) => i !== f), { x: x0 + bigW + gap, y: top, w: colW, h: stage.h }, km, 16)
  },

  /** The cards climb left to right: one idea leads to the next. */
  timeline(c, s, L, T) {
    const { W, M } = c
    const { top } = standardHead(c, s, L); thumb(c, s)
    const n = s.items.length || 1
    const cols = W / c.H >= 1.6 ? n : 2
    const r = { x: M, y: top, w: W - 2 * M, h: c.bottom - top }
    const k = fitK({ ...r, h: r.h - 60 }, cols, Math.ceil(n / cols), 24, 0.95)
    const rise = cols > 1 ? Math.min(60, (r.h - BASE.h * k * Math.ceil(n / cols)) / (cols - 1)) : 0
    gridOf(c, s, L, T, range(s.items.length), { ...r, h: r.h }, cols, k, 24, { centre: true, dy: (_row, col) => Math.round((cols - 1 - col) * rise) })
  },

  /** The number takes the stage; the cards wait in a list beside it. */
  'big-stat'(c, s, L, T) {
    const { W, M } = c
    const k = pal(c)
    const { top } = standardHead(c, s, L)
    const km = 0.62, colW = Math.round(BASE.w * km)
    const lw = W - 2 * M - colW - 48
    if (s.stat) {
      named(c, 'm-stat-value', () => text(c, 'metric', [para(s.stat!.value)], M, top + 10, lw, Math.round(c.H * 0.3), 200, { color: k.primary, valign: 'middle', animate: false, min: 90 }))
      named(c, 'm-stat-label', () => text(c, 'heading', [para(s.stat!.label)], M, top + 10 + Math.round(c.H * 0.3) + 8, lw, Math.round(c.H * 0.12), 40, { color: L.fg, animate: false, min: 24 }))
    }
    stack(c, s, L, T, range(s.items.length), { x: W - M - colW, y: top, w: colW, h: c.bottom - top }, km, 16)
  },

  /** Two groups of two cards facing each other across a line. */
  compare(c, s, L, T) {
    const { W, M } = c
    const k = pal(c)
    const { top } = standardHead(c, s, L); thumb(c, s)
    const n = s.items.length
    const half = Math.ceil(n / 2)
    const area = { x: M, y: top, w: W - 2 * M, h: c.bottom - top }
    const kk = fitK({ ...area, w: (area.w - 60) / 2 }, 1, Math.max(1, half), 16, 0.9)
    const cw = Math.round(BASE.w * kk)
    const gx = (area.w - 2 * cw) / 3
    named(c, 'm-accent-1', () => rect(c, k.secondary, W / 2 - 3, top, 6, c.bottom - top, { radius: 3, opacity: 0.5 }))
    const left = range(n).slice(0, half), right = range(n).slice(half)
    gridOf(c, s, L, T, left, { x: Math.round(M + gx), y: top, w: cw, h: area.h }, 1, kk, 16)
    gridOf(c, s, L, T, right, { x: Math.round(W - M - gx - cw), y: top, w: cw, h: area.h }, 1, kk, 16)
  },

  /** The picture large on the right; one big sentence on the left. */
  'focus-hero'(c, s, L) {
    const { W, H, M } = c
    const hh = Math.min(H - 2 * M, Math.round((W * 0.42) / HERO_RATIO))
    const hw = hero(c, s, W - M - Math.round(hh * HERO_RATIO), Math.round((H - hh) / 2), hh, c.theme.radius)
    const w = W - 2 * M - hw - 60
    head(c, s, L, M, Math.round(H * 0.3), w, { size: 76, titleRoom: Math.round(H * 0.34), subSize: 32, subRoom: Math.round(H * 0.16), min: 44 })
  },

  /** The title is the quote; the subtitle says who. The block is centred on the slide. */
  quote(c, s, L) {
    const { W, H, M } = c
    const x = M + 60, w = W - 2 * M - 60
    const q = Math.min(Math.round(H * 0.5), Math.ceil(textNeed(c, 'title', [para(s.title)], w, 60)) + 16)
    const who = s.subtitle && L.detail < 1 ? Math.min(Math.round(H * 0.1), Math.ceil(textNeed(c, 'body', [para(s.subtitle)], w, 30)) + 10) : 0
    const kick = s.kicker && L.detail < 1 ? 56 : 0
    const total = kick + q + (who ? 24 + who : 0)
    const top = Math.round((H - total) / 2)
    named(c, 'm-accent-1', () => rect(c, L.accent, M, top, 16, total, { radius: 8 }))
    if (kick) named(c, 'm-kicker', () => text(c, 'caption', [para(s.kicker!)], x, top, w, 36, 24, { uppercase: true, tracking: 2, weight: 700, color: L.accent, animate: false, min: 18 }))
    named(c, 'm-title', () => text(c, 'title', [para(s.title)], x, top + kick, w, q, 60, { color: L.fg, valign: 'middle', animate: false, min: 36, weight: 600 }))
    if (who) named(c, 'm-sub', () => text(c, 'body', [para(s.subtitle!)], x, top + kick + q + 24, w, who, 30, { color: L.muted, animate: false, min: 20 }))
  },

  /** Everything gathers: a centred title, with the cards as small tiles along the bottom. */
  closing(c, s, L, T) {
    const { W, H, M } = c
    named(c, 'm-accent-1', () => rect(c, L.accent, W / 2 - 60, Math.round(H * 0.2), 120, 12, { radius: 6 }))
    head(c, s, L, M, Math.round(H * 0.25), W - 2 * M, { size: 84, titleRoom: Math.round(H * 0.22), subSize: 34, subRoom: Math.round(H * 0.12), align: 'center' })
    const n = s.items.length || 1
    const km = clamp(((W - 2 * M) - 24 * (n - 1)) / (n * BASE.w), 0.3, 0.6)
    const cw = BASE.w * km, row = n * cw + (n - 1) * 24
    const y = c.bottom - Math.max(...range(s.items.length).map((i) => cardSize(T, i, km, true).h), 0)
    s.items.forEach((_, i) => card_(c, s, L, T, i, Math.round((W - row) / 2 + i * (cw + 24)), y, km, true))
  },
}

/**
 * Draws a Morph scene and returns the slide's background. Body scenes take the design's body background (as every other layout does); the dramatic ones (cover, picture, closing) take its title background.
 */
export function morphSlide(c: Ctx, s: M): { value: string; gradient?: { from: string; to: string; angle: number } } {
  const body0 = c.bodyBg
  let out = draw(c, s, 0)
  for (const detail of [1, 2] as const) {
    if (!overflows(c)) break
    c.els.length = 0; c.z = 0; c.order = 0; c.bodyBg = body0
    out = draw(c, s, detail)
  }
  return out
}

/** Does any text on the slide need more room than its box has (the validator's rule)? */
const overflows = (c: Ctx) => c.els.some((e) => e.type === 'text' && estimateTextHeight(e.paragraphs, e.fontSize, e.width, metricOptsFor(e, c.theme)) > e.height * 1.02)

function draw(c: Ctx, s: M, detail: 0 | 1 | 2): { value: string; gradient?: { from: string; to: string; angle: number } } {
  const k = pal(c)
  let bg: { value: string; gradient?: { from: string; to: string; angle: number } }
  let L: Look
  if (DRAMATIC.has(s.scene)) {
    bg = s.scene === 'focus-hero' ? { value: mix(k.primary, '#000000', 0.72) } : titleBg(c)
    const fg = s.scene === 'focus-hero' ? '#FFFFFF' : onBg(c, stopsOf(bg))
    L = { fg, muted: s.scene === 'focus-hero' ? '#E5E7EB' : readableOn(bg.value, [mix(fg, bg.value, 0.2), fg], 4.5), accent: s.scene === 'focus-hero' ? '#FFFFFF' : readableOn(bg.value, [k.accent, fg], 3), bg: bg.value, detail }
    c.bodyBg = bg.value
    named(c, 'm-decor', () => decor(c, isDark(bg.value)))
  } else {
    if (s.scene === 'quote') c.bodyBg = k.surface
    else if (c.style.bodyBackground === 'tint') c.bodyBg = mix(k.background, k.primary, 0.035)
    bg = c.style.bodyBackground === 'gradient' && s.scene !== 'quote'
      ? { value: k.background, gradient: { from: k.background, to: mix(k.background, k.primary, 0.1), angle: 160 } }
      : { value: c.bodyBg }
    if (c.style.bodyBackground === 'gradient') c.bodyBg = mix(k.background, k.primary, 0.05)
    L = { fg: k.textPrimary, muted: k.textSecondary, accent: readableOn(c.bodyBg, [k.accent, k.primary], 3), bg: c.bodyBg, detail }
    named(c, 'm-decor', () => decor(c, false, COVER_ONLY_DECOR.has(c.style.decor) ? 'none' : c.style.decor))
  }
  SCENES[s.scene](c, s, L, typo(c, s))
  readable(c, bg, L)
  return bg
}

/**
 * Text is judged against what is really behind it: a card, a band, or an ornament of the design. After a scene is drawn, any text that would not read there (4.5:1) takes the first of
 * the scene's colours that does. (A card style with no fill, or a design's corner ornament, can put text on a colour the scene did not choose it for.)
 */
function readable(c: Ctx, bg: { value: string; gradient?: { from: string; to: string; angle: number } }, L: Look) {
  const slide = { background: bg.gradient ? { type: 'gradient', value: bg.value, gradient: bg.gradient } : { type: 'color', value: bg.value }, elements: c.els } as unknown as Slide
  for (const e of c.els) {
    if (e.type !== 'text') continue
    const under = effectiveBackground(slide, c.theme, e)
    const now = resolveColor(e.color, c.theme, slide)
    if (contrastRatio(now, under) >= 4.5) continue
    e.color = readableOn(under, [now, L.fg, pal(c).textPrimary, '#FFFFFF', '#111111'], 4.5)
  }
}
