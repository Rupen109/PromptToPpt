import type { SlideContent } from '@prompttoppt/validation'
import { decor } from './decor'
import { header } from './header'
import { clipFor } from './photoKit'
import { animationFor, card, cardBgHex, deco, grid, hug, onBg, pal, para, rect, shape, stopsOf, text, textNeed, type Ctx } from './primitives'
import { contrastRatio, hexToHsl, mix, readableOn } from '../color'

type C<L extends SlideContent['layout']> = Extract<SlideContent, { layout: L }>
const inner = (c: Ctx) => c.W - 2 * c.M

/** Text colour for content sitting on a card (tinted cards change the background). */
const cardText = (c: Ctx, tone: 'primary' | 'accent' | 'secondary' = 'primary') => readableOn(cardBgHex(c, tone), [pal(c).textPrimary, '#FFFFFF', '#111111'], 4.5)
const cardMuted = (c: Ctx, tone: 'primary' | 'accent' | 'secondary' = 'primary') => readableOn(cardBgHex(c, tone), [pal(c).textSecondary, pal(c).textPrimary, '#FFFFFF', '#111111'], 4.5)
const tones = ['primary', 'accent', 'secondary'] as const

/**
 * Colours for a progression (roadmap phases, architecture layers, process steps).
 * Blending primary into accent only looks good when their hues are close; when they are far apart (saffron + green, orange + blue)
 * the middle steps pass through a dull olive or grey. Then the whole progression stays in the primary hue, from a softened
 * shade up to the full colour, and cards keep one tone, so the slide reads as one palette instead of two clashing ones.
 */
export function huesClash(primary: string, accent: string): boolean {
  const [h1, s1] = hexToHsl(primary), [h2, s2] = hexToHsl(accent)
  if (s1 < 0.2 || s2 < 0.2) return false // a near-grey colour has no hue to clash with
  const d = Math.abs(h1 - h2)
  return Math.min(d, 360 - d) > 50
}
const clashes = (c: Ctx) => huesClash(pal(c).primary, pal(c).accent)
export function stepFill(c: Ctx, i: number, n: number): string {
  const k = pal(c)
  const t = n <= 1 ? 0 : i / (n - 1)
  return clashes(c) ? mix(mix(k.primary, c.bodyBg, 0.5), k.primary, t) : mix(k.primary, k.accent, t)
}

/**
 * Plain title + bullets, in rotating editorial looks so neighbouring slides never match:
 * 0 numbered rows on a solid panel beside the heading · 1 icon-disc cards in a row · 2 banded numbered rows · 3 classic list.
 */
export function titleBody(c: Ctx, s: C<'title-body'>) {
  const n = s.bullets.length
  const looks = n === 3 ? [0, 1, 2, 3] : [0, 2, 3]
  const roomy = c.W >= c.H * 1.3 && s.bullets.every((x) => x.length <= 120) // narrow canvases / long bullets keep the classic list
  const look = n < 2 || !roomy ? 3 : looks[(c.variant ?? 0) % looks.length]!
  const k = pal(c)
  if (look === 0) {
    const gap = 56
    const leftW = Math.round(inner(c) * 0.38)
    const x2 = c.M + leftW + gap
    const w2 = inner(c) - leftW - gap
    const y = header(c, s.title, { width: leftW })
    void y
    const top = c.M
    const h = c.bottom - top
    const panel = k.primary
    shape(c, panel, x2, top, w2, h, { radius: c.theme.radius, animate: 'card' })
    const fg = onBg(c, panel)
    const rowH = (h - 64) / Math.min(n, 5)
    s.bullets.slice(0, 5).forEach((b, i) => {
      const ry = top + 32 + i * rowH
      text(c, 'metric', [para(String(i + 1).padStart(2, '0'))], x2 + 36, ry, 96, rowH, 44, { color: fg, valign: 'middle', min: 22, animate: false })
      text(c, 'body', [para(b)], x2 + 150, ry, w2 - 190, rowH, 30, { color: fg, valign: 'middle', min: 16, animate: i === 0 ? 'body' : false })
      if (i < Math.min(n, 5) - 1) rect(c, mix(panel, fg, 0.35), x2 + 36, ry + rowH, w2 - 72, 2)
    })
    return
  }
  if (look === 1 && n === 3) {
    const y = header(c, s.title)
    const gap = 36
    const cw = (inner(c) - gap * 2) / 3
    s.bullets.forEach((b, i) => {
      const x = c.M + i * (cw + gap)
      const tone = tones[i % 2]!
      const pad = card(c, x, y, cw, c.bottom - y, { tone })
      const d = Math.min(110, cw * 0.28)
      shape(c, k[tone === 'accent' ? 'accent' : 'primary'], x + pad, y + pad, d, d, { shape: i === 1 ? 'rect' : 'ellipse', radius: i === 1 ? 18 : 0, animate: 'card' })
      text(c, 'metric', [para(String(i + 1))], x + pad, y + pad, d, d, Math.round(d * 0.5), { color: onBg(c, tone === 'accent' ? k.accent : k.primary), align: 'center', valign: 'middle', animate: false, min: 18 })
      text(c, 'body', [para(b)], x + pad, y + pad + d + 24, cw - 2 * pad, c.bottom - y - 2 * pad - d - 24, 32, { color: cardText(c, tone), min: 18 })
    })
    return
  }
  if (look === 1 || look === 2) {
    const y = header(c, s.title)
    const rows = Math.min(n, 6)
    const gap = 18
    const rh = Math.min(150, (c.bottom - y - gap * (rows - 1)) / rows)
    s.bullets.slice(0, 6).forEach((b, i) => {
      const ry = y + i * (rh + gap)
      const tone = tones[i % 2]!
      const pad = card(c, c.M, ry, inner(c), rh, { tone })
      const d = Math.min(72, rh - 24)
      shape(c, k[tone === 'accent' ? 'accent' : 'primary'], c.M + pad, ry + (rh - d) / 2, d, d, { shape: 'ellipse', animate: false })
      text(c, 'metric', [para(String(i + 1))], c.M + pad, ry + (rh - d) / 2, d, d, Math.round(d * 0.5), { color: onBg(c, tone === 'accent' ? k.accent : k.primary), align: 'center', valign: 'middle', animate: false, min: 14 })
      text(c, 'body', [para(b)], c.M + pad + d + 28, ry, inner(c) - 2 * pad - d - 28, rh, 30, { color: cardText(c, tone), valign: 'middle', min: 16, animate: i === 0 ? 'body' : false })
    })
    return
  }
  const y = header(c, s.title)
  text(c, 'body', s.bullets.map((b) => para(b, 'bullet')), c.M, y, inner(c), c.bottom - y, 36, { min: 22, byParagraph: true })
}

export function splitImageText(c: Ctx, s: C<'split-image-text'>) {
  const gap = 64
  const colW = (inner(c) - gap) / 2
  const y = header(c, s.title, { width: colW })
  text(c, 'body', s.bullets.map((b) => para(b, 'bullet')), c.M, y, colW, c.bottom - y, 32, { min: 20, byParagraph: true })
  const anim = animationFor(c, 'image')
  const photoStyled = c.style.photo !== 'none' && !!s.imageUrl
  c.els.push({ type: 'image', id: c.id(), x: c.M + colW + gap, y: c.M, width: colW, height: c.bottom - c.M, rotation: 0, locked: false, zIndex: c.z++, opacity: 1, alt: s.imageAlt, fit: 'cover', clip: photoStyled ? clipFor(c.style.photo) : 'none', prompt: s.imagePrompt, ...(photoStyled ? { radius: Math.min(c.theme.radius, 28) } : {}), ...(s.imageUrl ? { src: s.imageUrl } : {}), ...(s.imageAttribution ? { attribution: s.imageAttribution } : {}), ...(photoStyled ? { animation: { type: 'kenburns' as const, delay: 0, duration: 24000 } } : anim ? { animation: anim } : {}) })
}

export function quote(c: Ctx, s: C<'quote'>) {
  const { W, H, M } = c
  const k = pal(c)
  rect(c, k.accent, M, H / 2 - 220, 16, 440, { radius: 8, animate: 'accent' })
  text(c, 'quote', [para(`“${s.quote}”`)], M + 64, H / 2 - 220, inner(c) - 64, 360, 56, { valign: 'middle', min: 30 })
  if (s.attribution) text(c, 'caption', [para(`— ${s.attribution}`)], M + 64, H / 2 + 160, inner(c) - 64, 60, 28, { color: 'textSecondary', min: 18 })
  void W
}

export function metrics(c: Ctx, s: C<'metrics'>) {
  const y = header(c, s.title)
  const g = grid(c, s.metrics.length, y, 360, 40, 440)
  s.metrics.forEach((m, i) => {
    const { x, y: cy } = g.pos(i)
    const tone = tones[i % 2]!
    const pad = card(c, x, cy, g.cw, g.ch, { tone })
    const tall = g.ch >= 400
    text(c, 'metric', [para(m.value)], x + pad, cy + 20, g.cw - 2 * pad, tall ? 150 : 80, tall ? 100 : 60, { color: tone === 'accent' && c.style.card !== 'tint' ? 'primary' : 'primary', valign: 'middle', min: 32 })
    text(c, 'heading', [para(m.label)], x + pad, cy + (tall ? 190 : 100), g.cw - 2 * pad, tall ? 90 : Math.max(56, g.ch - 112), tall ? 32 : 28, { min: 18, color: cardText(c, tone), animate: 'body' })
    if (m.detail && tall) text(c, 'caption', [para(m.detail)], x + pad, cy + 290, g.cw - 2 * pad, g.ch - 310, 24, { color: cardMuted(c, tone), min: 16, animate: false })
  })
}

export function steps(c: Ctx, s: C<'process'> | C<'timeline'>) {
  const y = header(c, s.title)
  const n = s.steps.length
  const g = grid(c, n, s.layout === 'timeline' ? y + 70 : y, 300, 32, 520)
  const line = s.layout === 'timeline' && g.rows === 1
  const k = pal(c)
  // one row of cards hugs its text (the tallest step decides); a grid of several rows keeps its even cells
  const padFor = c.style.card === 'accent-left' ? 40 : 28
  const small0 = g.ch < 360
  const hugging = !line && g.rows === 1
  const stepIw = g.cw - padFor * 2
  const headBox = (small: boolean) => Math.max(small || line ? 56 : 100, ...s.steps.map((st) => textNeed(c, 'heading', [para(st.label)], stepIw, small ? 28 : 34) + 12))
  const bodyNeed = Math.max(...s.steps.map((st) => textNeed(c, 'body', [para(st.detail)], stepIw, 26)))
  const stepHug = hugging ? hug(g.ch, 24 + (small0 ? 60 : 90) + headBox(small0) + 14 + bodyNeed + 24) : { h: g.ch, lift: 0 }
  const cardH = stepHug.h
  const lift = stepHug.lift
  if (line) rect(c, k.primary, c.M, y + 28, inner(c), 8, { radius: 4, animate: 'accent' })
  s.steps.forEach((st, i) => {
    const { x, y: gy } = g.pos(i)
    const cy = gy + lift
    const tone = tones[i % 2]!
    if (line) shape(c, k.accent, x, y + 8, 48, 48, { shape: 'ellipse', animate: 'card' })
    else card(c, x, cy, g.cw, cardH, { tone })
    const asCard = !line
    const pad = asCard ? padFor : 0
    const ix = x + pad
    const iw = g.cw - pad * 2
    const ty = asCard ? cy + 24 : cy
    const small = cardH < 360 && asCard
    const tc = asCard ? cardText(c, tone) : pal(c).textPrimary
    text(c, 'metric', [para(String(i + 1).padStart(2, '0'))], ix, ty, iw, small ? 56 : 80, small ? 40 : 56, { color: 'primary', min: 28, animate: false })
    const hb = hugging || line ? headBox(small) : small ? 60 : 100
    const numH = line ? 64 : small ? 60 : 90
    text(c, 'heading', [para(st.label)], ix, ty + numH, iw, hb, small ? 28 : 34, { min: 18, color: tc })
    const by = ty + numH + hb + (hugging || line ? 14 : small ? 4 : 10)
    text(c, 'body', [para(st.detail)], ix, by, iw, Math.max(60, (asCard ? cy + cardH - 16 : c.bottom) - by), 26, { color: asCard ? cardMuted(c, tone) : 'textSecondary', min: 16, animate: false })
  })
}

export function comparison(c: Ctx, s: C<'comparison'>) {
  const y = header(c, s.title)
  const gap = 48
  const cw = (inner(c) - gap) / 2
  const tw = cw - 2 * 36 - 8
  const headH = Math.max(80, ...[s.left, s.right].map((col) => textNeed(c, 'heading', [para(col.heading)], tw, 40) + 24))
  const bodyNeed = Math.max(...[s.left, s.right].map((col) => textNeed(c, 'body', col.bullets.map((b) => para(b, 'bullet')), tw, 30)))
  const { h: ch, lift } = hug(c.bottom - y, 36 + headH + 14 + bodyNeed + 44)
  const top = y + lift
  ;([['primary', s.left], ['accent', s.right]] as const).forEach(([tone, col], i) => {
    const x = c.M + i * (cw + gap)
    const pad = card(c, x, top, cw, ch, { tone })
    if (c.style.card === 'flat' || c.style.card === 'outline' || c.style.card === 'tint') rect(c, pal(c)[tone], x, top, cw, 12, { radius: 6 })
    text(c, 'heading', [para(col.heading)], x + pad + 4, top + 36, cw - 2 * pad - 8, headH, 40, { color: 'primary', min: 24, animate: false })
    text(c, 'body', col.bullets.map((b) => para(b, 'bullet')), x + pad + 4, top + 36 + headH + 14, cw - 2 * pad - 8, ch - (36 + headH + 14) - 30, 30, { min: 18, color: cardText(c, tone), byParagraph: true })
  })
}

export function chart(c: Ctx, s: C<'chart'>) {
  const y = header(c, s.title)
  const cw = inner(c) * 0.62
  const anim = animationFor(c, 'image')
  c.els.push({ type: 'chart', id: c.id(), x: c.M, y, width: cw, height: c.bottom - y, rotation: 0, locked: false, zIndex: c.z++, opacity: 1, chartType: s.chartType, labels: s.labels, series: s.series, ...(s.unit ? { unit: s.unit } : {}), ...(anim ? { animation: anim } : {}) })
  const pad = card(c, c.M + cw + 40, y, inner(c) - cw - 40, c.bottom - y)
  text(c, 'body', [para(s.takeaway)], c.M + cw + 40 + pad, y + 36, inner(c) - cw - 40 - 2 * pad, c.bottom - y - 72, 32, { min: 20, color: cardText(c) })
}

export function table(c: Ctx, s: C<'table'>) {
  const y = header(c, s.title)
  const anim = animationFor(c, 'card')
  c.els.push({ type: 'table', id: c.id(), x: c.M, y, width: inner(c), height: c.bottom - y, rotation: 0, locked: false, zIndex: c.z++, opacity: 1, header: s.header, rows: s.rows, ...(anim ? { animation: anim } : {}) })
}

// ── new layouts ──────────────────────────────────────────────────────────────

export function agenda(c: Ctx, s: C<'agenda'>) {
  const y0 = header(c, s.title)
  const n = s.items.length
  const cols = n > 5 ? 2 : 1
  const per = Math.ceil(n / cols)
  const gap = 28
  const colW = (inner(c) - gap * (cols - 1)) / cols
  const rowH = Math.min(176, (c.bottom - y0 - gap * (per - 1)) / per)
  // a short list sits in the middle of the room under the title instead of hanging from it
  const y = y0 + Math.round(Math.max(0, c.bottom - y0 - (per * rowH + gap * (per - 1))) * 0.35)
  const k = pal(c)
  s.items.forEach((it, i) => {
    const col = Math.floor(i / per)
    const row = i % per
    const x = c.M + col * (colW + gap)
    const ry = y + row * (rowH + gap)
    const d = Math.min(96, rowH - 8)
    shape(c, i % 2 ? k.accent : k.primary, x, ry + (rowH - d) / 2, d, d, { shape: 'ellipse', animate: 'card' })
    const numColor = onBg(c, i % 2 ? k.accent : k.primary)
    text(c, 'metric', [para(String(i + 1))], x, ry + (rowH - d) / 2, d, d, Math.round(d * 0.5), { color: numColor, align: 'center', valign: 'middle', weight: 800, animate: false, min: 18 })
    text(c, 'heading', [para(it.label)], x + d + 32, ry, colW - d - 32, it.detail ? rowH * 0.55 : rowH, 44, { valign: it.detail ? 'bottom' : 'middle', min: 22 })
    if (it.detail) text(c, 'caption', [para(it.detail)], x + d + 32, ry + rowH * 0.57, colW - d - 32, rowH * 0.43, 28, { color: 'textSecondary', min: 14, animate: false })
  })
}

export function team(c: Ctx, s: C<'team'>) {
  const y = header(c, s.title)
  const n = s.people.length
  const g = grid(c, n, y, 330, 36, 560)
  const k = pal(c)
  // a single row of people: the cards are as tall as their content needs (avatar, name, role, bio), not as tall as the slide
  const tIw = g.cw - 2 * 28
  const dAvatar = Math.min(150, g.ch * 0.3, g.cw - 56)
  const bioNeed = Math.max(0, ...s.people.map((p) => (p.bio ? textNeed(c, 'body', [para(p.bio)], tIw, 22) : 0)))
  const nameNeed = g.rows === 1 ? Math.max(56, ...s.people.map((p) => textNeed(c, 'heading', [para(p.name)], tIw, 34) + 8)) : 56
  const teamHug = g.rows === 1 ? hug(g.ch, 28 + dAvatar + 18 + nameNeed + 48 + bioNeed + 28) : { h: g.ch, lift: 0 }
  s.people.forEach((p, i) => {
    const { x, y: gy } = g.pos(i)
    const cy = gy + teamHug.lift
    const g2 = { ...g, ch: teamHug.h }
    const tone = tones[i % 3]!
    const pad = card(c, x, cy, g.cw, g2.ch, { tone: tone === 'secondary' ? 'primary' : tone })
    const d = Math.min(150, g2.ch * 0.3, g.cw - 2 * pad)
    const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    let bg = mix(k[tone], c.bodyBg, 0.2)
    // A mid-tone avatar can't carry readable initials: darken until white text passes.
    for (let n = 0; n < 8 && contrastRatio('#FFFFFF', bg) < 4.5 && contrastRatio('#0B0F1A', bg) < 4.5; n++) bg = mix(bg, '#000000', 0.12)
    shape(c, bg, x + pad, cy + pad, d, d, { shape: 'ellipse', animate: 'image' })
    text(c, 'metric', [para(initials)], x + pad, cy + pad, d, d, Math.round(d * 0.38), { color: onBg(c, bg), align: 'center', valign: 'middle', animate: false, min: 18 })
    const tx = x + pad
    const tw = g.cw - 2 * pad
    const ty = cy + pad + d + 18
    text(c, 'heading', [para(p.name)], tx, ty, tw, nameNeed, 34, { min: 18, color: cardText(c, tone === 'secondary' ? 'primary' : tone), animate: 'body' })
    text(c, 'caption', [para(p.role)], tx, ty + nameNeed, tw, 44, 24, { color: readableOn(cardBgHex(c, tone === 'secondary' ? 'primary' : tone), [k.accent, k.primary, k.textPrimary, '#FFFFFF', '#111111'], 4.5), min: 14, animate: false, weight: 600 })
    // bio only when it genuinely fits inside the card (tight 1:1 grids drop it rather than spill onto the card's shadow)
    const bioH = cy + g2.ch - pad - (ty + nameNeed + 48)
    if (p.bio && bioH >= 40) text(c, 'body', [para(p.bio)], tx, ty + nameNeed + 48, tw, bioH, 22, { color: cardMuted(c, tone === 'secondary' ? 'primary' : tone), min: 14, animate: false })
  })
}

export function matrix(c: Ctx, s: C<'matrix'>) {
  const y = header(c, s.title)
  const gap = 28
  const axisPad = s.yLabel ? 64 : 0
  const bottomPad = s.xLabel ? 56 : 0
  const x0 = c.M + axisPad
  const w = inner(c) - axisPad
  const h = c.bottom - y - bottomPad
  const cw = (w - gap) / 2
  const ch = (h - gap) / 2
  s.quadrants.forEach((q, i) => {
    const x = x0 + (i % 2) * (cw + gap)
    const cy = y + Math.floor(i / 2) * (ch + gap)
    const tone = tones[i % 2]!
    const pad = card(c, x, cy, cw, ch, { tone })
    text(c, 'heading', [para(q.heading)], x + pad, cy + 18, cw - 2 * pad, 52, 34, { color: readableOn(cardBgHex(c, tone), [pal(c).primary, pal(c).textPrimary, '#FFFFFF', '#111111'], 4.5), min: 18, animate: false })
    text(c, 'body', q.bullets.map((b) => para(b, 'bullet')), x + pad, cy + 72, cw - 2 * pad, ch - 88, 26, { min: 16, color: cardText(c, tone), byParagraph: true })
  })
  if (s.xLabel) text(c, 'caption', [para(s.xLabel)], x0, c.bottom - 40, w, 40, 24, { color: 'textSecondary', align: 'center', min: 14, animate: false, weight: 600, uppercase: true, tracking: 3 })
  if (s.yLabel) text(c, 'caption', [para(s.yLabel)], c.M - (h / 2 - 20), y + h / 2 - 20, h, 40, 24, { color: 'textSecondary', align: 'center', min: 14, animate: false, weight: 600, uppercase: true, tracking: 3, rotation: -90 })
}

export function bigNumber(c: Ctx, s: C<'big-number'>) {
  const { H, M } = c
  const k = pal(c)
  const hasTitle = !!s.title
  const y = hasTitle ? header(c, s.title!, { size: 44 }) : M
  const leftW = s.context.length ? inner(c) * 0.52 : inner(c)
  const size = s.value.length <= 4 ? 260 : s.value.length <= 7 ? 200 : 150
  text(c, 'metric', [para(s.value)], M, y, leftW, Math.min(340, (c.bottom - y) * 0.65), size, { color: 'primary', valign: 'bottom', min: 60, weight: 900 })
  rect(c, k.accent, M, y + Math.min(340, (c.bottom - y) * 0.65) + 18, 110, 10, { radius: 5, animate: 'accent' })
  text(c, 'heading', [para(s.label)], M, y + Math.min(340, (c.bottom - y) * 0.65) + 48, leftW, 140, 40, { min: 22, animate: 'body' })
  if (s.context.length) {
    const x = M + leftW + 56
    const w = inner(c) - leftW - 56
    const ch = Math.min(c.bottom - y, H * 0.7)
    const pad = card(c, x, y + ((c.bottom - y) - ch) / 2, w, ch, { tone: 'accent' })
    text(c, 'body', s.context.map((b) => para(b, 'bullet')), x + pad, y + ((c.bottom - y) - ch) / 2 + 32, w - 2 * pad, ch - 64, 30, { min: 18, color: cardText(c, 'accent'), byParagraph: true, valign: 'middle' })
  }
}

export function roadmap(c: Ctx, s: C<'roadmap'>) {
  const y = header(c, s.title)
  const n = s.phases.length
  const gap = 14
  const k = pal(c)
  const cw = (inner(c) - gap * (n - 1)) / n
  const fillFor = (i: number) => stepFill(c, i, n)

  if (cw < 230) {
    // narrow canvas (e.g. 1:1 with many phases): stack the phases as rows — a chevron label on the left, the card on the right
    const rowGap = 14
    const rh = (c.bottom - y - rowGap * (n - 1)) / n
    const lw = Math.min(210, inner(c) * 0.26)
    s.phases.forEach((p, i) => {
      const ry = y + i * (rh + rowGap)
      const fill = fillFor(i)
      shape(c, fill, c.M, ry, lw + 22, rh, { shape: 'chevron', animate: 'card' })
      text(c, 'metric', [para(p.label)], c.M + 22, ry, lw - 34, rh, 24, { color: onBg(c, fill), valign: 'middle', align: 'center', min: 12, animate: false, weight: 800 })
      const x = c.M + lw + 36
      const tone = i % 2 && !clashes(c) ? 'accent' : 'primary'
      const pad = card(c, x, ry, inner(c) - lw - 36, rh, { tone })
      const w = inner(c) - lw - 36 - 2 * pad
      text(c, 'heading', [para(p.heading)], x + pad, ry + 8, w, rh * 0.36, 26, { min: 13, color: cardText(c, tone), animate: false, valign: 'middle' })
      text(c, 'body', p.bullets.map((b) => para(b, 'bullet')), x + pad, ry + rh * 0.38, w, rh * 0.58, 20, { min: 11, color: cardMuted(c, tone), byParagraph: true })
    })
    return
  }

  const chevH = 92
  const tw = cw - 2 * 32
  const cy0 = y + chevH + 28
  const headH = Math.min(Math.round((c.bottom - cy0) * 0.35), Math.max(80, ...s.phases.map((p) => textNeed(c, 'heading', [para(p.heading)], tw, 32) + 16)))
  const bodyNeed = Math.max(...s.phases.map((p) => textNeed(c, 'body', p.bullets.map((b) => para(b, 'bullet')), tw, 26)))
  const { h: ch, lift } = hug(c.bottom - cy0, 24 + headH + 12 + bodyNeed + 32)
  const y0 = y + lift
  s.phases.forEach((p, i) => {
    const x = c.M + i * (cw + gap)
    const fill = fillFor(i)
    shape(c, fill, x, y0, cw + (i < n - 1 ? 26 : 0), chevH, { shape: 'chevron', animate: 'card' })
    text(c, 'metric', [para(p.label)], x + 40, y0, cw - 66, chevH, 30, { color: onBg(c, fill), valign: 'middle', align: 'center', min: 14, animate: false, weight: 800 })
    const cy = y0 + chevH + 28
    const tone = i % 2 && !clashes(c) ? 'accent' : 'primary'
    const pad = card(c, x, cy, cw, ch, { tone })
    text(c, 'heading', [para(p.heading)], x + pad, cy + 24, cw - 2 * pad, headH, 32, { min: 16, color: cardText(c, tone), animate: false })
    text(c, 'body', p.bullets.map((b) => para(b, 'bullet')), x + pad, cy + 24 + headH + 12, cw - 2 * pad, ch - (24 + headH + 12) - 24, 26, { min: 14, color: cardMuted(c, tone), byParagraph: true })
  })
}

export function architecture(c: Ctx, s: C<'architecture'>) {
  const y = header(c, s.title)
  const k = pal(c)
  const n = s.layers.length
  const noteH = s.note ? 80 : 0
  const gap = 20
  const lh = Math.min(190, (c.bottom - y - noteH - gap * (n - 1)) / n)
  const labelW = Math.min(360, inner(c) * 0.24)
  s.layers.forEach((layer, i) => {
    const ly = y + i * (lh + gap)
    const fill = stepFill(c, i, n)
    rect(c, cardBgHex(c) , c.M, ly, inner(c), lh, { radius: c.theme.radius, animate: 'card', ...(c.style.card === 'outline' ? { stroke: mix(k.textSecondary, c.bodyBg, 0.55), strokeWidth: 3 } : {}) })
    rect(c, fill, c.M, ly, labelW, lh, { radius: c.theme.radius })
    text(c, 'heading', [para(layer.name)], c.M + 24, ly, labelW - 48, lh, 32, { color: onBg(c, fill), valign: 'middle', min: 16, animate: false })
    const chips = layer.items.length
    const cg = 16
    const areaX = c.M + labelW + 28
    const areaW = inner(c) - labelW - 56
    const cwid = (areaW - cg * (chips - 1)) / chips
    layer.items.forEach((it, j) => {
      const cx = areaX + j * (cwid + cg)
      const ch = Math.min(lh - 40, 110)
      const chipBg = mix(fill, cardBgHex(c), 0.82)
      rect(c, chipBg, cx, ly + (lh - ch) / 2, cwid, ch, { radius: Math.max(8, c.theme.radius * 0.6), animate: 'card' })
      text(c, 'body', [para(it)], cx + 12, ly + (lh - ch) / 2, cwid - 24, ch, 24, { color: readableOn(chipBg, [k.textPrimary, '#FFFFFF', '#111111']), align: 'center', valign: 'middle', min: 13, animate: false, weight: 600 })
    })
  })
  if (s.note) text(c, 'caption', [para(s.note)], c.M, c.bottom - noteH + 16, inner(c), noteH - 16, 26, { color: 'textSecondary', min: 16, animate: 'body' })
}

export function caseStudy(c: Ctx, s: C<'case-study'>) {
  const y = header(c, s.title)
  const k = pal(c)
  const gap = 32
  const colW = (inner(c) - gap * 2) / 3
  const h = c.bottom - y
  const pad1 = card(c, c.M, y, colW, h, { tone: 'primary' })
  text(c, 'heading', [para(s.client ? `Challenge · ${s.client}` : 'Challenge')], c.M + pad1, y + 28, colW - 2 * pad1, 70, 30, { color: readableOn(cardBgHex(c, 'primary'), [k.primary, k.textPrimary, '#FFFFFF', '#111111'], 4.5), min: 18, animate: false, uppercase: true, tracking: 1 })
  text(c, 'body', [para(s.challenge)], c.M + pad1, y + 110, colW - 2 * pad1, h - 140, 28, { min: 16, color: cardText(c) })
  const x2 = c.M + colW + gap
  const pad2 = card(c, x2, y, colW, h, { tone: 'accent' })
  text(c, 'heading', [para('Approach')], x2 + pad2, y + 28, colW - 2 * pad2, 70, 30, { color: readableOn(cardBgHex(c, 'accent'), [k.primary, k.textPrimary, '#FFFFFF', '#111111'], 4.5), min: 18, animate: false, uppercase: true, tracking: 1 })
  text(c, 'body', s.approach.map((b) => para(b, 'bullet')), x2 + pad2, y + 110, colW - 2 * pad2, h - 140, 26, { min: 15, color: cardText(c, 'accent'), byParagraph: true })
  const x3 = c.M + 2 * (colW + gap)
  const heroGradient = undefined as { from: string; to: string; angle: number } | undefined
  const heroFill = k.primary
  rect(c, heroFill, x3, y, colW, h, { radius: c.theme.radius, animate: 'card', ...(heroGradient ? { gradient: heroGradient } : {}) })
  const fg = onBg(c, stopsOf({ value: heroFill, gradient: heroGradient }))
  text(c, 'metric', [para(s.headline.value)], x3 + 32, y + 28, colW - 64, 150, 96, { color: fg, valign: 'middle', min: 40, weight: 900 })
  text(c, 'caption', [para(s.headline.label)], x3 + 32, y + 180, colW - 64, 70, 26, { color: fg, min: 14, animate: false, weight: 600 })
  rect(c, k.secondary, x3 + 32, y + 262, 80, 8, { radius: 4 })
  text(c, 'body', s.results.map((b) => para(b, 'bullet')), x3 + 32, y + 296, colW - 64, h - 326, 24, { color: fg, min: 14, byParagraph: true })
}

export { decor, deco }


// ── editorial looks (heading-left split lists, chevron process rows, wash stat cards, hub diagrams, corner stat) ────────────
// Opt-in per design (`style.diagram === 'editorial'`). They only apply on wide canvases and fall back to the classic look otherwise.
const wideCtx = (c: Ctx) => c.W >= c.H * 1.6
export const editorial = (c: Ctx) => c.style.diagram === 'editorial' && wideCtx(c)
const hairline = (c: Ctx) => mix(pal(c).textSecondary, c.bodyBg, 0.78)
/** An accent that is actually visible as text/ornament on the slide body. */
const visible = (c: Ctx) => [pal(c).accent, pal(c).primary, pal(c).secondary].find((x) => contrastRatio(x, c.bodyBg) >= 3) ?? pal(c).textPrimary

/** Heading on the left, a vertical divider, numbered items on the right. */
export function agendaSplit(c: Ctx, s: C<'agenda'>) {
  const gap = 70
  const leftW = Math.round(inner(c) * 0.34)
  const x2 = c.M + leftW + gap
  const w2 = c.W - c.M - x2
  header(c, s.title, { width: leftW })
  rect(c, hairline(c), x2 - gap / 2, c.M, 2, c.bottom - c.M)
  const n = Math.min(s.items.length, 6)
  const rowH = (c.bottom - c.M) / n
  s.items.slice(0, n).forEach((it, i) => {
    const y = c.M + i * rowH
    text(c, 'metric', [para(String(i + 1).padStart(2, '0'))], x2, y, 110, rowH, 52, { color: visible(c), valign: 'middle', min: 24, animate: false })
    text(c, 'heading', [para(it.label)], x2 + 130, y + rowH * 0.1, w2 - 130, it.detail ? rowH * 0.45 : rowH * 0.8, 36, { valign: it.detail ? 'bottom' : 'middle', min: 20 })
    if (it.detail) text(c, 'caption', [para(it.detail)], x2 + 130, y + rowH * 0.56, w2 - 130, rowH * 0.36, 24, { color: 'textSecondary', min: 14, animate: false })
    if (i < n - 1) rect(c, hairline(c), x2, y + rowH, w2, 2)
  })
}

/** A row of chevron groups (colour ramp primary → accent) with a hairline stem and centred label + detail. */
export function stepsChevrons(c: Ctx, s: C<'process'> | C<'timeline'>) {
  const y = header(c, s.title)
  const k = pal(c)
  const n = s.steps.length
  const gap = 36
  const cw = (inner(c) - gap * (n - 1)) / n
  const top = y + (c.bottom - y) * 0.12
  s.steps.forEach((st, i) => {
    const x = c.M + i * (cw + gap)
    const col = stepFill(c, i, n)
    for (let q = 0; q < 3; q++) shape(c, mix(col, c.bodyBg, [0, 0.12, 0.3][q]!), x + cw / 2 - 66 + q * 44, top, 64, 56, { shape: 'chevron', animate: i === 0 && q === 0 ? 'card' : false })
    rect(c, hairline(c), x + cw / 2 - 1, top + 76, 2, 54)
    text(c, 'heading', [para(st.label)], x, top + 142, cw, 90, 40, { align: 'center', valign: 'top', min: 20 })
    text(c, 'body', [para(st.detail)], x, top + 240, cw, c.bottom - (top + 240), 32, { align: 'center', color: 'textSecondary', min: 16, animate: false })
  })
}

/** Stat cards washed with a soft gradient: big figure, label, detail. */
export function metricsWash(c: Ctx, s: C<'metrics'>) {
  const y = header(c, s.title)
  const k = pal(c)
  const n = s.metrics.length
  const gap = 32
  const cw = (inner(c) - gap * (n - 1)) / n
  const ch = Math.min(c.bottom - y, 460)
  const top = y + (c.bottom - y - ch) / 2
  s.metrics.forEach((m, i) => {
    const x = c.M + i * (cw + gap)
    const from = mix(i % 2 ? k.accent : k.primary, c.bodyBg, 0.92)
    const to = mix(i % 2 ? k.primary : k.accent, c.bodyBg, 0.97)
    shape(c, from, x, top, cw, ch, { radius: Math.min(c.theme.radius, 18), gradient: { from, to, angle: 135 }, animate: 'card' })
    rect(c, i % 2 ? k.accent : k.primary, x, top, 8, ch, { radius: 4 })
    text(c, 'metric', [para(m.value)], x + 40, top + 24, cw - 70, ch * 0.34, 110, { color: 'primary', valign: 'middle', min: 34 })
    text(c, 'heading', [para(m.label)], x + 40, top + ch * 0.42, cw - 70, ch * 0.2, 34, { min: 18 })
    if (m.detail) text(c, 'caption', [para(m.detail)], x + 40, top + ch * 0.64, cw - 70, ch * 0.3, 24, { color: 'textSecondary', min: 14, animate: false })
  })
}

/** Four ideas orbiting a hub: heading left, hub-and-spoke diagram right. */
export function matrixHub(c: Ctx, s: C<'matrix'>) {
  const k = pal(c)
  const leftW = Math.round(inner(c) * 0.28)
  header(c, s.title, { width: leftW })
  const ax = c.M + leftW + 40
  const aw = c.W - c.M - ax
  const cx = ax + aw / 2
  const cy = (c.M + c.bottom) / 2
  const R = Math.min(aw * 0.2, (c.bottom - c.M) * 0.3) // satellites N/S sit R above/below the hub, E/W sit dx beside it
  const dx = Math.min(R * 1.45, aw * 0.22)
  const hub = R * 0.85
  const sat = 92
  shape(c, k.primary, cx - hub / 2, cy - hub / 2, hub, hub, { shape: 'ellipse', animate: 'card' })
  const label = s.xLabel ?? s.yLabel
  if (label) text(c, 'heading', [para(label)], cx - hub / 2 + 14, cy - hub / 2, hub - 28, hub, 30, { color: onBg(c, k.primary), align: 'center', valign: 'middle', min: 14, animate: false })
  const spots: [number, number, 'n' | 'e' | 's' | 'w'][] = [[0, -R, 'n'], [dx, 0, 'e'], [0, R, 's'], [-dx, 0, 'w']]
  s.quadrants.forEach((q, i) => {
    const [sx, sy, side] = spots[i]!
    const px = cx + sx, py = cy + sy
    rect(c, hairline(c), Math.min(px, cx), Math.min(py, cy) + (sy ? 0 : -1), sx ? Math.abs(sx) : 2, sy ? Math.abs(sy) : 2) // spoke
    const tone = i % 2 ? k.accent : k.primary
    shape(c, tone, px - sat / 2, py - sat / 2, sat, sat, { shape: 'ellipse', animate: false })
    text(c, 'metric', [para(String(i + 1))], px - sat / 2, py - sat / 2, sat, sat, 38, { color: onBg(c, tone), align: 'center', valign: 'middle', min: 16, animate: false })
    // labels sit beside their satellite (N and S to the right of it, E to the right, W to the left)
    const left = side === 'w'
    const tw = left ? px - sat / 2 - 28 - ax : c.W - c.M - (px + sat / 2 + 28)
    const tx = left ? ax : px + sat / 2 + 28
    const al = left ? 'right' : 'left'
    text(c, 'heading', [para(q.heading)], tx, py - 84, tw, 58, 34, { align: al, valign: 'bottom', min: 16 })
    text(c, 'caption', q.bullets.map((b) => para(b)), tx, py - 20, tw, 180, 24, { align: al, color: 'textSecondary', min: 13, animate: false })
  })
}

/** Heading top-left, a huge figure bottom-right, label and context bottom-left. */
export function bigNumberCorner(c: Ctx, s: C<'big-number'>) {
  const k = pal(c)
  const y = s.title ? header(c, s.title, { size: 52 }) : c.M
  const leftW = inner(c) * 0.46
  const size = s.value.length <= 4 ? 300 : s.value.length <= 7 ? 240 : 180
  text(c, 'metric', [para(s.value)], c.M + leftW, c.bottom - 440, inner(c) - leftW, 440, size, { color: 'primary', align: 'right', valign: 'bottom', min: 70, weight: 900 })
  if (s.context.length) text(c, 'body', s.context.map((b) => para(b)), c.M, y + 20, leftW, Math.max(80, c.bottom - 300 - y - 20), 30, { color: 'textSecondary', min: 16, animate: false })
  rect(c, k.accent, c.M, c.bottom - 250, 110, 8, { radius: 4, animate: 'accent' })
  text(c, 'heading', [para(s.label)], c.M, c.bottom - 220, leftW, 220, 42, { min: 22, valign: 'top', animate: 'body' })
}
